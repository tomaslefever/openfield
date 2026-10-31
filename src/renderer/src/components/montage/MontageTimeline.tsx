import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AudioLines,
  FileDown,
  Eye,
  Film,
  Mic,
  Music,
  Pause,
  Play,
  Plus,
  RectangleHorizontal,
  Redo2,
  Repeat,
  Scissors,
  Settings2,
  SkipBack,
  Smartphone,
  Trash2,
  Type,
  Undo2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { posterUrl, thumbUrl } from '../../services/file-url'
import {
  MIN_CLIP,
  TRACK_LABEL,
  clipEnd,
  clipOpacityEnvelope,
  computeDucking,
  duckingConfig,
  envelopeAt,
  isVoiceClip,
  clipVolumeAt,
  clipVolumeEnvelope,
  fadeLengths,
  docDuration,
  fitStart,
  neighbourBounds,
  trackKindFor,
  useMontageStore,
  type EnvelopeKey,
  type MontageClip,
  type MontageDoc,
  type MontageTrack,
  type TrackKind,
} from '../../stores/montage-store'
import { ASSET_MIME } from './MediaBin'
import { AutocaptionsButton } from './AutocaptionsButton'
import { AutoduckingButton } from './AutoduckingButton'
import { formatClock, formatRuler, rulerStep } from './time'
import { PEAKS_PER_SEC, usePeaks } from './waveform'

const HEADER_W = 136
const RULER_H = 26
const TRACK_H = 40
const SNAP_PX = 8
const DRAG_THRESHOLD = 3

const TRACK_ICON: Record<TrackKind, LucideIcon> = { caption: Type, video: Film, audio: AudioLines }

/** Audio clips take their colour from their track */
const AUDIO_COLORS = ['bg-violet-600', 'bg-blue-600', 'bg-teal-600', 'bg-pink-600']

function snapPoints(doc: MontageDoc, ignoreId: string): number[] {
  const points = [0, useMontageStore.getState().time]
  for (const c of doc.clips) if (c.id !== ignoreId) points.push(c.start, clipEnd(c))
  return points
}

/** Nearest snap point within `threshold`, as a delta to apply (0 when nothing is close) */
function snapDelta(values: number[], points: number[], threshold: number): number {
  let best = 0
  let bestDist = threshold
  for (const v of values) {
    for (const p of points) {
      const d = Math.abs(p - v)
      if (d < bestDist) { bestDist = d; best = p - v }
    }
  }
  return best
}

export function MontageTimeline() {
  const doc = useMontageStore((s) => s.doc)
  const zoom = useMontageStore((s) => s.zoom)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewW, setViewW] = useState(0)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const duration = docDuration(doc)
  // Background tracks' ducking curves, derived from the voice clips (recomputed on every edit)
  const ducking = useMemo(() => computeDucking(doc), [doc])
  const contentW = Math.max((duration + 20) * zoom, viewW - HEADER_W)

  // Ctrl/Cmd + wheel zooms around the pointer
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const { zoom: z, setZoom } = useMontageStore.getState()
      const x = e.clientX - el.getBoundingClientRect().left
      const t = (el.scrollLeft + x - HEADER_W) / z
      setZoom(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
      requestAnimationFrame(() => {
        el.scrollLeft = t * useMontageStore.getState().zoom - x + HEADER_W
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    // select-none: a stray text selection would turn clip drags into native drag-and-drop
    <div className="flex h-full min-h-0 select-none flex-col">
      <Toolbar />
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto overscroll-none">
        <div className="relative min-h-full" style={{ width: HEADER_W + contentW }}>
          <div className="sticky top-0 z-40 flex" style={{ height: RULER_H }}>
            <div className="sticky left-0 z-10 shrink-0 border-b border-hairline bg-surface-900" style={{ width: HEADER_W }} />
            <Ruler width={contentW} zoom={zoom} />
          </div>
          {doc.tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              doc={doc}
              duck={ducking.get(track.id)}
              zoom={zoom}
              width={contentW}
              color={AUDIO_COLORS[doc.tracks.filter((t) => t.kind === 'audio').indexOf(track) % AUDIO_COLORS.length]}
            />
          ))}
          <PlayheadLine scrollRef={scrollRef} />
        </div>
      </div>
    </div>
  )
}

/* ─── Toolbar ─────────────────────────────────────────────────────── */

