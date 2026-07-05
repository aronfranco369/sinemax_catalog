import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { buildTransferScript, type TransferItem } from '@/lib/transferScript'

type AttJoinRow = {
  id: number
  title_id: number
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
    .select('id, title_id, season, episode_number, files(name, path)')
    .in('title_id', titleIds)
    .order('season', { ascending: true, nullsFirst: true })
    .order('episode_number', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true })
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })

  const byTitle = new Map<number, TransferItem['attachments']>()
  for (const a of (atts || []) as unknown as AttJoinRow[]) {
    const list = byTitle.get(a.title_id) || []
    list.push({ id: a.id, drive_name: a.files?.name ?? null, drive_path: a.files?.path ?? null })
    byTitle.set(a.title_id, list)
  }

  // Preserve catalog order (raw_title), matching ready_title_ids() in catalog.py.
  const orderedTitles = [...(titles || [])].sort((a, b) => (a.raw_title || '').localeCompare(b.raw_title || ''))

  const items: TransferItem[] = orderedTitles.map((t) => ({
    title: { id: t.id, raw_title: t.raw_title, matched_title: t.matched_title, type: t.type, year: t.year, dj: t.dj },
    attachments: byTitle.get(t.id) || [],
  }))

  const { script, total } = buildTransferScript(items)
  return NextResponse.json({ script, total })
}
