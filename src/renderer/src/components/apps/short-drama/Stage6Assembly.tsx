import { useState, useRef, useEffect } from 'react'
import {
  Film,
  Sparkles,
  Download,
  Check,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Loader2,
} from 'lucide-react'
import { useShortDramaStore } from '../../../stores/short-drama-store'
import { srcUrl } from '../../../services/file-url'
import { cleanModelName } from '../../../lib/models'
import { Switch } from '../../ui/switch'
import {
  StageLayout,
  StageHeader,
  StageFooter,
  SectionHeader,
  IconAction,
} from './ui'
import { aspectStyle } from './media'

export function Stage6Assembly() {
  const { title, shots, videoModel, aspectRatio, finalVideo, assembleFinalEpisode, setStage } = useShortDramaStore()

  const hasFinal = !!(finalVideo.url || finalVideo.localPath)
  const [includeSubtitles, setIncludeSubtitles] = useState(true)
  const [selectedShotIndex, setSelectedShotIndex] = useState(0)
  const [isPlayingAll, setIsPlayingAll] = useState(false)
  const [viewMode, setViewMode] = useState<'preview' | 'final'>(hasFinal ? 'final' : 'preview')
  const [isMuted, setIsMuted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const readyShots = shots.filter((s) => s.videoLocalPath || s.videoUrl || s.videoAssetId)
  const clampedIndex = readyShots.length > 0 ? Math.min(selectedShotIndex, readyShots.length - 1) : 0
  const currentShot = readyShots[clampedIndex]
  const totalDuration = shots.reduce((acc, s) => acc + (s.estimatedDuration || 5), 0)

  const isVertical = aspectRatio === '9:16' || aspectRatio === '3:4'
  const isSquare = aspectRatio === '1:1'
  const playerMaxW = isVertical ? 'max-w-[340px]' : isSquare ? 'max-w-[440px]' : 'max-w-3xl'

  useEffect(() => {
    if (hasFinal) setViewMode('final')
  }, [hasFinal])

  useEffect(() => {
    if (isPlayingAll && videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }, [clampedIndex, isPlayingAll])

  const handleShotEnded = () => {
    if (!isPlayingAll) return
    if (clampedIndex < readyShots.length - 1) {
      setSelectedShotIndex(clampedIndex + 1)
    } else {
      setIsPlayingAll(false)
      setSelectedShotIndex(0)
    }
  }

  const togglePlayAll = () => {
    if (isPlayingAll) {
      setIsPlayingAll(false)
      videoRef.current?.pause()
    } else {
      setViewMode('preview')
      setIsPlayingAll(true)
      videoRef.current?.play().catch(() => {})
    }
  }

  const handleAssemble = async () => {
    await assembleFinalEpisode({ includeSubtitles })
    const state = useShortDramaStore.getState()
    if (state.finalVideo.url || state.finalVideo.localPath) setViewMode('final')
  }

  const handleDownload = () => {
    const api = (window as any).electronAPI
    if (finalVideo.assetId && api?.assets?.saveAs) {
      api.assets.saveAs(finalVideo.assetId)
    } else if (finalVideo.localPath && api?.assets?.showInFolder) {
      api.assets.showInFolder(finalVideo.localPath)
    }
  }

  const playerFrame = `w-full mx-auto rounded-2xl overflow-hidden bg-black border border-hairline relative flex items-center justify-center ${playerMaxW}`

  return (
    <StageLayout>
      <StageHeader
        stage={4}
        title="Ensamblaje"
        description="Revisa la secuencia y une los clips en un único MP4, con subtítulos opcionales."
      >
        <label className="flex items-center gap-2 cursor-pointer mr-2">
          <Switch checked={includeSubtitles} onCheckedChange={setIncludeSubtitles} />
          <span className="text-meta text-ink">Subtítulos</span>
        </label>
        <button onClick={handleAssemble} disabled={finalVideo.rendering || readyShots.length === 0} className="btn-primary flex items-center gap-1.5">
          {finalVideo.rendering ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {finalVideo.rendering ? `Ensamblando · ${finalVideo.progress || 50}%` : hasFinal ? 'Volver a ensamblar' : 'Ensamblar'}
        </button>
      </StageHeader>

      {finalVideo.error && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="min-w-0">
            <p className="text-body font-emphasis text-red-600 dark:text-red-400">No se pudo ensamblar</p>
            <p className="text-meta text-ink-muted mt-0.5 break-words">{finalVideo.error}</p>
          </div>
          <button onClick={handleAssemble} className="btn-secondary flex-shrink-0">Reintentar</button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center p-0.5 rounded-pill border border-hairline bg-surface-soft">
              {([['preview', `Secuencia · ${readyShots.length}/${shots.length}`], ['final', 'Final']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`h-7 px-3 rounded-pill text-meta font-emphasis transition-colors flex items-center gap-1 ${viewMode === mode ? 'bg-accent-600 text-on-accent' : 'text-ink-muted hover:text-ink'}`}
                >
                  {label}
                  {mode === 'final' && hasFinal && <Check size={11} />}
                </button>
              ))}
            </div>
            {viewMode === 'final' && hasFinal && (
              <button onClick={handleDownload} className="btn-secondary flex items-center gap-1.5">
                <Download size={13} /> Exportar MP4
              </button>
            )}
          </div>

          {viewMode === 'preview' ? (
            <div className="space-y-3">
              <div className={playerFrame} style={aspectStyle(aspectRatio)}>
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
                      className="w-full h-full object-contain"
                    />
                    {includeSubtitles && currentShot.dialogueText?.trim() && (
                      <div className="absolute bottom-14 inset-x-4 flex justify-center pointer-events-none">
                        <p className="px-3 py-1.5 rounded-lg bg-black/75 text-white text-meta text-center max-w-full">
                          {currentShot.dialogueText}
                        </p>
                      </div>
                    )}
                    <span className="absolute top-2 left-2 inline-flex items-center h-6 px-2 rounded-pill bg-canvas/90 font-mono text-eyebrow text-ink pointer-events-none">
                      {String(currentShot.order).padStart(2, '0')}
                    </span>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 p-8 text-center bg-surface-soft w-full h-full">
                    <Film size={22} strokeWidth={1.5} className="text-ink-subtle" />
                    <p className="text-body text-ink">{shots.length === 0 ? 'No hay tomas' : 'Todavía no hay videos'}</p>
                    <p className="text-meta text-ink-subtle max-w-xs">Genera los clips en la etapa de video para previsualizar la secuencia.</p>
                    <button onClick={() => setStage(3)} className="btn-secondary mt-2">Ir a tomas</button>
                  </div>
                )}
              </div>

              {readyShots.length > 0 && (
                <div className={`mx-auto flex items-center justify-between gap-2 ${playerMaxW}`}>
                  <div className="flex items-center gap-1">
                    <IconAction icon={SkipBack} title="Toma anterior" onClick={() => setSelectedShotIndex(Math.max(0, clampedIndex - 1))} disabled={clampedIndex === 0} />
                    <span className="font-mono text-meta text-ink-muted px-1">{clampedIndex + 1}/{readyShots.length}</span>
                    <IconAction icon={SkipForward} title="Toma siguiente" onClick={() => setSelectedShotIndex(Math.min(readyShots.length - 1, clampedIndex + 1))} disabled={clampedIndex === readyShots.length - 1} />
                  </div>
                  <div className="flex items-center gap-1">
                    <IconAction icon={isMuted ? VolumeX : Volume2} title={isMuted ? 'Activar sonido' : 'Silenciar'} onClick={() => setIsMuted(!isMuted)} />
                    <button onClick={togglePlayAll} className="btn-ghost flex items-center gap-1.5 text-meta">
                      {isPlayingAll ? <Pause size={12} /> : <Play size={12} className="fill-current" />}
                      {isPlayingAll ? 'Pausar' : 'Reproducir todo'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={playerFrame} style={aspectStyle(aspectRatio)}>
              {hasFinal ? (
                <video src={srcUrl(finalVideo.localPath || finalVideo.url)} controls autoPlay playsInline className="w-full h-full object-contain" />
              ) : finalVideo.rendering ? (
                <div className="flex flex-col items-center justify-center gap-2 p-8 text-center bg-surface-soft w-full h-full">
                  <Loader2 size={18} className="animate-spin text-ink" />
                  <p className="text-body text-ink">Ensamblando…</p>
                  <p className="text-meta text-ink-subtle max-w-xs">Normalizando a {aspectRatio}, uniendo las tomas{includeSubtitles ? ' y añadiendo subtítulos' : ''}.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 p-8 text-center bg-surface-soft w-full h-full">
                  <Film size={22} strokeWidth={1.5} className="text-ink-subtle" />
                  <p className="text-body text-ink">Sin montaje final</p>
                  <p className="text-meta text-ink-subtle max-w-xs">
                    {readyShots.length > 0
                      ? `${readyShots.length} ${readyShots.length === 1 ? 'toma lista' : 'tomas listas'} para unir en un MP4.`
                      : 'Genera los videos de las tomas para poder ensamblar.'}
                  </p>
                  {readyShots.length > 0 && (
                    <button onClick={handleAssemble} className="btn-primary mt-2 flex items-center gap-1.5">
                      <Sparkles size={13} /> Ensamblar
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-8">
          <section>
            <SectionHeader title="Ficha" />
            <dl className="divide-y divide-hairline text-meta">
              {[
                ['Título', title],
                ['Duración', `~${totalDuration}s`],
                ['Clips', `${readyShots.length} de ${shots.length}`],
                ['Formato', `${aspectRatio} · ${isVertical ? '1080×1920' : isSquare ? '1080×1080' : '1920×1080'}`],
                ['Modelo', cleanModelName(videoModel.name)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2">
                  <dt className="text-ink-subtle">{k}</dt>
                  <dd className="text-ink text-right truncate">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <SectionHeader title="Tomas" count={shots.length} />
            <div className="space-y-1 max-h-[420px] overflow-y-auto -mx-1 px-1">
              {shots.map((shot) => {
                const readyIdx = readyShots.findIndex((rs) => rs.id === shot.id)
                const hasVideo = readyIdx >= 0
                const isSelected = viewMode === 'preview' && hasVideo && readyIdx === clampedIndex
                return (
                  <button
                    key={shot.id}
                    type="button"
                    disabled={!hasVideo}
                    onClick={() => { setSelectedShotIndex(readyIdx); setViewMode('preview') }}
                    className={`w-full flex items-center gap-3 p-1.5 rounded-xl text-left transition-colors ${
                      isSelected ? 'bg-surface-soft ring-1 ring-ink/20' : hasVideo ? 'hover:bg-surface-soft' : 'opacity-50 cursor-default'
                    }`}
                  >
                    <div className="size-11 rounded-lg overflow-hidden bg-surface-800 flex-shrink-0 flex items-center justify-center">
                      {shot.keyframeUrl ? <img src={srcUrl(shot.keyframeUrl)} alt="" className="w-full h-full object-cover" /> : <Film size={13} className="text-ink-subtle" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-meta text-ink">{String(shot.order).padStart(2, '0')}</span>
                        <span className="text-meta text-ink-subtle">{hasVideo ? `${shot.estimatedDuration}s` : 'Pendiente'}</span>
                      </div>
                      <p className="text-meta text-ink-muted truncate">{shot.actionPrompt || shot.dialogueText || 'Sin descripción'}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        </aside>
      </div>

      <StageFooter back={{ label: 'Tomas', onClick: () => setStage(3) }} />
    </StageLayout>
  )
}
