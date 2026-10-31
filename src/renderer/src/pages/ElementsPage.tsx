import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Search, Plus, Trash2, X, ChevronLeft, Wand2, Library, Upload, ImagePlus, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useElementsStore,
  type ElementKind,
  type ElementSlot,
  type MediaRef,
  type StudioElement,
  KIND_CONFIG,
  MAX_REFERENCES,
  b64Mime,
  b64Src,
} from '../stores/elements-store'
import { TagEditor } from '../components/ui/TagEditor'
import { ToolButton } from '../components/ui/tool-button'
import { QuickPromptComposer } from '../components/QuickPromptComposer'
import { ImagePreviewModal } from '../components/ui/ImagePreviewModal'
import { ImageLibraryPicker } from '../components/ImageLibraryPicker'
import { ElementWizard } from '../components/ElementWizard'
import { ELEMENT_PROPERTIES, KIND_ICONS, KIND_ORDER } from '../lib/element-config'
import { filesToRefs, type MediaKind } from '../lib/element-references'

// ───────────────────── Generation prompts ─────────────────────

const CHARACTER_PRIMARY_PROMPT = 'high quality character portrait, front facing, centered composition, clean lighting, detailed features, professional rendering'

const PRIMARY_BASE_PROMPTS: Record<ElementKind, string> = {
  avatar: CHARACTER_PRIMARY_PROMPT,
  character: CHARACTER_PRIMARY_PROMPT,
  environment: 'establishing shot of a location, wide composition, cinematic lighting, rich environmental detail, no people',
  object: 'single object product shot, centered composition, clean neutral background, soft studio lighting, detailed materials',
}

const POSE_BASE_PROMPT = 'character turnaround sheet, front view, side view, back view, full body standing pose, orthographic reference, white background, consistent lighting, same character design'

const MOODBOARD_BASE_PROMPT = 'concept art reference, detailed illustration, same subject, cohesive style, professional quality'

/** Aspect ratio of the primary render per kind (composer value + CSS value) */
const PRIMARY_ASPECT: Record<ElementKind, { ar: string; css: string }> = {
  avatar: { ar: '3:4', css: '3 / 4' },
  character: { ar: '3:4', css: '3 / 4' },
  environment: { ar: '16:9', css: '16 / 9' },
  object: { ar: '1:1', css: '1 / 1' },
}

const FIELD_PLACEHOLDERS: Record<ElementKind, { description: string; prompt: string }> = {
  avatar: { description: 'Rasgos físicos, personalidad e identificadores visuales…', prompt: 'Ej. pelo corto platino, sudadera oversize, sonrisa amplia' },
  character: { description: 'Rasgos físicos, origen e identificadores visuales…', prompt: 'Ej. pelo rizado castaño, chaqueta de cuero gastada, cicatriz en la ceja izquierda' },
  environment: { description: 'Ubicación, época, atmósfera y elementos característicos…', prompt: 'Ej. calles mojadas, letreros de neón, niebla baja' },
  object: { description: 'Forma, materiales, tamaño y detalles distintivos…', prompt: 'Ej. latón envejecido, grabado floral, cristal rayado' },
}

interface BasePrompts {
  primary: string | null
  pose: string
  moodboard: string
}

/** What the element looks like, built from its description, prompt and attributes */
function subjectPrompt(el: StudioElement): string {
  const labels = new Map(ELEMENT_PROPERTIES[el.kind].map((p) => [p.key, p.label.toLowerCase()]))
  const attrs = Object.entries(el.properties || {})
    .filter(([k, v]) => k !== 'style' && v)
    .map(([k, v]) => `${labels.get(k) || k}: ${v}`)
    .join(', ')
  const parts = [el.description.trim(), el.prompt.trim(), attrs].filter(Boolean)
  return parts.length ? parts.join('. ') : el.name
}

function styleOf(el: StudioElement): string {
  return el.style || el.properties?.style || ''
}

// ───────────────────── Media input helpers ─────────────────────

interface PickedRef extends MediaRef {
  prompt?: string
}

async function assetsToRefs(assets: any[], accept: MediaKind): Promise<PickedRef[]> {
  const list = assets
    .map((a) => (typeof a === 'string' ? { id: a } : a))
    .filter((a) => a?.id && (!a.type || a.type === accept))
  if (list.length === 0) return []
  try {
    const results = await (window as any).electronAPI?.assets.readBase64(list.map((a) => a.id))
    const byId = new Map<string, string>((results || []).map((r: any) => [r.id, r.base64]))
    return list
      .map((a) => ({ base64: byId.get(a.id) || '', assetId: a.id, prompt: a.prompt }))
      .filter((r) => r.base64)
  } catch (err) {
    console.error('[ElementsPage] Failed to read library assets:', err)
    return []
  }
}

