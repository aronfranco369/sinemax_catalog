'use client'

import { useState } from 'react'
import type { Candidate } from '@/lib/dashboardTypes'
import DriveAttachPanel from './DriveAttachPanel'
import CandidateGrid from './CandidateGrid'

type PendingFile = { id: string; name: string }

/**
 * "Add a title from Drive files" — for content that exists on Drive but was
 * never seeded into `titles`. Search files/folders by free text (same panel
 * used everywhere else), collect files locally (nothing is written yet),
 * search TMDb, confirm a candidate, then hand off to the normal title
 * editor (find-or-create resolves to an existing title if this candidate
 * is already catalogued, otherwise creates a fresh one and attaches
 * whatever files were collected here).
 */
export default function AddTitleModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (titleId: number) => void
}) {
  const [titleQuery, setTitleQuery] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [tmdbError, setTmdbError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const addPending = async (files: { id: string; name: string }[]) => {
    setPendingFiles((prev) => {
      const seen = new Set(prev.map((f) => f.id))
      const merged = [...prev]
      for (const f of files) {
        if (!seen.has(f.id)) {
          seen.add(f.id)
          merged.push(f)
        }
      }
      return merged
    })
  }

  const removePending = (id: string) => setPendingFiles((prev) => prev.filter((f) => f.id !== id))

  const searchTmdb = async () => {
    const q = titleQuery.trim()
    if (q.length < 2) return
    setSearching(true)
    setTmdbError(null)
    setCandidates(null)
    try {
      const res = await fetch('/api/dashboard/tmdb-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setTmdbError(data.error || `Search failed (${res.status})`)
        return
      }
      setCandidates(data.candidates || [])
    } catch (e) {
      setTmdbError(e instanceof Error ? e.message : 'TMDb search failed')
    } finally {
      setSearching(false)
    }
  }

  const confirmCandidate = async (candidate: Candidate) => {
    setConfirming(true)
    try {
      const res = await fetch('/api/dashboard/titles/find-or-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate, rawTitle: titleQuery.trim() }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setTmdbError(data.error || `Could not create title (${res.status})`)
        return
      }
      if (pendingFiles.length > 0) {
        await fetch(`/api/dashboard/titles/${data.id}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: pendingFiles, season: null }),
        })
      }
      onCreated(data.id)
    } finally {
      setConfirming(false)
    }
  }

  const attachedIds = new Set(pendingFiles.map((f) => f.id))

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="w-full max-w-4xl bg-gray-900 border border-gray-800 rounded-2xl p-5 my-6">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-base font-semibold">Add a title from Drive files</h2>
          <div className="flex-1" />
          <button onClick={onClose} className="text-xs px-2 py-1.5 rounded-lg border border-gray-700 text-gray-400">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          <label className="text-[11px] text-gray-500">Title</label>
          <div className="flex gap-2">
            <input
              value={titleQuery}
              onChange={(e) => setTitleQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchTmdb()}
              placeholder="e.g. Knights of the Zodiac"
              className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-700"
            />
            <button
              onClick={searchTmdb}
              disabled={titleQuery.trim().length < 2 || searching}
              className="px-3 py-2 rounded-lg bg-indigo-800 text-xs disabled:opacity-40 flex-shrink-0"
            >
              {searching ? 'Searching…' : 'Search TMDB'}
            </button>
          </div>
        </div>

        {tmdbError && <p className="text-xs text-red-400 mb-3">{tmdbError}</p>}

        {candidates && candidates.length === 0 && !tmdbError && (
          <p className="text-xs text-gray-500 mb-3">No TMDB matches for “{titleQuery.trim()}” — try adjusting the title.</p>
        )}

        {candidates && candidates.length > 0 && (
          <div className="mb-4">
            <CandidateGrid
              candidates={candidates}
              onChoose={confirmCandidate}
              label={confirming ? 'Creating title…' : 'TMDB candidates — pick the right one'}
            />
          </div>
        )}

        <hr className="border-gray-800 my-4" />

        {pendingFiles.length > 0 && (
          <div className="mb-3">
            <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-1">
              Selected files ({pendingFiles.length}) — attached once you confirm a title above
            </p>
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
              {pendingFiles.map((f) => (
                <div key={f.id} className="flex items-center gap-2 text-xs bg-gray-950 border border-gray-800 rounded-lg px-2 py-1">
                  <span className="flex-1 truncate">{f.name}</span>
                  <button onClick={() => removePending(f.id)} className="text-red-400 flex-shrink-0">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <DriveAttachPanel attachedIds={attachedIds} defaultQuery={titleQuery} onAttach={addPending} />
      </div>
    </div>
  )
}
