import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, Check, Pencil, Copy, Trash2, Loader } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace-store'

export function WorkspaceSelector({ collapsed }: { collapsed: boolean }) {
  const { workspaces, activeId, load, create, rename, remove, duplicate, setActive } = useWorkspaceStore()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const active = workspaces.find((w) => w.id === activeId) || null

  useEffect(() => {
    if (!useWorkspaceStore.getState().loaded) load()
  }, [load])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setEditingId(null)
        setConfirmDeleteId(null)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [open])

  useEffect(() => {
    if (!open) { setCreating(false); setEditingId(null); setConfirmDeleteId(null) }
  }, [open])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    const ws = await create(name)
    if (ws) {
      await setActive(ws.id)
      setOpen(false)
    }
    setNewName('')
    setBusy(false)
  }

  // Keep the dropdown fresh: refetch the workspace list every time it opens
  const handleToggle = () => {
    if (!open) load()
    setOpen(!open)
  }

  const handleRename = async (id: string) => {
    const name = editValue.trim()
    setEditingId(null)
    if (!name) return
    await rename(id, name)
  }

  const handleDelete = async (id: string) => {
    if (busy) return
    setBusy(true)
    const result = await remove(id)
    setBusy(false)
    if (!result.ok) {
      setConfirmDeleteId(null)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {collapsed ? (
        <button
          onClick={handleToggle}
          title={active?.name || 'Projects'}
          className="w-full flex items-center justify-center rounded-lg hover:bg-surface-800 transition-colors"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-[13px] font-semibold text-white">
            {(active?.name || 'P').charAt(0).toUpperCase()}
          </span>
        </button>
      ) : (
        <button
          onClick={handleToggle}
          className="w-full flex items-center gap-2.5 rounded-lg border border-sidebar-border p-1.5 hover:bg-sidebar-accent/60 transition-colors group"
          title="Switch project"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-[13px] font-semibold text-white">
            {(active?.name || 'P').charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium leading-tight text-sidebar-foreground">{active?.name || 'Projects'}</span>
            <span className="block truncate text-[11px] leading-tight text-sidebar-foreground/50">Workspace</span>
          </span>
          <ChevronDown size={12} className={`text-sidebar-foreground/50 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {open && (
        <div className={`absolute left-0 top-full mt-1 bg-surface-800 border border-surface-700 rounded-xl py-1 shadow-xl z-[60] ${collapsed ? 'w-[220px]' : 'w-full'}`}>
          <p className="px-3 pt-1.5 pb-1 text-[9px] uppercase tracking-wider text-surface-600">Projects</p>
          <div className="max-h-[240px] overflow-y-auto px-1 pb-1 space-y-0.5">
            {workspaces.map((w) => (
              <div
                key={w.id}
                className={`group/ws rounded-lg transition-colors ${w.id === activeId ? 'bg-accent-500/10' : 'hover:bg-surface-700/50'}`}
              >
                {editingId === w.id ? (
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(w.id); if (e.key === 'Escape') setEditingId(null) }}
                      className="flex-1 min-w-0 bg-surface-900 border border-surface-600 rounded-md px-1.5 py-0.5 text-xs text-surface-100 outline-none"
                    />
                    <button onClick={() => handleRename(w.id)} className="text-accent-400 hover:text-accent-300"><Check size={12} /></button>
                  </div>
                ) : confirmDeleteId === w.id ? (
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <span className="text-[10px] text-red-300 flex-1 truncate">Delete "{w.name}"?</span>
                    <button onClick={() => handleDelete(w.id)} className="text-red-400 hover:text-red-300 font-semibold text-[10px]">Yes</button>
                    <button onClick={() => setConfirmDeleteId(null)} className="text-surface-400 hover:text-surface-200 text-[10px]">No</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <button
                      onClick={async () => { await setActive(w.id); setOpen(false) }}
                      className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                    >
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: w.color || '#6366f1' }} />
                      <span className={`text-xs truncate ${w.id === activeId ? 'text-accent-300 font-medium' : 'text-surface-300'}`}>{w.name}</span>
                    </button>
                    {w.id === activeId && <Check size={12} className="text-accent-400 flex-shrink-0" />}
                    <span className="hidden group-hover/ws:flex items-center gap-0.5 flex-shrink-0">
                      <button
                        title="Rename"
                        onClick={() => { setEditingId(w.id); setEditValue(w.name) }}
                        className="p-0.5 text-surface-500 hover:text-surface-200"
                      ><Pencil size={11} /></button>
                      <button
                        title="Duplicate"
                        onClick={() => duplicate(w.id)}
                        className="p-0.5 text-surface-500 hover:text-surface-200"
                      ><Copy size={11} /></button>
                      {workspaces.length > 1 && (
                        <button
                          title="Delete"
                          onClick={() => setConfirmDeleteId(w.id)}
                          className="p-0.5 text-surface-500 hover:text-red-400"
                        ><Trash2 size={11} /></button>
                      )}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-surface-700 px-2 py-1.5">
            {creating ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
                  placeholder="Project name..."
                  className="flex-1 min-w-0 bg-surface-900 border border-surface-600 rounded-md px-1.5 py-0.5 text-xs text-surface-100 outline-none"
                />
                <button onClick={handleCreate} disabled={busy} className="text-accent-400 hover:text-accent-300 disabled:opacity-50">
                  {busy ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
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
  )
}
