import React, { useEffect, useState } from 'react'
import {
  Plus,
  Search,
  Sparkles,
  Film,
  Calendar,
  Layers,
  Copy,
  Trash2,
  Play,
  CheckCircle2,
  Clock,
  Video,
  Mic,
  Users,
  MapPin,
  Package,
  Image as ImageIcon,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Clapperboard,
  Filter,
  Folder,
  FolderInput,
  Check,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspaceStore } from '../../../stores/workspace-store'
import { useShortDramaStore, DramaProjectSummary } from '../../../stores/short-drama-store'
import { srcUrl } from '../../../services/file-url'
import { NewProjectModal } from './NewProjectModal'
import {
  DramaContentType,
  CONTENT_TYPES_CONFIG,
} from '../../../lib/content-type-prompts'

export const DramaProjectList: React.FC = () => {
  const { workspaces } = useWorkspaceStore()
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
  const [filterGenre, setFilterGenre] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [selectedWsFilter, setSelectedWsFilter] = useState<string>('all')
  const [movingProjectId, setMovingProjectId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)

  useEffect(() => {
    fetchProjectsList(selectedWsFilter)
  }, [selectedWsFilter])

  const filteredProjects = projectsList.filter((p) => {
    const title = (p.title || '').toLowerCase()
    const logline = (p.logline || p.ideaPrompt || '').toLowerCase()
    const genre = (p.genre || '').toLowerCase()
    const search = searchTerm.toLowerCase()
    const pType = p.contentType || 'microdrama'

    const matchesSearch =
      title.includes(search) ||
      logline.includes(search) ||
      genre.includes(search)
    const matchesGenre = filterGenre === 'all' || p.genre === filterGenre
    const matchesType = filterType === 'all' || pType === filterType
    const matchesWorkspace =
      selectedWsFilter === 'all' ||
      p.workspaceId === selectedWsFilter ||
      (!p.workspaceId && workspaces.find((w) => w.name.toLowerCase() === 'default')?.id === selectedWsFilter)

    return matchesSearch && matchesGenre && matchesType && matchesWorkspace
  })

  // Global metrics
  const totalProjects = projectsList.length
  const totalVideos = projectsList.reduce((acc, p) => acc + (p.progress?.stats?.genVideos || 0), 0)
  const completedProjects = projectsList.filter((p) => p.progress?.stats?.hasFinalVideo).length
  const avgProgress =
    totalProjects > 0
      ? Math.round(projectsList.reduce((acc, p) => acc + (p.progress?.overall || 0), 0) / totalProjects)
      : 0

  const genres = Array.from(new Set(projectsList.map((p) => p.genre).filter(Boolean))) as string[]

  const handleCreateNew = async (data: {
    title: string
    contentType: DramaContentType
    customPromptGuide?: string
    workspaceId?: string
  }) => {
    setIsNewModalOpen(false)
    await createNewProject({
      title: data.title,
      contentType: data.contentType,
      customPromptGuide: data.customPromptGuide,
      workspaceId: data.workspaceId,
    })
    if (data.workspaceId && selectedWsFilter !== 'all' && selectedWsFilter !== data.workspaceId) {
      setSelectedWsFilter(data.workspaceId)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* New Project Modal */}
      <NewProjectModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onCreate={handleCreateNew}
      />

      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-950/80 border border-surface-800/80 rounded-2xl p-6 backdrop-blur-md shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-accent-500/10 border border-accent-500/30 text-accent-400">
              <Clapperboard size={22} />
            </div>
            <h2 className="text-xl font-bold text-surface-100 tracking-tight">
              Content Studio
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-accent-600/20 text-accent-400 border border-accent-500/30">
              Multi-Formato AI
            </span>
          </div>
          <p className="text-xs text-surface-400 max-w-2xl leading-relaxed">
            Producción audiovisual completa de Microdramas, UGC, Spots TVC, Anuncios Ads, Reels virales, Lookbooks Try On y Unboxing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchProjectsList()}
            disabled={isLoadingProjects}
            className="p-2.5 rounded-xl bg-surface-900 hover:bg-surface-800 border border-surface-800 text-surface-400 hover:text-surface-200 transition-colors"
            title="Recargar historias de SQLite"
          >
            <RefreshCw size={16} className={isLoadingProjects ? 'animate-spin text-accent-400' : ''} />
          </button>
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="btn-primary flex items-center justify-center gap-2 px-5 py-2.5 shadow-lg shadow-accent-600/20 whitespace-nowrap"
          >
            <Plus size={16} />
            <span className="font-semibold text-xs">Nueva Pieza</span>
          </button>
        </div>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-surface-950/60 border border-surface-800 rounded-xl p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Film size={18} />
          </div>
          <div>
            <div className="text-[11px] text-surface-400 font-medium">Historias Creadas</div>
            <div className="text-lg font-bold text-surface-100">{totalProjects}</div>
          </div>
        </div>

        <div className="bg-surface-950/60 border border-surface-800 rounded-xl p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20">
            <Video size={18} />
          </div>
          <div>
            <div className="text-[11px] text-surface-400 font-medium">Clips de Video</div>
            <div className="text-lg font-bold text-surface-100">{totalVideos}</div>
          </div>
        </div>

        <div className="bg-surface-950/60 border border-surface-800 rounded-xl p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className="text-[11px] text-surface-400 font-medium">Episodios Completos</div>
            <div className="text-lg font-bold text-surface-100">{completedProjects}</div>
          </div>
        </div>

        <div className="bg-surface-950/60 border border-surface-800 rounded-xl p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <TrendingUp size={18} />
          </div>
          <div>
            <div className="text-[11px] text-surface-400 font-medium">Progreso Promedio</div>
            <div className="text-lg font-bold text-surface-100">{avgProgress}%</div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="space-y-2.5 bg-surface-900/60 border border-surface-800/80 rounded-xl p-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por título, sinopsis o género..."
              className="w-full bg-surface-950 border border-surface-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-accent-500/50"
            />
          </div>

          {/* Workspace Filter Dropdown */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-[10px] uppercase tracking-wider text-surface-400 font-semibold flex items-center gap-1 flex-shrink-0">
              <Folder size={12} className="text-accent-400" /> Workspace:
            </span>
            <select
              value={selectedWsFilter}
              onChange={(e) => setSelectedWsFilter(e.target.value)}
              className="bg-surface-950 border border-surface-800 rounded-lg px-2.5 py-1.5 text-xs text-surface-200 focus:outline-none focus:border-accent-500/50 cursor-pointer"
            >
              <option value="all">Todos los Workspaces ({projectsList.length})</option>
              {workspaces.map((ws) => {
                const count = projectsList.filter(
                  (p) =>
                    p.workspaceId === ws.id ||
                    (!p.workspaceId && ws.name.toLowerCase() === 'default')
                ).length
                return (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} ({count})
                  </option>
                )
              })}
            </select>
          </div>
        </div>

        {/* Content Type Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-surface-800/60">
          <span className="text-[10px] uppercase tracking-wider text-surface-500 font-semibold flex items-center gap-1 mr-1 flex-shrink-0">
            <Filter size={10} /> Formato:
          </span>
          <button
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
              filterType === 'all'
                ? 'bg-accent-600 text-white shadow-sm'
                : 'bg-surface-950 text-surface-400 hover:text-surface-200 border border-surface-800'
            }`}
          >
            Todos ({totalProjects})
          </button>
          {(Object.keys(CONTENT_TYPES_CONFIG) as DramaContentType[]).map((tKey) => {
            const conf = CONTENT_TYPES_CONFIG[tKey]
            const count = projectsList.filter((p) => (p.contentType || 'microdrama') === tKey).length
            if (count === 0 && filterType !== tKey) return null
            return (
              <button
                key={tKey}
                onClick={() => setFilterType(tKey)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  filterType === tKey
                    ? `${conf.badgeBg} ${conf.badgeColor} border ${conf.badgeBorder} font-bold shadow-sm`
                    : 'bg-surface-950 text-surface-400 hover:text-surface-200 border border-surface-800'
                }`}
              >
                <span>{conf.shortLabel}</span>
                <span className="text-[9px] opacity-70">({count})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Projects Grid / Empty State */}
      {isLoadingProjects ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-surface-400">
          <div className="w-8 h-8 border-2 border-accent-500/20 border-t-accent-500 rounded-full animate-spin" />
          <span className="text-xs">Cargando piezas desde SQLite...</span>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-surface-950/40 border border-dashed border-surface-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-3">
          <div className="p-4 rounded-2xl bg-surface-900 text-surface-500 border border-surface-800">
            <Clapperboard size={36} />
          </div>
          <h3 className="text-base font-semibold text-surface-200">
            {searchTerm || filterType !== 'all' ? 'No se encontraron piezas con ese filtro' : 'Aún no tienes piezas creadas'}
          </h3>
          <p className="text-xs text-surface-500 max-w-md">
            Crea tu primera pieza audiovisual con IA. Elige entre Microdramas, UGC, Anuncios Ads, Spots TVC, Reels virales, Lookbooks Try On o Unboxing.
          </p>
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="btn-primary text-xs flex items-center gap-2 mt-2 px-4 py-2"
          >
            <Plus size={14} /> Crear mi primera Pieza
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((p) => {
            const pType: DramaContentType = p.contentType || 'microdrama'
            const typeConfig = CONTENT_TYPES_CONFIG[pType] || CONTENT_TYPES_CONFIG.microdrama

            const stats = p.progress?.stats || {
              totalChars: 0,
              genChars: 0,
              totalScns: 0,
              genScns: 0,
              totalProps: 0,
              genProps: 0,
              totalShots: 0,
              genKeyframes: 0,
              genVideos: 0,
              totalVoices: 0,
              genVoices: 0,
              hasFinalVideo: false,
            }

            const overall = p.progress?.overall || 0
            const isVertical = p.aspectRatio === '9:16'
            const formattedDate = new Date(p.updatedAt).toLocaleDateString('es-ES', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })
            const projectWs =
              workspaces.find((w) => w.id === p.workspaceId) ||
              workspaces.find((w) => w.name.toLowerCase() === 'default') ||
              workspaces[0]

            return (
              <div
                key={p.id}
                className="bg-surface-950/80 border border-surface-800 hover:border-surface-700 rounded-2xl overflow-hidden flex flex-col justify-between transition-all duration-200 shadow-md group hover:shadow-xl"
              >
                {/* Project Header & Cover Media */}
                <div>
                  <div
                    onClick={() => openProject(p.id)}
                    className="relative w-full aspect-square bg-surface-900 overflow-hidden cursor-pointer flex items-center justify-center border-b border-surface-800"
                  >
                    {p.coverImage ? (
                      <img
                        src={srcUrl(p.coverImage)}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-surface-600 gap-1.5">
                        <Clapperboard size={32} />
                        <span className="text-[10px]">Sin Portada</span>
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    {/* Content Type & Format Badges (Top Left) */}
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                      <div className={`px-2.5 py-0.5 rounded-md backdrop-blur-md text-[10px] font-bold ${typeConfig.badgeBg} ${typeConfig.badgeColor} border ${typeConfig.badgeBorder} flex items-center gap-1`}>
                        {typeConfig.shortLabel}
                      </div>
                      <div className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-mono text-surface-300 border border-white/10">
                        {p.aspectRatio || typeConfig.defaultAspectRatio}
                      </div>
                    </div>

                    {/* Stage Badge (Top Right) */}
                    <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-semibold text-surface-200 border border-white/10 flex items-center gap-1">
                      Etapa {p.currentStage}/5
                    </div>

                    {/* Title overlay in image bottom */}
                    <div className="absolute bottom-2.5 left-3 right-3">
                      <h3 className="text-sm font-bold text-white truncate drop-shadow-md">
                        {p.title}
                      </h3>
                      <span className="text-[10px] text-accent-300 font-medium drop-shadow-sm">
                        {p.genre || typeConfig.genres[0]}
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-4 space-y-3.5">
                    {/* Logline */}
                    <p className="text-[11px] text-surface-400 line-clamp-2 leading-relaxed h-8">
                      {p.logline || p.ideaPrompt || 'Sin sinopsis redactada aún...'}
                    </p>

                    {/* Overall Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-surface-300 flex items-center gap-1">
                          <TrendingUp size={12} className="text-accent-400" /> Progreso General
                        </span>
                        <span className="font-bold text-accent-400">{overall}%</span>
                      </div>
                      <div className="w-full h-2 bg-surface-900 rounded-full overflow-hidden border border-surface-800">
                        <div
                          className="h-full bg-gradient-to-r from-accent-600 via-indigo-500 to-emerald-400 rounded-full transition-all duration-300"
                          style={{ width: `${overall}%` }}
                        />
                      </div>
                    </div>

                    {/* Stage by Stage Status Pills (5 Stages) */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-surface-850 text-[10px]">
                      {/* Stage 1: Script */}
                      <div
                        className={`p-1.5 rounded border flex items-center gap-1.5 ${
                          p.progress?.stage1 === 100
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                            : 'bg-surface-900 border-surface-800 text-surface-500'
                        }`}
                        title="Etapa 1: Guión & Desglose"
                      >
                        <Sparkles size={11} className="flex-shrink-0" />
                        <span className="truncate">Guión {p.progress?.stage1 === 100 ? '✓' : '—'}</span>
                      </div>

                      {/* Stage 2: Cast (Chars & Props) */}
                      <div
                        className={`p-1.5 rounded border flex items-center gap-1.5 ${
                          p.progress?.stage2 === 100
                            ? 'bg-blue-500/10 border-blue-500/20 text-blue-300'
                            : stats.genChars + stats.genScns + stats.genProps > 0
                            ? 'bg-blue-500/5 border-blue-500/20 text-blue-400'
                            : 'bg-surface-900 border-surface-800 text-surface-500'
                        }`}
                        title="Etapa 2: Personajes, Locaciones y Props"
                      >
                        <Users size={11} className="flex-shrink-0" />
                        <span className="truncate">
                          Fichas {stats.genChars + stats.genScns + stats.genProps}/
                          {stats.totalChars + stats.totalScns + stats.totalProps}
                        </span>
                      </div>

                      {/* Stage 3: Storyboard (Keyframes & Audio) */}
                      <div
                        className={`p-1.5 rounded border flex items-center gap-1.5 ${
                          p.progress?.stage3 === 100
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                            : stats.genKeyframes > 0 || stats.genVoices > 0
                            ? 'bg-amber-500/5 border-amber-500/20 text-amber-400'
                            : 'bg-surface-900 border-surface-800 text-surface-500'
                        }`}
                        title="Etapa 3: Storyboard (Frames y Diálogos sintetizados)"
                      >
                        <ImageIcon size={11} className="flex-shrink-0" />
                        <span className="truncate">Frames {stats.genKeyframes}/{stats.totalShots}</span>
                      </div>

                      {/* Stage 4: Videos (I2V) */}
                      <div
                        className={`p-1.5 rounded border flex items-center gap-1.5 ${
                          p.progress?.stage4 === 100
                            ? 'bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-300'
                            : stats.genVideos > 0
                            ? 'bg-fuchsia-500/5 border-fuchsia-500/20 text-fuchsia-400'
                            : 'bg-surface-900 border-surface-800 text-surface-500'
                        }`}
                        title="Etapa 4: Videos Animados con LipSync"
                      >
                        <Video size={11} className="flex-shrink-0" />
                        <span className="truncate">Clips {stats.genVideos}/{stats.totalShots}</span>
                      </div>

                      {/* Stage 5: Final Assembly */}
                      <div
                        className={`p-1.5 rounded border flex items-center gap-1.5 col-span-2 ${
                          stats.hasFinalVideo
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300 font-semibold'
                            : 'bg-surface-900 border-surface-800 text-surface-500'
                        }`}
                        title="Etapa 5: Episodio Ensamblado con Subtítulos y Música"
                      >
                        <CheckCircle2 size={11} className="flex-shrink-0" />
                        <span className="truncate">{stats.hasFinalVideo ? 'Video Final Listo ✓' : 'Ensamble Pendiente'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="p-3 bg-surface-900/60 border-t border-surface-800 flex items-center justify-between gap-2 relative">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1 text-[10px] text-surface-500">
                      <Clock size={11} /> {formattedDate}
                    </div>
                    {/* Workspace indicator */}
                    <div
                      className="flex items-center gap-1.5 text-[10px] text-surface-400 truncate"
                      title={`Workspace: ${projectWs?.name || 'Default'}`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: projectWs?.color || '#6366f1' }}
                      />
                      <span className="truncate max-w-[85px] font-medium text-surface-300">
                        {projectWs?.name || 'Default'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Move Workspace Button */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setMovingProjectId(movingProjectId === p.id ? null : p.id)
                        }}
                        className={`p-1.5 rounded text-[10px] flex items-center gap-1 border transition-colors ${
                          movingProjectId === p.id
                            ? 'bg-accent-600 text-white border-accent-500'
                            : 'bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-surface-200 border-surface-700'
                        }`}
                        title="Mover a otro Workspace"
                      >
                        <FolderInput size={12} />
                      </button>

                      {/* Dropdown Menu when clicked */}
                      {movingProjectId === p.id && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={(e) => {
                              e.stopPropagation()
                              setMovingProjectId(null)
                            }}
                          />
                          <div
                            className="absolute bottom-full right-0 mb-2 w-52 bg-surface-950 border border-surface-750 rounded-xl shadow-2xl z-50 p-2 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="px-2 py-1 text-[10px] font-semibold text-surface-400 uppercase tracking-wider border-b border-surface-800 mb-1.5 flex items-center justify-between">
                              <span className="flex items-center gap-1">
                                <FolderInput size={11} className="text-accent-400" /> Mover Workspace
                              </span>
                              <button
                                onClick={() => setMovingProjectId(null)}
                                className="text-surface-500 hover:text-surface-300"
                              >
                                <X size={12} />
                              </button>
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-0.5">
                              {workspaces.map((ws) => {
                                const isCurrent =
                                  (p.workspaceId || '') === ws.id ||
                                  (!p.workspaceId && ws.name.toLowerCase() === 'default')
                                return (
                                  <button
                                    key={ws.id}
                                    disabled={isCurrent}
                                    onClick={async () => {
                                      setMovingProjectId(null)
                                      await moveProjectWorkspace(p.id, ws.id)
                                      toast.success(`"${p.title}" movido a ${ws.name}`)
                                    }}
                                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors ${
                                      isCurrent
                                        ? 'bg-accent-600/15 text-accent-300 font-medium cursor-default'
                                        : 'hover:bg-surface-800 text-surface-300 hover:text-white'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      <span
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: ws.color || '#6366f1' }}
                                      />
                                      <span className="truncate text-[11px]">{ws.name}</span>
                                    </div>
                                    {isCurrent && <Check size={12} className="text-accent-400 flex-shrink-0" />}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <button
                      onClick={() => duplicateProject(p.id)}
                      className="p-1.5 rounded bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-surface-200 border border-surface-700 text-[10px]"
                      title="Duplicar Microserie"
                    >
                      <Copy size={12} />
                    </button>

                    {deleteConfirmId === p.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            deleteProject(p.id)
                            setDeleteConfirmId(null)
                          }}
                          className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold"
                        >
                          ¿Eliminar?
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-1.5 py-1 rounded bg-surface-800 text-surface-300 text-[10px]"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(p.id)}
                        className="p-1.5 rounded bg-surface-800 hover:bg-red-500/20 hover:text-red-400 text-surface-500 border border-surface-700 text-[10px]"
                        title="Eliminar de SQLite"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}

                    <button
                      onClick={() => openProject(p.id)}
                      className="btn-primary px-3 py-1 text-[11px] flex items-center gap-1"
                    >
                      <span>Abrir</span>
                      <ArrowRight size={11} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
