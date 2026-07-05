'use client'

import { useState } from 'react'
import type { DriveFileHit, FolderHit } from '@/lib/dashboardTypes'

function sizeMb(bytes: number | null | undefined): string {
  return bytes ? `${Math.round(bytes / 1048576)} MB` : ''
}

function folderOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx >= 0 ? path.slice(0, idx) : path
}

function InlinePlayer({ url }: { url: string }) {
  return (
    <iframe
      src={url}
      allow="autoplay; fullscreen"
      allowFullScreen
      className="w-full mt-1 rounded-lg bg-black"
      style={{ height: 260, border: 0 }}
    />
  )
}

function FileRow({
  file,
  attached,
  playing,
  onTogglePlay,
  onAttach,
  onOpenFolder,
}: {
  file: DriveFileHit
  attached: boolean
  playing: boolean
  onTogglePlay: () => void
  onAttach: () => void
  onOpenFolder: () => void
}) {
  return (
    <div className="py-2 border-b border-gray-800/60">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-xs break-all">{file.name}</span>
        <span className="text-[11px] text-gray-500 flex-shrink-0">{sizeMb(file.size)}</span>
      </div>
      <p className="text-[11px] text-gray-600 break-all">{file.path}</p>
      <div className="flex items-center gap-3 mt-1">
        <button onClick={onTogglePlay} className="text-xs text-indigo-400">
          ▶ Play
        </button>
        <button
          onClick={onAttach}
          disabled={attached}
          className="text-xs text-emerald-400 disabled:text-gray-600"
        >
          {attached ? 'Attached' : '+ Attach'}
        </button>
        <button onClick={onOpenFolder} className="text-xs text-blue-400">
          📂 Open folder
        </button>
      </div>
      {playing && <InlinePlayer url={file.preview_url} />}
    </div>
  )
}

function FolderRow({
  folder,
  onAttachAll,
  onOpen,
}: {
  folder: FolderHit
  onAttachAll: () => void
  onOpen: () => void
}) {
  return (
    <div className="py-2 border-b border-gray-800/60">
      <div className="flex items-center gap-2">
        <button onClick={onOpen} className="text-amber-400 text-xs">
          📁
        </button>
        <button onClick={onOpen} className="text-xs font-semibold break-all text-left flex-1">
          {folder.name}
        </button>
        <span className="text-[11px] text-gray-500 flex-shrink-0">{folder.n_files} file(s)</span>
        <button
          onClick={onAttachAll}
          disabled={folder.n_files === 0}
          className="text-xs text-emerald-400 disabled:text-gray-600"
        >
          Attach all
        </button>
      </div>
      <p className="text-[11px] text-gray-600 break-all">{folder.path}</p>
    </div>
  )
}

