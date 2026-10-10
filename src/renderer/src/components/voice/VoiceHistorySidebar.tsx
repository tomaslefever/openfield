import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, History,
  PanelRightClose, PanelRightOpen, Download, RotateCcw, Star, Trash2,
  Loader, Copy, Check, ListMusic, AlertCircle,
} from 'lucide-react'
import { srcUrl } from '../../services/file-url'
import { ProviderLogo } from '../icons/ProviderLogos'
import { getAudioProvider, formatAudioModelLabel } from '../../lib/audio'
import { formatTime } from '../../lib/wav'
import { VoiceAvatar } from './VoiceAvatar'
import { parseAssetParams, voiceIdOf } from './voice-constants'

interface VoiceHistorySidebarProps {
  assets: any[]
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
  sentinelRef: React.RefObject<HTMLDivElement | null>
  resolveVoiceName: (asset: any) => string | null
  resolveModelLabel: (modelId: string) => string
  onRecreate: (asset: any) => void
  isGenerating?: boolean
  statusMessage?: string
}

const assetSrc = (asset: any) => srcUrl(asset?.localPath || asset?.filePath)

// ── Waveform peaks (decoded once per file, cached for the session) ──────────

const waveformCache = new Map<string, { peaks: number[]; duration: number }>()

function useWaveform(src: string | undefined, bars: number) {
  const [data, setData] = useState<{ peaks: number[]; duration: number } | null>(() => (src ? waveformCache.get(src) || null : null))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    if (!src) { setData(null); return }
    const cached = waveformCache.get(src)
    if (cached) { setData(cached); return }
    setData(null)
    let cancelled = false
    ;(async () => {
      const ctx = new AudioContext()
      try {
        const res = await fetch(src)
        const audio = await ctx.decodeAudioData(await res.arrayBuffer())
        const channel = audio.getChannelData(0)
        const block = Math.max(1, Math.floor(channel.length / bars))
        const step = Math.max(1, Math.floor(block / 256))
        const raw: number[] = []
        for (let i = 0; i < bars; i++) {
          let sum = 0
          let n = 0
          for (let j = i * block; j < Math.min(channel.length, (i + 1) * block); j += step) {
            sum += channel[j] * channel[j]
            n++
          }
          raw.push(n ? Math.sqrt(sum / n) : 0)
        }
        const max = Math.max(...raw, 1e-4)
        const entry = { peaks: raw.map((v) => Math.pow(v / max, 0.8)), duration: audio.duration }
        waveformCache.set(src, entry)
        if (!cancelled) setData(entry)
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        ctx.close().catch(() => {})
      }
    })()
    return () => { cancelled = true }
  }, [src, bars])

  return { data, failed }
}

function Waveform({ src, progress, onSeek }: { src?: string; progress: number; onSeek: (frac: number) => void }) {
  const BARS = 64
  const { data, failed } = useWaveform(src, BARS)
  const [hover, setHover] = useState<number | null>(null)
  const skeleton = useMemo(() => Array.from({ length: BARS }, (_, i) => 0.25 + 0.35 * Math.abs(Math.sin(i * 0.7))), [])
  const peaks = data?.peaks || skeleton
  const frac = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  }

  return (
    <div
      role="slider"
      aria-label="Posición de reproducción"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      onClick={(e) => onSeek(frac(e))}
      onMouseMove={(e) => setHover(frac(e))}
      onMouseLeave={() => setHover(null)}
      className="relative h-16 flex items-center gap-[2px] cursor-pointer select-none"
    >
      {peaks.map((p, i) => {
        const pos = (i + 0.5) / peaks.length
        const played = pos <= progress
        const hovered = hover != null && pos <= hover && !played
        return (
          <span
            key={i}
            className={`flex-1 rounded-full transition-colors duration-150 ${
              !data ? (failed ? 'bg-surface-700/50' : 'bg-surface-700/60 animate-pulse') :
              played ? 'bg-accent-400' : hovered ? 'bg-accent-400/40' : 'bg-surface-600/70'
            }`}
            style={{ height: `${Math.max(6, p * 100)}%` }}
          />
        )
      })}
    </div>
  )
}

