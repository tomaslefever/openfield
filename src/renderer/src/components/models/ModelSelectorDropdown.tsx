import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Wand2,
  Sparkles,
  Video,
  AudioLines,
  Bot,
  ChevronDown,
  ChevronUp,
  Check,
  Search,
  Cpu,
} from 'lucide-react'
import {
  ModelPricing,
  IMAGE_MODELS,
  VIDEO_MODELS,
  AUDIO_MODELS,
  LLM_MODELS,
  unitPrice,
} from '../../lib/models'

interface Props {
  kind: 'image' | 'video' | 'audio' | 'llm'
  selectedModelId: string
  onSelect: (model: ModelPricing, modelId: string) => void
  disabled?: boolean
  className?: string
  compact?: boolean
  showCost?: boolean
  resolution?: string
  filterProvider?: 'kie' | 'fal' | 'replicate' | 'elevenlabs'
  dropUp?: boolean
}

export function ModelSelectorDropdown({
  kind,
  selectedModelId,
  onSelect,
  disabled = false,
  className = '',
  compact = false,
  showCost = true,
  resolution,
  filterProvider,
  dropUp = false,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const allModels = useMemo(() => {
    let list: ModelPricing[] = []
    if (kind === 'image') list = IMAGE_MODELS
    else if (kind === 'video') list = VIDEO_MODELS
    else if (kind === 'audio') list = AUDIO_MODELS
    else if (kind === 'llm') list = LLM_MODELS

    if (filterProvider) {
      list = list.filter((m) => (m.provider || 'kie') === filterProvider)
    }
    return list
  }, [kind, filterProvider])

  const selectedModel = useMemo(() => {
    return (
      allModels.find(
        (m) =>
          m.t2iId === selectedModelId ||
          m.i2iId === selectedModelId ||
          m.t2vId === selectedModelId ||
          m.i2vId === selectedModelId ||
          m.t2aId === selectedModelId ||
          m.modelId === selectedModelId ||
          m.name === selectedModelId
      ) || allModels[0]
    )
  }, [allModels, selectedModelId])

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return allModels
    const q = searchQuery.toLowerCase().trim()
    return allModels.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        (m.provider && m.provider.toLowerCase().includes(q))
    )
  }, [allModels, searchQuery])

  // Group models by provider exactly as in PromptComposer.tsx
  const groups = useMemo(() => {
    const list = [
      {
        label: 'KIE.ai',
        items: filteredModels.filter(
          (m) => !m.local && m.provider !== 'replicate' && m.provider !== 'fal' && m.provider !== 'elevenlabs'
        ),
      },
      {
        label: 'fal.ai',
        items: filteredModels.filter((m) => m.provider === 'fal'),
      },
      {
        label: 'Replicate',
        items: filteredModels.filter((m) => m.provider === 'replicate'),
      },
      {
        label: 'ElevenLabs',
        items: filteredModels.filter((m) => m.provider === 'elevenlabs'),
      },
      {
        label: 'Local',
        items: filteredModels.filter((m) => m.local),
      },
    ]
    return list.filter((g) => g.items.length > 0)
  }, [filteredModels])

  const currentPrice = useMemo(() => {
    if (!selectedModel || kind === 'llm') return null
    const cost = unitPrice(selectedModel, resolution)
    return `$${cost.toFixed(3)}${selectedModel.unit === 's' ? '/s' : ''}`
  }, [selectedModel, resolution, kind])

  const Icon =
    kind === 'image'
      ? Wand2
      : kind === 'video'
      ? Video
      : kind === 'audio'
      ? AudioLines
      : Bot

  const handleSelectModel = (m: ModelPricing) => {
    const primaryId =
      kind === 'image'
        ? m.t2iId || m.name
        : kind === 'video'
        ? m.i2vId || m.t2vId || m.name
        : kind === 'audio'
        ? m.t2aId || m.name
        : m.modelId || m.name
    onSelect(m, primaryId)
    setIsOpen(false)
    setSearchQuery('')
  }

  const isModelActive = (m: ModelPricing) => {
    return (
      m.name === selectedModel?.name ||
      m.t2iId === selectedModelId ||
      m.i2iId === selectedModelId ||
      m.t2vId === selectedModelId ||
      m.i2vId === selectedModelId ||
      m.t2aId === selectedModelId ||
      m.modelId === selectedModelId
    )
  }

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-1.5 bg-surface-800/90 hover:bg-surface-700/90 border border-surface-700/80 hover:border-surface-600 rounded-lg text-surface-200 transition-colors ${
          compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs'
        } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <Icon size={compact ? 12 : 13} className="text-accent-400 flex-shrink-0" />
        <span className="font-medium truncate max-w-[150px]">
          {selectedModel?.name || 'Seleccionar Modelo'}
        </span>

        {/* Provider Tag */}
        {selectedModel?.provider === 'replicate' ? (
          <span className="text-[9px] px-1 py-0.5 rounded bg-violet-500/20 text-violet-400 font-semibold uppercase">
            Replicate
          </span>
        ) : selectedModel?.provider === 'fal' ? (
          <span className="text-[9px] px-1 py-0.5 rounded bg-sky-500/20 text-sky-400 font-semibold uppercase">
            FAL
          </span>
        ) : selectedModel?.provider === 'elevenlabs' ? (
          <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold uppercase">
            ElevenLabs
          </span>
        ) : selectedModel?.local ? (
          <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/20 text-green-500 font-semibold flex items-center gap-0.5">
            <Cpu size={9} /> LOCAL
          </span>
        ) : (
          <span className="text-[9px] px-1 py-0.5 rounded bg-accent-500/20 text-accent-400 font-semibold uppercase">
            KIE
          </span>
        )}

        {showCost && currentPrice && (
          <span className="text-[10px] text-surface-400 font-mono hidden sm:inline ml-0.5">
            ({currentPrice})
          </span>
        )}

        {isOpen ? (
          <ChevronUp size={12} className="text-surface-400 ml-0.5 flex-shrink-0" />
        ) : (
          <ChevronDown size={12} className="text-surface-400 ml-0.5 flex-shrink-0" />
        )}
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute ${
            dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } left-0 bg-surface-900 border border-surface-700 rounded-xl py-1 min-w-[260px] w-max max-w-[340px] shadow-2xl z-50 overflow-hidden flex flex-col`}
          style={{ maxHeight: '340px' }}
        >
          {/* Quick Search */}
          <div className="p-2 border-b border-surface-800 bg-surface-950/40">
            <div className="relative flex items-center">
              <Search size={12} className="absolute left-2.5 text-surface-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar modelo..."
                className="w-full bg-surface-800 text-xs text-surface-200 pl-7 pr-2.5 py-1 rounded-lg border border-surface-700/80 outline-none focus:border-accent-500 placeholder:text-surface-500"
                autoFocus
              />
            </div>
          </div>

          {/* Grouped Model List */}
          <div className="overflow-y-auto max-h-[280px] divide-y divide-surface-800/60">
            {groups.length === 0 ? (
              <div className="p-4 text-center text-xs text-surface-500">
                No se encontraron modelos
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.label} className="py-1">
                  <div className="px-3 pt-1.5 pb-1 text-[9px] uppercase tracking-wider text-surface-500 font-semibold flex items-center justify-between">
                    <span>{g.label}</span>
                    <span className="text-[9px] font-mono text-surface-600">
                      {g.items.length} {g.items.length === 1 ? 'modelo' : 'modelos'}
                    </span>
                  </div>
                  {g.items.map((m) => {
                    const active = isModelActive(m)
                    const cost = unitPrice(m, resolution)
                    const costDisplay =
                      kind === 'llm'
                        ? ''
                        : m.provider === 'replicate' || m.provider === 'fal'
                        ? `$${cost.toFixed(3)}/${m.unit === 's' ? 's' : 'img'}`
                        : `${Math.round(cost * 200)} cr`

                    return (
                      <button
                        key={`${g.label}-${m.name}`}
                        type="button"
                        onClick={() => handleSelectModel(m)}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between gap-2 ${
                          active
                            ? 'text-accent-400 bg-accent-500/10 font-medium'
                            : 'text-surface-300 hover:text-surface-100 hover:bg-surface-800/70'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {active ? (
                            <Check size={12} className="text-accent-400 flex-shrink-0" />
                          ) : (
                            <div className="w-3" />
                          )}
                          <span className="truncate">{m.name}</span>
                          <span
                            className={`text-[10px] flex-shrink-0 ${
                              m.local ? 'text-green-500/80' : 'text-surface-500'
                            }`}
                          >
                            {m.local ? (
                              <>
                                <Cpu size={9} className="inline mr-0.5" />
                                Local
                              </>
                            ) : (
                              m.category
                            )}
                          </span>
                          {m.refTags && (
                            <span className="text-[8px] px-1 py-0.2 rounded bg-cyan-500/15 text-cyan-400 font-semibold">
                              @TAGS
                            </span>
                          )}
                        </div>

                        {costDisplay && (
                          <span className="text-amber-400/90 text-[10px] font-mono flex-shrink-0">
                            {costDisplay}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
