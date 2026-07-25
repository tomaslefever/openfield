import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'

interface ConfirmDeleteModalProps {
  count: number
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDeleteModal({ count, onConfirm, onClose }: ConfirmDeleteModalProps) {
  const [typed, setTyped] = useState('')

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-800 rounded-2xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-surface-100">Delete {count} Asset{count > 1 ? 's' : ''}?</h2>
          </div>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-100">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-surface-400 mb-4">
          This action cannot be undone. All selected assets and their local files will be permanently deleted.
        </p>

        <p className="text-xs text-surface-500 mb-2">
          Type <strong className="text-surface-200">{count}</strong> to confirm:
        </p>

        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={String(count)}
          className="input-field text-center text-lg font-mono"
          autoFocus
        />

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={typed !== String(count)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete {count} Asset{count > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
