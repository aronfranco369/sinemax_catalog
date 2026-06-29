import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const { candidate } = body

  const { error } = await supabase
    .from('titles')
    .update({
      status: 'done',
      matched_title: candidate.matched_title,
      year: candidate.year,
      country: candidate.country,
      genres: candidate.genres,
      synopsis: candidate.synopsis,
      poster_url: candidate.poster_url,
      tmdb_id: candidate.tmdb_id,
      score: candidate.score,
      type: candidate.type,
      resolution_method: 'manual',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