/** Library drags carry asset JSON; desktop drags carry files */
async function refsFromDrop(dt: DataTransfer, accept: MediaKind): Promise<PickedRef[]> {
  const json = dt.getData('application/x-openfield-assets') || dt.getData('application/x-openfield-asset')
  if (json) {
    try {
      const parsed = JSON.parse(json)
      return assetsToRefs(Array.isArray(parsed) ? parsed : [parsed], accept)
    } catch { /* fall through to files */ }
  }
  return filesToRefs(Array.from(dt.files || []), accept)
}

function useDropZone(onDrop: (dt: DataTransfer) => void, enabled = true) {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const handlers = enabled ? {
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); depth.current++; setOver(true) },
    onDragOver: (e: React.DragEvent) => { e.preventDefault() },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault()
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setOver(false)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      depth.current = 0
      setOver(false)
      onDrop(e.dataTransfer)
    },
  } : {}
  return { over, handlers }
}

// ───────────────────── Small building blocks ─────────────────────

function Section({
  title,
  meta,
  action,
  children,
}: {
  title: string
  meta?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3 min-h-7">
        <div className="flex items-baseline gap-2">
          <h3 className="eyebrow">{title}</h3>
          {meta && <span className="font-mono text-eyebrow text-ink-subtle">{meta}</span>}
        </div>
        {action && <div className="flex items-center gap-1">{action}</div>}
      </div>
      {children}
    </section>
  )
}

function PendingOverlay({ label = 'Generando…', onDiscard }: { label?: string; onDiscard?: () => void }) {
  return (
    <div className="absolute inset-0 bg-canvas/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
      <Loader2 size={18} className="animate-spin text-ink" />
      <span className="text-meta text-ink-muted">{label}</span>
      {onDiscard && (
        <button onClick={onDiscard} className="text-meta text-ink-subtle hover:text-ink underline underline-offset-2">
          Dejar de esperar
        </button>
      )}
    </div>
  )
}

interface MediaSlotProps {
  src?: string
  isVideo?: boolean
  aspect: string
  fit?: 'cover' | 'contain'
  accept: MediaKind
  emptyLabel: string
  emptyHint?: string
  pending?: boolean
  onDiscardPending?: () => void
  onRefs: (refs: PickedRef[]) => void
  onPreview?: () => void
  onLibrary: () => void
  onGenerate?: () => void
  /** Why generating is unavailable (disables the button) */
  generateBlocked?: string
  onRemove?: () => void
  /** Reports pointer hover so a Ctrl+V lands in this slot */
  onHoverChange?: (over: boolean) => void
}

