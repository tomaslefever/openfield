import { useState } from 'react'
import { Layers, RotateCcw, X } from 'lucide-react'
import {
  CHROMA_DEFAULTS,
  SHADOW_DEFAULTS,
  effectiveComposite,
  motionAt,
  placement,
  type Composite,
  type CompositeTransform,
  type Fit,
  type Motion,
} from '../../../../main/services/montage-composite'
import { clipEnd, useMontageStore, type MontageClip, type MontageTrack } from '../../stores/montage-store'
import { frameSize } from './CompositeLayer'

/*
 * Composition editing for the selected video/image clip: handles on the preview (drag = move,
 * corners = resize keeping proportion (Shift: free), edges = trim that side of the box) and a
 * properties panel with every value as a number. Edits go to the clip, or to its track when the
 * panel's target is "Pista" (the layout slot every clip on that track inherits).
 */

type Target = { clipId: string } | { trackId: string }

function useSelection() {
  const doc = useMontageStore((s) => s.doc)
  const selectedClipId = useMontageStore((s) => s.selectedClipId)
  const target = useMontageStore((s) => s.compositeTarget)
  const clip = doc.clips.find((c) => c.id === selectedClipId && (c.kind === 'video' || c.kind === 'image'))
  const track = clip ? doc.tracks.find((t) => t.id === clip.trackId) : undefined
  return { doc, clip, track, target }
}

/** The composite being edited (clip's own, or the track's) and where to write it */
function editable(clip: MontageClip, track: MontageTrack | undefined, target: 'clip' | 'track'): { comp: Composite; to: Target } {
  if (target === 'track' && track) return { comp: track.composite ?? {}, to: { trackId: track.id } }
  return { comp: clip.composite ?? {}, to: { clipId: clip.id } }
}

