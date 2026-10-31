import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Search, Copy, Trash2, RefreshCw, Clapperboard, FolderInput, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspaceStore } from '../../../stores/workspace-store'
import { useShortDramaStore, type DramaProjectSummary } from '../../../stores/short-drama-store'
import { srcUrl } from '../../../services/file-url'
import { NewProjectModal } from './NewProjectModal'
import { ConfirmDialog, IconAction } from './ui'
import { type DramaContentType, CONTENT_TYPES_CONFIG } from '../../../lib/content-type-prompts'

// Indexed by the stored stage: 3 and the legacy 4 are both the merged shots stage
const STAGE_NAMES = ['Guión', 'Elenco', 'Tomas', 'Tomas', 'Ensamblaje']

function isDefaultWs(ws: { name: string }) {
  return ws.name.toLowerCase() === 'default'
}

export const DramaProjectList: React.FC = () => {
  const { workspaces, activeId: activeWorkspaceId } = useWorkspaceStore()
  const {
    projectsList,
    isLoadingProjects,
    fetchProjectsList,
    openProject,
    createNewProject,
    deleteProject,
    duplicateProject,
    moveProjectWorkspace,
  } = useShortDramaStore()

  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<DramaContentType | 'all'>('all')
  // Scoped to the active workspace like the rest of the app; "all" stays available in the selector
  const [selectedWsFilter, setSelectedWsFilter] = useState<string>(activeWorkspaceId || 'all')
  const [movingProjectId, setMovingProjectId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<DramaProjectSummary | null>(null)
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)

  useEffect(() => {
    setSelectedWsFilter(activeWorkspaceId || 'all')
  }, [activeWorkspaceId])

  useEffect(() => {
    fetchProjectsList(selectedWsFilter)
  }, [selectedWsFilter, fetchProjectsList])

  const workspaceOf = useCallback(
    (p: DramaProjectSummary) => workspaces.find((w) => w.id === p.workspaceId) || workspaces.find(isDefaultWs) || workspaces[0],
    [workspaces],
  )

  // Other store actions (move, delete, hub return) refetch every workspace, so the
  // workspace scope is always re-applied here rather than trusting the fetched list
  const wsProjects = useMemo(
    () => (selectedWsFilter === 'all' ? projectsList : projectsList.filter((p) => workspaceOf(p)?.id === selectedWsFilter)),
    [projectsList, selectedWsFilter, workspaceOf],
  )

  const filteredProjects = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return wsProjects.filter((p) => {
      const pType = p.contentType || 'microdrama'
      if (filterType !== 'all' && pType !== filterType) return false
      if (!q) return true
      return [p.title, p.logline || p.ideaPrompt, p.genre].some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [wsProjects, searchTerm, filterType])

  const typeCounts = useMemo(() => {
    const counts = new Map<DramaContentType, number>()
    for (const p of wsProjects) {
      const t = p.contentType || 'microdrama'
      counts.set(t, (counts.get(t) || 0) + 1)
    }
    return counts
  }, [wsProjects])

  const totalVideos = wsProjects.reduce((acc, p) => acc + (p.progress?.stats?.genVideos || 0), 0)
  const completedProjects = wsProjects.filter((p) => p.progress?.stats?.hasFinalVideo).length
  const isFiltering = !!searchTerm.trim() || filterType !== 'all' || selectedWsFilter !== 'all'

  const handleCreateNew = async (data: {
    title: string
    contentType: DramaContentType
    customPromptGuide?: string
    workspaceId?: string
  }) => {
    setIsNewModalOpen(false)
    await createNewProject(data)
    if (data.workspaceId && selectedWsFilter !== 'all' && selectedWsFilter !== data.workspaceId) {
      setSelectedWsFilter(data.workspaceId)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <NewProjectModal isOpen={isNewModalOpen} onClose={() => setIsNewModalOpen(false)} onCreate={handleCreateNew} />

      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-title-lg text-ink">Content Studio</h1>
          <p className="text-meta text-ink-subtle mt-1">
            {wsProjects.length > 0
              ? `${wsProjects.length} ${wsProjects.length === 1 ? 'pieza' : 'piezas'} · ${completedProjects} ${completedProjects === 1 ? 'terminada' : 'terminadas'} · ${totalVideos} clips`
              : 'Microdramas, UGC, spots, reels y más, producidos por etapas'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => fetchProjectsList(selectedWsFilter)} disabled={isLoadingProjects} className="btn-icon" title="Recargar">
            <RefreshCw size={14} className={isLoadingProjects ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setIsNewModalOpen(true)} className="btn-primary flex items-center gap-1.5">
            <Plus size={14} /> Nueva pieza
          </button>
        </div>
      </div>

      {projectsList.length > 0 && (
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-8">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por título, sinopsis o género"
              className="w-full h-9 pl-9 pr-8 rounded-pill bg-surface-soft border border-hairline text-body text-ink placeholder:text-ink-subtle outline-none focus:border-accent-500 transition-colors"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink" title="Limpiar">
                <X size={13} />
              </button>
            )}
          </div>

          {workspaces.length > 1 && (
            <select
              value={selectedWsFilter}
              onChange={(e) => setSelectedWsFilter(e.target.value)}
              className="h-9 px-3 rounded-pill bg-surface-soft border border-hairline text-meta text-ink outline-none focus:border-accent-500 cursor-pointer"
              title="Workspace"
            >
              <option value="all">Todos los workspaces</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1 overflow-x-auto">
            {[['all', 'Todos', wsProjects.length] as const, ...Array.from(typeCounts.entries()).map(([t, n]) => [t, CONTENT_TYPES_CONFIG[t]?.shortLabel || t, n] as const)].map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setFilterType(key as DramaContentType | 'all')}
                className={`h-8 px-3 rounded-pill text-meta font-emphasis whitespace-nowrap transition-colors ${
                  filterType === key ? 'bg-accent-600 text-on-accent' : 'text-ink-muted hover:text-ink hover:bg-surface-800'
                }`}
              >
                {label}
                <span className={`ml-1.5 font-mono ${filterType === key ? 'opacity-60' : 'text-ink-subtle'}`}>{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoadingProjects && projectsList.length === 0 ? (
        <div className="flex justify-center py-24 text-ink-subtle">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : projectsList.length === 0 ? (
        <div className="block-lilac rounded-block p-10 sm:p-14 max-w-3xl">
          <p className="eyebrow !text-current opacity-70">Empieza aquí</p>
          <h2 className="text-[26px] leading-snug font-strong tracking-tight mt-2">Crea tu primera pieza</h2>
          <p className="text-body opacity-80 mt-2 max-w-md">
            Elige un formato, escribe una idea y el estudio te guía por guión, elenco, storyboard, video y montaje final.
          </p>
          <button onClick={() => setIsNewModalOpen(true)} className="btn-primary mt-6 flex items-center gap-1.5">
            <Plus size={14} /> Nueva pieza
          </button>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-body text-ink">Ninguna pieza coincide con los filtros</p>
          {isFiltering && (
            <button
              onClick={() => { setSearchTerm(''); setFilterType('all'); setSelectedWsFilter('all') }}
              className="btn-ghost text-meta mt-3"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-7">
          {filteredProjects.map((p) => {
            const typeConfig = CONTENT_TYPES_CONFIG[p.contentType || 'microdrama'] || CONTENT_TYPES_CONFIG.microdrama
            const overall = Math.max(0, Math.min(100, p.progress?.overall || 0))
            const hasFinal = !!p.progress?.stats?.hasFinalVideo
            const ws = workspaceOf(p)
            const date = new Date(p.updatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
            const stageName = STAGE_NAMES[Math.min(STAGE_NAMES.length, Math.max(1, p.currentStage || 1)) - 1]

            return (
              <div key={p.id} className="group relative">
                <button type="button" onClick={() => openProject(p.id)} className="block w-full text-left">
                  <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-surface-soft border border-hairline group-hover:border-surface-600 transition-colors">
                    {p.coverImage ? (
                      <img src={srcUrl(p.coverImage)} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-ink-subtle">
                        <Clapperboard size={28} strokeWidth={1.25} />
                      </div>
                    )}
                    <span className="absolute bottom-2 left-2 inline-flex items-center h-6 px-2 rounded-pill bg-canvas/90 font-mono text-eyebrow uppercase text-ink">
                      {typeConfig.shortLabel} · {p.aspectRatio || typeConfig.defaultAspectRatio}
                    </span>
                    {hasFinal && (
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 h-6 px-2 rounded-pill bg-accent-600 text-on-accent text-meta font-emphasis">
                        <Check size={11} /> Listo
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 px-0.5">
                    <p className="text-body font-emphasis text-ink truncate">{p.title}</p>
                    <p className="text-meta text-ink-subtle truncate">
                      {stageName} · {date}
                      {selectedWsFilter === 'all' && workspaces.length > 1 && ws ? ` · ${ws.name}` : ''}
                    </p>
                    <div className="mt-2 h-1 rounded-full bg-surface-800 overflow-hidden" title={`${overall}% completado`}>
                      <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${overall}%` }} />
                    </div>
                  </div>
                </button>

                <div className={`absolute top-2 right-2 flex items-center gap-1 transition-opacity ${movingProjectId === p.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
                  {workspaces.length > 1 && (
                    <IconAction icon={FolderInput} title="Mover a otro workspace" overlay onClick={() => setMovingProjectId(movingProjectId === p.id ? null : p.id)} />
                  )}
                  <IconAction icon={Copy} title="Duplicar" overlay onClick={() => duplicateProject(p.id)} />
                  <IconAction icon={Trash2} title="Eliminar" overlay danger onClick={() => setConfirmDelete(p)} />
                </div>

                {movingProjectId === p.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMovingProjectId(null)} />
                    <div className="absolute top-11 right-2 z-50 w-52 popover-surface rounded-2xl p-1.5">
                      <p className="eyebrow px-2 py-1.5">Mover a</p>
                      {workspaces.map((w) => {
                        const isCurrent = ws?.id === w.id
                        return (
                          <button
                            key={w.id}
                            disabled={isCurrent}
                            onClick={async () => {
                              setMovingProjectId(null)
                              await moveProjectWorkspace(p.id, w.id)
                              toast.success(`"${p.title}" movida a ${w.name}`)
                            }}
                            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left text-meta text-ink hover:bg-surface-800 disabled:hover:bg-transparent disabled:text-ink-subtle transition-colors"
                          >
                            <span className="flex items-center gap-2 truncate">
                              <span className="size-2 rounded-full flex-shrink-0" style={{ backgroundColor: w.color || 'rgb(var(--ink-subtle))' }} />
                              <span className="truncate">{w.name}</span>
                            </span>
                            {isCurrent && <Check size={12} />}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`¿Eliminar "${confirmDelete.title}"?`}
          description="Se borra la pieza con su guión, elenco y tomas. Las imágenes y videos generados siguen en tu biblioteca."
          confirmLabel="Eliminar"
          danger
          onConfirm={() => deleteProject(confirmDelete.id)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
