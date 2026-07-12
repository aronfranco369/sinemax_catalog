import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseServer } from '@/lib/supabaseServer'
import { supabaseProd } from '@/lib/supabaseProd'
import {
  videoObjectKey,
  b2DownloadUrl,
  effectiveDj,
  isSeriesType,
  type TransferTitle,
  type TransferAttachment,
} from '@/lib/transferScript'
import { validateForPublish } from '@/lib/validateTitle'

type AttRow = {
  id: number
  season: number | null
  episode_number: number | null
  label: string | null
  quality: string | null
  dj: string | null
  b2_key: string | null
  file_id: string | null
  files: { name: string; path: string; size: number } | null
}

function toList(csv: string | null): string[] {
  return (csv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Publish a ready catalog title into the production app DB.
 *
 * One media row is created per DJ (a DJ's version of the work); every file of
 * that DJ — the parts of a movie or the episodes of a series — becomes a
 * `files` row under it, so they all share one media_id (the "parent"). Movie
 * parts published this way come back together when the app looks up the media.
 *
 * Idempotent: re-publishing first deletes the prior media/files for this
 * source title, then re-inserts, so edits flow through without duplicates.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const titleId = Number(id)

  const prod = supabaseProd()
  if (!prod) {
    return NextResponse.json(
      { error: 'Production DB not configured — set SUPABASE_PROD_SERVICE_ROLE_KEY.' },
      { status: 503 }
    )
  }

  const dev = supabaseServer()

  const { data: title, error: tErr } = await dev.from('titles').select('*').eq('id', titleId).single()
  if (tErr || !title) return NextResponse.json({ error: 'title not found' }, { status: 404 })
  if (title.catalog_status !== 'ready' && title.catalog_status !== 'published') {
    return NextResponse.json({ error: 'title is not marked ready' }, { status: 400 })
  }

  const { data: atts, error: aErr } = await dev
    .from('attachments')
    .select('id, season, episode_number, label, quality, dj, b2_key, file_id, files(name, path, size)')
    .eq('title_id', titleId)
    .order('season', { ascending: true, nullsFirst: true })
    .order('episode_number', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true })
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })

  const attachments = ((atts || []) as unknown as AttRow[]).filter((a) => a.file_id && a.files)
  if (attachments.length === 0) {
    return NextResponse.json({ error: 'title has no attached files to publish' }, { status: 400 })
  }

  const tTitle: TransferTitle = {
    id: title.id,
    raw_title: title.raw_title,
    matched_title: title.matched_title,
    type: title.type,
    year: title.year,
    dj: title.dj,
  }
  const series = isSeriesType(tTitle)
  const displayTitle = (title.matched_title || title.raw_title || '').trim()
  const yearNum = Number.parseInt(String(title.year || ''), 10)

  // Gate: all publishable details must be present (same rules the editor shows).
  const problems = validateForPublish(
    {
      type: title.type,
      country: title.country,
      synopsis_sw: title.synopsis_sw,
      dj: title.dj,
      matched_title: title.matched_title,
      raw_title: title.raw_title,
    },
    attachments.map((a) => ({ episode_number: a.episode_number, dj: a.dj }))
  )
  if (problems.length) {
    return NextResponse.json({ error: `Missing details: ${problems.join(' ')}` }, { status: 400 })
  }

  // Split the attachments into media rows, preserving order:
  //   - Series: one media carrying the title's DJ; its files are the episodes.
  //   - Movie:  one media per variant number; its files are that variant's parts
  //             (a shared number that repeats = the same movie split into parts).
  const groups: { dj: string; atts: AttRow[] }[] = []
  if (series) {
    groups.push({ dj: (title.dj || '').trim(), atts: attachments })
  } else {
    const byNumber = new Map<number, AttRow[]>()
    const order: number[] = []
    for (const a of attachments) {
      const n = a.episode_number ?? 0
      if (!byNumber.has(n)) {
        byNumber.set(n, [])
        order.push(n)
      }
      byNumber.get(n)!.push(a)
    }
    for (const n of order) {
      const atts = byNumber.get(n)!
      const lead = atts[0]
      const ta: TransferAttachment = {
        id: lead.id,
        drive_name: lead.files?.name ?? null,
        drive_path: lead.files?.path ?? null,
        season: lead.season,
        episode_number: lead.episode_number,
        quality: lead.quality,
        dj: lead.dj,
      }
      groups.push({ dj: effectiveDj(tTitle, ta), atts })
    }
  }

  // Persist any missing B2 keys back onto the attachments (immutable once set).
  const keyPersist: PromiseLike<unknown>[] = []
  const keyFor = (a: AttRow): string => {
    if (a.b2_key) return a.b2_key
    const key = videoObjectKey(tTitle, {
      id: a.id,
      drive_name: a.files?.name ?? null,
      drive_path: a.files?.path ?? null,
      season: a.season,
      episode_number: a.episode_number,
      quality: a.quality,
      dj: a.dj,
    })
    keyPersist.push(dev.from('attachments').update({ b2_key: key }).eq('id', a.id))
    return key
  }

  // Remove any prior publication of this title so re-publishing is clean.
  const { data: oldMedia } = await prod.from('media').select('id').eq('source_title_id', titleId)
  const oldIds = (oldMedia || []).map((m) => m.id as string)
  if (oldIds.length) {
    await prod.from('files').delete().in('media_id', oldIds)
    await prod.from('media').delete().in('id', oldIds)
  }

  const publishedMediaIds: string[] = []

  for (const { dj, atts: groupAtts } of groups) {
    const mediaId = randomUUID()
    const mediaRow = {
      id: mediaId,
      title: displayTitle,
      poster_url: title.poster_url || null,
      description: title.synopsis_sw || title.synopsis || null,
      country: title.country || null,
      year: Number.isNaN(yearNum) ? null : yearNum,
      type: series ? 'series' : 'movie',
      genres: toList(title.genres),
      tags: toList(title.tags),
      dj: dj || null,
      source_title_id: titleId,
    }

    const { error: mErr } = await prod.from('media').insert(mediaRow)
    if (mErr) return NextResponse.json({ error: `media insert failed: ${mErr.message}` }, { status: 500 })

    const multiPart = groupAtts.length > 1
    const fileRows = groupAtts.map((a, idx) => {
      // Series files keep their real episode number; a movie variant's files are
      // its parts, numbered sequentially within the media (the variant number
      // itself is not an episode index).
      const ep = series ? a.episode_number ?? idx + 1 : idx + 1
      let label = (a.label || '').trim()
      if (!label) {
        if (series) label = `Episode ${ep}`
        else if (multiPart) label = `${displayTitle} - Part ${idx + 1}`
        else label = displayTitle
      }
      return {
        id: randomUUID(),
        media_id: mediaId,
        season: series ? a.season ?? 1 : null,
        episode_number: ep,
        label,
        download_url: b2DownloadUrl(keyFor(a)),
        file_size: a.files?.size ?? null,
      }
    })

    const { error: fErr } = await prod.from('files').insert(fileRows)
    if (fErr) return NextResponse.json({ error: `files insert failed: ${fErr.message}` }, { status: 500 })

    publishedMediaIds.push(mediaId)
  }

  if (keyPersist.length) await Promise.all(keyPersist)

  const nowIso = new Date().toISOString()
  const { error: uErr } = await dev
    .from('titles')
    .update({
      catalog_status: 'published',
      published_at: nowIso,
      published_media_ids: publishedMediaIds,
      updated_at: nowIso,
    })
    .eq('id', titleId)
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

  return NextResponse.json({
    published: true,
    media_count: publishedMediaIds.length,
    file_count: attachments.length,
    media_ids: publishedMediaIds,
  })
}
