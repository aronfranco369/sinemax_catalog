'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import EvidenceChip from './components/EvidenceChip'
import DriveFilesPanel from './components/DriveFilesPanel'
import PlayerModal from './components/PlayerModal'
import TitleSearchBar from './components/TitleSearchBar'
import type { EvidenceResponse, FileEntry } from '@/lib/evidence'

type Candidate = {
  matched_title: string
  year: string
  type: string
  country: string
  genres: string
  synopsis: string
  poster_url: string
  tmdb_id: number
  score: number
}

type Title = {
  id: number
  raw_title: string
  original_title: string
  type: string
  candidates_json: Candidate[]
}

type PrefetchEntry = {
  title: Title | null
  total: number
  evidence: EvidenceResponse | null
}

async function fetchEvidence(titleId: number): Promise<EvidenceResponse | null> {
  try {
    const res = await fetch(`/api/titles/${titleId}/files`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

const CURSOR_STORAGE_KEY = 'sinemax-review-cursor-id'

function readStoredCursor(): number {
  if (typeof window === 'undefined') return 0
  const raw = window.localStorage.getItem(CURSOR_STORAGE_KEY)
  const n = raw ? parseInt(raw, 10) : 0
  return Number.isFinite(n) && n > 0 ? n : 0
}

function persistCursor(id: number) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CURSOR_STORAGE_KEY, String(id))
  } catch {
    // best-effort; private-mode/quota failures shouldn't break the review flow
  }
}

