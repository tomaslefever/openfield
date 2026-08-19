import { useState } from 'react'
import {
  X, User, Box, Mountain, UserCircle,
  ArrowLeft, Sparkles, Check,
} from 'lucide-react'
import { useElementsStore, type ElementKind, KIND_CONFIG } from '../stores/elements-store'

const KIND_ICONS: Record<ElementKind, typeof User> = {
  avatar: UserCircle,
  character: User,
  environment: Mountain,
  object: Box,
}

const KIND_COLORS: Record<ElementKind, { border: string; bg: string; text: string; glow: string }> = {
  avatar: { border: 'border-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-400', glow: 'shadow-violet-500/20' },
  character: { border: 'border-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400', glow: 'shadow-blue-500/20' },
  environment: { border: 'border-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400', glow: 'shadow-emerald-500/20' },
  object: { border: 'border-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400', glow: 'shadow-amber-500/20' },
}

interface PropertyConfig {
  label: string
  key: string
  options: string[]
}

const ELEMENT_PROPERTIES: Record<ElementKind, PropertyConfig[]> = {
  character: [
    { label: 'Style', key: 'style', options: ['None', 'Hollywood', 'Anime', '3D (Pixar)', '3D Games', 'Cartoon', 'Comic', 'Fantasy', 'Sci-Fi'] },
    { label: 'Gender', key: 'gender', options: ['Any', 'Male', 'Female', 'Non-binary'] },
    { label: 'Age', key: 'age', options: ['Any', 'Child', 'Teen', 'Young Adult', 'Adult', 'Elder'] },
    { label: 'Body Type', key: 'bodyType', options: ['Any', 'Slim', 'Athletic', 'Average', 'Heavy', 'Muscular'] },
    { label: 'Hair Style', key: 'hairStyle', options: ['Any', 'Short', 'Long', 'Curly', 'Straight', 'Bald', 'Ponytail', 'Braided', 'Afro'] },
    { label: 'Ethnicity', key: 'ethnicity', options: ['Any', 'Caucasian', 'African', 'Asian', 'Hispanic', 'Middle Eastern', 'Indian', 'Mixed'] },
    { label: 'Outfit', key: 'outfit', options: ['Any', 'Casual', 'Formal', 'Streetwear', 'Fantasy', 'Sci-Fi', 'Medieval', 'Military', 'Business'] },
  ],
  avatar: [
    { label: 'Style', key: 'style', options: ['Realistic', 'UGC', 'Streamer', 'Adventurer', 'Anime', '3D Cartoon', 'Voxel', 'Pixel Art', 'Cyberpunk'] },
    { label: 'Format', key: 'format', options: ['Full Body', 'Half Body', 'Headshot', 'Bust'] },
    { label: 'Expression', key: 'expression', options: ['Neutral', 'Happy', 'Serious', 'Playful', 'Mysterious', 'Confident'] },
    { label: 'Background', key: 'background', options: ['None', 'Studio', 'Outdoor', 'Cyberpunk', 'Fantasy', 'Minimal', 'Gradient'] },
    { label: 'Outfit', key: 'outfit', options: ['Casual', 'Formal', 'Streetwear', 'Fantasy', 'Sci-Fi', 'Sportswear', 'Business'] },
    { label: 'Lighting', key: 'lighting', options: ['Studio', 'Natural', 'Neon', 'Dramatic', 'Soft', 'Rim Light'] },
  ],
  environment: [
    { label: 'Style', key: 'style', options: ['Realistic', 'Animation', '3D Games', '3D Pixar', 'Oil Painting', 'Watercolor', 'Sketch', 'Cyberpunk'] },
    { label: 'Type', key: 'type', options: ['Indoor', 'Outdoor', 'Urban', 'Nature', 'Fantasy', 'Sci-Fi', 'Historical', 'Abstract'] },
    { label: 'Time', key: 'time', options: ['Day', 'Night', 'Sunset', 'Dawn', 'Golden Hour', 'Overcast'] },
    { label: 'Season', key: 'season', options: ['Any', 'Spring', 'Summer', 'Autumn', 'Winter'] },
    { label: 'Mood', key: 'mood', options: ['Any', 'Peaceful', 'Mysterious', 'Epic', 'Cozy', 'Dark', 'Vibrant', 'Minimalist'] },
    { label: 'Climate', key: 'climate', options: ['Any', 'Tropical', 'Desert', 'Arctic', 'Temperate', 'Rainy', 'Foggy'] },
  ],
  object: [
    { label: 'Style', key: 'style', options: ['Realistic', 'Animation', '3D Games', '3D Pixar', 'Sketch', 'Minimalist', 'Stylized', 'Low Poly'] },
    { label: 'Type', key: 'type', options: ['Weapon', 'Tool', 'Furniture', 'Vehicle', 'Jewelry', 'Food', 'Electronic', 'Clothing', 'Artifact', 'Prop'] },
    { label: 'Material', key: 'material', options: ['Any', 'Metal', 'Wood', 'Glass', 'Fabric', 'Stone', 'Plastic', 'Organic', 'Ceramic'] },
    { label: 'Era', key: 'era', options: ['Any', 'Ancient', 'Medieval', 'Victorian', 'Modern', 'Futuristic', 'Post-Apocalyptic'] },
    { label: 'Color Palette', key: 'colorPalette', options: ['Any', 'Warm', 'Cool', 'Neutral', 'Vibrant', 'Dark', 'Pastel', 'Metallic'] },
  ],
}

