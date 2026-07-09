'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Candidate, TitleWithAttachments } from '@/lib/dashboardTypes'
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
  const [trailerOpen, setTrailerOpen] = useState(false)
  const [trailerLoading, setTrailerLoading] = useState(false)
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null)
  const [season, setSeason] = useState<number | null>(null)

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

  const save = async (markReady: boolean) => {
    if (!fields) return
    setSaving(true)
    const body: Record<string, unknown> = { ...fields }
    if (markReady) body.catalog_status = 'ready'
    await fetch(`/api/dashboard/titles/${titleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    onSaved()
    if (markReady) {
      // Marking ready is a "done with this title" action — close the editor
      // and return to the catalog. Re-open the title later to add a variant.
      onClose()
    } else {
      setM((prev) => (prev ? { ...prev, ...fields } : prev))
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
    const res = await fetch('/api/dashboard/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fields.synopsis }),
    })
    const data = await res.json()
    setTranslating(false)
    if (data.result) setField('synopsis_sw', data.result)
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

  if (loading || !m || !fields) {
    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isSeries = fields.type === 'series'
  const attachedIds = new Set((m.attachments || []).map((a) => a.drive_id).filter((x): x is string => !!x))
  const candidates = m.candidates_json || []

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
              <input className={inputCls} value={fields.dj} onChange={(e) => setField('dj', e.target.value)} />
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
              ⑂ Add variant (another DJ)
            </button>
          )}
          <button onClick={() => save(false)} disabled={saving} className="text-xs px-3 py-1.5 rounded-lg border border-gray-700">
            Save
          </button>
          <button onClick={() => save(true)} disabled={saving} className="text-xs px-3 py-1.5 rounded-lg bg-green-800">
            Save &amp; mark ready
          </button>
        </div>

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