export default function ReviewPage() {
  const [title, setTitle] = useState<Title | null>(null)
  const [cursorId, setCursorId] = useState<number>(readStoredCursor)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(false)
  const [done, setDone] = useState(false)

  const [evidence, setEvidence] = useState<EvidenceResponse | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(true)
  const [evidenceError, setEvidenceError] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [playedFileIds, setPlayedFileIds] = useState<Set<string>>(new Set())
  const [player, setPlayer] = useState<{ file: FileEntry; groupFiles: FileEntry[] } | null>(null)
  const [jumpMode, setJumpMode] = useState(false)

  const prefetchCache = useRef<Map<number, PrefetchEntry>>(new Map())
  const initialTotalRef = useRef<number | null>(null)

  const noteTotal = useCallback((count: number) => {
    if (initialTotalRef.current === null) initialTotalRef.current = count
    setTotal(count)
  }, [])

  const applyEvidence = useCallback((ev: EvidenceResponse | null) => {
    setEvidence(ev)
    setEvidenceError(!ev)
    setEvidenceLoading(false)
    setSearchQuery(ev?.query_used || '')
    const first = ev?.groups[0]
    setExpandedFolders(first ? { [first.folder]: true } : {})
    setActiveFolder(first?.folder ?? null)
  }, [])

  const prefetchFrom = useCallback(async (fromId: number) => {
    if (prefetchCache.current.has(fromId)) return
    try {
      const res = await fetch(`/api/titles?from_id=${fromId}`)
      const json = await res.json()
      if (!json.data || json.data.length === 0) {
        prefetchCache.current.set(fromId, { title: null, total: json.count || 0, evidence: null })
        return
      }
      const t = json.data[0]
      const entry: PrefetchEntry = { title: t, total: json.count || 0, evidence: null }
      prefetchCache.current.set(fromId, entry)
      entry.evidence = await fetchEvidence(t.id)
    } catch {
      // best-effort prefetch; a plain fetch will happen on navigation instead
    }
  }, [])

  const fetchTitle = useCallback(
    async (fromId: number) => {
      const cached = prefetchCache.current.get(fromId)
      if (cached) {
        prefetchCache.current.delete(fromId)
        if (!cached.title) {
          setDone(true)
          setLoading(false)
          return
        }
        setTitle(cached.title)
        noteTotal(cached.total)
        setLoading(false)
        applyEvidence(cached.evidence)
        persistCursor(cached.title.id)
        prefetchFrom(cached.title.id + 1)
        return
      }

      setLoading(true)
      setEvidenceLoading(true)
      setEvidence(null)
      const res = await fetch(`/api/titles?from_id=${fromId}`)
      const json = await res.json()
      if (!json.data || json.data.length === 0) {
        setDone(true)
        setLoading(false)
        return
      }
      const t = json.data[0]
      setTitle(t)
      noteTotal(json.count || 0)
      setLoading(false)
      persistCursor(t.id)

      fetchEvidence(t.id).then(applyEvidence)
      prefetchFrom(t.id + 1)
    },
    [applyEvidence, prefetchFrom, noteTotal]
  )

  const resetTitleUiState = useCallback(() => {
    setPlayedFileIds(new Set())
    setPlayer(null)
    setSearchQuery('')
    setExpandedFolders({})
    setActiveFolder(null)
  }, [])

  useEffect(() => {
    resetTitleUiState()
    fetchTitle(cursorId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorId])

  const jumpToTitle = useCallback(
    async (id: number) => {
      resetTitleUiState()
      setJumpMode(true)
      setLoading(true)
      setEvidence(null)
      setEvidenceLoading(true)
      const res = await fetch(`/api/titles?id=${id}`)
      const json = await res.json()
      if (!json.data || json.data.length === 0) {
        setLoading(false)
        setJumpMode(false)
        return
      }
      const t = json.data[0]
      setTitle(t)
      noteTotal(json.count || 0)
      setLoading(false)
      fetchEvidence(t.id).then(applyEvidence)
    },
    [resetTitleUiState, applyEvidence, noteTotal]
  )

  const returnToQueue = useCallback(() => {
    resetTitleUiState()
    setJumpMode(false)
    fetchTitle(cursorId)
  }, [resetTitleUiState, fetchTitle, cursorId])

  const runSearch = useCallback(async () => {
    if (!title) return
    setEvidenceLoading(true)
    setEvidenceError(false)
    const ev = await fetch(`/api/titles/${title.id}/files?q=${encodeURIComponent(searchQuery)}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
    applyEvidence(ev)
    if (ev) setSearchQuery(searchQuery)
  }, [title, searchQuery, applyEvidence])

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folder]: !prev[folder] }))
    setActiveFolder(folder)
  }

  const openPlayer = (file: FileEntry, groupFiles: FileEntry[]) => {
    setPlayer({ file, groupFiles })
    setPlayedFileIds((prev) => new Set(prev).add(file.id))
  }

  const resolve = async (candidate: Candidate, candidateIndex: number) => {
    if (!title || resolving) return
    setResolving(true)
    const fileIds = evidence ? evidence.groups.flatMap((g) => g.files.map((f) => f.id)) : []
    const body = {
      candidate,
      candidateIndex,
      evidence: {
        query_used: searchQuery,
        folder: activeFolder,
        file_ids: fileIds,
        played: playedFileIds.size > 0,
      },
    }
    await fetch(`/api/titles/${title.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setResolving(false)
    if (jumpMode) {
      returnToQueue()
    } else {
      setCursorId(title.id + 1)
    }
  }

  const skip = () => {
    if (jumpMode) {
      returnToQueue()
    } else if (title) {
      setCursorId(title.id + 1)
    }
  }

  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
      <div className="text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold">All titles reviewed!</h1>
      </div>
    </div>
  )

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!title) return null

  const candidates: Candidate[] = title.candidates_json || []
  const initialTotal = initialTotalRef.current
  const progressPercent = initialTotal ? Math.min(100, ((initialTotal - total) / initialTotal) * 100) : 0

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">
      <div className="px-4 pt-6 pb-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Sinemax Review</p>
            <h1 className="text-xl font-bold truncate">{title.raw_title}</h1>
            {title.original_title && title.original_title !== title.raw_title && (
              <p className="text-xs text-gray-400 mt-0.5">Original: {title.original_title}</p>
            )}
          </div>
          <div className="w-full sm:max-w-xs sm:flex-shrink-0">
            <TitleSearchBar jumpMode={jumpMode} onSelect={jumpToTitle} onExit={returnToQueue} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs bg-gray-800 px-2 py-0.5 rounded-full">{title.type}</span>
          {jumpMode ? (
            <span className="text-xs text-indigo-400">Search result · {total} remaining</span>
          ) : (
            <span className="text-xs text-gray-500">{total} remaining</span>
          )}
        </div>
      </div>

      <div className="h-1 bg-gray-800 flex-shrink-0">
        <div
          className="h-1 bg-indigo-500 transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-2 lg:gap-0">
        <div className="px-4 py-4 space-y-4 lg:h-full lg:overflow-y-auto lg:border-r lg:border-gray-800">
          <p className="text-xs text-gray-500 text-center uppercase tracking-widest">Pick the correct match</p>
          {candidates.map((c, i) => (
            <button
              key={i}
              onClick={() => resolve(c, i)}
              disabled={resolving}
              className="w-full text-left bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 active:scale-95 transition-transform disabled:opacity-50"
            >
              <div className="flex gap-3 p-3">
                {c.poster_url ? (
                  <div className="relative w-16 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-800">
                    <Image src={c.poster_url} alt={c.matched_title} fill className="object-cover" unoptimized />
                  </div>
                ) : (
                  <div className="w-16 h-24 flex-shrink-0 rounded-lg bg-gray-800 flex items-center justify-center text-gray-600 text-2xl">?</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-sm leading-tight">{c.matched_title}</h2>
                    <span className="text-xs bg-indigo-900 text-indigo-300 px-1.5 py-0.5 rounded flex-shrink-0">{c.year}</span>
                  </div>
                  <div className="flex gap-1 mt-1 flex-wrap items-center">
                    <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{c.type}</span>
                    {c.country && <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{c.country}</span>}
                    <EvidenceChip signals={evidenceLoading ? null : evidence?.signals ?? null} candidateType={c.type} />
                  </div>
                  {c.genres && <p className="text-xs text-indigo-400 mt-1">{c.genres}</p>}
                  {c.synopsis && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-3">{c.synopsis}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="px-4 py-4 lg:h-full lg:overflow-y-auto">
          <DriveFilesPanel
            loading={evidenceLoading}
            error={evidenceError}
            evidence={evidence}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onSearchSubmit={runSearch}
            onRetry={runSearch}
            expandedFolders={expandedFolders}
            onToggleFolder={toggleFolder}
            onPlay={openPlayer}
          />
        </div>
      </div>

      <div className="px-4 py-4 border-t border-gray-800 flex-shrink-0">
        <button
          onClick={skip}
          className="w-full py-3 rounded-xl text-sm text-gray-400 border border-gray-700 active:bg-gray-800 transition-colors"
        >
          {jumpMode ? 'Back to queue' : 'Skip for now'}
        </button>
      </div>

      {player && (
        <PlayerModal
          file={player.file}
          groupFiles={player.groupFiles}
          onClose={() => setPlayer(null)}
          onNavigate={(f) => {
            setPlayer({ file: f, groupFiles: player.groupFiles })
            setPlayedFileIds((prev) => new Set(prev).add(f.id))
          }}
        />
      )}
    </div>
  )
}
