import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Video,
  Sparkles,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Volume2,
  History,
  FileText,
  Image as ImageIcon,
  GripVertical,
  Copy,
  Trash2,
  Layers,
  Info,
} from 'lucide-react'
import {
  useShortDramaStore,
  DramaShot,
  DramaCharacter,
  DramaProp,
  DramaScenario,
} from '../../../stores/short-drama-store'
import { ModelSelectorDropdown } from '../../models/ModelSelectorDropdown'
import { ResolutionSelector } from '../../models/ResolutionSelector'
import { AspectRatioSelector } from '../../models/AspectRatioSelector'
import { PromptComposer } from '../../PromptComposer'
import { GenerationHistoryModal } from './GenerationHistoryModal'
import { Switch } from '../../ui/switch'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../../ui/tooltip'
import { srcUrl } from '../../../services/file-url'
import { ModelPricing, cleanModelName } from '../../../lib/models'

function getAspectRatioStyle(ratio?: string): React.CSSProperties {
  if (!ratio) return { aspectRatio: '9 / 16' }
  const parts = ratio.split(':')
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { aspectRatio: `${parts[0]} / ${parts[1]}` }
  }
  return { aspectRatio: '9 / 16' }
}

export function Stage4VideoGen() {
  const {
    characters,
    scenarios,
    props,
    shots,
    videoModel,
    videoResolution,
    videoDuration,
    aspectRatio,
    visualStyle,
    isSequentialVideoGen,
    videoGenBatchSize,
    setIsSequentialVideoGen,
    setVideoGenBatchSize,
    setVideoModel,
    setMetadata,
    updateShot,
    duplicateShot,
    removeShot,
    reorderShots,
    generateShotVideo,
    generateAllVideos,
    restoreShotVideo,
    syncPendingTasks,
    setStage,
  } = useShortDramaStore()

  useEffect(() => {
    syncPendingTasks()
  }, [])

  const [historyModalShot, setHistoryModalShot] = useState<DramaShot | null>(null)
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null)
  const [dragOverReorderCardId, setDragOverReorderCardId] = useState<string | null>(null)

  const handleDragStartCard = (shotId: string, e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-drama-shot-id', shotId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedCardId(shotId)
  }

  const handleDragOverCard = (shotId: string, e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-drama-shot-id')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (dragOverReorderCardId !== shotId) {
        setDragOverReorderCardId(shotId)
      }
    }
  }

  const handleDropReorderCard = (targetShotId: string, e: React.DragEvent) => {
    const sourceShotId = e.dataTransfer.getData('application/x-drama-shot-id')
    setDraggedCardId(null)
    setDragOverReorderCardId(null)
    if (sourceShotId && sourceShotId !== targetShotId) {
      e.preventDefault()
      e.stopPropagation()
      const fromIdx = shots.findIndex((s) => s.id === sourceShotId)
      const toIdx = shots.findIndex((s) => s.id === targetShotId)
      if (fromIdx !== -1 && toIdx !== -1) {
        reorderShots(fromIdx, toIdx)
      }
    }
  }

  const handleDragEndCard = () => {
    setDraggedCardId(null)
    setDragOverReorderCardId(null)
  }

  const isAnyGenerating = shots.some(
    (s) => s.videoStatus === 'generating' || s.videoStatus === 'queued'
  )

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6 bg-[#060709]">
      {/* Header & Controls */}
      <div className="bg-[#0e0f16] p-5 rounded-2xl shadow-xl shadow-black/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-surface-100 flex items-center gap-2">
            <Video size={16} className="text-accent-400" />
            Etapa 4: Animación a Video & LipSync
          </h2>
          <p className="text-xs text-surface-500 mt-0.5">
            Genera video con controles de cámara, sincronización de audio/LipSync e inputs multi-modales gestionados desde el Prompt Composer.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-surface-400 font-medium">Modelo Video:</span>
          <ModelSelectorDropdown
            kind="video"
            selectedModelId={videoModel.t2vId || videoModel.name}
            onSelect={(m) => setVideoModel(m)}
            resolution={videoResolution}
          />
          <ResolutionSelector
            model={videoModel}
            value={videoResolution}
            onChange={(res) => setVideoModel(videoModel, res)}
          />
          <AspectRatioSelector
            value={aspectRatio}
            onChange={(r) => setMetadata({ aspectRatio: r })}
            compact
          />

          {/* Secuencia Switcher & Tooltip */}
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 bg-surface-900/90 hover:bg-surface-800/90 border border-white/10 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer shadow-sm select-none">
                  <Switch
                    id="seq-switch"
                    checked={isSequentialVideoGen}
                    onCheckedChange={setIsSequentialVideoGen}
                    className="data-[state=checked]:bg-accent-500 scale-90"
                  />
                  <label
                    htmlFor="seq-switch"
                    className="text-xs font-semibold text-surface-200 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Secuencia</span>
                    <Info size={12} className="text-surface-400 hover:text-accent-300" />
                  </label>
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-xs bg-[#12131c] border border-white/15 text-xs text-surface-200 p-3 shadow-2xl rounded-xl space-y-1.5"
              >
                <div className="font-semibold text-accent-300 flex items-center gap-1.5">
                  <span>Modo Secuencia (Encadenado)</span>
                </div>
                <p className="text-[11px] text-surface-300 leading-relaxed">
                  Renderiza las tomas una tras otra en orden cronológico. En modelos compatibles con referencia de video (MiniMax H3, ByteDance Seedance 2, Wan 3.0, etc.), el video generado de la toma anterior se transfiere automáticamente como video de referencia al Prompt Composer de la siguiente toma para garantizar la continuidad cinematográfica.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Batch Size Selector (Blocked when Secuencia is ON) */}
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs transition-all ${
                    isSequentialVideoGen
                      ? 'bg-surface-950/40 border-white/5 opacity-45 cursor-not-allowed text-surface-500'
                      : 'bg-surface-900/90 hover:bg-surface-800/90 border-white/10 text-surface-200 shadow-sm'
                  }`}
                >
                  <Layers size={13} className={isSequentialVideoGen ? 'text-surface-500' : 'text-accent-400'} />
                  <span className="font-semibold text-[11px]">Lote:</span>
                  <select
                    disabled={isSequentialVideoGen}
                    value={videoGenBatchSize}
                    onChange={(e) => setVideoGenBatchSize(Number(e.target.value))}
                    className="bg-transparent border-none text-xs font-bold text-surface-100 focus:outline-none cursor-pointer disabled:cursor-not-allowed disabled:text-surface-500"
                  >
                    <option value={1} className="bg-surface-900 text-surface-200">1</option>
                    <option value={2} className="bg-surface-900 text-surface-200">2</option>
                    <option value={3} className="bg-surface-900 text-surface-200">3</option>
                    <option value={4} className="bg-surface-900 text-surface-200">4</option>
                    <option value={5} className="bg-surface-900 text-surface-200">5</option>
                  </select>
                </div>
              </TooltipTrigger>
              {isSequentialVideoGen ? (
                <TooltipContent
                  side="bottom"
                  className="max-w-xs bg-[#12131c] border border-white/15 text-xs text-surface-300 p-2.5 shadow-2xl rounded-xl"
                >
                  <p className="text-[11px] text-amber-300/90 font-medium">
                    Selector de lotes bloqueado: En modo Secuencia los videos se renderizan uno después de otro para encadenar las referencias visuales.
                  </p>
                </TooltipContent>
              ) : (
                <TooltipContent
                  side="bottom"
                  className="max-w-xs bg-[#12131c] border border-white/15 text-xs text-surface-300 p-2.5 shadow-2xl rounded-xl"
                >
                  <p className="text-[11px] text-surface-300">
                    Cantidad de tomas que se procesarán simultáneamente en paralelo cuando Secuencia está desactivado.
                  </p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          <button
            onClick={() => generateAllVideos()}
            disabled={isAnyGenerating || shots.length === 0}
            className="btn-primary text-xs flex items-center gap-1.5 px-3.5 py-1.5 ml-1 shadow-lg font-semibold"
          >
            {isAnyGenerating ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            {isSequentialVideoGen ? 'Generar Todos (Secuencia)' : `Generar en Lotes (${shots.length})`}
          </button>
        </div>
      </div>

      {/* Video Shots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {shots.map((shot) => (
          <VideoShotCard
            key={shot.id}
            shot={shot}
            shots={shots}
            characters={characters}
            scenarios={scenarios}
            props={props}
            videoModel={videoModel}
            videoResolution={videoResolution}
            aspectRatio={aspectRatio}
            visualStyle={visualStyle}
            onGenerate={(customParams) => generateShotVideo(shot.id, customParams)}
            onOpenHistory={() => setHistoryModalShot(shot)}
            updateShot={updateShot}
            duplicateShot={duplicateShot}
            removeShot={removeShot}
            draggedCardId={draggedCardId}
            dragOverReorderCardId={dragOverReorderCardId}
            handleDragStartCard={handleDragStartCard}
            handleDragOverCard={handleDragOverCard}
            handleDropReorderCard={handleDropReorderCard}
            handleDragEndCard={handleDragEndCard}
          />
        ))}
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-surface-800">
        <button
          onClick={() => setStage(3)}
          className="btn-ghost text-xs flex items-center gap-1.5"
        >
          <ArrowLeft size={13} /> Volver a Storyboard & Audio
        </button>

        <button
          onClick={() => setStage(5)}
          className="btn-primary text-xs flex items-center gap-1.5 px-4 py-2 shadow-lg"
        >
          Siguiente: Ensamblaje & Export <ArrowRight size={13} />
        </button>
      </div>

      {/* Video Generation History Modal */}
      {historyModalShot && (
        <GenerationHistoryModal
          isOpen={!!historyModalShot}
          onClose={() => setHistoryModalShot(null)}
          title={`Historial de Videos: Toma ${historyModalShot.order}`}
          kind="video"
          activeUrl={historyModalShot.videoUrl}
          activeAssetId={historyModalShot.videoAssetId}
          history={historyModalShot.videoHistory || []}
          onRestore={(item) => {
            restoreShotVideo(historyModalShot.id, item.id)
          }}
        />
      )}
    </div>
  )
}

interface VideoShotCardProps {
  shot: DramaShot
  shots: DramaShot[]
  characters: DramaCharacter[]
  scenarios: DramaScenario[]
  props: DramaProp[]
  videoModel: ModelPricing
  videoResolution: string
  aspectRatio: string
  visualStyle?: string
  onGenerate: (customParams?: any) => Promise<void>
  onOpenHistory: () => void
  updateShot: (shotId: string, updates: Partial<DramaShot>) => void
  duplicateShot: (id: string) => void
  removeShot: (id: string) => void
  draggedCardId: string | null
  dragOverReorderCardId: string | null
  handleDragStartCard: (shotId: string, e: React.DragEvent) => void
  handleDragOverCard: (shotId: string, e: React.DragEvent) => void
  handleDropReorderCard: (targetShotId: string, e: React.DragEvent) => void
  handleDragEndCard: () => void
}

function VideoShotCard({
  shot,
  shots,
  characters,
  scenarios,
  props,
  videoModel,
  videoResolution,
  aspectRatio,
  visualStyle,
  onGenerate,
  onOpenHistory,
  updateShot,
  duplicateShot,
  removeShot,
  draggedCardId,
  dragOverReorderCardId,
  handleDragStartCard,
  handleDragOverCard,
  handleDropReorderCard,
  handleDragEndCard,
}: VideoShotCardProps) {
  const [expandedAction, setExpandedAction] = useState(false)
  const isGenerating = shot.videoStatus === 'generating' || shot.videoStatus === 'queued'
  const isCompleted = shot.videoStatus === 'completed' && Boolean(shot.videoUrl || shot.videoLocalPath)
  const isFailed = shot.videoStatus === 'failed'

  // Linked characters & props
  const charsInShot = useMemo(
    () => characters.filter((c) => (shot.characterNames || []).includes(c.name)),
    [characters, shot.characterNames]
  )
  const propsInShot = useMemo(
    () => props.filter((p) => (shot.propNames || []).includes(p.name)),
    [props, shot.propNames]
  )

  // Track media state from PromptComposer
  const [mediaState, setMediaState] = useState<{
    isFFLF: boolean
    firstFrameBase64: string | null
    firstFrameUrl?: string | null
    lastFrameBase64: string | null
    lastFrameUrl?: string | null
    refs: Array<{ base64?: string; url?: string; localPath?: string; mime: string; name?: string; refType?: string }>
  }>({
    isFFLF: true,
    firstFrameBase64: null,
    firstFrameUrl: shot.keyframeUrl || null,
    lastFrameBase64: null,
    lastFrameUrl: shot.lastFrameUrl || null,
    refs: [],
  })

  const handleMediaStateChange = useCallback(
    (newState: {
      isFFLF: boolean
      firstFrameBase64: string | null
      firstFrameUrl?: string | null
      lastFrameBase64: string | null
      lastFrameUrl?: string | null
      refs: Array<{ base64?: string; url?: string; localPath?: string; mime: string; name?: string; refType?: string }>
    }) => {
      // If shot had videoRef and user removed it in PromptComposer, clear videoRef from shot
      const hasVideoInRefs = newState.refs.some((r) => r.mime.startsWith('video/'))
      if (!hasVideoInRefs && (shot.videoRefUrl || shot.videoRefAssetId || shot.videoRefLocalPath)) {
        updateShot(shot.id, {
          videoRefUrl: undefined,
          videoRefAssetId: undefined,
          videoRefLocalPath: undefined,
          videoRefName: undefined,
        })
      }

      setMediaState((prev) => {
        if (
          prev.isFFLF === newState.isFFLF &&
          prev.firstFrameBase64 === newState.firstFrameBase64 &&
          prev.firstFrameUrl === newState.firstFrameUrl &&
          prev.lastFrameBase64 === newState.lastFrameBase64 &&
          prev.lastFrameUrl === newState.lastFrameUrl &&
          prev.refs.length === newState.refs.length &&
          (prev.refs === newState.refs || (prev.refs.length === 0 && newState.refs.length === 0))
        ) {
          return prev
        }
        return newState
      })
    },
    [shot.id, shot.videoRefUrl, shot.videoRefAssetId, shot.videoRefLocalPath, updateShot]
  )

  // Next shot for automatic LF in FF/LF mode if defined
  const nextShot = shots.find((s) => s.order === shot.order + 1)
  const effectiveLastFrameUrl = shot.lastFrameUrl || nextShot?.keyframeUrl

  // Previous shot in order
  const prevShot = shots.find((s) => s.order === shot.order - 1)
  const isVideoRefSupported = Boolean(videoModel?.supportsVideoRef)

  // Determine effective video reference from previous shot or from shot's explicit videoRef fields
  const effectiveVideoRef = useMemo(() => {
    if (shot.videoRefUrl || shot.videoRefLocalPath || shot.videoRefAssetId) {
      return {
        url: shot.videoRefUrl,
        localPath: shot.videoRefLocalPath,
        assetId: shot.videoRefAssetId,
        name: shot.videoRefName || (prevShot ? `Toma ${prevShot.order}` : 'Video Anterior'),
      }
    }
    if (prevShot && (prevShot.videoUrl || prevShot.videoLocalPath || prevShot.videoAssetId) && isVideoRefSupported) {
      return {
        url: prevShot.videoUrl,
        localPath: prevShot.videoLocalPath,
        assetId: prevShot.videoAssetId,
        name: `Toma ${prevShot.order}`,
      }
    }
    return null
  }, [shot.videoRefUrl, shot.videoRefLocalPath, shot.videoRefAssetId, shot.videoRefName, prevShot, isVideoRefSupported])

  // Build initial prompt for PromptComposer
  const initialPrompt = useMemo(() => {
    const parts: string[] = []
    if (shot.cameraMovement && shot.cameraMovement.trim()) parts.push(shot.cameraMovement.trim())
    if (shot.actionPrompt && shot.actionPrompt.trim()) parts.push(shot.actionPrompt.trim())
    if (shot.dialogueText && shot.dialogueText.trim()) {
      parts.push(`dialogue (${shot.dialogueSpeaker || 'voice'}): "${shot.dialogueText.trim()}"`)
    }
    return parts.join(', ')
  }, [shot.cameraMovement, shot.actionPrompt, shot.dialogueText, shot.dialogueSpeaker])

  // Build references for PromptComposer
  const initialRefs = useMemo(() => {
    const list: Array<{ url?: string; localPath?: string; assetId?: string; mime: string; name?: string; refType?: string }> = []
    
    // Previous video reference chained
    if (effectiveVideoRef) {
      list.push({
        url: effectiveVideoRef.url,
        localPath: effectiveVideoRef.localPath,
        assetId: effectiveVideoRef.assetId,
        name: effectiveVideoRef.name,
        mime: 'video/mp4',
        refType: 'video',
      })
    }

    for (const char of charsInShot) {
      if (char.imageUrl || char.imageAssetId) {
        list.push({
          url: char.imageUrl,
          assetId: char.imageAssetId,
          name: char.name,
          mime: 'image/png',
          refType: 'character',
        })
      }
    }
    for (const pr of propsInShot) {
      if (pr.imageUrl || pr.imageAssetId) {
        list.push({
          url: pr.imageUrl,
          assetId: pr.imageAssetId,
          name: pr.name,
          mime: 'image/png',
          refType: 'prop',
        })
      }
    }
    return list
  }, [effectiveVideoRef, charsInShot, propsInShot])

  // Active references for visualization when FF is deactivated
  const activeReferences = useMemo(() => {
    if (mediaState.refs && mediaState.refs.length > 0) {
      return mediaState.refs.map((r, idx) => ({
        url: r.url,
        base64: r.base64,
        name: r.name || `Ref ${idx + 1}`,
        type: r.refType || 'image',
      }))
    }
    const list: Array<{ url?: string; base64?: string; name: string; type: string }> = []
    for (const char of charsInShot) {
      if (char.imageUrl || char.imageBase64 || char.imageAssetId) {
        list.push({
          url: char.imageUrl,
          base64: char.imageBase64,
          name: char.name,
          type: 'character',
        })
      }
    }
    for (const pr of propsInShot) {
      if (pr.imageUrl || pr.imageAssetId) {
        list.push({
          url: pr.imageUrl,
          name: pr.name,
          type: 'prop',
        })
      }
    }
    return list
  }, [charsInShot, propsInShot, mediaState.refs])

  // Determine frame sources
  const firstFrameSrc = mediaState.firstFrameUrl
    ? srcUrl(mediaState.firstFrameUrl)
    : mediaState.firstFrameBase64
    ? (mediaState.firstFrameBase64.startsWith('data:') || mediaState.firstFrameBase64.startsWith('http') || mediaState.firstFrameBase64.startsWith('file:')
      ? srcUrl(mediaState.firstFrameBase64)
      : `data:image/png;base64,${mediaState.firstFrameBase64}`)
    : (shot.keyframeUrl ? srcUrl(shot.keyframeUrl) : null)

  const lastFrameSrc = mediaState.lastFrameUrl
    ? srcUrl(mediaState.lastFrameUrl)
    : mediaState.lastFrameBase64
    ? (mediaState.lastFrameBase64.startsWith('data:') || mediaState.lastFrameBase64.startsWith('http') || mediaState.lastFrameBase64.startsWith('file:')
      ? srcUrl(mediaState.lastFrameBase64)
      : `data:image/png;base64,${mediaState.lastFrameBase64}`)
    : (effectiveLastFrameUrl ? srcUrl(effectiveLastFrameUrl) : null)

  const hasFirstFrame = Boolean(firstFrameSrc)
  const hasLastFrame = Boolean(lastFrameSrc && (mediaState.lastFrameBase64 || mediaState.lastFrameUrl))

  return (
    <div
      key={shot.id}
      onDragOver={(e) => handleDragOverCard(shot.id, e)}
      onDrop={(e) => handleDropReorderCard(shot.id, e)}
      className={`bg-[#0d0e15] border rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-black/50 transition-all group/card ${
        dragOverReorderCardId === shot.id
          ? 'border-accent-500 ring-2 ring-accent-500/30'
          : draggedCardId === shot.id
          ? 'opacity-40 border-dashed border-white/20'
          : 'border-white/5 hover:border-white/10'
      }`}
    >
      {/* ─── CARD HEADER ─── */}
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <div
            draggable
            onDragStart={(e) => handleDragStartCard(shot.id, e)}
            onDragEnd={handleDragEndCard}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab active:cursor-grabbing p-1 rounded text-surface-500 hover:text-white hover:bg-white/5 transition-colors"
            title="Arrastrar para reordenar frame"
          >
            <GripVertical size={13} />
          </div>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-accent-500/20 text-accent-300 border border-accent-500/30">
            Toma {shot.order}
          </span>
          <span className="text-[11px] text-surface-400 truncate max-w-[130px]">
            Escena {shot.sceneNumber} · {shot.scenarioName || 'Escena'}
          </span>
          {effectiveVideoRef && (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1"
              title={`Referencia de video encadenada desde ${effectiveVideoRef.name}`}
            >
              <Video size={9} />
              <span>Ref: {effectiveVideoRef.name}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              duplicateShot(shot.id)
            }}
            className="p-1 px-2 rounded-lg bg-surface-800/80 hover:bg-surface-700 text-surface-300 hover:text-white border border-white/5 text-[10px] flex items-center gap-1 transition-colors"
            title="Duplicar frame (insertar a continuación)"
          >
            <Copy size={11} className="text-accent-400" />
            <span>Duplicar</span>
          </button>

          {shot.videoHistory && shot.videoHistory.length > 0 && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="p-1 px-2 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-white border border-white/5 text-[10px] flex items-center gap-1 transition-colors"
              title={`Ver historial de ${shot.videoHistory.length} versiones`}
            >
              <History size={12} className="text-accent-400" />
              <span className="font-mono">{shot.videoHistory.length}</span>
            </button>
          )}

          {isCompleted && (
            <span className="flex items-center gap-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md text-[10px] font-semibold">
              <CheckCircle size={10} /> Listo
            </span>
          )}
          {isFailed && (
            <span className="flex items-center gap-1 bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-md text-[10px] font-semibold">
              <AlertCircle size={10} /> Falló
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              removeShot(shot.id)
            }}
            className="p-1 rounded-lg bg-surface-800 hover:bg-red-500/20 text-surface-400 hover:text-red-400 border border-white/5 transition-colors"
            title="Eliminar toma"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* ─── MEDIA PREVIEW AREA (PURE VISUALIZATION) ─── */}
      <div
        className="relative bg-[#07080c] overflow-hidden flex items-center justify-center border-b border-white/5 transition-all duration-300 w-full"
        style={getAspectRatioStyle(aspectRatio)}
      >
        {isCompleted ? (
          <video
            src={srcUrl(shot.videoLocalPath || shot.videoUrl)}
            controls
            playsInline
            className="w-full h-full object-cover"
          />
        ) : isGenerating ? (
          <div className="flex flex-col items-center justify-center gap-2 text-accent-400 p-4 text-center">
            <RefreshCw size={24} className="animate-spin" />
            <span className="text-xs font-semibold">Renderizando Video...</span>
            <span className="text-[10px] text-surface-400">
              {shot.videoStatus === 'queued' ? 'En cola...' : `Procesando con ${cleanModelName(videoModel.name)}`}
            </span>
            {shot.videoProgress != null && (
              <div className="w-28 bg-surface-800 rounded-full h-1.5 mt-1 overflow-hidden">
                <div
                  className="bg-accent-500 h-full transition-all duration-300"
                  style={{ width: `${shot.videoProgress}%` }}
                />
              </div>
            )}
          </div>
        ) : mediaState.isFFLF ? (
          /* FF Mode Active */
          hasFirstFrame && hasLastFrame ? (
            /* Split View: First Frame & Last Frame */
            <div className={`w-full h-full grid ${(aspectRatio === '9:16' || aspectRatio === '3:4') ? 'grid-rows-2 grid-cols-1' : 'grid-cols-2'} gap-1.5 p-1.5 bg-black/40`}>
              <div className="relative rounded-lg overflow-hidden bg-[#090a10] border border-white/10 flex items-center justify-center">
                <img src={firstFrameSrc!} alt="Inicio (FF)" className="w-full h-full object-cover" />
                <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-[9px] font-bold text-accent-300 border border-white/10">
                  Inicio (FF)
                </div>
              </div>
              <div className="relative rounded-lg overflow-hidden bg-[#090a10] border border-white/10 flex items-center justify-center">
                <img src={lastFrameSrc!} alt="Final (LF)" className="w-full h-full object-cover" />
                <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-[9px] font-bold text-purple-300 border border-white/10">
                  Final (LF)
                </div>
              </div>
            </div>
          ) : hasFirstFrame ? (
            /* Single Full First Frame */
            <div className="w-full h-full relative">
              <img
                src={firstFrameSrc!}
                alt={`Keyframe Toma ${shot.order}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-[9px] font-bold text-accent-300 border border-white/10 shadow-sm">
                First Frame (FF)
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-surface-500 gap-1 p-3 text-center">
              <ImageIcon size={22} className="opacity-40" />
              <span className="text-[10px]">Sin fotograma inicial asignado</span>
              <span className="text-[9px] text-surface-600">Puedes adjuntarlo desde el Prompt Composer</span>
            </div>
          )
        ) : (
          /* FF Mode Disabled: References Grid (Max 3 columns) */
          activeReferences.length > 0 ? (
            <div className="w-full h-full p-2.5 overflow-y-auto flex items-center justify-center">
              <div
                className={`w-full grid gap-2 ${
                  activeReferences.length === 1
                    ? 'grid-cols-1 max-w-[130px]'
                    : activeReferences.length === 2
                    ? 'grid-cols-2 max-w-[260px]'
                    : 'grid-cols-3 max-w-full'
                }`}
              >
                {activeReferences.slice(0, 9).map((ref, idx) => (
                  <div
                    key={idx}
                    className="relative rounded-lg overflow-hidden bg-surface-900/90 border border-white/10 aspect-square flex flex-col items-center justify-center group shadow-md"
                  >
                    {ref.url || ref.base64 ? (
                      <img
                        src={
                          ref.url
                            ? srcUrl(ref.url)
                            : (ref.base64?.startsWith('data:') || ref.base64?.startsWith('http') || ref.base64?.startsWith('file:') || ref.base64?.startsWith('app-file:')
                              ? srcUrl(ref.base64)
                              : `data:image/png;base64,${ref.base64}`)
                        }
                        alt={ref.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-surface-800 flex items-center justify-center text-[10px] font-bold text-surface-400">
                        {ref.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-black/80 backdrop-blur-sm px-1 py-0.5 text-center">
                      <span className="text-[8px] font-medium text-surface-200 truncate block">
                        {ref.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Text-to-Video Direct Prompt Mode */
            <div className="flex flex-col items-center justify-center text-surface-400 gap-1.5 p-4 text-center">
              <FileText size={24} className="text-accent-400 opacity-60" />
              <span className="text-xs font-semibold text-surface-200">Generación por Texto (T2V)</span>
              <span className="text-[10px] text-surface-500 max-w-[220px]">
                Sin fotograma inicial ni referencias. Se animará directamente desde el prompt y controles de cámara.
              </span>
            </div>
          )
        )}
      </div>

      {/* ─── ACTION PROMPT & AUDIO DETAILS ─── */}
      <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
        <div className="space-y-2">
          {/* Action Description */}
          <p
            onClick={() => setExpandedAction((prev) => !prev)}
            className={`text-[11px] text-surface-300 leading-relaxed cursor-pointer select-none transition-colors hover:text-surface-100 ${
              expandedAction ? '' : 'line-clamp-2'
            }`}
            title={expandedAction ? 'Clic para contraer' : 'Clic para ver completo'}
          >
            {shot.actionPrompt}
          </p>

          {/* Dialogue & LipSync audio indicator */}
          {shot.dialogueText && (
            <div className="bg-[#08090f] border border-white/5 p-2 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] text-surface-300">
                <Volume2 size={11} className="text-accent-400 shrink-0" />
                <span className="truncate">
                  <strong className="text-accent-400">{shot.dialogueSpeaker || 'V.O.'}:</strong> "{shot.dialogueText}"
                </span>
              </div>
              {shot.audioUrl || shot.audioLocalPath ? (
                <div className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <CheckCircle size={9} />
                  <span>Audio de diálogo adjunto para LipSync</span>
                </div>
              ) : (
                <div className="text-[9px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <AlertCircle size={9} />
                  <span>Sin audio sintetizado (Sintetizar en Etapa 3)</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── EMBEDDED PROMPTCOMPOSER WITH CAMERA CONTROLS ─── */}
        <div className="pt-2 border-t border-white/5">
          <PromptComposer
            mode="video"
            embedded={true}
            initialPrompt={initialPrompt}
            initialDuration={shot.estimatedDuration || 5}
            initialRefs={initialRefs}
            initialResolution={videoResolution}
            initialModel={videoModel.name}
            initialAspectRatio={aspectRatio}
            initialSeedanceMode="fflf"
            initialFirstFrameUrl={shot.keyframeUrl}
            initialLastFrameUrl={shot.lastFrameUrl}
            disabled={isGenerating}
            onMediaStateChange={handleMediaStateChange}
            onGenerate={(params) => {
              const inputMode = !mediaState.isFFLF
                ? (activeReferences.length > 0 ? 'ref' : 't2v')
                : (mediaState.lastFrameBase64 || mediaState.lastFrameUrl ? 'fflf' : 'ff')

              onGenerate({
                prompt: params.prompt,
                duration: params.duration || shot.estimatedDuration || 5,
                resolution: videoResolution || params.resolution,
                aspectRatio: params.aspectRatio || aspectRatio,
                inputMode,
                firstFrameBase64: params.firstFrameBase64,
                firstFrameUrl: params.firstFrameUrl || shot.keyframeUrl,
                lastFrameBase64: params.lastFrameBase64,
                lastFrameUrl: params.lastFrameUrl || shot.lastFrameUrl,
                imageRefs: params.imageRefs,
                videoRefs: params.videoRefs,
              })
            }}
          />
        </div>
      </div>
    </div>
  )
}
