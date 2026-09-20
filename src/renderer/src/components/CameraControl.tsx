import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Video, ChevronUp, ChevronDown, X, Copy, Check, Clipboard, Info } from 'lucide-react'

export interface CameraControlState {
  enabled: boolean
  lens: string
  shot: string
  level: string
  movement: string
  lighting: string
  filmLook: string
  speed: string
}

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
  { value: '', label: 'None' },
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
  { value: '', label: 'None' },
  { value: 'anamorphic lens flare', label: 'Anamorphic' },
  { value: 'film grain', label: 'Film grain' },
  { value: 'teal and orange color grade', label: 'Teal & orange' },
  { value: 'vintage film look', label: 'Vintage' },
  { value: 'desaturated muted palette', label: 'Desaturated' },
]

export const CAMERA_SPEEDS = [
  { value: '', label: 'None' },
  { value: 'slow motion', label: 'Slow Motion' },
  { value: 'fast forward', label: 'Fast Forward' },
  { value: 'timelapse', label: 'Timelapse' },
  { value: 'Speed Ramp [300% - 40% - 300%]', label: 'Speed Ramp' },
]

export const DEFAULT_CAMERA_STATE: CameraControlState = {
  enabled: false,
  lens: CAMERA_LENSES[2],
  shot: CAMERA_SHOTS[3],
  level: CAMERA_LEVELS[0],
  movement: CAMERA_MOVEMENTS[0],
  lighting: '',
  filmLook: '',
  speed: '',
}

export const CAMERA_BLOCK_RE = /\[camera_control\]([\s\S]*?)\[\/camera_control\]/g

