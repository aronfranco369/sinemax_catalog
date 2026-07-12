'use client'

import { useMemo, useState } from 'react'
import type { AttachmentRow } from '@/lib/dashboardTypes'

function sizeMb(bytes: number | null): string {
  return bytes ? `${Math.round(bytes / 1048576)} MB` : ''
}

// A movie variant is one episode_number. Files that share a number belong to
// the same variant (its parts and/or SD/HD cuts); a different number is a
// different variant. Files with no number yet are collected under key 0.
function variantGroups(attachments: AttachmentRow[]): { number: number; atts: AttachmentRow[] }[] {
  const byNumber = new Map<number, AttachmentRow[]>()
  const order: number[] = []
  for (const a of attachments) {
    const n = a.episode_number ?? 0
    if (!byNumber.has(n)) {
      byNumber.set(n, [])
      order.push(n)
    }
    byNumber.get(n)!.push(a)
  }
  return order.map((n) => ({ number: n, atts: byNumber.get(n)! }))
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

  const groups = useMemo(() => variantGroups(attachments), [attachments])
  // A movie carries per-variant DJs only when it actually has more than one
  // variant; a single-variant movie (and every series) keeps its DJ on top.
  const multiVariant = !isSeries && groups.filter((g) => g.number > 0).length > 1

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

  const patchFile = (fileId: string, body: Record<string, unknown>) =>
    fetch(`/api/dashboard/titles/${titleId}/attachments/${encodeURIComponent(fileId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  const patch = async (fileId: string, body: Record<string, unknown>) => {
    await patchFile(fileId, body)
    await onRefresh()
  }

  // Set one DJ on every file of a variant — the DJ is a property of the variant,
  // not the individual part/quality file.
  const setVariantDj = async (atts: AttachmentRow[], value: string) => {
    const dj = value.trim() || null
    await Promise.all(atts.filter((a) => a.drive_id).map((a) => patchFile(a.drive_id!, { dj })))
    await onRefresh()
  }

  const fileControls = (a: AttachmentRow, idx: number) => {
    const quality = a.quality || 'SD'
    return (
      <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-xl p-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-600">{idx + 1}.</span>
          <span className="font-semibold text-xs break-all flex-1">{a.drive_name}</span>
          <span className="text-[11px] text-gray-500 flex-shrink-0">{sizeMb(a.file_size)}</span>
        </div>

        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <button
            onClick={() => a.drive_id && patch(a.drive_id, { quality: quality === 'HD' ? 'SD' : 'HD' })}
            title="Toggle SD/HD — same variant, alternate quality"
            className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${
              quality === 'HD' ? 'border-emerald-600 text-emerald-400' : 'border-gray-700 text-gray-400'
            }`}
          >
            {quality}
          </button>
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
              title="Season"
              onBlur={(e) => a.drive_id && patch(a.drive_id, { season: e.target.value === '' ? null : Number(e.target.value) })}
              className="w-14 bg-gray-950 border border-gray-800 rounded px-1.5 py-1 text-xs"
            />
          )}
          <input
            type="number"
            defaultValue={a.episode_number ?? ''}
            placeholder={isSeries ? 'Ep' : 'Var'}
            title={isSeries ? 'Episode number' : 'Variant number — same number = parts of one variant'}
            onBlur={(e) => a.drive_id && patch(a.drive_id, { episode_number: e.target.value === '' ? null : Number(e.target.value) })}
            className="w-16 bg-gray-950 border border-gray-800 rounded px-1.5 py-1 text-xs"
          />
          <input
            defaultValue={a.label ?? ''}
            placeholder={isSeries ? 'label' : 'part label (optional)'}
            onBlur={(e) => a.drive_id && patch(a.drive_id, { label: e.target.value })}
            className="flex-1 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <p className="text-xs text-gray-500 uppercase tracking-widest">
        {isSeries ? 'Attached files (season / episode)' : 'Attached files (variant / parts)'}
      </p>

      {!isSeries && (
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Give each file a <span className="text-gray-300">variant number</span>. A unique number is a new variant
          (e.g. another DJ). The <span className="text-gray-300">same number repeated</span> means the movie is split
          into parts under that one variant.
        </p>
      )}

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

        {/* Series: one flat list of episodes (variants come only from cloning). */}
        {isSeries && attachments.map((a, idx) => fileControls(a, idx))}

        {/* Movies: grouped by variant number, with the DJ owned by the variant. */}
        {!isSeries &&
          groups.map((g) => {
            const groupDj = g.atts.find((a) => (a.dj || '').trim())?.dj ?? ''
            const isParts = g.atts.length > 1
            return (
              <div
                key={g.number}
                className={`rounded-xl border p-2 flex flex-col gap-2 ${
                  multiVariant ? 'border-indigo-800/70 bg-indigo-950/10' : 'border-gray-800'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">
                    {g.number > 0 ? `Variant #${g.number}` : 'No variant number'}
                  </span>
                  {isParts && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-gray-700 text-gray-400">
                      {g.atts.length} parts
                    </span>
                  )}
                  {multiVariant && (
                    <input
                      key={groupDj}
                      defaultValue={groupDj}
                      placeholder="+ DJ for this variant"
                      title="DJ for this variant — applies to all its files"
                      onBlur={(e) => setVariantDj(g.atts, e.target.value)}
                      className={`text-[11px] w-40 px-2 py-0.5 rounded-full border bg-transparent focus:outline-none focus:border-purple-500 ${
                        groupDj ? 'border-purple-600 text-purple-300' : 'border-dashed border-gray-700 text-gray-500'
                      }`}
                    />
                  )}
                </div>
                <div className="flex flex-col gap-2">{g.atts.map((a, idx) => fileControls(a, idx))}</div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
