'use client'

import { useEffect, useRef, useState } from 'react'

type SearchResult = { id: number; raw_title: string; original_title: string; type: string }

export default function TitleSearchBar({
  jumpMode,
  onSelect,
  onExit,
}: {
  jumpMode: boolean
  onSelect: (id: number) => void
  onExit: () => void
}) {
  const [text, setText] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (text.trim().length < 2) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/titles/search?q=${encodeURIComponent(text.trim())}`)
        const json = await res.json()
        setResults(json.data || [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [text])

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Jump to a title…"
          className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-3 py-1.5 text-xs placeholder:text-gray-600 focus:outline-none focus:border-indigo-700"
        />
        {jumpMode && (
          <button
            onClick={onExit}
            className="text-xs px-3 py-1.5 rounded-xl border border-indigo-800 text-indigo-300 whitespace-nowrap flex-shrink-0"
          >
            Back to queue
          </button>
        )}
      </div>

      {open && text.trim().length >= 2 && (
        <div className="absolute z-40 mt-1 w-full bg-gray-900 border border-gray-800 rounded-xl max-h-64 overflow-y-auto shadow-xl">
          {loading && <p className="text-xs text-gray-500 p-3">Searching…</p>}
          {!loading && results.length === 0 && <p className="text-xs text-gray-500 p-3">No matches</p>}
          {!loading &&
            results.map((r) => (
              <button
                key={r.id}
                onMouseDown={() => {
                  onSelect(r.id)
                  setText('')
                  setResults([])
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-800 border-b border-gray-800 last:border-0"
              >
                <span className="font-medium">{r.raw_title}</span>
                {r.original_title && r.original_title !== r.raw_title && (
                  <span className="text-gray-500"> · {r.original_title}</span>
                )}
                <span className="text-gray-600"> ({r.type})</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
