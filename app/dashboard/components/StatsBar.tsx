'use client'

function Chip({ value, label, color = 'text-white' }: { value: number; label: string; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-0">
      <span className={`text-base font-bold ${color}`}>{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  )
}

export type Stats = { total: number; by_status: Record<string, number>; ready: number; published: number; attached: number }

export default function StatsBar({ stats }: { stats: Stats | null }) {
  if (!stats) return <div className="h-10" />
  return (
    <div className="flex items-center gap-5">
      <Chip value={stats.total} label="titles" />
      <Chip value={stats.by_status.done || 0} label="done" color="text-green-400" />
      <Chip value={stats.by_status.ambiguous || 0} label="ambiguous" color="text-red-400" />
      <Chip value={stats.attached} label="with files" color="text-blue-400" />
      <Chip value={stats.ready} label="ready" color="text-green-400" />
      <Chip value={stats.published} label="published" color="text-indigo-400" />
    </div>
  )
}
