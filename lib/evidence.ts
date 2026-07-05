export type FileEntry = {
  id: string
  name: string
  ep_num: number | null
  size: number
  mime: string
  match_method: string
}

export type EpRange = { min: number; max: number; missing: number[] }

export type Confidence = 'high' | 'medium' | 'low'

export type FileGroup = {
  folder: string
  file_count: number
  ep_range: EpRange | null
  total_size: number
  confidence: Confidence
  files: FileEntry[]
}

export type EvidenceSignals = {
  structure: 'series' | 'movie' | 'unclear'
  episode_count: number | null
  year_hints: number[]
  total_files: number
  duplicate_sets: number
}

export type EvidenceResponse = {
  query_used: string
  signals: EvidenceSignals
  groups: FileGroup[]
}

export type RawFileMatch = {
  id: string
  name: string
  path: string
  size: number
  mime: string
  ep_num: number | null
  md5: string | null
  parent_id: string | null
  match_method: string
}

const CONFIDENCE_BY_METHOD: Record<string, Confidence> = {
  exact: 'high',
  prefix: 'high',
  trgm: 'medium',
  path: 'medium',
  loose: 'low',
}

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 }

const MOVIE_MIN_BYTES = 400 * 1024 * 1024

function folderTail(path: string, max = 60): string {
  const lastSlash = path.lastIndexOf('/')
  const dir = lastSlash >= 0 ? path.slice(0, lastSlash) : path
  return dir.length > max ? '…' + dir.slice(dir.length - max) : dir
}

export function buildEvidenceResponse(rows: RawFileMatch[], queryUsed: string): EvidenceResponse {
  const md5Counts = new Map<string, number>()
  for (const r of rows) {
    if (!r.md5) continue
    md5Counts.set(r.md5, (md5Counts.get(r.md5) || 0) + 1)
  }
  const duplicateSets = [...md5Counts.values()].filter((c) => c > 1).length

  const epNums = new Set<number>()
  for (const r of rows) if (r.ep_num != null) epNums.add(r.ep_num)

  const yearHints = new Set<number>()
  for (const r of rows) {
    const matches = r.path.match(/(19|20)\d{2}/g)
    if (matches) for (const m of matches) yearHints.add(parseInt(m, 10))
  }

  const groupsByParent = new Map<string, RawFileMatch[]>()
  for (const r of rows) {
    const key = r.parent_id || 'unknown'
    const bucket = groupsByParent.get(key)
    if (bucket) bucket.push(r)
    else groupsByParent.set(key, [r])
  }

  const groups: FileGroup[] = [...groupsByParent.values()].map((groupRows) => {
    const seenMd5 = new Set<string>()
    const deduped: RawFileMatch[] = []
    for (const r of groupRows) {
      if (r.md5) {
        if (seenMd5.has(r.md5)) continue
        seenMd5.add(r.md5)
      }
      deduped.push(r)
    }

    const epNumsInGroup = deduped.map((r) => r.ep_num).filter((n): n is number => n != null)
    let epRange: EpRange | null = null
    if (epNumsInGroup.length > 0) {
      const min = Math.min(...epNumsInGroup)
      const max = Math.max(...epNumsInGroup)
      const present = new Set(epNumsInGroup)
      const missing: number[] = []
      for (let i = min; i <= max; i++) if (!present.has(i)) missing.push(i)
      epRange = { min, max, missing }
    }

    const totalSize = deduped.reduce((sum, r) => sum + (r.size || 0), 0)
    const confidence = deduped.reduce<Confidence>((best, r) => {
      const c = CONFIDENCE_BY_METHOD[r.match_method] || 'low'
      return CONFIDENCE_RANK[c] > CONFIDENCE_RANK[best] ? c : best
    }, 'low')

    const sorted = [...deduped].sort((a, b) => {
      const aEp = a.ep_num ?? Number.MAX_SAFE_INTEGER
      const bEp = b.ep_num ?? Number.MAX_SAFE_INTEGER
      return aEp - bEp || a.name.localeCompare(b.name)
    })

    return {
      folder: folderTail(sorted[0].path),
      file_count: deduped.length,
      ep_range: epRange,
      total_size: totalSize,
      confidence,
      files: sorted.map((r) => ({
        id: r.id,
        name: r.name,
        ep_num: r.ep_num,
        size: r.size,
        mime: r.mime,
        match_method: r.match_method,
      })),
    }
  })

  groups.sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] || b.file_count - a.file_count)

  const totalFiles = groups.reduce((sum, g) => sum + g.file_count, 0)

  let structure: EvidenceSignals['structure'] = 'unclear'
  if (epNums.size >= 3) {
    structure = 'series'
  } else if (totalFiles >= 1 && totalFiles <= 2 && epNums.size === 0) {
    const maxSize = rows.reduce((max, r) => Math.max(max, r.size || 0), 0)
    if (maxSize >= MOVIE_MIN_BYTES) structure = 'movie'
  }

  return {
    query_used: queryUsed,
    signals: {
      structure,
      episode_count: epNums.size || null,
      year_hints: [...yearHints].sort((a, b) => a - b),
      total_files: totalFiles,
      duplicate_sets: duplicateSets,
    },
    groups,
  }
}
