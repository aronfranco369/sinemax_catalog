'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AttachmentRow } from '@/lib/dashboardTypes'

function sizeMb(bytes: number | null): string {
  return bytes ? `${Math.round(bytes / 1048576)} MB` : ''
}

// Sentinel for the "Others" DJ chip — selects episodes that carry no DJ string.
// A control character keeps it from ever colliding with a real DJ name.
const OTHERS_DJ = '\u0000others'

// Pill styling for the series season / variant nav — filled when selected.
function navPill(active: boolean): string {
  return `text-xs px-2.5 py-0.5 rounded-full border ${
    active ? 'border-indigo-500 bg-indigo-600/30 text-indigo-200' : 'border-gray-700 text-gray-400'
  }`
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
  onAttachTargetChange,
  onRefresh,
}: {
  titleId: number
  isSeries: boolean
  attachments: AttachmentRow[]
  onAttachTargetChange: (target: { season: number | null; dj: string | null }) => void
  onRefresh: () => Promise<void>
}) {
  const [seasonInput, setSeasonInput] = useState<string>('')
  const [playingId, setPlayingId] = useState<number | null>(null)
  const [detachingAll, setDetachingAll] = useState(false)
  // Which movie variant group is mid-detach, keyed by its variant number, so
  // only that card's button shows a spinner.
  const [detachingVariant, setDetachingVariant] = useState<number | null>(null)
  // Series navigation filters: which season and which DJ variant are in view.
  // null means "all". These only surface once a series spans more than one
  // season / DJ, so a simple title stays a flat list.
  const [selSeason, setSelSeason] = useState<number | null>(null)
  const [selDj, setSelDj] = useState<string | null>(null)
  // Bulk DJ entry: stamp one DJ onto every episode currently in view.
  const [bulkDj, setBulkDj] = useState('')
  const [applyingDj, setApplyingDj] = useState(false)

  const groups = useMemo(() => variantGroups(attachments), [attachments])
  // A movie carries per-variant DJs only when it actually has more than one
  // variant; a single-variant movie (and every series) keeps its DJ on top.
  const multiVariant = !isSeries && groups.filter((g) => g.number > 0).length > 1

  // Distinct seasons present on the attachments, used to decide whether the
  // season navigation row is worth showing (only for >1 season).
  const seasons = useMemo(() => {
    const s = new Set<number>()
    for (const a of attachments) if (a.season != null) s.add(a.season)
    return [...s].sort((x, y) => x - y)
  }, [attachments])

  // Distinct DJs within the currently selected season (or across the whole
  // title when no season is picked). The DJ variant row shows only for >1 DJ.
  const djs = useMemo(() => {
    const d = new Set<string>()
    for (const a of attachments) {
      if (selSeason != null && a.season !== selSeason) continue
      const dj = (a.dj || '').trim()
      if (dj) d.add(dj)
    }
    return [...d].sort((x, y) => x.localeCompare(y))
  }, [attachments, selSeason])

  // Whether the current season has any episode with an empty DJ. These would
  // otherwise only be reachable through "All"; the "Others" chip isolates them.
  const hasOthers = useMemo(() => {
    for (const a of attachments) {
      if (selSeason != null && a.season !== selSeason) continue
      if (!(a.dj || '').trim()) return true
    }
    return false
  }, [attachments, selSeason])

  // Show the DJ / variant row when there's more than one named DJ, or when a
  // single named DJ coexists with untagged episodes (so "Others" can split them).
  const showDjRow = djs.length > 1 || (djs.length >= 1 && hasOthers)

  // The episodes actually rendered — narrowed to the picked season + DJ. The
  // "Others" selection keeps only the episodes whose DJ string is empty.
  const visible = useMemo(
    () =>
      attachments.filter((a) => {
        if (selSeason != null && a.season !== selSeason) return false
        if (selDj != null) {
          const dj = (a.dj || '').trim()
          if (selDj === OTHERS_DJ ? dj !== '' : dj !== selDj) return false
        }
        return true
      }),
    [attachments, selSeason, selDj]
  )

  // Drop a selection that no longer matches any tagged file so the list never
  // silently hides everything. Guarded by length > 0 so a season picked on an
  // untagged set (e.g. right after "Set all") survives as the attach target.
  useEffect(() => {
    if (selSeason != null && seasons.length > 0 && !seasons.includes(selSeason)) setSelSeason(null)
  }, [seasons, selSeason])
  useEffect(() => {
    if (selDj == null) return
    // "Others" survives as long as some untagged episode remains; a named DJ
    // survives as long as it still tags a file in view.
    if (selDj === OTHERS_DJ) {
      if (!hasOthers) setSelDj(null)
    } else if (djs.length > 0 && !djs.includes(selDj)) {
      setSelDj(null)
    }
  }, [djs, selDj, hasOthers])

  // Keep the parent's attach target in sync with the in-view season / DJ, so
  // newly attached files inherit exactly what the user is looking at.
  useEffect(() => {
    // "Others" means "no DJ", so files attached under it inherit an empty DJ.
    if (isSeries) onAttachTargetChange({ season: selSeason, dj: selDj === OTHERS_DJ ? null : selDj })
    else onAttachTargetChange({ season: null, dj: null })
  }, [isSeries, selSeason, selDj, onAttachTargetChange])

  const setAllSeason = async (n: number) => {
    // Stamping every file with a season also makes that season the one in view
    // (and thus the attach target) — reported via the selSeason effect above.
    setSelSeason(n)
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

  // Detach honours the active view: with a season/variant filter on, only the
  // episodes in view go; with no filter it clears the whole title in one call.
  const detachAll = async () => {
    const filtered = visible.length !== attachments.length
    const targets = filtered ? visible : attachments
    if (targets.length === 0) return
    const msg = filtered
      ? `Detach the ${targets.length} file(s) currently shown? The rest of the title stays attached.`
      : `Detach all ${attachments.length} file(s)? This starts the attachments fresh.`
    if (!confirm(msg)) return
    setDetachingAll(true)
    try {
      if (filtered) {
        await Promise.all(
          targets
            .filter((a) => a.drive_id)
            .map((a) =>
              fetch(`/api/dashboard/titles/${titleId}/attachments/${encodeURIComponent(a.drive_id!)}`, {
                method: 'DELETE',
              })
            )
        )
      } else {
        await fetch(`/api/dashboard/titles/${titleId}/attachments`, { method: 'DELETE' })
      }
      await onRefresh()
    } finally {
      setDetachingAll(false)
    }
  }

  // Detach every file of one movie variant (all its parts / cuts) in a single
  // action, leaving the title's other variants untouched.
  const detachVariant = async (number: number, atts: AttachmentRow[]) => {
    const targets = atts.filter((a) => a.drive_id)
    if (targets.length === 0) return
    const label = number > 0 ? `Variant #${number}` : 'the un-numbered variant'
    if (!confirm(`Detach all ${targets.length} file(s) of ${label}? Other variants stay attached.`)) return
    setDetachingVariant(number)
    try {
      await Promise.all(
        targets.map((a) =>
          fetch(`/api/dashboard/titles/${titleId}/attachments/${encodeURIComponent(a.drive_id!)}`, {
            method: 'DELETE',
          })
        )
      )
      await onRefresh()
    } finally {
      setDetachingVariant(null)
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

  // Stamp the typed DJ onto every episode currently in view (respecting the
  // active season / variant filter), so a whole season can be tagged at once
  // instead of pasting the DJ into each episode row.
  const applyBulkDj = async () => {
    const dj = bulkDj.trim()
    if (!dj || visible.length === 0) return
    setApplyingDj(true)
    try {
      await Promise.all(visible.filter((a) => a.drive_id).map((a) => patchFile(a.drive_id!, { dj })))
      await onRefresh()
      setBulkDj('')
    } finally {
      setApplyingDj(false)
    }
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
          {isSeries && (
            <input
              key={a.dj ?? ''}
              defaultValue={a.dj ?? ''}
              placeholder="DJ"
              title="DJ / voiceover for this episode — used to group variants"
              onBlur={(e) => a.drive_id && patch(a.drive_id, { dj: e.target.value.trim() || null })}
              className="w-24 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs"
            />
          )}
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
          {detachingAll
            ? 'Detaching…'
            : visible.length !== attachments.length
              ? `🗑 Detach shown (${visible.length})`
              : '🗑 Detach all'}
        </button>
        <span className="text-xs text-gray-500">
          {isSeries && visible.length !== attachments.length
            ? `${visible.length} of ${attachments.length} attached`
            : `${attachments.length} attached`}
        </span>
      </div>

      {/* Series navigation: a season row (only when the title spans more than
          one season) over a DJ-variant row (only when a season has more than
          one DJ). Selecting narrows the list and the count above. */}
      {isSeries && (seasons.length > 1 || showDjRow) && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-gray-800 bg-gray-950/40 p-2">
          {seasons.length > 1 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] text-gray-500 w-12 flex-shrink-0">Season</span>
              <button onClick={() => setSelSeason(null)} className={navPill(selSeason === null)}>
                All
              </button>
              {seasons.map((s) => (
                <button key={s} onClick={() => setSelSeason(s)} className={navPill(selSeason === s)}>
                  S{s}
                </button>
              ))}
            </div>
          )}
          {showDjRow && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] text-gray-500 w-12 flex-shrink-0">Variant</span>
              <button onClick={() => setSelDj(null)} className={navPill(selDj === null)}>
                All
              </button>
              {djs.map((d) => (
                <button key={d} onClick={() => setSelDj(d)} className={navPill(selDj === d)}>
                  {d}
                </button>
              ))}
              {/* Only when some episodes carry no DJ — lets them be reached on
                  their own instead of being buried inside "All". */}
              {hasOthers && (
                <button
                  onClick={() => setSelDj(OTHERS_DJ)}
                  className={navPill(selDj === OTHERS_DJ)}
                  title="Episodes with no DJ set"
                >
                  Others
                </button>
              )}
            </div>
          )}
          {(selSeason != null || selDj != null) && (
            <p className="text-[11px] text-emerald-400/80">
              + Attach adds new files to
              {selSeason != null ? ` Season ${selSeason}` : ' all seasons'}
              {selDj != null ? (selDj === OTHERS_DJ ? ' · no DJ' : ` · ${selDj}`) : ''}
            </p>
          )}
        </div>
      )}

      {/* Bulk-tag every episode currently in view with one DJ — useful after
          filtering to a season whose episodes are missing their DJ. */}
      {isSeries && attachments.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-gray-500 flex-shrink-0">
            Set DJ for all shown{visible.length !== attachments.length ? ` (${visible.length})` : ''}:
          </span>
          <input
            value={bulkDj}
            onChange={(e) => setBulkDj(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyBulkDj()}
            placeholder="DJ name"
            className="w-32 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={applyBulkDj}
            disabled={applyingDj || !bulkDj.trim() || visible.length === 0}
            className="text-xs px-2.5 py-1 rounded border border-purple-700 text-purple-300 disabled:opacity-40"
          >
            {applyingDj ? 'Applying…' : 'Apply to all shown'}
          </button>
        </div>
      )}

      <div className="max-h-[62vh] overflow-y-auto flex flex-col gap-2">
        {attachments.length === 0 && <p className="text-xs text-gray-500">No files attached yet</p>}
        {isSeries && attachments.length > 0 && visible.length === 0 && (
          <p className="text-xs text-gray-500">No files match the selected season / variant</p>
        )}

        {/* Series: flat episode list, narrowed by the season / DJ nav above. */}
        {isSeries && visible.map((a, idx) => fileControls(a, idx))}

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
                  {/* Only worth offering when other variants remain — otherwise
                      the top "Detach all" already covers it. Removes this
                      variant's parts/cuts in one click. */}
                  {groups.length > 1 && (
                    <button
                      onClick={() => detachVariant(g.number, g.atts)}
                      disabled={detachingVariant !== null}
                      title="Detach this variant and all its parts"
                      className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-red-800/70 text-red-300 hover:bg-red-950/40 disabled:opacity-40"
                    >
                      {detachingVariant === g.number ? 'Detaching…' : '🗑 Detach variant'}
                    </button>
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
