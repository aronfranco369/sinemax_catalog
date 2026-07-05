'use client'

import type { Candidate } from '@/lib/dashboardTypes'

export default function CandidateGrid({
  candidates,
  onChoose,
  label = 'TMDB candidates — pick the right one',
}: {
  candidates: Candidate[]
  onChoose: (c: Candidate) => void
  label?: string
}) {
  if (candidates.length === 0) return null
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">{label}</p>
      <div className="flex gap-3 flex-wrap">
        {candidates.map((c, i) => (
          <div key={i} className="bg-gray-950 border border-gray-800 rounded-xl p-2.5 w-[320px]">
            <div className="flex gap-3">
              {c.poster_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.poster_url} alt="" className="w-20 h-[120px] object-cover rounded-lg flex-shrink-0" referrerPolicy="no-referrer" />
              )}
              <div className="flex flex-col gap-1 min-w-0">
                <span className="font-semibold text-xs">
                  {c.matched_title} ({c.year})
                </span>
                <span className="text-[11px] text-gray-500">
                  {c.type} · {c.country} · {c.genres}
                </span>
                {c.synopsis && <p className="text-[11px] text-gray-500 line-clamp-3">{c.synopsis}</p>}
                <button
                  onClick={() => onChoose(c)}
                  className="mt-1 self-start text-[11px] px-2 py-1 rounded bg-green-800"
                >
                  Use this
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