function Toolbar() {
  const playing = useMontageStore((s) => s.playing)
  const loop = useMontageStore((s) => s.loop)
  const canUndo = useMontageStore((s) => s.past.length > 0)
  const canRedo = useMontageStore((s) => s.future.length > 0)
  const zoom = useMontageStore((s) => s.zoom)
  const envelope = useMontageStore((s) => s.envelope)
  const { togglePlay, toggleLoop, setTime, undo, redo, splitAtPlayhead, setZoom, setEnvelope } = useMontageStore.getState()

  return (
    // Scrolls sideways instead of clipping its right-hand tools when the window is narrow
    <div className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto bg-surface-800/60 px-2 [scrollbar-width:thin]">
      <ToolButton icon={SkipBack} label="Ir al inicio (Inicio)" onClick={() => setTime(0)} />
      <ToolButton icon={playing ? Pause : Play} label={playing ? 'Pausa (Espacio)' : 'Reproducir (Espacio)'} onClick={togglePlay} />
      <ToolButton icon={Repeat} label="Repetir" onClick={toggleLoop} active={loop} />
      <Timecode />

      <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
        <ToolButton icon={Undo2} label="Deshacer (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
        <ToolButton icon={Redo2} label="Rehacer (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} />
        <span className="mx-1.5 h-4 w-px bg-hairline" />
        <ToolButton icon={Scissors} label="Dividir en el cursor (S)" onClick={splitAtPlayhead} />
        <AddTrackMenu />
        <AutocaptionsButton />
        <AutoduckingButton />
        <span className="mx-1.5 h-4 w-px bg-hairline" />
        {/* Which curve video clips show: their sound or their opacity (audio clips always volume, images opacity) */}
        <ToolButton icon={Volume2} label="Clips de video: editar la curva de volumen" onClick={() => setEnvelope('volume')} active={envelope === 'volume'} />
        <ToolButton icon={Eye} label="Clips de video: editar la curva de opacidad" onClick={() => setEnvelope('opacity')} active={envelope === 'opacity'} />
        <span className="mx-1.5 h-4 w-px bg-hairline" />
        <ToolButton icon={ZoomOut} label="Alejar (Ctrl+rueda)" onClick={() => setZoom(zoom / 1.4)} />
        <ToolButton icon={ZoomIn} label="Acercar (Ctrl+rueda)" onClick={() => setZoom(zoom * 1.4)} />
      </div>
    </div>
  )
}

