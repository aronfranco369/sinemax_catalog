'use client'

import { useState, useRef } from 'react'

type LogEntry = {
  id: number
  raw_title: string
  outcome: 'resolved' | 'uncertain'
  chosen?: string
  evidence?: string
  score: number
}

const BATCH_SIZE = 20

export default function AutoResolvePage() {
  const [running, setRunning] = useState(false)
  const [offset, setOffset] = useState(0)
  const [resolvedCount, setResolvedCount] = useState(0)
  const [uncertainCount, setUncertainCount] = useState(0)
  const [log, setLog] = useState<LogEntry[]>([])
  const [finished, setFinished] = useState(false)
  const stopRef = useRef(false)

  const runBatch = async (currentOffset: number) => {
    const res = await fetch(`/api/admin/auto-resolve?offset=${currentOffset}&limit=${BATCH_SIZE}`)
    const json = await res.json()

    if (json.done) {
      setFinished(true)
      setRunning(false)
      return
    }

    const results: LogEntry[] = json.results || []
    setLog(prev => [...results.slice().reverse(), ...prev].slice(0, 200))
    setResolvedCount(c => c + results.filter(r => r.outcome === 'resolved').length)
    setUncertainCount(c => c + results.filter(r => r.outcome === 'uncertain').length)
    setOffset(json.nextOffset)

    if (!stopRef.current) {
      await runBatch(json.nextOffset)
    } else {
      setRunning(false)
    }
  }

  const start = () => {
    stopRef.current = false
    setRunning(true)
    setFinished(false)
    runBatch(offset)
  }

  const stop = () => {
    stopRef.current = true
  }

  const total = resolvedCount + uncertainCount

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="px-4 pt-6 pb-3 border-b border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Sinemax Admin</p>
        <h1 className="text-xl font-bold">Auto-Resolve Ambiguous Titles</h1>
        <p className="text-xs text-gray-400 mt-1">
          Matches raw &amp; original titles against drive filenames. Only high-confidence matches are applied.
        </p>
      </div>

      <div className="px-4 py-4 grid grid-cols-3 gap-2 border-b border-gray-800">
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-400">{resolvedCount}</p>
          <p className="text-xs text-gray-500">Resolved</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-yellow-400">{uncertainCount}</p>
          <p className="text-xs text-gray-500">Uncertain</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold">{total}</p>
          <p className="text-xs text-gray-500">Processed</p>
        </div>
      </div>

      <div className="px-4 py-3 flex gap-2 border-b border-gray-800">
        {!running ? (
          <button
            onClick={start}
            className="flex-1 py-3 rounded-xl bg-indigo-600 text-sm font-semibold active:scale-95 transition-transform"
          >
            {offset === 0 ? 'Start' : 'Resume'}
          </button>
        ) : (
          <button
            onClick={stop}
            className="flex-1 py-3 rounded-xl bg-red-600 text-sm font-semibold active:scale-95 transition-transform"
          >
            Stop
          </button>
        )}
      </div>

      {finished && (
        <div className="px-4 py-3 bg-green-950 border-b border-green-900 text-center text-sm text-green-300">
          All ambiguous titles processed.
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {log.map((entry, i) => (
          <div
            key={`${entry.id}-${i}`}
            className={`rounded-lg p-3 text-xs border ${
              entry.outcome === 'resolved'
                ? 'bg-green-950/40 border-green-900'
                : 'bg-gray-900 border-gray-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold truncate">{entry.raw_title}</span>
              <span className={entry.outcome === 'resolved' ? 'text-green-400' : 'text-gray-500'}>
                score {entry.score}
              </span>
            </div>
            {entry.outcome === 'resolved' ? (
              <>
                <p className="text-green-300 mt-1">→ {entry.chosen}</p>
                <p className="text-gray-500 mt-0.5 truncate">{entry.evidence}</p>
              </>
            ) : (
              <p className="text-gray-500 mt-1">No confident match — left for manual review</p>
            )}
          </div>
        ))}
        {log.length === 0 && (
          <p className="text-center text-gray-600 text-sm mt-8">Press Start to begin processing.</p>
        )}
      </div>
    </div>
  )
}