function MediaSlot({
  src, isVideo, aspect, fit = 'cover', accept, emptyLabel, emptyHint, pending, onDiscardPending,
  onRefs, onPreview, onLibrary, onGenerate, generateBlocked, onRemove, onHoverChange,
}: MediaSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { over, handlers } = useDropZone(async (dt) => {
    const refs = await refsFromDrop(dt, accept)
    if (refs.length) onRefs(refs.slice(0, 1))
  }, !pending)

  return (
    <div onMouseEnter={() => onHoverChange?.(true)} onMouseLeave={() => onHoverChange?.(false)}>
      <div
        {...handlers}
        style={{ aspectRatio: aspect }}
        className={`relative rounded-2xl overflow-hidden bg-surface-soft border transition-colors ${
          over ? 'border-ink' : src ? 'border-hairline' : 'border-dashed border-surface-700'
        }`}
      >
        {src ? (
          isVideo ? (
            <video src={src} className="w-full h-full object-cover" controls />
          ) : (
            <button type="button" onClick={onPreview} className="block w-full h-full cursor-zoom-in" aria-label="Ver en grande">
              <img src={src} alt="" className={`w-full h-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`} />
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center text-ink-subtle hover:text-ink transition-colors"
          >
            <ImagePlus size={20} strokeWidth={1.5} />
            <span className="text-body font-emphasis text-ink mt-1">{emptyLabel}</span>
            <span className="text-meta">{emptyHint || 'Arrastra un archivo, súbelo o elígelo de la biblioteca'}</span>
            <span className="font-mono text-eyebrow uppercase text-ink-subtle mt-1">Ctrl+V para pegar</span>
          </button>
        )}
        {pending && <PendingOverlay onDiscard={onDiscardPending} />}
        {over && (
          <div className="absolute inset-0 bg-canvas/60 flex items-center justify-center pointer-events-none">
            <span className="px-3 py-1 rounded-pill bg-accent-600 text-on-accent text-meta font-emphasis">Soltar para usar</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 mt-2 -ml-1">
        <ToolButton icon={Upload} onClick={() => inputRef.current?.click()} disabled={pending}>
          {src ? 'Reemplazar' : 'Subir'}
        </ToolButton>
        <ToolButton icon={Library} onClick={onLibrary} disabled={pending}>Biblioteca</ToolButton>
        {onGenerate && (
          <ToolButton icon={Wand2} onClick={onGenerate} disabled={pending || !!generateBlocked} title={generateBlocked}>
            {src ? 'Regenerar' : 'Generar'}
          </ToolButton>
        )}
        <div className="flex-1" />
        {src && onRemove && !pending && (
          <button type="button" onClick={onRemove} className="btn-icon size-7 bg-transparent" title="Quitar">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={`${accept}/*`}
        className="hidden"
        onChange={async (e) => {
          const refs = await filesToRefs(Array.from(e.target.files || []), accept)
          e.target.value = ''
          if (refs.length) onRefs(refs.slice(0, 1))
        }}
      />
    </div>
  )
}

// ───────────────────── Moodboard ─────────────────────

function Moodboard({
  element,
  pendingCount,
  onAdd,
  onRemove,
  onPreview,
  onLibrary,
  onGenerate,
  onHoverChange,
}: {
  element: StudioElement
  pendingCount: number
  onAdd: (refs: PickedRef[]) => void
  onRemove: (index: number) => void
  onPreview: (index: number) => void
  onLibrary: () => void
  onGenerate: () => void
  onHoverChange?: (over: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const count = element.referenceImages.length
  const full = count + pendingCount >= MAX_REFERENCES
  const { over, handlers } = useDropZone(async (dt) => {
    const refs = await refsFromDrop(dt, 'image')
    if (refs.length) onAdd(refs)
  }, !full)

  return (
    <Section
      title="Moodboard"
      meta={`${count}/${MAX_REFERENCES}`}
      action={
        <>
          <ToolButton icon={Library} onClick={onLibrary} disabled={full}>Biblioteca</ToolButton>
          <ToolButton icon={Wand2} onClick={onGenerate} disabled={full}>Generar</ToolButton>
        </>
      }
    >
      <div
        {...handlers}
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
        className={`grid grid-cols-4 gap-2 rounded-2xl transition-shadow ${over ? 'ring-1 ring-ink ring-offset-4 ring-offset-canvas' : ''}`}
      >
        {element.referenceImages.map((img, i) => (
          <div key={element.referenceAssetIds[i] || i} className="group relative aspect-square rounded-xl overflow-hidden bg-surface-soft border border-hairline">
            <button type="button" onClick={() => onPreview(i)} className="block w-full h-full cursor-zoom-in" aria-label={`Ver referencia ${i + 1}`}>
              <img src={b64Src(img)} alt="" className="w-full h-full object-cover" />
            </button>
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute top-1.5 right-1.5 size-6 rounded-full bg-canvas/90 text-ink flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              title="Quitar"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {Array.from({ length: pendingCount }).map((_, i) => (
          <div key={`pending-${i}`} className="aspect-square rounded-xl bg-surface-soft border border-hairline flex items-center justify-center">
            <Loader2 size={16} className="animate-spin text-ink-muted" />
          </div>
        ))}
        {!full && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="aspect-square rounded-xl border border-dashed border-surface-700 text-ink-subtle hover:text-ink hover:border-surface-500 flex flex-col items-center justify-center gap-1 transition-colors"
            title="Subir imágenes"
          >
            <Plus size={16} />
            {count === 0 && <span className="text-meta">Añadir</span>}
          </button>
        )}
      </div>
      {count === 0 && pendingCount === 0 && (
        <p className="text-meta text-ink-subtle mt-2">Referencias de estilo, vestuario o paleta. Se usan para mantener la consistencia del elemento. Pega imágenes con Ctrl+V.</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const refs = await filesToRefs(Array.from(e.target.files || []), 'image')
          e.target.value = ''
          if (refs.length) onAdd(refs)
        }}
      />
    </Section>
  )
}

// ───────────────────── Element detail ─────────────────────

type PickerTarget = 'primary' | 'pose' | 'moodboard' | 'video' | 'hdri'
/** Slots a Ctrl+V can land in: the same ones the library picker fills */
type PasteTarget = PickerTarget

const PASTE_LABELS: Record<PasteTarget, string> = {
  primary: 'Render principal',
  pose: 'Pose de referencia',
  moodboard: 'Moodboard',
  video: 'Video de referencia',
  hdri: 'HDRI / 360',
}

type PreviewState = { kind: 'primary' } | { kind: 'pose' } | { kind: 'hdri' } | { kind: 'ref'; index: number }

const TEXT_FIELDS = ['name', 'description', 'prompt', 'voiceId'] as const
type TextDraft = Pick<StudioElement, typeof TEXT_FIELDS[number]>

function draftOf(el: StudioElement): TextDraft {
  return { name: el.name, description: el.description, prompt: el.prompt, voiceId: el.voiceId || '' }
}

function ElementDetail({
  element,
  basePrompts,
  initialComposer,
  onBack,
  onDelete,
}: {
  element: StudioElement
  basePrompts: BasePrompts
  initialComposer: ElementSlot | null
  onBack: () => void
  onDelete: () => void
}) {
  const updateElement = useElementsStore((s) => s.updateElement)
  const addReferences = useElementsStore((s) => s.addReferences)
  const removeReference = useElementsStore((s) => s.removeReference)
  const trackTask = useElementsStore((s) => s.trackTask)
  const cancelTask = useElementsStore((s) => s.cancelTask)
  const allPending = useElementsStore((s) => s.pending)
  const pending = useMemo(() => allPending.filter((p) => p.elementId === element.id), [allPending, element.id])
  const pendingOf = (slot: ElementSlot) => pending.filter((p) => p.slot === slot)

  const [composer, setComposer] = useState<ElementSlot | null>(initialComposer)
  const [picker, setPicker] = useState<PickerTarget | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)

  const update = (updates: Partial<StudioElement>) => updateElement(element.id, updates)

  // ── Text fields autosave (debounced, flushed on leave) ──
  const [draft, setDraft] = useState<TextDraft>(() => draftOf(element))
  const elementRef = useRef(element)
  elementRef.current = element
  const draftRef = useRef(draft)
  draftRef.current = draft

  const commitDraft = useCallback(() => {
    const el = elementRef.current
    const d = draftRef.current
    const changes: Partial<StudioElement> = {}
    for (const key of TEXT_FIELDS) {
      const value = key === 'name' ? d.name.trim() : d[key]
      if (key === 'name' && !value) continue
      if (value !== (el[key] || '')) changes[key] = value
    }
    if (Object.keys(changes).length) updateElement(el.id, changes)
  }, [updateElement])

  useEffect(() => {
    const t = setTimeout(commitDraft, 500)
    return () => clearTimeout(t)
  }, [draft, commitDraft])

  useEffect(() => () => commitDraft(), [commitDraft])

  const setField = (key: keyof TextDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }))

  // ── Media ──
  const setPrimary = (ref: PickedRef) => {
    const updates: Partial<StudioElement> = { imageBase64: ref.base64, imageAssetId: ref.assetId }
    if (ref.prompt && !draftRef.current.prompt.trim()) {
      updates.prompt = ref.prompt
      setDraft((d) => ({ ...d, prompt: ref.prompt! }))
    }
    update(updates)
  }

  const addRefs = (refs: PickedRef[]) => {
    const added = addReferences(element.id, refs)
    if (added < refs.length) toast.message(`El moodboard admite ${MAX_REFERENCES} imágenes`, { description: `Se añadieron ${added}.` })
  }

  // ── Paste (Ctrl+V): into the slot under the pointer, else the empty primary render, else the moodboard ──
  const hoverTarget = useRef<PasteTarget | null>(null)
  const hoverOf = (target: PasteTarget) => (over: boolean) => {
    if (over) hoverTarget.current = target
    else if (hoverTarget.current === target) hoverTarget.current = null
  }

  useEffect(() => {
    if (picker || composer || preview) return
    const onPaste = async (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
      if (files.length === 0) return
      // Typing in a field with text on the clipboard: a normal text paste
      const active = document.activeElement as HTMLElement | null
      const typing = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      if (typing && e.clipboardData?.types.includes('text/plain')) return
      e.preventDefault()

      const el = elementRef.current
      const target: PasteTarget = hoverTarget.current || (el.imageBase64 ? 'moodboard' : 'primary')
      const slot: ElementSlot | null = target === 'primary' || target === 'pose' || target === 'moodboard' ? target : null
      if (slot && pendingOf(slot).length > 0 && target !== 'moodboard') {
        toast.message(`${PASTE_LABELS[target]} se está generando`)
        return
      }
      const accept: MediaKind = target === 'video' ? 'video' : 'image'
      const refs = await filesToRefs(files, accept)
      if (refs.length === 0) {
        toast.error(accept === 'video' ? 'Aquí solo se puede pegar un vídeo' : 'El portapapeles no tiene una imagen')
        return
      }
      if (target === 'primary') setPrimary(refs[0])
      else if (target === 'pose') update({ poseRef: refs[0].base64, poseAssetId: '' })
      else if (target === 'video') update({ videoRef: refs[0].base64, videoAssetId: '' })
      else if (target === 'hdri') update({ hdriRef: refs[0].base64, hdriAssetId: '' })
      else addRefs(refs)
      toast.success(`Pegado en ${PASTE_LABELS[target]}`)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  const handlePicked = async (selected: any) => {
    const target = picker
    setPicker(null)
    if (!target) return
    const items = Array.isArray(selected) ? selected : [selected]
    const refs = await assetsToRefs(items, target === 'video' ? 'video' : 'image')
    if (refs.length === 0) return
    const [first] = refs
    if (target === 'primary') setPrimary(first)
    else if (target === 'pose') update({ poseRef: first.base64, poseAssetId: first.assetId })
    else if (target === 'video') update({ videoRef: first.base64, videoAssetId: first.assetId })
    else if (target === 'hdri') update({ hdriRef: first.base64, hdriAssetId: first.assetId })
    else addRefs(refs)
  }

  // ── Generation (QuickPromptComposer) ──
  const subject = subjectPrompt(element)
  const primaryBase = basePrompts.primary && (element.kind === 'avatar' || element.kind === 'character')
    ? basePrompts.primary
    : PRIMARY_BASE_PROMPTS[element.kind]

  const composerConfig = (slot: ElementSlot) => {
    const refs = [
      ...(element.imageBase64 ? [{ base64: element.imageBase64, mime: b64Mime(element.imageBase64) }] : []),
      ...(element.poseRef ? [{ base64: element.poseRef, mime: b64Mime(element.poseRef) }] : []),
    ]
    if (slot === 'pose') {
      return {
        title: `Pose · ${element.name}`,
        basePrompt: basePrompts.pose,
        promptLocked: true,
        referenceImage: element.imageBase64 || undefined,
        referenceMime: element.imageBase64 ? b64Mime(element.imageBase64) : undefined,
        aspectRatio: '16:9',
        aspectRatioLocked: true,
      }
    }
    if (slot === 'moodboard') {
      return {
        title: `Moodboard · ${element.name}`,
        basePrompt: `${basePrompts.moodboard}\n\n${subject}`,
        imageRefs: refs.length ? refs : undefined,
        aspectRatio: '3:4',
      }
    }
    return {
      title: `Render principal · ${element.name}`,
      basePrompt: `${primaryBase}\n\n${subject}`,
      aspectRatio: PRIMARY_ASPECT[element.kind].ar,
    }
  }

  const isPerson = element.kind === 'avatar' || element.kind === 'character'
  const isEnvironment = element.kind === 'environment'
  const KindIcon = KIND_ICONS[element.kind]

  const previewSrc = !preview ? undefined
    : preview.kind === 'primary' ? b64Src(element.imageBase64)
      : preview.kind === 'pose' ? b64Src(element.poseRef)
        : preview.kind === 'hdri' ? b64Src(element.hdriRef)
          : b64Src(element.referenceImages[preview.index])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 px-4 h-12 border-b border-hairline flex-shrink-0">
        <button onClick={() => { commitDraft(); onBack() }} className="btn-ghost flex items-center gap-1 text-meta">
          <ChevronLeft size={14} /> Elements
        </button>
        <div className="flex items-center gap-3">
          {pending.length > 0 && (
            <span className="flex items-center gap-1.5 text-meta text-ink-muted">
              <Loader2 size={12} className="animate-spin" />
              {pending.length === 1 ? '1 generación en curso' : `${pending.length} generaciones en curso`}
            </span>
          )}
          <button onClick={onDelete} className="btn-icon size-7" title="Eliminar elemento">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 grid gap-10 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          {/* Primary render */}
          <aside className="lg:sticky lg:top-8 self-start">
            <Section title="Render principal">
              <MediaSlot
                src={b64Src(element.imageBase64)}
                aspect={PRIMARY_ASPECT[element.kind].css}
                accept="image"
                emptyLabel="Añade el render principal"
                emptyHint="La imagen de referencia que define al elemento"
                pending={pendingOf('primary').length > 0}
                onDiscardPending={() => pendingOf('primary').forEach((p) => cancelTask(p.taskId))}
                onRefs={([ref]) => setPrimary(ref)}
                onPreview={() => setPreview({ kind: 'primary' })}
                onLibrary={() => setPicker('primary')}
                onGenerate={() => setComposer('primary')}
                onRemove={() => update({ imageBase64: '', imageAssetId: '' })}
                onHoverChange={hoverOf('primary')}
              />
            </Section>
          </aside>

          <main className="space-y-10 min-w-0">
            {/* Identity */}
            <div>
              <p className="eyebrow flex items-center gap-1.5">
                <KindIcon size={11} /> {KIND_CONFIG[element.kind].label}
              </p>
              <input
                value={draft.name}
                onChange={setField('name')}
                onBlur={commitDraft}
                placeholder="Nombre del elemento"
                className="w-full mt-1 bg-transparent border-0 outline-none text-[28px] leading-tight font-strong tracking-tight text-ink placeholder:text-ink-subtle"
              />
            </div>

            <Section title="Descripción">
              <div className="space-y-3">
                <textarea
                  value={draft.description}
                  onChange={setField('description')}
                  onBlur={commitDraft}
                  placeholder={FIELD_PLACEHOLDERS[element.kind].description}
                  rows={3}
                  className="input-field resize-none leading-relaxed"
                />
                <div>
                  <label className="text-meta text-ink-subtle mb-1.5 block">Prompt base · se añade al generar</label>
                  <textarea
                    value={draft.prompt}
                    onChange={setField('prompt')}
                    onBlur={commitDraft}
                    placeholder={FIELD_PLACEHOLDERS[element.kind].prompt}
                    rows={2}
                    className="input-field resize-none text-body"
                  />
                </div>
                <TagEditor tags={element.tags} onChange={(tags) => update({ tags })} />
              </div>
            </Section>


            {isPerson && (
              <Section title="Voz">
                <input
                  value={draft.voiceId}
                  onChange={setField('voiceId')}
                  onBlur={commitDraft}
                  placeholder="Voice ID de ElevenLabs"
                  className="input-field font-mono text-body"
                />
              </Section>
            )}

            {isPerson && (
              <Section title="Pose de referencia" meta="16:9">
                <MediaSlot
                  src={b64Src(element.poseRef)}
                  aspect="16 / 9"
                  fit="contain"
                  accept="image"
                  emptyLabel="Hoja de poses"
                  emptyHint="Vista frontal, lateral y trasera del personaje"
                  pending={pendingOf('pose').length > 0}
                  onDiscardPending={() => pendingOf('pose').forEach((p) => cancelTask(p.taskId))}
                  onRefs={([ref]) => update({ poseRef: ref.base64, poseAssetId: ref.assetId })}
                  onPreview={() => setPreview({ kind: 'pose' })}
                  onLibrary={() => setPicker('pose')}
                  onGenerate={() => setComposer('pose')}
                  generateBlocked={element.imageBase64 ? undefined : 'Primero añade el render principal'}
                  onRemove={() => update({ poseRef: '', poseAssetId: '' })}
                  onHoverChange={hoverOf('pose')}
                />
              </Section>
            )}

            <Moodboard
              element={element}
              pendingCount={pendingOf('moodboard').length}
              onAdd={addRefs}
              onRemove={(i) => removeReference(element.id, i)}
              onPreview={(index) => setPreview({ kind: 'ref', index })}
              onLibrary={() => setPicker('moodboard')}
              onGenerate={() => setComposer('moodboard')}
              onHoverChange={hoverOf('moodboard')}
            />

            {isEnvironment && (
              <div className="grid gap-6 sm:grid-cols-2">
                <Section title="Video de referencia">
                  <MediaSlot
                    src={element.videoRef ? (element.videoRef.startsWith('data:') ? element.videoRef : `data:video/mp4;base64,${element.videoRef}`) : undefined}
                    isVideo
                    aspect="16 / 9"
                    accept="video"
                    emptyLabel="Video del entorno"
                    emptyHint="MP4 de hasta 50 MB"
                    onRefs={([ref]) => update({ videoRef: ref.base64, videoAssetId: ref.assetId })}
                    onLibrary={() => setPicker('video')}
                    onRemove={() => update({ videoRef: '', videoAssetId: '' })}
                    onHoverChange={hoverOf('video')}
                  />
                </Section>
                <Section title="HDRI / 360" meta="2:1">
                  <MediaSlot
                    src={b64Src(element.hdriRef)}
                    aspect="2 / 1"
                    accept="image"
                    emptyLabel="Panorama 360"
                    emptyHint="Equirectangular en JPG o PNG"
                    onRefs={([ref]) => update({ hdriRef: ref.base64, hdriAssetId: ref.assetId })}
                    onPreview={() => setPreview({ kind: 'hdri' })}
                    onLibrary={() => setPicker('hdri')}
                    onRemove={() => update({ hdriRef: '', hdriAssetId: '' })}
                    onHoverChange={hoverOf('hdri')}
                  />
                </Section>
              </div>
            )}
          </main>
        </div>
      </div>

      {picker && (
        <ImageLibraryPicker
          multiple={picker === 'moodboard'}
          allowVideo={picker === 'video'}
          onSelect={handlePicked}
          onClose={() => setPicker(null)}
        />
      )}

      {composer && (
        <QuickPromptComposer
          key={composer}
          {...composerConfig(composer)}
          resolution="2K"
          styleSuffix={styleOf(element)}
          onTaskCreated={(taskId) => {
            trackTask(element.id, composer, taskId)
            setComposer(null)
          }}
          onGenerated={() => { /* results land through trackTask */ }}
          onClose={() => setComposer(null)}
        />
      )}

      {preview && previewSrc && (
        <ImagePreviewModal
          src={previewSrc}
          onClose={() => setPreview(null)}
          onPrev={preview.kind === 'ref' && preview.index > 0 ? () => setPreview({ kind: 'ref', index: preview.index - 1 }) : undefined}
          onNext={preview.kind === 'ref' && preview.index < element.referenceImages.length - 1 ? () => setPreview({ kind: 'ref', index: preview.index + 1 }) : undefined}
        >
          <div>
            <p className="eyebrow mb-1">Elemento</p>
            <p className="text-sm text-ink">{element.name || '—'}</p>
          </div>
          <div>
            <p className="eyebrow mb-1">Tipo</p>
            <p className="text-sm text-ink">{KIND_CONFIG[element.kind].label}</p>
          </div>
          {element.prompt && (
            <div>
              <p className="eyebrow mb-1">Prompt</p>
              <p className="text-sm text-ink leading-relaxed">{element.prompt}</p>
            </div>
          )}
        </ImagePreviewModal>
      )}
    </div>
  )
}

// ───────────────────── Delete confirmation ─────────────────────

function ConfirmDeleteElement({ element, onConfirm, onClose }: { element: StudioElement; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="modal-scrim z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="modal-surface w-full max-w-sm mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        <h2 className="text-title text-ink">¿Eliminar "{element.name}"?</h2>
        <p className="text-body text-ink-muted mt-2">
          El elemento deja de estar disponible para @menciones. Sus imágenes siguen en tu biblioteca.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn-ghost" autoFocus>Cancelar</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-pill text-sm font-emphasis bg-red-600 hover:bg-red-500 text-white transition-colors">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────── Elements page (grid) ─────────────────────

function ElementCard({ element, generating, onOpen, onDelete }: {
  element: StudioElement
  generating: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const Icon = KIND_ICONS[element.kind]
  return (
    <div className="group relative">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-surface-soft border border-hairline group-hover:border-surface-600 transition-colors">
          {element.imageBase64 ? (
            <img src={b64Src(element.imageBase64)} alt={element.name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ink-subtle">
              <Icon size={28} strokeWidth={1.25} />
            </div>
          )}
          {generating && (
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 h-6 px-2 rounded-pill bg-canvas/90 text-meta text-ink">
              <Loader2 size={11} className="animate-spin" /> Generando
            </span>
          )}
        </div>
        <div className="mt-2.5 px-0.5">
          <p className="text-body font-emphasis text-ink truncate">{element.name}</p>
          <p className="text-meta text-ink-subtle truncate">
            {KIND_CONFIG[element.kind].label}
            {element.tags.length > 0 && ` · ${element.tags.join(', ')}`}
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="absolute top-2 right-2 size-7 rounded-full bg-canvas/90 text-ink-muted hover:text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        title="Eliminar"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

export function ElementsPage() {
  const elements = useElementsStore((s) => s.elements)
  const loaded = useElementsStore((s) => s.loaded)
  const pending = useElementsStore((s) => s.pending)
  const deleteElement = useElementsStore((s) => s.deleteElement)
  const loadElements = useElementsStore((s) => s.loadElements)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<ElementKind | 'all'>('all')
  const [showWizard, setShowWizard] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<StudioElement | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openComposer, setOpenComposer] = useState<ElementSlot | null>(null)
  const [basePrompts, setBasePrompts] = useState<BasePrompts>({
    primary: null,
    pose: POSE_BASE_PROMPT,
    moodboard: MOODBOARD_BASE_PROMPT,
  })

  useEffect(() => { loadElements() }, [loadElements])

  // Base prompts configured in Settings → Elements
  useEffect(() => {
    const api = (window as any).electronAPI
    api?.settings?.getAll?.().then((settings: any) => {
      setBasePrompts({
        primary: settings?.['elements:primaryBasePrompt'] || null,
        pose: settings?.['elements:poseBasePrompt'] || POSE_BASE_PROMPT,
        moodboard: settings?.['elements:moodboardBasePrompt'] || MOODBOARD_BASE_PROMPT,
      })
    }).catch((err: any) => console.error('[ElementsPage] Failed to load settings:', err))
  }, [])

  const selectedElement = selectedId ? elements.find((e) => e.id === selectedId) || null : null

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return elements.filter((e) => {
      if (kindFilter !== 'all' && e.kind !== kindFilter) return false
      if (!q) return true
      return e.name.toLowerCase().includes(q)
        || e.description.toLowerCase().includes(q)
        || e.tags.some((t) => t.toLowerCase().includes(q))
    })
  }, [elements, search, kindFilter])

  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = { all: elements.length }
    for (const k of KIND_ORDER) counts[k] = elements.filter((e) => e.kind === k).length
    return counts
  }, [elements])

  const generatingIds = useMemo(() => new Set(pending.map((p) => p.elementId)), [pending])

  const handleDelete = () => {
    if (!confirmDelete) return
    deleteElement(confirmDelete.id)
    if (selectedId === confirmDelete.id) setSelectedId(null)
    setConfirmDelete(null)
  }

  const deleteModal = confirmDelete && (
    <ConfirmDeleteElement element={confirmDelete} onConfirm={handleDelete} onClose={() => setConfirmDelete(null)} />
  )

  if (selectedElement) {
    return (
      <>
        <ElementDetail
          key={selectedElement.id}
          element={selectedElement}
          basePrompts={basePrompts}
          initialComposer={openComposer}
          onBack={() => { setSelectedId(null); setOpenComposer(null) }}
          onDelete={() => setConfirmDelete(selectedElement)}
        />
        {deleteModal}
      </>
    )
  }

  const filters: { key: ElementKind | 'all'; label: string }[] = [
    { key: 'all', label: 'Todos' },
    ...KIND_ORDER.map((k) => ({ key: k, label: KIND_CONFIG[k].label })),
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="text-title-lg text-ink">Elements</h1>
              <p className="text-meta text-ink-subtle mt-1">
                Personajes, avatares, entornos y objetos reutilizables con @ en tus prompts
              </p>
            </div>
            <button onClick={() => setShowWizard(true)} className="btn-primary flex items-center gap-1.5 flex-shrink-0">
              <Plus size={14} /> Nuevo elemento
            </button>
          </div>

          {elements.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-8">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, descripción o tag"
                  className="w-full h-9 pl-9 pr-8 rounded-pill bg-surface-soft border border-hairline text-body text-ink placeholder:text-ink-subtle outline-none focus:border-accent-500 transition-colors"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink" title="Limpiar">
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 overflow-x-auto">
                {filters.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setKindFilter(key)}
                    className={`h-8 px-3 rounded-pill text-meta font-emphasis whitespace-nowrap transition-colors ${
                      kindFilter === key ? 'bg-accent-600 text-on-accent' : 'text-ink-muted hover:text-ink hover:bg-surface-800'
                    }`}
                  >
                    {label}
                    <span className={`ml-1.5 font-mono ${kindFilter === key ? 'opacity-60' : 'text-ink-subtle'}`}>{kindCounts[key] || 0}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loaded ? (
            <div className="flex justify-center py-24 text-ink-subtle">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : elements.length === 0 ? (
            <div className="block-lilac rounded-block p-10 sm:p-14 max-w-3xl">
              <p className="eyebrow !text-current opacity-70">Empieza aquí</p>
              <h2 className="text-[26px] leading-snug font-strong tracking-tight mt-2">Crea tu primer elemento</h2>
              <p className="text-body opacity-80 mt-2 max-w-md">
                Define un personaje, avatar, entorno u objeto una sola vez y reutilízalo con @ en cualquier prompt
                para mantener la consistencia entre imágenes y videos.
              </p>
              <button onClick={() => setShowWizard(true)} className="btn-primary mt-6 flex items-center gap-1.5">
                <Plus size={14} /> Nuevo elemento
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-body text-ink">Ningún elemento coincide con la búsqueda</p>
              <button onClick={() => { setSearch(''); setKindFilter('all') }} className="btn-ghost text-meta mt-3">
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-6">
              {filtered.map((el) => (
                <ElementCard
                  key={el.id}
                  element={el}
                  generating={generatingIds.has(el.id)}
                  onOpen={() => { setOpenComposer(null); setSelectedId(el.id) }}
                  onDelete={() => setConfirmDelete(el)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showWizard && (
        <ElementWizard
          onClose={() => setShowWizard(false)}
          onCreated={(id, { generate }) => {
            setOpenComposer(generate ? 'primary' : null)
            setSelectedId(id)
          }}
        />
      )}

      {deleteModal}
    </div>
  )
}
