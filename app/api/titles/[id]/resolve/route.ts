import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Evidence = {
  query_used?: string
  folder?: string | null
  file_ids?: string[]
  played?: boolean
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const { candidate, candidateIndex, evidence } = body as {
    candidate: Record<string, unknown>
    candidateIndex?: number
    evidence?: Evidence
  }

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
      chosen_candidate_index: candidateIndex ?? null,
      resolution_evidence: evidence ? JSON.stringify(evidence) : null,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (evidence?.file_ids && evidence.file_ids.length > 0) {
    await supabase
      .from('title_files')
      .update({ confirmed: true })
      .eq('title_id', id)
      .in('file_id', evidence.file_ids)
  }

  return NextResponse.json({ success: true })
}
