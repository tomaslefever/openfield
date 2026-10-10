import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Video, ChevronUp, ChevronDown, X, Copy, Check, Clipboard, Info } from 'lucide-react'

export type CameraOptionKey = 'camera' | 'lens' | 'shot' | 'level' | 'movement' | 'lighting' | 'filmLook' | 'speed'

export const CAMERA_OPTION_KEYS: CameraOptionKey[] = ['camera', 'lens', 'shot', 'level', 'movement', 'lighting', 'filmLook', 'speed']

export interface CameraControlState {
  enabled: boolean
  /** Options unchecked by the user — left out of the [camera_control] block. */
  disabled: CameraOptionKey[]
  camera: string
  lens: string
  shot: string
  level: string
  movement: string
  lighting: string
  filmLook: string
  speed: string
}

export const CAMERA_BODIES = [
  { value: 'shot on Mitchell BNC 35mm film camera', label: 'Mitchell BNC', group: 'Film' },
  { value: 'shot on Technicolor three-strip camera', label: 'Technicolor 3-strip', group: 'Film' },
  { value: 'shot on Arriflex 35 BL 35mm film camera', label: 'Arriflex 35 BL', group: 'Film' },
  { value: 'shot on Panavision Panaflex Gold II 35mm film camera', label: 'Panavision Panaflex Gold II', group: 'Film' },
  { value: 'shot on Panavision Millennium XL2 35mm film camera', label: 'Panavision Millennium XL2', group: 'Film' },
  { value: 'shot on Arricam LT 35mm film camera', label: 'Arricam LT', group: 'Film' },
  { value: 'shot on Panavision Super 70 65mm film camera', label: 'Panavision 65mm', group: 'Film' },
  { value: 'shot on IMAX MSM 9802 65mm film camera', label: 'IMAX MSM 9802', group: 'Film' },
  { value: 'shot on Aaton XTR Prod 16mm film camera', label: 'Aaton XTR Prod (16mm)', group: 'Film' },
  { value: 'shot on Bolex H16 16mm film camera', label: 'Bolex H16 (16mm)', group: 'Film' },
  { value: 'shot on Canon 1014 Super 8 film camera', label: 'Canon 1014 (Super 8)', group: 'Film' },
  { value: 'shot on ARRI Alexa 65 digital cinema camera', label: 'ARRI Alexa 65', group: 'Digital' },
  { value: 'shot on ARRI Alexa Mini LF digital cinema camera', label: 'ARRI Alexa Mini LF', group: 'Digital' },
  { value: 'shot on Sony Venice 2 digital cinema camera', label: 'Sony Venice 2', group: 'Digital' },
  { value: 'shot on RED V-Raptor digital cinema camera', label: 'RED V-Raptor', group: 'Digital' },
  { value: 'shot on Panavision Millennium DXL2 digital cinema camera', label: 'Panavision DXL2', group: 'Digital' },
]

export const CAMERA_BODY_GROUPS = ['Film', 'Digital']

export const CAMERA_LENSES = [
  '16mm fisheye lens',
  '24mm wide-angle lens',
  '35mm standard lens',
  '50mm standard lens',
  '85mm portrait lens',
  '135mm telephoto lens',
  '200mm telephoto lens',
  'anamorphic lens',
  'macro lens',
]

export const CAMERA_SHOTS = [
  'extreme close-up',
  'close-up',
  'medium close-up',
  'medium shot',
  'cowboy shot',
  'full shot',
  'wide shot',
  'extreme wide shot',
  'establishing shot',
  'over-the-shoulder shot',
  'point-of-view shot',
]

export const CAMERA_LEVELS = [
  'eye level',
  'low angle',
  'high angle',
  "bird's eye view",
  "worm's eye view",
  'dutch angle',
]

export const CAMERA_MOVEMENTS = [
  'static camera',
  'slow pan',
  'tilt movement',
  'dolly in',
  'dolly out',
  'tracking shot',
  'orbiting shot',
  '360-degree orbit',
  'bullet time',
  'handheld camera',
  'crane shot',
  'zoom in',
  'zoom out',
  'push-in shot',
  'follow shot',
  'FPV drone shot',
]

