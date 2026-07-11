'use client'

import { useMemo, useState } from 'react'
import type { AttachmentRow } from '@/lib/dashboardTypes'

function sizeMb(bytes: number | null): string {
  return bytes ? `${Math.round(bytes / 1048576)} MB` : ''
}

function groupKey(a: AttachmentRow): string {
  return `${a.season ?? ''}-${a.episode_number ?? ''}`
}

export default function AttachedFilesList({
  titleId,
  isSeries,
  attachments,
  onSeasonChange,
  onRefresh,
}: {
  titleId: number
  isSeries: boolean
  attachments: AttachmentRow[]
  onSeasonChange: (n: number) => void
  onRefresh: () => Promise<void>
}) {
  const [seasonInput, setSeasonInput] = useState<string>('')
  const [playingId, setPlayingId] = useState<number | null>(null)
  const [detachingAll, setDetachingAll] = useState(false)

  // How many attachments share the same (season, episode_number) slot --
  // that's what actually makes a row "a variant of something", regardless
  // of whether dj/quality have been tagged yet.
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of attachments) {
      const key = groupKey(a)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return counts
  }, [attachments])

  const setAllSeason = async (n: number) => {
    onSeasonChange(n)
    await fetch(`/api/dashboard/titles/${titleId}/attachments/season`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season: n }),
    })
    await onRefresh()
  }

  const renumber = async () => {
    await fetch(`/api/dashboard/titles/${titleId}/attachments/renumber`, { method: 'POST' })
    await onRefresh()
  }

  const detach = async (fileId: string) => {
    await fetch(`/api/dashboard/titles/${titleId}/attachments/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
    await onRefresh()
  }

  const detachAll = async () => {
    if (attachments.length === 0) return
    if (!confirm(`Detach all ${attachments.length} file(s)? This starts the attachments fresh.`)) return
    setDetachingAll(true)
    try {
      await fetch(`/api/dashboard/titles/${titleId}/attachments`, { method: 'DELETE' })
      await onRefresh()
    } finally {
      setDetachingAll(false)
    }
  }

  const patch = async (fileId: string, body: Record<string, unknown>) => {
    await fetch(`/api/dashboard/titles/${titleId}/attachments/${encodeURIComponent(fileId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await onRefresh()
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <p className="text-xs text-gray-500 uppercase tracking-widest">
        {isSeries ? 'Attached files (season / episode)' : 'Attached files (episode)'}
      </p>

      {isSeries && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-gray-500">Season:</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setAllSeason(n)}
              className="text-xs px-2 py-1 rounded border border-blue-800 text-blue-300"
            >
              {n}
            </button>
          ))}
          <input
            value={seasonInput}
            onChange={(e) => setSeasonInput(e.target.value)}
            placeholder="#"
            className="w-14 bg-gray-900 border border-gray-800 rounded px-1.5 py-1 text-xs"
          />
          <button
            onClick={() => seasonInput && setAllSeason(Number(seasonInput))}
            className="text-xs px-2 py-1 rounded border border-gray-700"
          >
            Set all
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={renumber} className="text-xs px-2 py-1 rounded border border-gray-700">
          🔢 Renumber 1…N
        </button>
        <button
          onClick={detachAll}
          disabled={detachingAll || attachments.length === 0}
          className="text-xs px-2 py-1 rounded border border-red-800 text-red-400 disabled:opacity-40"
        >
          {detachingAll ? 'Detaching…' : '🗑 Detach all'}
        </button>
        <span className="text-xs text-gray-500">{attachments.length} attached</span>
      </div>

      <div className="max-h-[62vh] overflow-y-auto flex flex-col gap-2">
        {attachments.length === 0 && <p className="text-xs text-gray-500">No files attached yet</p>}
        {attachments.map((a, idx) => {
          const quality = a.quality || 'SD'
          const siblingCount = groupCounts.get(groupKey(a)) || 1
          const isVariant = siblingCount > 1
          return (
            <div
              key={a.id}
              className={`bg-gray-900 border rounded-xl p-2.5 ${
                isVariant ? 'border-indigo-800/70' : 'border-gray-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-600">{idx + 1}.</span>
                <span className="font-semibold text-xs break-all flex-1">{a.drive_name}</span>
                <span className="text-[11px] text-gray-500 flex-shrink-0">{sizeMb(a.file_size)}</span>
              </div>

              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {isVariant && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-700 text-indigo-300">
                    ⧉ {siblingCount} versions
                  </span>
                )}
                <input
                  defaultValue={a.dj ?? ''}
                  placeholder="+ DJ"
                  title="DJ tag — same episode, alternate DJ cut"
                  onBlur={(e) => a.drive_id && patch(a.drive_id, { dj: e.target.value.trim() || null })}
                  className={`text-[10px] w-24 px-2 py-0.5 rounded-full border bg-transparent text-center focus:outline-none focus:border-purple-500 ${
                    a.dj ? 'border-purple-600 text-purple-300' : 'border-dashed border-gray-700 text-gray-500'
                  }`}
                />
                <button
                  onClick={() => a.drive_id && patch(a.drive_id, { quality: quality === 'HD' ? 'SD' : 'HD' })}
                  title="Toggle SD/HD — same episode, alternate quality cut"
                  className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${
                    quality === 'HD' ? 'border-emerald-600 text-emerald-400' : 'border-gray-700 text-gray-400'
                  }`}
                >
                  {quality}
                </button>
              </div>

              <div className="flex items-center gap-3 mt-1.5">
                <button onClick={() => setPlayingId(playingId === a.id ? null : a.id)} className="text-xs text-indigo-400">
                  ▶ Play
                </button>
                {a.view_url && (
                  <a href={a.view_url} target="_blank" rel="noreferrer" className="text-xs text-blue-400">
                    ↗ Drive
                  </a>
                )}
                <button onClick={() => a.drive_id && detach(a.drive_id)} className="text-xs text-red-400">
                  🗑 Detach
                </button>
              </div>
              {playingId === a.id && a.preview_url && (
                <iframe
                  src={a.preview_url}
                  allow="autoplay; fullscreen"
                  allowFullScreen
                  className="w-full mt-2 rounded-lg bg-black"
                  style={{ height: 260, border: 0 }}
                />
              )}
              <div className="flex items-center gap-2 mt-2">
                {isSeries && (
                  <input
                    type="number"
                    defaultValue={a.season ?? ''}
                    placeholder="S"
                    onBlur={(e) => a.drive_id && patch(a.drive_id, { season: e.target.value === '' ? null : Number(e.target.value) })}
                    className="w-16 bg-gray-950 border border-gray-800 rounded px-1.5 py-1 text-xs"
                  />
                )}
                <input
                  type="number"
                  defaultValue={a.episode_number ?? ''}
                  placeholder="E"
                  onBlur={(e) => a.drive_id && patch(a.drive_id, { episode_number: e.target.value === '' ? null : Number(e.target.value) })}
                  className="w-16 bg-gray-950 border border-gray-800 rounded px-1.5 py-1 text-xs"
                />
                <input
                  defaultValue={a.label ?? ''}
                  placeholder="label"
                  onBlur={(e) => a.drive_id && patch(a.drive_id, { label: e.target.value })}
                  className="flex-1 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs"
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
