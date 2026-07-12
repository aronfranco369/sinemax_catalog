'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AiGroupItem, AiGroupExcluded, DriveFileHit } from '@/lib/dashboardTypes'

function sizeMb(bytes: number | null | undefined): string {
  return bytes ? `${Math.round(bytes / 1048576)} MB` : ''
}

const cell = 'bg-gray-950 border border-gray-800 rounded px-1.5 py-1 text-xs focus:outline-none focus:border-indigo-600'

export default function AiAutomateOverlay({
  files,
  isSeries,
  titleName,
  onApply,
  onClose,
}: {
  files: DriveFileHit[]
  isSeries: boolean
  titleName: string
  onApply: (items: AiGroupItem[], replace: boolean) => Promise<void>
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState('')
  const [rows, setRows] = useState<AiGroupItem[]>([])
  const [excluded, setExcluded] = useState<AiGroupExcluded[]>([])
  const [replace, setReplace] = useState(false)
  const [applying, setApplying] = useState(false)

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/drive/ai-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isSeries,
          titleName,
          files: files.map((f) => ({ id: f.id, name: f.name, path: f.path, size: f.size })),
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || `AI grouping failed (${res.status})`)
        return
      }
      setSummary(data.summary || '')
      setRows(data.groups || [])
      setExcluded(data.excluded || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI grouping failed')
    } finally {
      setLoading(false)
    }
  }, [files, isSeries, titleName])

  useEffect(() => {
    run()
  }, [run])

  // Rows sharing (season, episode, part) are variants of one another — same
  // logic the attachments panel uses, so the reviewer sees them flagged here.
  const variantKeys = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(`${r.season ?? ''}-${r.episode_number ?? ''}-${r.part ?? ''}`, 0)
    for (const r of rows) {
      const k = `${r.season ?? ''}-${r.episode_number ?? ''}-${r.part ?? ''}`
      counts.set(k, (counts.get(k) || 0) + 1)
    }
    return counts
  }, [rows])

  const setRow = (i: number, patch: Partial<AiGroupItem>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const removeRow = (i: number) =>
    setRows((rs) => {
      const r = rs[i]
      setExcluded((ex) => [...ex, { file_id: r.file_id, drive_name: r.drive_name, reason: 'removed by curator' }])
      return rs.filter((_, idx) => idx !== i)
    })

  const includeExcluded = (i: number) =>
    setExcluded((ex) => {
      const e = ex[i]
      const f = files.find((x) => x.id === e.file_id)
      setRows((rs) => [
        ...rs,
        {
          file_id: e.file_id,
          drive_name: e.drive_name,
          drive_path: f?.path ?? null,
          size: f?.size ?? null,
          season: isSeries ? 1 : null,
          episode_number: null,
          part: null,
          quality: 'SD',
          dj: null,
          label: isSeries ? 'Episode' : titleName || 'Episode 1',
          note: 'added back by curator',
        },
      ])
      return ex.filter((_, idx) => idx !== i)
    })

  const approve = async () => {
    if (rows.length === 0) return
    setApplying(true)
    try {
      await onApply(rows, replace)
      onClose()
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-start justify-center overflow-y-auto p-4">
      <div className="w-full max-w-5xl bg-gray-900 border border-gray-800 rounded-2xl p-5 my-6">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-semibold">🤖 AI grouping — review &amp; approve</h3>
          <div className="flex-1" />
          <button onClick={run} disabled={loading || applying} className="text-xs px-2 py-1 rounded border border-gray-700 disabled:opacity-40">
            ↻ Re-run
          </button>
          <button onClick={onClose} className="text-xs px-2 py-1.5 rounded-lg border border-gray-700 text-gray-400">
            ✕
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-3 py-10 justify-center text-gray-400 text-sm">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Analyzing {files.length} file(s)…
          </div>
        )}

        {!loading && error && (
          <div className="text-xs p-2">
            <p className="text-red-400">Couldn&apos;t group: {error}</p>
            <button onClick={run} className="text-indigo-400 underline mt-1">Retry</button>
          </div>
        )}

        {!loading && !error && (
          <>
            {summary && <p className="text-xs text-gray-400 mb-3">{summary}</p>}

            <div className="max-h-[52vh] overflow-y-auto rounded-lg border border-gray-800">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-950 text-gray-500">
                  <tr className="text-left">
                    <th className="p-2 font-medium">File</th>
                    {isSeries && <th className="p-2 font-medium w-12">S</th>}
                    <th className="p-2 font-medium w-12">Ep</th>
                    <th className="p-2 font-medium w-14">Part</th>
                    <th className="p-2 font-medium w-14">Qual</th>
                    <th className="p-2 font-medium w-28">DJ</th>
                    <th className="p-2 font-medium">Label</th>
                    <th className="p-2 font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const key = `${r.season ?? ''}-${r.episode_number ?? ''}-${r.part ?? ''}`
                    const isVariant = (variantKeys.get(key) || 0) > 1
                    return (
                      <tr key={r.file_id} className={`border-t border-gray-800 ${isVariant ? 'bg-indigo-950/30' : ''}`}>
                        <td className="p-2 align-top">
                          <div className="break-all font-medium">{r.drive_name}</div>
                          <div className="text-[10px] text-gray-600 break-all">{r.drive_path}</div>
                          <div className="text-[10px] text-gray-500 flex items-center gap-2">
                            {sizeMb(r.size)}
                            {isVariant && <span className="text-indigo-400">⧉ variant</span>}
                            {r.note && <span className="text-gray-600 italic">{r.note}</span>}
                          </div>
                        </td>
                        {isSeries && (
                          <td className="p-2 align-top">
                            <input
                              type="number"
                              value={r.season ?? ''}
                              onChange={(e) => setRow(i, { season: e.target.value === '' ? null : Number(e.target.value) })}
                              className={`${cell} w-11`}
                            />
                          </td>
                        )}
                        <td className="p-2 align-top">
                          <input
                            type="number"
                            value={r.episode_number ?? ''}
                            onChange={(e) => setRow(i, { episode_number: e.target.value === '' ? null : Number(e.target.value) })}
                            className={`${cell} w-11`}
                          />
                        </td>
                        <td className="p-2 align-top">
                          <input
                            value={r.part ?? ''}
                            placeholder="—"
                            onChange={(e) => setRow(i, { part: e.target.value.trim().toUpperCase() || null })}
                            className={`${cell} w-12`}
                          />
                        </td>
                        <td className="p-2 align-top">
                          <button
                            onClick={() => setRow(i, { quality: r.quality === 'HD' ? 'SD' : 'HD' })}
                            className={`text-[11px] px-2 py-1 rounded-full border ${
                              r.quality === 'HD' ? 'border-emerald-600 text-emerald-400' : 'border-gray-700 text-gray-400'
                            }`}
                          >
                            {r.quality === 'HD' ? 'HD' : 'SD'}
                          </button>
                        </td>
                        <td className="p-2 align-top">
                          <input
                            value={r.dj ?? ''}
                            placeholder="—"
                            onChange={(e) => setRow(i, { dj: e.target.value.trim() || null })}
                            className={`${cell} w-24`}
                          />
                        </td>
                        <td className="p-2 align-top">
                          <input
                            value={r.label}
                            onChange={(e) => setRow(i, { label: e.target.value })}
                            className={`${cell} w-full`}
                          />
                        </td>
                        <td className="p-2 align-top">
                          <button onClick={() => removeRow(i)} className="text-red-400" title="Remove">🗑</button>
                        </td>
                      </tr>
                    )
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={isSeries ? 8 : 7} className="p-4 text-center text-gray-500">
                        No files grouped. Adjust your search and re-run.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {excluded.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-1">Excluded ({excluded.length})</p>
                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                  {excluded.map((e, i) => (
                    <div key={e.file_id} className="flex items-center gap-2 text-[11px] text-gray-500">
                      <span className="break-all flex-1">{e.drive_name}</span>
                      <span className="text-gray-600 italic flex-shrink-0">{e.reason}</span>
                      <button onClick={() => includeExcluded(i)} className="text-emerald-400 flex-shrink-0">+ include</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-gray-400">
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                Replace existing attachments first
              </label>
              <div className="flex-1" />
              <span className="text-xs text-gray-500">{rows.length} to attach</span>
              <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg border border-gray-700">
                Cancel
              </button>
              <button
                onClick={approve}
                disabled={applying || rows.length === 0}
                className="text-xs px-3 py-1.5 rounded-lg bg-green-800 disabled:opacity-40"
              >
                {applying ? 'Attaching…' : `✓ Approve & attach`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
