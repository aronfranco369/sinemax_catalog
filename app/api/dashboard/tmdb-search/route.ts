import { NextResponse } from 'next/server'
import { pickTopCandidates } from '@/lib/tmdbMatch'

const TMDB_BASE = 'https://api.themoviedb.org/3'

// TMDb call happens server-side only — TMDB_API_KEY never reaches the browser.
export async function POST(request: Request) {
  const { query } = (await request.json()) as { query?: string }
  const q = (query || '').trim()
  if (q.length < 2) return NextResponse.json({ candidates: [] })

  const key = process.env.TMDB_API_KEY
  if (!key) return NextResponse.json({ error: 'TMDB_API_KEY not set' }, { status: 500 })

  const params = new URLSearchParams({ query: q, include_adult: 'false', language: 'en-US' })
  const headers: Record<string, string> = {}
  if (key.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${key}`
  } else {
    params.set('api_key', key)
  }

  try {
    const res = await fetch(`${TMDB_BASE}/search/multi?${params}`, { headers })
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300)
      return NextResponse.json({ error: `TMDb error (${res.status}): ${detail}` }, { status: 502 })
    }
    const json = await res.json()
    const candidates = pickTopCandidates(json.results || [], q, 3)
    return NextResponse.json({ candidates })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'TMDb search failed' }, { status: 502 })
  }
}
