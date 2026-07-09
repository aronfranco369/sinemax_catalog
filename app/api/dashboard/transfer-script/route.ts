import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { buildTransferScript, videoObjectKey, type TransferItem } from '@/lib/transferScript'

type AttJoinRow = {
  id: number
  title_id: number
  season: number | null
  episode_number: number | null
  quality: string | null
  dj: string | null
  b2_key: string | null
  files: { name: string; path: string } | null
}

export async function POST(request: Request) {
  const { titleIds } = (await request.json()) as { titleIds: number[] }
  if (!Array.isArray(titleIds) || titleIds.length === 0) {
    return NextResponse.json({ error: 'titleIds required' }, { status: 400 })
  }

  const supabase = supabaseServer()

  const { data: titles, error: tErr } = await supabase
    .from('titles')
    .select('id, raw_title, matched_title, type, year, dj')
    .in('id', titleIds)
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

  const { data: atts, error: aErr } = await supabase
    .from('attachments')
    .select('id, title_id, season, episode_number, quality, dj, b2_key, files(name, path)')
    .in('title_id', titleIds)
    .order('season', { ascending: true, nullsFirst: true })
    .order('episode_number', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true })
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })

  const titleById = new Map((titles || []).map((t) => [t.id, t]))
  const byTitle = new Map<number, TransferItem['attachments']>()
  for (const a of (atts || []) as unknown as AttJoinRow[]) {
    const list = byTitle.get(a.title_id) || []
    list.push({
      id: a.id,
      drive_name: a.files?.name ?? null,
      drive_path: a.files?.path ?? null,
      season: a.season,
      episode_number: a.episode_number,
      quality: a.quality,
      dj: a.dj,
    })
    byTitle.set(a.title_id, list)
  }

  // Persist the immutable B2 key on any attachment that doesn't have one yet,
  // computed identically to the rclone destination below. Written once so the
  // published download URL and the uploaded object always agree, even if the
  // title text or dj is edited afterwards.
  const keyUpdates: PromiseLike<unknown>[] = []
  for (const a of (atts || []) as unknown as AttJoinRow[]) {
    if (a.b2_key) continue
    const t = titleById.get(a.title_id)
    if (!t) continue
    const key = videoObjectKey(t, {
      id: a.id,
      drive_name: a.files?.name ?? null,
      drive_path: a.files?.path ?? null,
      season: a.season,
      episode_number: a.episode_number,
      quality: a.quality,
      dj: a.dj,
    })
    keyUpdates.push(supabase.from('attachments').update({ b2_key: key }).eq('id', a.id))
  }
  if (keyUpdates.length) await Promise.all(keyUpdates)

  // Preserve catalog order (raw_title), matching ready_title_ids() in catalog.py.
  const orderedTitles = [...(titles || [])].sort((a, b) => (a.raw_title || '').localeCompare(b.raw_title || ''))

  const items: TransferItem[] = orderedTitles.map((t) => ({
    title: { id: t.id, raw_title: t.raw_title, matched_title: t.matched_title, type: t.type, year: t.year, dj: t.dj },
    attachments: byTitle.get(t.id) || [],
  }))

  const { script, total } = buildTransferScript(items)
  return NextResponse.json({ script, total })
}
