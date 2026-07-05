import { NextResponse } from 'next/server'

const TMDB_BASE = 'https://api.themoviedb.org/3'

type TmdbVideo = { site?: string; key?: string; type?: string; official?: boolean }

function pickTrailer(videos: TmdbVideo[]): string | null {
  const yt = videos.filter((v) => v.site === 'YouTube' && v.key)
  const passes: [string, boolean][] = [['Trailer', true], ['Trailer', false], ['Teaser', false]]
  for (const [typ, requireOfficial] of passes) {
    for (const v of yt) {
      if (v.type === typ && (!requireOfficial || v.official)) return v.key as string
    }
  }
  return (yt[0]?.key as string) ?? null
}

// TMDb call happens server-side only — TMDB_API_KEY never reaches the browser.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const tmdbId = searchParams.get('tmdbId')
  if (!tmdbId || (type !== 'movie' && type !== 'tv')) {
    return NextResponse.json({ embed_url: null })
  }

  const key = process.env.TMDB_API_KEY
  if (!key) return NextResponse.json({ error: 'TMDB_API_KEY not set' }, { status: 500 })

  const params = new URLSearchParams({ language: 'en-US' })
  const headers: Record<string, string> = {}
  if (key.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${key}`
  } else {
    params.set('api_key', key)
  }

  try {
    const res = await fetch(`${TMDB_BASE}/${type}/${tmdbId}/videos?${params}`, { headers })
    if (!res.ok) return NextResponse.json({ embed_url: null })
    const json = await res.json()
    const trailerKey = pickTrailer(json.results || [])
    return NextResponse.json({ embed_url: trailerKey ? `https://www.youtube.com/embed/${trailerKey}` : null })
  } catch {
    return NextResponse.json({ embed_url: null })
  }
}
