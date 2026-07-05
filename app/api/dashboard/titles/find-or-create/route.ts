import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { normalizeTitle } from '@/lib/tmdbMatch'
import type { Candidate } from '@/lib/dashboardTypes'

// Used by the "Add title from Drive files" flow: a title discovered by
// free-text search + a confirmed TMDb candidate has no existing `titles`
// row yet. If one already exists for this exact TMDb id (+type), reuse it
// instead of creating a duplicate; otherwise insert a new, already-resolved
// row (status='done', like resolve_candidate) that the caller can then open
// in the normal title editor.
export async function POST(request: Request) {
  const { candidate, rawTitle } = (await request.json()) as { candidate: Candidate; rawTitle?: string }
  if (!candidate) return NextResponse.json({ error: 'candidate required' }, { status: 400 })

  const ctype = candidate.type === 'tv' ? 'series' : candidate.type
  const supabase = supabaseServer()

  if (candidate.tmdb_id) {
    const { data: existing, error: findErr } = await supabase
      .from('titles')
      .select('id')
      .eq('tmdb_id', candidate.tmdb_id)
      .eq('type', ctype)
      .maybeSingle()
    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
    if (existing) return NextResponse.json({ id: existing.id, created: false })
  }

  const raw = (rawTitle || candidate.matched_title || '').trim() || `Untitled ${Date.now()}`
  const base = normalizeTitle(raw) || `title-${Date.now()}`
  let normKey = base
  let n = 1
  while (true) {
    const { data: clash, error: clashErr } = await supabase
      .from('titles')
      .select('id')
      .eq('norm_key', normKey)
      .maybeSingle()
    if (clashErr) return NextResponse.json({ error: clashErr.message }, { status: 500 })
    if (!clash) break
    n += 1
    normKey = `${base} #${n}`
  }

  const { data: inserted, error } = await supabase
    .from('titles')
    .insert({
      raw_title: raw,
      norm_key: normKey,
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
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: inserted.id, created: true })
}
