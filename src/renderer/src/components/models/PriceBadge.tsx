import { useRef, useState } from 'react'
import { CREDITS_PER_DOLLAR, type ModelPricing } from '../../lib/models'
import { ViewportPopover } from '../ui/ViewportPopover'

/** KIE bills in credits; every other provider in dollars. */
function billsInCredits(model: ModelPricing): boolean {
  return (model.provider || 'kie') === 'kie' && !model.local
}

function unitSuffix(model: ModelPricing): string {
  return model.unit === 's' ? '/s' : model.unit === 'video' ? '/video' : '/img'
}

function formatCost(model: ModelPricing, cost: number): string {
  return billsInCredits(model) ? `${Math.round(cost * CREDITS_PER_DOLLAR)} cr` : `$${cost.toFixed(3)}`
}

/**
 * Price badge for a model. On hover it lists the price of every resolution the model offers:
 * per second for video models, per image for image models.
 */
export function PriceBadge({ model, label, activeResolution }: {
  model: ModelPricing
  /** Text shown in the badge itself */
  label: string
  /** Resolution to highlight in the list (the one currently selected) */
  activeResolution?: string
}) {
  const [hover, setHover] = useState(false)
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const prices = model.prices || []
  const unitLabel = model.unit === 's' ? 'por segundo' : model.unit === 'video' ? 'por video' : 'por imagen'

  return (
    <span
      ref={anchorRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300 shrink-0 shadow-xs cursor-help"
    >
      {label}
      {hover && prices.length > 0 && (
        <ViewportPopover anchor={anchorRef.current} className="p-2">
          <div className="min-w-[170px] font-sans">
            <p className="eyebrow mb-1.5">
              Precio {unitLabel}
            </p>
            <div className="space-y-0.5">
              {prices.map((p) => {
                const active = !!activeResolution && p.resolution === activeResolution
                return (
                  <div
                    key={p.resolution || 'default'}
                    className={`flex items-center justify-between gap-4 px-1.5 py-0.5 rounded text-[11px] ${active ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200' : 'text-surface-300'}`}
                  >
                    <span>{p.resolution || 'Estándar'}</span>
                    <span className="font-mono text-amber-700 dark:text-amber-300">
                      {formatCost(model, p.cost)}
                      <span className="text-surface-500">{unitSuffix(model)}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </ViewportPopover>
      )}
    </span>
  )
}
