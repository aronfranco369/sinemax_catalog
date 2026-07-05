import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

// Force a clean consecutive 1...N over the current order, keeping labels in
// sync for series. An escape hatch when filename-derived numbers have gaps
// you don't want. Mirrors catalog.py's renumber_all.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = supabaseServer()

  const [{ data: title }, { data: atts, error: aErr }] = await Promise.all([
    supabase.from('titles').select('type').eq('id', id).single(),
    supabase
      .from('attachments')
      .select('id')
      .eq('title_id', id)
      .order('season', { ascending: true, nullsFirst: true })
      .order('episode_number', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true }),
  ])
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
  const isSeries = title?.type === 'series' || title?.type === 'tv'

  for (const [i, a] of (atts || []).entries()) {
    const fields: Record<string, unknown> = { episode_number: i + 1 }
    if (isSeries) fields.label = `Episode ${i + 1}`
    const { error } = await supabase.from('attachments').update(fields).eq('id', a.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
