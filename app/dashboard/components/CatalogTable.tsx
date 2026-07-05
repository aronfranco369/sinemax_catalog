'use client'

import { useState, useMemo, useEffect } from 'react'
import type { CatalogRow } from '@/lib/dashboardTypes'

const STATUS_COLOR: Record<string, string> = {
  done: 'border-green-700 text-green-400',
  ambiguous: 'border-red-700 text-red-400',
  no_match: 'border-gray-600 text-gray-400',
  pending: 'border-gray-600 text-gray-300',
  failed: 'border-orange-700 text-orange-400',
}

const PAGE_SIZE = 25

export default function CatalogTable({
  rows,
  loading,
  onRowClick,
  onCopyRow,
  onDeleteRow,
}: {
  rows: CatalogRow[]
  loading: boolean
  onRowClick: (id: number) => void
  onCopyRow: (row: CatalogRow) => void
  onDeleteRow: (row: CatalogRow) => void
}) {
  const [page, setPage] = useState(1)
  // A new (filtered/sorted) result set should always start back on page 1.
  useEffect(() => setPage(1), [rows])
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount)
  const pageRows = useMemo(
    () => rows.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE),
    [rows, clampedPage]
  )

  return (
    <div className="w-full bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-left">
              <th className="p-2 w-10"></th>
              <th className="p-2">Title</th>
              <th className="p-2">Type</th>
              <th className="p-2">Year</th>
              <th className="p-2">Country</th>
              <th className="p-2">Genres</th>
              <th className="p-2">Status</th>
              <th className="p-2">Files</th>
              <th className="p-2">Uploaded</th>
              <th className="p-2">Curation</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && pageRows.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-gray-500">
                  No matching titles
                </td>
              </tr>
            )}
            {!loading &&
              pageRows.map((r) => {
                const title = r.matched_title || r.raw_title
                const subtitle = r.matched_title && r.matched_title !== r.raw_title ? r.raw_title : ''
                return (
                  <tr
                    key={r.id}
                    onClick={() => onRowClick(r.id)}
                    className="border-b border-gray-800/60 hover:bg-gray-800/40 cursor-pointer"
                  >
                    <td className="p-2">
                      {r.poster_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.poster_url} alt="" className="w-8 h-12 object-cover rounded" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-8 h-12 rounded bg-gray-800" />
                      )}
                    </td>
                    <td className="p-2">
                      <div className="font-semibold">{title}</div>
                      {subtitle && <div className="text-gray-500 text-[11px]">{subtitle}</div>}
                    </td>
                    <td className="p-2 text-gray-400">{r.type}</td>
                    <td className="p-2 text-gray-400">{r.year}</td>
                    <td className="p-2 text-gray-400">{r.country}</td>
                    <td className="p-2 text-gray-400 max-w-[160px] truncate">{r.genres}</td>
                    <td className="p-2">
                      {r.status && (
                        <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${STATUS_COLOR[r.status] || 'border-gray-700 text-gray-400'}`}>
                          {r.status}
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      {r.att_count ? <span className="font-bold">{r.att_count}</span> : <span className="text-gray-600">0</span>}
                    </td>
                    <td className="p-2 text-gray-500">{(r.uploaded || '').slice(0, 10)}</td>
                    <td className="p-2">
                      {r.catalog_status === 'ready' ? (
                        <span className="text-green-400 font-semibold">✓ ready</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onCopyRow(r)
                          }}
                          title="Copy Backblaze transfer command(s)"
                          className="p-1 rounded hover:bg-gray-800 text-blue-400"
                        >
                          ⧉
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteRow(r)
                          }}
                          title="Delete this title"
                          className="p-1 rounded hover:bg-gray-800 text-red-400"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-800 text-xs text-gray-500">
        <span>
          Page {clampedPage} of {pageCount}
        </span>
        <div className="flex gap-2">
          <button
            disabled={clampedPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-2 py-1 rounded border border-gray-700 disabled:opacity-30"
          >
            Prev
          </button>
          <button
            disabled={clampedPage >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            className="px-2 py-1 rounded border border-gray-700 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
