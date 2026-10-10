import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Scale, X, Trophy, Video, Image as ImageIcon, KeyRound, Power, Check, Loader, ExternalLink } from 'lucide-react'
import { VIDEO_MODELS, IMAGE_MODELS, calcVideoCost, calcCost, cleanModelName, type ModelPricing } from '../../lib/models'
import { ProviderLogo, getProviderForModel } from '../icons/ProviderLogos'
import { useProvidersStore, isModelConfigured, PROVIDER_DEFS, type ProviderId } from '../../stores/providers-store'
import { cn } from '@/lib/utils'
import { PRICE_COMPARISONS, comparisonModelId, type ComparisonKind } from '../../lib/price-comparisons'

const DURATIONS = [5, 10, 15]
const IMAGE_COUNTS = [1, 4, 10]

interface Props {
  /** Comparison opened first (defaults to the first one of `initialKind`) */
  initialComparisonId?: string
  /** Tab opened first when no comparison is given */
  initialKind?: ComparisonKind
  onClose: () => void
  /** Pick a provider's model at a resolution (the model's own resolution label, e.g. '768P') */
  onUse?: (model: ModelPricing, resolution: string) => void
}

const firstOfKind = (kind: ComparisonKind) => PRICE_COMPARISONS.find(c => c.kind === kind) || PRICE_COMPARISONS[0]

