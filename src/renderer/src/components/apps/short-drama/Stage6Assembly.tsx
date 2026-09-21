import { useState } from 'react'
import {
  Film,
  Sparkles,
  RefreshCw,
  Download,
  CheckCircle,
  Play,
  ArrowLeft,
  Sliders,
  Type,
  FolderCheck,
  Share2,
} from 'lucide-react'
import { useShortDramaStore } from '../../../stores/short-drama-store'
import { srcUrl } from '../../../services/file-url'
import { cleanModelName } from '../../../lib/models'

export function Stage6Assembly() {
  const {
    title,
    logline,
    shots,
    videoModel,
    aspectRatio,
    finalVideo,
    assembleFinalEpisode,
    setStage,
  } = useShortDramaStore()

  const [includeSubtitles, setIncludeSubtitles] = useState(true)
  const [bgMusic, setBgMusic] = useState(false)

  const readyShots = shots.filter((s) => s.videoLocalPath || s.videoUrl || s.videoAssetId)
  const totalDuration = shots.reduce((acc, s) => acc + (s.estimatedDuration || 5), 0)
  const isVertical = aspectRatio === '9:16'

  const handleAssemble = async () => {
    await assembleFinalEpisode({ includeSubtitles, bgMusic })
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

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6">
      {/* Header & Assembly Controller */}
      <div className="card p-6 border-surface-800 bg-surface-900/60 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-surface-100 flex items-center gap-2">
            <Film size={16} className="text-accent-400" />
            Ensamblaje y Exportación Final
          </h2>
          <p className="text-xs text-surface-500 mt-0.5">
            Une todos los clips en orden secuencial con FFmpeg, sincroniza los audios y quema los subtítulos automáticos.
          </p>
        </div>

        <div className="flex items-center gap-3">
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

      {/* Main Assembly View: Video Player + Timeline Sequence */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Final Player (Left or Center) */}
        <div className="lg:col-span-7 space-y-4">
          <div
            className={`w-full bg-surface-950 border border-surface-800 rounded-2xl overflow-hidden relative shadow-2xl flex items-center justify-center ${
              isVertical ? 'max-w-xs mx-auto aspect-[9/16]' : 'aspect-video'
            }`}
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
                  Normalizando resoluciones, concatenando tomas y procesando subtítulos sincronizados.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-surface-600">
                <Film size={48} className="opacity-40" />
                <span className="text-sm font-medium text-surface-300">Episodio No Ensamblado</span>
                <p className="text-xs text-surface-500 max-w-xs">
                  {readyShots.length > 0
                    ? `Tienes ${readyShots.length} tomas listas para compilar.`
                    : 'Genera los videos en las etapas anteriores para poder ensamblar el episodio.'}
                </p>
                {readyShots.length > 0 && (
                  <button
                    onClick={handleAssemble}
                    className="btn-primary text-xs mt-3 flex items-center gap-1.5"
                  >
                    <Play size={13} fill="currentColor" /> Iniciar Ensamblaje
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
                <span className="font-mono">{aspectRatio} ({isVertical ? '1080x1920' : '1920x1080'})</span>
              </div>
              <div className="flex justify-between py-1 text-surface-300">
                <span className="text-surface-500">Motor de Video:</span>
                <span className="text-surface-200">{cleanModelName(videoModel.name)}</span>
              </div>
            </div>
          </div>

          {/* Sequence List */}
          <div className="card p-5 border-surface-800 bg-surface-900/60 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Secuencia de Tomas ({shots.length})
            </h3>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {shots.map((shot) => {
                const hasVideo = Boolean(shot.videoUrl || shot.videoLocalPath || shot.videoAssetId)
                return (
                  <div
                    key={shot.id}
                    className="flex items-center gap-3 bg-surface-950/60 border border-surface-800 p-2 rounded-lg text-xs"
                  >
                    <div className="w-12 h-12 rounded bg-surface-900 overflow-hidden flex-shrink-0 flex items-center justify-center border border-surface-800">
                      {shot.keyframeUrl ? (
                        <img src={srcUrl(shot.keyframeUrl)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Film size={14} className="text-surface-600" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-semibold text-accent-400 text-[11px]">
                          Toma {shot.order}
                        </span>
                        <span className="text-[10px] text-surface-500 font-mono">
                          {shot.estimatedDuration}s
                        </span>
                      </div>
                      <p className="text-[11px] text-surface-400 truncate">
                        {shot.actionPrompt}
                      </p>
                    </div>

                    <div className="flex-shrink-0">
                      {hasVideo ? (
                        <span className="text-emerald-400 text-[10px] flex items-center gap-1 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          <CheckCircle size={10} /> Video OK
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
      </div>
    </div>
  )
}
