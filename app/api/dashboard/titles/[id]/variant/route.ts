import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

// Duplicate a title's metadata into a new row with NO attachments, a
// cleared DJ, and a reset catalog_status — for series/movies translated by
// more than one DJ. Mirrors catalog.py's create_variant.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = supabaseServer()

  const { data: src, error: srcErr } = await supabase.from('titles').select('*').eq('id', id).single()
  if (srcErr || !src) return NextResponse.json({ error: 'title not found' }, { status: 404 })

  const data: Record<string, unknown> = { ...src }
  delete data.id
  delete data.updated_at
  data.dj = ''
  data.catalog_status = null

  const base = String(data.norm_key || data.raw_title || `title-${id}`).trim()
  let n = 2
  let normKey = `${base} #variant${n}`
  while (true) {
    const { data: clash } = await supabase.from('titles').select('id').eq('norm_key', normKey).maybeSingle()
    if (!clash) break
    n += 1
    normKey = `${base} #variant${n}`
  }
  data.norm_key = normKey

  const { data: inserted, error: insErr } = await supabase.from('titles').insert(data).select('id').single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  return NextResponse.json({ id: inserted.id })
}
