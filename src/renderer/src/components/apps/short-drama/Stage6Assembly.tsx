import { useState, useRef, useEffect } from 'react'
import {
  Film,
  Sparkles,
  RefreshCw,
  Download,
  CheckCircle,
  Play,
  Pause,
  ArrowLeft,
  Type,
  SkipBack,
  SkipForward,
  Eye,
  AlertCircle,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useShortDramaStore } from '../../../stores/short-drama-store'
import { srcUrl } from '../../../services/file-url'
import { cleanModelName } from '../../../lib/models'

function getAspectRatioStyle(ratio?: string): React.CSSProperties {
  if (!ratio) return { aspectRatio: '9 / 16' }
  const parts = ratio.split(':')
  if (parts.length === 2) {
    return { aspectRatio: `${parts[0]} / ${parts[1]}` }
  }
  return { aspectRatio: '9 / 16' }
}

export function Stage6Assembly() {
  const {
    title,
    shots,
    videoModel,
    aspectRatio,
    finalVideo,
    assembleFinalEpisode,
    setStage,
  } = useShortDramaStore()

  const [includeSubtitles, setIncludeSubtitles] = useState(true)
  const [bgMusic, setBgMusic] = useState(false)
  const [selectedShotIndex, setSelectedShotIndex] = useState(0)
  const [isPlayingAll, setIsPlayingAll] = useState(false)
  const [viewMode, setViewMode] = useState<'preview' | 'final'>(
    finalVideo.url || finalVideo.localPath ? 'final' : 'preview'
  )
  const [isMuted, setIsMuted] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)

  const readyShots = shots.filter((s) => s.videoLocalPath || s.videoUrl || s.videoAssetId)
  const clampedIndex = readyShots.length > 0 ? Math.min(selectedShotIndex, readyShots.length - 1) : 0
  const currentShot = readyShots[clampedIndex]
  const totalDuration = shots.reduce((acc, s) => acc + (s.estimatedDuration || 5), 0)

  const isVertical = aspectRatio === '9:16' || aspectRatio === '3:4'
  const isSquare = aspectRatio === '1:1'
  const playerMaxW = isVertical ? 'max-w-[320px]' : isSquare ? 'max-w-[420px]' : 'max-w-2xl'

  // Auto switch tab to final when rendering completes
  useEffect(() => {
    if (finalVideo.url || finalVideo.localPath) {
      setViewMode('final')
    }
  }, [finalVideo.url, finalVideo.localPath])

  // Handle continuous sequence play when shot ends
  const handleShotEnded = () => {
    if (isPlayingAll) {
      if (clampedIndex < readyShots.length - 1) {
        setSelectedShotIndex((prev) => prev + 1)
      } else {
        setIsPlayingAll(false)
        setSelectedShotIndex(0)
      }
    }
  }

  // Play video automatically if isPlayingAll is active on shot advance
  useEffect(() => {
    if (isPlayingAll && videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }, [clampedIndex, isPlayingAll])

  const togglePlayAll = () => {
    if (isPlayingAll) {
      setIsPlayingAll(false)
      videoRef.current?.pause()
    } else {
      setIsPlayingAll(true)
      videoRef.current?.play().catch(() => {})
    }
  }

  const handleAssemble = async () => {
    await assembleFinalEpisode({ includeSubtitles, bgMusic })
    const state = useShortDramaStore.getState()
    if (state.finalVideo.url || state.finalVideo.localPath) {
      setViewMode('final')
    }
  }

  const handleDownload = () => {
    if (!finalVideo.localPath) return
    const api = (window as any).electronAPI
    if (finalVideo.assetId && api?.assets?.saveAs) {
      api.assets.saveAs(finalVideo.assetId)
    } else if (finalVideo.localPath && api?.assets?.showInFolder) {
      api.assets.showInFolder(finalVideo.localPath)
    }
  }

  const selectShot = (idx: number) => {
    setSelectedShotIndex(idx)
    setViewMode('preview')
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6">
      {/* Header & Assembly Controller */}
      <div className="card p-6 border-surface-800 bg-surface-900/60 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-surface-100 flex items-center gap-2">
            <Film size={16} className="text-accent-400" />
            Ensamblaje y Previsualización Final
          </h2>
          <p className="text-xs text-surface-500 mt-0.5">
            Previsualiza tus tomas en secuencia interactiva o ensambla el episodio completo con subtítulos y audio sincronizado con FFmpeg.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-surface-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSubtitles}
              onChange={(e) => setIncludeSubtitles(e.target.checked)}
              className="rounded bg-surface-800 border-surface-700 text-accent-500"
            />
            <span className="flex items-center gap-1">
              <Type size={13} className="text-accent-400" /> Quemar Subtítulos
            </span>
          </label>

          <button
            onClick={handleAssemble}
            disabled={finalVideo.rendering || readyShots.length === 0}
            className="btn-primary text-xs flex items-center gap-1.5 px-4 py-2"
          >
            {finalVideo.rendering ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Ensamblando con FFmpeg ({finalVideo.progress || 50}%)...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                {finalVideo.url ? 'Volver a Ensamblar' : 'Ensamblar Microserie'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Banner if Assembly Failed */}
      {finalVideo.error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="flex-shrink-0" />
            <span><strong>Error de ensamblaje:</strong> {finalVideo.error}</span>
          </div>
          <button
            onClick={handleAssemble}
            className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-semibold rounded-lg transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Main Assembly View: Video Player + Timeline Sequence */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Player Section (Left or Center) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Mode Switcher Tabs */}
          <div className="flex items-center justify-between border-b border-surface-800 pb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-accent-500/20 text-accent-300 border border-accent-500/40'
                    : 'text-surface-400 hover:text-surface-200 bg-surface-800/40'
                }`}
              >
                <Eye size={13} />
                Previsualización de Secuencia
                <span className="px-1.5 py-0.2 bg-surface-800 rounded-full text-[10px] text-surface-300">
                  {readyShots.length}/{shots.length}
                </span>
              </button>

              <button
                onClick={() => setViewMode('final')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  viewMode === 'final'
                    ? 'bg-accent-500/20 text-accent-300 border border-accent-500/40'
                    : 'text-surface-400 hover:text-surface-200 bg-surface-800/40'
                }`}
              >
                <Video size={13} />
                Episodio Final Ensamblado
                {finalVideo.url && (
                  <CheckCircle size={11} className="text-emerald-400" />
                )}
              </button>
            </div>

            {viewMode === 'preview' && readyShots.length > 0 && (
              <button
                onClick={togglePlayAll}
                className={`text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 font-medium transition-colors ${
                  isPlayingAll
                    ? 'bg-accent-500 text-white'
                    : 'bg-surface-800 hover:bg-surface-700 text-surface-200'
                }`}
              >
                {isPlayingAll ? <Pause size={12} /> : <Play size={12} fill="currentColor" />}
                {isPlayingAll ? 'Pausar Secuencia' : 'Reproducir Secuencia'}
              </button>
            )}
          </div>

          {/* Player Container */}
          {viewMode === 'preview' ? (
            /* PREVIEW PLAYER (Per Shot / Continuous) */
            <div className="space-y-3">
              <div
                className={`w-full bg-surface-950 border border-surface-800 rounded-2xl overflow-hidden relative shadow-2xl flex items-center justify-center mx-auto ${playerMaxW}`}
                style={getAspectRatioStyle(aspectRatio)}
              >
                {currentShot && (currentShot.videoLocalPath || currentShot.videoUrl) ? (
                  <>
                    <video
                      key={currentShot.id}
                      ref={videoRef}
                      src={srcUrl(currentShot.videoLocalPath || currentShot.videoUrl)}
                      controls
                      playsInline
                      muted={isMuted}
                      onEnded={handleShotEnded}
                      className="w-full h-full object-contain bg-black"
                    />

                    {/* Dialogue & Subtitle Floating Overlay Preview */}
                    {currentShot.dialogueText && (
                      <div className="absolute bottom-12 left-3 right-3 flex justify-center pointer-events-none z-10">
                        <div className="bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-center max-w-[92%] shadow-lg">
                          {currentShot.dialogueSpeaker && (
                            <span className="text-[10px] font-semibold text-accent-400 block mb-0.5">
                              {currentShot.dialogueSpeaker}
                            </span>
                          )}
                          <p className="text-[11px] text-white leading-snug font-medium">
                            "{currentShot.dialogueText}"
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Header badge inside player */}
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10 pointer-events-none">
                      <span className="bg-black/70 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded border border-white/10">
                        Toma {currentShot.order}
                      </span>
                      {isPlayingAll && (
                        <span className="bg-accent-500/80 text-white text-[9px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                          <Play size={8} fill="currentColor" /> En Secuencia
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-surface-600">
                    <Film size={44} className="opacity-40" />
                    <span className="text-sm font-medium text-surface-300">
                      {shots.length === 0
                        ? 'No hay tomas configuradas'
                        : 'No hay videos generados para previsualizar'}
                    </span>
                    <p className="text-xs text-surface-500 max-w-xs">
                      Ve a la etapa 4 para generar los clips de video antes de previsualizar la secuencia.
                    </p>
                    <button
                      onClick={() => setStage(4)}
                      className="btn-primary text-xs mt-2 flex items-center gap-1.5"
                    >
                      Ir a Generación de Video
                    </button>
                  </div>
                )}
              </div>

              {/* Shot Controls Bar */}
              {readyShots.length > 0 && (
                <div className="card p-3 border-surface-800 bg-surface-900/60 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedShotIndex((prev) => Math.max(0, prev - 1))}
                      disabled={clampedIndex === 0}
                      className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Toma anterior"
                    >
                      <SkipBack size={14} />
                    </button>

                    <span className="text-xs font-medium text-surface-300 px-2">
                      Toma <strong className="text-accent-400">{clampedIndex + 1}</strong> de {readyShots.length}
                    </span>

                    <button
                      onClick={() => setSelectedShotIndex((prev) => Math.min(readyShots.length - 1, prev + 1))}
                      disabled={clampedIndex === readyShots.length - 1}
                      className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Toma siguiente"
                    >
                      <SkipForward size={14} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 transition-colors"
                      title={isMuted ? 'Activar sonido' : 'Silenciar'}
                    >
                      {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>

                    <button
                      onClick={togglePlayAll}
                      className="btn-ghost text-xs flex items-center gap-1 px-2.5 py-1"
                    >
                      {isPlayingAll ? <Pause size={12} /> : <Play size={12} fill="currentColor" />}
                      {isPlayingAll ? 'Pausar' : 'Reproducir Toda la Secuencia'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* FINAL ASSEMBLED EPISODE VIEW */
            <div className="space-y-4">
              <div
                className={`w-full bg-surface-950 border border-surface-800 rounded-2xl overflow-hidden relative shadow-2xl flex items-center justify-center mx-auto ${playerMaxW}`}
                style={getAspectRatioStyle(aspectRatio)}
              >
                {finalVideo.url || finalVideo.localPath ? (
                  <video
                    src={srcUrl(finalVideo.localPath || finalVideo.url)}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain bg-black"
                  />
                ) : finalVideo.rendering ? (
                  <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-accent-400">
                    <RefreshCw size={36} className="animate-spin" />
                    <span className="text-sm font-semibold">Componiendo Episodio Final...</span>
                    <p className="text-xs text-surface-400 max-w-xs">
                      Normalizando resoluciones a {aspectRatio}, concatenando tomas y quemando subtítulos sincronizados.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-surface-600">
                    <Film size={48} className="opacity-40" />
                    <span className="text-sm font-medium text-surface-300">Episodio No Ensamblado Aún</span>
                    <p className="text-xs text-surface-500 max-w-xs">
                      {readyShots.length > 0
                        ? `Tienes ${readyShots.length} tomas listas para compilar en un único archivo MP4.`
                        : 'Genera los videos en las etapas anteriores para poder ensamblar el episodio.'}
                    </p>
                    {readyShots.length > 0 && (
                      <button
                        onClick={handleAssemble}
                        className="btn-primary text-xs mt-3 flex items-center gap-1.5"
                      >
                        <Play size={13} fill="currentColor" /> Iniciar Ensamblaje con FFmpeg
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Export & Actions Bar */}
              {finalVideo.url && (
                <div className="card p-4 border-surface-800 bg-surface-900/60 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                    <CheckCircle size={16} /> ¡Microserie lista para compartir!
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDownload}
                      className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5"
                    >
                      <Download size={13} /> Descargar MP4 / Ver en Carpeta
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Timeline Sequence & Metadata (Right side) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Summary Card */}
          <div className="card p-5 border-surface-800 bg-surface-900/60 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Ficha del Episodio
            </h3>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between py-1 border-b border-surface-800 text-surface-300">
                <span className="text-surface-500">Título:</span>
                <span className="font-semibold text-surface-100">{title}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-surface-800 text-surface-300">
                <span className="text-surface-500">Duración Estimada:</span>
                <span className="font-mono text-accent-400">~{totalDuration} segundos</span>
              </div>
              <div className="flex justify-between py-1 border-b border-surface-800 text-surface-300">
                <span className="text-surface-500">Tomas / Clips:</span>
                <span>{readyShots.length} de {shots.length} listos</span>
              </div>
              <div className="flex justify-between py-1 border-b border-surface-800 text-surface-300">
                <span className="text-surface-500">Relación de Aspecto:</span>
                <span className="font-mono">{aspectRatio} ({isVertical ? '1080x1920' : isSquare ? '1080x1080' : '1920x1080'})</span>
              </div>
              <div className="flex justify-between py-1 text-surface-300">
                <span className="text-surface-500">Motor de Video:</span>
                <span className="text-surface-200">{cleanModelName(videoModel.name)}</span>
              </div>
            </div>
          </div>

          {/* Interactive Sequence List */}
          <div className="card p-5 border-surface-800 bg-surface-900/60 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
                Secuencia de Tomas ({shots.length})
              </h3>
              <span className="text-[10px] text-surface-500">
                Haz clic en una toma para previsualizarla
              </span>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {shots.map((shot) => {
                const hasVideo = Boolean(shot.videoUrl || shot.videoLocalPath || shot.videoAssetId)
                const readyIdx = readyShots.findIndex((rs) => rs.id === shot.id)
                const isSelected = viewMode === 'preview' && readyIdx === clampedIndex

                return (
                  <div
                    key={shot.id}
                    onClick={() => {
                      if (readyIdx >= 0) {
                        selectShot(readyIdx)
                      }
                    }}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border text-xs transition-all ${
                      hasVideo ? 'cursor-pointer' : 'cursor-default opacity-60'
                    } ${
                      isSelected
                        ? 'bg-accent-500/10 border-accent-500/50 shadow-md ring-1 ring-accent-500/20'
                        : 'bg-surface-950/60 border-surface-800 hover:border-surface-700'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-lg bg-surface-900 overflow-hidden flex-shrink-0 flex items-center justify-center border border-surface-800 relative">
                      {shot.keyframeUrl ? (
                        <img src={srcUrl(shot.keyframeUrl)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Film size={14} className="text-surface-600" />
                      )}
                      {isSelected && (
                        <div className="absolute inset-0 bg-accent-500/30 flex items-center justify-center">
                          <Play size={14} className="text-white drop-shadow" fill="currentColor" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`font-semibold text-[11px] ${isSelected ? 'text-accent-400' : 'text-surface-200'}`}>
                          Toma {shot.order}
                        </span>
                        <span className="text-[10px] text-surface-500 font-mono">
                          {shot.estimatedDuration}s
                        </span>
                      </div>
                      <p className="text-[11px] text-surface-400 truncate">
                        {shot.actionPrompt || shot.dialogueText || 'Sin descripción'}
                      </p>
                      {shot.dialogueText && (
                        <p className="text-[10px] text-surface-500 truncate italic mt-0.5">
                          "{shot.dialogueText}"
                        </p>
                      )}
                    </div>

                    <div className="flex-shrink-0">
                      {hasVideo ? (
                        <span className="text-emerald-400 text-[10px] flex items-center gap-1 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          <CheckCircle size={10} /> Listo
                        </span>
                      ) : (
                        <span className="text-surface-500 text-[10px]">Pendiente</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-surface-800">
        <button
          onClick={() => setStage(4)}
          className="btn-ghost text-xs flex items-center gap-1.5"
        >
          <ArrowLeft size={13} /> Volver a Animación & Video
        </button>

        {readyShots.length > 0 && !finalVideo.url && (
          <button
            onClick={handleAssemble}
            disabled={finalVideo.rendering}
            className="btn-primary text-xs flex items-center gap-1.5 px-4 py-2"
          >
            <Sparkles size={13} /> Ensamblar Episodio Final
          </button>
        )}
      </div>
    </div>
  )
}