export const CAMERA_LIGHTING = [
  { value: 'golden hour lighting', label: 'Golden hour' },
  { value: 'blue hour lighting', label: 'Blue hour' },
  { value: 'film noir lighting', label: 'Film noir' },
  { value: 'neon cyberpunk lighting', label: 'Neon / cyberpunk' },
  { value: 'Rembrandt lighting', label: 'Rembrandt' },
  { value: 'backlit silhouette', label: 'Backlight / silhouette' },
  { value: 'volumetric lighting', label: 'Volumetric' },
  { value: 'soft diffused lighting', label: 'Soft diffused' },
  { value: 'natural lighting', label: 'Natural' },
  { value: 'studio lighting', label: 'Studio' },
  { value: 'cinematic lighting', label: 'Cinematic' },
]

export const CAMERA_FILM_LOOKS = [
  { value: 'anamorphic lens flare', label: 'Anamorphic' },
  { value: 'film grain', label: 'Film grain' },
  { value: 'teal and orange color grade', label: 'Teal & orange' },
  { value: 'vintage film look', label: 'Vintage' },
  { value: 'desaturated muted palette', label: 'Desaturated' },
]

export const CAMERA_SPEEDS = [
  { value: 'slow motion', label: 'Slow Motion' },
  { value: 'fast forward', label: 'Fast Forward' },
  { value: 'timelapse', label: 'Timelapse' },
  { value: 'Speed Ramp [300% - 40% - 300%]', label: 'Speed Ramp' },
]

export const DEFAULT_CAMERA_STATE: CameraControlState = {
  enabled: false,
  disabled: ['camera', 'lighting', 'filmLook', 'speed'],
  camera: CAMERA_BODIES[3].value,
  lens: CAMERA_LENSES[2],
  shot: CAMERA_SHOTS[3],
  level: CAMERA_LEVELS[0],
  movement: CAMERA_MOVEMENTS[0],
  lighting: CAMERA_LIGHTING[0].value,
  filmLook: CAMERA_FILM_LOOKS[0].value,
  speed: CAMERA_SPEEDS[0].value,
}

export const CAMERA_BLOCK_RE = /\[camera_control\]([\s\S]*?)\[\/camera_control\]/g

