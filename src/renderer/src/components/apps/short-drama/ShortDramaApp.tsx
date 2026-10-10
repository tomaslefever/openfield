import { useEffect, useState } from 'react'
import { ChevronLeft, Check, Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { useShortDramaStore } from '../../../stores/short-drama-store'
import { DramaProjectList } from './DramaProjectList'
import { Stage1Script } from './Stage1Script'
import { Stage2Characters } from './Stage2Characters'
import { Stage3Shots } from './Stage3Shots'
import { Stage6Assembly } from './Stage6Assembly'
import { ConfirmDialog } from './ui'
import { CONTENT_TYPES_CONFIG } from '../../../lib/content-type-prompts'

interface Props {
  onClose?: () => void
}

// Storyboard and video are one stage (3); assembly keeps its stored id (5) so saved projects still open there
const STAGES = [
  { stage: 1, label: 'Guión' },
  { stage: 2, label: 'Elenco' },
  { stage: 3, label: 'Tomas' },
  { stage: 5, label: 'Ensamblaje' },
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
    setStage,
    setMetadata,
    runFullAutoPipeline,
    fetchProjectsList,
    reset,
  } = useShortDramaStore()
  const [confirmReset, setConfirmReset] = useState(false)

  const activeConfig = CONTENT_TYPES_CONFIG[contentType || 'microdrama'] || CONTENT_TYPES_CONFIG.microdrama

  useEffect(() => {
    fetchProjectsList()
  }, [fetchProjectsList])

  if (viewMode === 'hub') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {onClose && (
          <div className="flex items-center px-4 h-12 border-b border-hairline flex-shrink-0">
            <button onClick={onClose} className="btn-ghost flex items-center gap-1 text-meta">
              <ChevronLeft size={14} /> Apps
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          <DramaProjectList />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="flex items-center gap-3 px-4 h-12 border-b border-hairline flex-shrink-0">
        <button onClick={() => setViewMode('hub')} className="btn-ghost flex items-center gap-1 text-meta flex-shrink-0">
          <ChevronLeft size={14} /> Piezas
        </button>
        <span className="w-px h-5 bg-hairline flex-shrink-0" />
        <input
          type="text"
          value={title}
          onChange={(e) => setMetadata({ title: e.target.value })}
          placeholder="Título de la pieza"
          className="min-w-0 w-full max-w-xs bg-transparent text-title text-ink outline-none rounded-md px-2 py-1 hover:bg-surface-soft focus:bg-surface-soft transition-colors truncate"
        />
        <span
          className="hidden sm:inline-flex items-center h-6 px-2.5 rounded-pill border border-hairline font-mono text-eyebrow uppercase text-ink-muted flex-shrink-0"
          title="Formato fijado al crear la pieza"
        >
          {activeConfig.shortLabel} · {aspectRatio}
        </span>
        <span className="hidden md:flex items-center gap-1 text-meta text-ink-subtle flex-shrink-0">
          {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          {isSaving ? 'Guardando' : 'Guardado'}
        </span>

        <div className="flex-1" />

        <button onClick={() => setConfirmReset(true)} className="btn-icon size-8 flex-shrink-0" title="Reiniciar contenido">
          <RotateCcw size={13} />
        </button>
        <button
          onClick={() => runFullAutoPipeline()}
          disabled={isAutoRunning}
          className="btn-primary flex items-center gap-1.5 flex-shrink-0 max-w-[280px]"
          title="Genera guión, elenco, frames, videos y el montaje final en orden"
        >
          {isAutoRunning ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          <span className="truncate">{isAutoRunning ? autoRunStatus || 'Produciendo…' : 'Producir todo'}</span>
        </button>
      </header>

      <nav className="flex items-center gap-1 px-4 h-11 border-b border-hairline overflow-x-auto flex-shrink-0">
        {STAGES.map((s, i) => {
          const isCurrent = currentStage === s.stage
          const isPast = currentStage > s.stage
          return (
            <button
              key={s.stage}
              onClick={() => setStage(s.stage)}
              className={`flex items-center gap-2 h-8 pl-1.5 pr-3 rounded-pill text-meta whitespace-nowrap transition-colors ${
                isCurrent ? 'bg-surface-soft text-ink font-emphasis' : 'text-ink-muted hover:text-ink hover:bg-surface-soft'
              }`}
            >
              <span
                className={`size-5 rounded-full flex items-center justify-center font-mono text-[10px] ${
                  isCurrent
                    ? 'bg-accent-600 text-on-accent'
                    : isPast
                      ? 'border border-ink/60 text-ink'
                      : 'border border-hairline text-ink-subtle'
                }`}
              >
                {isPast ? <Check size={10} /> : i + 1}
              </span>
              {s.label}
            </button>
          )
        })}
      </nav>

      <div className="flex-1 overflow-hidden">
        {currentStage === 1 && <Stage1Script />}
        {currentStage === 2 && <Stage2Characters />}
        {(currentStage === 3 || currentStage === 4) && <Stage3Shots />}
        {currentStage === 5 && <Stage6Assembly />}
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="¿Reiniciar el contenido?"
          description="Se borran el guión, el elenco, las tomas y el montaje de esta pieza. El título y el formato se mantienen; las imágenes y videos siguen en tu biblioteca."
          confirmLabel="Reiniciar"
          danger
          onConfirm={reset}
          onClose={() => setConfirmReset(false)}
        />
      )}
    </div>
  )
}
