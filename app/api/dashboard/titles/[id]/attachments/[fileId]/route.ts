import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { parseLabelEp } from '@/lib/episodeParse'

type PatchBody = {
  season?: number | null
  episode_number?: number | null
  label?: string | null
  quality?: string | null
  dj?: string | null
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params
  const body = (await request.json()) as PatchBody
  const supabase = supabaseServer()

  const update: Record<string, unknown> = {}
  if ('season' in body) update.season = body.season
  if ('episode_number' in body) update.episode_number = body.episode_number
  if ('quality' in body) update.quality = body.quality
  if ('dj' in body) update.dj = body.dj
  if ('label' in body) {
    const label = (body.label || '').trim() || null
    update.label = label
    // Keep episode_number aligned to the (now edited) label, same as
    // dashboard.py's on_label_edit, unless the caller set it explicitly.
    if (!('episode_number' in body)) {
      const { data: title } = await supabase.from('titles').select('type').eq('id', id).single()
      const isSeries = title?.type === 'series' || title?.type === 'tv'
      if (isSeries) {
        const num = parseLabelEp(label)
        if (num != null) update.episode_number = num
      }
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields provided' }, { status: 400 })
  }

  const { error } = await supabase.from('attachments').update(update).eq('title_id', id).eq('file_id', fileId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params
  const supabase = supabaseServer()
  const { error } = await supabase.from('attachments').delete().eq('title_id', id).eq('file_id', fileId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