interface Props {
  onClose: () => void
  initialData?: {
    imageBase64?: string
    imageAssetId?: string
    prompt?: string
    name?: string
  }
}

interface TypeCardProps {
  kind: ElementKind
  label: string
  selected: boolean
  onClick: () => void
}

function TypeCard({ kind, label, selected, onClick }: TypeCardProps) {
  const Icon = KIND_ICONS[kind]
  const colors = KIND_COLORS[kind]

  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-center gap-3 p-6 rounded-2xl
        border-2 transition-all duration-300 cursor-pointer aspect-square
        group
        ${selected
          ? `${colors.border} ${colors.bg} ${colors.glow} shadow-lg scale-[1.02]`
          : 'border-surface-700 bg-surface-800/30 hover:border-surface-600 hover:bg-surface-800/60 hover:scale-[1.02] hover:shadow-lg hover:shadow-surface-950/50'
        }
      `}
    >
      {selected && (
        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-accent-500 flex items-center justify-center">
          <Check size={12} className="text-white" />
        </div>
      )}
      <div className={`
        w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300
        ${selected ? `${colors.bg} ${colors.text}` : 'bg-surface-700/60 text-surface-400 group-hover:bg-surface-700 group-hover:text-surface-200'}
      `}>
        <Icon
          size={36}
          className={`transition-transform duration-300 ${selected ? '' : 'group-hover:scale-110'}`}
        />
      </div>
      <span className={`
        text-sm font-semibold transition-colors duration-300
        ${selected ? colors.text : 'text-surface-400 group-hover:text-surface-200'}
      `}>
        {label}
      </span>
    </button>
  )
}

function PropertySelector({
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
  const isCustom = value && !options.includes(value)

  return (
    <div>
      <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1.5 block">{label}</label>
      <div className="flex gap-1.5 flex-wrap">
        {options.map((opt) => {
          const isSelected = value === opt || (value === '' && opt === 'None') || (value === '' && opt === 'Any')
          return (
            <button
              key={opt}
              onClick={() => { onChange(opt === 'None' || opt === 'Any' ? '' : opt); setCustomMode(false) }}
              className={`
                px-2.5 py-1 rounded-lg text-[11px] transition-all duration-200
                ${isSelected
                  ? 'bg-accent-500/20 text-accent-400 border border-accent-500/40'
                  : 'bg-surface-800/50 text-surface-400 hover:text-surface-200 hover:bg-surface-700/60 border border-transparent'
                }
              `}
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
              if (e.key === 'Enter' && customValue.trim()) {
                onChange(customValue.trim())
                setCustomMode(false)
                setCustomValue('')
              }
              if (e.key === 'Escape') {
                setCustomMode(false)
                setCustomValue('')
              }
            }}
            onBlur={() => {
              if (customValue.trim()) {
                onChange(customValue.trim())
              }
              setCustomMode(false)
              setCustomValue('')
            }}
            placeholder="Custom..."
            className="px-2.5 py-1 rounded-lg text-[11px] bg-surface-800/50 text-surface-200 border border-accent-500/40 focus:outline-none focus:border-accent-500 w-28 placeholder-surface-500"
          />
        ) : (
          <button
            onClick={() => setCustomMode(true)}
            className={`
              px-2.5 py-1 rounded-lg text-[11px] transition-all duration-200
              ${isCustom
                ? 'bg-accent-500/20 text-accent-400 border border-accent-500/40'
                : 'bg-surface-800/50 text-surface-500 hover:text-surface-200 hover:bg-surface-700/60 border border-dashed border-surface-600'
              }
            `}
          >
            {isCustom ? value : 'Custom'}
          </button>
        )}
      </div>
    </div>
  )
}

export function ElementWizard({ onClose, initialData }: Props) {
  const addElement = useElementsStore((s) => s.addElement)
  const [step, setStep] = useState(0)
  const [kind, setKind] = useState<ElementKind | null>(null)
  const [name, setName] = useState(initialData?.name || '')
  const [properties, setProperties] = useState<Record<string, string>>({})

  const handleKindSelect = (k: ElementKind) => {
    setKind(k)
    setProperties({})
  }

  const handlePropertyChange = (key: string, value: string) => {
    setProperties((prev) => {
      if (value === '') {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: value }
    })
  }

  const handleNext = () => {
    if (!kind || !name.trim()) return
    setStep(1)
  }

  const handleCreate = () => {
    if (!kind || !name.trim()) return
    const style = properties['style'] || ''
    addElement({
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
      style,
      properties,
    })
    onClose()
  }

  const selectedLabel = kind ? KIND_CONFIG[kind].label : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div
        className="bg-surface-900 border border-surface-800 rounded-2xl w-full max-w-xl mx-4 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
          <div className="flex items-center gap-3">
            {step === 1 && (
              <button
                onClick={() => setStep(0)}
                className="text-surface-400 hover:text-surface-100 transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="w-8 h-8 rounded-xl bg-accent-500/10 flex items-center justify-center">
              <Sparkles size={16} className="text-accent-400" />
            </div>
            <h2 className="text-sm font-semibold text-surface-100">
              {step === 0 ? 'Nuevo Elemento' : `Configurar ${selectedLabel}`}
            </h2>
          </div>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-100">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {step === 0 && (
            <div className="space-y-5">
              {initialData?.imageBase64 && (
                <div className="flex items-center gap-3 p-3 bg-surface-800/40 border border-surface-700 rounded-xl">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-surface-800 flex-shrink-0">
                    <img
                      src={`data:image/png;base64,${initialData.imageBase64}`}
                      alt="Reference"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-0.5">Imagen de referencia</p>
                    <p className="text-xs text-surface-300 truncate">
                      {initialData.prompt
                        ? initialData.prompt.length > 80 ? initialData.prompt.substring(0, 80) + '...' : initialData.prompt
                        : 'Imagen generada'}
                    </p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {(['avatar', 'character', 'environment', 'object'] as ElementKind[]).map((k) => (
                  <TypeCard
                    key={k}
                    kind={k}
                    label={KIND_CONFIG[k].label}
                    selected={kind === k}
                    onClick={() => handleKindSelect(k)}
                  />
                ))}
              </div>

              <div>
                <label className="text-[10px] text-surface-500 uppercase tracking-wider mb-1.5 block">Nombre</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre del elemento..."
                  className="input-field text-base py-3 px-4"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleNext() }}
                />
              </div>
            </div>
          )}

          {step === 1 && kind && (
            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
              {ELEMENT_PROPERTIES[kind].map((prop) => (
                <PropertySelector
                  key={prop.key}
                  label={prop.label}
                  options={prop.options}
                  value={properties[prop.key] || ''}
                  onChange={(v) => handlePropertyChange(prop.key, v)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-surface-800 bg-surface-950/50">
          {step === 0 ? (
            <>
              <button onClick={onClose} className="btn-ghost text-xs">Cancelar</button>
              <button
                onClick={handleNext}
                disabled={!kind || !name.trim()}
                className="btn-primary text-xs"
              >
                Siguiente
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStep(0)} className="btn-ghost text-xs">Atrás</button>
              <button
                onClick={handleCreate}
                disabled={!name.trim()}
                className="btn-primary text-xs"
              >
                Crear elemento
              </button>
            </>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 pb-3">
          <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${step === 0 ? 'bg-accent-500' : 'bg-surface-600'}`} />
          <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${step === 1 ? 'bg-accent-500' : 'bg-surface-600'}`} />
        </div>
      </div>
    </div>
  )
}
