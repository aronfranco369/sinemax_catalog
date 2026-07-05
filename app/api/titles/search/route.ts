import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type TitleHit = { id: number; raw_title: string; original_title: string; type: string }

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ data: [] })

  const pattern = `%${q}%`
  const [byRaw, byOriginal] = await Promise.all([
    supabase
      .from('titles')
      .select('id, raw_title, original_title, type')
      .eq('status', 'ambiguous')
      .ilike('raw_title', pattern)
      .order('id')
      .limit(20),
    supabase
      .from('titles')
      .select('id, raw_title, original_title, type')
      .eq('status', 'ambiguous')
      .ilike('original_title', pattern)
      .order('id')
      .limit(20),
  ])

  if (byRaw.error) return NextResponse.json({ error: byRaw.error.message }, { status: 500 })
  if (byOriginal.error) return NextResponse.json({ error: byOriginal.error.message }, { status: 500 })

  const merged = new Map<number, TitleHit>()
  for (const row of [...(byRaw.data || []), ...(byOriginal.data || [])] as TitleHit[]) {
    merged.set(row.id, row)
  }

  const data = [...merged.values()].sort((a, b) => a.id - b.id).slice(0, 20)
  return NextResponse.json({ data })
}
