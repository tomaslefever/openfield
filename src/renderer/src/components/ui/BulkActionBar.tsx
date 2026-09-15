import { useEffect, useRef, useState } from 'react'
import { Tags, Trash2, Plus, X, FolderInput, Check, Loader, Archive } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '../../stores/app-store'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { exportAssetsAsZip } from '../../lib/export-zip'

interface BulkActionBarProps {
  selectedCount: number
  selectedIds?: string[]
  onAddTags: () => void
  onDelete: () => void
  onAddToComposer?: () => void
  onExportZip?: () => void
  onClearSelection: () => void
  onAssetsMoved?: (ids: string[]) => void
}

export function BulkActionBar({
  selectedCount,
  selectedIds,
  onAddTags,
  onDelete,
  onAddToComposer,
  onExportZip,
  onClearSelection,
  onAssetsMoved,
}: BulkActionBarProps) {
  const sidebarCollapsed = useAppStore(s => s.sidebarCollapsed)
  const { workspaces, activeId, create } = useWorkspaceStore()
  const [moveOpen, setMoveOpen] = useState(false)
  const [moving, setMoving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const moveRef = useRef<HTMLDivElement>(null)

  const targets = workspaces.filter(w => w.id !== activeId)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) {
        setMoveOpen(false)
        setCreating(false)
      }
    }
    if (moveOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [moveOpen])

  if (selectedCount === 0) return null

  const handleExportZip = async () => {
    if (exporting || !selectedIds?.length) return
    if (onExportZip) {
      onExportZip()
      return
    }
    setExporting(true)
    try {
      await exportAssetsAsZip(selectedIds)
    } finally {
      setExporting(false)
    }
  }

  const handleMove = async (workspaceId: string) => {
    if (moving || !selectedIds?.length) return
    setMoving(true)
    try {
      const api = (window as any).electronAPI
      await api?.assets.moveToWorkspace(selectedIds, workspaceId)
      const target = workspaces.find(w => w.id === workspaceId)
      onAssetsMoved?.(selectedIds)
      onClearSelection()
      toast.success('Assets movidos con éxito', { description: `${selectedIds.length} assets → ${target?.name || 'project'}` })
    } catch (err) {
      console.error('[BulkActionBar] Move to workspace failed:', err)
      toast.error('No se pudieron mover los assets')
    } finally {
      setMoving(false)
      setMoveOpen(false)
    }
  }

  const handleCreateAndMove = async () => {
    const name = newName.trim()
    if (!name || moving) return
    setMoving(true)
    try {
      const ws = await create(name)
      if (ws) {
        const api = (window as any).electronAPI
        await api?.assets.moveToWorkspace(selectedIds!, ws.id)
        onAssetsMoved?.(selectedIds!)
        onClearSelection()
        toast.success('Assets movidos con éxito', { description: `${selectedIds!.length} assets → ${ws.name}` })
      }
    } catch (err) {
      console.error('[BulkActionBar] Create workspace + move failed:', err)
      toast.error('No se pudieron mover los assets')
    } finally {
      setMoving(false)
      setCreating(false)
      setNewName('')
      setMoveOpen(false)
    }
  }

  return (
    <div
      className={`fixed bottom-[300px] z-40 flex justify-center pointer-events-none transition-all duration-200 ${sidebarCollapsed ? 'left-16' : 'left-56'}`}
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

        <div ref={moveRef} className="relative">
          <button
            onClick={() => setMoveOpen(!moveOpen)}
            className={`p-2 rounded-lg transition-colors ${moveOpen ? 'text-accent-400 bg-accent-500/10' : 'text-surface-300 bg-surface-800 hover:bg-surface-700'}`}
            title="Move to project"
          >
            {moving ? <Loader size={16} className="animate-spin" /> : <FolderInput size={16} />}
          </button>
          {moveOpen && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[180px] shadow-xl z-50">
              <p className="px-3 pt-1.5 pb-1 text-[9px] uppercase tracking-wider text-surface-600">Move to project</p>
              <div className="max-h-[220px] overflow-y-auto px-1 pb-1">
                {targets.map(w => (
                  <button
                    key={w.id}
                    onClick={() => handleMove(w.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-surface-300 hover:text-surface-100 hover:bg-surface-700/50 transition-colors"
                  >
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: w.color || '#6366f1' }} />
                    <span className="truncate flex-1 text-left">{w.name}</span>
                  </button>
                ))}
                {targets.length === 0 && (
                  <p className="px-2 py-1.5 text-[10px] text-surface-600">No other projects yet</p>
                )}
              </div>

              <div className="border-t border-surface-700 px-2 py-1.5">
                {creating ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCreateAndMove(); if (e.key === 'Escape') setCreating(false) }}
                      placeholder="Project name..."
                      className="flex-1 min-w-0 bg-surface-900 border border-surface-600 rounded-md px-1.5 py-0.5 text-xs text-surface-100 outline-none"
                    />
                    <button onClick={handleCreateAndMove} disabled={moving} className="text-accent-400 hover:text-accent-300 disabled:opacity-50">
                      {moving ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCreating(true)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-accent-400 hover:bg-accent-500/10 transition-colors"
                  >
                    <Plus size={12} /> New Project
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleExportZip}
          disabled={exporting}
          className="p-2 rounded-lg text-surface-300 bg-surface-800 hover:bg-surface-700 transition-colors disabled:opacity-50"
          title="Export as ZIP"
        >
          {exporting ? <Loader size={16} className="animate-spin text-accent-400" /> : <Archive size={16} />}
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