export function stripCameraBlock(text: string): string {
  return text.replace(CAMERA_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

export function parseCameraBlock(text: string): CameraControlState {
  const empty: CameraControlState = {
    enabled: false,
    disabled: [],
    camera: '',
    lens: '',
    shot: '',
    level: '',
    movement: '',
    lighting: '',
    filmLook: '',
    speed: '',
  }
  const match = text.match(/\[camera_control\]([\s\S]*?)\[\/camera_control\]/)
  if (!match) return empty
  const body = match[1].trim().replace(/^Camera composition:\s*/i, '').replace(/\.\s*$/, '').trim()
  const items = body.split(',').map(s => s.trim()).filter(Boolean)
  const pick = (list: string[]) => {
    const exact = items.find(it => list.includes(it))
    if (exact) return exact
    return list.find(opt => {
      const normOpt = opt.toLowerCase().replace(/[\s-_]+/g, '')
      return items.some(it => it.toLowerCase().replace(/[\s-_]+/g, '') === normOpt)
    }) || ''
  }
  const camera = pick(CAMERA_BODIES.map(c => c.value))
  const lens = pick(CAMERA_LENSES)
  const shot = pick(CAMERA_SHOTS)
  const level = pick(CAMERA_LEVELS)
  const movement = pick(CAMERA_MOVEMENTS)
  const lighting = pick(CAMERA_LIGHTING.map(l => l.value))
  const filmLook = pick(CAMERA_FILM_LOOKS.map(l => l.value))
  const rawSpeed = pick(CAMERA_SPEEDS.map(s => s.value))
  const speed = rawSpeed || (items.some(it => it.toLowerCase().includes('speed ramp')) ? 'Speed Ramp [300% - 40% - 300%]' : '')

  const hasAny = !!(camera || lens || shot || level || movement || lighting || filmLook || speed)
  // Options missing from the block were unchecked when it was written.
  const found: Record<CameraOptionKey, string> = { camera, lens, shot, level, movement, lighting, filmLook, speed }
  const disabled = hasAny ? CAMERA_OPTION_KEYS.filter(k => !found[k]) : []
  return {
    enabled: hasAny,
    disabled,
    camera: camera || DEFAULT_CAMERA_STATE.camera,
    lens: lens || DEFAULT_CAMERA_STATE.lens,
    shot: shot || DEFAULT_CAMERA_STATE.shot,
    level: level || DEFAULT_CAMERA_STATE.level,
    movement: movement || DEFAULT_CAMERA_STATE.movement,
    lighting: lighting || DEFAULT_CAMERA_STATE.lighting,
    filmLook: filmLook || DEFAULT_CAMERA_STATE.filmLook,
    speed: speed || DEFAULT_CAMERA_STATE.speed,
  }
}

export function formatCameraBlock(
  state: Partial<CameraControlState>,
  mode: 'image' | 'video' | 'audio' = 'video'
): string {
  if (!state.enabled) return ''
  const off = new Set(state.disabled ?? [])
  const on = (key: CameraOptionKey) => !off.has(key) && !!state[key]
  const parts: string[] = []
  if (on('camera')) parts.push(state.camera!)
  if (on('lens')) parts.push(state.lens!)
  if (on('shot')) parts.push(state.shot!)
  if (on('level')) parts.push(state.level!)
  if (mode === 'video' && on('movement')) parts.push(state.movement!)
  if (on('lighting')) parts.push(state.lighting!)
  if (on('filmLook')) parts.push(state.filmLook!)
  if (mode === 'video' && on('speed')) parts.push(state.speed!)
  if (!parts.length) return ''
  return `[camera_control]\nCamera composition: ${parts.join(', ')}.\n[/camera_control]`
}

export function OptionCheckbox({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`${checked ? 'Desactivar' : 'Activar'} ${label}`}
      title={checked ? `Desactivar ${label}` : `Activar ${label}`}
      onClick={() => onChange(!checked)}
      className={`w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center rounded-[4px] border transition-colors ${
        checked ? 'bg-accent-500 border-accent-500 text-on-accent' : 'bg-surface-800/80 border-surface-600 hover:border-surface-400'
      }`}
    >
      {checked && <Check size={10} strokeWidth={3} />}
    </button>
  )
}

export interface CameraWheelProps {
  label: string
  options: string[]
  value: string
  onChange: (value: string) => void
  /** When set, a checkbox next to the label toggles whether this option is used. */
  active?: boolean
  onActiveChange?: (active: boolean) => void
}

export function CameraWheel({ label, options, value, onChange, active = true, onActiveChange }: CameraWheelProps) {
  const [shift, setShift] = useState(0)
  const [anim, setAnim] = useState(false)
  const animRef = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const idx = options.indexOf(value)
  const safeIdx = idx >= 0 ? idx : 0
  const rows = [
    options[(safeIdx - 2 + options.length) % options.length],
    options[(safeIdx - 1 + options.length) % options.length],
    options[safeIdx],
    options[(safeIdx + 1) % options.length],
    options[(safeIdx + 2) % options.length],
  ]
  const display = (opt: string) => opt ? opt.charAt(0).toUpperCase() + opt.slice(1) : opt

  const select = (dir: 1 | -1) => {
    if (animRef.current) return
    animRef.current = true
    const target = options[(safeIdx + dir + options.length) % options.length]
    onChange(target)
    setShift(dir * 30)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnim(true)
        setShift(0)
        window.setTimeout(() => { setAnim(false); animRef.current = false }, 220)
      })
    })
  }

  const selectRef = useRef(select)
  selectRef.current = select

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      selectRef.current(e.deltaY > 0 ? 1 : -1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">
      <div className="flex items-center gap-1.5">
        {onActiveChange && <OptionCheckbox checked={active} onChange={onActiveChange} label={label} />}
        <span className="eyebrow">{label}</span>
      </div>
      <div className={`flex flex-col items-center gap-1 transition-opacity ${active ? '' : 'opacity-40'}`}>
      <button
        type="button"
        onClick={() => select(-1)}
        className="w-[140px] h-7 flex items-center justify-center rounded-pill bg-surface-800/80 text-surface-400 hover:text-surface-100 hover:bg-surface-700 transition-colors"
        title="Previous"
      >
        <ChevronUp size={14} />
      </button>
      <div ref={boxRef} className="relative h-[90px] w-[140px] overflow-hidden rounded-lg bg-surface-800/40 select-none">
        <div className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 h-[30px] rounded-md bg-accent-500/10 border-y border-accent-500/20" />
        <div className="pointer-events-none absolute top-0 inset-x-0 h-[16px] z-30 bg-gradient-to-b from-canvas to-transparent" />
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-[16px] z-30 bg-gradient-to-t from-canvas to-transparent" />
        <div
          className="absolute inset-x-0 will-change-transform"
          style={{ transform: `translateY(${-30 + shift}px)`, transition: anim ? 'transform 180ms cubic-bezier(0.25, 1, 0.5, 1)' : 'none' }}
        >
          {rows.map((opt, i) => {
            if (i === 2) {
              return (
                <div key={i} className="flex items-center justify-center w-full h-[30px] px-2 text-center text-[11px] font-medium text-accent-400 leading-tight truncate">
                  {display(opt)}
                </div>
              )
            }
            if (i === 1 || i === 3) {
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => select(i === 1 ? -1 : 1)}
                  className="flex items-center justify-center w-full h-[30px] px-2 text-center text-[11px] text-surface-500 opacity-60 hover:opacity-90 hover:text-surface-300 leading-tight truncate transition-opacity duration-150"
                >
                  {display(opt)}
                </button>
              )
            }
            return (
              <div key={i} className="flex items-center justify-center w-full h-[30px] px-2 text-center text-[11px] text-surface-600 opacity-40 leading-tight truncate">
                {display(opt)}
              </div>
            )
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => select(1)}
        className="w-[140px] h-7 flex items-center justify-center rounded-pill bg-surface-800/80 text-surface-400 hover:text-surface-100 hover:bg-surface-700 transition-colors"
        title="Next"
      >
        <ChevronDown size={14} />
      </button>
      </div>
    </div>
  )
}

