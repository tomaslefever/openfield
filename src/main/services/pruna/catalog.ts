import type { PrunaModelDef } from './types'

// Pruna P-2 video models on the official API (docs.api.pruna.ai/guides/models/p-video-2*).
// P-Video 2 Pro and its -reference variant are one model in the UI: the composer routes to
// -reference when image/video/audio references are attached. A new Pruna model needs an entry
// here plus its twin in the renderer's VIDEO_MODELS.
export const PRUNA_MODELS: PrunaModelDef[] = [
  {
    id: 'pruna/p-video-2',
    apiModel: 'p-video-2',
    name: 'P-Video 2',
    category: 'PrunaAI',
    type: 'video',
    resolutions: ['720p', '1080p'],
    pricing: [{ resolution: '720p', cost: 0.025 }, { resolution: '1080p', cost: 0.05 }],
    unit: 's',
  },
  {
    id: 'pruna/p-video-2-pro',
    apiModel: 'p-video-2-pro',
    name: 'P-Video 2 Pro',
    category: 'PrunaAI',
    type: 'video',
    resolutions: ['480p', '768p'],
    pricing: [{ resolution: '480p', cost: 0.02 }, { resolution: '768p', cost: 0.035 }],
    unit: 's',
  },
  {
    id: 'pruna/p-video-2-pro-reference',
    apiModel: 'p-video-2-pro-reference',
    name: 'P-Video 2 Pro',
    category: 'PrunaAI',
    type: 'video',
    resolutions: ['480p', '768p'],
    pricing: [{ resolution: '480p', cost: 0.02 }, { resolution: '768p', cost: 0.035 }],
    unit: 's',
  },
]

/** Catalog entry for an Openfield id ('pruna/p-video-2') or a bare API model name ('p-video-2'). */
export function getPrunaModel(modelOrId?: string | null): PrunaModelDef | undefined {
  if (!modelOrId) return undefined
  const id = modelOrId.startsWith('pruna/') ? modelOrId : `pruna/${modelOrId}`
  return PRUNA_MODELS.find(m => m.id === id)
}
