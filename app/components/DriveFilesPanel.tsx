'use client'

import { useState } from 'react'
import type { EvidenceResponse, FileEntry, FileGroup } from '@/lib/evidence'

function formatSize(bytes: number): string {
  if (!bytes) return '0 MB'
  const mb = bytes / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`
}

const CONFIDENCE_BADGE: Record<FileGroup['confidence'], string> = {
  high: 'bg-emerald-900 text-emerald-300',
  medium: 'bg-amber-900 text-amber-300',
  low: 'bg-gray-800 text-gray-400',
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{name}</>
  const idx = name.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return <>{name}</>
  return (
    <>
      {name.slice(0, idx)}
      <span className="text-indigo-300">{name.slice(idx, idx + q.length)}</span>
      {name.slice(idx + q.length)}
    </>
  )
}

function FileRow({
  file,
  query,
  onPlay,
}: {
  file: FileEntry
  query: string
  onPlay: () => void
}) {
  return (
    <button
      onClick={onPlay}
      className="w-full flex items-center gap-2 py-1.5 px-2 text-left hover:bg-gray-800/60 rounded-lg"
    >
      <span className="text-indigo-400 flex-shrink-0">▶</span>
      <span className="flex-1 min-w-0 text-xs truncate">
        <HighlightedName name={file.name} query={query} />
      </span>
      <span className="text-xs text-gray-500 flex-shrink-0">{formatSize(file.size)}</span>
    </button>
  )
}

function GroupRow({
  group,
  query,
  expanded,
  onToggle,
  onPlay,
}: {
  group: FileGroup
  query: string
  expanded: boolean
  onToggle: () => void
  onPlay: (file: FileEntry) => void
}) {
  const epLabel = group.ep_range
    ? `EP ${group.ep_range.min}–${group.ep_range.max}${group.ep_range.missing.length ? ` (${group.ep_range.missing.length} missing)` : ''} · `
    : ''

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full text-left p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-gray-300 truncate">📁 {group.folder}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {group.file_count} files · {epLabel}
            {formatSize(group.total_size)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${CONFIDENCE_BADGE[group.confidence]}`}>
            {group.confidence}
          </span>
          <span className="text-gray-500 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-0.5">
          {group.files.map((f) => (
            <FileRow key={f.id} file={f} query={query} onPlay={() => onPlay(f)} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function DriveFilesPanel({
  loading,
  error,
  evidence,
  searchQuery,
  onSearchQueryChange,
  onSearchSubmit,
  onRetry,
  expandedFolders,
  onToggleFolder,
  onPlay,
}: {
  loading: boolean
  error: boolean
  evidence: EvidenceResponse | null
  searchQuery: string
  onSearchQueryChange: (q: string) => void
  onSearchSubmit: () => void
  onRetry: () => void
  expandedFolders: Record<string, boolean>
  onToggleFolder: (folder: string) => void
  onPlay: (file: FileEntry, groupFiles: FileEntry[]) => void
}) {
  const [lowExpanded, setLowExpanded] = useState(false)

  const highGroups = evidence?.groups.filter((g) => g.confidence !== 'low') ?? []
  const lowGroups = evidence?.groups.filter((g) => g.confidence === 'low') ?? []
  const folderCount = evidence?.groups.length ?? 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-widest">Files on Drive</p>
        {evidence && (
          <p className="text-xs text-gray-500">
            {evidence.signals.total_files} files · {folderCount} folders
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSearchSubmit()
        }}
        className="flex gap-2"
      >
        <input
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="search files…"
          className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs placeholder:text-gray-600 focus:outline-none focus:border-indigo-700"
        />
        <button
          type="submit"
          className="px-3 py-2 rounded-xl border border-gray-700 text-gray-300 text-xs active:bg-gray-800"
        >
          ⟳
        </button>
      </form>

      {loading && (
        <div className="space-y-2">
          <div className="h-16 rounded-xl bg-gray-900 animate-pulse" />
          <div className="h-16 rounded-xl bg-gray-900 animate-pulse" />
        </div>
      )}

      {!loading && error && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-2">Couldn&apos;t load files.</p>
          <button onClick={onRetry} className="text-xs text-indigo-400 underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && evidence && evidence.groups.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400">No files matched automatically — try the search box</p>
        </div>
      )}

      {!loading && !error && highGroups.length > 0 && (
        <div className="space-y-2">
          {highGroups.map((g) => (
            <GroupRow
              key={g.folder}
              group={g}
              query={searchQuery}
              expanded={!!expandedFolders[g.folder]}
              onToggle={() => onToggleFolder(g.folder)}
              onPlay={(f) => onPlay(f, g.files)}
            />
          ))}
        </div>
      )}

      {!loading && !error && lowGroups.length > 0 && (
        <div className="border-t border-gray-800 pt-2">
          <button
            onClick={() => setLowExpanded((v) => !v)}
            className="text-xs text-gray-500 uppercase tracking-widest w-full text-left"
          >
            {lowExpanded ? '▲' : '▼'} possible matches — verify by playing ({lowGroups.length})
          </button>
          {lowExpanded && (
            <div className="space-y-2 mt-2">
              {lowGroups.map((g) => (
                <GroupRow
                  key={g.folder}
                  group={g}
                  query={searchQuery}
                  expanded={!!expandedFolders[g.folder]}
                  onToggle={() => onToggleFolder(g.folder)}
                  onPlay={(f) => onPlay(f, g.files)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
