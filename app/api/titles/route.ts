import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const idParam = searchParams.get('id')

  if (idParam) {
    const [{ data, error }, { count }] = await Promise.all([
      supabase.from('titles').select('*').eq('id', idParam).single(),
      supabase.from('titles').select('*', { count: 'exact', head: true }).eq('status', 'ambiguous'),
    ])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data ? [data] : [], count: count || 0 })
  }

  const fromId = parseInt(searchParams.get('from_id') || '0', 10)

  const [{ data, error }, { count }] = await Promise.all([
    supabase.from('titles').select('*').eq('status', 'ambiguous').gte('id', fromId).order('id').limit(1),
    supabase.from('titles').select('*', { count: 'exact', head: true }).eq('status', 'ambiguous'),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, count: count || 0 })
}
