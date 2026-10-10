import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { UserCircle, X, Dices, RotateCcw, ChevronDown } from 'lucide-react'

/**
 * Trait picker for Higgsfield AI Influencer (character sheet). The catalog comes from the public
 * options endpoint; selections are sent as { categoryKey: [optionKey] }.
 * Catalog rules: show only categories/options whose `tiers` match the tier, respect each
 * category's `max`, at most one option per facial `slot`, and an `exclusive` option is alone.
 */

export interface AiInfluencerOpts {
  tier: string
  selection: Record<string, string[]>
  seed?: number | null
  variationIndex?: number
  bodyColor?: string | null
  /** First attached image = identity photo; the rest are clothing/item refs */
  identityFromFirstImage: boolean
}

export const DEFAULT_AI_INFLUENCER_OPTS: AiInfluencerOpts = {
  tier: 'normal',
  selection: {},
  seed: null,
  variationIndex: 0,
  bodyColor: null,
  identityFromFirstImage: true,
}

interface CatalogOption {
  key: string
  label: string
  img: string | null
  color: string | null
  tiers: string[] | null
  slot: string | null
  exclusive?: boolean
}

interface CatalogCategory {
  key: string
  label: string
  tiers: string[]
  max: number
  options: CatalogOption[]
}

const HUMAN_TIERS: { value: string; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'freak', label: 'Freak' },
  { value: 'total', label: 'Total' },
]
const ANIMAL_TIERS: { value: string; label: string }[] = [
  { value: 'cats', label: 'Gatos' },
  { value: 'dogs', label: 'Perros' },
  { value: 'birds', label: 'Aves' },
  { value: 'frogs', label: 'Ranas' },
  { value: 'capybaras', label: 'Capibaras' },
  { value: 'insects', label: 'Insectos' },
]
const isHumanTier = (tier: string) => HUMAN_TIERS.some(t => t.value === tier)

// One fetch per session; the catalog changes rarely (config_revision)
let catalogPromise: Promise<CatalogCategory[]> | null = null
function loadCatalog(): Promise<CatalogCategory[]> {
  if (!catalogPromise) {
    const api = (window as any).electronAPI
    catalogPromise = Promise.resolve(api?.higgsfield?.influencerOptions?.())
      .then((res: any) => (Array.isArray(res?.categories) ? res.categories : []))
      .catch((err: any) => {
        catalogPromise = null
        throw err
      })
  }
  return catalogPromise
}

const visibleCategories = (catalog: CatalogCategory[], tier: string) =>
  catalog
    .filter(c => c.tiers.includes(tier))
    .map(c => ({ ...c, options: c.options.filter(o => !o.tiers || o.tiers.includes(tier)) }))
    .filter(c => c.options.length > 0)

/** Drops keys the new tier does not offer (stale keys are rejected by the API) */
function pruneSelection(catalog: CatalogCategory[], tier: string, selection: Record<string, string[]>) {
  const out: Record<string, string[]> = {}
  for (const cat of visibleCategories(catalog, tier)) {
    const valid = new Set(cat.options.map(o => o.key))
    const keys = (selection[cat.key] || []).filter(k => valid.has(k)).slice(0, cat.max)
    if (keys.length > 0) out[cat.key] = keys
  }
  return out
}

function toggleOption(cat: CatalogCategory, option: CatalogOption, current: string[]): string[] {
  if (current.includes(option.key)) return current.filter(k => k !== option.key)
  if (option.exclusive) return [option.key]
  const byKey = new Map(cat.options.map(o => [o.key, o]))
  let next = current.filter(k => !byKey.get(k)?.exclusive)
  if (option.slot) next = next.filter(k => byKey.get(k)?.slot !== option.slot)
  next = [...next, option.key]
  // Over the max: single-choice categories swap, multi-choice ones drop the oldest pick
  return next.length > cat.max ? next.slice(next.length - cat.max) : next
}

