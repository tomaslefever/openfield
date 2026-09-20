import { useEffect } from 'react'
import {
  Clapperboard,
  FileText,
  User,
  Film,
  Video,
  AudioLines,
  Sparkles,
  ChevronLeft,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  Layers,
  Save,
  ArrowLeft,
  Lock,
} from 'lucide-react'
import { useShortDramaStore } from '../../../stores/short-drama-store'
import { DramaProjectList } from './DramaProjectList'
import { Stage1Script } from './Stage1Script'
import { Stage2Characters } from './Stage2Characters'
import { Stage3Storyboard } from './Stage3Storyboard'
import { Stage4VideoGen } from './Stage4VideoGen'
import { Stage6Assembly } from './Stage6Assembly'
import {
  DramaContentType,
  CONTENT_TYPES_CONFIG,
} from '../../../lib/content-type-prompts'

interface Props {
  onClose?: () => void
}

const STAGES = [
  { stage: 1, label: 'Guión & Desglose', icon: FileText },
  { stage: 2, label: 'Personajes & Props', icon: User },
  { stage: 3, label: 'Storyboard, Frames & Audio', icon: Film },
  { stage: 4, label: 'Animación a Video & LipSync', icon: Video },
  { stage: 5, label: 'Ensamblaje & Export', icon: Clapperboard },
]

export function ShortDramaApp({ onClose }: Props) {
  const {
    viewMode,
    setViewMode,
    title,
    contentType,
    aspectRatio,
    currentStage,
    isAutoRunning,
    autoRunStatus,
    isSaving,
    lastSavedAt,
    setStage,
    setMetadata,
    runFullAutoPipeline,
    fetchProjectsList,
    reset,
  } = useShortDramaStore()

  const activeConfig = CONTENT_TYPES_CONFIG[contentType || 'microdrama'] || CONTENT_TYPES_CONFIG.microdrama

  useEffect(() => {
    fetchProjectsList()
  }, [])

  // ─── 1. Hub / Dashboard Mode (List of all projects) ─────────────
  if (viewMode === 'hub') {
    return (
      <div className="flex flex-col h-full bg-surface-950 text-surface-100 overflow-hidden">
        {onClose && (
          <div className="flex items-center px-6 py-2 border-b border-surface-800 bg-surface-900/80 flex-shrink-0">
            <button
              onClick={onClose}
              className="text-surface-400 hover:text-surface-100 p-1.5 rounded-lg hover:bg-surface-800 transition-colors flex items-center gap-1.5 text-xs"
              title="Cerrar y volver al catálogo de Apps"
            >
              <ChevronLeft size={16} />
              <span>Volver a Apps</span>
            </button>
          </div>
        )}

        {/* Projects Dashboard */}
        <div className="flex-1 overflow-y-auto p-6">
          <DramaProjectList />
        </div>
      </div>
    )
  }

  // ─── 2. Editor Mode (6-Stage Production Pipeline) ───────────────
  return (
    <div className="flex flex-col h-full bg-surface-950 text-surface-100 overflow-hidden">
      {/* Top Main Navigation Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-surface-800 bg-surface-900/80 backdrop-blur-md flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewMode('hub')}
            className="btn-ghost text-xs flex items-center gap-1.5 text-surface-300 hover:text-surface-100 px-2.5 py-1.5 rounded-lg border border-surface-800 hover:border-surface-700"
            title="Volver a mis piezas de Content Studio"
          >
            <ArrowLeft size={14} />
            <span>Mis Piezas</span>
          </button>

          <div className="w-8 h-8 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center flex-shrink-0">
            <Clapperboard size={16} className="text-accent-400" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setMetadata({ title: e.target.value })}
                className="font-bold text-sm text-surface-100 bg-transparent hover:bg-surface-800/50 focus:bg-surface-800 px-1.5 py-0.5 rounded outline-none border border-transparent focus:border-surface-700 transition-colors max-w-[240px] sm:max-w-xs truncate"
                placeholder="Título de la Pieza"
              />

              {/* Immutable Format & Aspect Ratio Badge */}
              <div
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${activeConfig.badgeBg} ${activeConfig.badgeColor} border ${activeConfig.badgeBorder} flex items-center gap-1`}
                title="Tipo de contenido fijado para este proyecto"
              >
                <span>{activeConfig.shortLabel}</span>
                <span className="opacity-70 font-mono text-[9px]">{aspectRatio}</span>
                <Lock size={9} className="opacity-70 ml-0.5" />
              </div>

              {isSaving ? (
                <span className="text-[10px] text-accent-400 flex items-center gap-1">
                  <RefreshCw size={10} className="animate-spin" /> Guardando...
                </span>
              ) : (
                <span className="text-[10px] text-emerald-400/80 flex items-center gap-1 font-mono">
                  <CheckCircle2 size={10} /> SQLite Guardado
                </span>
              )}
            </div>
            <p className="text-[11px] text-surface-500">
              Pipeline de producción audiovisual por etapas: {activeConfig.tagline}
            </p>
          </div>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => runFullAutoPipeline()}
            disabled={isAutoRunning}
            className="btn-primary text-xs flex items-center gap-1.5 px-3.5 py-1.5 shadow-lg shadow-accent-500/20"
          >
            {isAutoRunning ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                <span>{autoRunStatus || 'Ejecutando Pipeline...'}</span>
              </>
            ) : (
              <>
                <Sparkles size={13} />
                <span>1-Click Full Auto</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              if (confirm('¿Deseas reiniciar la configuración de este proyecto?')) {
                reset()
              }
            }}
            className="btn-ghost text-xs flex items-center gap-1 text-surface-400 hover:text-surface-200"
            title="Reiniciar campos"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* 6-Stage Progress Indicator Bar */}
      <div className="flex items-center justify-between px-6 py-2 border-b border-surface-800/80 bg-surface-900/40 overflow-x-auto gap-2 flex-shrink-0">
        {STAGES.map((s) => {
          const isCurrent = currentStage === s.stage
          const isPast = currentStage > s.stage
          const Icon = s.icon

          return (
            <button
              key={s.stage}
              onClick={() => setStage(s.stage)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap ${
                isCurrent
                  ? 'bg-accent-500/20 text-accent-300 font-semibold border border-accent-500/40 shadow-sm'
                  : isPast
                  ? 'text-surface-300 hover:text-surface-100 hover:bg-surface-800/50'
                  : 'text-surface-500 hover:text-surface-400 hover:bg-surface-800/30'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isCurrent
                    ? 'bg-accent-500 text-white'
                    : isPast
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-surface-800 text-surface-400'
                }`}
              >
                {isPast ? <CheckCircle2 size={12} /> : s.stage}
              </span>
              <Icon size={13} className={isCurrent ? 'text-accent-400' : 'text-surface-500'} />
              <span>{s.label}</span>
            </button>
          )
        })}
      </div>

      {/* Stage Views Container */}
      <div className="flex-1 overflow-hidden">
        {currentStage === 1 && <Stage1Script />}
        {currentStage === 2 && <Stage2Characters />}
        {currentStage === 3 && <Stage3Storyboard />}
        {currentStage === 4 && <Stage4VideoGen />}
        {currentStage === 5 && <Stage6Assembly />}
      </div>
    </div>
  )
}