export function stripCameraBlock(text: string): string {
  return text.replace(CAMERA_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

export function parseCameraBlock(text: string): CameraControlState {
  const empty: CameraControlState = {
    enabled: false,
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
  const body = match[1].replace(/^Camera composition:\s*/i, '').replace(/\.\s*$/, '').trim()
  const items = body.split(',').map(s => s.trim()).filter(Boolean)
  const pick = (list: string[]) => {
    const exact = items.find(it => list.includes(it))
    if (exact) return exact
    return list.find(opt => {
      const normOpt = opt.toLowerCase().replace(/[\s-_]+/g, '')
      return items.some(it => it.toLowerCase().replace(/[\s-_]+/g, '') === normOpt)
    }) || ''
  }
  const lens = pick(CAMERA_LENSES)
  const shot = pick(CAMERA_SHOTS)
  const level = pick(CAMERA_LEVELS)
  const movement = pick(CAMERA_MOVEMENTS)
  const lighting = pick(CAMERA_LIGHTING.map(l => l.value))
  const filmLook = pick(CAMERA_FILM_LOOKS.map(l => l.value))
  const rawSpeed = pick(CAMERA_SPEEDS.map(s => s.value))
  const speed = rawSpeed || (items.some(it => it.toLowerCase().includes('speed ramp')) ? 'Speed Ramp [300% - 40% - 300%]' : '')

  const hasAny = !!(lens || shot || level || movement || lighting || filmLook || speed)
  return {
    enabled: hasAny,
    lens: lens || CAMERA_LENSES[2],
    shot: shot || CAMERA_SHOTS[3],
    level: level || CAMERA_LEVELS[0],
    movement: movement || CAMERA_MOVEMENTS[0],
    lighting,
    filmLook,
    speed,
  }
}

export function formatCameraBlock(
  state: Partial<CameraControlState>,
  mode: 'image' | 'video' | 'audio' = 'video'
): string {
  if (!state.enabled) return ''
  const parts: string[] = []
  if (state.lens) parts.push(state.lens)
  if (state.shot) parts.push(state.shot)
  if (state.level) parts.push(state.level)
  if (mode === 'video' && state.movement) parts.push(state.movement)
  if (state.lighting) parts.push(state.lighting)
  if (state.filmLook) parts.push(state.filmLook)
  if (mode === 'video' && state.speed) parts.push(state.speed)
  return `[camera_control]\nCamera composition: ${parts.join(', ')}.\n[/camera_control]`
}

export interface CameraWheelProps {
  label: string
  options: string[]
  value: string
  onChange: (value: string) => void
}

export function CameraWheel({ label, options, value, onChange }: CameraWheelProps) {
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
      <span className="text-[10px] uppercase tracking-wider text-surface-500">{label}</span>
      <button
        type="button"
        onClick={() => select(-1)}
        className="w-[140px] h-7 flex items-center justify-center rounded-lg bg-surface-800/80 text-surface-400 hover:text-surface-100 hover:bg-surface-700 transition-colors"
        title="Previous"
      >
        <ChevronUp size={14} />
      </button>
      <div ref={boxRef} className="relative h-[90px] w-[140px] overflow-hidden rounded-lg bg-surface-800/40 select-none">
        <div className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 h-[30px] rounded-md bg-accent-500/10 border-y border-accent-500/20" />
        <div className="pointer-events-none absolute top-0 inset-x-0 h-[16px] z-30 bg-gradient-to-b from-surface-900 to-transparent" />
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-[16px] z-30 bg-gradient-to-t from-surface-900 to-transparent" />
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
        className="w-[140px] h-7 flex items-center justify-center rounded-lg bg-surface-800/80 text-surface-400 hover:text-surface-100 hover:bg-surface-700 transition-colors"
        title="Next"
      >
        <ChevronDown size={14} />
      </button>
    </div>
  )
}

export interface CameraControlModalProps {
  isOpen: boolean
  onClose: () => void
  enabled: boolean
  onToggleEnabled: (enabled: boolean) => void
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
  }, [enabled, lens, shot, level, movement, lighting, filmLook, speed, mode])

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
            else if (data.lighting === '') { onLightingChange(''); matched = true }
          }

          if (data.filmLook !== undefined) {
            const found = CAMERA_FILM_LOOKS.find(f => f.value === data.filmLook || (f.label && f.label.toLowerCase() === data.filmLook.toLowerCase()))
            if (found) { onFilmLookChange(found.value); matched = true }
            else if (data.filmLook === '') { onFilmLookChange(''); matched = true }
          }

          if (onSpeedChange && data.speed !== undefined) {
            const found = CAMERA_SPEEDS.find(s => s.value === data.speed || (s.label && s.label.toLowerCase() === data.speed.toLowerCase()))
            if (found) { onSpeedChange(found.value); matched = true }
            else if (data.speed === '') { onSpeedChange(''); matched = true }
          }

          if (matched) {
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

      if (parsed.enabled || parsed.lens || parsed.shot || parsed.level || parsed.movement || parsed.lighting || parsed.filmLook || parsed.speed) {
        if (parsed.lens) onLensChange(parsed.lens)
        if (parsed.shot) onShotChange(parsed.shot)
        if (parsed.level) onLevelChange(parsed.level)
        if (parsed.movement && onMovementChange) onMovementChange(parsed.movement)
        if (parsed.lighting !== undefined) onLightingChange(parsed.lighting)
        if (parsed.filmLook !== undefined) onFilmLookChange(parsed.filmLook)
        if (parsed.speed !== undefined && onSpeedChange) onSpeedChange(parsed.speed)
        onToggleEnabled(true)
        setPasted(true)
        setTimeout(() => setPasted(false), 1500)
      }
    } catch (err) {
      console.error('Error pasting camera parameters:', err)
    }
  }, [onLensChange, onShotChange, onLevelChange, onMovementChange, onLightingChange, onFilmLookChange, onSpeedChange, onToggleEnabled])

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

  if (!isOpen) return null

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl w-[640px] max-w-[94vw] max-h-[85vh] flex flex-col z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
          <h3 className="text-sm font-medium text-surface-200 flex items-center gap-2">
            <Video size={14} className="text-accent-400" /> Control de Cámara
          </h3>
          <div className="flex items-center gap-2.5">
            {/* 3 xs action buttons: copy, paste, info */}
            <div className="flex items-center gap-1 bg-surface-800/80 p-0.5 rounded-lg border border-surface-700/60">
              <button
                type="button"
                onClick={handleCopy}
                title="Copiar ajustes (Ctrl+C)"
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors text-surface-300 hover:text-white hover:bg-surface-700 active:scale-95 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check size={11} className="text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
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
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors text-surface-300 hover:text-white hover:bg-surface-700 active:scale-95 cursor-pointer"
              >
                {pasted ? (
                  <>
                    <Check size={11} className="text-emerald-400" />
                    <span className="text-emerald-400">Pasted</span>
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
                  className="flex items-center justify-center p-1 rounded text-[10px] text-surface-400 hover:text-surface-200 hover:bg-surface-700 transition-colors cursor-pointer"
                  aria-label="Información sobre atajos"
                >
                  <Info size={12} />
                </button>
                <div className="pointer-events-none absolute right-0 top-full mt-2 hidden group-hover:flex flex-col z-50 w-60 p-2.5 bg-surface-800 border border-surface-700 rounded-xl shadow-2xl text-[11px] text-surface-200 animate-in fade-in-0 zoom-in-95">
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
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
            <button onClick={onClose} className="text-surface-500 hover:text-surface-200 p-1 rounded-lg hover:bg-surface-800 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className={`flex items-start justify-center gap-3 ${enabled ? '' : 'opacity-40 pointer-events-none'}`}>
            <CameraWheel label="Lens" options={CAMERA_LENSES} value={lens} onChange={onLensChange} />
            <CameraWheel label="Shot" options={CAMERA_SHOTS} value={shot} onChange={onShotChange} />
            <CameraWheel label="Level" options={CAMERA_LEVELS} value={level} onChange={onLevelChange} />
            {mode === 'video' && onMovementChange && (
              <CameraWheel label="Movement" options={CAMERA_MOVEMENTS} value={movement} onChange={onMovementChange} />
            )}
          </div>
          <div className={`mt-4 flex flex-wrap items-center justify-center gap-5 ${enabled ? '' : 'opacity-40 pointer-events-none'}`}>
            <label className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-surface-500">Lighting</span>
              <select
                value={lighting}
                onChange={(e) => onLightingChange(e.target.value)}
                className="bg-surface-800/80 border border-surface-700 rounded-lg px-2 py-1.5 text-[11px] text-surface-300 outline-none focus:border-accent-500/50"
              >
                {CAMERA_LIGHTING.map(l => (
                  <option key={l.value || 'none'} value={l.value}>{l.label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-surface-500">Film Look</span>
              <select
                value={filmLook}
                onChange={(e) => onFilmLookChange(e.target.value)}
                className="bg-surface-800/80 border border-surface-700 rounded-lg px-2 py-1.5 text-[11px] text-surface-300 outline-none focus:border-accent-500/50"
              >
                {CAMERA_FILM_LOOKS.map(l => (
                  <option key={l.value || 'none'} value={l.value}>{l.label}</option>
                ))}
              </select>
            </label>
            {mode === 'video' && onSpeedChange && (
              <label className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-surface-500">Speed</span>
                <select
                  value={speed}
                  onChange={(e) => onSpeedChange(e.target.value)}
                  className="bg-surface-800/80 border border-surface-700 rounded-lg px-2 py-1.5 text-[11px] text-surface-300 outline-none focus:border-accent-500/50"
                >
                  {CAMERA_SPEEDS.map(s => (
                    <option key={s.value || 'none'} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </label>
            )}
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
          className={`flex items-center justify-center transition-colors rounded-lg ${
            embedded
              ? `p-1.5 ${enabled ? 'bg-accent-600 text-white shadow-sm' : 'bg-surface-800/80 text-surface-400 hover:text-surface-200'}`
              : `gap-1 px-2.5 py-1 text-[11px] font-medium ${enabled ? 'bg-accent-600 text-white' : 'bg-surface-800/80 text-surface-500 hover:text-surface-300'}`
          }`}
        >
          <Video size={embedded ? 13 : 12} />
          {!embedded && <span>Camera</span>}
        </button>
        {showTip && (
          <div className="absolute bottom-full left-0 mb-1.5 z-50 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 shadow-xl min-w-[190px] pointer-events-none">
            <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-1.5">Camera Control</p>
            {enabled ? (
              <div className="space-y-0.5">
                <p className="text-[11px] text-surface-300"><span className="text-surface-500">Lens:</span> {lens}</p>
                <p className="text-[11px] text-surface-300"><span className="text-surface-500">Shot:</span> {shot}</p>
                <p className="text-[11px] text-surface-300"><span className="text-surface-500">Level:</span> {level}</p>
                {mode === 'video' && onMovementChange && (
                  <p className="text-[11px] text-surface-300"><span className="text-surface-500">Movement:</span> {movement}</p>
                )}
                <p className="text-[11px] text-surface-300"><span className="text-surface-500">Lighting:</span> {CAMERA_LIGHTING.find(l => l.value === lighting)?.label || '—'}</p>
                <p className="text-[11px] text-surface-300"><span className="text-surface-500">Film Look:</span> {CAMERA_FILM_LOOKS.find(l => l.value === filmLook)?.label || '—'}</p>
                {mode === 'video' && speed && (
                  <p className="text-[11px] text-surface-300"><span className="text-surface-500">Speed:</span> {CAMERA_SPEEDS.find(s => s.value === speed)?.label || '—'}</p>
                )}
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