/* ─── Handles on the preview ─────────────────────────────────────── */

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export function TransformOverlay({ boxW, boxH }: { boxW: number; boxH: number }) {
  const { doc, clip, track, target } = useSelection()
  const time = useMontageStore((s) => s.time)
  if (!clip || !clip.sourceWidth || !clip.sourceHeight || time < clip.start || time >= clipEnd(clip)) return null
  const { W, H } = frameSize(doc.aspect)
  const f = boxW / W
  const e = effectiveComposite(track?.composite, clip.composite)
  const sourceT = clip.offset + (time - clip.start)
  const p = placement(e, clip.motion, W, H, clip.sourceWidth, clip.sourceHeight, sourceT)

  const begin = (ev: React.PointerEvent<HTMLDivElement>, handle: Handle) => {
    if (ev.button !== 0) return
    ev.stopPropagation()
    ev.preventDefault()
    const store = useMontageStore.getState()
    const { comp, to } = editable(clip, track, target)
    const t0: Required<Pick<CompositeTransform, 'x' | 'y' | 'w' | 'h'>> = { x: e.transform.x, y: e.transform.y, w: e.transform.w, h: e.transform.h }
    const motion0 = clip.motion
    const startX = ev.clientX
    const startY = ev.clientY
    const rad = (p.rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    let started = false
    const el = ev.currentTarget
    el.setPointerCapture(ev.pointerId)

    const move = (m: PointerEvent) => {
      // Frame px, then into the box's own (rotated) axes
      const dx = (m.clientX - startX) / f
      const dy = (m.clientY - startY) / f
      if (!started) {
        if (Math.abs(dx) * f < 2 && Math.abs(dy) * f < 2) return
        started = true
        store.checkpoint()
      }
      if (handle === 'move') {
        const dxF = dx / W
        const dyF = dy / H
        // Keyframed positions move as a whole
        const shifted: Motion | undefined = motion0 && (motion0.x || motion0.y)
          ? { ...motion0, ...(motion0.x ? { x: motion0.x.map((k) => ({ ...k, v: k.v + dxF })) } : {}), ...(motion0.y ? { y: motion0.y.map((k) => ({ ...k, v: k.v + dyF })) } : {}) }
          : motion0
        if (shifted !== motion0) store.setMotion(clip.id, shifted, true)
        const tr = { ...(comp.transform ?? {}), ...(motion0?.x ? {} : { x: round(t0.x + dxF) }), ...(motion0?.y ? {} : { y: round(t0.y + dyF) }) }
        store.setComposite(to, { ...comp, transform: tr }, true)
        return
      }
      const lx = dx * cos + dy * sin
      const ly = -dx * sin + dy * cos
      let bw = t0.w * W
      let bh = t0.h * H
      // Growth on each side, in box axes: positive = that edge moves outward
      let gl = 0, gr = 0, gt = 0, gb = 0
      if (handle.includes('e')) gr = lx
      if (handle.includes('w')) gl = -lx
      if (handle.includes('s')) gb = ly
      if (handle.includes('n')) gt = -ly
      if (handle.length === 2 && !m.shiftKey) {
        // Corners keep the box proportion
        const k = Math.max((bw + gl + gr) / bw, (bh + gt + gb) / bh)
        const nw = bw * k
        const nh = bh * k
        if (handle.includes('e')) gr = nw - bw; else gl = nw - bw
        if (handle.includes('s')) gb = nh - bh; else gt = nh - bh
      }
      const nw = Math.max(8, bw + gl + gr)
      const nh = Math.max(8, bh + gt + gb)
      // The box centre shifts by half the difference of the two sides, rotated back to the frame
      const cxL = ((gr - gl) / 2) * (nw === 8 ? 0 : 1)
      const cyL = ((gb - gt) / 2) * (nh === 8 ? 0 : 1)
      const cx = t0.x * W + cxL * cos - cyL * sin
      const cy = t0.y * H + cxL * sin + cyL * cos
      bw = nw
      bh = nh
      store.setComposite(to, { ...comp, transform: { ...(comp.transform ?? {}), x: round(cx / W), y: round(cy / H), w: round(bw / W), h: round(bh / H) } }, true)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  const handles: [Handle, string, string][] = [
    ['nw', '0%', '0%'], ['n', '50%', '0%'], ['ne', '100%', '0%'], ['e', '100%', '50%'],
    ['se', '100%', '100%'], ['s', '50%', '100%'], ['sw', '0%', '100%'], ['w', '0%', '50%'],
  ]
  const cursor: Record<Handle, string> = { move: 'move', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' }

  return (
    <div
      className="absolute z-[150]"
      style={{
        left: (p.cx - p.bw / 2) * f,
        top: (p.cy - p.bh / 2) * f,
        width: Math.max(4, p.bw * f),
        height: Math.max(4, p.bh * f),
        transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
        outline: `1px solid ${target === 'track' ? '#f59e0b' : '#38bdf8'}`,
        boxShadow: '0 0 0 1px rgb(0 0 0 / 0.4)',
        cursor: 'move',
      }}
      onPointerDown={(ev) => begin(ev, 'move')}
      title={target === 'track' ? 'Editando la pista (todos sus clips)' : 'Arrastra para mover · esquinas: escala (Shift: libre) · bordes: recorta la caja'}
    >
      {handles.map(([h, left, top]) => (
        <div
          key={h}
          onPointerDown={(ev) => begin(ev, h)}
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-black/60 bg-white"
          style={{ left, top, cursor: cursor[h] }}
        />
      ))}
    </div>
  )
}

const round = (n: number) => Math.round(n * 100000) / 100000

/* ─── Properties panel ───────────────────────────────────────────── */

export function CompositePanel() {
  const { doc, clip, track, target } = useSelection()
  const time = useMontageStore((s) => s.time)
  const [open, setOpen] = useState(true)
  if (!clip) return null
  const { W, H } = frameSize(doc.aspect)
  const store = useMontageStore.getState()
  const { comp, to } = editable(clip, track, target)
  const e = effectiveComposite(track?.composite, clip.composite)
  const t = e.transform
  const sourceT = clip.offset + Math.min(clip.duration, Math.max(0, time - clip.start))

  const write = (next: Composite) => store.setComposite(to, next)
  const setT = (patch: Partial<CompositeTransform>) => write({ ...comp, transform: { ...(comp.transform ?? {}), ...patch } })
  const setGroup = <K extends keyof Composite>(k: K, v: Composite[K]) => write({ ...comp, [k]: v })

  const addKey = (prop: 'x' | 'y' | 'scale' | 'rotation') => {
    const value = motionAt(clip.motion?.[prop], sourceT, prop === 'scale' ? t.scale : prop === 'rotation' ? t.rotation : prop === 'x' ? t.x : t.y)
    const keys = (clip.motion?.[prop] ?? []).filter((k) => Math.abs(k.t - sourceT) > 0.005)
    store.setMotion(clip.id, { ...(clip.motion ?? {}), [prop]: [...keys, { t: round(sourceT), v: value }].sort((a, b) => a.t - b.t) })
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="Composición del clip" className="absolute right-2 top-2 z-[160] flex h-7 items-center gap-1 rounded-md bg-surface-900/90 px-2 text-[11.5px] text-ink ring-1 ring-hairline">
        <Layers size={13} /> Composición
      </button>
    )
  }

  return (
    <div className="absolute right-2 top-2 z-[160] max-h-[calc(100%-16px)] w-60 overflow-y-auto rounded-xl bg-surface-900/95 p-2.5 text-[11.5px] text-ink shadow-lg ring-1 ring-hairline backdrop-blur">
      <div className="mb-2 flex items-center gap-1">
        <Layers size={13} className="text-ink-muted" />
        <span className="flex-1 truncate font-medium">Composición</span>
        <button title="Quitar la composición (vuelve a pantalla completa)" onClick={() => { write({}); if (target === 'clip') store.setMotion(clip.id, undefined) }} className="flex h-6 w-6 items-center justify-center rounded-md text-ink-muted hover:bg-surface-800 hover:text-ink"><RotateCcw size={12} /></button>
        <button title="Cerrar" onClick={() => setOpen(false)} className="flex h-6 w-6 items-center justify-center rounded-md text-ink-muted hover:bg-surface-800 hover:text-ink"><X size={12} /></button>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-1">
        {(['clip', 'track'] as const).map((k) => (
          <button key={k} onClick={() => store.setCompositeTarget(k)} className={`h-6 rounded-md ${target === k ? 'bg-surface-700 text-ink' : 'text-ink-muted ring-1 ring-hairline hover:bg-surface-800'}`}>
            {k === 'clip' ? 'Este clip' : `Pista «${track?.name ?? ''}»`}
          </button>
        ))}
      </div>

      <Section title="Caja">
        <Row>
          <Num label="X" value={t.x * W} onChange={(v) => setT({ x: v / W })} />
          <Num label="Y" value={t.y * H} onChange={(v) => setT({ y: v / H })} />
        </Row>
        <Row>
          <Num label="Ancho" value={t.w * W} min={8} onChange={(v) => setT({ w: v / W })} />
          <Num label="Alto" value={t.h * H} min={8} onChange={(v) => setT({ h: v / H })} />
        </Row>
        <Row>
          <label className="block">
            <span className="mb-0.5 block text-[10px] text-ink-subtle">Ajuste</span>
            <select value={t.fit} onChange={(ev) => setT({ fit: ev.target.value as Fit })} className={field}>
              <option value="contain">Contener</option>
              <option value="cover">Cubrir</option>
              <option value="fill">Estirar</option>
            </select>
          </label>
          <Num label="Escala %" value={t.scale * 100} min={1} onChange={(v) => setT({ scale: v / 100 })} />
        </Row>
        <Row>
          <Num label="Ancla X %" value={t.anchorX * 100} min={0} max={100} onChange={(v) => setT({ anchorX: v / 100 })} />
          <Num label="Ancla Y %" value={t.anchorY * 100} min={0} max={100} onChange={(v) => setT({ anchorY: v / 100 })} />
        </Row>
        <Row>
          <Num label="Rotación °" value={t.rotation} onChange={(v) => setT({ rotation: v })} />
          <Num label="Esquinas px" value={e.radius} min={0} onChange={(v) => setGroup('radius', v || null)} />
        </Row>
      </Section>

      <Section title="Recorte de la fuente %">
        <Row>
          {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
            <Num key={side} label={{ left: 'Izq', right: 'Der', top: 'Arr', bottom: 'Abajo' }[side]} value={e.crop[side] * 100} min={0} max={95} onChange={(v) => setGroup('crop', { ...(comp.crop ?? {}), [side]: v / 100 })} />
          ))}
        </Row>
      </Section>

      <Toggle title="Sombra" on={!!e.shadow} onToggle={(on) => setGroup('shadow', on ? { ...SHADOW_DEFAULTS } : null)}>
        {e.shadow && (
          <>
            <Row>
              <Num label="X" value={e.shadow.x} onChange={(v) => setGroup('shadow', { ...e.shadow!, x: v })} />
              <Num label="Y" value={e.shadow.y} onChange={(v) => setGroup('shadow', { ...e.shadow!, y: v })} />
              <Num label="Desenf." value={e.shadow.blur} min={0} onChange={(v) => setGroup('shadow', { ...e.shadow!, blur: v })} />
            </Row>
            <Row>
              <Num label="Opacidad %" value={e.shadow.opacity * 100} min={0} max={100} onChange={(v) => setGroup('shadow', { ...e.shadow!, opacity: v / 100 })} />
              <Color label="Color" value={e.shadow.color} onChange={(v) => setGroup('shadow', { ...e.shadow!, color: v })} />
            </Row>
          </>
        )}
      </Toggle>

      <Toggle title="Chroma key" on={!!e.chroma} onToggle={(on) => setGroup('chroma', on ? { ...CHROMA_DEFAULTS } : null)}>
        {e.chroma && (
          <>
            <Row>
              <Color label="Color clave" value={e.chroma.color} onChange={(v) => setGroup('chroma', { ...e.chroma!, color: v })} />
              <Num label="Similitud %" value={e.chroma.similarity * 100} min={0} max={100} onChange={(v) => setGroup('chroma', { ...e.chroma!, similarity: v / 100 })} />
            </Row>
            <Row>
              <Num label="Suavidad %" value={e.chroma.smoothness * 100} min={0} max={100} onChange={(v) => setGroup('chroma', { ...e.chroma!, smoothness: v / 100 })} />
              <Num label="Despill %" value={e.chroma.despill * 100} min={0} max={100} onChange={(v) => setGroup('chroma', { ...e.chroma!, despill: v / 100 })} />
            </Row>
          </>
        )}
      </Toggle>

      <Section title="Desenfoque">
        <Row>
          <Num label="Radio px" value={e.blur} min={0} onChange={(v) => setGroup('blur', v || null)} />
        </Row>
      </Section>

      <Section title="Movimiento (keyframes en el cursor)">
        <div className="grid grid-cols-4 gap-1">
          {(['x', 'y', 'scale', 'rotation'] as const).map((k) => (
            <button key={k} onClick={() => addKey(k)} title={`Keyframe de ${k} en el cursor`} className="h-6 rounded-md text-[11px] text-ink ring-1 ring-hairline hover:bg-surface-800">
              ◆ {{ x: 'X', y: 'Y', scale: 'Esc', rotation: 'Rot' }[k]}{clip.motion?.[k]?.length ? ` ${clip.motion[k]!.length}` : ''}
            </button>
          ))}
        </div>
        {clip.motion && (
          <button onClick={() => store.setMotion(clip.id, undefined)} className="mt-1 h-6 w-full rounded-md text-[11px] text-ink-muted ring-1 ring-hairline hover:bg-surface-800">
            Quitar movimiento
          </button>
        )}
        <p className="mt-1 text-[10px] leading-snug text-ink-subtle">Crea un keyframe con el valor actual; mueve el cursor, cambia el valor y crea otro. Push-in: ◆ Esc al inicio, Escala 110 %, ◆ Esc al final.</p>
      </Section>
    </div>
  )
}

const field = 'h-6 w-full rounded-md bg-surface-800 px-1.5 text-[11.5px] text-ink outline-none ring-1 ring-hairline'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="mb-1 text-[10.5px] font-medium text-ink-muted">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Toggle({ title, on, onToggle, children }: { title: string; on: boolean; onToggle: (on: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <label className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium text-ink-muted">
        <input type="checkbox" checked={on} onChange={(ev) => onToggle(ev.target.checked)} /> {title}
      </label>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

const Row = ({ children }: { children: React.ReactNode }) => <div className="grid grid-flow-col auto-cols-fr gap-1">{children}</div>

function Num({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const shown = Math.round(value * 10) / 10
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block truncate text-[10px] text-ink-subtle">{label}</span>
      <input
        type="number"
        key={shown}
        defaultValue={shown}
        min={min}
        max={max}
        onBlur={(ev) => {
          const v = Number(ev.currentTarget.value)
          if (!Number.isFinite(v) || ev.currentTarget.value.trim() === '') return
          const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))
          if (Math.abs(c - shown) > 1e-9) onChange(c)
        }}
        onKeyDown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur() }}
        className={field}
      />
    </label>
  )
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block truncate text-[10px] text-ink-subtle">{label}</span>
      <input type="color" value={value} onChange={(ev) => onChange(ev.target.value)} className="h-6 w-full cursor-pointer rounded-md bg-surface-800 ring-1 ring-hairline" />
    </label>
  )
}
