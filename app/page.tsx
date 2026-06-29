'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'

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

export default function ReviewPage() {
  const [title, setTitle] = useState<Title | null>(null)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(false)
  const [done, setDone] = useState(false)

  const fetchTitle = useCallback(async (p: number) => {
    setLoading(true)
    const res = await fetch(`/api/titles?page=${p}`)
    const json = await res.json()
    if (!json.data || json.data.length === 0) {
      setDone(true)
    } else {
      setTitle(json.data[0])
      setTotal(json.count || 0)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchTitle(page) }, [page, fetchTitle])

  const resolve = async (candidate: Candidate) => {
    if (!title || resolving) return
    setResolving(true)
    await fetch(`/api/titles/${title.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate }),
    })
    setResolving(false)
    setPage(p => p + 1)
  }

  const skip = () => setPage(p => p + 1)

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

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="px-4 pt-6 pb-3 border-b border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Sinemax Review</p>
        <h1 className="text-xl font-bold truncate">{title.raw_title}</h1>
        {title.original_title && title.original_title !== title.raw_title && (
          <p className="text-xs text-gray-400 mt-0.5">Original: {title.original_title}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs bg-gray-800 px-2 py-0.5 rounded-full">{title.type}</span>
          <span className="text-xs text-gray-500">{page + 1} of {total} remaining</span>
        </div>
      </div>

      <div className="h-1 bg-gray-800">
        <div
          className="h-1 bg-indigo-500 transition-all"
          style={{ width: `${Math.min(100, (page / total) * 100)}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <p className="text-xs text-gray-500 text-center uppercase tracking-widest">Pick the correct match</p>
        {candidates.map((c, i) => (
          <button
            key={i}
            onClick={() => resolve(c)}
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
                <div className="flex gap-1 mt-1 flex-wrap">
                  <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{c.type}</span>
                  {c.country && <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{c.country}</span>}
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

      <div className="px-4 py-4 border-t border-gray-800">
        <button
          onClick={skip}
          className="w-full py-3 rounded-xl text-sm text-gray-400 border border-gray-700 active:bg-gray-800 transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
