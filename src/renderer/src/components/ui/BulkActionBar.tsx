import { Tags, Trash2, Plus, X } from 'lucide-react'
import { useAppStore } from '../../stores/app-store'

interface BulkActionBarProps {
  selectedCount: number
  onAddTags: () => void
  onDelete: () => void
  onAddToComposer?: () => void
  onClearSelection: () => void
}

export function BulkActionBar({ selectedCount, onAddTags, onDelete, onAddToComposer, onClearSelection }: BulkActionBarProps) {
  const sidebarCollapsed = useAppStore(s => s.sidebarCollapsed)
  if (selectedCount === 0) return null

  return (
    <div
      className={`fixed bottom-[100px] z-40 flex justify-center pointer-events-none transition-all duration-200 ${sidebarCollapsed ? 'left-16' : 'left-56'}`}
      style={{ right: 12 }}
    >
      <div className="pointer-events-auto bg-surface-900 border border-surface-800 rounded-xl px-3 py-2 flex items-center gap-1.5 shadow-2xl shadow-black/50">
        <span className="text-[10px] text-surface-400 font-medium px-1.5">
          {selectedCount}
        </span>

        {onAddToComposer && (
          <button
            onClick={onAddToComposer}
            className="p-2 rounded-lg text-accent-400 bg-accent-500/10 hover:bg-accent-500/20 transition-colors"
            title="Add to Composer"
          >
            <Plus size={16} />
          </button>
        )}

        <button
          onClick={onAddTags}
          className="p-2 rounded-lg text-surface-300 bg-surface-800 hover:bg-surface-700 transition-colors"
          title="Tag"
        >
          <Tags size={16} />
        </button>

        <button
          onClick={onDelete}
          className="p-2 rounded-lg text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
          title="Delete"
        >
          <Trash2 size={16} />
        </button>

        <button
          onClick={onClearSelection}
          className="p-2 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-800 transition-colors"
          title="Clear selection"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