export function AiInfluencerControls({ value, onChange }: { value: AiInfluencerOpts; onChange: (v: AiInfluencerOpts) => void }) {
  const [open, setOpen] = useState(false)
  const [catalog, setCatalog] = useState<CatalogCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || catalog.length > 0) return
    setLoading(true)
    setError('')
    loadCatalog()
      .then(setCatalog)
      .catch((err: any) => setError(err?.message || 'No se pudo cargar el catálogo'))
      .finally(() => setLoading(false))
  }, [open, catalog.length])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const categories = useMemo(() => visibleCategories(catalog, value.tier), [catalog, value.tier])
  const selectedCount = Object.values(value.selection).reduce((n, keys) => n + keys.length, 0)
  const human = isHumanTier(value.tier)
  const tierLabel = [...HUMAN_TIERS, ...ANIMAL_TIERS].find(t => t.value === value.tier)?.label || value.tier

  const setTier = (tier: string) => {
    if (tier === value.tier) return
    const toHuman = isHumanTier(tier)
    onChange({
      ...value,
      tier,
      selection: catalog.length > 0 ? pruneSelection(catalog, tier, value.selection) : (toHuman === human ? value.selection : {}),
      // Human tiers must send variation_index 0 and no body_color
      variationIndex: toHuman ? 0 : value.variationIndex,
      bodyColor: toHuman ? null : value.bodyColor,
    })
  }

  const pick = (cat: CatalogCategory, option: CatalogOption) => {
    const next = toggleOption(cat, option, value.selection[cat.key] || [])
    const selection = { ...value.selection }
    if (next.length > 0) selection[cat.key] = next
    else delete selection[cat.key]
    onChange({ ...value, selection })
  }

  const inputCls = 'bg-surface-800/80 border border-surface-700 rounded-lg px-2 py-1 text-[11px] text-surface-200 outline-none focus:border-accent-500/50'

  const modal = open && (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="modal-scrim" />
      <div className="relative modal-surface w-[760px] max-w-[94vw] max-h-[85vh] flex flex-col z-10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
          <h3 className="text-sm font-medium text-surface-200 flex items-center gap-2">
            <UserCircle size={14} className="text-accent-400" /> AI Influencer · Personaje
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_AI_INFLUENCER_OPTS, identityFromFirstImage: value.identityFromFirstImage })}
              className="flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-medium text-surface-300 hover:text-ink hover:bg-surface-700 transition-colors"
              title="Quitar todos los rasgos"
            >
              <RotateCcw size={11} /> Limpiar
            </button>
            <button onClick={() => setOpen(false)} className="text-surface-500 hover:text-surface-200 p-1 rounded-full hover:bg-surface-800 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-surface-800 flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow w-16">Humano</span>
            {HUMAN_TIERS.map(t => (
              <TierChip key={t.value} label={t.label} active={value.tier === t.value} onClick={() => setTier(t.value)} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow w-16">Animal</span>
            {ANIMAL_TIERS.map(t => (
              <TierChip key={t.value} label={t.label} active={value.tier === t.value} onClick={() => setTier(t.value)} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <label className="flex items-center gap-1.5 text-[11px] text-surface-300" title="La semilla elige el personaje (no garantiza píxeles idénticos). Vacía = aleatoria">
              Seed
              <input
                type="number"
                min={1}
                max={1000000}
                value={value.seed ?? ''}
                placeholder="aleatoria"
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  onChange({ ...value, seed: Number.isFinite(n) ? Math.min(1000000, Math.max(1, n)) : null })
                }}
                className={`${inputCls} w-24`}
              />
              <button
                type="button"
                onClick={() => onChange({ ...value, seed: 1 + Math.floor(Math.random() * 1000000) })}
                className="p-1 rounded-md text-surface-400 hover:text-surface-100 hover:bg-surface-800"
                title="Seed aleatoria"
              >
                <Dices size={13} />
              </button>
            </label>
            {!human && (
              <>
                <label className="flex items-center gap-1.5 text-[11px] text-surface-300" title="Con la misma seed, cada índice da una variación del animal">
                  Variación
                  <input
                    type="number"
                    min={0}
                    value={value.variationIndex ?? 0}
                    onChange={(e) => onChange({ ...value, variationIndex: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    className={`${inputCls} w-16`}
                  />
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-surface-300">
                  Color
                  <input
                    type="color"
                    value={value.bodyColor || '#d9a066'}
                    onChange={(e) => onChange({ ...value, bodyColor: e.target.value })}
                    className="w-7 h-6 rounded bg-transparent border border-surface-700 cursor-pointer"
                  />
                  {value.bodyColor && (
                    <button type="button" onClick={() => onChange({ ...value, bodyColor: null })} className="text-surface-500 hover:text-surface-200" title="Sin color fijo">
                      <X size={11} />
                    </button>
                  )}
                </label>
              </>
            )}
            <label className="flex items-center gap-1.5 text-[11px] text-surface-300 cursor-pointer" title="Activado: la primera imagen adjunta es la foto de identidad y las siguientes (máx. 3) son ropa/objetos. Desactivado: todas son ropa/objetos">
              <input
                type="checkbox"
                checked={value.identityFromFirstImage}
                onChange={(e) => onChange({ ...value, identityFromFirstImage: e.target.checked })}
                className="accent-accent-500"
              />
              1ª imagen = identidad
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
          {loading && <div className="text-center text-xs text-surface-400 py-6">Cargando catálogo…</div>}
          {error && <div className="text-center text-xs text-red-400 py-6">{error}</div>}
          {categories.map(cat => {
            const picked = value.selection[cat.key] || []
            return (
              <div key={`${cat.key}-${cat.tiers.join(',')}`}>
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-[11px] font-medium text-surface-200">{cat.label}</span>
                  <span className="text-[10px] text-surface-500">{picked.length}/{cat.max}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cat.options.map(o => {
                    const active = picked.includes(o.key)
                    return (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => pick(cat, o)}
                        className={`flex items-center gap-1.5 h-7 pl-1 pr-2.5 rounded-pill text-[11px] border transition-colors ${
                          active
                            ? 'bg-accent-600 text-on-accent border-accent-500'
                            : 'bg-surface-900/90 border-surface-700/80 text-surface-300 hover:text-surface-100 hover:border-surface-600'
                        }`}
                      >
                        {o.img ? (
                          <img src={o.img} alt="" loading="lazy" className="size-5 rounded-full object-cover bg-surface-800" />
                        ) : o.color ? (
                          <span className="size-5 rounded-full border border-surface-600" style={{ background: o.color }} />
                        ) : (
                          <span className="w-1" />
                        )}
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Rasgos del personaje (tipo, físico, pelo, estilo…). El prompt se envía como brief"
        className="flex items-center gap-1.5 h-7 px-2.5 py-1 bg-surface-900/90 hover:bg-surface-800/90 border border-surface-700/80 hover:border-surface-600 rounded-pill text-[11px] font-medium text-surface-200 transition-all shadow-sm"
      >
        <UserCircle size={11} />
        <span>{tierLabel}{selectedCount > 0 ? ` · ${selectedCount} rasgos` : ''}{value.seed ? ` · #${value.seed}` : ''}</span>
        <ChevronDown size={11} className="text-surface-400" />
      </button>
      {modal && typeof document !== 'undefined' ? createPortal(modal, document.body) : null}
    </>
  )
}

function TierChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-6 px-2.5 rounded-pill text-[11px] font-medium border transition-colors ${
        active
          ? 'bg-accent-600 text-on-accent border-accent-500'
          : 'bg-surface-900/90 border-surface-700/80 text-surface-300 hover:text-surface-100 hover:border-surface-600'
      }`}
    >
      {label}
    </button>
  )
}