export interface CameraControlModalProps {
  isOpen: boolean
  onClose: () => void
  enabled: boolean
  onToggleEnabled: (enabled: boolean) => void
  disabled?: CameraOptionKey[]
  onDisabledChange?: (disabled: CameraOptionKey[]) => void
  camera?: string
  onCameraChange?: (camera: string) => void
  lens: string
  onLensChange: (lens: string) => void
  shot: string
  onShotChange: (shot: string) => void
  level: string
  onLevelChange: (level: string) => void
  movement?: string
  onMovementChange?: (movement: string) => void
  lighting: string
  onLightingChange: (lighting: string) => void
  filmLook: string
  onFilmLookChange: (filmLook: string) => void
  speed: string
  onSpeedChange: (speed: string) => void
  mode?: 'image' | 'video' | 'audio'
}

export function CameraControlModal({
  isOpen,
  onClose,
  enabled,
  onToggleEnabled,
  disabled = [],
  onDisabledChange,
  camera = DEFAULT_CAMERA_STATE.camera,
  onCameraChange,
  lens,
  onLensChange,
  shot,
  onShotChange,
  level,
  onLevelChange,
  movement = CAMERA_MOVEMENTS[0],
  onMovementChange,
  lighting,
  onLightingChange,
  filmLook,
  onFilmLookChange,
  speed,
  onSpeedChange,
  mode = 'video',
}: CameraControlModalProps) {
  const [copied, setCopied] = useState(false)
  const [pasted, setPasted] = useState(false)

  const handleCopy = useCallback(() => {
    const data: CameraControlState = {
      enabled,
      disabled,
      camera,
      lens,
      shot,
      level,
      movement: mode === 'video' ? movement : '',
      lighting,
      filmLook,
      speed: mode === 'video' ? speed : '',
    }
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [enabled, disabled, camera, lens, shot, level, movement, lighting, filmLook, speed, mode])

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text || !text.trim()) return

      const trimmed = text.trim()

      // 1. Try parsing JSON
      try {
        const data = JSON.parse(trimmed)
        if (data && typeof data === 'object') {
          let matched = false
          if (onCameraChange && typeof data.camera === 'string' && data.camera) {
            const norm = data.camera.toLowerCase()
            const found = CAMERA_BODIES.find(c => c.value.toLowerCase() === norm || c.label.toLowerCase() === norm)
            if (found) { onCameraChange(found.value); matched = true }
          }

          if (data.lens && CAMERA_LENSES.includes(data.lens)) {
            onLensChange(data.lens)
            matched = true
          } else if (data.lens) {
            const found = CAMERA_LENSES.find(l => l.toLowerCase() === data.lens.toLowerCase())
            if (found) { onLensChange(found); matched = true }
          }

          if (data.shot && CAMERA_SHOTS.includes(data.shot)) {
            onShotChange(data.shot)
            matched = true
          } else if (data.shot) {
            const found = CAMERA_SHOTS.find(s => s.toLowerCase() === data.shot.toLowerCase())
            if (found) { onShotChange(found); matched = true }
          }

          if (data.level && CAMERA_LEVELS.includes(data.level)) {
            onLevelChange(data.level)
            matched = true
          } else if (data.level) {
            const found = CAMERA_LEVELS.find(lvl => lvl.toLowerCase() === data.level.toLowerCase())
            if (found) { onLevelChange(found); matched = true }
          }

          if (onMovementChange) {
            if (data.movement && CAMERA_MOVEMENTS.includes(data.movement)) {
              onMovementChange(data.movement)
              matched = true
            } else if (data.movement) {
              const found = CAMERA_MOVEMENTS.find(m => m.toLowerCase().replace(/[\s-_]+/g, '') === data.movement.toLowerCase().replace(/[\s-_]+/g, ''))
              if (found) { onMovementChange(found); matched = true }
            }
          }

          if (data.lighting !== undefined) {
            const found = CAMERA_LIGHTING.find(l => l.value === data.lighting || (l.label && l.label.toLowerCase() === data.lighting.toLowerCase()))
            if (found) { onLightingChange(found.value); matched = true }
          }

          if (data.filmLook !== undefined) {
            const found = CAMERA_FILM_LOOKS.find(f => f.value === data.filmLook || (f.label && f.label.toLowerCase() === data.filmLook.toLowerCase()))
            if (found) { onFilmLookChange(found.value); matched = true }
          }

          if (onSpeedChange && data.speed !== undefined) {
            const found = CAMERA_SPEEDS.find(s => s.value === data.speed || (s.label && s.label.toLowerCase() === data.speed.toLowerCase()))
            if (found) { onSpeedChange(found.value); matched = true }
          }

          if (matched) {
            if (onDisabledChange && Array.isArray(data.disabled)) {
              onDisabledChange(data.disabled.filter((k: unknown): k is CameraOptionKey => CAMERA_OPTION_KEYS.includes(k as CameraOptionKey)))
            }
            if (data.enabled !== undefined) {
              onToggleEnabled(Boolean(data.enabled))
            } else {
              onToggleEnabled(true)
            }
            setPasted(true)
            setTimeout(() => setPasted(false), 1500)
            return
          }
        }
      } catch {
        // Not JSON, fall through to parseCameraBlock
      }

      // 2. Try parsing camera block or raw camera specs
      const blockText = trimmed.includes('[camera_control]')
        ? trimmed
        : `[camera_control]\nCamera composition: ${trimmed}\n[/camera_control]`
      const parsed = parseCameraBlock(blockText)

      if (parsed.enabled) {
        if (parsed.camera && onCameraChange) onCameraChange(parsed.camera)
        if (parsed.lens) onLensChange(parsed.lens)
        if (parsed.shot) onShotChange(parsed.shot)
        if (parsed.level) onLevelChange(parsed.level)
        if (parsed.movement && onMovementChange) onMovementChange(parsed.movement)
        if (parsed.lighting !== undefined) onLightingChange(parsed.lighting)
        if (parsed.filmLook !== undefined) onFilmLookChange(parsed.filmLook)
        if (parsed.speed !== undefined && onSpeedChange) onSpeedChange(parsed.speed)
        onDisabledChange?.(parsed.disabled)
        onToggleEnabled(true)
        setPasted(true)
        setTimeout(() => setPasted(false), 1500)
      }
    } catch (err) {
      console.error('Error pasting camera parameters:', err)
    }
  }, [onCameraChange, onLensChange, onShotChange, onLevelChange, onMovementChange, onLightingChange, onFilmLookChange, onSpeedChange, onDisabledChange, onToggleEnabled])

  // Keyboard shortcut listener for Ctrl+C / Ctrl+V and ⌘C / ⌘V
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey
      if (!isCtrlOrCmd) return

      const target = e.target as HTMLElement | null
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
      if (isInput && window.getSelection()?.toString()) {
        return
      }

      if (e.key.toLowerCase() === 'c') {
        e.preventDefault()
        handleCopy()
      } else if (e.key.toLowerCase() === 'v') {
        e.preventDefault()
        handlePaste()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleCopy, handlePaste])

  // Per-option checkboxes: an unchecked option is left out of the prompt. Picking a value
  // re-checks it, so a dimmed control can be used directly without ticking the box first.
  const optionToggles = !!onDisabledChange
  const isOn = (key: CameraOptionKey) => !disabled.includes(key)
  const setOn = (key: CameraOptionKey, on: boolean) => {
    if (!onDisabledChange || isOn(key) === on) return
    onDisabledChange(on ? disabled.filter(k => k !== key) : [...disabled, key])
  }
  const withEnable = (key: CameraOptionKey, fn: (value: string) => void) => (value: string) => {
    fn(value)
    setOn(key, true)
  }
  const wheelToggle = (key: CameraOptionKey) =>
    optionToggles ? { active: isOn(key), onActiveChange: (v: boolean) => setOn(key, v) } : {}
  const dim = (key: CameraOptionKey) => (isOn(key) ? '' : 'opacity-40')
  const selectCls = 'bg-surface-800/80 border border-surface-700 rounded-lg px-2 py-1.5 text-[11px] text-surface-300 outline-none focus:border-accent-500/50 transition-opacity'

  if (!isOpen) return null

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-scrim" />
      <div
        className="relative modal-surface w-[640px] max-w-[94vw] max-h-[85vh] flex flex-col z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
          <h3 className="text-sm font-medium text-surface-200 flex items-center gap-2">
            <Video size={14} className="text-accent-400" /> Control de Cámara
          </h3>
          <div className="flex items-center gap-2.5">
            {/* 3 xs action buttons: copy, paste, info */}
            <div className="flex items-center gap-1 bg-surface-800/80 p-0.5 rounded-pill border border-surface-700/60">
              <button
                type="button"
                onClick={handleCopy}
                title="Copiar ajustes (Ctrl+C)"
                className="flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-medium transition-colors text-surface-300 hover:text-ink hover:bg-surface-700 active:scale-95 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check size={11} className="text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={11} className="text-surface-400" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePaste}
                title="Pegar ajustes (Ctrl+V)"
                className="flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-medium transition-colors text-surface-300 hover:text-ink hover:bg-surface-700 active:scale-95 cursor-pointer"
              >
                {pasted ? (
                  <>
                    <Check size={11} className="text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-600 dark:text-emerald-400">Pasted</span>
                  </>
                ) : (
                  <>
                    <Clipboard size={11} className="text-surface-400" />
                    <span>Paste</span>
                  </>
                )}
              </button>

              {/* Info button with hover tooltip */}
              <div className="relative group">
                <button
                  type="button"
                  className="flex items-center justify-center p-1 rounded-full text-[10px] text-surface-400 hover:text-surface-200 hover:bg-surface-700 transition-colors cursor-pointer"
                  aria-label="Información sobre atajos"
                >
                  <Info size={12} />
                </button>
                <div className="pointer-events-none absolute right-0 top-full mt-2 hidden group-hover:flex flex-col z-50 w-60 p-2.5 popover-surface rounded-2xl text-[11px] text-surface-200 animate-in fade-in-0 zoom-in-95">
                  <span className="font-semibold text-accent-400 mb-1 flex items-center gap-1">
                    <Info size={12} /> Atajos de teclado
                  </span>
                  <span className="text-surface-300 leading-relaxed">
                    Puedes copiar y pegar los ajustes de cámara usando <kbd className="px-1.5 py-0.5 bg-surface-950 border border-surface-600 rounded text-[10px] text-surface-200 font-mono">Ctrl+C</kbd> y <kbd className="px-1.5 py-0.5 bg-surface-950 border border-surface-600 rounded text-[10px] text-surface-200 font-mono">Ctrl+V</kbd> (o ⌘C / ⌘V en Mac).
                  </span>
                </div>
              </div>
            </div>

            <div className="h-4 w-px bg-surface-800 mx-0.5" />

            <span className={`text-[10px] font-medium ${enabled ? 'text-accent-400' : 'text-surface-500'}`}>
              {enabled ? 'On' : 'Off'}
            </span>
            <button
              onClick={() => onToggleEnabled(!enabled)}
              className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${enabled ? 'bg-accent-500' : 'bg-surface-700'}`}
              aria-label="Toggle camera control"
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${enabled ? 'left-[22px] bg-on-accent' : 'left-0.5 bg-white'}`} />
            </button>
            <button onClick={onClose} className="text-surface-500 hover:text-surface-200 p-1 rounded-full hover:bg-surface-800 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className={enabled ? '' : 'opacity-40 pointer-events-none'}>
            {onCameraChange && (
              <div className="mb-4 flex items-center justify-center gap-2">
                {optionToggles && <OptionCheckbox checked={isOn('camera')} onChange={(v) => setOn('camera', v)} label="Camera" />}
                <span className="eyebrow">Camera</span>
                <select
                  value={camera}
                  onChange={(e) => withEnable('camera', onCameraChange)(e.target.value)}
                  className={`${selectCls} min-w-[220px] ${dim('camera')}`}
                >
                  {CAMERA_BODY_GROUPS.map(group => (
                    <optgroup key={group} label={group}>
                      {CAMERA_BODIES.filter(c => c.group === group).map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-start justify-center gap-3">
              <CameraWheel label="Lens" options={CAMERA_LENSES} value={lens} onChange={withEnable('lens', onLensChange)} {...wheelToggle('lens')} />
              <CameraWheel label="Shot" options={CAMERA_SHOTS} value={shot} onChange={withEnable('shot', onShotChange)} {...wheelToggle('shot')} />
              <CameraWheel label="Level" options={CAMERA_LEVELS} value={level} onChange={withEnable('level', onLevelChange)} {...wheelToggle('level')} />
              {mode === 'video' && onMovementChange && (
                <CameraWheel label="Movement" options={CAMERA_MOVEMENTS} value={movement} onChange={withEnable('movement', onMovementChange)} {...wheelToggle('movement')} />
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-5">
              <div className="flex items-center gap-2">
                {optionToggles && <OptionCheckbox checked={isOn('lighting')} onChange={(v) => setOn('lighting', v)} label="Lighting" />}
                <span className="eyebrow">Lighting</span>
                <select
                  value={lighting}
                  onChange={(e) => withEnable('lighting', onLightingChange)(e.target.value)}
                  className={`${selectCls} ${dim('lighting')}`}
                >
                  {CAMERA_LIGHTING.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                {optionToggles && <OptionCheckbox checked={isOn('filmLook')} onChange={(v) => setOn('filmLook', v)} label="Film Look" />}
                <span className="eyebrow">Film Look</span>
                <select
                  value={filmLook}
                  onChange={(e) => withEnable('filmLook', onFilmLookChange)(e.target.value)}
                  className={`${selectCls} ${dim('filmLook')}`}
                >
                  {CAMERA_FILM_LOOKS.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
              {mode === 'video' && onSpeedChange && (
                <div className="flex items-center gap-2">
                  {optionToggles && <OptionCheckbox checked={isOn('speed')} onChange={(v) => setOn('speed', v)} label="Speed" />}
                  <span className="eyebrow">Speed</span>
                  <select
                    value={speed}
                    onChange={(e) => withEnable('speed', onSpeedChange)(e.target.value)}
                    className={`${selectCls} ${dim('speed')}`}
                  >
                    {CAMERA_SPEEDS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent
}

export interface CameraControlProps {
  enabled: boolean
  onToggleEnabled: (enabled: boolean) => void
  disabled?: CameraOptionKey[]
  onDisabledChange?: (disabled: CameraOptionKey[]) => void
  camera?: string
  onCameraChange?: (camera: string) => void
  lens: string
  onLensChange: (lens: string) => void
  shot: string
  onShotChange: (shot: string) => void
  level: string
  onLevelChange: (level: string) => void
  movement?: string
  onMovementChange?: (movement: string) => void
  lighting: string
  onLightingChange: (lighting: string) => void
  filmLook: string
  onFilmLookChange: (filmLook: string) => void
  speed: string
  onSpeedChange: (speed: string) => void
  mode?: 'image' | 'video' | 'audio'
  embedded?: boolean
  className?: string
}

export function CameraControl({
  enabled,
  onToggleEnabled,
  disabled = [],
  onDisabledChange,
  camera = DEFAULT_CAMERA_STATE.camera,
  onCameraChange,
  lens,
  onLensChange,
  shot,
  onShotChange,
  level,
  onLevelChange,
  movement = CAMERA_MOVEMENTS[0],
  onMovementChange,
  lighting,
  onLightingChange,
  filmLook,
  onFilmLookChange,
  speed,
  onSpeedChange,
  mode = 'video',
  embedded = false,
  className = '',
}: CameraControlProps) {
  const [showModal, setShowModal] = useState(false)
  const [showTip, setShowTip] = useState(false)

  const isOn = (key: CameraOptionKey) => !disabled.includes(key)
  const tipRows: [string, string][] = []
  if (onCameraChange && isOn('camera')) tipRows.push(['Camera', CAMERA_BODIES.find(c => c.value === camera)?.label || camera])
  if (isOn('lens')) tipRows.push(['Lens', lens])
  if (isOn('shot')) tipRows.push(['Shot', shot])
  if (isOn('level')) tipRows.push(['Level', level])
  if (mode === 'video' && onMovementChange && isOn('movement')) tipRows.push(['Movement', movement])
  if (isOn('lighting') && lighting) tipRows.push(['Lighting', CAMERA_LIGHTING.find(l => l.value === lighting)?.label || lighting])
  if (isOn('filmLook') && filmLook) tipRows.push(['Film Look', CAMERA_FILM_LOOKS.find(l => l.value === filmLook)?.label || filmLook])
  if (mode === 'video' && isOn('speed') && speed) tipRows.push(['Speed', CAMERA_SPEEDS.find(s => s.value === speed)?.label || speed])

  return (
    <>
      <div
        className={`relative ${className}`}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
      >
        <button
          type="button"
          onClick={() => setShowModal(true)}
          title={enabled ? 'Control de Cámara (Activo)' : 'Control de Cámara'}
          className={`flex items-center justify-center transition-all rounded-full border shadow-sm ${
            embedded
              ? `p-1.5 ${enabled ? 'bg-accent-600 text-on-accent border-accent-500' : 'bg-surface-900/90 hover:bg-surface-800/90 border-surface-700/80 hover:border-surface-600 text-surface-400 hover:text-surface-200'}`
              : `h-7 gap-1.5 px-2.5 py-1 text-[11px] font-medium ${enabled ? 'bg-accent-600 text-on-accent border-accent-500' : 'bg-surface-900/90 hover:bg-surface-800/90 border-surface-700/80 hover:border-surface-600 text-surface-200'}`
          }`}
        >
          <Video size={embedded ? 13 : 12} />
          {!embedded && <span>Camera</span>}
        </button>
        {showTip && (
          <div className="absolute bottom-full left-0 mb-1.5 z-50 popover-surface rounded-2xl px-3 py-2 min-w-[190px] pointer-events-none">
            <p className="eyebrow mb-1.5">Camera Control</p>
            {enabled ? (
              <div className="space-y-0.5">
                {tipRows.map(([name, val]) => (
                  <p key={name} className="text-[11px] text-surface-300"><span className="text-surface-500">{name}:</span> {val}</p>
                ))}
                {!tipRows.length && <p className="text-[11px] text-surface-500">Sin opciones activas</p>}
              </div>
            ) : (
              <p className="text-[11px] text-surface-500">Off</p>
            )}
          </div>
        )}
      </div>

      <CameraControlModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        enabled={enabled}
        onToggleEnabled={onToggleEnabled}
        disabled={disabled}
        onDisabledChange={onDisabledChange}
        camera={camera}
        onCameraChange={onCameraChange}
        lens={lens}
        onLensChange={onLensChange}
        shot={shot}
        onShotChange={onShotChange}
        level={level}
        onLevelChange={onLevelChange}
        movement={movement}
        onMovementChange={onMovementChange}
        lighting={lighting}
        onLightingChange={onLightingChange}
        filmLook={filmLook}
        onFilmLookChange={onFilmLookChange}
        speed={speed}
        onSpeedChange={onSpeedChange}
        mode={mode}
      />
    </>
  )
}
