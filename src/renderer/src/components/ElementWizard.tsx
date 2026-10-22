import { useRef, useState } from 'react'
import { X, Check, Wand2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useElementsStore, type ElementKind, type MediaRef, KIND_CONFIG, MAX_REFERENCES, b64Src } from '../stores/elements-store'
import { KIND_HINTS, KIND_ICONS, KIND_ORDER } from '../lib/element-config'
import { filesToRefs } from '../lib/element-references'

interface Props {
  onClose: () => void
  /** Called with the new id; `generate` asks the caller to open the render composer */
  onCreated?: (id: string, opts: { generate: boolean }) => void
  initialData?: {
    imageBase64?: string
    imageAssetId?: string
    prompt?: string
    name?: string
    /** References inherited from the source asset (the ones it was generated with) */
    referenceImages?: MediaRef[]
  }
}

function ReferencesField({ refs, onChange }: { refs: MediaRef[]; onChange: (refs: MediaRef[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const full = refs.length >= MAX_REFERENCES

  const add = (added: MediaRef[]) => {
    const room = MAX_REFERENCES - refs.length
    if (added.length > room) toast.message(`Un elemento admite ${MAX_REFERENCES} referencias`, { description: `Se añadieron ${Math.max(0, room)}.` })
    if (room > 0 && added.length) onChange([...refs, ...added.slice(0, room)])
  }

  return (
    <div
      onDragOver={(e) => { if (!full) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault()
        setOver(false)
        if (!full) add(await filesToRefs(Array.from(e.dataTransfer.files || []), 'image'))
      }}
      className={`rounded-xl transition-shadow ${over ? 'ring-1 ring-ink ring-offset-4 ring-offset-canvas' : ''}`}
    >
      <div className="flex items-baseline gap-2 mb-2">
        <p className="eyebrow">Referencias</p>
        <span className="font-mono text-eyebrow text-ink-subtle">{refs.length}/{MAX_REFERENCES}</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {refs.map((r, i) => (
          <div key={r.assetId || i} className="group relative size-14 rounded-lg overflow-hidden bg-surface-soft border border-hairline">
            <img src={b64Src(r.base64)} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(refs.filter((_, j) => j !== i))}
              className="absolute top-1 right-1 size-5 rounded-full bg-canvas/90 text-ink flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              title="Quitar"
              aria-label={`Quitar referencia ${i + 1}`}
            >
              <X size={10} />
            </button>
          </div>
        ))}
        {!full && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="size-14 rounded-lg border border-dashed border-surface-700 text-ink-subtle hover:text-ink hover:border-surface-500 flex items-center justify-center transition-colors"
            title="Subir imágenes"
            aria-label="Subir referencias"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      <p className="text-meta text-ink-subtle mt-2">
        {refs.length > 0 ? 'Se guardan en el moodboard del elemento.' : 'Opcional: estilo, vestuario o paleta. Sube o arrastra imágenes.'}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files || [])
          e.target.value = ''
          add(await filesToRefs(files, 'image'))
        }}
      />
    </div>
  )
}

export function PropertySelector({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  const [customMode, setCustomMode] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const isCustom = !!value && !options.includes(value)

  const commitCustom = () => {
    if (customValue.trim()) onChange(customValue.trim())
    setCustomMode(false)
    setCustomValue('')
  }

  const chip = (selected: boolean) =>
    `px-2.5 py-1 rounded-pill text-meta transition-colors ${
      selected
        ? 'bg-accent-600 text-on-accent'
        : 'bg-canvas border border-hairline text-ink-muted hover:text-ink hover:border-surface-600'
    }`

  return (
    <div>
      <p className="eyebrow mb-2">{label}</p>
      <div className="flex gap-1.5 flex-wrap">
        {options.map((opt) => {
          const neutral = opt === 'None' || opt === 'Any'
          const selected = value === opt || (value === '' && neutral)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(neutral ? '' : opt); setCustomMode(false) }}
              className={chip(selected)}
            >
              {opt}
            </button>
          )
        })}
        {customMode ? (
          <input
            autoFocus
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCustom()
              if (e.key === 'Escape') { setCustomMode(false); setCustomValue('') }
            }}
            onBlur={commitCustom}
            placeholder="Custom…"
            className="px-2.5 py-1 rounded-pill text-meta bg-canvas text-ink border border-accent-500 focus:outline-none w-28 placeholder-ink-subtle"
          />
        ) : (
          <button
            type="button"
            onClick={() => setCustomMode(true)}
            className={isCustom ? chip(true) : 'px-2.5 py-1 rounded-pill text-meta text-ink-subtle hover:text-ink border border-dashed border-surface-600 transition-colors'}
          >
            {isCustom ? value : '+ Custom'}
          </button>
        )}
      </div>
    </div>
  )
}

