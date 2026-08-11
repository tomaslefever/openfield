import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, Plus, Edit3, Trash2, X, User, Box, Mountain, UserCircle,
  ChevronLeft, Wand2, RefreshCw, Library, Maximize2,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  useElementsStore,
  type ElementKind,
  type StudioElement,
  KIND_CONFIG,
} from '../stores/elements-store'
import { TagEditor } from '../components/ui/TagEditor'
import { ConfirmDeleteModal } from '../components/ui/ConfirmDeleteModal'
import { fileUrl } from '../services/file-url'
import { QuickPromptComposer } from '../components/QuickPromptComposer'
import { ImagePreviewModal } from '../components/ui/ImagePreviewModal'
import { ElementWizard } from '../components/ElementWizard'

const KIND_FILTERS: { key: ElementKind | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'avatar', label: 'Avatares' },
  { key: 'character', label: 'Personajes' },
  { key: 'environment', label: 'Entornos' },
  { key: 'object', label: 'Objetos' },
]

const KIND_ICONS: Record<ElementKind, typeof User> = {
  avatar: UserCircle,
  character: User,
  environment: Mountain,
  object: Box,
}

const PRIMARY_BASE_PROMPT = 'high quality character portrait, front facing, centered composition, clean lighting, detailed features, professional rendering'

const POSE_BASE_PROMPT = 'character turnaround sheet, front view, side view, back view, full body standing pose, orthographic reference, white background, consistent lighting, same character design'

const MOODBOARD_BASE_PROMPT = 'concept art reference, detailed illustration, same character, cohesive style, professional quality'

function UploadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function b64FromFile(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] || result)
    }
    reader.readAsDataURL(file)
  })
}

