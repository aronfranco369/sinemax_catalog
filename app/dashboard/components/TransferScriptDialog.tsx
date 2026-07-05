'use client'

import { useState } from 'react'

export type ScriptDialogState = { title: string; script: string; total?: number }

export default function TransferScriptDialog({
  state,
  onClose,
}: {
  state: ScriptDialogState | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  if (!state) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state.script)
    } catch {
      // clipboard API can be unavailable (e.g. insecure context); the
      // textarea below still lets the operator select-all/copy manually.
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="w-full max-w-4xl bg-gray-900 border border-gray-800 rounded-2xl p-5 my-8">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold">{state.title}</h2>
          {state.total !== undefined && <span className="text-xs text-gray-500">· {state.total} file(s)</span>}
          <div className="flex-1" />
          <button onClick={copy} className="text-xs px-3 py-1.5 rounded-lg border border-green-700 text-green-400">
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={onClose} className="text-xs px-2 py-1.5 rounded-lg border border-gray-700 text-gray-400">
            ✕
          </button>
        </div>
        <textarea
          readOnly
          value={state.script}
          className="w-full h-[60vh] bg-gray-950 border border-gray-800 rounded-lg p-3 text-[11px] font-mono whitespace-pre focus:outline-none"
        />
      </div>
    </div>
  )
}
