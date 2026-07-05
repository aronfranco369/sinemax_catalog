import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import type { Candidate } from '@/lib/dashboardTypes'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { candidate } = (await request.json()) as { candidate: Candidate }
  if (!candidate) return NextResponse.json({ error: 'candidate required' }, { status: 400 })

  const ctype = candidate.type === 'tv' ? 'series' : candidate.type

  const supabase = supabaseServer()
  const { error } = await supabase
    .from('titles')
    .update({
      status: 'done',
      type: ctype,
      matched_title: candidate.matched_title,
      year: candidate.year,
      country: candidate.country,
      genres: candidate.genres,
      synopsis: candidate.synopsis,
      poster_url: candidate.poster_url,
      tmdb_id: candidate.tmdb_id,
      score: candidate.score,
      candidates_json: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