// ───────────────────── Library Picker Modal ─────────────────────
function LibraryPickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (asset: { base64: string; prompt: string; assetId: string }) => void
  onClose: () => void
}) {
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const result = await (window as any).electronAPI?.assets.list({ type: 'image', limit: 60 })
        setAssets(result?.assets || [])
      } catch { /* ignore */ }
      setLoading(false)
    })()
  }, [])

  const filtered = search
    ? assets.filter(
        (a) =>
          (a.prompt || '').toLowerCase().includes(search.toLowerCase()) ||
          (a.fileName || '').toLowerCase().includes(search.toLowerCase()),
      )
    : assets

  const handleSelect = async (asset: any) => {
    try {
      const api = (window as any).electronAPI
      const results = await api?.assets.readBase64([asset.id])
      const b64 = results?.[0]?.base64 || ''
      onSelect({ base64: b64, prompt: asset.prompt || '', assetId: asset.id })
      onClose()
    } catch {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-800 rounded-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-surface-800">
          <h3 className="text-sm font-semibold text-surface-100">Seleccionar de la biblioteca</h3>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-100">
            <X size={16} />
          </button>
        </div>
        <div className="p-3 border-b border-surface-800">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por prompt o nombre..."
            className="input-field text-xs"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-surface-500 text-sm">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-surface-500 text-sm">No se encontraron imágenes</div>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {filtered.map((asset) => {
                const src = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : null)
                const resolvedSrc = src ? (src.startsWith('http') ? src : fileUrl(src)) : null
                return (
                  <button
                    key={asset.id}
                    onClick={() => handleSelect(asset)}
                    className="aspect-square bg-surface-800 rounded-lg overflow-hidden hover:ring-2 ring-accent-500 transition-all cursor-pointer border border-surface-800 hover:border-accent-500/50"
                  >
                    {resolvedSrc ? (
                      <img src={resolvedSrc} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-surface-600 text-[10px]">—</div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ───────────────────── Create / Edit Modal ─────────────────────
function CreateEditModal({
  element,
  onClose,
}: {
  element?: StudioElement
  onClose: () => void
}) {
  const addElement = useElementsStore((s) => s.addElement)
  const updateElement = useElementsStore((s) => s.updateElement)
  const [kind, setKind] = useState<ElementKind>(element?.kind || 'character')
  const [name, setName] = useState(element?.name || '')
  const [description, setDescription] = useState(element?.description || '')
  const [imageBase64, setImageBase64] = useState(element?.imageBase64 || '')
  const [prompt, setPrompt] = useState(element?.prompt || '')
  const [voiceId, setVoiceId] = useState(element?.voiceId || '')
  const [tags, setTags] = useState<string[]>(element?.tags || [])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageBase64(await b64FromFile(file))
  }

  const handleSave = () => {
    if (!name.trim()) return
    const data: Omit<StudioElement, 'id' | 'createdAt' | 'updatedAt'> = {
      name: name.trim(),
      kind,
      description,
      tags,
      imageBase64,
      imageAssetId: element?.imageAssetId || '',
      prompt,
      voiceId: kind === 'avatar' || kind === 'character' ? voiceId : '',
      referenceImages: element?.referenceImages || [],
      referenceAssetIds: element?.referenceAssetIds || [],
      poseRef: element?.poseRef || '',
      poseAssetId: element?.poseAssetId || '',
      poseTaskId: element?.poseTaskId || '',
      moodboardTaskId: element?.moodboardTaskId || '',
      videoRef: element?.videoRef || '',
      videoAssetId: element?.videoAssetId || '',
      hdriRef: element?.hdriRef || '',
      hdriAssetId: element?.hdriAssetId || '',
      style: element?.style || '',
      properties: element?.properties || {},
    }
    if (element) {
      updateElement(element.id, data)
    } else {
      addElement(data)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-800 rounded-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-surface-800">
          <h3 className="text-sm font-semibold text-surface-100">
            {element ? 'Editar elemento' : 'Nuevo elemento'}
          </h3>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Tipo</label>
            <div className="flex gap-2 flex-wrap">
              {KIND_FILTERS.filter((f) => f.key !== 'all').map(({ key, label }) => {
                const Icon = KIND_ICONS[key as ElementKind]
                const cfg = KIND_CONFIG[key as ElementKind]
                return (
                  <button
                    key={key}
                    onClick={() => setKind(key as ElementKind)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      kind === key
                        ? 'bg-surface-700 text-surface-100 border border-surface-600'
                        : 'bg-surface-800 text-surface-500 hover:text-surface-300'
                    }`}
                  >
                    <Icon size={12} className={cfg.color} />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del elemento" className="input-field" />
          </div>

          <div>
            <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Descripción</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe el elemento en detalle..." className="input-field min-h-[80px] resize-none" rows={3} />
          </div>

          <div>
            <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Tags</label>
            <TagEditor tags={tags} onChange={setTags} />
          </div>

          <div>
            <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Prompt</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Prompt que describe al elemento..." className="input-field min-h-[60px] resize-none text-xs" rows={2} />
          </div>

          {(kind === 'avatar' || kind === 'character') && (
            <div>
              <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Voice ID (ElevenLabs)</label>
              <input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder="ID de voz..." className="input-field text-xs font-mono" />
            </div>
          )}

          <div>
            <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Imagen de referencia</label>
            <div className="flex items-center gap-2">
              {imageBase64 && (
                <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-surface-800 flex-shrink-0">
                  <img               src={imageBase64 ? `data:image/png;base64,${imageBase64}` : undefined} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => setImageBase64('')} className="absolute top-1 right-1 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center">
                    <X size={10} className="text-white" />
                  </button>
                </div>
              )}
              <label className="btn-ghost text-xs cursor-pointer">
                <UploadIcon />
                {imageBase64 ? 'Cambiar' : 'Subir imagen'}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-4 border-t border-surface-800">
          <button onClick={handleSave} disabled={!name.trim()} className="btn-primary flex-1 text-xs text-center justify-center">
            {element ? 'Guardar cambios' : 'Crear elemento'}
          </button>
          <button onClick={onClose} className="btn-ghost text-xs">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────── Moodboard Card ─────────────────────
function MoodboardCard({
  refs,
  count,
  max,
  onAdd,
  onRemove,
  onPreview,
  onGenerate,
  onLibrary,
}: {
  refs: string[]
  count: number
  max: number
  onAdd: (b64: string) => void
  onRemove: (i: number) => void
  onPreview: (i: number) => void
  onGenerate: () => void
  onLibrary: () => void
}) {
  const [dragActive, setDragActive] = useState(false)
  const dragCounter = useRef(0)

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setDragActive(false)
    const files = e.dataTransfer?.files
    if (!files) return
    for (let i = 0; i < files.length; i++) {
      if (!files[i].type.startsWith('image/')) continue
      if (count + i >= max) break
      try { onAdd(await readFile(files[i])) } catch {}
    }
  }

  return (
    <div
      className={`col-span-4 card p-5 flex flex-col transition-colors ${dragActive ? 'border-accent-500/60' : ''}`}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setDragActive(true) }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragActive(false) } }}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between mb-3 border-b border-surface-800 pb-2">
        <h3 className="text-[10px] text-accent-400 uppercase tracking-wider font-semibold">Moodboard / Refs</h3>
        <span className="text-[10px] text-surface-500 bg-surface-800/50 px-2 py-0.5 rounded">{count}/{max}</span>
      </div>
      <div className="flex-1">
        {refs.length === 0 ? (
          <div className="h-full min-h-[120px] border-2 border-dashed border-surface-700/50 rounded-lg flex flex-col items-center justify-center gap-2 text-surface-500">
            <UploadIcon />
            <p className="text-[10px]">Drop images here</p>
            <p className="text-[9px] text-surface-600">or use buttons below</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 content-start">
            {refs.map((img, i) => (
              <div key={i} className="aspect-square relative bg-surface-800/50 border border-surface-800 rounded hover:border-accent-500/50 transition-colors flex items-center justify-center overflow-hidden group/item">
                <img               src={img ? `data:image/png;base64,${img}` : undefined} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover/item:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover/item:opacity-100">
                  <button
                    onClick={() => onPreview(i)}
                    className="bg-white/90 hover:bg-white text-black p-1 rounded"
                  >
                    <Maximize2 size={10} />
                  </button>
                  <button
                    onClick={() => onRemove(i)}
                    className="bg-red-500/90 hover:bg-red-500 text-white p-1 rounded"
                  >
                    <X size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-2 flex gap-2 pt-2 border-t border-surface-800">
        <button
          onClick={onGenerate}
          className="flex-1 bg-accent-500/20 hover:bg-accent-500/40 text-accent-400 hover:text-accent-300 text-[10px] px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors"
        >
          <Wand2 size={11} /> Generate
        </button>
        <button
          onClick={onLibrary}
          className="flex-1 bg-surface-800/60 hover:bg-surface-700/60 text-surface-400 hover:text-surface-200 text-[10px] px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors"
        >
          <Library size={11} /> Biblioteca
        </button>
      </div>
    </div>
  )
}

// ───────────────────── Element Dashboard ─────────────────────
function ElementDashboard({
  element,
  onUpdate,
  primaryBasePrompt,
  poseBasePrompt,
  moodboardBasePrompt,
}: {
  element: StudioElement
  onUpdate: (updates: Partial<StudioElement>) => void
  primaryBasePrompt: string
  poseBasePrompt: string
  moodboardBasePrompt: string
}) {
  const [name, setName] = useState(element.name)
  const [description, setDescription] = useState(element.description)
  const [prompt, setPrompt] = useState(element.prompt)
  const [voiceId, setVoiceId] = useState(element.voiceId || '')
  const [tags, setTags] = useState<string[]>(element.tags)
  const [showLibraryPicker, setShowLibraryPicker] = useState(false)
  const [libraryPickerTarget, setLibraryPickerTarget] = useState<'pose' | 'primary' | 'moodboard'>('primary')
  const [showQuickComposer, setShowQuickComposer] = useState(false)
  const [showPosePreview, setShowPosePreview] = useState(false)
  const [showPrimaryPreview, setShowPrimaryPreview] = useState(false)
  const [showRefPreview, setShowRefPreview] = useState(false)
  const [refPreviewIndex, setRefPreviewIndex] = useState(0)
  const [quickComposerTarget, setQuickComposerTarget] = useState<'pose' | 'primary' | 'moodboard'>('pose')
  const mountedRef = useRef(true)

  useEffect(() => { return () => { mountedRef.current = false } }, [])

  const handleGenerate = useCallback((target: 'pose' | 'primary' | 'moodboard') => {
    console.log('[ElementDashboard] handleGenerate:', { target, poseBasePrompt: poseBasePrompt?.substring(0, 80), primaryBasePrompt: primaryBasePrompt?.substring(0, 80) })
    setQuickComposerTarget(target)
    setShowQuickComposer(true)
  }, [poseBasePrompt, primaryBasePrompt])

  const hasChanges =
    name !== element.name ||
    description !== element.description ||
    prompt !== element.prompt ||
    voiceId !== (element.voiceId || '') ||
    JSON.stringify(tags) !== JSON.stringify(element.tags)

  const handleSave = () => {
    onUpdate({
      name: name.trim(),
      description,
      prompt,
      voiceId,
      tags,
    })
  }

  const handlePrimaryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    onUpdate({ imageBase64: await b64FromFile(file) })
  }

  const handlePoseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    onUpdate({ poseRef: await b64FromFile(file) })
  }

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    onUpdate({ videoRef: await b64FromFile(file) })
  }

  const handleHdriUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    onUpdate({ hdriRef: await b64FromFile(file) })
  }

  const addRefImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || element.referenceImages.length >= 8) return
    onUpdate({ referenceImages: [...element.referenceImages, await b64FromFile(file)] })
  }

  const removeRefImage = (idx: number) => {
    onUpdate({ referenceImages: element.referenceImages.filter((_, i) => i !== idx) })
  }

  const showVoice = element.kind === 'avatar' || element.kind === 'character'
  const showPose = element.kind === 'avatar' || element.kind === 'character'
  const showVideo = element.kind === 'environment'
  const showHdri = element.kind === 'environment'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1440px] mx-auto p-6">
        <div className="grid grid-cols-12 gap-3 auto-rows-[minmax(180px,auto)]">
          {/* Information */}
          <div className="col-span-4 card p-5 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              {(() => { const Icon = KIND_ICONS[element.kind]; return <Icon size={80} /> })()}
            </div>
            <div className="flex items-center justify-between mb-3 border-b border-surface-800 pb-2">
              <h3 className="text-[10px] text-accent-400 uppercase tracking-wider font-semibold">Information</h3>
            </div>
            <div className="flex-1 flex flex-col gap-4">
              <div>
                <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent border-0 border-b border-surface-800 px-0 py-2 text-sm text-surface-100 placeholder:text-surface-600 focus:border-accent-500 focus:outline-none transition-colors"
                  placeholder="Enter element name..."
                />
              </div>
              <div className="flex-1 flex flex-col">
                <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full flex-1 bg-surface-800/50 border border-surface-800 rounded-lg p-3 text-xs text-surface-200 placeholder:text-surface-600 resize-none focus:border-accent-500 focus:outline-none transition-colors"
                  placeholder="Outline physical traits, origin, and visual identifiers..."
                />
              </div>
              <div>
                <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Tags</label>
                <div className="bg-surface-800/50 border border-surface-800 rounded-lg p-2 flex flex-wrap gap-2 min-h-[42px] content-start">
                  {tags.map((tag) => (
                    <span key={tag} className="bg-accent-500/10 text-accent-400 text-[11px] px-2 py-1 rounded flex items-center gap-1">
                      {tag}
                      <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="hover:text-red-400 transition-colors leading-none">
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                  <input
                    className="bg-transparent border-none p-0 text-xs text-surface-300 placeholder:text-surface-600 focus:outline-none w-24"
                    placeholder="Add tag..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const val = (e.target as HTMLInputElement).value.trim().toLowerCase()
                        if (val && !tags.includes(val)) {
                          setTags([...tags, val])
                          ;(e.target as HTMLInputElement).value = ''
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Primary Render */}
          <div className="col-span-4 card p-4 flex flex-col relative group">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] text-accent-400 uppercase tracking-wider font-semibold">Primary Render</h3>
            </div>
            <label className="flex-1 border-2 border-dashed border-surface-700/50 rounded-lg flex flex-col items-center justify-center bg-surface-800/30 transition-colors group-hover:border-accent-500/50 cursor-pointer relative overflow-hidden">
              {element.imageBase64 ? (
                <>
                  <img src={`data:image/png;base64,${element.imageBase64}`} alt="" className="w-full h-full object-cover rounded-lg" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPrimaryPreview(true) }}
                      className="bg-white/90 hover:bg-white text-black text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <Maximize2 size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLibraryPickerTarget('primary'); setShowLibraryPicker(true) }}
                      className="bg-surface-800/90 hover:bg-surface-700 text-surface-300 text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <Library size={12} /> Biblioteca
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleGenerate('primary') }}
                      className="bg-accent-500/90 hover:bg-accent-500 text-white text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <RefreshCw size={12} /> Regenerate
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <UploadIcon />
                  <p className="text-[10px] text-surface-500 mt-2">DROP FILE OR CLICK</p>
                  <p className="text-[9px] text-surface-600 mt-1">4:5 ASPECT PREFERRED</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLibraryPickerTarget('primary'); setShowLibraryPicker(true) }}
                      className="bg-surface-800/60 hover:bg-surface-700/60 text-surface-400 hover:text-surface-200 text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <Library size={12} /> Biblioteca
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleGenerate('primary') }}
                      className="bg-accent-500/20 hover:bg-accent-500/40 text-accent-400 hover:text-accent-300 text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <Wand2 size={12} /> Generate
                    </button>
                  </div>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handlePrimaryUpload} />
            </label>
          </div>

          {/* Voice Profile */}
          {showVoice && (
            <div className="col-span-4 card p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3 border-b border-surface-800 pb-2">
                <h3 className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold">Acoustic Signature</h3>
              </div>
              <div className="flex-1 flex flex-col justify-center gap-3">
                <div className="h-14 flex items-end justify-between gap-[2px] w-full px-1">
                  {Array.from({ length: 28 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-blue-500/30 rounded-t-sm opacity-50 hover:opacity-100 transition-opacity"
                      style={{
                        height: `${Math.max(8, Math.abs(Math.sin(i * 0.7) * 80 + Math.cos(i * 1.3) * 20))}%`,
                        animation: `pulse ${0.6 + Math.random() * 0.8}s infinite alternate ease-in-out`,
                        animationDelay: `-${Math.random() * 1}s`,
                      }}
                    />
                  ))}
                </div>
                <div>
                  <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1 block">Voice ID (ElevenLabs)</label>
                  <input
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    placeholder="Voice ID..."
                    className="input-field text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Pose Reference */}
          {showPose && (
              <div className="col-span-8 card p-4 flex flex-col relative group overflow-hidden">
              <div className="flex items-center justify-between mb-3 border-b border-surface-800 pb-2">
                <h3 className="text-[10px] text-accent-400 uppercase tracking-wider font-semibold">Pose Reference</h3>
                <span className="text-[9px] text-surface-500 font-mono">16:9</span>
              </div>
              <label className="flex-1 border-2 border-dashed border-surface-700/50 rounded-lg flex flex-col items-center justify-center bg-surface-800/30 transition-colors group-hover:border-accent-500/50 cursor-pointer relative overflow-hidden" style={{ aspectRatio: '16/9', maxHeight: '400px' }}>
                {element.poseTaskId ? (
                  <div className="flex flex-col items-center gap-3">
                    <RefreshCw size={24} className="text-accent-400 animate-spin" />
                    <p className="text-[11px] text-surface-400 font-medium">Generating pose reference...</p>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdate({ poseTaskId: '' }) }}
                      className="text-[10px] text-surface-500 hover:text-red-400 border border-surface-700 hover:border-red-500/50 rounded-lg px-3 py-1 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : element.poseRef ? (
                  <>
                    <img src={`data:image/png;base64,${element.poseRef}`} alt="" className="w-full h-full object-contain rounded-lg" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPosePreview(true) }}
                        className="bg-white/90 hover:bg-white text-black text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <Maximize2 size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdate({ poseRef: '' }) }}
                        className="bg-red-500/90 hover:bg-red-500 text-white text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleGenerate('pose') }}
                        className="bg-accent-500/90 hover:bg-accent-500 text-white text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <RefreshCw size={12} /> Regenerate
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <UploadIcon />
                    <p className="text-[10px] text-surface-500 mt-2 font-medium">POSE REFERENCE</p>
                    <p className="text-[9px] text-surface-600 mt-1">Upload or generate a turnaround sheet</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLibraryPickerTarget('pose'); setShowLibraryPicker(true) }}
                        className="bg-surface-800/60 hover:bg-surface-700/60 text-surface-400 hover:text-surface-200 text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <Library size={12} /> Biblioteca
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleGenerate('pose') }}
                        disabled={!!element.poseTaskId}
                        className="bg-accent-500/20 hover:bg-accent-500/40 text-accent-400 hover:text-accent-300 text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Wand2 size={12} /> Generate
                      </button>
                    </div>
                  </>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={handlePoseUpload} />
              </label>
            </div>
          )}

          {/* Moodboard / Refs */}
          <MoodboardCard
            refs={element.referenceImages}
            count={element.referenceImages.length}
            max={8}
            onAdd={(b64) => onUpdate({ referenceImages: [...element.referenceImages, b64].slice(0, 8) })}
            onRemove={(i) => onUpdate({ referenceImages: element.referenceImages.filter((_, j) => j !== i) })}
            onPreview={(i) => { setRefPreviewIndex(i); setShowRefPreview(true) }}
            onGenerate={() => handleGenerate('moodboard')}
            onLibrary={() => { setLibraryPickerTarget('moodboard'); setShowLibraryPicker(true) }}
          />

          {/* Video Reference */}
          {showVideo && (
            <div className="col-span-12 lg:col-span-4 card p-4 flex flex-col aspect-video relative group overflow-hidden">
              <div className="flex items-center justify-between z-10 bg-surface-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-surface-800 absolute top-4 left-4 right-4">
                <h3 className="text-[10px] text-accent-400 uppercase tracking-wider font-semibold">Video Reference</h3>
                <span className="text-[9px] text-surface-500 font-mono">16:9</span>
              </div>
              <label className="absolute inset-0 m-4 mt-16 border-2 border-dashed border-surface-700/50 rounded-lg flex flex-col items-center justify-center bg-surface-800/30 transition-colors group-hover:border-accent-500/50 cursor-pointer">
                {element.videoRef ? (
                  <video               src={element.videoRef ? `data:video/mp4;base64,${element.videoRef}` : undefined} className="w-full h-full object-cover rounded-lg" controls />
                ) : (
                  <>
                    <UploadIcon />
                    <p className="text-[10px] text-surface-500 mt-2 font-medium">DROP VIDEO HERE</p>
                    <p className="text-[9px] text-surface-600 mt-1">Reference footage for the environment</p>
                  </>
                )}
                <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
              </label>
            </div>
          )}

          {/* HDRI Reference */}
          {showHdri && (
            <div className="col-span-12 lg:col-span-4 card p-4 flex flex-col aspect-video relative group overflow-hidden">
              <div className="flex items-center justify-between z-10 bg-surface-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-surface-800 absolute top-4 left-4 right-4">
                <h3 className="text-[10px] text-accent-400 uppercase tracking-wider font-semibold">HDRI / 360</h3>
                <span className="text-[9px] text-surface-500 font-mono">2:1</span>
              </div>
              <label className="absolute inset-0 m-4 mt-16 border-2 border-dashed border-surface-700/50 rounded-lg flex flex-col items-center justify-center bg-surface-800/30 transition-colors group-hover:border-accent-500/50 cursor-pointer">
                {element.hdriRef ? (
                  <img               src={element.hdriRef ? `data:image/png;base64,${element.hdriRef}` : undefined} alt="" className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <>
                    <UploadIcon />
                    <p className="text-[10px] text-surface-500 mt-2 font-medium">DROP HDR IMAGE HERE</p>
                    <p className="text-[9px] text-surface-600 mt-1">360 equirectangular panorama</p>
                  </>
                )}
                <input type="file" accept="image/*,.hdr,.exr" className="hidden" onChange={handleHdriUpload} />
              </label>
            </div>
          )}

          {/* Empty spacer */}
          {!showPose && !showVideo && !showHdri && (
            <div className="col-span-12 lg:col-span-8 card p-4 flex flex-col items-center justify-center text-surface-600">
              <Box size={32} className="opacity-30 mb-2" />
              <p className="text-[10px]">No additional references needed</p>
            </div>
          )}
        </div>

        {hasChanges && (
          <div className="mt-4 flex justify-end">
            <button onClick={handleSave} className="btn-primary text-xs px-6 py-2">
              Save Changes
            </button>
          </div>
        )}
      </div>

      {showLibraryPicker && (
        <LibraryPickerModal
          onSelect={({ base64, prompt: assetPrompt }) => {
            if (libraryPickerTarget === 'pose') {
              onUpdate({ poseRef: base64 })
            } else if (libraryPickerTarget === 'moodboard') {
              onUpdate({ referenceImages: [...element.referenceImages, base64].slice(0, 8) })
            } else {
              const updates: Partial<StudioElement> = { imageBase64: base64 }
              if (assetPrompt) updates.prompt = assetPrompt
              onUpdate(updates)
              if (assetPrompt) setPrompt(assetPrompt)
            }
          }}
          onClose={() => setShowLibraryPicker(false)}
        />
      )}

      {showQuickComposer && (
        <QuickPromptComposer
          basePrompt={quickComposerTarget === 'pose' ? poseBasePrompt : quickComposerTarget === 'moodboard' ? moodboardBasePrompt : `${primaryBasePrompt}${prompt ? `\n\n${prompt}` : ''}`}
          referenceImage={quickComposerTarget === 'pose' ? (element.imageBase64 || undefined) : undefined}
          imageRefs={quickComposerTarget === 'moodboard' ? [
            ...(element.imageBase64 ? [{ base64: element.imageBase64, mime: 'image/png' as const }] : []),
            ...(element.poseRef ? [{ base64: element.poseRef, mime: 'image/png' as const }] : []),
          ] : undefined}
          aspectRatio={quickComposerTarget === 'pose' ? '16:9' : '3:4'}
          aspectRatioLocked={quickComposerTarget !== 'moodboard'}
          resolution="2K"
          resolutionLocked={quickComposerTarget !== 'moodboard'}
          promptLocked={quickComposerTarget === 'pose'}
          onTaskCreated={quickComposerTarget !== 'primary' ? (taskId) => {
            if (quickComposerTarget === 'pose') {
              onUpdate({ poseTaskId: taskId })
            } else {
              onUpdate({ moodboardTaskId: taskId })
            }
            setShowQuickComposer(false)
          } : undefined}
          onGenerated={(result) => {
            if (quickComposerTarget === 'pose') {
              onUpdate({ poseRef: result.base64, poseTaskId: '' })
            } else if (quickComposerTarget === 'moodboard') {
              onUpdate({ referenceImages: [...element.referenceImages, result.base64].slice(0, 8), moodboardTaskId: '' })
            } else {
              const updates: Partial<StudioElement> = { imageBase64: result.base64 }
              if (!prompt) {
                setPrompt(result.prompt)
                updates.prompt = result.prompt
              }
              onUpdate(updates)
            }
            setShowQuickComposer(false)
          }}
          onClose={() => setShowQuickComposer(false)}
        />
      )}

      {showPosePreview && element.poseRef && (
        <ImagePreviewModal
              src={`data:image/png;base64,${element.poseRef}`}
          onClose={() => setShowPosePreview(false)}
        >
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Element</p>
            <p className="text-sm text-surface-200">{element.name || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Type</p>
            <p className="text-sm text-surface-200">{KIND_CONFIG[element.kind]?.label || element.kind}</p>
          </div>
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Prompt</p>
            <p className="text-sm text-surface-200 leading-relaxed">{element.prompt || '—'}</p>
          </div>
        </ImagePreviewModal>
      )}

      {showPrimaryPreview && element.imageBase64 && (
        <ImagePreviewModal
              src={`data:image/png;base64,${element.imageBase64}`}
          onClose={() => setShowPrimaryPreview(false)}
        >
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Element</p>
            <p className="text-sm text-surface-200">{element.name || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Type</p>
            <p className="text-sm text-surface-200">{KIND_CONFIG[element.kind]?.label || element.kind}</p>
          </div>
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Prompt</p>
            <p className="text-sm text-surface-200 leading-relaxed">{element.prompt || '—'}</p>
          </div>
        </ImagePreviewModal>
      )}

      {showRefPreview && element.referenceImages[refPreviewIndex] && (
        <ImagePreviewModal
          src={`data:image/png;base64,${element.referenceImages[refPreviewIndex]}`}
          onClose={() => setShowRefPreview(false)}
          onPrev={refPreviewIndex > 0 ? () => setRefPreviewIndex(i => i - 1) : undefined}
          onNext={refPreviewIndex < element.referenceImages.length - 1 ? () => setRefPreviewIndex(i => i + 1) : undefined}
        />
      )}
    </div>
  )
}

// ───────────────────── Elements Page (Grid) ─────────────────────
export function ElementsPage() {
  const elements = useElementsStore((s) => s.elements)
  const deleteElement = useElementsStore((s) => s.deleteElement)
  const loadElements = useElementsStore((s) => s.loadElements)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<ElementKind | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editingElement, setEditingElement] = useState<StudioElement | undefined>(undefined)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [primaryBasePrompt, setPrimaryBasePrompt] = useState(PRIMARY_BASE_PROMPT)
  const [poseBasePrompt, setPoseBasePrompt] = useState(POSE_BASE_PROMPT)
  const [moodboardBasePrompt, setMoodboardBasePrompt] = useState(MOODBOARD_BASE_PROMPT)

  useEffect(() => { loadElements() }, [])

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.settings?.getAll) return
    api.settings.getAll().then((settings: any) => {
      console.log('[ElementsPage] Settings loaded:', Object.keys(settings || {}))
      if (settings?.['elements:primaryBasePrompt'] != null) {
        console.log('[ElementsPage] primaryBasePrompt from settings:', settings['elements:primaryBasePrompt'].substring(0, 80))
        setPrimaryBasePrompt(settings['elements:primaryBasePrompt'])
      }
      if (settings?.['elements:poseBasePrompt'] != null) {
        console.log('[ElementsPage] poseBasePrompt from settings:', settings['elements:poseBasePrompt'].substring(0, 80))
        setPoseBasePrompt(settings['elements:poseBasePrompt'])
      }
      if (settings?.['elements:moodboardBasePrompt'] != null) {
        setMoodboardBasePrompt(settings['elements:moodboardBasePrompt'])
      }
    }).catch((err: any) => console.error('[ElementsPage] Failed to load settings:', err))
  }, [])

  // Poll recent assets to resolve pending pose tasks (same pattern as ImageGenPage)
  const { data: assetPoll } = useQuery({
    queryKey: ['elements', 'pending-pose'],
    queryFn: () => (window as any).electronAPI?.assets.list({ type: 'image', limit: 30 }) ?? { assets: [] },
    refetchInterval: 15000,
  })

  const pollRef = useRef(false)
  useEffect(() => {
    if (!assetPoll?.assets?.length) return
    const store = useElementsStore.getState()
    for (const el of store.elements) {
      // Check pose tasks
      if (el.poseTaskId) {
        const match = assetPoll.assets.find((a: any) => a.taskId === el.poseTaskId)
        if (!match) continue
        const hasLocal = !!match.localPath
        const hasRemote = match.filePath && match.filePath.startsWith('http')
        const hasError = match.filePath?.startsWith('__error__')
        if (hasError) {
          useElementsStore.getState().updateElement(el.id, { poseTaskId: '' })
          continue
        }
        if (hasLocal || hasRemote) {
          if (pollRef.current) return
          pollRef.current = true
          ;(async () => {
            try {
              const api = (window as any).electronAPI
              const results = await api?.assets.readBase64([match.id])
              const b64 = results?.[0]?.base64 || ''
              if (b64) {
                useElementsStore.getState().updateElement(el.id, { poseRef: b64, poseTaskId: '' })
              }
            } catch (err: any) { console.error('[ElementsPage] Failed to read pose asset:', err) }
            pollRef.current = false
          })()
          break
        }
      }
      // Check moodboard tasks
      if (el.moodboardTaskId) {
        const match = assetPoll.assets.find((a: any) => a.taskId === el.moodboardTaskId)
        if (!match) continue
        const hasLocal = !!match.localPath
        const hasRemote = match.filePath && match.filePath.startsWith('http')
        const hasError = match.filePath?.startsWith('__error__')
        if (hasError) {
          useElementsStore.getState().updateElement(el.id, { moodboardTaskId: '' })
          continue
        }
        if (hasLocal || hasRemote) {
          if (pollRef.current) return
          pollRef.current = true
          ;(async () => {
            try {
              const api = (window as any).electronAPI
              const results = await api?.assets.readBase64([match.id])
              const b64 = results?.[0]?.base64 || ''
              if (b64) {
                const current = useElementsStore.getState().elements.find(e => e.id === el.id)
                if (current) {
                  useElementsStore.getState().updateElement(el.id, {
                    referenceImages: [...current.referenceImages, b64].slice(0, 8),
                    moodboardTaskId: '',
                  })
                }
              }
            } catch (err: any) { console.error('[ElementsPage] Failed to read moodboard asset:', err) }
            pollRef.current = false
          })()
          break
        }
      }
    }
  }, [assetPoll])

  const selectedElement = selectedId ? elements.find((e) => e.id === selectedId) || null : null

  const filtered = elements.filter((e) => {
    if (kindFilter !== 'all' && e.kind !== kindFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!e.name.toLowerCase().includes(q) && !e.tags.some((t) => t.toLowerCase().includes(q))) return false
    }
    return true
  })

  const kindCounts: Record<string, number> = {
    all: elements.length,
    ...Object.fromEntries(
      KIND_FILTERS.filter((f) => f.key !== 'all').map((f) => [
        f.key,
        elements.filter((e) => e.kind === f.key).length,
      ]),
    ),
  }

  if (selectedElement) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-surface-800">
          <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-surface-400 hover:text-surface-100 transition-colors text-xs">
            <ChevronLeft size={14} />
            Elements
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditingElement(selectedElement); setShowModal(true) }} className="btn-ghost text-xs flex items-center gap-1">
              <Edit3 size={12} /> Editar
            </button>
            <button onClick={() => setConfirmDelete(selectedElement.id)} className="btn-danger text-xs flex items-center gap-1">
              <Trash2 size={12} /> Eliminar
            </button>
          </div>
        </div>
        <ElementDashboard
          element={selectedElement}
          onUpdate={(updates) => {
            useElementsStore.getState().updateElement(selectedElement.id, updates)
          }}
          primaryBasePrompt={primaryBasePrompt}
          poseBasePrompt={poseBasePrompt}
          moodboardBasePrompt={moodboardBasePrompt}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-lg font-semibold text-surface-100">Elements</h1>
            <button onClick={() => { setEditingElement(undefined); setShowModal(true) }} className="btn-primary text-xs flex items-center gap-1">
              <Plus size={12} /> Nuevo elemento
            </button>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o tag..." className="input-field pl-9" />
            </div>
            <div className="flex gap-1 bg-surface-900 rounded-lg p-1 border border-surface-800">
              {KIND_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setKindFilter(key as ElementKind | 'all')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    kindFilter === key ? 'bg-surface-800 text-surface-100' : 'text-surface-500 hover:text-surface-100'
                  }`}
                >
                  {label} <span className="text-surface-600 ml-1">({kindCounts[key] || 0})</span>
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-surface-600">
              <Box size={48} className="mb-4 opacity-50" />
              <p className="text-sm">No hay elementos</p>
              <p className="text-xs text-surface-700 mt-1">Crea avatares, personajes, entornos y objetos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((el) => {
                const cfg = KIND_CONFIG[el.kind]
                const Icon = KIND_ICONS[el.kind]
                return (
                  <div key={el.id} className="card group relative overflow-hidden p-0 cursor-pointer" onClick={() => setSelectedId(el.id)}>
                    <div className="aspect-square bg-surface-800 flex items-center justify-center overflow-hidden">
                      {el.imageBase64 ? (
                        <img               src={el.imageBase64 ? `data:image/png;base64,${el.imageBase64}` : undefined} alt={el.name} className="w-full h-full object-cover" />
                      ) : (
                        <Icon size={40} className={`${cfg.color} opacity-40`} />
                      )}
                    </div>
                    <div className="px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <Icon size={14} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-surface-200 truncate">{el.name}</p>
                          <p className="text-[10px] text-surface-500">{cfg.label}</p>
                        </div>
                      </div>
                      {el.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {el.tags.map((tag) => (
                            <span key={tag} className="px-1.5 py-0.5 rounded bg-accent-500/10 text-accent-400 text-[9px] font-medium">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setEditingElement(el); setShowModal(true) }} className="w-6 h-6 bg-surface-900/80 hover:bg-surface-700 rounded-md flex items-center justify-center text-surface-400 hover:text-surface-100">
                        <Edit3 size={11} />
                      </button>
                      {confirmDelete === el.id ? (
                        <div className="flex gap-0.5 bg-surface-900/80 rounded-md p-0.5">
                          <button onClick={(e) => { e.stopPropagation(); deleteElement(el.id); setConfirmDelete(null) }} className="px-1.5 py-0.5 bg-red-500/80 rounded text-[10px] text-white">Sí</button>
                          <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(null) }} className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] text-white">No</button>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(el.id) }} className="w-6 h-6 bg-surface-900/80 hover:bg-red-500/20 rounded-md flex items-center justify-center text-surface-400 hover:text-red-400">
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {showModal && editingElement && (
        <CreateEditModal
          element={editingElement}
          onClose={() => { setShowModal(false); setEditingElement(undefined) }}
        />
      )}

      {showModal && !editingElement && (
        <ElementWizard
          onClose={() => { setShowModal(false); setEditingElement(undefined) }}
        />
      )}

      {confirmDelete && !showModal && (
        <ConfirmDeleteModal
          count={1}
          onConfirm={() => { deleteElement(confirmDelete); setConfirmDelete(null) }}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
