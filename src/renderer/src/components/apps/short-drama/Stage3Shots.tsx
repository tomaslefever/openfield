import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Sparkles,
  Image as ImageIcon,
  Video,
  Copy,
  Check,
  Wand2,
  Play,
  Pause,
  Mic,
  History,
  GripVertical,
  Trash2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Library,
  Loader2,
  Link2,
  X,
  AlertCircle,
  SlidersHorizontal,
} from 'lucide-react'
import {
  useShortDramaStore,
  type DramaShot,
  type DramaCharacter,
  type DramaScenario,
  type DramaProp,
  parseDialogueTurns,
} from '../../../stores/short-drama-store'
import { ModelSelectorDropdown } from '../../models/ModelSelectorDropdown'
import { ResolutionSelector } from '../../models/ResolutionSelector'
import { AspectRatioSelector } from '../../models/AspectRatioSelector'
import { ImageLibraryPicker } from '../../ImageLibraryPicker'
import { ImagePreviewModal } from '../../ui/ImagePreviewModal'
import { QuickPromptComposer } from '../../QuickPromptComposer'
import { ToolButton } from '../../ui/tool-button'
import { Switch } from '../../ui/switch'
import { GenerationHistoryModal } from './GenerationHistoryModal'
import { srcUrl } from '../../../services/file-url'
import { copyText } from '../../../lib/clipboard'
import { cleanModelName } from '../../../lib/models'
import {
  StageHeader,
  StageFooter,
  ControlBar,
  Control,
  IconAction,
  PromptField,
  MediaTile,
  Segmented,
} from './ui'
import { aspectStyle, assetLocation, readComposerRefs, composerResolution, type ComposerRef } from './media'

interface LinkedRef {
  id: string
  name: string
  kind: 'frame' | 'character' | 'scenario' | 'prop'
  imageUrl?: string
  imageAssetId?: string
}

/** Elements whose images feed the frame, in the order the store sends them */
function linkedRefs(shot: DramaShot, characters: DramaCharacter[], scenarios: DramaScenario[], props: DramaProp[]): LinkedRef[] {
  const chars = characters.filter((c) => (shot.characterNames || []).includes(c.name))
  const speaker = characters.find((c) => (shot.dialogueSpeaker || '').toLowerCase().trim() === c.name.toLowerCase().trim())
  if (speaker && !chars.some((c) => c.id === speaker.id)) chars.unshift(speaker)
  const scn = scenarios.find((s) => s.name === shot.scenarioName)
  return [
    ...chars.map((c) => ({ id: c.id, name: c.name, kind: 'character' as const, imageUrl: c.imageUrl, imageAssetId: c.imageAssetId })),
    ...(scn ? [{ id: scn.id, name: scn.name, kind: 'scenario' as const, imageUrl: scn.imageUrl, imageAssetId: scn.imageAssetId }] : []),
    ...props
      .filter((p) => (shot.propNames || []).includes(p.name))
      .map((p) => ({ id: p.id, name: p.name, kind: 'prop' as const, imageUrl: p.imageUrl, imageAssetId: p.imageAssetId })),
  ]
}

// ───────────────────── Linked elements ─────────────────────

