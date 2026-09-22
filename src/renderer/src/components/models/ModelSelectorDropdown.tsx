import { useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  ModelPricing,
  IMAGE_MODELS,
  VIDEO_MODELS,
  AUDIO_MODELS,
  LLM_MODELS,
  unitPrice,
  cleanModelName,
} from '../../lib/models'
import { Selector } from '../ui/Selector'
import { SelectorOption } from '../ui/SelectorOption'
import { ProviderLogo, getProviderForModel } from '../icons/ProviderLogos'
import {
  useProvidersStore,
  isModelConfigured,
  PROVIDER_DEFS,
  type ProviderId,
} from '../../stores/providers-store'
import { cn } from '@/lib/utils'

interface Props {
  kind: 'image' | 'video' | 'audio' | 'llm'
  selectedModelId: string
  onSelect: (model: ModelPricing, modelId: string) => void
  disabled?: boolean
  className?: string
  compact?: boolean
  showCost?: boolean
  resolution?: string
  filterProvider?: ProviderId
  onlyConfigured?: boolean
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
  onlyConfigured = false,
  dropUp = false,
}: Props) {
  const { configuredProviders } = useProvidersStore()

  const allModels = useMemo(() => {
    let list: ModelPricing[] = []
    if (kind === 'image') list = IMAGE_MODELS
    else if (kind === 'video') list = VIDEO_MODELS
    else if (kind === 'audio') list = AUDIO_MODELS
    else if (kind === 'llm') list = LLM_MODELS

    if (filterProvider) {
      list = list.filter((m) => (m.provider || 'kie') === filterProvider)
    }

    // Only show integrated/configured models for LLM or when requested
    if (onlyConfigured || kind === 'llm') {
      list = list.filter((m) => isModelConfigured(m, configuredProviders))
    }

    return list
  }, [kind, filterProvider, onlyConfigured, configuredProviders])

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
      ) || (allModels.length > 0 ? allModels[0] : null)
    )
  }, [allModels, selectedModelId])

  const getModelId = (m: ModelPricing) => {
    return (
      (kind === 'image'
        ? m.t2iId || m.name
        : kind === 'video'
        ? m.i2vId || m.t2vId || m.name
        : kind === 'audio'
        ? m.t2aId || m.name
        : m.modelId || m.name) || m.name
    )
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

  // Groups by provider with official logos (dynamic iteration over PROVIDER_DEFS)
  const groups = useMemo(() => {
    return PROVIDER_DEFS.map((p) => ({
      id: p.id,
      label: (
        <div className="flex items-center gap-1.5">
          <ProviderLogo provider={p.id} size={13} />
          <span>{p.label}</span>
        </div>
      ),
      items: allModels.filter((m) => (m.provider || 'kie') === p.id),
    })).filter((g) => g.items.length > 0)
  }, [allModels])

  const currentPrice = useMemo(() => {
    if (!selectedModel || kind === 'llm') return null
    const cost = unitPrice(selectedModel, resolution)
    return `$${cost.toFixed(3)}${selectedModel.unit === 's' ? '/s' : ''}`
  }, [selectedModel, resolution, kind])

  const handleSelectModel = (_value: string, m: ModelPricing) => {
    const primaryId = getModelId(m)
    onSelect(m, primaryId)
  }

  return (
    <Selector<ModelPricing>
      className={className}
      groups={groups}
      value={selectedModel ? getModelId(selectedModel) : ''}
      getOptionValue={getModelId}
      getOptionLabel={(m) => cleanModelName(m.name)}
      onChange={handleSelectModel}
      disabled={disabled}
      dropUp={dropUp}
      searchPlaceholder="Buscar modelo..."
      emptyMessage="No hay modelos disponibles con proveedor configurado"
      filterOption={(m, q) => {
        const query = q.toLowerCase().trim()
        return (
          m.name.toLowerCase().includes(query) ||
          m.category.toLowerCase().includes(query) ||
          (m.provider ? m.provider.toLowerCase().includes(query) : false)
        )
      }}
      renderTrigger={(_selected, isOpen) => (
        <button
          type="button"
          disabled={disabled || allModels.length === 0}
          className={cn(
            'flex items-center gap-2 bg-surface-900/90 hover:bg-surface-800/90 border border-surface-700/80 hover:border-surface-600 rounded-lg text-surface-200 transition-all duration-150 shadow-sm cursor-pointer select-none',
            compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs',
            isOpen && 'ring-2 ring-accent-500/40 border-accent-500 bg-surface-800',
            (disabled || allModels.length === 0) && 'opacity-50 pointer-events-none'
          )}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="flex size-4 shrink-0 items-center justify-center">
              <ProviderLogo provider={getProviderForModel(selectedModel)} size={compact ? 13 : 14} />
            </span>
            <span className="font-medium truncate max-w-[140px] text-surface-100">
              {cleanModelName(selectedModel?.name) || (allModels.length === 0 ? 'Sin proveedor integrado' : 'Seleccionar Modelo')}
            </span>
          </div>

          {/* Cost badge display */}
          {showCost && currentPrice && (
            <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/25 text-amber-300 hidden sm:inline-flex items-center shrink-0">
              {currentPrice}
            </span>
          )}

          <ChevronDown
            size={12}
            className={cn(
              'text-surface-400 ml-0.5 flex-shrink-0 transition-transform duration-150',
              isOpen && 'rotate-180 text-surface-200'
            )}
          />
        </button>
      )}
      renderOption={(m, { selected }) => {
        const active = selected || isModelActive(m)
        const cost = unitPrice(m, resolution)
        const costDisplay =
          kind === 'llm'
            ? ''
            : m.provider === 'replicate' || m.provider === 'fal' || m.provider === 'machgen' || m.provider === 'higgsfield'
            ? `$${cost.toFixed(3)}/${m.unit === 's' ? 's' : 'img'}`
            : `${Math.round(cost * 200)} cr`

        const descriptionText = m.local
          ? 'Modelo Local en GPU'
          : `${m.category}${m.resolutions && m.resolutions.length > 0 ? ` • ${m.resolutions.join(', ')}` : ''}`

        const providerId = getProviderForModel(m)

        return (
          <SelectorOption
            icon={<ProviderLogo provider={providerId} size={15} />}
            label={cleanModelName(m.name)}
            description={descriptionText}
            layout="stacked"
            selected={active}
            size="sm"
            endContent={
              costDisplay ? (
                <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/25 text-amber-300 shrink-0 shadow-xs">
                  {costDisplay}
                </span>
              ) : null
            }
          />
        )
      }}
    />
  )
}