export function ElementWizard({ onClose, onCreated, initialData }: Props) {
  const addElement = useElementsStore((s) => s.addElement)
  const [kind, setKind] = useState<ElementKind | null>(null)
  const [name, setName] = useState(initialData?.name || '')
  // The prompt is the element's whole definition: looks, outfit, style, lighting
  const [prompt, setPrompt] = useState(initialData?.prompt || '')
  const [refs, setRefs] = useState<MediaRef[]>(() => (initialData?.referenceImages || []).slice(0, MAX_REFERENCES))

  const canContinue = !!kind && !!name.trim()
  const canGenerate = !!onCreated && !initialData?.imageBase64 && !initialData?.imageAssetId

  const handleCreate = (generate: boolean) => {
    if (!kind || !name.trim()) return
    const id = addElement({
      name: name.trim(),
      kind,
      description: '',
      tags: [],
      imageBase64: initialData?.imageBase64 || '',
      imageAssetId: initialData?.imageAssetId || '',
      prompt: prompt.trim(),
      voiceId: '',
      referenceImages: refs.map((r) => r.base64),
      referenceAssetIds: refs.map((r) => r.assetId || ''),
      poseRef: '',
      poseAssetId: '',
      poseTaskId: '',
      moodboardTaskId: '',
      videoRef: '',
      videoAssetId: '',
      hdriRef: '',
      hdriAssetId: '',
      style: '',
      properties: {},
    })
    toast.success(`Elemento "${name.trim()}" creado`)
    onClose()
    onCreated?.(id, { generate })
  }

  return (
    <div className="modal-scrim z-50 flex items-center justify-center" onClick={onClose}>
      <div className="modal-surface w-full max-w-xl mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div>
            <p className="eyebrow">Nuevo elemento</p>
            <h2 className="text-title-lg text-ink mt-1">¿Qué quieres crear?</h2>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-6">
          <div className="space-y-5 max-h-[70vh] overflow-y-auto -mr-2 pr-2">
              {(initialData?.imageBase64 || initialData?.imageAssetId) && (
                <div className="flex items-center gap-3 p-2 pr-3 bg-surface-soft border border-hairline rounded-xl">
                  <div className="size-12 rounded-lg overflow-hidden bg-surface-800 flex-shrink-0">
                    {initialData?.imageBase64 && (
                      <img src={b64Src(initialData.imageBase64)} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow">Render principal</p>
                    <p className="text-meta text-ink-muted truncate mt-0.5">Imagen asignada al render principal</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {KIND_ORDER.map((k) => {
                  const Icon = KIND_ICONS[k]
                  const selected = kind === k
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={`relative flex flex-col items-start gap-6 p-3 rounded-xl border text-left transition-colors ${
                        selected
                          ? 'bg-accent-600 border-accent-600 text-on-accent'
                          : 'bg-surface-soft border-hairline text-ink hover:border-surface-600'
                      }`}
                    >
                      <Icon size={18} strokeWidth={1.75} />
                      <div>
                        <p className="text-body font-emphasis">{KIND_CONFIG[k].label}</p>
                        <p className={`text-meta mt-0.5 ${selected ? 'opacity-70' : 'text-ink-subtle'}`}>{KIND_HINTS[k]}</p>
                      </div>
                      {selected && <Check size={13} className="absolute top-3 right-3" />}
                    </button>
                  )
                })}
              </div>

              <div>
                <label className="eyebrow mb-2 block" htmlFor="element-name">Nombre</label>
                <input
                  id="element-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Detective Rivas"
                  className="input-field"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && canContinue) handleCreate(false) }}
                />
              </div>

              <div>
                <label className="eyebrow mb-2 block" htmlFor="element-prompt">Prompt</label>
                <textarea
                  id="element-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe el elemento: rasgos, vestuario, estilo, luz…"
                  rows={5}
                  className="input-field resize-y min-h-[96px] leading-relaxed"
                />
              </div>

              <ReferencesField refs={refs} onChange={setRefs} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-hairline">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <div className="flex items-center gap-2">
            {canGenerate && (
              <button onClick={() => handleCreate(true)} disabled={!canContinue} className="btn-secondary flex items-center gap-1.5">
                <Wand2 size={13} /> Crear y generar
              </button>
            )}
            <button onClick={() => handleCreate(false)} disabled={!canContinue} className="btn-primary">
              Crear elemento
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