export function PriceComparatorModal({ initialComparisonId, initialKind = 'video', onClose, onUse }: Props) {
  const { configuredProviders, keys, disabledProviders, setKey, setProviderEnabled } = useProvidersStore()
  const [comparisonId, setComparisonId] = useState(initialComparisonId || firstOfKind(initialKind).id)
  const [seconds, setSeconds] = useState(5)
  const [imageCount, setImageCount] = useState(1)
  const [withInputVideo, setWithInputVideo] = useState(false)
  const [onlyConfigured, setOnlyConfigured] = useState(false)
  // Quick setup: inline API key editor for one provider, opened from its row
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)

  const startConfigure = (providerId: string) => {
    setEditingProvider(providerId)
    setKeyDraft('')
    setKeyError(null)
  }

  const cancelConfigure = () => {
    setEditingProvider(null)
    setKeyDraft('')
    setKeyError(null)
  }

  const saveKey = async () => {
    const def = PROVIDER_DEFS.find(p => p.id === editingProvider)
    const value = keyDraft.trim()
    if (!def || !value) return
    setSavingKey(true)
    setKeyError(null)
    try {
      await setKey(def.id, def.keyName, value)
      cancelConfigure()
    } catch (err: any) {
      setKeyError(err?.message || 'No se pudo guardar la API key')
    } finally {
      setSavingKey(false)
    }
  }

  useEffect(() => {
    // Escape inside the key editor only closes the editor (it calls preventDefault)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const comparison = PRICE_COMPARISONS.find(c => c.id === comparisonId) || PRICE_COMPARISONS[0]
  const isVideo = comparison.kind === 'video'
  const quantity = isVideo ? seconds : imageCount

  const rows = useMemo(() => {
    const providerOrder = PROVIDER_DEFS.map(p => p.id as string)
    const catalog = comparison.kind === 'video' ? VIDEO_MODELS : IMAGE_MODELS
    return comparison.modelIds
      .map(id => catalog.find(m => comparisonModelId(m, comparison.kind) === id))
      .filter((m): m is ModelPricing => !!m)
      .map(model => {
        const configured = isModelConfigured(model, configuredProviders)
        const supported = model.resolutions?.length ? model.resolutions : model.prices.map(p => p.resolution)
        // Keyed by the comparison's lowercase column; `label` is the model's own spelling
        const cells: Record<string, { unit: number; total: number; label: string } | null> = {}
        for (const res of comparison.resolutions) {
          const label = supported.find(r => r.toLowerCase() === res)
          if (!label) { cells[res] = null; continue }
          // Same cost formulas the composer uses (token pricing, video-input rates, ...)
          const total = comparison.kind === 'video'
            ? calcVideoCost(model, {
                resolution: label,
                aspectRatio: '16:9',
                requestedSeconds: seconds,
                inputVideoSeconds: withInputVideo ? seconds : 0,
              }).totalDollars
            : calcCost(model, label, undefined, imageCount).totalDollars
          cells[res] = { unit: total / quantity, total, label }
        }
        const provider = getProviderForModel(model)
        // Disabled and keyless providers stay listed; `configured` only gates using a price
        const hasKey = !!keys[provider]
        const enabled = !disabledProviders.includes(provider)
        return { model, provider, configured, hasKey, enabled, cells }
      })
      .filter(r => !onlyConfigured || r.configured)
      .sort((a, b) => providerOrder.indexOf(a.provider) - providerOrder.indexOf(b.provider))
  }, [comparison, seconds, imageCount, quantity, withInputVideo, onlyConfigured, configuredProviders, keys, disabledProviders])

  // Cheapest provider per resolution
  const best = useMemo(() => {
    const out: Record<string, number> = {}
    for (const res of comparison.resolutions) {
      const totals = rows.map(r => r.cells[res]?.total).filter((t): t is number => t != null && t > 0)
      if (totals.length > 1) out[res] = Math.min(...totals)
    }
    return out
  }, [rows, comparison])

  const providerLabel = (id: string) => PROVIDER_DEFS.find(p => p.id === id)?.label || id
  const unitSuffix = isVideo ? '/s' : '/img'

  return createPortal(
    <div className="modal-scrim z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="modal-surface w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-hairline">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-surface-soft flex items-center justify-center">
              <Scale size={17} className="text-ink" />
            </div>
            <div>
              <h2 className="text-title text-ink">Comparador de precios</h2>
              <p className="text-meta text-ink-muted">
                {isVideo ? 'Precio por segundo de vídeo generado en cada proveedor' : 'Precio por imagen generada en cada proveedor'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Kind tabs */}
            <div className="flex gap-0.5 bg-surface-soft rounded-pill p-0.5 border border-hairline">
              {([['video', 'Vídeo', Video], ['image', 'Imagen', ImageIcon]] as const).map(([kind, label, Icon]) => (
                <button
                  key={kind}
                  onClick={() => { if (comparison.kind !== kind) setComparisonId(firstOfKind(kind).id) }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 rounded-pill text-xs font-emphasis transition-colors',
                    comparison.kind === kind ? 'bg-accent-600 text-on-accent' : 'text-ink-muted hover:text-ink'
                  )}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="btn-icon">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="px-6 py-3 flex flex-col gap-2.5 border-b border-hairline">
          <div className="flex items-start gap-2">
            <span className="eyebrow pt-1.5 flex-shrink-0">Modelo</span>
            <div className="flex flex-wrap gap-1">
              {PRICE_COMPARISONS.filter(c => c.kind === comparison.kind).map(c => (
                <button
                  key={c.id}
                  onClick={() => setComparisonId(c.id)}
                  className={cn(
                    'px-3 py-1 rounded-pill text-xs font-emphasis border transition-colors',
                    c.id === comparison.id
                      ? 'bg-accent-600 border-accent-600 text-on-accent'
                      : 'border-hairline text-ink-muted hover:text-ink hover:border-surface-600'
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
            <div className="flex items-center gap-2">
              <span className="eyebrow">{isVideo ? 'Duración' : 'Cantidad'}</span>
              <div className="flex gap-0.5 bg-surface-soft rounded-pill p-0.5 border border-hairline">
                {(isVideo ? DURATIONS : IMAGE_COUNTS).map(n => {
                  const active = isVideo ? seconds === n : imageCount === n
                  return (
                    <button
                      key={n}
                      onClick={() => (isVideo ? setSeconds(n) : setImageCount(n))}
                      className={cn(
                        'px-2.5 py-0.5 rounded-pill text-xs font-emphasis transition-colors',
                        active ? 'bg-accent-600 text-on-accent' : 'text-ink-muted hover:text-ink'
                      )}
                    >
                      {isVideo ? `${n}s` : `${n} img`}
                    </button>
                  )
                })}
              </div>
            </div>

            {isVideo && (
              <label className="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer select-none">
                <input type="checkbox" checked={withInputVideo} onChange={(e) => setWithInputVideo(e.target.checked)} className="accent-[rgb(var(--ink))]" />
                Con vídeo de entrada ({seconds}s)
              </label>
            )}

            <label className="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer select-none">
              <input type="checkbox" checked={onlyConfigured} onChange={(e) => setOnlyConfigured(e.target.checked)} className="accent-[rgb(var(--ink))]" />
              Solo proveedores activos
            </label>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto px-6 py-4">
          {rows.length === 0 ? (
            <p className="text-center text-xs text-ink-muted py-8">Ningún proveedor activo ofrece {comparison.name}.</p>
          ) : (
            <table className="w-full border-separate border-spacing-y-1.5 border-spacing-x-1.5 -mx-1.5">
              <thead>
                <tr>
                  <th className="eyebrow text-left font-normal px-2 pb-1">Proveedor</th>
                  {comparison.resolutions.map(res => (
                    <th key={res} className="eyebrow font-normal px-2 pb-1" style={{ width: `${Math.floor(72 / comparison.resolutions.length)}%` }}>{res}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const def = PROVIDER_DEFS.find(p => p.id === row.provider)
                  // One key editor per provider, under its first row
                  const showEditor = editingProvider === row.provider && rows.findIndex(r => r.provider === row.provider) === i
                  const dim = !row.configured && 'opacity-60'
                  return (
                  <React.Fragment key={row.model.name}>
                  <tr>
                    <td className="px-3 py-2 rounded-xl bg-surface-soft border border-hairline">
                      <div className="flex items-center gap-2">
                        <div className={cn('flex items-center gap-2 min-w-0 flex-1', dim)}>
                          <ProviderLogo provider={row.provider} size={15} />
                          <div className="min-w-0">
                            <div className="text-xs font-emphasis text-ink truncate">{providerLabel(row.provider)}</div>
                            <div className="text-[10px] text-ink-subtle truncate">
                              {row.configured ? cleanModelName(row.model.name) : row.hasKey ? 'Desactivado' : 'No configurado'}
                            </div>
                          </div>
                        </div>
                        {def && !row.hasKey && (
                          <button
                            type="button"
                            onClick={() => (editingProvider === row.provider ? cancelConfigure() : startConfigure(row.provider))}
                            title={`Configurar la API key de ${def.label}`}
                            className="flex-shrink-0 flex items-center gap-1 rounded-pill border border-hairline px-2 py-0.5 text-[10px] font-emphasis text-ink-muted hover:text-ink hover:border-surface-600 transition-colors"
                          >
                            <KeyRound size={10} /> Configurar
                          </button>
                        )}
                        {def && row.hasKey && !row.enabled && (
                          <button
                            type="button"
                            onClick={() => setProviderEnabled(row.provider as ProviderId, true)}
                            title={`Activar ${def.label}: sus modelos vuelven a los selectores`}
                            className="flex-shrink-0 flex items-center gap-1 rounded-pill border border-hairline px-2 py-0.5 text-[10px] font-emphasis text-ink-muted hover:text-ink hover:border-surface-600 transition-colors"
                          >
                            <Power size={10} /> Activar
                          </button>
                        )}
                      </div>
                    </td>
                    {comparison.resolutions.map(res => {
                      const cell = row.cells[res]
                      if (!cell) {
                        return (
                          <td key={res} className={cn('text-center text-xs text-ink-subtle rounded-xl border border-dashed border-hairline', dim)}>—</td>
                        )
                      }
                      const isBest = best[res] != null && Math.abs(cell.total - best[res]) < 1e-9
                      const canUse = !!onUse && row.configured
                      return (
                        <td key={res} className={cn('p-0', dim)}>
                          <button
                            type="button"
                            disabled={!canUse}
                            onClick={() => canUse && onUse!(row.model, cell.label)}
                            title={canUse ? `Usar ${cleanModelName(row.model.name)} en ${cell.label}` : undefined}
                            className={cn(
                              'relative w-full h-full rounded-xl border px-2.5 py-2 text-center transition-colors',
                              isBest
                                ? 'block-lime border-transparent'
                                : 'bg-surface-soft border-hairline',
                              canUse && (isBest ? 'hover:brightness-95 dark:hover:brightness-125' : 'hover:border-surface-600 hover:bg-surface-800/50'),
                              !canUse && 'cursor-default'
                            )}
                          >
                            {isBest && (
                              <span className="absolute -top-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 whitespace-nowrap rounded-pill bg-accent-600 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.4px] text-on-accent">
                                <Trophy size={8} /> Mejor precio
                              </span>
                            )}
                            <div className="text-sm font-strong tabular-nums">
                              ${cell.unit.toFixed(3)}<span className="text-[10px] font-normal opacity-60">{unitSuffix}</span>
                            </div>
                            {!isVideo && cell.unit > 0 && (
                              <div className="text-[10px] opacity-60 tabular-nums">
                                {Math.floor(1 / cell.unit + 1e-9).toLocaleString('es')} img por $1
                              </div>
                            )}
                            {quantity > 1 && (
                              <div className="text-[10px] opacity-60 tabular-nums">
                                ${cell.total.toFixed(2)} · {isVideo ? `${quantity}s` : `${quantity} img`}
                              </div>
                            )}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                  {showEditor && def && (
                    <tr>
                      <td colSpan={comparison.resolutions.length + 1} className="px-3 py-3 rounded-xl bg-surface-soft border border-hairline">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-emphasis text-ink">API key de {def.label}</span>
                          {def.helperUrl && (
                            <a
                              href={def.helperUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-ink-muted hover:text-ink flex items-center gap-1"
                            >
                              Obtener clave <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            value={keyDraft}
                            onChange={(e) => setKeyDraft(e.target.value)}
                            placeholder={def.keyPlaceholder}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveKey()
                              if (e.key === 'Escape') { e.preventDefault(); cancelConfigure() }
                            }}
                            className="flex-1 min-w-0 h-8 rounded-lg border border-hairline bg-transparent px-2.5 text-xs font-mono text-ink outline-none focus:border-surface-600"
                          />
                          <button
                            type="button"
                            onClick={saveKey}
                            disabled={!keyDraft.trim() || savingKey}
                            className="h-8 px-3 rounded-lg bg-accent-600 text-on-accent text-xs font-emphasis flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {savingKey ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
                            Guardar
                          </button>
                          <button type="button" onClick={cancelConfigure} className="h-8 px-2.5 text-xs text-ink-muted hover:text-ink">
                            Cancelar
                          </button>
                        </div>
                        {keyError && <p className="mt-1.5 text-[10px] text-red-600 dark:text-red-400">{keyError}</p>}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 text-[10px] leading-relaxed text-ink-subtle">
          {isVideo ? 'Estimaciones en USD con las mismas tarifas que el composer (16:9).' : 'Estimaciones en USD con las mismas tarifas que el composer, por imagen generada.'}
          {isVideo && withInputVideo && ' Con vídeo de entrada, algunos proveedores cobran también los segundos del vídeo de entrada; el precio por segundo se reparte sobre los segundos generados.'}
          {onUse && ' Haz clic en un precio para usar ese proveedor y resolución.'}
        </div>
      </div>
    </div>,
    document.body
  )
}