function FolderTreeNode({
  path,
  name,
  videosOnly,
  attachedIds,
  onAttachFiles,
  playingId,
  onTogglePlay,
  depth = 0,
}: {
  path: string
  name: string
  videosOnly: boolean
  attachedIds: Set<string>
  onAttachFiles: (files: { id: string; name: string }[]) => void
  playingId: string | null
  onTogglePlay: (file: DriveFileHit | null) => void
  depth?: number
}) {
  const [expanded, setExpanded] = useState(depth === 0)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [folders, setFolders] = useState<FolderHit[]>([])
  const [files, setFiles] = useState<DriveFileHit[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/dashboard/drive/folder-contents?path=${encodeURIComponent(path)}&videosOnly=${videosOnly}`
      )
      const data = await res.json()
      setFolders(data.folders || [])
      setFiles(data.files || [])
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  const toggle = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && !loaded) await load()
  }

  const attachThisFolder = async () => {
    const res = await fetch(
      `/api/dashboard/drive/folder-contents?path=${encodeURIComponent(path)}&videosOnly=${videosOnly}&recursive=true`
    )
    const data = await res.json()
    onAttachFiles((data.files || []).map((f: DriveFileHit) => ({ id: f.id, name: f.name })))
  }

  return (
    <div className="pl-2 border-l border-gray-800" style={{ marginLeft: depth === 0 ? 0 : 4 }}>
      <div className="flex items-center gap-2 py-1">
        <button onClick={toggle} className="text-amber-400 text-xs flex-1 text-left break-all">
          {expanded ? '▾' : '▸'} 📁 {name}
        </button>
        <button onClick={attachThisFolder} className="text-[11px] text-emerald-400 flex-shrink-0">
          Attach this folder
        </button>
      </div>
      {expanded && (
        <div className="pl-3">
          {loading && <p className="text-xs text-gray-500 py-1">Loading…</p>}
          {!loading &&
            folders.map((f) => (
              <FolderTreeNode
                key={f.path}
                path={f.path}
                name={f.name}
                videosOnly={videosOnly}
                attachedIds={attachedIds}
                onAttachFiles={onAttachFiles}
                playingId={playingId}
                onTogglePlay={onTogglePlay}
                depth={depth + 1}
              />
            ))}
          {!loading &&
            files.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                attached={attachedIds.has(f.id)}
                playing={playingId === f.id}
                onTogglePlay={() => onTogglePlay(playingId === f.id ? null : f)}
                onAttach={() => onAttachFiles([{ id: f.id, name: f.name }])}
                onOpenFolder={() => {}}
              />
            ))}
          {!loading && folders.length === 0 && files.length === 0 && (
            <p className="text-xs text-gray-500 py-1">empty folder</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function DriveAttachPanel({
  attachedIds,
  defaultQuery,
  onAttach,
}: {
  attachedIds: Set<string>
  defaultQuery: string
  onAttach: (files: { id: string; name: string }[]) => Promise<void>
}) {
  const [mode, setMode] = useState<'files' | 'folders'>('files')
  const [videosOnly, setVideosOnly] = useState(true)
  const [query, setQuery] = useState(defaultQuery)
  const [fileResults, setFileResults] = useState<DriveFileHit[]>([])
  const [folderResults, setFolderResults] = useState<FolderHit[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [treeRoot, setTreeRoot] = useState<{ path: string; name: string } | null>(null)
  const [playing, setPlaying] = useState<DriveFileHit | null>(null)

  const runSearch = async () => {
    const q = query.trim()
    if (q.length < 2) return
    setLoading(true)
    setSearched(true)
    setError(null)
    setTreeRoot(null)
    try {
      const url =
        mode === 'folders'
          ? `/api/dashboard/drive/folders?q=${encodeURIComponent(q)}&videosOnly=${videosOnly}`
          : `/api/dashboard/drive/files?q=${encodeURIComponent(q)}&videosOnly=${videosOnly}`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || `Search failed (${res.status})`)
        if (mode === 'folders') setFolderResults([])
        else setFileResults([])
        return
      }
      if (mode === 'folders') setFolderResults(data.data || [])
      else setFileResults(data.data || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
      if (mode === 'folders') setFolderResults([])
      else setFileResults([])
    } finally {
      setLoading(false)
    }
  }

  const attachAllResults = async () => {
    const toAttach = fileResults.filter((f) => !attachedIds.has(f.id)).map((f) => ({ id: f.id, name: f.name }))
    if (toAttach.length === 0) return
    await onAttach(toAttach)
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <p className="text-xs text-gray-500 uppercase tracking-widest">Drive files — search, play, attach</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          placeholder="search drive inventory…"
          className="flex-1 min-w-[160px] bg-gray-900 border border-gray-800 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-700"
        />
        <div className="flex rounded-lg border border-gray-800 overflow-hidden text-xs">
          <button
            onClick={() => setMode('files')}
            className={`px-2 py-1.5 ${mode === 'files' ? 'bg-indigo-800 text-white' : 'text-gray-400'}`}
          >
            Files
          </button>
          <button
            onClick={() => setMode('folders')}
            className={`px-2 py-1.5 ${mode === 'folders' ? 'bg-indigo-800 text-white' : 'text-gray-400'}`}
          >
            Folders
          </button>
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-400">
          <input type="checkbox" checked={videosOnly} onChange={(e) => setVideosOnly(e.target.checked)} />
          videos only
        </label>
        <button onClick={runSearch} className="text-xs px-3 py-1.5 rounded-lg border border-gray-700">
          Search
        </button>
      </div>

      {mode === 'files' && (
        <div className="flex items-center gap-2">
          <button
            onClick={attachAllResults}
            disabled={fileResults.length === 0}
            className="text-xs px-3 py-1.5 rounded-lg bg-green-800 disabled:opacity-40"
          >
            Attach all
          </button>
          <span className="text-xs text-gray-500">
            {searched ? `${fileResults.length} result(s)` : ''}
          </span>
        </div>
      )}

      <div className="max-h-[62vh] overflow-y-auto">
        {loading && <p className="text-xs text-gray-500 p-2">Searching…</p>}

        {!loading && treeRoot && (
          <div className="mb-2">
            <button
              onClick={() => setTreeRoot(null)}
              className="text-xs text-blue-400 mb-2"
            >
              ← Back to results
            </button>
            <FolderTreeNode
              path={treeRoot.path}
              name={treeRoot.name}
              videosOnly={videosOnly}
              attachedIds={attachedIds}
              onAttachFiles={onAttach}
              playingId={playing?.id ?? null}
              onTogglePlay={setPlaying}
            />
          </div>
        )}

        {!loading && !treeRoot && !searched && (
          <p className="text-xs text-gray-500 p-2">Enter ≥2 characters and search.</p>
        )}

        {!loading && !treeRoot && error && (
          <div className="text-xs p-2">
            <p className="text-red-400">Couldn&apos;t search: {error}</p>
            <button onClick={runSearch} className="text-indigo-400 underline mt-1">
              Retry
            </button>
          </div>
        )}

        {!loading && !treeRoot && !error && searched && mode === 'files' && fileResults.length === 0 && (
          <p className="text-xs text-gray-500 p-2">No matches</p>
        )}
        {!loading &&
          !treeRoot &&
          !error &&
          mode === 'files' &&
          fileResults.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              attached={attachedIds.has(f.id)}
              playing={playing?.id === f.id}
              onTogglePlay={() => setPlaying(playing?.id === f.id ? null : f)}
              onAttach={() => onAttach([{ id: f.id, name: f.name }])}
              onOpenFolder={() => setTreeRoot({ path: folderOf(f.path), name: folderOf(f.path).split('/').pop() || 'folder' })}
            />
          ))}

        {!loading && !treeRoot && !error && searched && mode === 'folders' && folderResults.length === 0 && (
          <p className="text-xs text-gray-500 p-2">No matching folders</p>
        )}
        {!loading &&
          !treeRoot &&
          !error &&
          mode === 'folders' &&
          folderResults.map((f) => (
            <FolderRow
              key={f.path}
              folder={f}
              onAttachAll={async () => {
                const res = await fetch(
                  `/api/dashboard/drive/folder-contents?path=${encodeURIComponent(f.path)}&videosOnly=${videosOnly}&recursive=true`
                )
                const data = await res.json()
                await onAttach((data.files || []).map((x: DriveFileHit) => ({ id: x.id, name: x.name })))
              }}
              onOpen={() => setTreeRoot({ path: f.path, name: f.name })}
            />
          ))}
      </div>
    </div>
  )
}
