import { useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  ModelPricing,
  IMAGE_MODELS,
  VIDEO_MODELS,
  AUDIO_MODELS,
  LLM_MODELS,
  unitPrice,
} from '../../lib/models'
import { Selector } from '../ui/Selector'
import { SelectorOption } from '../ui/SelectorOption'
import { ProviderLogo, getProviderForModel } from '../icons/ProviderLogos'
import { PROVIDER_DEFS, type ProviderId } from '../../stores/providers-store'
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

  const renderProviderBadge = (m: ModelPricing) => {
    const p = getProviderForModel(m)
    const badgeConfigs: Record<string, { label: string; className: string }> = {
      replicate: {
        label: 'Replicate',
        className: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
      },
      fal: {
        label: 'FAL',
        className: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      },
      machgen: {
        label: 'MachGen',
        className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      },
      higgsfield: {
        label: 'Higgsfield',
        className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      },
      elevenlabs: {
        label: 'ElevenLabs',
        className: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
      },
      local: {
        label: 'LOCAL',
        className: 'bg-green-500/15 text-green-300 border-green-500/30',
      },
      kie: {
        label: 'KIE',
        className: 'bg-accent-500/15 text-accent-300 border-accent-500/30',
      },
    }

    const cfg = badgeConfigs[p] || badgeConfigs.kie

    return (
      <span
        className={cn(
          'text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider flex items-center gap-1 shrink-0',
          cfg.className
        )}
      >
        <ProviderLogo provider={p} size={10} />
        <span>{cfg.label}</span>
      </span>
    )
  }

  return (
    <Selector<ModelPricing>
      className={className}
      groups={groups}
      value={selectedModel ? getModelId(selectedModel) : ''}
      getOptionValue={getModelId}
      getOptionLabel={(m) => m.name}
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
              {selectedModel?.name || (allModels.length === 0 ? 'Sin proveedor' : 'Seleccionar Modelo')}
            </span>
          </div>

          {/* Provider Badge */}
          {selectedModel && renderProviderBadge(selectedModel)}

          {/* Cost display */}
          {showCost && currentPrice && (
            <span className="text-[10px] text-surface-400 font-mono hidden sm:inline ml-0.5">
              ({currentPrice})
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
            label={m.name}
            description={descriptionText}
            layout="stacked"
            selected={active}
            size="sm"
            endContent={
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {m.refTags && (
                  <span className="text-[8px] px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-semibold">
                    @TAGS
                  </span>
                )}
                {renderProviderBadge(m)}
                {costDisplay && (
                  <span className="text-amber-400/90 text-[10px] font-mono flex-shrink-0 ml-1">
                    {costDisplay}
                  </span>
                )}
              </div>
            }
          />
        )
      }}
    />
  )
}