function LinkPicker({
  shot,
  characters,
  scenarios,
  props,
  updateShot,
}: {
  shot: DramaShot
  characters: DramaCharacter[]
  scenarios: DramaScenario[]
  props: DramaProp[]
  updateShot: (id: string, data: Partial<DramaShot>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = (list: string[] | undefined, name: string) =>
    (list || []).includes(name) ? (list || []).filter((n) => n !== name) : [...(list || []), name]

  const Row = ({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) => (
    <button type="button" onClick={onClick} className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-meta text-ink hover:bg-surface-800 transition-colors">
      <span className="truncate">{label}</span>
      {checked && <Check size={12} className="flex-shrink-0" />}
    </button>
  )

  const groups: Array<{ title: string; rows: React.ReactNode[] }> = [
    {
      title: 'Personajes',
      rows: characters.map((c) => (
        <Row key={c.id} label={c.name} checked={(shot.characterNames || []).includes(c.name)} onClick={() => updateShot(shot.id, { characterNames: toggle(shot.characterNames, c.name) })} />
      )),
    },
    {
      title: 'Locación',
      rows: scenarios.map((s) => (
        <Row key={s.id} label={s.name} checked={shot.scenarioName === s.name} onClick={() => updateShot(shot.id, { scenarioName: shot.scenarioName === s.name ? '' : s.name })} />
      )),
    },
    {
      title: 'Objetos',
      rows: props.map((p) => (
        <Row key={p.id} label={p.name} checked={(shot.propNames || []).includes(p.name)} onClick={() => updateShot(shot.id, { propNames: toggle(shot.propNames, p.name) })} />
      )),
    },
  ].filter((g) => g.rows.length > 0)

  return (
    <div className="relative" ref={ref}>
      <ToolButton icon={Link2} onClick={() => setOpen(!open)} title="Elegir qué elementos del elenco aparecen en la toma" />
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-56 max-h-72 overflow-y-auto popover-surface rounded-2xl p-1.5">
          {groups.length === 0 ? (
            <p className="text-meta text-ink-subtle p-2">El elenco está vacío. Créalo en la etapa 2.</p>
          ) : groups.map((g) => (
            <div key={g.title}>
              <p className="eyebrow px-2 pt-1.5 pb-1">{g.title}</p>
              {g.rows}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ───────────────────── Dialogue row ─────────────────────

function DialogueRow({
  shot,
  characters,
  updateShot,
  onGenerateAudio,
}: {
  shot: DramaShot
  characters: DramaCharacter[]
  updateShot: (shotId: string, updates: Partial<DramaShot>) => void
  onGenerateAudio: (customText?: string) => void
}) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speakerOpen, setSpeakerOpen] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const speakerRef = useRef<HTMLDivElement | null>(null)
  const text = shot.dialogueText || ''

  useEffect(() => {
    if (!speakerOpen) return
    const onDown = (e: MouseEvent) => { if (speakerRef.current && !speakerRef.current.contains(e.target as Node)) setSpeakerOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [speakerOpen])

  const turns = useMemo(() => parseDialogueTurns(text, shot.dialogueSpeaker, characters), [text, shot.dialogueSpeaker, characters])
  const isGenerating = shot.audioStatus === 'generating'
  const audioSrc = srcUrl(shot.audioLocalPath || shot.audioUrl)
  const hasAudio = shot.audioStatus === 'completed' && !!audioSrc

  useEffect(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [audioSrc])

  const fmt = (secs: number) => {
    if (!Number.isFinite(secs) || secs < 0) return '0:00'
    return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`
  }

  return (
    <div className="rounded-xl border border-hairline bg-canvas p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="relative min-w-0" ref={speakerRef}>
          <button
            type="button"
            onClick={() => setSpeakerOpen((v) => !v)}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-pill text-meta font-emphasis text-ink hover:bg-surface-800 transition-colors max-w-full"
            title="Quién habla"
          >
            <Mic size={11} className="flex-shrink-0" />
            <span className="truncate">{shot.dialogueSpeaker || 'Narrador'}</span>
            <ChevronDown size={10} className="text-ink-subtle flex-shrink-0" />
          </button>
          {speakerOpen && (
            <div className="absolute left-0 top-full mt-1 z-30 w-44 popover-surface rounded-2xl p-1.5">
              {[{ id: '__vo', name: 'Narrador' }, ...characters].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { updateShot(shot.id, { dialogueSpeaker: c.id === '__vo' ? 'Narrador' : c.name }); setSpeakerOpen(false) }}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-meta text-ink hover:bg-surface-800 transition-colors"
                >
                  <span className="truncate">{c.name}</span>
                  {(shot.dialogueSpeaker || 'Narrador').toLowerCase().trim() === c.name.toLowerCase().trim() && <Check size={12} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {turns.length > 1 && <span className="text-meta text-ink-subtle mr-1">{turns.length} voces</span>}
          {hasAudio && (
            <IconAction
              icon={Trash2}
              title="Quitar audio"
              danger
              onClick={() => updateShot(shot.id, { audioStatus: 'idle', audioLocalPath: undefined, audioUrl: undefined, audioAssetId: undefined, audioTaskId: undefined })}
            />
          )}
          <ToolButton
            icon={isGenerating ? Loader2 : hasAudio ? Mic : Sparkles}
            spin={isGenerating}
            onClick={() => onGenerateAudio(text)}
            disabled={isGenerating || !text.trim()}
            title={hasAudio ? 'Volver a sintetizar' : 'Sintetizar la voz'}
          >
            {isGenerating ? 'Sintetizando' : hasAudio ? 'Rehacer' : 'Voz'}
          </ToolButton>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => updateShot(shot.id, { dialogueText: e.target.value })}
        placeholder="Diálogo o narración de la toma…"
        rows={Math.min(4, Math.max(2, (text.match(/\n/g) || []).length + 1))}
        className="w-full bg-transparent text-meta text-ink placeholder:text-ink-subtle resize-none outline-none leading-relaxed px-1"
      />

      {hasAudio && (
        <div className="flex items-center gap-2 px-1">
          <audio
            ref={audioRef}
            src={audioSrc}
            preload="auto"
            onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
            onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
            onEnded={() => { setIsPlaying(false); setCurrentTime(0) }}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
          />
          <button
            type="button"
            onClick={() => (isPlaying ? audioRef.current?.pause() : audioRef.current?.play().catch(() => setIsPlaying(false)))}
            className="size-6 rounded-full bg-accent-600 text-on-accent flex items-center justify-center flex-shrink-0"
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          >
            {isPlaying ? <Pause size={10} className="fill-current" /> : <Play size={10} className="fill-current ml-0.5" />}
          </button>
          <div
            className="flex-1 h-1 bg-surface-800 rounded-full cursor-pointer overflow-hidden"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
              if (audioRef.current && duration > 0) audioRef.current.currentTime = pct * duration
            }}
          >
            <div className="h-full bg-ink rounded-full" style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
          </div>
          <span className="font-mono text-[10px] text-ink-subtle flex-shrink-0">{fmt(duration ? duration - currentTime : 0)}</span>
        </div>
      )}
    </div>
  )
}

// ───────────────────── Shot state ─────────────────────

type ShotView = 'frame' | 'video'
type VideoMode = 'ff' | 'fflf' | 'ref'

const VIEW_OPTIONS = [
  { value: 'frame' as const, label: 'Frame', icon: ImageIcon, title: 'El frame de la toma (storyboard)' },
  { value: 'video' as const, label: 'Video', icon: Video, title: 'La toma animada' },
]

const VIDEO_MODES = [
  { value: 'ff' as const, label: 'FF', title: 'Frame inicial: anima el frame de la toma' },
  { value: 'fflf' as const, label: 'FF/LF', title: 'Frame inicial y final: va del frame de la toma al final elegido' },
  { value: 'ref' as const, label: 'Ingredientes', title: 'Referencias: el frame y el elenco vinculado guían el video sin fijar el inicio' },
]

const MODE_HINT: Record<VideoMode, string> = {
  ff: 'Anima el frame de la toma como primer frame.',
  fflf: 'Va del frame de la toma al frame final. Por defecto, el de la toma siguiente.',
  ref: 'El frame y los elementos vinculados se envían como referencias.',
}

const DURATIONS = [3, 4, 5, 6, 8, 10, 12, 15]

function videoModeOf(shot: DramaShot): VideoMode {
  return shot.videoInputMode === 'fflf' || shot.videoInputMode === 'ref' ? shot.videoInputMode : 'ff'
}

function hasVideo(shot: DramaShot): boolean {
  return shot.videoStatus === 'completed' && Boolean(shot.videoUrl || shot.videoLocalPath)
}

function isVideoBusy(shot: DramaShot): boolean {
  return shot.videoStatus === 'generating' || shot.videoStatus === 'queued'
}

function FrameLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute bottom-2 left-2 inline-flex items-center h-6 px-2 rounded-pill bg-canvas/90 font-mono text-eyebrow uppercase text-ink">
      {children}
    </span>
  )
}

// ───────────────────── Tile (grid) ─────────────────────

interface ShotTileProps {
  shot: DramaShot
  view: ShotView
  aspectRatio: string
  selected: boolean
  dragState: 'idle' | 'dragging' | 'over'
  onSelect: () => void
  onReorderDragStart: (e: React.DragEvent) => void
  onReorderDragOver: (e: React.DragEvent) => void
  onReorderDrop: (e: React.DragEvent) => void
  onReorderDragEnd: () => void
}

/** Media only: everything else lives in the inspector */
function ShotTile({
  shot, view, aspectRatio, selected, dragState, onSelect,
  onReorderDragStart, onReorderDragOver, onReorderDrop, onReorderDragEnd,
}: ShotTileProps) {
  const videoEl = useRef<HTMLVideoElement>(null)
  const showVideo = view === 'video' && hasVideo(shot)
  const busy = view === 'video' ? isVideoBusy(shot) : shot.keyframeGenerating
  const frame = srcUrl(shot.keyframeUrl)

  return (
    <div onDragOver={onReorderDragOver} onDrop={onReorderDrop} className={`group/tile relative ${dragState === 'dragging' ? 'opacity-40' : ''}`}>
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={() => videoEl.current?.play().catch(() => {})}
        onMouseLeave={() => {
          const v = videoEl.current
          if (v) { v.pause(); v.currentTime = 0 }
        }}
        style={aspectStyle(aspectRatio)}
        title={[shot.cameraMovement, shot.actionPrompt].filter(Boolean).join('. ')}
        className={`relative block w-full overflow-hidden rounded-xl bg-surface-950 border transition-colors ${
          selected ? 'border-ink ring-1 ring-ink' : dragState === 'over' ? 'border-ink' : 'border-hairline hover:border-surface-600'
        }`}
      >
        {showVideo ? (
          <video ref={videoEl} src={srcUrl(shot.videoLocalPath || shot.videoUrl)} muted loop playsInline preload="metadata" className="w-full h-full object-cover" />
        ) : frame ? (
          <img src={frame} alt="" loading="lazy" className={`w-full h-full object-cover ${view === 'video' ? 'opacity-50' : ''}`} />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-ink-subtle">
            <ImageIcon size={18} strokeWidth={1.5} />
          </span>
        )}

        {busy && (
          <span className="absolute inset-0 bg-canvas/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1.5">
            <Loader2 size={15} className="animate-spin text-ink" />
            {view === 'video' && shot.videoProgress != null && (
              <span className="w-12 h-0.5 rounded-full bg-surface-800 overflow-hidden">
                <span className="block h-full bg-ink transition-all" style={{ width: `${shot.videoProgress}%` }} />
              </span>
            )}
          </span>
        )}

        <span className="absolute top-1.5 left-1.5 inline-flex items-center h-5 px-1.5 rounded-pill bg-canvas/90 font-mono text-[10px] text-ink">
          {String(shot.order).padStart(2, '0')}
        </span>
        <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
          {shot.videoStatus === 'failed' && view === 'video' && (
            <span className="size-5 rounded-full bg-red-600 text-white flex items-center justify-center" title="El video falló">
              <AlertCircle size={10} />
            </span>
          )}
          {view === 'frame' && hasVideo(shot) && (
            <span className="size-5 rounded-full bg-canvas/90 text-ink flex items-center justify-center" title="Tiene video">
              <Video size={10} />
            </span>
          )}
          {shot.audioStatus === 'completed' && (
            <span className="size-5 rounded-full bg-canvas/90 text-ink flex items-center justify-center" title="Voz sintetizada">
              <Mic size={10} />
            </span>
          )}
        </span>
      </button>
      <span
        draggable
        onDragStart={onReorderDragStart}
        onDragEnd={onReorderDragEnd}
        className="absolute top-1.5 right-1.5 size-6 rounded-full bg-canvas/90 text-ink-muted hover:text-ink flex items-center justify-center cursor-grab active:cursor-grabbing shadow-soft opacity-0 group-hover/tile:opacity-100 transition-opacity"
        title="Arrastrar para reordenar"
      >
        <GripVertical size={12} />
      </span>
    </div>
  )
}

// ───────────────────── Video preview ─────────────────────

function VideoPreview({
  shot,
  mode,
  lastFrame,
  ingredients,
  aspectRatio,
  modelName,
}: {
  shot: DramaShot
  mode: VideoMode
  lastFrame?: string
  ingredients: LinkedRef[]
  aspectRatio: string
  modelName: string
}) {
  const first = srcUrl(shot.keyframeUrl)
  const last = srcUrl(lastFrame)
  const isTall = aspectRatio === '9:16' || aspectRatio === '3:4'

  let body: React.ReactNode
  if (hasVideo(shot)) {
    body = <video key={shot.videoLocalPath || shot.videoUrl} src={srcUrl(shot.videoLocalPath || shot.videoUrl)} controls playsInline className="w-full h-full object-cover" />
  } else if (isVideoBusy(shot)) {
    body = (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
        {first && <img src={first} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />}
        <Loader2 size={18} className="relative animate-spin text-ink" />
        <span className="relative text-meta text-ink">
          {shot.videoStatus === 'queued' ? 'En cola…' : `Renderizando con ${modelName}`}
        </span>
        {shot.videoProgress != null && (
          <div className="relative w-28 h-1 rounded-full bg-surface-800 overflow-hidden">
            <div className="h-full bg-ink transition-all" style={{ width: `${shot.videoProgress}%` }} />
          </div>
        )}
      </div>
    )
  } else if (mode === 'ref') {
    body = ingredients.length > 0 ? (
      <div className="absolute inset-0 p-3 flex items-center justify-center">
        <div className={`grid gap-1.5 w-full ${ingredients.length === 1 ? 'grid-cols-1 max-w-[60%]' : ingredients.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {ingredients.slice(0, 9).map((r) => (
            <div key={`${r.kind}-${r.id}`} className="relative aspect-square rounded-lg overflow-hidden bg-surface-800" title={r.name}>
              {r.imageUrl ? <img src={srcUrl(r.imageUrl)} alt="" className="w-full h-full object-cover" /> : (
                <span className="w-full h-full flex items-center justify-center font-mono text-[10px] text-ink-muted">{r.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-4 text-center text-ink-subtle">
        <Link2 size={18} strokeWidth={1.5} />
        <span className="text-meta">Sin referencias: vincula elementos o genera el frame.</span>
      </div>
    )
  } else if (mode === 'fflf' && first && last) {
    body = (
      <div className={`w-full h-full grid gap-1 p-1 ${isTall ? 'grid-rows-2' : 'grid-cols-2'}`}>
        <div className="relative rounded-lg overflow-hidden">
          <img src={first} alt="" className="w-full h-full object-cover" />
          <FrameLabel>Inicio</FrameLabel>
        </div>
        <div className="relative rounded-lg overflow-hidden">
          <img src={last} alt="" className="w-full h-full object-cover" />
          <FrameLabel>Final</FrameLabel>
        </div>
      </div>
    )
  } else if (first) {
    body = (
      <>
        <img src={first} alt="" className="w-full h-full object-cover" />
        <FrameLabel>{mode === 'fflf' ? 'Inicio · sin final' : 'Frame inicial'}</FrameLabel>
      </>
    )
  } else {
    body = (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-4 text-center text-ink-subtle">
        <Video size={18} strokeWidth={1.5} />
        <span className="text-meta">Sin frame: el video saldrá solo del prompt.</span>
      </div>
    )
  }

  return (
    <div className="relative rounded-xl overflow-hidden bg-surface-950 border border-hairline" style={aspectStyle(aspectRatio)}>
      {body}
    </div>
  )
}

// ───────────────────── Inspector ─────────────────────

interface ShotInspectorProps {
  shot: DramaShot
  nextShot?: DramaShot
  chainFrom?: DramaShot
  characters: DramaCharacter[]
  scenarios: DramaScenario[]
  props: DramaProp[]
  aspectRatio: string
  videoModelName: string
  tab: ShotView
  onTab: (tab: ShotView) => void
  rewriting: boolean
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  onGenerateFrame: () => void
  onPersonalize: (refs: LinkedRef[]) => void
  onRewrite: () => void
  onLibrary: (slot: 'keyframe' | 'lastFrame') => void
  onFrameHistory: () => void
  onVideoHistory: () => void
  onPreview: () => void
  onGenerateVideo: () => void
  generateShotVoice: (shotId: string, customDialogueText?: string) => Promise<void>
  updateShot: (shotId: string, updates: Partial<DramaShot>) => void
  duplicateShot: (id: string) => void
  removeShot: (id: string) => void
}

function ShotInspector({
  shot, nextShot, chainFrom, characters, scenarios, props, aspectRatio, videoModelName,
  tab, onTab, rewriting, onClose, onPrev, onNext,
  onGenerateFrame, onPersonalize, onRewrite, onLibrary, onFrameHistory, onVideoHistory, onPreview, onGenerateVideo,
  generateShotVoice, updateShot, duplicateShot, removeShot,
}: ShotInspectorProps) {
  const refs = useMemo(() => linkedRefs(shot, characters, scenarios, props), [shot, characters, scenarios, props])
  const mode = videoModeOf(shot)
  const ingredients = useMemo<LinkedRef[]>(
    () => [
      ...(shot.keyframeUrl ? [{ id: shot.id, name: `Toma ${shot.order}`, kind: 'frame' as const, imageUrl: shot.keyframeUrl, imageAssetId: shot.keyframeAssetId }] : []),
      ...refs.filter((r) => r.imageUrl || r.imageAssetId),
    ],
    [shot.id, shot.order, shot.keyframeUrl, shot.keyframeAssetId, refs],
  )
  const customLast = Boolean(shot.lastFrameUrl || shot.lastFrameAssetId)
  const lastFrame = shot.lastFrameUrl || nextShot?.keyframeUrl
  const busyVideo = isVideoBusy(shot)
  const frameHistory = shot.keyframeHistory?.length || 0
  const videoHistory = shot.videoHistory?.length || 0
  const hasDialogue = shot.dialogueText !== undefined && shot.dialogueText !== ''
  const explicitRef = shot.videoRefUrl || shot.videoRefLocalPath || shot.videoRefAssetId
  const continuity = explicitRef ? (shot.videoRefName || 'Video anterior') : chainFrom ? `Toma ${chainFrom.order}` : null
  const duration = shot.estimatedDuration || 5

  return (
    <aside className="w-[400px] max-w-[45%] flex-shrink-0 border-l border-hairline overflow-y-auto bg-canvas">
      <div className="sticky top-0 z-20 flex items-center gap-1 px-4 h-12 border-b border-hairline bg-canvas/95 backdrop-blur">
        <span className="font-mono text-eyebrow text-ink">Toma {String(shot.order).padStart(2, '0')}</span>
        <span className="text-meta text-ink-subtle">· {duration}s</span>
        <div className="flex-1" />
        <IconAction icon={ChevronLeft} title="Toma anterior" onClick={() => onPrev?.()} disabled={!onPrev} />
        <IconAction icon={ChevronRight} title="Toma siguiente" onClick={() => onNext?.()} disabled={!onNext} />
        <IconAction icon={Copy} title="Duplicar toma" onClick={() => duplicateShot(shot.id)} />
        <IconAction icon={Trash2} title="Eliminar toma" danger onClick={() => removeShot(shot.id)} />
        <IconAction icon={X} title="Cerrar (Esc)" onClick={onClose} />
      </div>

      <div className="p-4 space-y-4">
        <Segmented value={tab} onChange={onTab} options={VIEW_OPTIONS} className="w-full" />

        {tab === 'frame' ? (
          <>
            <MediaTile
              src={shot.keyframeUrl}
              aspect={aspectStyle(aspectRatio)}
              generating={shot.keyframeGenerating}
              placeholder={<ImageIcon size={20} strokeWidth={1.5} />}
              onOpen={onPreview}
              onAsset={(a) => updateShot(shot.id, { keyframeAssetId: a.assetId, keyframeUrl: a.url })}
            />
            <div className="flex flex-wrap items-center gap-0.5 -ml-1">
              <ToolButton
                icon={shot.keyframeGenerating ? Loader2 : Sparkles}
                spin={shot.keyframeGenerating}
                solid
                onClick={onGenerateFrame}
                disabled={shot.keyframeGenerating}
                title="Genera el frame con el modelo de la etapa y los elementos vinculados"
              >
                {shot.keyframeGenerating ? 'Generando' : shot.keyframeUrl ? 'Regenerar' : 'Generar frame'}
              </ToolButton>
              <ToolButton icon={Wand2} onClick={() => onPersonalize(refs)} disabled={shot.keyframeGenerating} title="Elige modelo, referencias e instrucciones">
                Personalizar
              </ToolButton>
              <ToolButton icon={Library} onClick={() => onLibrary('keyframe')} disabled={shot.keyframeGenerating} title="Elegir de la biblioteca" />
              {frameHistory > 0 && (
                <ToolButton icon={History} onClick={onFrameHistory} title={`${frameHistory} versiones`}>{frameHistory}</ToolButton>
              )}
              <div className="flex-1" />
              <ToolButton icon={Video} onClick={() => onTab('video')} title="Convertir la toma en video">
                A video
              </ToolButton>
            </div>
            <PromptField
              label="Prompt del frame"
              value={shot.keyframePrompt || ''}
              onChange={(keyframePrompt) => updateShot(shot.id, { keyframePrompt })}
              placeholder={shot.actionPrompt || 'Composición, encuadre, luz…'}
              rows={4}
              onRewrite={onRewrite}
              rewriting={rewriting}
              disabled={shot.keyframeGenerating}
            />
          </>
        ) : (
          <>
            <VideoPreview shot={shot} mode={mode} lastFrame={lastFrame} ingredients={ingredients} aspectRatio={aspectRatio} modelName={videoModelName} />
            <div className="flex flex-wrap items-center gap-0.5 -ml-1">
              <ToolButton
                icon={busyVideo ? Loader2 : Sparkles}
                spin={busyVideo}
                solid
                onClick={onGenerateVideo}
                disabled={busyVideo}
                title={`Genera el video en modo ${VIDEO_MODES.find((m) => m.value === mode)?.label}`}
              >
                {busyVideo ? 'Generando' : hasVideo(shot) ? 'Regenerar video' : 'Generar video'}
              </ToolButton>
              {videoHistory > 0 && (
                <ToolButton icon={History} onClick={onVideoHistory} title={`${videoHistory} versiones`}>{videoHistory}</ToolButton>
              )}
              <div className="flex-1" />
              {shot.videoStatus === 'failed' && (
                <span className="inline-flex items-center gap-1 text-meta text-red-500"><AlertCircle size={11} /> Falló</span>
              )}
            </div>

            <div className="space-y-1.5">
              <span className="text-meta text-ink-subtle">Entrada</span>
              <Segmented
                value={mode}
                onChange={(videoInputMode) => updateShot(shot.id, { videoInputMode })}
                options={VIDEO_MODES}
                className="w-full"
              />
              <p className="text-meta text-ink-subtle">{MODE_HINT[mode]}</p>
            </div>

            {mode !== 'ref' && !shot.keyframeUrl && (
              <button type="button" onClick={() => onTab('frame')} className="w-full h-8 rounded-xl border border-dashed border-surface-700 text-meta text-ink-subtle hover:text-ink hover:border-surface-500 transition-colors">
                Genera el frame primero para fijar el inicio
              </button>
            )}

            {mode === 'fflf' && (
              <div className="flex items-center gap-3">
                <div className="w-20 flex-shrink-0">
                  <MediaTile
                    src={lastFrame}
                    aspect={aspectStyle(aspectRatio)}
                    placeholder={<ImageIcon size={14} strokeWidth={1.5} />}
                    emptyLabel=""
                    onAsset={(a) => updateShot(shot.id, { lastFrameAssetId: a.assetId, lastFrameUrl: a.url })}
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-meta text-ink">Frame final</p>
                  <p className="text-meta text-ink-subtle">
                    {customLast ? 'Elegido a mano' : nextShot?.keyframeUrl ? `Frame de la toma ${nextShot.order}` : 'Sin final: arrastra una imagen'}
                  </p>
                  <div className="flex items-center gap-0.5 -ml-1">
                    <ToolButton icon={Library} onClick={() => onLibrary('lastFrame')} title="Elegir de la biblioteca">Elegir</ToolButton>
                    {customLast && (
                      <ToolButton
                        icon={X}
                        onClick={() => updateShot(shot.id, { lastFrameUrl: undefined, lastFrameAssetId: undefined })}
                        title={nextShot ? 'Volver al frame de la toma siguiente' : 'Quitar el frame final'}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            <PromptField
              label="Prompt del video"
              value={shot.videoPrompt || ''}
              onChange={(videoPrompt) => updateShot(shot.id, { videoPrompt })}
              placeholder={[shot.cameraMovement, shot.actionPrompt].filter(Boolean).join('. ') || 'Movimiento de cámara y acción…'}
              rows={3}
              disabled={busyVideo}
            />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Control label="Duración">
                <select
                  value={duration}
                  onChange={(e) => updateShot(shot.id, { estimatedDuration: Number(e.target.value) })}
                  className="h-7 px-2 rounded-pill bg-surface-soft border border-hairline text-meta text-ink outline-none cursor-pointer"
                >
                  {(DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b)).map((d) => (
                    <option key={d} value={d}>{d}s</option>
                  ))}
                </select>
              </Control>
              {continuity && (
                <span className="inline-flex items-center gap-1 text-meta text-ink-subtle" title="El clip anterior se usa como referencia de continuidad">
                  <Video size={11} /> Continúa {continuity}
                  {explicitRef && (
                    <button
                      type="button"
                      onClick={() => updateShot(shot.id, { videoRefUrl: undefined, videoRefLocalPath: undefined, videoRefAssetId: undefined, videoRefName: undefined })}
                      className="text-ink-subtle hover:text-ink"
                      aria-label="Quitar la continuidad"
                    >
                      <X size={11} />
                    </button>
                  )}
                </span>
              )}
            </div>
          </>
        )}

        <div className="pt-3 border-t border-hairline space-y-3">
          <PromptField
            label="Acción"
            value={shot.actionPrompt || ''}
            onChange={(actionPrompt) => updateShot(shot.id, { actionPrompt })}
            placeholder="Qué pasa en la toma…"
            rows={2}
          />

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-meta text-ink-subtle">Elementos</span>
              <LinkPicker shot={shot} characters={characters} scenarios={scenarios} props={props} updateShot={updateShot} />
            </div>
            {refs.length === 0 ? (
              <p className="text-meta text-ink-subtle">Sin elementos vinculados.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {refs.map((r) => (
                  <span key={`${r.kind}-${r.id}`} className="inline-flex items-center gap-1.5 h-7 pl-0.5 pr-2.5 rounded-pill bg-surface-soft border border-hairline text-meta text-ink max-w-full">
                    <span className="size-6 rounded-full bg-surface-800 overflow-hidden flex items-center justify-center font-mono text-[9px] text-ink-muted flex-shrink-0">
                      {r.imageUrl ? <img src={srcUrl(r.imageUrl)} alt="" className="w-full h-full object-cover" /> : r.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="truncate">{r.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {hasDialogue ? (
            <DialogueRow
              shot={shot}
              characters={characters}
              updateShot={updateShot}
              onGenerateAudio={(text) => generateShotVoice(shot.id, text)}
            />
          ) : (
            <button
              type="button"
              onClick={() => updateShot(shot.id, { dialogueText: ' ' })}
              className="w-full h-8 rounded-xl border border-dashed border-surface-700 text-meta text-ink-subtle hover:text-ink hover:border-surface-500 flex items-center justify-center gap-1 transition-colors"
            >
              <Plus size={11} /> Diálogo
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}

// ───────────────────── Stage ─────────────────────

export function Stage3Shots() {
  const {
    characters,
    scenarios,
    props,
    shots,
    imageModel,
    imageResolution,
    videoModel,
    videoResolution,
    voiceModel,
    aspectRatio,
    visualStyle,
    isSequentialVideoGen,
    videoGenBatchSize,
    setImageModel,
    setVideoModel,
    setVoiceModel,
    setIsSequentialVideoGen,
    setVideoGenBatchSize,
    setMetadata,
    updateShot,
    duplicateShot,
    removeShot,
    reorderShots,
    generateShotKeyframe,
    generateAllKeyframes,
    regenerateShotKeyframePrompt,
    regenerateAllKeyframePrompts,
    generateShotVoice,
    generateAllVoices,
    generateShotVideo,
    generateAllVideos,
    restoreShotKeyframe,
    restoreShotVideo,
    trackImageTask,
    syncPendingTasks,
    setStage,
  } = useShortDramaStore()

  useEffect(() => {
    syncPendingTasks()
  }, [syncPendingTasks])

  const [view, setView] = useState<ShotView>(() => (shots.some(hasVideo) ? 'video' : 'frame'))
  const [tab, setTab] = useState<ShotView>(view)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [picker, setPicker] = useState<{ shotId: string; slot: 'keyframe' | 'lastFrame' } | null>(null)
  const [previewShotId, setPreviewShotId] = useState<string | null>(null)
  const [history, setHistory] = useState<{ shotId: string; kind: 'image' | 'video' } | null>(null)
  const [composer, setComposer] = useState<{ shotId: string; title: string; basePrompt: string; refs: ComposerRef[] } | null>(null)
  const [rewritingIds, setRewritingIds] = useState<Set<string>>(new Set())
  const [rewritingAll, setRewritingAll] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  const ordered = useMemo(() => [...shots].sort((a, b) => a.order - b.order), [shots])
  const shotsWithFrames = useMemo(() => ordered.filter((s) => s.keyframeUrl), [ordered])
  const missingFrames = shots.filter((s) => !s.keyframeUrl && !s.keyframeGenerating).length
  const dialogueShots = shots.filter((s) => s.dialogueText && s.dialogueText.trim())
  const audioDone = dialogueShots.filter((s) => s.audioStatus === 'completed').length
  const isAnyAudioGenerating = dialogueShots.some((s) => s.audioStatus === 'generating')
  const isAnyFrameGenerating = shots.some((s) => s.keyframeGenerating)
  const isAnyVideoGenerating = shots.some(isVideoBusy)
  const pendingVideos = shots.filter((s) => s.videoStatus !== 'completed' || (!s.videoUrl && !s.videoLocalPath && !s.videoAssetId)).length
  const modalOpen = Boolean(picker || previewShotId || history || composer)

  const selectedIndex = selectedId ? ordered.findIndex((s) => s.id === selectedId) : -1
  const selected = selectedIndex >= 0 ? ordered[selectedIndex] : null

  useEffect(() => {
    if (!selected || modalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, modalOpen])

  const changeView = (next: ShotView) => {
    setView(next)
    setTab(next)
  }

  const select = (id: string) => {
    if (id === selectedId) {
      setSelectedId(null)
      return
    }
    setSelectedId(id)
    setTab(view)
  }

  const rewrite = async (shotId: string) => {
    setRewritingIds((prev) => new Set(prev).add(shotId))
    try {
      await regenerateShotKeyframePrompt(shotId)
    } catch (err) {
      console.error('[Stage3] Prompt rewrite failed:', err)
    } finally {
      setRewritingIds((prev) => {
        const next = new Set(prev)
        next.delete(shotId)
        return next
      })
    }
  }

  const rewriteAll = async () => {
    setRewritingAll(true)
    try {
      await regenerateAllKeyframePrompts()
    } catch (err) {
      console.error('[Stage3] Rewriting all prompts failed:', err)
    } finally {
      setRewritingAll(false)
    }
  }

  const openComposer = async (shot: DramaShot, refs: LinkedRef[]) => {
    const images = await readComposerRefs(refs.map((r) => r.imageAssetId))
    setComposer({
      shotId: shot.id,
      title: `Toma ${shot.order}`,
      basePrompt: shot.keyframePrompt || shot.actionPrompt || '',
      refs: images,
    })
  }

  /** In sequence mode a model that takes video refs continues from the previous clip */
  const chainSource = (shot: DramaShot): DramaShot | undefined => {
    if (!isSequentialVideoGen || !videoModel.supportsVideoRef) return undefined
    if (shot.videoRefUrl || shot.videoRefLocalPath || shot.videoRefAssetId) return undefined
    const prev = ordered.find((s) => s.order === shot.order - 1)
    return prev && hasVideo(prev) ? prev : undefined
  }

  const generateVideo = (shot: DramaShot) => {
    const prev = chainSource(shot)
    generateShotVideo(
      shot.id,
      prev
        ? { videoRefs: [{ url: prev.videoUrl, localPath: prev.videoLocalPath, assetId: prev.videoAssetId, name: `Toma ${prev.order}`, mime: 'video/mp4' }] }
        : undefined,
    )
  }

  const handleReorderDrop = (targetId: string, e: React.DragEvent) => {
    const sourceId = e.dataTransfer.getData('application/x-drama-shot-id')
    setDraggedId(null)
    setOverId(null)
    if (!sourceId || sourceId === targetId) return
    e.preventDefault()
    const from = shots.findIndex((s) => s.id === sourceId)
    const to = shots.findIndex((s) => s.id === targetId)
    if (from !== -1 && to !== -1) reorderShots(from, to)
  }

  const previewIndex = previewShotId ? shotsWithFrames.findIndex((s) => s.id === previewShotId) : -1
  const previewShot = previewIndex >= 0 ? shotsWithFrames[previewIndex] : null
  const historyShot = history ? shots.find((s) => s.id === history.shotId) : undefined
  const tileWidth = aspectRatio === '9:16' || aspectRatio === '3:4' || aspectRatio === '4:5' ? 132 : 200

  return (
    <div className="h-full flex overflow-hidden">
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          <StageHeader
            stage={3}
            title="Tomas"
            description="Cada toma nace como frame y se convierte en video. Haz click en una toma para ver sus opciones."
          >
            <Segmented value={view} onChange={changeView} options={VIEW_OPTIONS} />
            <button
              onClick={() => setShowSettings((v) => !v)}
              className={`btn-icon size-8 ${showSettings ? 'bg-surface-soft text-ink' : ''}`}
              title={showSettings ? 'Ocultar ajustes' : 'Modelos y ajustes'}
              aria-pressed={showSettings}
            >
              <SlidersHorizontal size={13} />
            </button>
            {view === 'frame' ? (
              <button onClick={() => generateAllKeyframes(true)} disabled={missingFrames === 0} className="btn-primary flex items-center gap-1.5">
                <Sparkles size={13} />
                {missingFrames > 0 ? `Generar frames · ${missingFrames}` : isAnyFrameGenerating ? 'Generando…' : 'Frames listos'}
              </button>
            ) : (
              <button onClick={() => generateAllVideos()} disabled={isAnyVideoGenerating || pendingVideos === 0} className="btn-primary flex items-center gap-1.5">
                {isAnyVideoGenerating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {pendingVideos === 0 ? 'Videos listos' : `Generar videos · ${pendingVideos}`}
              </button>
            )}
          </StageHeader>

          {showSettings && (
            <ControlBar>
              {view === 'frame' ? (
                <>
                  <Control label="Modelo">
                    <ModelSelectorDropdown
                      kind="image"
                      selectedModelId={imageModel.t2iId || imageModel.name}
                      onSelect={(m) => setImageModel(m)}
                      resolution={imageResolution}
                    />
                  </Control>
                  <Control label="Resolución">
                    <ResolutionSelector model={imageModel} value={imageResolution} onChange={(res) => setImageModel(imageModel, res)} />
                  </Control>
                </>
              ) : (
                <>
                  <Control label="Modelo">
                    <ModelSelectorDropdown
                      kind="video"
                      selectedModelId={videoModel.t2vId || videoModel.name}
                      onSelect={(m) => setVideoModel(m)}
                      resolution={videoResolution}
                    />
                  </Control>
                  <Control label="Resolución">
                    <ResolutionSelector model={videoModel} value={videoResolution} onChange={(res) => setVideoModel(videoModel, res)} />
                  </Control>
                </>
              )}
              <Control label="Formato">
                <AspectRatioSelector value={aspectRatio} onChange={(r) => setMetadata({ aspectRatio: r })} compact />
              </Control>
              {view === 'frame' ? (
                <>
                  <Control label="Voz">
                    <ModelSelectorDropdown kind="audio" selectedModelId={voiceModel.t2aId || voiceModel.name} onSelect={(m) => setVoiceModel(m)} />
                  </Control>
                  <div className="flex items-center gap-2 ml-auto">
                    <button onClick={rewriteAll} disabled={rewritingAll || isAnyFrameGenerating || shots.length === 0} className="btn-secondary flex items-center gap-1.5">
                      {rewritingAll ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                      Reescribir prompts
                    </button>
                    {dialogueShots.length > 0 && (
                      <button
                        onClick={() => generateAllVoices(true)}
                        disabled={isAnyAudioGenerating || audioDone === dialogueShots.length}
                        className="btn-secondary flex items-center gap-1.5"
                      >
                        {isAnyAudioGenerating ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />}
                        Voces · {audioDone}/{dialogueShots.length}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <label
                    className="flex items-center gap-2 cursor-pointer"
                    title="Genera las tomas en orden y, si el modelo lo admite, usa el clip anterior como referencia de continuidad"
                  >
                    <Switch checked={isSequentialVideoGen} onCheckedChange={setIsSequentialVideoGen} />
                    <span className="eyebrow">Secuencia</span>
                  </label>
                  <Control label="Lote">
                    <select
                      disabled={isSequentialVideoGen}
                      value={videoGenBatchSize}
                      onChange={(e) => setVideoGenBatchSize(Number(e.target.value))}
                      title={isSequentialVideoGen ? 'En secuencia las tomas se generan de una en una' : 'Tomas que se generan a la vez'}
                      className="h-7 px-2 rounded-pill bg-surface-soft border border-hairline text-meta text-ink outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </Control>
                </>
              )}
            </ControlBar>
          )}

          {shots.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-body text-ink">Todavía no hay tomas</p>
              <p className="text-meta text-ink-subtle mt-1">Escribe el guión en la etapa 1 para crear las tomas.</p>
              <button onClick={() => setStage(1)} className="btn-secondary mt-4">Ir al guión</button>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileWidth}px, 1fr))` }}>
              {ordered.map((shot) => (
                <ShotTile
                  key={shot.id}
                  shot={shot}
                  view={view}
                  aspectRatio={aspectRatio}
                  selected={shot.id === selectedId}
                  dragState={draggedId === shot.id ? 'dragging' : overId === shot.id ? 'over' : 'idle'}
                  onSelect={() => select(shot.id)}
                  onReorderDragStart={(e) => {
                    e.dataTransfer.setData('application/x-drama-shot-id', shot.id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggedId(shot.id)
                  }}
                  onReorderDragOver={(e) => {
                    if (!e.dataTransfer.types.includes('application/x-drama-shot-id')) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (overId !== shot.id) setOverId(shot.id)
                  }}
                  onReorderDrop={(e) => handleReorderDrop(shot.id, e)}
                  onReorderDragEnd={() => { setDraggedId(null); setOverId(null) }}
                />
              ))}
            </div>
          )}

          <StageFooter
            back={{ label: 'Elenco', onClick: () => setStage(2) }}
            next={{ label: 'Siguiente: ensamblaje', onClick: () => setStage(5) }}
          />
        </div>
      </div>

      {selected && (
        <ShotInspector
          key={selected.id}
          shot={selected}
          nextShot={ordered.find((s) => s.order === selected.order + 1)}
          chainFrom={chainSource(selected)}
          characters={characters}
          scenarios={scenarios}
          props={props}
          aspectRatio={aspectRatio}
          videoModelName={cleanModelName(videoModel.name)}
          tab={tab}
          onTab={setTab}
          rewriting={rewritingIds.has(selected.id) || rewritingAll}
          onClose={() => setSelectedId(null)}
          onPrev={selectedIndex > 0 ? () => setSelectedId(ordered[selectedIndex - 1].id) : undefined}
          onNext={selectedIndex < ordered.length - 1 ? () => setSelectedId(ordered[selectedIndex + 1].id) : undefined}
          onGenerateFrame={() => generateShotKeyframe(selected.id)}
          onPersonalize={(refs) => openComposer(selected, refs)}
          onRewrite={() => rewrite(selected.id)}
          onLibrary={(slot) => setPicker({ shotId: selected.id, slot })}
          onFrameHistory={() => setHistory({ shotId: selected.id, kind: 'image' })}
          onVideoHistory={() => setHistory({ shotId: selected.id, kind: 'video' })}
          onPreview={() => setPreviewShotId(selected.id)}
          onGenerateVideo={() => generateVideo(selected)}
          generateShotVoice={generateShotVoice}
          updateShot={updateShot}
          duplicateShot={duplicateShot}
          removeShot={(id) => { removeShot(id); setSelectedId(null) }}
        />
      )}

      {picker && (
        <ImageLibraryPicker
          multiple={false}
          onSelect={(picked: any) => {
            const asset = Array.isArray(picked) ? picked[0] : picked
            const url = assetLocation(asset)
            if (asset && url) {
              updateShot(
                picker.shotId,
                picker.slot === 'keyframe'
                  ? { keyframeAssetId: asset.id, keyframeUrl: url }
                  : { lastFrameAssetId: asset.id, lastFrameUrl: url },
              )
            }
            setPicker(null)
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {history && historyShot && (
        <GenerationHistoryModal
          isOpen
          onClose={() => setHistory(null)}
          title={`Toma ${historyShot.order}`}
          kind={history.kind}
          activeUrl={history.kind === 'image' ? historyShot.keyframeUrl : historyShot.videoUrl}
          activeAssetId={history.kind === 'image' ? historyShot.keyframeAssetId : historyShot.videoAssetId}
          history={(history.kind === 'image' ? historyShot.keyframeHistory : historyShot.videoHistory) || []}
          onRestore={(item) => (history.kind === 'image' ? restoreShotKeyframe(historyShot.id, item.id) : restoreShotVideo(historyShot.id, item.id))}
        />
      )}

      {composer && (
        <QuickPromptComposer
          title={composer.title}
          basePrompt={composer.basePrompt}
          imageRefs={composer.refs.length ? composer.refs : undefined}
          aspectRatio={aspectRatio}
          resolution={composerResolution(imageResolution)}
          styleSuffix={visualStyle}
          onTaskCreated={(taskId) => {
            trackImageTask('keyframe', composer.shotId, taskId)
            setComposer(null)
          }}
          onGenerated={() => { /* the store follows the task */ }}
          onClose={() => setComposer(null)}
        />
      )}

      {previewShot && (
        <ImagePreviewModal
          src={srcUrl(previewShot.keyframeUrl) || ''}
          onClose={() => setPreviewShotId(null)}
          onPrev={previewIndex > 0 ? () => setPreviewShotId(shotsWithFrames[previewIndex - 1].id) : undefined}
          onNext={previewIndex < shotsWithFrames.length - 1 ? () => setPreviewShotId(shotsWithFrames[previewIndex + 1].id) : undefined}
        >
          <div className="space-y-4">
            <div>
              <p className="eyebrow mb-1">Toma {previewShot.order} · ~{previewShot.estimatedDuration}s</p>
              <p className="text-sm text-ink">{previewShot.cameraMovement || 'Plano'}</p>
            </div>
            <div>
              <p className="eyebrow mb-1">Acción</p>
              <p className="text-sm text-ink leading-relaxed select-text">{previewShot.actionPrompt || '—'}</p>
            </div>
            {previewShot.dialogueText?.trim() && (
              <div>
                <p className="eyebrow mb-1">Diálogo</p>
                <p className="text-sm text-ink leading-relaxed">
                  <span className="font-emphasis">{previewShot.dialogueSpeaker || 'Narrador'}:</span> {previewShot.dialogueText}
                </p>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="eyebrow">Prompt del frame</p>
                <button
                  onClick={() => {
                    copyText(previewShot.keyframePrompt || '')
                    setCopiedPrompt(true)
                    setTimeout(() => setCopiedPrompt(false), 1500)
                  }}
                  className="btn-icon size-7"
                  title="Copiar prompt"
                >
                  {copiedPrompt ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
              <p className="text-sm text-ink leading-relaxed select-text">{previewShot.keyframePrompt || '—'}</p>
            </div>
          </div>
        </ImagePreviewModal>
      )}
    </div>
  )
}
