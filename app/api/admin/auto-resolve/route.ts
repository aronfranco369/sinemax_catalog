import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { normalize, scoreMatch, CONFIDENCE_THRESHOLD, type Candidate } from '@/lib/resolveMatch'

export const dynamic = 'force-dynamic'

// Lazily created so this module can be safely imported/analyzed at build
// time, before runtime env vars (like the service role key) are injected.
function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const STOPWORDS = new Set(['the', 'and', 'part', 'episode', 'season'])

function distinctiveWords(words: string[], max = 3): string[] {
  return [...words]
    .filter(w => !STOPWORDS.has(w))
    .sort((a, b) => b.length - a.length)
    .slice(0, max)
}

async function searchFilesForTerm(supabase: SupabaseClient, term: string) {
  const words = normalize(term)
  const keyWords = distinctiveWords(words)
  if (keyWords.length === 0) return []

  let query = supabase
    .from('files')
    .select('id,name,path,mime')
    .ilike('mime', 'video/%')
    .limit(50)

  for (const w of keyWords) {
    query = query.ilike('name', `%${w}%`)
  }

  const { data, error } = await query
  if (error) {
    console.error('file search error:', error.message)
    return []
  }
  return data || []
}

type ProcessedResult = {
  id: number
  raw_title: string
  outcome: 'resolved' | 'uncertain'
  chosen?: string
  evidence?: string
  score: number
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin()
  const { searchParams } = new URL(request.url)
  const offset = parseInt(searchParams.get('offset') || '0')
  const limit = parseInt(searchParams.get('limit') || '20')

  const { data: titles, error } = await supabase
    .from('titles')
    .select('id,raw_title,original_title,candidates_json')
    .eq('status', 'ambiguous')
    .order('id')
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!titles || titles.length === 0) {
    return NextResponse.json({ done: true, results: [], nextOffset: offset })
  }

  const results: ProcessedResult[] = []

  for (const t of titles) {
    const candidates: Candidate[] = t.candidates_json || []
    if (candidates.length === 0) continue

    const searchTerms = Array.from(
      new Set([t.raw_title, t.original_title].filter((s): s is string => !!s && s.trim().length > 0))
    )

    let best = { score: 0, candidateIndex: -1, evidence: '', file: '' }

    for (const term of searchTerms) {
      const titleWords = normalize(term)
      if (titleWords.length < 2) continue

      const files = await searchFilesForTerm(supabase, term)
      for (const f of files) {
        const m = scoreMatch(titleWords, f.name, candidates)
        if (m.score > best.score) {
          best = { ...m, file: f.name }
        }
      }
    }

    if (best.score >= CONFIDENCE_THRESHOLD && best.candidateIndex >= 0) {
      const candidate = candidates[best.candidateIndex]
      const evidence = `${best.file} | ${best.evidence}`

      await supabase
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
          resolution_method: 'auto_file_match',
          chosen_candidate_index: best.candidateIndex,
          resolution_evidence: evidence,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', t.id)

      results.push({
        id: t.id,
        raw_title: t.raw_title,
        outcome: 'resolved',
        chosen: `${candidate.matched_title} (${candidate.year})`,
        evidence,
        score: best.score,
      })
    } else {
      results.push({
        id: t.id,
        raw_title: t.raw_title,
        outcome: 'uncertain',
        score: best.score,
      })
    }
  }

  return NextResponse.json({
    done: false,
    processed: titles.length,
    nextOffset: offset + titles.length,
    results,
  })
}