function ToolButton({ icon: Icon, label, onClick, disabled, active }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-pressed={active}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface-700 hover:text-ink disabled:pointer-events-none disabled:opacity-30 ${
        active ? 'bg-surface-700 text-ink' : 'text-ink-muted'
      }`}
    >
      <Icon size={15} />
    </button>
  )
}

function Timecode() {
  const time = useMontageStore((s) => s.time)
  const duration = useMontageStore((s) => docDuration(s.doc))
  return (
    <span className="ml-2 whitespace-nowrap font-mono text-[12px] tabular-nums text-ink-muted">
      <span className="text-ink">{formatClock(time)}</span> / {formatClock(duration)}
    </span>
  )
}

function AddTrackMenu() {
  const [open, setOpen] = useState(false)
  const addTrack = useMontageStore((s) => s.addTrack)
  const kinds: TrackKind[] = ['caption', 'video', 'audio']
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          title="Añadir pista"
          className="flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] text-ink-muted transition-colors hover:bg-surface-700 hover:text-ink"
        >
          <Plus size={14} /> Pista
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        {kinds.map((k) => {
          const Icon = TRACK_ICON[k]
          return (
            <button
              key={k}
              onClick={() => { addTrack(k); setOpen(false) }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-surface-800"
            >
              <Icon size={14} className="text-ink-muted" /> {TRACK_LABEL[k]}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

/* ─── Ruler & playhead ────────────────────────────────────────────── */

/** Click or drag on the ruler / empty lane space to move the playhead */
function startScrub(e: React.PointerEvent<HTMLElement>, originLeft: number) {
  const { zoom, setTime, pause } = useMontageStore.getState()
  pause()
  const el = e.currentTarget
  const at = (clientX: number) => setTime((clientX - el.getBoundingClientRect().left - originLeft) / zoom)
  at(e.clientX)
  el.setPointerCapture(e.pointerId)
  const move = (ev: PointerEvent) => at(ev.clientX)
  const up = () => {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}

const Ruler = memo(function Ruler({ width, zoom }: { width: number; zoom: number }) {
  const step = rulerStep(zoom)
  const ticks = Math.ceil(width / zoom / step) + 1
  return (
    <div
      className="relative shrink-0 cursor-text select-none border-b border-hairline bg-surface-900"
      style={{ width }}
      onPointerDown={(e) => e.button === 0 && startScrub(e, 0)}
    >
      {Array.from({ length: ticks }, (_, i) => {
        const t = i * step
        return (
          <div key={i} className="absolute bottom-0 h-1.5 border-l border-hairline" style={{ left: t * zoom }}>
            <span className="absolute -top-[15px] left-1 font-mono text-[10px] tabular-nums text-ink-subtle">
              {formatRuler(t, step < 1)}
            </span>
          </div>
        )
      })}
      <RulerHead zoom={zoom} />
    </div>
  )
})

function RulerHead({ zoom }: { zoom: number }) {
  const time = useMontageStore((s) => s.time)
  return (
    <div className="pointer-events-none absolute bottom-0 top-0 z-10" style={{ left: time * zoom }}>
      <div className="absolute left-0 h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-[2px] bg-red-500" style={{ top: -5 }} />
    </div>
  )
}

function PlayheadLine({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const time = useMontageStore((s) => s.time)
  const zoom = useMontageStore((s) => s.zoom)
  const playing = useMontageStore((s) => s.playing)
  const x = HEADER_W + time * zoom

  // Follow the playhead during playback
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing) return
    const lanesW = el.clientWidth - HEADER_W
    if (x > el.scrollLeft + el.clientWidth - 24 || x < el.scrollLeft + HEADER_W) {
      el.scrollLeft = x - HEADER_W - lanesW * 0.15
    }
  }, [x, playing, scrollRef])

  return <div className="pointer-events-none absolute bottom-0 top-0 z-[25] w-px bg-red-500" style={{ left: x }} />
}

/* ─── Tracks ──────────────────────────────────────────────────────── */

const TrackRow = memo(function TrackRow({ track, doc, duck, zoom, width, color }: { track: MontageTrack; doc: MontageDoc; duck?: EnvelopeKey[]; zoom: number; width: number; color: string }) {
  const selectedClipId = useMontageStore((s) => s.selectedClipId)
  const [dropping, setDropping] = useState(false)
  const height = TRACK_H
  const clips = doc.clips.filter((c) => c.trackId === track.id).sort((a, b) => a.start - b.start)

  const timeAt = (e: React.MouseEvent<HTMLElement>) => (e.clientX - e.currentTarget.getBoundingClientRect().left) / zoom

  return (
    <div className="flex" style={{ height }}>
      <TrackHeader track={track} clips={clips} />
      <div
        data-lane-track={track.id}
        data-lane-kind={track.kind}
        className={`relative shrink-0 border-b border-hairline transition-colors ${dropping ? 'bg-surface-800/70' : ''}`}
        style={{ width }}
        onPointerDown={(e) => {
          if (e.button !== 0 || e.target !== e.currentTarget) return
          useMontageStore.getState().select(null)
          startScrub(e, 0)
        }}
        onDoubleClick={(e) => {
          if (track.kind === 'caption' && e.target === e.currentTarget) useMontageStore.getState().addCaption(track.id, timeAt(e))
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(ASSET_MIME)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDropping(true)
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          setDropping(false)
          const raw = e.dataTransfer.getData(ASSET_MIME)
          if (!raw) return
          e.preventDefault()
          try {
            useMontageStore.getState().addAsset(JSON.parse(raw), { trackId: track.id, start: Math.max(0, timeAt(e)) })
          } catch {}
        }}
      >
        {clips.length === 0 && track.kind === 'caption' && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-subtle">
            Doble clic para añadir un subtítulo
          </span>
        )}
        {clips.map((clip) => (
          <ClipView
            key={clip.id}
            clip={clip}
            zoom={zoom}
            height={height}
            color={color}
            selected={clip.id === selectedClipId}
            duck={duck && !isVoiceClip(clip, track) ? duck : undefined}
          />
        ))}
      </div>
    </div>
  )
})

function TrackHeader({ track, clips }: { track: MontageTrack; clips: MontageClip[] }) {
  const [editing, setEditing] = useState(false)
  const { renameTrack, removeTrack, toggleTrackMute, setCaptionStyle } = useMontageStore.getState()
  const social = track.captionStyle === 'social'

  const exportSrt = async () => {
    const api = (window as any).electronAPI
    const { doc, name } = useMontageStore.getState()
    const res = await api?.captions?.exportSrt?.(doc, track.id, `${name} - ${track.name}`)
    if (res?.ok) toast.success('Subtítulos exportados', { description: res.path })
    else if (res && !res.canceled) toast.error('No se pudo exportar el SRT', { description: res.error })
  }
  const subtitle = clips.map((c) => (c.kind === 'caption' ? c.text : c.name.replace(/\.[^.]+$/, ''))).join(' · ')

  return (
    <div
      className="group sticky left-0 z-30 flex shrink-0 items-center gap-1 border-b border-hairline bg-surface-900 pl-2.5 pr-1"
      style={{ width: HEADER_W }}
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center">
      {editing ? (
        <input
          autoFocus
          defaultValue={track.name}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => { renameTrack(track.id, e.currentTarget.value); setEditing(false) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="h-5 w-full select-text rounded-[4px] bg-surface-800 px-1 text-[12px] text-ink outline-none ring-1 ring-hairline"
        />
      ) : (
        <span
          onDoubleClick={() => setEditing(true)}
          title="Doble clic para renombrar"
          className="cursor-text truncate text-[12px] leading-tight text-ink"
        >
          {track.name}
        </span>
      )}
        <span className="truncate text-[10px] leading-tight text-ink-subtle">{subtitle || TRACK_LABEL[track.kind]}</span>
      </div>
      {!editing && (
        <button
          onClick={() => removeTrack(track.id)}
          title="Eliminar pista"
          className="flex h-6 w-5 shrink-0 items-center justify-center rounded-md text-ink-subtle opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
        >
          <Trash2 size={11} />
        </button>
      )}
      {!editing && track.kind === 'caption' && clips.length > 0 && (
        <button
          onClick={exportSrt}
          title="Exportar esta pista como .srt"
          className="flex h-6 w-5 shrink-0 items-center justify-center rounded-md text-ink-subtle opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
        >
          <FileDown size={11} />
        </button>
      )}
      {track.kind === 'caption' && (
        <button
          onClick={() => setCaptionStyle(track.id, { captionStyle: social ? 'classic' : 'social' })}
          title={social ? 'Estilo vertical: texto grande, palabra resaltada (clic para clásico)' : 'Estilo clásico (clic para vertical grande)'}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-800 ${
            social ? 'text-ink' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {social ? <Smartphone size={13} /> : <RectangleHorizontal size={13} />}
        </button>
      )}
      {track.kind !== 'caption' && <TrackRoleMenu track={track} />}
      {track.kind !== 'caption' && (
        <button
          onClick={() => toggleTrackMute(track.id)}
          title={track.muted ? 'Activar sonido de la pista' : 'Silenciar pista'}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-800 ${
            track.muted ? 'text-red-400' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
      )}
    </div>
  )
}

/** Voice / background (ducking) / normal for a sound track, with the ducking settings */
function TrackRoleMenu({ track }: { track: MontageTrack }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const { setTrackRole, setDucking, bakeDucking, detectVoices } = useMontageStore.getState()
  const cfg = duckingConfig(track)
  const Icon = track.role === 'voice' ? Mic : track.role === 'background' ? Music : Settings2
  const label = track.role === 'voice' ? 'Pista de voz: hace bajar las pistas de fondo' : track.role === 'background' ? `Pista de fondo: baja ${cfg.amountDb} dB con las voces${cfg.enabled ? '' : ' (ducking apagado)'}` : 'Rol de la pista (voz / fondo con ducking)'
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v.trim() !== '' ? Number(v) : fallback)
  const field = 'h-6 w-full rounded-md bg-surface-900 px-1.5 text-[11.5px] text-ink outline-none ring-1 ring-hairline'

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setNote(null) }}>
      <PopoverTrigger asChild>
        <button
          title={label}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-800 ${
            track.role ? 'text-ink' : 'text-ink-subtle opacity-0 hover:text-ink group-hover:opacity-100'
          } ${track.role === 'background' && !cfg.enabled ? 'opacity-60' : ''}`}
        >
          <Icon size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2.5 p-3 text-[12px]">
        <div>
          <p className="mb-1 text-[11px] text-ink-subtle">Rol de «{track.name}»</p>
          <div className="grid grid-cols-3 gap-1">
            {([['none', 'Normal'], ['voice', 'Voz'], ['background', 'Fondo']] as const).map(([r, l]) => {
              const active = (track.role ?? 'none') === r
              return (
                <button
                  key={r}
                  onClick={() => setTrackRole(track.id, r === 'none' ? null : r)}
                  className={`h-7 rounded-md text-[12px] transition-colors ${active ? 'bg-surface-700 text-ink' : 'text-ink-muted ring-1 ring-hairline hover:bg-surface-800'}`}
                >
                  {l}
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-ink-subtle">
            {track.role === 'voice' ? 'Sus clips hacen bajar las pistas de fondo mientras suenan.' : track.role === 'background' ? 'Baja sola cuando suenan las voces (ducking). Se suma a su volumen y keyframes.' : 'Ni voz ni fondo.'}
          </p>
        </div>

        {track.role === 'background' && (
          <>
            <label className="flex items-center gap-2 text-ink">
              <input type="checkbox" checked={cfg.enabled} onChange={(e) => setDucking(track.id, { enabled: e.target.checked })} />
              Ducking automático
            </label>
            <div className={`grid grid-cols-2 gap-2 ${cfg.enabled ? '' : 'pointer-events-none opacity-40'}`}>
              {([
                ['Reducción (dB)', 'amountDb', 1, -60, 0],
                ['Ataque (ms)', 'attack', 1000, 0, 5000],
                ['Release (ms)', 'release', 1000, 0, 10000],
                ['Margen antes (ms)', 'padBefore', 1000, 0, 5000],
                ['Margen después (ms)', 'padAfter', 1000, 0, 5000],
              ] as const).map(([l, key, scale, min, max]) => (
                <label key={key} className="block">
                  <span className="mb-0.5 block text-[10.5px] text-ink-subtle">{l}</span>
                  <input
                    type="number"
                    min={min}
                    max={max}
                    step={key === 'amountDb' ? 1 : 10}
                    defaultValue={Math.round(cfg[key] * scale)}
                    key={`${key}:${cfg[key]}`}
                    onBlur={(e) => {
                      const v = Math.min(max, Math.max(min, num(e.currentTarget.value, cfg[key] * scale))) / scale
                      if (v !== cfg[key]) setDucking(track.id, { [key]: v })
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    className={field}
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <button
                onClick={async () => {
                  const res = await detectVoices()
                  setNote(res.voiceTracks.length || res.voiceClips.length
                    ? `Voces detectadas: ${res.voiceTracks.length} pista(s), ${res.voiceClips.length} clip(s) TTS.`
                    : 'No encontré clips nuevos de voz (TTS). Marca la pista de voz a mano.')
                }}
                className="h-7 rounded-md text-[12px] text-ink ring-1 ring-hairline transition-colors hover:bg-surface-800"
              >
                Detectar voces (TTS)
              </button>
              <button
                disabled={!cfg.enabled}
                onClick={() => {
                  const n = bakeDucking(track.id)
                  setNote(n ? `Ducking fijado como keyframes de volumen en ${n} clip(s); el automático quedó apagado.` : 'No hay nada que fijar: ninguna voz cae sobre esta pista.')
                }}
                title="Escribe el ducking en los keyframes de volumen para editarlo a mano (apaga el automático)"
                className="h-7 rounded-md text-[12px] text-ink ring-1 ring-hairline transition-colors hover:bg-surface-800 disabled:opacity-40"
              >
                Fijar como keyframes
              </button>
            </div>
          </>
        )}
        {note && <p className="text-[11px] leading-snug text-ink-muted">{note}</p>}
      </PopoverContent>
    </Popover>
  )
}

/* ─── Clips ───────────────────────────────────────────────────────── */

type DragMode = 'move' | 'trim-start' | 'trim-end' | 'level' | 'key' | 'fade-in' | 'fade-out'
type Envelope = 'volume' | 'opacity'

/** Which envelope a clip shows on the timeline: audio → volume, images → opacity, video → the toolbar choice */
function clipEnvelope(clip: MontageClip, videoChoice: Envelope): Envelope | null {
  if (clip.kind === 'audio') return 'volume'
  if (clip.kind === 'image') return 'opacity'
  if (clip.kind === 'video') return videoChoice
  return null
}

const keysOf = (c: MontageClip, env: Envelope) => (env === 'volume' ? c.volumeKeys : c.opacityKeys) ?? []
const baseOf = (c: MontageClip, env: Envelope) => (env === 'volume' ? c.volume : c.opacity ?? 1)
const envelopeValue = (c: MontageClip, env: Envelope, local: number) => (env === 'volume' ? clipVolumeEnvelope(c, local) : clipOpacityEnvelope(c, local))
const keysPatch = (env: Envelope, keys: EnvelopeKey[]): Partial<MontageClip> =>
  env === 'volume' ? { volumeKeys: keys.length ? keys : undefined } : { opacityKeys: keys.length ? keys : undefined }
const basePatch = (env: Envelope, v: number): Partial<MontageClip> => (env === 'volume' ? { volume: v } : { opacity: v })
const round2 = (n: number) => Math.round(n * 100) / 100
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
/** Fades shorter than this are dropped when released */
const MIN_FADE = 0.03

const ClipView = memo(function ClipView({ clip, zoom, height, color, selected, duck }: { clip: MontageClip; zoom: number; height: number; color: string; selected: boolean; duck?: EnvelopeKey[] }) {
  const [editingText, setEditingText] = useState(false)
  /** Value shown while dragging the envelope line or a keyframe */
  const [dragValue, setDragValue] = useState<number | null>(null)
  const [fadeDrag, setFadeDrag] = useState(false)
  const videoEnvelope = useMontageStore((s) => s.envelope)
  const env = clipEnvelope(clip, videoEnvelope)
  const inner = height - 6
  /** Envelope y inside the clip, with a 2 px margin so 0% and 100% stay grabbable */
  const yOf = (v: number) => 2 + (1 - v) * (inner - 4)

  const onPointerDown = (e: React.PointerEvent<Element>, mode: DragMode, keyIndex = -1) => {
    if (e.button !== 0 || editingText) return
    e.stopPropagation()
    const store = useMontageStore.getState()
    store.select(clip.id)
    // HTML handles and SVG curve parts share this; both support pointer capture and pointer events
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    const startX = e.clientX
    const startY = e.clientY
    const doc = store.doc
    const orig = doc.clips.find((c) => c.id === clip.id)!
    const bounds = neighbourBounds(doc, orig)
    const points = snapPoints(doc, orig.id)
    const threshold = SNAP_PX / zoom
    const scaleY = inner - 4
    let started = false
    if (mode === 'fade-in' || mode === 'fade-out') setFadeDrag(true)

    const move = (ev: PointerEvent) => {
      const dxPx = ev.clientX - startX
      const dyPx = ev.clientY - startY
      if (!started) {
        if (Math.abs(dxPx) < DRAG_THRESHOLD && Math.abs(dyPx) < DRAG_THRESHOLD) return
        started = true
        store.checkpoint()
      }
      const dx = dxPx / zoom
      let patch: Partial<MontageClip> = {}

      if (mode === 'move') {
        // Vertical moves only land on lanes of the same kind
        const lane = document
          .elementsFromPoint(ev.clientX, ev.clientY)
          .find((n) => n instanceof HTMLElement && n.dataset.laneTrack) as HTMLElement | undefined
        const trackId = lane && lane.dataset.laneKind === trackKindFor(orig.kind) ? lane.dataset.laneTrack! : useMontageStore.getState().doc.clips.find((c) => c.id === orig.id)!.trackId
        let start = Math.max(0, orig.start + dx)
        start += snapDelta([start, start + orig.duration], points, threshold)
        start = fitStart(useMontageStore.getState().doc, trackId, start, orig.duration, orig.id)
        patch = { start, trackId }
      } else if (mode === 'trim-start') {
        const end = clipEnd(orig)
        let start = orig.start + dx
        start += snapDelta([start], points, threshold)
        const sourceMin = orig.sourceDuration !== undefined ? orig.start - orig.offset : -Infinity
        start = Math.min(end - MIN_CLIP, Math.max(start, bounds.min, sourceMin, 0))
        const shift = start - orig.start
        patch = {
          start,
          duration: end - start,
          offset: orig.sourceDuration !== undefined ? orig.offset + shift : orig.offset,
        }
        // Word timings are relative to the clip start, so they stay put on screen
        if (orig.words) patch.words = orig.words.map((w) => ({ ...w, start: w.start - shift, end: w.end - shift }))
        // Images have no source time: their keyframes follow the clip start, so move them back in place
        if (orig.kind === 'image' && orig.opacityKeys) patch.opacityKeys = orig.opacityKeys.map((k) => ({ ...k, t: k.t - shift }))
      } else if (mode === 'trim-end') {
        let end = clipEnd(orig) + dx
        end += snapDelta([end], points, threshold)
        const sourceMax = orig.sourceDuration !== undefined ? orig.start + orig.sourceDuration - orig.offset : Infinity
        end = Math.max(orig.start + MIN_CLIP, Math.min(end, bounds.max, sourceMax))
        patch = { duration: end - orig.start }
      } else if (mode === 'fade-in') {
        const max = orig.duration - (orig.fadeOut ?? 0)
        patch = { fadeIn: round2(Math.min(max, Math.max(0, (orig.fadeIn ?? 0) + dx))) }
      } else if (mode === 'fade-out') {
        const max = orig.duration - (orig.fadeIn ?? 0)
        patch = { fadeOut: round2(Math.min(max, Math.max(0, (orig.fadeOut ?? 0) - dx))) }
      } else if (mode === 'level' && env) {
        const keys = keysOf(orig, env)
        if (keys.length) {
          // With keyframes the whole curve moves up or down
          patch = keysPatch(env, keys.map((k) => ({ ...k, v: round2(clamp01(k.v - dyPx / scaleY)) })))
          setDragValue(clamp01(keys[0].v - dyPx / scaleY))
        } else {
          const v = round2(clamp01(baseOf(orig, env) - dyPx / scaleY))
          patch = basePatch(env, v)
          setDragValue(v)
        }
      } else if (mode === 'key' && env) {
        const keys = keysOf(orig, env)
        const k = keys[keyIndex]
        if (!k) return
        const lo = Math.max(orig.offset, keyIndex > 0 ? keys[keyIndex - 1].t + 0.01 : -Infinity)
        const hi = Math.min(orig.offset + orig.duration, keyIndex < keys.length - 1 ? keys[keyIndex + 1].t - 0.01 : Infinity)
        const t = Math.round(Math.min(hi, Math.max(lo, k.t + dx)) * 1000) / 1000
        const v = round2(clamp01(k.v - dyPx / scaleY))
        patch = keysPatch(env, keys.map((x, i) => (i === keyIndex ? { t, v } : x)))
        setDragValue(v)
      }

      store.mutate((d) => ({ ...d, clips: d.clips.map((c) => (c.id === orig.id ? { ...c, ...patch } : c)) }))
    }

    const up = () => {
      setDragValue(null)
      setFadeDrag(false)
      if (started && (mode === 'fade-in' || mode === 'fade-out')) {
        const cur = useMontageStore.getState().doc.clips.find((c) => c.id === orig.id)
        const key = mode === 'fade-in' ? 'fadeIn' : 'fadeOut'
        if (cur && (cur[key] ?? 0) < MIN_FADE && cur[key] !== undefined) {
          store.mutate((d) => ({ ...d, clips: d.clips.map((c) => (c.id === orig.id ? { ...c, [key]: undefined } : c)) }))
        }
      }
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  /** Adds a keyframe on the curve at `localX` px into the clip, at the curve's current value */
  const addKey = (localX: number) => {
    if (!env) return
    const local = Math.min(clip.duration, Math.max(0, localX / zoom))
    const t = Math.round((clip.offset + local) * 1000) / 1000
    const keys = keysOf(clip, env).filter((k) => Math.abs(k.t - t) > 0.005)
    const next = [...keys, { t, v: round2(envelopeValue(clip, env, local)) }].sort((a, b) => a.t - b.t)
    useMontageStore.getState().updateClip(clip.id, keysPatch(env, next))
  }

  const removeKey = (index: number) => {
    if (!env) return
    useMontageStore.getState().updateClip(clip.id, keysPatch(env, keysOf(clip, env).filter((_, i) => i !== index)))
  }

  const localX = (e: React.MouseEvent<Element>) => {
    const box = (e.currentTarget.closest('[data-clip]') as HTMLElement).getBoundingClientRect()
    return e.clientX - box.left
  }

  const width = Math.max(4, clip.duration * zoom)
  const thumb =
    // Posters are rendered from local files only; remote (not yet downloaded) videos show a plain block
    clip.kind === 'video' && !/^https?:/.test(clip.src ?? '') ? posterUrl(clip.src, '0.25') : clip.kind === 'image' ? thumbUrl(clip.src) : undefined
  const fill =
    clip.kind === 'audio' ? `${color} text-white` : clip.kind === 'caption' ? 'bg-surface-700 text-ink' : 'bg-surface-800 text-white'

  // Envelope curve across the visible clip: its value at both edges plus every keyframe in between
  const keys = env ? keysOf(clip, env) : []
  const curve: [number, number][] = []
  if (env) {
    curve.push([0, yOf(envelopeValue(clip, env, 0))])
    keys.forEach((k) => {
      const x = (k.t - clip.offset) * zoom
      if (x > 0 && x < width) curve.push([x, yOf(k.v)])
    })
    curve.push([width, yOf(envelopeValue(clip, env, clip.duration))])
  }
  const curvePoints = curve.map(([x, y]) => `${x},${y}`).join(' ')
  // Ducking gain over the clip (timeline curve → clip x), drawn on the same 0..1 scale
  let duckPoints = ''
  if (duck?.length && (clip.kind === 'audio' || clip.kind === 'video')) {
    const end = clip.start + clip.duration
    const pts: [number, number][] = [[0, yOf(envelopeAt(duck, clip.start, 1))]]
    for (const k of duck) if (k.t > clip.start && k.t < end) pts.push([(k.t - clip.start) * zoom, yOf(k.v)])
    pts.push([width, yOf(envelopeAt(duck, end, 1))])
    if (pts.some(([, y]) => y > yOf(1) + 0.5)) duckPoints = pts.map(([x, y]) => `${x},${y}`).join(' ')
  }
  const changed = env ? keys.length > 0 || baseOf(clip, env) < 1 : false
  const label = env === 'volume' ? 'volumen' : 'opacidad'

  const fades = clip.kind !== 'caption'
  const [fi, fo] = fades ? fadeLengths(clip) : [0, 0]
  const fiPx = fi * zoom
  const foPx = fo * zoom

  return (
    <div
      data-clip={clip.id}
      className={`group absolute top-[3px] overflow-hidden rounded-[4px] ${fill} ${
        selected ? 'z-[2] shadow-[0_0_0_2px_rgb(var(--ink))]' : 'z-[1]'
      }`}
      style={{
        left: clip.start * zoom,
        width,
        height: inner,
        // Filmstrip: the poster frame tiled across the clip
        ...(thumb ? { backgroundImage: `url("${thumb}")`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' } : {}),
      }}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (clip.kind === 'caption') setEditingText(true)
      }}
    >
      {clip.kind === 'audio' && <Waveform clip={clip} width={width} height={inner} duck={duck} />}

      {editingText ? (
        <input
          autoFocus
          defaultValue={clip.text}
          onPointerDown={(e) => e.stopPropagation()}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            const text = e.currentTarget.value
            if (text !== clip.text) useMontageStore.getState().updateClip(clip.id, { text })
            setEditingText(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setEditingText(false)
          }}
          className="absolute inset-1 select-text rounded-[4px] bg-white/80 px-1.5 text-[11.5px] text-black outline-none"
        />
      ) : clip.kind === 'caption' ? (
        <span className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 truncate text-center text-[10.5px] font-bold uppercase tracking-wider">
          {clip.text}
        </span>
      ) : (
        <span className="pointer-events-none absolute left-1 top-1 max-w-[calc(100%-8px)] truncate rounded-[3px] bg-black/60 px-1 text-[10px] leading-tight text-white opacity-0 transition-opacity group-hover:opacity-100">
          {clip.name}
        </span>
      )}

      {/* Fades: shaded corners with the ramp drawn as a diagonal, like Resolve */}
      {(fiPx > 0 || foPx > 0) && (
        <svg className="pointer-events-none absolute inset-0 z-[1]" width={width} height={inner}>
          {fiPx > 0 && (
            <>
              <polygon points={`0,0 ${fiPx},0 0,${inner}`} fill="rgb(0 0 0 / 0.45)" />
              <line x1={0} y1={inner} x2={fiPx} y2={0} stroke="white" strokeOpacity={0.85} strokeWidth={1} />
            </>
          )}
          {foPx > 0 && (
            <>
              <polygon points={`${width},0 ${width - foPx},0 ${width},${inner}`} fill="rgb(0 0 0 / 0.45)" />
              <line x1={width - foPx} y1={0} x2={width} y2={inner} stroke="white" strokeOpacity={0.85} strokeWidth={1} />
            </>
          )}
        </svg>
      )}

      {duckPoints && (
        <svg className="pointer-events-none absolute inset-0 z-[1]" width={width} height={inner}>
          <polyline points={duckPoints} fill="none" stroke="#fbbf24" strokeWidth={1.25} strokeDasharray="3 2">
            <title>Ducking automático: baja con las voces</title>
          </polyline>
        </svg>
      )}

      {env && (
        <svg className="pointer-events-none absolute inset-0 z-[1] overflow-visible" width={width} height={inner}>
          <polyline
            points={curvePoints}
            fill="none"
            stroke="white"
            strokeOpacity={0.85}
            strokeWidth={1}
            className={changed || dragValue !== null ? '' : 'opacity-0 transition-opacity group-hover:opacity-100'}
          />
          {/* Wide invisible stroke: drag to raise/lower, Alt+click or double-click to add a keyframe */}
          <polyline
            points={curvePoints}
            fill="none"
            stroke="transparent"
            strokeWidth={8}
            pointerEvents="stroke"
            className="cursor-ns-resize"
            onPointerDown={(e) => {
              if (e.altKey && e.button === 0) {
                e.stopPropagation()
                addKey(localX(e))
                return
              }
              onPointerDown(e, 'level')
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              addKey(localX(e))
            }}
          >
            <title>{`Arrastra para ajustar el ${label} · Alt+clic o doble clic: añadir keyframe`}</title>
          </polyline>
          {keys.map((k, i) => {
            const x = (k.t - clip.offset) * zoom
            if (x < 0 || x > width) return null
            return (
              <circle
                key={i}
                cx={x}
                cy={yOf(k.v)}
                r={3.5}
                fill="white"
                stroke="black"
                strokeWidth={1}
                pointerEvents="all"
                className="cursor-move"
                onPointerDown={(e) => {
                  if (e.altKey && e.button === 0) {
                    e.stopPropagation()
                    removeKey(i)
                    return
                  }
                  onPointerDown(e, 'key', i)
                }}
                onDoubleClick={(e) => { e.stopPropagation(); removeKey(i) }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); removeKey(i) }}
              >
                <title>{`Keyframe de ${label}: ${Math.round(k.v * 100)}% · arrastra para moverlo · doble clic, Alt+clic o clic derecho para borrarlo`}</title>
              </circle>
            )
          })}
        </svg>
      )}

      {env && (
        <span
          className={`pointer-events-none absolute bottom-1 right-2 z-[2] rounded-[3px] bg-black/55 px-1 font-mono text-[10px] text-white transition-opacity ${
            dragValue !== null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {env === 'opacity' ? 'Opac ' : ''}
          {dragValue !== null ? `${Math.round(dragValue * 100)}%` : keys.length ? `◆ ${keys.length}` : `${Math.round(baseOf(clip, env) * 100)}%`}
        </span>
      )}

      <div
        className="absolute inset-y-0 left-0 z-[2] w-1.5 cursor-ew-resize hover:bg-white/40"
        onPointerDown={(e) => onPointerDown(e, 'trim-start')}
      />
      <div
        className="absolute inset-y-0 right-0 z-[2] w-1.5 cursor-ew-resize hover:bg-white/40"
        onPointerDown={(e) => onPointerDown(e, 'trim-end')}
      />

      {/* Fade tabs at the top corners: drag inward to set the fade length */}
      {fades && (
        <>
          <div
            className={`absolute top-0 z-[3] h-2.5 w-2.5 cursor-ew-resize rounded-b-[3px] bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)] transition-opacity ${
              fiPx > 0 || fadeDrag ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            style={{ left: Math.min(Math.max(0, fiPx - 5), width - 10) }}
            onPointerDown={(e) => onPointerDown(e, 'fade-in')}
            title={fi > 0 ? `Fundido de entrada: ${fi.toFixed(2)} s` : 'Arrastra para crear un fundido de entrada'}
          />
          <div
            className={`absolute top-0 z-[3] h-2.5 w-2.5 cursor-ew-resize rounded-b-[3px] bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)] transition-opacity ${
              foPx > 0 || fadeDrag ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            style={{ left: Math.max(0, Math.min(width - 10, width - foPx - 5)) }}
            onPointerDown={(e) => onPointerDown(e, 'fade-out')}
            title={fo > 0 ? `Fundido de salida: ${fo.toFixed(2)} s` : 'Arrastra para crear un fundido de salida'}
          />
        </>
      )}
    </div>
  )
})

/** Bars of the visible slice of the source, scaled by the volume curve and fades */
function Waveform({ clip, width, height, duck }: { clip: MontageClip; width: number; height: number; duck?: EnvelopeKey[] }) {
  const peaks = usePeaks(clip.src, clip.assetId)
  if (!peaks) return null
  const bars = Math.min(1500, Math.max(1, Math.floor(width / 4)))
  const step = width / bars
  const maxH = height - 10
  const rects = []
  for (let i = 0; i < bars; i++) {
    const t = clip.offset + ((i + 0.5) / bars) * clip.duration
    const peak = peaks[Math.min(peaks.length - 1, Math.floor(t * PEAKS_PER_SEC))] ?? 0
    const local = ((i + 0.5) / bars) * clip.duration
    const h = Math.max(1.5, peak * maxH * clipVolumeAt(clip, local) * (duck ? envelopeAt(duck, clip.start + local, 1) : 1))
    rects.push(<rect key={i} x={i * step + step / 2 - 1} y={(height - h) / 2} width={2} height={h} rx={1} />)
  }
  return (
    <svg className="pointer-events-none absolute inset-0" width={width} height={height} fill="currentColor">
      {rects}
    </svg>
  )
}
