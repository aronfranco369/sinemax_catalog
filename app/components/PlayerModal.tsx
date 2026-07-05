import type { FileEntry } from '@/lib/evidence'

function formatSize(bytes: number): string {
  if (!bytes) return '0 MB'
  const mb = bytes / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`
}

export default function PlayerModal({
  file,
  groupFiles,
  onClose,
  onNavigate,
}: {
  file: FileEntry
  groupFiles: FileEntry[]
  onClose: () => void
  onNavigate: (file: FileEntry) => void
}) {
  const index = groupFiles.findIndex((f) => f.id === file.id)
  const prev = index > 0 ? groupFiles[index - 1] : null
  const next = index >= 0 && index < groupFiles.length - 1 ? groupFiles[index + 1] : null

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl overflow-hidden w-full max-w-2xl border border-gray-800">
        <div className="flex items-start justify-between gap-2 p-3 border-b border-gray-800">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-gray-500">{formatSize(file.size)}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none px-2 flex-shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="aspect-video bg-black">
          <iframe
            src={`https://drive.google.com/file/d/${file.id}/preview`}
            allow="autoplay"
            allowFullScreen
            className="w-full h-full"
          />
        </div>

        <div className="flex items-center justify-between gap-2 p-3">
          <a
            href={`https://drive.google.com/file/d/${file.id}/view`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-indigo-400"
          >
            Open in Drive ↗
          </a>
          <div className="flex gap-2">
            <button
              onClick={() => prev && onNavigate(prev)}
              disabled={!prev}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 disabled:opacity-30"
            >
              ← Prev
            </button>
            <button
              onClick={() => next && onNavigate(next)}
              disabled={!next}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
