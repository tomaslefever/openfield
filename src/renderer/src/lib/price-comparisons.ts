import type { ModelPricing } from './models'

export type ComparisonKind = 'video' | 'image'

export interface PriceComparison {
  id: string
  name: string
  /** video: priced per second (VIDEO_MODELS, matched by t2vId); image: per image (IMAGE_MODELS, by t2iId) */
  kind: ComparisonKind
  modelIds: string[]
  /** Resolution columns, lowercase */
  resolutions: string[]
}

/**
 * Model families compared across providers in the price comparator (PriceComparatorModal).
 * Each lists every provider's entry of the SAME model — variants (Fast, Mini, Turbo, Max, Lite,
 * Pro, Sunburst, Flare…) get their own family, so "best price" never crowns a different model.
 * Add a family here to make it comparable.
 */
export const PRICE_COMPARISONS: PriceComparison[] = [
  // ─── Video (per second) ───────────────────────────────────────────────
  {
    id: 'seedance-2.5',
    name: 'Seedance 2.5',
    kind: 'video',
    modelIds: [
      'bytedance/seedance-2-5',
      'bytedance/seedance-2.5/text-to-video',
      'machgen/Seedance-2.5/t2v',
      'fal-ai/bytedance/seedance-2-5',
      'apimart/seedance-2-5',
    ],
    resolutions: ['480p', '720p', '1080p'],
  },
  {
    id: 'seedance-2.0',
    name: 'Seedance 2.0',
    kind: 'video',
    modelIds: [
      'bytedance/seedance-2',
      'bytedance/seedance-2.0/text-to-video',
      'machgen/Seedance-2.0/t2v',
      'apimart/seedance-2-0',
    ],
    resolutions: ['480p', '720p', '1080p', '4k'],
  },
  {
    id: 'minimax-h3',
    name: 'MiniMax H3',
    kind: 'video',
    modelIds: [
      'minimax-h3/text-to-video',
      'minimax/h3/reference-to-video',
      'machgen/MiniMax-H3/t2v',
      'minimax/h3/text-to-video',
      'apimart/minimax-h3',
    ],
    resolutions: ['480p', '768p', '1080p', '2k', '4k'],
  },

  // ─── Image (per image) ────────────────────────────────────────────────
  {
    id: 'gpt-image-2',
    name: 'GPT Image 2',
    kind: 'image',
    modelIds: ['gpt-image-2-text-to-image', 'openai/gpt-image-2', 'machgen/GPT-Image-2', 'apimart/gpt-image-2'],
    resolutions: ['1k', '2k', '4k'],
  },
  {
    id: 'gpt-image-2.5-sunburst',
    name: 'GPT Image 2.5 Sunburst',
    kind: 'image',
    modelIds: ['gpt-image-2-5-sunburst-text-to-image', 'machgen/GPT-Image-2.5-Sunburst'],
    resolutions: ['1k', '2k', '4k'],
  },
  {
    id: 'gpt-image-2.5-flare',
    name: 'GPT Image 2.5 Flare',
    kind: 'image',
    modelIds: ['gpt-image-2-5-flare-text-to-image', 'machgen/GPT-Image-2.5-Flare'],
    resolutions: ['1k', '2k', '4k'],
  },
  {
    id: 'nano-banana-2',
    name: 'Nano Banana 2',
    kind: 'image',
    modelIds: ['nano-banana-2', 'machgen/Nano-Banana-2', 'apimart/gemini-3.1-flash-image-preview-official'],
    resolutions: ['0.5k', '1k', '2k', '4k'],
  },
  {
    id: 'nano-banana-2.1',
    name: 'Nano Banana 2.1',
    kind: 'image',
    modelIds: ['nano-banana-2-1', 'google/nano-banana-2.1', 'replicate/google/nano-banana-2.1'],
    resolutions: ['1k', '2k', '4k'],
  },
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    kind: 'image',
    modelIds: ['fal-ai/nano-banana-pro', 'machgen/Nano-Banana-Pro', 'apimart/gemini-3-pro-image-preview'],
    resolutions: ['1k', '2k', '4k'],
  },
  {
    id: 'seedream-5-pro',
    name: 'Seedream 5 Pro',
    kind: 'image',
    modelIds: ['seedream/5-pro-text-to-image', 'apimart/seedream-5-0-pro'],
    resolutions: ['1k', '1.5k', '2k', '4k'],
  },
  {
    id: 'seedream-5-lite',
    name: 'Seedream 5 Lite',
    kind: 'image',
    modelIds: ['machgen/Seedream-5.0-lite', 'apimart/seedream-5-lite'],
    resolutions: ['1k', '2k', '3k'],
  },
  {
    id: 'qwen-image-3',
    name: 'Qwen Image 3',
    kind: 'image',
    modelIds: ['qwen-image-3', 'alibaba/qwen-image-3/text-to-image', 'apimart/qwen-image-3.0'],
    resolutions: ['1k', '2k'],
  },
]

/** The id a comparison matches a model by */
export function comparisonModelId(model: ModelPricing, kind: ComparisonKind): string | undefined {
  return kind === 'video' ? model.t2vId : model.t2iId
}

/** The comparison a model belongs to, if any */
export function findPriceComparison(model?: ModelPricing | null) {
  if (!model) return undefined
  return PRICE_COMPARISONS.find(c => {
    const id = comparisonModelId(model, c.kind)
    return !!id && c.modelIds.includes(id)
  })
}
