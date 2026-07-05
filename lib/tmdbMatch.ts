import type { Candidate } from './dashboardTypes'

const POSTER_BASE = 'https://image.tmdb.org/t/p/w342'

// ISO 3166-1 alpha-2 -> readable country name (the common ones TMDb returns).
// Ported from enrich_tmdb.py's COUNTRY_NAMES.
const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', CA: 'Canada',
  AU: 'Australia', NZ: 'New Zealand', IE: 'Ireland',
  FR: 'France', DE: 'Germany', IT: 'Italy', ES: 'Spain',
  PT: 'Portugal', NL: 'Netherlands', BE: 'Belgium', CH: 'Switzerland',
  AT: 'Austria', SE: 'Sweden', NO: 'Norway', DK: 'Denmark',
  FI: 'Finland', IS: 'Iceland', PL: 'Poland', CZ: 'Czech Republic',
  HU: 'Hungary', RO: 'Romania', GR: 'Greece', RU: 'Russia',
  UA: 'Ukraine', TR: 'Turkey', IN: 'India', PK: 'Pakistan',
  BD: 'Bangladesh', LK: 'Sri Lanka', CN: 'China', HK: 'Hong Kong',
  TW: 'Taiwan', JP: 'Japan', KR: 'South Korea', KP: 'North Korea',
  TH: 'Thailand', VN: 'Vietnam', PH: 'Philippines', ID: 'Indonesia',
  MY: 'Malaysia', SG: 'Singapore', MX: 'Mexico', BR: 'Brazil',
  AR: 'Argentina', CL: 'Chile', CO: 'Colombia', PE: 'Peru',
  EG: 'Egypt', MA: 'Morocco', NG: 'Nigeria', GH: 'Ghana',
  KE: 'Kenya', TZ: 'Tanzania', UG: 'Uganda', ZA: 'South Africa',
  SA: 'Saudi Arabia', AE: 'United Arab Emirates', IL: 'Israel',
  IR: 'Iran', IQ: 'Iraq',
}

// Language code -> country, ONLY where one language maps unambiguously to
// one country. Ported from enrich_tmdb.py's LANG_COUNTRY.
const LANG_COUNTRY: Record<string, string> = {
  ko: 'South Korea', ja: 'Japan', th: 'Thailand', vi: 'Vietnam',
  hi: 'India', ta: 'India', te: 'India', ml: 'India', bn: 'Bangladesh',
  tr: 'Turkey', el: 'Greece', pl: 'Poland', cs: 'Czech Republic',
  hu: 'Hungary', ro: 'Romania', uk: 'Ukraine', id: 'Indonesia',
  fa: 'Iran', he: 'Israel', is: 'Iceland', fi: 'Finland',
}

// TMDb's genre id -> name lists (stable, rarely change) — hardcoded instead
// of fetched, so a single search doesn't cost two extra round trips.
const MOVIE_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy',
  36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery',
  10749: 'Romance', 878: 'Science Fiction', 10770: 'TV Movie',
  53: 'Thriller', 10752: 'War', 37: 'Western',
}
const TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 10762: 'Kids',
  9648: 'Mystery', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk',
  10768: 'War & Politics', 37: 'Western',
}

export function normalizeTitle(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function countryToNames(value: string | null | undefined): string {
  if (!value) return ''
  const parts = value.split(',').map((p) => p.trim()).filter(Boolean)
  return parts.map((p) => COUNTRY_NAMES[p.toUpperCase()] || p).join(', ')
}

type TmdbResult = {
  media_type?: string
  title?: string
  original_title?: string
  name?: string
  original_name?: string
  release_date?: string
  first_air_date?: string
  origin_country?: string[]
  original_language?: string
  genre_ids?: number[]
  overview?: string
  poster_path?: string
  id?: number
  popularity?: number
  vote_count?: number
}

function candTitleOf(cand: TmdbResult): string {
  return cand.title || cand.name || ''
}

function extractFields(cand: TmdbResult): Candidate {
  const isMovie = cand.media_type === 'movie'
  const title = isMovie ? (cand.title || cand.original_title || '') : (cand.name || cand.original_name || '')
  const date = isMovie ? cand.release_date : cand.first_air_date
  const gmap = isMovie ? MOVIE_GENRES : TV_GENRES

  const year = date ? date.slice(0, 4) : ''
  let country = countryToNames((cand.origin_country || []).join(','))
  if (!country) {
    country = LANG_COUNTRY[(cand.original_language || '').toLowerCase()] || ''
  }
  const genres = (cand.genre_ids || []).map((gid) => gmap[gid] || '').filter(Boolean).join(', ')
  const posterUrl = cand.poster_path ? `${POSTER_BASE}${cand.poster_path}` : ''

  return {
    type: isMovie ? 'movie' : 'series',
    matched_title: title,
    year,
    country,
    genres,
    synopsis: cand.overview || '',
    poster_url: posterUrl,
    tmdb_id: cand.id || 0,
    score: 0,
  }
}

/**
 * True if a candidate's title is plausibly the same work as the query.
 * Guards against TMDb returning a popular-but-unrelated result for a loose
 * keyword hit.
 */
function titleRelates(candTitle: string, query: string): boolean {
  const a = normalizeTitle(candTitle)
  const b = normalizeTitle(query)
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const ta = new Set(a.split(' '))
  const tb = new Set(b.split(' '))
  if (ta.size === 0 || tb.size === 0) return false
  const intersection = [...ta].filter((x) => tb.has(x)).length
  const union = new Set([...ta, ...tb]).size
  return intersection / union >= 0.5
}

function candScore(cand: TmdbResult, normTitle: string): number {
  const title = normalizeTitle(cand.title || cand.name)
  const orig = normalizeTitle(cand.original_title || cand.original_name)
  const exact = title === normTitle || orig === normTitle ? 1 : 0
  const starts = title.startsWith(normTitle) || normTitle.startsWith(title) ? 1 : 0
  const pop = cand.popularity || 0
  const votes = cand.vote_count || 0
  const hasYear = cand.release_date || cand.first_air_date ? 1 : 0
  return exact * 1000 + starts * 100 + pop + votes * 0.1 + hasYear * 5
}

/**
 * Top (up to `limit`) TMDb candidates for a free-text title query, for
 * manual selection — always returns candidates rather than auto-resolving,
 * since this is used interactively (unlike enrich_tmdb.py's batch pick_match,
 * which also decides an auto-accept status; that classification is dropped
 * here since a human always makes the final call in this flow).
 */
export function pickTopCandidates(results: TmdbResult[], rawTitle: string, limit = 3): Candidate[] {
  const normTitle = normalizeTitle(rawTitle)
  const movtv = results.filter((c) => c.media_type === 'movie' || c.media_type === 'tv')
  const related = movtv.filter((c) => titleRelates(candTitleOf(c), rawTitle))
  if (related.length === 0) return []

  const scored = [...related].sort((a, b) => candScore(b, normTitle) - candScore(a, normTitle))
  return scored.slice(0, limit).map((c) => {
    const fields = extractFields(c)
    fields.score = Math.round(candScore(c, normTitle) * 100) / 100
    return fields
  })
}
