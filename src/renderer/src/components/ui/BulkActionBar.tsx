import { Tags, Trash2, Plus } from 'lucide-react'

interface BulkActionBarProps {
  selectedCount: number
  onAddTags: () => void
  onDelete: () => void
  onAddToComposer?: () => void
  onClearSelection: () => void
}

export function BulkActionBar({ selectedCount, onAddTags, onDelete, onAddToComposer, onClearSelection }: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div className="max-w-7xl mx-auto px-6 pb-4">
        <div className="pointer-events-auto bg-surface-900 border border-surface-800 rounded-xl px-4 py-3 flex items-center gap-3 shadow-2xl shadow-black/50">
          <span className="text-sm font-medium text-surface-200">
            {selectedCount} selected
          </span>

          <div className="flex-1" />

          {onAddToComposer && (
            <button onClick={onAddToComposer} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-accent-400 bg-accent-500/10 hover:bg-accent-500/20 transition-colors">
              <Plus size={14} />
              Add to Composer
            </button>
          )}

          <button onClick={onAddTags} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-surface-300 bg-surface-800 hover:bg-surface-700 transition-colors">
            <Tags size={14} />
            Tag
          </button>

          <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors">
            <Trash2 size={14} />
            Delete
          </button>

          <button onClick={onClearSelection} className="px-3 py-1.5 rounded-lg text-xs font-medium text-surface-500 hover:text-surface-300 transition-colors">
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}
