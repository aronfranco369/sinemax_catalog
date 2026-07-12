'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Candidate, TitleWithAttachments } from '@/lib/dashboardTypes'
import { validateForPublish, hasVariants, type ValTitle, type ValAtt } from '@/lib/validateTitle'
import DriveAttachPanel from './DriveAttachPanel'
import AttachedFilesList from './AttachedFilesList'
import CandidateGrid from './CandidateGrid'

type Fields = {
  matched_title: string
  type: string
  year: string
  country: string
  dj: string
  poster_url: string
  genres: string
  tags: string
  synopsis: string
  synopsis_sw: string
}

function fieldsFrom(m: TitleWithAttachments): Fields {
  return {
    matched_title: m.matched_title || m.raw_title || '',
    type: m.type === 'tv' ? 'series' : m.type || 'movie',
    year: m.year || '',
    country: m.country || '',
    dj: m.dj || '',
    poster_url: m.poster_url || '',
    genres: m.genres || '',
    tags: m.tags || '',
    synopsis: m.synopsis || '',
    synopsis_sw: m.synopsis_sw || '',
  }
}

const inputCls = 'w-full bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-700'
const labelCls = 'text-[11px] text-gray-500 mb-1 block'

export default function TitleEditor({
  titleId,
  onClose,
  onSaved,
  onOpenTitle,
}: {
  titleId: number
  onClose: () => void
  onSaved: () => void
  onOpenTitle: (id: number) => void
}) {
  const [m, setM] = useState<TitleWithAttachments | null>(null)
  const [fields, setFields] = useState<Fields | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState<string | null>(null)
  const [trailerOpen, setTrailerOpen] = useState(false)
  const [trailerLoading, setTrailerLoading] = useState(false)
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null)
  const [season, setSeason] = useState<number | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/dashboard/titles/${titleId}`)
    const data = (await res.json()) as TitleWithAttachments
    setM(data)
    setFields(fieldsFrom(data))
    setTrailerOpen(false)
    setTrailerUrl(null)
    setSeason(null)
    setLoading(false)
  }, [titleId])

  useEffect(() => {
    load()
  }, [load])

  const refreshAttachments = useCallback(async () => {
    const res = await fetch(`/api/dashboard/titles/${titleId}`)
    const data = (await res.json()) as TitleWithAttachments
    setM((prev) => (prev ? { ...prev, attachments: data.attachments } : data))
  }, [titleId])

  const setField = (k: keyof Fields, v: string) => setFields((f) => (f ? { ...f, [k]: v } : f))

  // Assemble the shape the validator/publish logic reasons about from the
  // current form + attachments. When a movie has multiple variants the DJ lives
  // on each variant (in the files panel), so the top-level DJ is dropped.
  const valInputs = (f: Fields): { title: ValTitle; atts: ValAtt[]; multi: boolean; fields: Fields } => {
    const atts: ValAtt[] = (m?.attachments || []).map((a) => ({ episode_number: a.episode_number, dj: a.dj }))
    const base: ValTitle = {
      type: f.type === 'series' ? 'series' : 'movie',
      country: f.country,
      synopsis_sw: f.synopsis_sw,
      dj: f.dj,
      matched_title: f.matched_title,
      raw_title: m?.raw_title ?? null,
    }
    const multi = hasVariants(base, atts)
    const fields = multi ? { ...f, dj: '' } : f
    return { title: { ...base, dj: fields.dj }, atts, multi, fields }
  }

  const save = async (markReady: boolean) => {
    if (!fields) return
    const { title, atts, fields: f } = valInputs(fields)
    if (markReady) {
      const probs = validateForPublish(title, atts)
      if (probs.length) {
        setProblems(probs)
        return
      }
    }
    setProblems([])
    setSaving(true)
    const body: Record<string, unknown> = { ...f }
    if (markReady) body.catalog_status = 'ready'
    const res = await fetch(`/api/dashboard/titles/${titleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setProblems([data.error || 'Save failed'])
      return
    }
    onSaved()
    if (markReady) {
      // Marking ready is a "done with this title" action — close the editor
      // and return to the catalog. Re-open the title later to add a variant.
      onClose()
    } else {
      setFields(f)
      setM((prev) => (prev ? { ...prev, ...f } : prev))
    }
  }

  // Publish straight from the editor: persist + mark ready + publish, then close
  // the tab so the title drops out of the ready catalog into Published.
  const doPublish = async () => {
    if (!fields) return
    const { title, atts, fields: f } = valInputs(fields)
    const probs = validateForPublish(title, atts)
    if (probs.length) {
      setProblems(probs)
      return
    }
    setProblems([])
    setPublishing(true)
    setPublishMsg(null)
    try {
      const patchRes = await fetch(`/api/dashboard/titles/${titleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, catalog_status: 'ready' }),
      })
      if (!patchRes.ok) {
        const data = await patchRes.json().catch(() => ({}))
        setPublishMsg(data.error || 'Save failed')
        return
      }
      const res = await fetch(`/api/dashboard/titles/${titleId}/publish`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setPublishMsg(data.error || 'Publish failed')
        return
      }
      onSaved()
      onClose()
    } catch (e) {
      setPublishMsg(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  const applyCandidate = async (c: Candidate) => {
    await fetch(`/api/dashboard/titles/${titleId}/resolve-candidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate: c }),
    })
    onSaved()
    await load()
  }

  const addVariant = async () => {
    const res = await fetch(`/api/dashboard/titles/${titleId}/variant`, { method: 'POST' })
    const data = await res.json()
    if (data.id) {
      onSaved()
      onOpenTitle(data.id)
    }
  }

  const translate = async () => {
    if (!fields || !fields.synopsis.trim()) return
    setTranslating(true)
    setTranslateError(null)
    try {
      const res = await fetch('/api/dashboard/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fields.synopsis }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setTranslateError(data.error || `Translation failed (${res.status})`)
        return
      }
      if (data.result) setField('synopsis_sw', data.result)
    } catch (e) {
      setTranslateError(e instanceof Error ? e.message : 'Translation failed')
    } finally {
      setTranslating(false)
    }
  }

  const toggleTrailer = async () => {
    if (trailerOpen) {
      setTrailerOpen(false)
      return
    }
    if (!m?.tmdb_id) return
    setTrailerLoading(true)
    const type = fields?.type === 'series' ? 'tv' : 'movie'
    const res = await fetch(`/api/dashboard/trailer?type=${type}&tmdbId=${m.tmdb_id}`)
    const data = await res.json()
    setTrailerLoading(false)
    setTrailerUrl(data.embed_url || null)
    setTrailerOpen(true)
  }

  const attachFiles = async (files: { id: string; name: string }[]) => {
    await fetch(`/api/dashboard/titles/${titleId}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: files.map((f) => ({ file_id: f.id, name: f.name })), season }),
    })
    await refreshAttachments()
  }

  const dismissNotes = async () => {
    setM((prev) => (prev ? { ...prev, review_notes: null } : prev))
    await fetch(`/api/dashboard/titles/${titleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_notes: null }),
    })
  }

  if (loading || !m || !fields) {
    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isSeries = fields.type === 'series'
  const multiVariant = valInputs(fields).multi
  const attachedIds = new Set((m.attachments || []).map((a) => a.drive_id).filter((x): x is string => !!x))
  const candidates = m.candidates_json || []
  const canPublish = m.catalog_status === 'ready' || m.catalog_status === 'published'

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="w-full max-w-6xl bg-gray-900 border border-gray-800 rounded-2xl p-5 my-6">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-base font-semibold truncate">{m.matched_title || m.raw_title}</h2>
          <div className="flex-1" />
          <button onClick={onClose} className="text-xs px-2 py-1.5 rounded-lg border border-gray-700 text-gray-400">
            ✕
          </button>
        </div>

        {m.review_notes && (
          <div className="mb-4 rounded-xl border border-amber-700/60 bg-amber-950/30 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-amber-300">🤖 AI review notes — check before publishing</span>
              <div className="flex-1" />
              <button onClick={dismissNotes} className="text-[11px] px-2 py-0.5 rounded border border-amber-700/60 text-amber-300/80">
                Dismiss
              </button>
            </div>
            <p className="text-xs text-amber-100/90 whitespace-pre-wrap leading-relaxed">{m.review_notes}</p>
          </div>
        )}

        <div className="flex gap-5 flex-col sm:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fields.poster_url || ''}
            alt=""
            className="w-[140px] h-[210px] object-cover rounded-lg bg-gray-800 flex-shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="grid grid-cols-2 gap-3 flex-1">
            <div className="col-span-2">
              <label className={labelCls}>Title (raw: {m.raw_title})</label>
              <input className={inputCls} value={fields.matched_title} onChange={(e) => setField('matched_title', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <select className={inputCls} value={fields.type} onChange={(e) => setField('type', e.target.value)}>
                <option value="movie">movie</option>
                <option value="series">series</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Year</label>
              <input className={inputCls} value={fields.year} onChange={(e) => setField('year', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Country</label>
              <input className={inputCls} value={fields.country} onChange={(e) => setField('country', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>
                DJ / voiceover{m.removed_text ? ` (removed: ${m.removed_text})` : ''}
              </label>
              {multiVariant ? (
                <p className="text-[11px] text-indigo-300/80 bg-indigo-950/30 border border-indigo-900 rounded-lg px-2.5 py-1.5">
                  Multiple variants — set the DJ on each variant in the files panel below.
                </p>
              ) : (
                <input className={inputCls} value={fields.dj} onChange={(e) => setField('dj', e.target.value)} />
              )}
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Poster image URL</label>
              <input className={inputCls} value={fields.poster_url} onChange={(e) => setField('poster_url', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Genres (comma)</label>
              <input className={inputCls} value={fields.genres} onChange={(e) => setField('genres', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Tags (comma)</label>
              <input className={inputCls} value={fields.tags} onChange={(e) => setField('tags', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Synopsis (English — TMDb source)</label>
              <textarea
                className={`${inputCls} min-h-[64px]`}
                value={fields.synopsis}
                onChange={(e) => setField('synopsis', e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <div className="flex items-center">
                <label className={labelCls}>Description (Swahili — shown in app)</label>
                <div className="flex-1" />
                <button
                  onClick={translate}
                  disabled={translating}
                  className="text-[11px] px-2 py-1 rounded border border-gray-700 text-gray-300 disabled:opacity-50"
                >
                  {translating ? 'Translating…' : 'Translate'}
                </button>
              </div>
              {translateError && (
                <p className="text-[11px] text-red-400 mb-1">Couldn&apos;t translate: {translateError}</p>
              )}
              <textarea
                className={`${inputCls} min-h-[64px]`}
                value={fields.synopsis_sw}
                placeholder="Click Translate to generate, or type Swahili here…"
                onChange={(e) => setField('synopsis_sw', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs text-gray-500">
            status: {m.status} · score {m.score ?? ''}
          </span>
          <div className="flex-1" />
          {m.tmdb_id && (
            <button onClick={toggleTrailer} className="text-xs px-3 py-1.5 rounded-lg border border-gray-700">
              {trailerLoading ? 'Loading…' : '▶ Trailer'}
            </button>
          )}
          {m.catalog_status === 'ready' && (
            <button onClick={addVariant} className="text-xs px-3 py-1.5 rounded-lg border border-blue-700 text-blue-300">
              ⑂ New variant (clone title)
            </button>
          )}
          <button onClick={() => save(false)} disabled={saving} className="text-xs px-3 py-1.5 rounded-lg border border-gray-700">
            Save
          </button>
          <button onClick={() => save(true)} disabled={saving} className="text-xs px-3 py-1.5 rounded-lg bg-green-800">
            Save &amp; mark ready
          </button>
          {canPublish && (
            <button
              onClick={doPublish}
              disabled={publishing || saving}
              title="Save, mark ready, and publish to the app"
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-800 disabled:opacity-50"
            >
              {publishing ? 'Publishing…' : '📤 Publish'}
            </button>
          )}
        </div>

        {problems.length > 0 && (
          <div className="mt-3 rounded-xl border border-orange-700/60 bg-orange-950/30 p-3">
            <p className="text-xs font-semibold text-orange-300 mb-1">Missing details — fix before publishing:</p>
            <ul className="list-disc list-inside text-xs text-orange-100/90 space-y-0.5">
              {problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {publishMsg && (
          <p className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-orange-700 text-orange-300">⚠ {publishMsg}</p>
        )}

        {trailerOpen && (
          <div className="mt-2">
            {trailerUrl ? (
              <iframe src={trailerUrl} allowFullScreen className="w-full rounded-lg" style={{ height: 300, border: 0 }} />
            ) : (
              <p className="text-xs text-gray-500">no trailer</p>
            )}
          </div>
        )}

        {candidates.length > 1 && (
          <>
            <hr className="border-gray-800 my-4" />
            <CandidateGrid candidates={candidates} onChoose={applyCandidate} />
          </>
        )}

        <hr className="border-gray-800 my-4" />

        <div className="flex gap-4 flex-col lg:flex-row">
          <div className="flex-1 min-w-0">
            <DriveAttachPanel
              attachedIds={attachedIds}
              defaultQuery={m.original_title || m.raw_title || ''}
              onAttach={attachFiles}
            />
          </div>
          <div className="flex-1 min-w-0">
            <AttachedFilesList
              titleId={titleId}
              isSeries={isSeries}
              attachments={m.attachments || []}
              onSeasonChange={setSeason}
              onRefresh={refreshAttachments}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
