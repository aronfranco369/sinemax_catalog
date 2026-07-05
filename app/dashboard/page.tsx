'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CatalogFilters, CatalogRow } from '@/lib/dashboardTypes'
import StatsBar, { type Stats } from './components/StatsBar'
import FiltersBar from './components/FiltersBar'
import CatalogTable from './components/CatalogTable'
import TitleEditor from './components/TitleEditor'
import TransferScriptDialog, { type ScriptDialogState } from './components/TransferScriptDialog'

const EMPTY_FILTERS: CatalogFilters = { q: '', status: '', tier: '', type: '', catalog: '', sort: '' }

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [view, setView] = useState<'curate' | 'ready'>('curate')
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS)
  const [rows, setRows] = useState<CatalogRow[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedTitleId, setSelectedTitleId] = useState<number | null>(null)
  const [scriptDialog, setScriptDialog] = useState<ScriptDialogState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CatalogRow | null>(null)

  const refreshStats = useCallback(async () => {
    const res = await fetch('/api/dashboard/stats')
    setStats(await res.json())
  }, [])

  const refreshCatalog = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.q) params.set('q', filters.q)
    if (filters.status) params.set('status', filters.status)
    if (filters.tier) params.set('tier', filters.tier)
    if (filters.type) params.set('type', filters.type)
    if (filters.sort) params.set('sort', filters.sort)
    params.set('catalog', view === 'ready' ? 'ready' : 'not_ready')
    const res = await fetch(`/api/dashboard/titles?${params}`)
    const data = await res.json()
    setRows(data.rows || [])
    setCount(data.count || 0)
    setLoading(false)
  }, [filters, view])

  useEffect(() => {
    refreshStats()
  }, [refreshStats])

  useEffect(() => {
    refreshCatalog()
  }, [refreshCatalog])

  const onFilterChange = (next: Partial<CatalogFilters>) => setFilters((f) => ({ ...f, ...next }))

  const afterMutation = () => {
    refreshCatalog()
    refreshStats()
  }

  const copyRow = async (row: CatalogRow) => {
    const res = await fetch('/api/dashboard/transfer-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titleIds: [row.id] }),
    })
    const data = await res.json()
    setScriptDialog({ title: `Transfer script — ${row.matched_title || row.raw_title}`, script: data.script, total: data.total })
  }

  const copyAllReady = async () => {
    const params = new URLSearchParams({ catalog: 'ready' })
    const listRes = await fetch(`/api/dashboard/titles?${params}`)
    const listData = await listRes.json()
    const ids: number[] = (listData.rows || []).map((r: CatalogRow) => r.id)
    if (ids.length === 0) return
    const res = await fetch('/api/dashboard/transfer-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titleIds: ids }),
    })
    const data = await res.json()
    setScriptDialog({ title: `Transfer script — all ready (${ids.length} titles)`, script: data.script, total: data.total })
  }

  const cloudShellSetup = async () => {
    const res = await fetch('/api/dashboard/setup-script')
    const data = await res.json()
    setScriptDialog({ title: 'One-time Cloud Shell setup (paste once)', script: data.script })
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    await fetch(`/api/dashboard/titles/${deleteTarget.id}`, { method: 'DELETE' })
    setDeleteTarget(null)
    afterMutation()
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800" style={{ background: '#11141b' }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎬</span>
          <h1 className="text-lg font-semibold">Catalog Dashboard</h1>
        </div>
        <StatsBar stats={stats} />
      </div>

      <div className="flex items-center gap-3 px-6 pt-4 flex-wrap">
        <div className="flex rounded-lg border border-gray-800 overflow-hidden text-xs">
          <button
            onClick={() => setView('curate')}
            className={`px-3 py-1.5 ${view === 'curate' ? 'bg-green-800 text-white' : 'text-gray-400'}`}
          >
            To curate
          </button>
          <button
            onClick={() => setView('ready')}
            className={`px-3 py-1.5 ${view === 'ready' ? 'bg-green-800 text-white' : 'text-gray-400'}`}
          >
            ✓ Ready {stats ? `(${stats.ready})` : ''}
          </button>
        </div>
        {view === 'ready' && (
          <div className="flex items-center gap-2">
            <button onClick={copyAllReady} className="text-xs px-3 py-1.5 rounded-lg border border-blue-700 text-blue-300">
              ⧉ Copy transfer script
            </button>
            <button onClick={cloudShellSetup} className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400">
              ⌨ Cloud Shell setup
            </button>
          </div>
        )}
      </div>

      <div className="px-6 pt-3">
        <FiltersBar filters={filters} onChange={onFilterChange} />
        <p className="text-xs text-gray-500 mt-2">
          {count} matching · showing {rows.length}
        </p>
      </div>

      <div className="px-6 pt-3 pb-8">
        <CatalogTable
          rows={rows}
          loading={loading}
          onRowClick={setSelectedTitleId}
          onCopyRow={copyRow}
          onDeleteRow={setDeleteTarget}
        />
      </div>

      {selectedTitleId !== null && (
        <TitleEditor
          titleId={selectedTitleId}
          onClose={() => setSelectedTitleId(null)}
          onSaved={afterMutation}
          onOpenTitle={setSelectedTitleId}
        />
      )}

      <TransferScriptDialog state={scriptDialog} onClose={() => setScriptDialog(null)} />

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <p className="text-sm font-semibold">Delete this title?</p>
            <p className="text-xs text-gray-400 mt-1">{deleteTarget.matched_title || deleteTarget.raw_title}</p>
            {deleteTarget.att_count > 0 && (
              <p className="text-[11px] text-orange-400 mt-2">Also removes its attached files.</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setDeleteTarget(null)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-700">
                Cancel
              </button>
              <button onClick={doDelete} className="text-xs px-3 py-1.5 rounded-lg bg-red-800">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
