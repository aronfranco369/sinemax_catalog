import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

// Applies an AI-grouped (and curator-reviewed) set of attachments in one shot.
// Unlike the plain attach endpoint, each row carries its full metadata
// (season / episode / label / quality / dj) exactly as approved, instead of
// being re-derived from the filename. Upsert on (title_id, file_id) keeps it
// idempotent and lets it merge with anything already attached.
type Item = {
  file_id: string
  season?: number | null
  episode_number?: number | null
  label?: string | null
  quality?: string | null
  dj?: string | null
}
type ReqBody = { items?: Item[]; replace?: boolean }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const titleId = Number(id)
  const body = (await request.json()) as ReqBody
  const items = (body.items || []).filter((i) => i.file_id)
  if (items.length === 0) return NextResponse.json({ error: 'no items to apply' }, { status: 400 })

  const supabase = supabaseServer()

  // Optional clean slate before applying the approved grouping.
  if (body.replace) {
    const { error: delErr } = await supabase.from('attachments').delete().eq('title_id', titleId)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  const rows = items.map((i) => ({
    title_id: titleId,
    file_id: i.file_id,
    season: i.season ?? null,
    episode_number: i.episode_number ?? null,
    label: (i.label || '').trim() || null,
    quality: (i.quality || '').trim() || null,
    dj: (i.dj || '').toString().trim() || null,
  }))

  const { data, error } = await supabase
    .from('attachments')
    .upsert(rows, { onConflict: 'title_id,file_id' })
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ attached: data?.length ?? 0 })
}
