// Tight, conservative filename-vs-title matching logic.
// Only ever returns a confident match when the evidence is strong;
// everything else falls through to manual review.

export type Candidate = {
  type?: string
  matched_title?: string
  year?: string
  country?: string
  genres?: string
  synopsis?: string
  poster_url?: string
  tmdb_id?: number
  score?: number
}

const NOISE_RE = new RegExp(
  '\\b(' +
    [
      '4k', '2160p', '1080p', '720p', '480p', '360p',
      'webrip', 'web-dl', 'webdl', 'bluray', 'blu-ray', 'bdrip', 'dvdrip', 'hdtv', 'hdcam', 'hdrip',
      'x264', 'x265', 'hevc', 'avc', 'h264', 'h265', 'xvid', 'divx',
      'aac', 'mp3', 'ac3', 'dts',
      'yts', 'yify', 'rarbg', 'eztv', 'ettv',
      'extended', 'remastered', 'theatrical', 'unrated',
      'hindi', 'dubbed', 'english', 'swahili', 'arabic', 'french',
    ].join('|') +
    ')\\b',
  'gi'
)

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu
const YEAR_RE = /\b(19[5-9]\d|20[0-2]\d)\b/
const SERIES_HINT_RE = /\b(s\d{2}e\d{2}|episode|ep\s*\d+|season|part\s*[a-z])\b/i

export function normalize(text: string | null | undefined): string[] {
  if (!text) return []
  let t = text.normalize('NFKD')
  t = t.replace(EMOJI_RE, ' ')
  t = t.replace(NOISE_RE, ' ')
  t = t.replace(/dj\s*\w+/gi, ' ')
  t = t.replace(/www\.\S+/gi, ' ')
  t = t.replace(/[^\w\s]/g, ' ')
  t = t.replace(/\s+/g, ' ').trim().toLowerCase()
  return t.split(' ').filter(w => w && !/^\d{1,2}$/.test(w))
}

export function extractYear(text: string | null | undefined): string | null {
  const m = YEAR_RE.exec(text || '')
  return m ? m[1] : null
}

function titleWordsInFilename(titleWords: string[], filenameWords: string[]): boolean {
  return titleWords.every(w => filenameWords.includes(w))
}

export type MatchResult = {
  score: number
  candidateIndex: number
  evidence: string
}

export function scoreMatch(
  titleWords: string[],
  filename: string,
  candidates: Candidate[]
): MatchResult {
  const fnWords = normalize(filename)
  const fnYear = extractYear(filename)

  if (titleWords.length < 2) return { score: 0, candidateIndex: -1, evidence: '' }
  if (!titleWordsInFilename(titleWords, fnWords)) return { score: 0, candidateIndex: -1, evidence: '' }

  const baseScore = 2

  if (fnYear) {
    const yearMatches = candidates
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.year === fnYear)
    if (yearMatches.length === 1) {
      const idx = yearMatches[0].i
      return {
        score: baseScore + 3,
        candidateIndex: idx,
        evidence: `year ${fnYear} in filename matches candidate ${idx}`,
      }
    }
  }

  const isSeries = SERIES_HINT_RE.test(filename)
  const fileType = isSeries ? 'series' : 'movie'
  const typeMatches = candidates
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => (c.type === 'tv') === isSeries)
  if (typeMatches.length === 1) {
    const idx = typeMatches[0].i
    return {
      score: baseScore + 2,
      candidateIndex: idx,
      evidence: `type hint '${fileType}' in filename matches candidate ${idx}`,
    }
  }

  return { score: baseScore, candidateIndex: -1, evidence: 'words match but no decisive signal' }
}

export const CONFIDENCE_THRESHOLD = 5
