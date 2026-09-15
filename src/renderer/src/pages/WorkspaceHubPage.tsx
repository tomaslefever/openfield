import { useState, useEffect, useMemo } from 'react'
import {
  Plus,
  FolderKanban,
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  Check,
  X,
  Loader,
  Layers,
  Image as ImageIcon,
  Video,
  Search,
  ArrowUpDown,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace-store'
import { srcUrl } from '../services/file-url'

const PRESET_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#10b981', '#06b6d4',
]

type SortOption = 'updated' | 'created' | 'name_asc' | 'name_desc' | 'assets'
type FilterOption = 'all' | 'has_assets' | 'empty'

export function WorkspaceHubPage() {
  const { workspaces, activeId, load, create, rename, duplicate, remove, enterWorkspace } = useWorkspaceStore()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0])
  const [creating, setCreating] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('updated')
  const [filterMode, setFilterMode] = useState<FilterOption>('all')

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    load()
    const api = (window as any).electronAPI
    const unsub = api?.on?.('assets:changed', () => {
      load()
    })
    return () => {
      unsub?.()
    }
  }, [load])

  const handleCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const ws = await create(name, selectedColor)
      if (ws) {
        setNewName('')
        setShowCreateModal(false)
        await enterWorkspace(ws.id)
      }
    } finally {
      setCreating(false)
    }
  }

  const handleRename = async (id: string) => {
    const name = editingName.trim()
    if (!name) {
      setEditingId(null)
      return
    }
    setBusyId(id)
    try {
      await rename(id, name)
      setEditingId(null)
    } finally {
      setBusyId(null)
    }
  }

  const handleDuplicate = async (id: string) => {
    setBusyId(id)
    setMenuOpenId(null)
    try {
      await duplicate(id)
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (id: string) => {
    setBusyId(id)
    try {
      await remove(id)
      setDeleteConfirmId(null)
      setMenuOpenId(null)
    } finally {
      setBusyId(null)
    }
  }

  const filteredAndSortedWorkspaces = useMemo(() => {
    let list = [...workspaces]

    // Search filter
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((ws) => ws.name.toLowerCase().includes(q))
    }

    // Asset status filter
    if (filterMode === 'has_assets') {
      list = list.filter((ws) => (ws.stats?.totalAssets ?? 0) > 0)
    } else if (filterMode === 'empty') {
      list = list.filter((ws) => (ws.stats?.totalAssets ?? 0) === 0)
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'updated') {
        return (b.updatedAt || 0) - (a.updatedAt || 0)
      }
      if (sortBy === 'created') {
        return (b.createdAt || 0) - (a.createdAt || 0)
      }
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      }
      if (sortBy === 'name_desc') {
        return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' })
      }
      if (sortBy === 'assets') {
        return (b.stats?.totalAssets ?? 0) - (a.stats?.totalAssets ?? 0)
      }
      return 0
    })

    return list
  }, [workspaces, searchQuery, filterMode, sortBy])

  const isFiltering = searchQuery.trim() !== '' || filterMode !== 'all'

  return (
    <div className="relative min-h-full w-full flex flex-col bg-surface-950 text-surface-100 select-none pb-24">
      {/* Background visual atmosphere */}
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.15), transparent)',
        }}
      />
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] opacity-30" />

      {/* Main Container */}
      <div className="relative z-10 max-w-7xl w-full mx-auto px-6 py-10 flex-1 flex flex-col">
        {/* Header section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-8 border-b border-surface-800/80">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-600/20 border border-accent-500/30 flex items-center justify-center text-accent-400">
                <FolderKanban size={22} />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-surface-50">
                Workspaces
              </h1>
            </div>
            <p className="mt-2 text-sm text-surface-400 max-w-lg">
              Selecciona un workspace para acceder a tu estudio de generación (Playground, voces, música y elementos) o crea uno nuevo.
            </p>
          </div>

          <button
            onClick={() => {
              setNewName('')
              setSelectedColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)])
              setShowCreateModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-500 text-white font-medium text-sm shadow-lg shadow-accent-600/25 hover:shadow-accent-500/35 transition-all active:scale-[0.98] self-start sm:self-auto"
          >
            <Plus size={16} />
            <span>Nuevo Workspace</span>
          </button>
        </div>

        {/* Controls Bar: Search, Filter Chips & Sorting */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-6 pb-2">
          {/* Left: Search input + Filter Chips */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 max-w-2xl">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar workspaces..."
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-surface-900/90 border border-surface-800 text-xs sm:text-sm text-surface-100 placeholder:text-surface-500 outline-none focus:border-accent-500/80 focus:ring-1 focus:ring-accent-500/30 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-surface-400 hover:text-surface-200"
                  title="Limpiar búsqueda"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-1 bg-surface-900/80 border border-surface-800/90 p-1 rounded-xl shrink-0">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  filterMode === 'all'
                    ? 'bg-accent-600 text-white shadow-sm'
                    : 'text-surface-400 hover:text-surface-200'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilterMode('has_assets')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  filterMode === 'has_assets'
                    ? 'bg-accent-600 text-white shadow-sm'
                    : 'text-surface-400 hover:text-surface-200'
                }`}
              >
                Con assets
              </button>
              <button
                onClick={() => setFilterMode('empty')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  filterMode === 'empty'
                    ? 'bg-accent-600 text-white shadow-sm'
                    : 'text-surface-400 hover:text-surface-200'
                }`}
              >
                Vacíos
              </button>
            </div>
          </div>

          {/* Right: Sort selector & Counter */}
          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
            <span className="text-xs text-surface-400">
              {isFiltering
                ? `${filteredAndSortedWorkspaces.length} de ${workspaces.length}`
                : `${workspaces.length}`}{' '}
              {filteredAndSortedWorkspaces.length === 1 ? 'workspace' : 'workspaces'}
            </span>

            <div className="flex items-center gap-1.5 bg-surface-900/90 border border-surface-800 rounded-xl px-2.5 py-1.5">
              <ArrowUpDown size={13} className="text-surface-400 shrink-0" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-transparent text-xs text-surface-200 font-medium outline-none cursor-pointer pr-1"
              >
                <option value="updated" className="bg-surface-900 text-surface-200">Más recientes</option>
                <option value="created" className="bg-surface-900 text-surface-200">Más antiguos</option>
                <option value="name_asc" className="bg-surface-900 text-surface-200">Nombre (A - Z)</option>
                <option value="name_desc" className="bg-surface-900 text-surface-200">Nombre (Z - A)</option>
                <option value="assets" className="bg-surface-900 text-surface-200">Mayor cantidad de assets</option>
              </select>
            </div>
          </div>
        </div>

        {/* Workspaces Grid (4 columnas, aspecto 1:1) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 mt-4">
          {/* New workspace quick action card (si no se está filtrando o como primera opción) */}
          {!isFiltering && (
            <button
              onClick={() => {
                setNewName('')
                setSelectedColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)])
                setShowCreateModal(true)
              }}
              className="group relative aspect-square rounded-2xl border-2 border-dashed border-surface-800 hover:border-accent-500/50 bg-surface-900/20 hover:bg-surface-900/50 p-6 flex flex-col items-center justify-center gap-3 transition-all duration-200 text-center cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-surface-800 group-hover:bg-accent-600/20 group-hover:border-accent-500/40 border border-surface-700/60 flex items-center justify-center text-surface-400 group-hover:text-accent-400 transition-colors">
                <Plus size={24} />
              </div>
              <div>
                <p className="text-sm font-semibold text-surface-200 group-hover:text-white transition-colors">
                  Crear nuevo workspace
                </p>
                <p className="text-xs text-surface-500 mt-0.5">
                  Inicia un proyecto desde cero
                </p>
              </div>
            </button>
          )}

          {/* Empty state when search or filter has no matches */}
          {filteredAndSortedWorkspaces.length === 0 && isFiltering && (
            <div className="col-span-full py-16 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-surface-900 border border-surface-800 flex items-center justify-center text-surface-400 mb-3">
                <Search size={22} />
              </div>
              <h3 className="text-base font-semibold text-surface-200">No se encontraron workspaces</h3>
              <p className="text-xs text-surface-400 mt-1 max-w-sm">
                No hay ningún workspace que coincida con los criterios de búsqueda o filtrado actuales.
              </p>
              <button
                onClick={() => {
                  setSearchQuery('')
                  setFilterMode('all')
                }}
                className="mt-4 px-3.5 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-xs font-medium text-surface-200 transition-colors"
              >
                Restablecer filtros
              </button>
            </div>
          )}

          {/* Existing workspaces cards (Aspecto 1:1, Sin Footer) */}
          {filteredAndSortedWorkspaces.map((ws) => {
            const isEditing = editingId === ws.id
            const isDeleting = deleteConfirmId === ws.id
            const isMenuOpen = menuOpenId === ws.id
            const isBusy = busyId === ws.id
            const color = ws.color || '#3b82f6'
            const initial = (ws.name || 'W').charAt(0).toUpperCase()
            const dateStr = ws.updatedAt
              ? new Date(ws.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              : 'Reciente'
            const bgImage = srcUrl(ws.lastImageUrl)

            return (
              <div
                key={ws.id}
                onClick={() => {
                  if (!isEditing && !isDeleting) {
                    enterWorkspace(ws.id)
                  }
                }}
                className={`group relative aspect-square rounded-2xl border transition-all duration-300 p-4 sm:p-5 flex flex-col justify-between cursor-pointer overflow-hidden ${
                  ws.id === activeId
                    ? 'border-accent-500/60 shadow-xl shadow-accent-600/10 hover:border-accent-500/90 ring-1 ring-accent-500/30'
                    : 'border-surface-800/90 hover:border-surface-600/80 hover:shadow-xl hover:shadow-black/50'
                } bg-surface-950`}
              >
                {/* Card Background: Image or Ambient Gradient */}
                {bgImage ? (
                  <>
                    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                      <img
                        src={bgImage}
                        alt=""
                        className="w-full h-full object-cover object-center transform transition-transform duration-700 ease-out group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    {/* Deep gradient overlay for text readability & atmosphere */}
                    <div className="absolute inset-0 z-0 bg-gradient-to-t from-surface-950 via-surface-950/80 to-surface-950/45 transition-opacity duration-300 group-hover:from-surface-950 group-hover:via-surface-950/75 group-hover:to-surface-950/35 pointer-events-none" />
                    {/* Color glow */}
                    <div
                      className="absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl opacity-20 pointer-events-none group-hover:opacity-35 transition-opacity duration-500"
                      style={{ backgroundColor: color }}
                    />
                  </>
                ) : (
                  <>
                    <div className="absolute inset-0 z-0 bg-gradient-to-br from-surface-900/90 to-surface-950 pointer-events-none" />
                    <div
                      className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-15 pointer-events-none group-hover:opacity-25 transition-opacity duration-500"
                      style={{ backgroundColor: color }}
                    />
                  </>
                )}

                {/* Card Content Layers (z-10) - 1:1 Aspect Ratio without Footer */}
                <div className="relative z-10 flex flex-col justify-between h-full">
                  {/* Card Top */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm sm:text-base text-white shadow-lg flex-shrink-0 ring-1 ring-white/20"
                        style={{ backgroundColor: color }}
                      >
                        {initial}
                      </div>

                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div
                            className="flex items-center gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              autoFocus
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRename(ws.id)
                                if (e.key === 'Escape') setEditingId(null)
                              }}
                              className="bg-surface-800 border border-surface-600 rounded-lg px-2 py-1 text-xs sm:text-sm text-white outline-none w-full"
                            />
                            <button
                              onClick={() => handleRename(ws.id)}
                              className="p-1 rounded-md bg-accent-600 hover:bg-accent-500 text-white"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 rounded-md bg-surface-800 hover:bg-surface-700 text-surface-400"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <h2 className="text-sm sm:text-base font-semibold text-surface-100 group-hover:text-white truncate transition-colors drop-shadow-sm">
                              {ws.name}
                            </h2>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <p className="text-[11px] text-surface-400 truncate drop-shadow-sm">
                                {dateStr}
                              </p>
                              {ws.id === activeId && (
                                <>
                                  <span className="text-surface-600 text-[10px]">·</span>
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent-500/20 text-accent-300 text-[10px] font-medium border border-accent-500/30">
                                    <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
                                    Activo
                                  </span>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions Menu */}
                    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setMenuOpenId(isMenuOpen ? null : ws.id)}
                        className="p-1.5 rounded-lg text-surface-300 hover:text-white hover:bg-surface-800/80 bg-surface-950/50 backdrop-blur-sm border border-surface-700/40 transition-colors opacity-80 group-hover:opacity-100"
                        title="Opciones"
                      >
                        <MoreVertical size={15} />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-36 bg-surface-800/95 backdrop-blur-md border border-surface-700 rounded-xl py-1 shadow-2xl z-30">
                          <button
                            onClick={() => {
                              setEditingId(ws.id)
                              setEditingName(ws.name)
                              setMenuOpenId(null)
                            }}
                            className="w-full px-3 py-1.5 text-xs text-left text-surface-200 hover:bg-surface-700 flex items-center gap-2"
                          >
                            <Pencil size={13} />
                            <span>Renombrar</span>
                          </button>
                          <button
                            onClick={() => handleDuplicate(ws.id)}
                            className="w-full px-3 py-1.5 text-xs text-left text-surface-200 hover:bg-surface-700 flex items-center gap-2"
                          >
                            <Copy size={13} />
                            <span>Duplicar</span>
                          </button>
                          {workspaces.length > 1 && (
                            <button
                              onClick={() => {
                                setDeleteConfirmId(ws.id)
                                setMenuOpenId(null)
                              }}
                              className="w-full px-3 py-1.5 text-xs text-left text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                            >
                              <Trash2 size={13} />
                              <span>Eliminar</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom / Mini stats (No footer) */}
                  <div className="flex items-center flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-900/85 backdrop-blur-md border border-surface-700/50 text-xs font-medium text-surface-200 shadow-sm">
                      <Layers size={12} className="text-surface-400" />
                      <span>{ws.stats?.totalAssets ?? 0}</span>
                      <span className="text-[10px] text-surface-400 font-normal">assets</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-surface-300 bg-surface-950/70 backdrop-blur-md px-2.5 py-1 rounded-lg border border-surface-800/70 shadow-sm">
                      <span className="flex items-center gap-1" title="Imágenes">
                        <ImageIcon size={11} className="text-surface-400" />
                        <span>{ws.stats?.images ?? 0}</span>
                      </span>
                      <span className="text-surface-600">·</span>
                      <span className="flex items-center gap-1" title="Videos">
                        <Video size={11} className="text-surface-400" />
                        <span>{ws.stats?.videos ?? 0}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Confirm delete overlay */}
                {isDeleting && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute inset-0 bg-surface-900/95 backdrop-blur-sm rounded-2xl p-4 flex flex-col justify-center items-center text-center z-30"
                  >
                    <p className="text-xs font-semibold text-red-400 mb-1">
                      ¿Eliminar workspace "{ws.name}"?
                    </p>
                    <p className="text-[11px] text-surface-400 mb-3">
                      Esta acción no se puede deshacer.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDelete(ws.id)}
                        disabled={isBusy}
                        className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium flex items-center gap-1"
                      >
                        {isBusy ? <Loader size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        Eliminar
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-3 py-1 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 text-xs"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal: Create Workspace */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div
            className="w-full max-w-md bg-surface-900 border border-surface-800 rounded-2xl shadow-2xl p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-surface-800">
              <h2 className="text-lg font-semibold text-white">Nuevo Workspace</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-surface-400 hover:text-white hover:bg-surface-800"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-surface-300 mb-1.5">
                  Nombre del Workspace
                </label>
                <input
                  autoFocus
                  type="text"
                  placeholder="Ej. Campaña Primavera, Videojuego Alpha..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-800/80 border border-surface-700 text-sm text-white placeholder:text-surface-500 outline-none focus:border-accent-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-300 mb-2">
                  Color distintivo
                </label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform flex items-center justify-center ${
                        selectedColor === c ? 'scale-110 ring-2 ring-white/60' : 'hover:scale-105 opacity-80'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {selectedColor === c && <Check size={12} className="text-white drop-shadow" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-surface-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-surface-800 hover:bg-surface-700 text-sm text-surface-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim() || creating}
                  className="px-5 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-sm font-medium text-white shadow-lg shadow-accent-600/20 transition-all"
                >
                  {creating ? 'Creando...' : 'Crear Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
