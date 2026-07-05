import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import type { AttachmentRow } from '@/lib/dashboardTypes'

// Fields a curator may edit from the title editor. Mirrors catalog.py's
// EDITABLE list; anything else in the request body is ignored server-side.
const EDITABLE = [
  'matched_title', 'type', 'year', 'country', 'genres',
  'synopsis', 'synopsis_sw', 'dj', 'tags', 'catalog_status', 'poster_url',
] as const

type AttachmentJoinRow = {
  id: number
  season: number | null
  episode_number: number | null
  label: string | null
  quality: string | null
  dj: string | null
  file_id: string | null
  files: { id: string; name: string; path: string; size: number } | null
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = supabaseServer()

  const [{ data: title, error: tErr }, { data: atts, error: aErr }] = await Promise.all([
    supabase.from('titles').select('*').eq('id', id).single(),
    supabase
      .from('attachments')
      .select('id, season, episode_number, label, quality, dj, file_id, files(id, name, path, size)')
      .eq('title_id', id)
      .order('season', { ascending: true, nullsFirst: true })
      .order('episode_number', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true }),
  ])

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 404 })
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })

  const attachments: AttachmentRow[] = ((atts || []) as unknown as AttachmentJoinRow[]).map((a) => ({
    id: a.id,
    season: a.season,
    episode_number: a.episode_number,
    label: a.label,
    quality: a.quality,
    dj: a.dj,
    drive_id: a.file_id,
    drive_name: a.files?.name ?? null,
    drive_path: a.files?.path ?? null,
    file_size: a.files?.size ?? null,
    view_url: a.file_id ? `https://drive.google.com/file/d/${a.file_id}/view` : null,
    preview_url: a.file_id ? `https://drive.google.com/file/d/${a.file_id}/preview` : null,
  }))

  return NextResponse.json({ ...title, attachments })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  const update: Record<string, unknown> = {}
  for (const k of EDITABLE) {
    if (k in body) update[k] = body[k]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 })
  }
  update.updated_at = new Date().toISOString()

  const supabase = supabaseServer()
  const { error } = await supabase.from('titles').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = supabaseServer()
  // attachments cascade via FK (on delete cascade), no manual cleanup needed.
  const { error } = await supabase.from('titles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
