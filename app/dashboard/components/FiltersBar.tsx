'use client'

import type { CatalogFilters } from '@/lib/dashboardTypes'

const SELECT_CLS =
  'bg-gray-900 border border-gray-800 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-700'

export default function FiltersBar({
  filters,
  onChange,
}: {
  filters: CatalogFilters
  onChange: (next: Partial<CatalogFilters>) => void
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <input
        value={filters.q}
        onChange={(e) => onChange({ q: e.target.value })}
        placeholder="search title…"
        className="w-56 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-xs placeholder:text-gray-600 focus:outline-none focus:border-indigo-700"
      />
      <select className={SELECT_CLS} value={filters.status} onChange={(e) => onChange({ status: e.target.value })}>
        <option value="">all statuses</option>
        <option value="done">done</option>
        <option value="ambiguous">ambiguous</option>
        <option value="no_match">no_match</option>
        <option value="pending">pending</option>
        <option value="failed">failed</option>
      </select>
      <select className={SELECT_CLS} value={filters.tier} onChange={(e) => onChange({ tier: e.target.value })}>
        <option value="">all tiers</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>
      <select className={SELECT_CLS} value={filters.type} onChange={(e) => onChange({ type: e.target.value })}>
        <option value="">movie + series</option>
        <option value="movie">movie</option>
        <option value="series">series</option>
      </select>
      <select className={SELECT_CLS} value={filters.sort} onChange={(e) => onChange({ sort: e.target.value })}>
        <option value="">sort: title (A–Z)</option>
        <option value="title_desc">title (Z–A)</option>
        <option value="uploaded_new">uploaded: newest first</option>
        <option value="uploaded_old">uploaded: oldest first</option>
        <option value="year_desc">year: newest first</option>
        <option value="year_asc">year: oldest first</option>
        <option value="files_desc">files: most first</option>
        <option value="files_asc">files: fewest first</option>
      </select>
    </div>
  )
}