function EqualizerBars({ active }: { active: boolean }) {
  return (
    <span className="flex items-end gap-[2px] h-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`w-[2px] rounded-full ${active ? 'bg-accent-400 animate-pulse' : 'bg-surface-600'}`}
          style={{ height: `${[60, 100, 75][i]}%`, animationDelay: `${i * 160}ms`, animationDuration: '700ms' }}
        />
      ))}
    </span>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function dayLabel(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOf(today) - startOf(d)) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

const ICON_BTN = 'w-8 h-8 rounded-full flex items-center justify-center text-surface-400 hover:text-surface-100 hover:bg-surface-800/80 transition-colors disabled:opacity-30 disabled:pointer-events-none'

// ── Sidebar ─────────────────────────────────────────────────────────────────

export function VoiceHistorySidebar({
  assets, hasMore, loadingMore, loadMore, sentinelRef, resolveVoiceName, resolveModelLabel, onRecreate, isGenerating, statusMessage,
}: VoiceHistorySidebarProps) {
  const [open, setOpen] = useState(true)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<any>(null)
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const pendingSeekRef = useRef<number | null>(null)
  const pendingAdvanceRef = useRef(false)

  const index = detailId ? assets.findIndex((a) => a.id === detailId) : -1
  // Keep the open item on screen while the list refetches (it is briefly empty)
  const detail = index >= 0 ? assets[index] : (detailId && snapshot?.id === detailId ? snapshot : null)

  useEffect(() => {
    if (index >= 0) setSnapshot(assets[index])
  }, [index, assets])

  useEffect(() => {
    setConfirmDelete(false)
    setCopied(false)
  }, [detailId])

  // ── Playback ──
  const load = useCallback((asset: any) => {
    const el = audioRef.current
    const src = assetSrc(asset)
    if (!el || !src) return false
    if (el.dataset.id !== asset.id) {
      el.src = src
      el.dataset.id = asset.id
      setLoadedId(asset.id)
      setTime(0)
      setDuration(0)
    }
    return true
  }, [])

  const play = useCallback((asset: any) => {
    if (load(asset)) audioRef.current?.play().catch(() => {})
  }, [load])

  const toggle = useCallback((asset: any) => {
    const el = audioRef.current
    if (!el) return
    if (loadedId === asset.id && isPlaying) el.pause()
    else play(asset)
  }, [loadedId, isPlaying, play])

  const seek = useCallback((asset: any, frac: number) => {
    const el = audioRef.current
    if (!el || !load(asset)) return
    if (el.duration && isFinite(el.duration)) {
      el.currentTime = frac * el.duration
      setTime(el.currentTime)
    } else {
      pendingSeekRef.current = frac
    }
  }, [load])

  // Smooth progress while playing (timeupdate alone is ~4 Hz)
  useEffect(() => {
    if (!isPlaying) return
    let raf = 0
    const tick = () => {
      const el = audioRef.current
      if (el) setTime(el.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying])

  // ── Playlist navigation ──
  // Stepping through the playlist always starts the new item
  const goTo = useCallback((target: any | undefined) => {
    if (!target) return
    setDetailId(target.id)
    play(target)
  }, [play])

  const goPrev = useCallback(() => {
    if (index > 0) goTo(assets[index - 1])
  }, [index, assets, goTo])

  const goNext = useCallback(() => {
    if (index < 0) return
    if (index < assets.length - 1) goTo(assets[index + 1])
    else if (hasMore) {
      pendingAdvanceRef.current = true
      loadMore()
    }
  }, [index, assets, hasMore, loadMore, goTo])

  // Finish a "next" that had to wait for the following page
  useEffect(() => {
    if (!pendingAdvanceRef.current || index < 0) return
    if (index < assets.length - 1) {
      pendingAdvanceRef.current = false
      goTo(assets[index + 1])
    } else if (!hasMore && !loadingMore) {
      pendingAdvanceRef.current = false
    }
  }, [assets, index, hasMore, loadingMore, goTo])

  const handleEnded = () => {
    setIsPlaying(false)
    if (!autoAdvance) return
    const i = assets.findIndex((a) => a.id === loadedId)
    const next = i >= 0 ? assets[i + 1] : undefined
    if (!next) return
    if (detailId === loadedId) setDetailId(next.id)
    play(next)
  }

  // ←/→ step through the playlist while the player is open (not while typing)
  useEffect(() => {
    if (!detailId) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [data-radix-popper-content-wrapper]')) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailId, goPrev, goNext])

  // ── Asset actions ──
  const handleSaveAs = async (asset: any) => {
    if (savingId) return
    setSavingId(asset.id)
    try {
      await (window as any).electronAPI?.assets.saveAs(asset.id)
    } catch (err) {
      console.error('Save as failed:', err)
    } finally {
      setSavingId(null)
    }
  }

  const handleToggleFavorite = async (asset: any) => {
    try {
      await (window as any).electronAPI?.assets.toggleFavorite(asset.id)
    } catch (err) {
      console.error('Toggle favorite failed:', err)
    }
  }

  const handleDelete = async (asset: any) => {
    setConfirmDelete(false)
    const i = assets.findIndex((a) => a.id === asset.id)
    const target = assets[i + 1] || assets[i - 1]
    if (loadedId === asset.id) {
      audioRef.current?.pause()
      if (audioRef.current) { audioRef.current.removeAttribute('src'); delete audioRef.current.dataset.id }
      setLoadedId(null)
    }
    setDetailId(target ? target.id : null)
    try {
      await (window as any).electronAPI?.assets.delete(asset.id)
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {}
  }

  // ── Grouped list ──
  const groups = useMemo(() => {
    const out: { label: string; items: any[] }[] = []
    for (const a of assets) {
      const label = a.createdAt ? dayLabel(a.createdAt) : 'Anteriores'
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(a)
      else out.push({ label, items: [a] })
    }
    return out
  }, [assets])

  const voiceLabel = (asset: any) => resolveVoiceName(asset) || formatAudioModelLabel(asset.modelUsed)

  return (
    <aside className={`border-l border-surface-800 bg-surface-950/80 flex flex-col min-h-0 flex-shrink-0 transition-[width] duration-200 ${open ? 'w-80' : 'w-12'}`}>
      {!open ? (
        // ── Collapsed rail: playback keeps going, with a resume/pause shortcut ──
        <div className="flex flex-col items-center py-2.5 gap-2">
          <button onClick={() => setOpen(true)} title="Mostrar historial" className={ICON_BTN}>
            <PanelRightOpen size={15} />
          </button>
          {loadedId && (
            <button
              onClick={() => { const a = assets.find((x) => x.id === loadedId); if (a) toggle(a) }}
              title={isPlaying ? 'Pausar' : 'Reanudar'}
              className="w-8 h-8 rounded-full bg-accent-500/15 text-accent-300 hover:bg-accent-500/25 flex items-center justify-center transition-colors"
            >
              {isPlaying ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
            </button>
          )}
        </div>
      ) : (
      <>
      {/* ── List view (kept mounted so scroll position and the pagination sentinel survive) ── */}
      <div className={`flex-1 flex-col min-h-0 ${detail ? 'hidden' : 'flex'}`}>
        <div className="flex items-center gap-2 h-12 px-3 border-b border-surface-800 flex-shrink-0">
          <History size={14} className="text-surface-500" />
          <span className="text-xs font-semibold text-surface-200">Historial</span>
          <span className="text-[10px] text-surface-500 font-mono">{assets.length}{hasMore ? '+' : ''}</span>
          <button onClick={() => setOpen(false)} title="Ocultar historial" className={`${ICON_BTN} ml-auto`}>
            <PanelRightClose size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-2 py-2">
          {isGenerating && (
            <div className="mx-1 mb-2 flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl border border-accent-500/25 bg-accent-500/[0.06]">
              <span className="w-9 h-9 rounded-full bg-accent-500/15 flex items-center justify-center flex-shrink-0">
                <Loader size={14} className="animate-spin text-accent-400" />
              </span>
              <div className="min-w-0">
                <p className="text-[12px] text-surface-200 font-medium">Generando…</p>
                <p className="text-[10px] text-surface-500 truncate">{statusMessage || 'En cola'}</p>
              </div>
            </div>
          )}

          {assets.length === 0 && !isGenerating ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 px-6 text-center text-surface-600">
              <ListMusic size={26} className="opacity-50" />
              <p className="text-[11px] leading-relaxed">Tus generaciones de voz aparecerán aquí, listas para reproducir como una playlist.</p>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mb-2">
                <p className="px-2.5 pt-2 pb-1 eyebrow first-letter:uppercase">{g.label}</p>
                <div className="space-y-0.5">
                  {g.items.map((asset) => {
                    const isLoaded = loadedId === asset.id
                    const playingThis = isLoaded && isPlaying
                    const provider = getAudioProvider(asset)
                    return (
                      <div
                        key={asset.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setDetailId(asset.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') setDetailId(asset.id) }}
                        className={`group flex items-start gap-2.5 px-2 py-2 rounded-xl cursor-pointer transition-colors outline-none focus-visible:ring-1 focus-visible:ring-accent-500/50 ${
                          isLoaded ? 'bg-accent-500/[0.07] hover:bg-accent-500/10' : 'hover:bg-surface-800/50'
                        }`}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); toggle(asset) }}
                          title={playingThis ? 'Pausar' : 'Reproducir'}
                          className={`relative w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                            playingThis
                              ? 'bg-accent-500 text-on-accent shadow-md shadow-accent-600/30'
                              : 'bg-surface-800 text-surface-300 group-hover:bg-surface-700 hover:!bg-accent-500 hover:text-on-accent'
                          }`}
                        >
                          {playingThis ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12px] leading-snug line-clamp-2 ${isLoaded ? 'text-surface-100' : 'text-surface-300 group-hover:text-surface-200'}`}>
                            {asset.prompt || '—'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 min-w-0">
                            <VoiceAvatar seed={voiceIdOf(asset)} name={voiceLabel(asset)} size={12} />
                            <span className="text-[10px] text-surface-500 truncate">{voiceLabel(asset)}</span>
                            {provider && <ProviderLogo provider={provider} size={10} />}
                            {asset.createdAt && <span className="text-[10px] text-surface-600 ml-auto flex-shrink-0">{timeLabel(asset.createdAt)}</span>}
                          </div>
                        </div>
                        <div className="flex flex-col items-center justify-between self-stretch py-0.5 flex-shrink-0">
                          {asset.isFavorite ? <Star size={10} className="text-amber-500 dark:text-amber-400" fill="currentColor" /> : <span className="h-2.5" />}
                          {isLoaded ? <EqualizerBars active={playingThis} /> : <ChevronRight size={13} className="text-surface-600 opacity-0 group-hover:opacity-100 transition-opacity" />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}

          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center py-4">
              {loadingMore && <Loader size={14} className="animate-spin text-surface-500" />}
            </div>
          )}
        </div>
      </div>

      {/* ── Player view ── */}
      {detail && (() => {
        const isLoaded = loadedId === detail.id
        const playingThis = isLoaded && isPlaying
        const p = parseAssetParams(detail)
        const provider = getAudioProvider(detail)
        const name = voiceLabel(detail)
        const cachedDur = waveformCache.get(assetSrc(detail) || '')?.duration || 0
        const dur = isLoaded && duration ? duration : cachedDur
        const cur = isLoaded ? time : 0
        const progress = dur ? Math.min(1, cur / dur) : 0
        const isVc = p.mode === 'voicechanger' || (detail.modelUsed || '').startsWith('elevenlabs:vc:')
        const meta: { label: string; value: string }[] = [
          detail.createdAt && { label: 'Fecha', value: new Date(detail.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) },
          dur && { label: 'Duración', value: formatTime(dur) },
          p.speed != null && { label: 'Velocidad', value: `${Number(p.speed).toFixed(1)}x` },
          p.stability != null && { label: 'Estabilidad', value: Number(p.stability).toFixed(2) },
          p.similarityBoost != null && { label: 'Similitud', value: Number(p.similarityBoost).toFixed(2) },
          p.style != null && { label: 'Estilo', value: Number(p.style).toFixed(2) },
          p.generationTime && { label: 'Tiempo', value: String(p.generationTime) },
        ].filter(Boolean) as { label: string; value: string }[]
        const atEnd = index >= assets.length - 1 && !hasMore

        return (
          <div className="flex-1 flex flex-col min-h-0 animate-in fade-in slide-in-from-right-2 duration-200">
            <div className="flex items-center gap-1 h-12 px-2 border-b border-surface-800 flex-shrink-0">
              <button onClick={() => setDetailId(null)} className="flex items-center gap-1 h-8 pl-1.5 pr-2.5 rounded-pill text-xs text-surface-400 hover:text-surface-100 hover:bg-surface-800/80 transition-colors">
                <ChevronLeft size={15} /> Historial
              </button>
              <span className="ml-auto text-[10px] font-mono text-surface-500 px-1">
                {index >= 0 ? `${index + 1} / ${assets.length}${hasMore ? '+' : ''}` : '—'}
              </span>
              <button onClick={() => setOpen(false)} title="Ocultar historial" className={ICON_BTN}>
                <PanelRightClose size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {/* Now playing */}
              <div className="px-4 pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <VoiceAvatar seed={voiceIdOf(detail)} name={name} size={44} className={playingThis ? 'shadow-lg shadow-accent-500/20' : ''} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-surface-100 truncate">{name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                      {provider && <ProviderLogo provider={provider} size={11} />}
                      <span className="text-[11px] text-surface-500 truncate">
                        {isVc ? 'Voice changer' : (p.model ? resolveModelLabel(String(p.model)) : formatAudioModelLabel(detail.modelUsed))}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <Waveform src={assetSrc(detail)} progress={progress} onSeek={(f) => seek(detail, f)} />
                  <div className="flex items-center justify-between mt-1.5 text-[10px] font-mono text-surface-500 tabular-nums">
                    <span>{formatTime(cur)}</span>
                    <span>{dur ? formatTime(dur) : '--:--'}</span>
                  </div>
                </div>

                {/* Transport */}
                <div className="flex items-center justify-between mt-3">
                  <button
                    onClick={() => setAutoAdvance((v) => !v)}
                    title={autoAdvance ? 'Reproducción continua: activada' : 'Reproducción continua: desactivada'}
                    className={`${ICON_BTN} ${autoAdvance ? '!text-accent-400' : ''}`}
                  >
                    <ListMusic size={15} />
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={goPrev} disabled={index <= 0} title="Anterior (←)" className={`${ICON_BTN} w-10 h-10 rounded-full`}>
                      <SkipBack size={17} fill="currentColor" />
                    </button>
                    <button
                      onClick={() => toggle(detail)}
                      title={playingThis ? 'Pausar' : 'Reproducir'}
                      className="w-12 h-12 rounded-full bg-accent-600 hover:bg-accent-500 text-on-accent flex items-center justify-center shadow-lg shadow-accent-600/30 transition-all active:scale-95"
                    >
                      {playingThis ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <button onClick={goNext} disabled={index < 0 || atEnd} title="Siguiente (→)" className={`${ICON_BTN} w-10 h-10 rounded-full`}>
                      {pendingAdvanceRef.current && loadingMore ? <Loader size={15} className="animate-spin" /> : <SkipForward size={17} fill="currentColor" />}
                    </button>
                  </div>
                  <button
                    onClick={() => handleToggleFavorite(detail)}
                    title={detail.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                    className={`${ICON_BTN} ${detail.isFavorite ? '!text-amber-500 dark:!text-amber-400' : 'hover:!text-amber-500 dark:hover:!text-amber-400'}`}
                  >
                    <Star size={15} fill={detail.isFavorite ? 'currentColor' : 'none'} />
                  </button>
                </div>
              </div>

              {/* Script */}
              <div className="mx-3 rounded-xl border border-surface-800 bg-surface-900/50">
                <div className="flex items-center justify-between px-3 pt-2.5">
                  <span className="eyebrow">{isVc ? 'Origen' : 'Texto'}</span>
                  {detail.prompt && (
                    <button onClick={() => handleCopy(detail.prompt)} title="Copiar texto" className="text-surface-500 hover:text-surface-200 transition-colors p-0.5">
                      {copied ? <Check size={12} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  )}
                </div>
                <p className="px-3 pt-1.5 pb-3 text-[12.5px] leading-relaxed text-surface-200 whitespace-pre-wrap break-words max-h-56 overflow-y-auto">
                  {detail.prompt || '—'}
                </p>
              </div>

              {/* Meta */}
              {meta.length > 0 && (
                <dl className="mx-3 mt-3 grid grid-cols-2 gap-px rounded-xl overflow-hidden border border-surface-800 bg-surface-800">
                  {meta.map((m) => (
                    <div key={m.label} className="bg-surface-950 px-3 py-2 min-w-0">
                      <dt className="eyebrow">{m.label}</dt>
                      <dd className="text-[11px] text-surface-200 truncate mt-0.5" title={m.value}>{m.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 p-3 border-t border-surface-800 flex-shrink-0">
              {confirmDelete ? (
                <>
                  <span className="text-[11px] text-surface-400 flex items-center gap-1.5 flex-1">
                    <AlertCircle size={12} className="text-red-600 dark:text-red-400" /> ¿Eliminar esta generación?
                  </span>
                  <button onClick={() => setConfirmDelete(false)} className="h-8 px-2.5 rounded-pill text-[11px] text-surface-300 hover:bg-surface-800 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={() => handleDelete(detail)} className="h-8 px-2.5 rounded-pill text-[11px] font-medium bg-red-500/90 hover:bg-red-500 text-white transition-colors">
                    Eliminar
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => onRecreate(detail)}
                    className="flex-1 h-8 rounded-pill bg-surface-800 hover:bg-surface-700 text-surface-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RotateCcw size={12} /> Reutilizar ajustes
                  </button>
                  <button onClick={() => handleSaveAs(detail)} title="Guardar como…" className={`${ICON_BTN} bg-surface-800/60`}>
                    {savingId === detail.id ? <Loader size={13} className="animate-spin" /> : <Download size={13} />}
                  </button>
                  <button onClick={() => setConfirmDelete(true)} title="Eliminar" className={`${ICON_BTN} bg-surface-800/60 hover:!text-red-600 dark:hover:!text-red-400`}>
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })()}
      </>
      )}

      <audio
        ref={audioRef}
        className="hidden"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget
          setDuration(isFinite(el.duration) ? el.duration : 0)
          if (pendingSeekRef.current != null && isFinite(el.duration)) {
            el.currentTime = pendingSeekRef.current * el.duration
            setTime(el.currentTime)
          }
          pendingSeekRef.current = null
        }}
      />
    </aside>
  )
}
