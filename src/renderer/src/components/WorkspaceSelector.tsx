import { useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace-store'
import { srcUrl } from '../services/file-url'

export function WorkspaceSelector({ collapsed }: { collapsed: boolean }) {
  const { workspaces, activeId, load, exitWorkspace } = useWorkspaceStore()

  const active = workspaces.find((w) => w.id === activeId) || null

  useEffect(() => {
    if (!useWorkspaceStore.getState().loaded) load()
  }, [load])

  if (collapsed) {
    return (
      <button
        onClick={() => exitWorkspace()}
        title={active ? `Volver a workspaces (${active.name})` : 'Volver a workspaces'}
        className="group relative w-full flex items-center justify-center p-1 rounded-lg hover:bg-sidebar-accent/70 transition-all"
      >
        {active?.lastImageUrl ? (
          <img
            src={srcUrl(active.lastImageUrl)}
            alt=""
            className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-white/10 group-hover:opacity-20 transition-opacity"
          />
        ) : (
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[14px] font-semibold text-white shadow-sm group-hover:opacity-20 transition-opacity"
            style={{ backgroundColor: active?.color || '#6366f1' }}
          >
            {(active?.name || 'W').charAt(0).toUpperCase()}
          </span>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-sidebar-foreground">
          <ArrowLeft size={18} />
        </div>
      </button>
    )
  }

  return (
    <button
      onClick={() => exitWorkspace()}
      title="Volver a la selección de workspaces"
      className="group w-full flex items-center gap-2.5 rounded-xl border border-sidebar-border/80 bg-sidebar-accent/30 p-2 hover:bg-sidebar-accent/80 hover:border-sidebar-border transition-all text-left"
    >
      <div className="relative size-8 shrink-0 flex items-center justify-center">
        {active?.lastImageUrl ? (
          <img
            src={srcUrl(active.lastImageUrl)}
            alt=""
            className="size-8 rounded-lg object-cover ring-1 ring-white/10 transition-opacity"
          />
        ) : (
          <span
            className="flex size-8 items-center justify-center rounded-lg text-[13px] font-semibold text-white shadow-sm transition-opacity"
            style={{ backgroundColor: active?.color || '#6366f1' }}
          >
            {(active?.name || 'W').charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-tight text-sidebar-foreground">
          {active?.name || 'Workspace'}
        </span>
        <span className="block truncate text-[11px] leading-tight text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80 transition-colors mt-0.5">
          Volver a workspaces
        </span>
      </div>

      <ArrowLeft
        size={14}
        className="text-sidebar-foreground/40 group-hover:text-sidebar-foreground group-hover:-translate-x-0.5 transition-all flex-shrink-0"
      />
    </button>
  )
}
