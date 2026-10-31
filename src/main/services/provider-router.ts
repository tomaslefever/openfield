import { getApimartModel } from './apimart/catalog'
import { getMachgenModel } from './machgen/catalog'
import { getFalModel } from './fal/catalog'
import { getReplicateModel } from './replicate/catalog'

/** Queue providers, as stored in tasks.provider ('openfield' is the KIE queue). */
export type QueueProvider = 'openfield' | 'fal' | 'higgsfield' | 'machgen' | 'replicate' | 'apimart' | 'klingai' | 'pruna'

export const QUEUE_PROVIDERS: QueueProvider[] = ['openfield', 'fal', 'higgsfield', 'machgen', 'replicate', 'apimart', 'klingai', 'pruna']

const HIGGSFIELD_PREFIXES = [
  'higgsfield/', 'higgsfield-ai/', 'flux-pro/', 'xai/grok-imagine', 'marketing-studio/', 'ideogram/v4',
  'recraft/v4', 'alibaba/qwen-image', 'z-image/', 'bytedance/seedance-2.0', 'bytedance/seedance-2.5',
  'kling-video/', 'minimax/h3/', 'alibaba/wan-3.0',
]
const FAL_PREFIXES = ['fal-ai/', 'imagineart/', 'minimax/']
const REPLICATE_PREFIXES = ['prunaai/', 'philz1337x/', 'black-forest-labs/', 'ideogram-ai/']

/** Normalizes a provider name as users/clients write it ("kie", "fal.ai", …) to a queue provider. */
export function normalizeProvider(name?: string | null): QueueProvider | null {
  const n = (name || '').toLowerCase().replace(/\.ai$/, '')
  if (n === 'kie' || n === 'openfield') return 'openfield'
  if (n === 'kling') return 'klingai'
  return (QUEUE_PROVIDERS as string[]).includes(n) ? n as QueueProvider : null
}

/**
 * Main-process equivalent of the renderer's per-page routing (ImageGenPage / VideoGenPage
 * handleGenerate): an explicit provider wins, then catalog membership and model-id prefixes.
 */
export function routeModelToProvider(model: string, providerHint?: string | null): QueueProvider {
  const explicit = normalizeProvider(providerHint)
  if (explicit) return explicit
  const m = model || ''
  if (m.startsWith('klingai/')) return 'klingai'
  // Official Pruna API ('prunaai/' ids are the same models on Replicate)
  if (m.startsWith('pruna/')) return 'pruna'
  if (m.startsWith('apimart/') || getApimartModel(m)) return 'apimart'
  if (m.startsWith('machgen/') || m.includes('MachGen') || getMachgenModel(m)) return 'machgen'
  if (HIGGSFIELD_PREFIXES.some(p => m.startsWith(p))) return 'higgsfield'
  if (FAL_PREFIXES.some(p => m.startsWith(p)) || getFalModel(m)) return 'fal'
  if (REPLICATE_PREFIXES.some(p => m.startsWith(p)) || getReplicateModel(m)) return 'replicate'
  return 'openfield'
}
