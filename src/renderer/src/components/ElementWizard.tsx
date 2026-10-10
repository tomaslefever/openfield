import { useState } from 'react'
import { X, Check, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { useElementsStore, type ElementKind, KIND_CONFIG, b64Src } from '../stores/elements-store'
import { ELEMENT_PROPERTIES, KIND_HINTS, KIND_ICONS, KIND_ORDER, withProperty } from '../lib/element-config'

interface Props {
  onClose: () => void
  /** Called with the new id; `generate` asks the caller to open the render composer */
  onCreated?: (id: string, opts: { generate: boolean }) => void
  initialData?: {
    imageBase64?: string
    imageAssetId?: string
    prompt?: string
    name?: string
  }
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
  const [step, setStep] = useState(0)
  const [kind, setKind] = useState<ElementKind | null>(null)
  const [name, setName] = useState(initialData?.name || '')
  const [properties, setProperties] = useState<Record<string, string>>({})

  const canContinue = !!kind && !!name.trim()
  const canGenerate = !!onCreated && !initialData?.imageBase64 && !initialData?.imageAssetId

  const handleKindSelect = (k: ElementKind) => {
    if (k !== kind) setProperties({})
    setKind(k)
  }

  const handleCreate = (generate: boolean) => {
    if (!kind || !name.trim()) return
    const id = addElement({
      name: name.trim(),
      kind,
      description: '',
      tags: [],
      imageBase64: initialData?.imageBase64 || '',
      imageAssetId: initialData?.imageAssetId || '',
      prompt: initialData?.prompt || '',
      voiceId: '',
      referenceImages: [],
      referenceAssetIds: [],
      poseRef: '',
      poseAssetId: '',
      poseTaskId: '',
      moodboardTaskId: '',
      videoRef: '',
      videoAssetId: '',
      hdriRef: '',
      hdriAssetId: '',
      style: properties['style'] || '',
      properties,
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
            <p className="eyebrow">Nuevo elemento · {step + 1}/2</p>
            <h2 className="text-title-lg text-ink mt-1">
              {step === 0 ? '¿Qué quieres crear?' : `Atributos de ${name.trim() || (kind ? KIND_CONFIG[kind].label : '')}`}
            </h2>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-6">
          {step === 0 && (
            <div className="space-y-5">
              {(initialData?.imageBase64 || initialData?.imageAssetId) && (
                <div className="flex items-center gap-3 p-2 pr-3 bg-surface-soft border border-hairline rounded-xl">
                  <div className="size-12 rounded-lg overflow-hidden bg-surface-800 flex-shrink-0">
                    {initialData?.imageBase64 && (
                      <img src={b64Src(initialData.imageBase64)} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow">Render principal</p>
                    <p className="text-meta text-ink-muted truncate mt-0.5">
                      {initialData?.prompt || 'Imagen asignada al render principal'}
                    </p>
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
                      onClick={() => handleKindSelect(k)}
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
                  onKeyDown={(e) => { if (e.key === 'Enter' && canContinue) setStep(1) }}
                />
              </div>
            </div>
          )}

          {step === 1 && kind && (
            <div className="space-y-5 max-h-[420px] overflow-y-auto -mr-2 pr-2">
              {ELEMENT_PROPERTIES[kind].map((prop) => (
                <PropertySelector
                  key={prop.key}
                  label={prop.label}
                  options={prop.options}
                  value={properties[prop.key] || ''}
                  onChange={(v) => setProperties((p) => withProperty(p, prop.key, v))}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-hairline">
          <button onClick={step === 0 ? onClose : () => setStep(0)} className="btn-ghost">
            {step === 0 ? 'Cancelar' : 'Atrás'}
          </button>
          {step === 0 ? (
            <button onClick={() => setStep(1)} disabled={!canContinue} className="btn-primary">
              Siguiente
            </button>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  )
}
