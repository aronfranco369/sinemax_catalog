import type { EvidenceSignals } from '@/lib/evidence'

function isSeriesType(type: string | undefined | null): boolean {
  return /series|tv/i.test(type || '')
}

export default function EvidenceChip({
  signals,
  candidateType,
}: {
  signals: EvidenceSignals | null
  candidateType: string
}) {
  if (!signals || signals.structure === 'unclear') return null

  const candidateIsSeries = isSeriesType(candidateType)
  let positive: boolean
  let text: string

  if (signals.structure === 'series') {
    positive = candidateIsSeries
    text = candidateIsSeries ? `✓ files look like a series (${signals.episode_count ?? '?'} eps)` : '✗ files are episodic'
  } else {
    positive = !candidateIsSeries
    text = !candidateIsSeries ? '✓ single feature file' : '✗ no episode files found'
  }

  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded ${
        positive ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'
      }`}
    >
      {text}
    </span>
  )
}
