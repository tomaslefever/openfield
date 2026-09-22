export const CREDITS_PER_DOLLAR = 200

export interface PriceEntry {
  resolution: string
  cost: number
}

import type { ProviderId } from '../stores/providers-store'
export type { ProviderId }

export interface ModelPricing {
  name: string
  category: string
  unit: 'img' | 's' | 'video'
  prices: PriceEntry[]
  durationMax?: number
  durationOptions?: string[]
  resolutions?: string[]
  supportsVideoRef?: boolean
  supportsAudioRef?: boolean
  refTags?: {
    image?: string
    video?: string
    audio?: string
    skipTagValidation?: boolean
  }
  t2iId?: string
  i2iId?: string
  editId?: string
  t2vId?: string
  i2vId?: string
  fflfId?: string
  refId?: string
  extendId?: string
  t2aId?: string
  kind?: 'voice' | 'music'
  voiceId?: string
  local?: boolean
  modelId?: string
  engine?: string
  provider?: ProviderId
  replicateVoices?: string[]
  replicateLanguages?: string[]
  falAspectRatios?: string[]
  pvAspectRatios?: string[]
  aspectRatios?: string[]
}

/**
 * Strips provider name in parentheses e.g. " (Higgsfield)", " (KIE)", " (Replicate)", etc.
 * from model name for clean UI display. The icon already associates the model with the platform.
 */
export function cleanModelName(name?: string | null): string {
  if (!name) return ''
  return name.replace(/\s*\([a-zA-Z0-9\s._/-]+\)$/, '').trim()
}

// ─── Image models ──────────────────────────────────────────────────────────

export const IMAGE_MODELS: ModelPricing[] = [
  { name: 'GPT Image 2.5 Flare', category: 'OpenAI', unit: 'img',
    t2iId: 'gpt-image-2-5-flare-text-to-image', i2iId: 'gpt-image-2-5-flare-image-to-image',
    prices: [{ resolution: '1K', cost: 0.03 }, { resolution: '2K', cost: 0.05 }, { resolution: '4K', cost: 0.08 }],
    resolutions: ['1K', '2K', '4K'],
    aspectRatios: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '16:27', '27:16', '8:9', '9:8'],
    refTags: { image: 'Image %d', skipTagValidation: true } },
  { name: 'GPT Image 2.5 Sunburst', category: 'OpenAI', unit: 'img',
    t2iId: 'gpt-image-2-5-sunburst-text-to-image', i2iId: 'gpt-image-2-5-sunburst-image-to-image',
    prices: [{ resolution: '1K', cost: 0.03 }, { resolution: '2K', cost: 0.05 }, { resolution: '4K', cost: 0.08 }],
    resolutions: ['1K', '2K', '4K'],
    aspectRatios: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '16:27', '27:16', '8:9', '9:8'],
    refTags: { image: 'Image %d', skipTagValidation: true } },
  { name: 'GPT Image 2', category: 'OpenAI', unit: 'img', t2iId: 'gpt-image-2-text-to-image', i2iId: 'gpt-image-2-image-to-image',
    prices: [{ resolution: '1K', cost: 0.03 }, { resolution: '2K', cost: 0.05 }, { resolution: '4K', cost: 0.08 }],
    refTags: { image: 'Image %d', skipTagValidation: true } },
  { name: 'Nano Banana 2', category: 'Google', unit: 'img', t2iId: 'nano-banana-2',
    prices: [{ resolution: '1K', cost: 0.04 }, { resolution: '2K', cost: 0.06 }, { resolution: '4K', cost: 0.09 }] },
  { name: 'Nano Banana 2 Lite', category: 'Google', unit: 'img', t2iId: 'nano-banana-2-lite',
    prices: [{ resolution: '1K', cost: 0.02 }] },
  { name: 'Seedream 5 Pro', category: 'Seedream', unit: 'img', t2iId: 'seedream/5-pro-text-to-image', i2iId: 'seedream/5-pro-image-to-image', editId: 'seedream/5-pro-image-to-image',
    prices: [{ resolution: '1K', cost: 0.06 }, { resolution: '2K', cost: 0.09 }, { resolution: '4K', cost: 0.15 }] },
  { name: 'Flux 2 Pro', category: 'Flux', unit: 'img', t2iId: 'flux2-pro-text-to-image', i2iId: 'flux2-pro-image-to-image',
    prices: [{ resolution: '1K', cost: 0.05 }, { resolution: '2K', cost: 0.08 }] },
  { name: 'Grok Imagine', category: 'Grok', unit: 'img', t2iId: 'grok-imagine/text-to-image', i2iId: 'grok-imagine/image-to-image',
    prices: [{ resolution: '1K', cost: 0.02 }, { resolution: '2K', cost: 0.03 }] },
  { name: 'Imagen 4 Fast', category: 'Google', unit: 'img', t2iId: 'imagen4-fast',
    prices: [{ resolution: '1K', cost: 0.04 }, { resolution: '2K', cost: 0.06 }] },
  { name: 'Remove Background', category: 'Recraft', unit: 'img', t2iId: 'recraft/remove-background',
    prices: [{ resolution: '1K', cost: 0.02 }] },
  // fal.ai image models (https://fal.ai/explore/best-image-models)
  { name: 'GPT Image 2 (Fal)', category: 'OpenAI', unit: 'img', provider: 'fal',
    t2iId: 'openai/gpt-image-2', i2iId: 'openai/gpt-image-2/edit',
    prices: [{ resolution: '1K', cost: 0.03 }, { resolution: '2K', cost: 0.10 }, { resolution: '4K', cost: 0.30 }],
    falAspectRatios: ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'] },
  { name: 'Nano Banana Pro', category: 'Google', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/nano-banana-pro', editId: 'fal-ai/nano-banana-pro/edit',
    prices: [{ resolution: '1K', cost: 0.15 }, { resolution: '2K', cost: 0.15 }, { resolution: '4K', cost: 0.30 }],
    falAspectRatios: ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'] },
  { name: 'Recraft V4', category: 'Recraft', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/recraft/v4/text-to-image',
    prices: [{ resolution: '1K', cost: 0.04 }, { resolution: '2K', cost: 0.08 }],
    falAspectRatios: ['1:1', '16:9', '4:3', '3:4', '9:16'] },
  { name: 'Recraft V4 Pro', category: 'Recraft', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/recraft/v4/pro/text-to-image',
    prices: [{ resolution: '1K', cost: 0.25 }, { resolution: '2K', cost: 0.30 }],
    falAspectRatios: ['1:1', '16:9', '4:3', '3:4', '9:16'] },
  { name: 'Recraft V3', category: 'Recraft', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/recraft/v3/text-to-image',
    prices: [{ resolution: '1K', cost: 0.04 }, { resolution: '2K', cost: 0.08 }],
    falAspectRatios: ['1:1', '16:9', '4:3', '3:4', '9:16'] },
  { name: 'ImagineArt 2.0', category: 'ImagineArt', unit: 'img', provider: 'fal',
    t2iId: 'imagineart/imagineart-2.0-preview/text-to-image',
    prices: [{ resolution: '1K', cost: 0.04 }, { resolution: '2K', cost: 0.08 }],
    falAspectRatios: ['1:1', '16:9', '4:3', '3:4', '9:16'] },
  { name: 'FLUX.1 Kontext [pro]', category: 'Flux', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/flux-pro/kontext', editId: 'fal-ai/flux-pro/kontext',
    prices: [{ resolution: '1K', cost: 0.04 }, { resolution: '2K', cost: 0.08 }],
    falAspectRatios: ['1:1', '16:9', '3:2', '4:3', '3:4', '2:3', '9:16'] },
  { name: 'FLUX Krea LoRA stream', category: 'Flux', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/flux-krea-lora/stream',
    prices: [{ resolution: '1K', cost: 0.035 }, { resolution: '2K', cost: 0.07 }],
    falAspectRatios: ['1:1', '16:9', '3:2', '4:3', '3:4', '2:3', '9:16'] },
  { name: 'Bria FIBO', category: 'Bria', unit: 'img', provider: 'fal',
    t2iId: 'bria/fibo/generate',
    prices: [{ resolution: '1K', cost: 0.04 }, { resolution: '2K', cost: 0.08 }],
    falAspectRatios: ['1:1', '16:9', '4:3', '3:4', '9:16'] },
  // Missing KIE image models
  { name: 'Ideogram 2.0', category: 'Ideogram', unit: 'img', provider: 'kie',
    t2iId: 'ideogram-2-0',
    prices: [{ resolution: '1K', cost: 0.08 }],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'] },
  { name: 'Qwen Image 3', category: 'Qwen', unit: 'img', provider: 'kie',
    t2iId: 'qwen-image-3',
    prices: [{ resolution: '1K', cost: 0.03 }],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'] },

  // Missing fal.ai image models
  { name: 'FLUX.1 [dev] (Fal)', category: 'Flux', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/flux/dev',
    prices: [{ resolution: '1K', cost: 0.025 }],
    falAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'] },
  { name: 'FLUX.1 [schnell] (Fal)', category: 'Flux', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/flux/schnell',
    prices: [{ resolution: '1K', cost: 0.003 }],
    falAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'] },
  { name: 'FLUX.1 [pro] (Fal)', category: 'Flux', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/flux-pro',
    prices: [{ resolution: '1K', cost: 0.040 }],
    falAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'] },
  { name: 'Ideogram v2 (Fal)', category: 'Ideogram', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/ideogram/v2',
    prices: [{ resolution: '1K', cost: 0.080 }],
    falAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'] },
  { name: 'Ideogram v2 Turbo (Fal)', category: 'Ideogram', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/ideogram/v2/turbo',
    prices: [{ resolution: '1K', cost: 0.040 }],
    falAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'] },
  { name: 'Kling O1 Image (Fal)', category: 'Kling', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/kling-o1/image-to-image', i2iId: 'fal-ai/kling-o1/image-to-image',
    prices: [{ resolution: '1K', cost: 0.040 }],
    falAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'] },

  // Missing Replicate image models
  { name: 'FLUX.1 Dev (Replicate)', category: 'Flux', unit: 'img', provider: 'replicate',
    t2iId: 'black-forest-labs/flux-dev',
    prices: [{ resolution: '1K', cost: 0.025 }],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'] },
  { name: 'FLUX.1 Schnell (Replicate)', category: 'Flux', unit: 'img', provider: 'replicate',
    t2iId: 'black-forest-labs/flux-schnell',
    prices: [{ resolution: '1K', cost: 0.003 }],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'] },
  { name: 'FLUX 1.1 Pro (Replicate)', category: 'Flux', unit: 'img', provider: 'replicate',
    t2iId: 'black-forest-labs/flux-1.1-pro',
    prices: [{ resolution: '1K', cost: 0.040 }],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'] },
  { name: 'Ideogram v2 (Replicate)', category: 'Ideogram', unit: 'img', provider: 'replicate',
    t2iId: 'ideogram-ai/ideogram-v2',
    prices: [{ resolution: '1K', cost: 0.080 }],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'] },
  { name: 'Ideogram v2 Turbo (Replicate)', category: 'Ideogram', unit: 'img', provider: 'replicate',
    t2iId: 'ideogram-ai/ideogram-v2-turbo',
    prices: [{ resolution: '1K', cost: 0.040 }],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'] },
  { name: 'Imagen 3 (Replicate)', category: 'Google', unit: 'img', provider: 'replicate',
    t2iId: 'google/imagen-3',
    prices: [{ resolution: '1K', cost: 0.030 }],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'] },
  { name: 'Recraft V3 (Replicate)', category: 'Recraft', unit: 'img', provider: 'replicate',
    t2iId: 'recraft-ai/recraft-v3',
    prices: [{ resolution: '1K', cost: 0.040 }],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'] },

  // MachGen image models (https://www.machgen.ai)
  { name: 'FLUX.2 Dev (MachGen)', category: 'Flux', unit: 'img', provider: 'machgen',
    t2iId: 'machgen/FLUX.2-dev',
    prices: [{ resolution: '1K', cost: 0.025 }],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'] },
  { name: 'HiDream-O1-Image (MachGen)', category: 'HiDream', unit: 'img', provider: 'machgen',
    t2iId: 'machgen/HiDream-O1-Image',
    prices: [{ resolution: '1K', cost: 0.020 }],
    aspectRatios: ['1:1', '16:9', '9:16'] },
  { name: 'Topaz-Image-Precision (MachGen)', category: 'Topaz', unit: 'img', provider: 'machgen',
    t2iId: 'machgen/Topaz-Image-Precision/upscale',
    prices: [{ resolution: '4K', cost: 0.020 }],
    aspectRatios: ['1:1', '16:9', '9:16'] },
  { name: 'Topaz-Image-Generative (MachGen)', category: 'Topaz', unit: 'img', provider: 'machgen',
    t2iId: 'machgen/Topaz-Image-Generative/upscale',
    prices: [{ resolution: '4K', cost: 0.025 }],
    aspectRatios: ['1:1', '16:9', '9:16'] },
  { name: 'Grok-Imagine-Image (MachGen)', category: 'xAI', unit: 'img', provider: 'machgen',
    t2iId: 'machgen/Grok-Imagine-Image',
    prices: [{ resolution: '1K', cost: 0.015 }],
    aspectRatios: ['1:1', '16:9', '9:16'] },
  { name: 'Grok-Imagine-Image-Quality (MachGen)', category: 'xAI', unit: 'img', provider: 'machgen',
    t2iId: 'machgen/Grok-Imagine-Image-Quality',
    prices: [{ resolution: '1K', cost: 0.025 }],
    aspectRatios: ['1:1', '16:9', '9:16'] },
  { name: 'Nano-Banana-2 (MachGen)', category: 'Google', unit: 'img', provider: 'machgen',
    t2iId: 'machgen/Nano-Banana-2',
    prices: [{ resolution: '1K', cost: 0.020 }],
    aspectRatios: ['1:1', '16:9', '9:16'] },
  { name: 'Nano-Banana-Pro (MachGen)', category: 'Google', unit: 'img', provider: 'machgen',
    t2iId: 'machgen/Nano-Banana-Pro',
    prices: [{ resolution: '1K', cost: 0.035 }],
    aspectRatios: ['1:1', '16:9', '9:16'] },
  { name: 'Seedream-5.0-lite (MachGen)', category: 'ByteDance', unit: 'img', provider: 'machgen',
    t2iId: 'machgen/Seedream-5.0-lite',
    prices: [{ resolution: '1K', cost: 0.015 }],
    aspectRatios: ['1:1', '16:9', '9:16'] },
  { name: 'GPT-Image-2 (MachGen)', category: 'OpenAI', unit: 'img', provider: 'machgen',
    t2iId: 'machgen/GPT-Image-2',
    prices: [{ resolution: '1K', cost: 0.030 }],
    aspectRatios: ['1:1', '16:9', '9:16'] },
  { name: 'GPT-Image-2.5-Sunburst (MachGen)', category: 'OpenAI', unit: 'img', provider: 'machgen',
    t2iId: 'machgen/GPT-Image-2.5-Sunburst',
    prices: [{ resolution: '1K', cost: 0.040 }],
    aspectRatios: ['1:1', '16:9', '9:16'] },
  { name: 'GPT-Image-2.5-Flare (MachGen)', category: 'OpenAI', unit: 'img', provider: 'machgen',
    t2iId: 'machgen/GPT-Image-2.5-Flare',
    prices: [{ resolution: '1K', cost: 0.045 }],
    aspectRatios: ['1:1', '16:9', '9:16'] },

  // Missing Higgsfield image models
  { name: 'Soul Image 2.0 (Higgsfield)', category: 'Higgsfield', unit: 'img', provider: 'higgsfield',
    t2iId: 'higgsfield/soul-image-2',
    prices: [{ resolution: '1K', cost: 0.030 }],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'] },
  { name: 'FLUX.1 Pro (Higgsfield)', category: 'Flux', unit: 'img', provider: 'higgsfield',
    t2iId: 'higgsfield/flux-pro',
    prices: [{ resolution: '1K', cost: 0.040 }],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'] },
  { name: 'Ideogram 2.0 (Higgsfield)', category: 'Ideogram', unit: 'img', provider: 'higgsfield',
    t2iId: 'higgsfield/ideogram-2',
    prices: [{ resolution: '1K', cost: 0.060 }],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'] },
]

// ─── Video models ──────────────────────────────────────────────────────────

// PixVerse V6 routes to a single model; the price table depends on the routed mode
export const PIXVERSE_T2V_PRICES = [
  { resolution: '360p', cost: 0.020 }, { resolution: '360p-audio', cost: 0.028 },
  { resolution: '540p', cost: 0.028 }, { resolution: '540p-audio', cost: 0.036 },
  { resolution: '720p', cost: 0.036 }, { resolution: '720p-audio', cost: 0.048 },
  { resolution: '1080p', cost: 0.072 }, { resolution: '1080p-audio', cost: 0.092 },
]
export const PIXVERSE_REF_PRICES = [
  { resolution: '360p', cost: 0.0225 }, { resolution: '360p-audio', cost: 0.0315 },
  { resolution: '540p', cost: 0.0315 }, { resolution: '540p-audio', cost: 0.0405 },
  { resolution: '720p', cost: 0.0405 }, { resolution: '720p-audio', cost: 0.054 },
  { resolution: '1080p', cost: 0.081 }, { resolution: '1080p-audio', cost: 0.1035 },
]

export const VIDEO_MODELS: ModelPricing[] = [
  { name: 'Kling 3.0', category: 'Kling', unit: 's', t2vId: 'kling-3.0/video', i2vId: 'kling-3.0/video',
    prices: [{ resolution: 'std', cost: 0.07 }, { resolution: 'std-audio', cost: 0.10 }, { resolution: 'pro', cost: 0.09 }, { resolution: 'pro-audio', cost: 0.135 }, { resolution: '4k', cost: 0.335 }],
    durationMax: 15, resolutions: ['std', 'pro', '4k'] },
  { name: 'Kling 2.5 Turbo', category: 'Kling', unit: 's', t2vId: 'kling/v25-turbo-text-to-video-pro', i2vId: 'kling/v25-turbo-image-to-video-pro',
    prices: [{ resolution: 's', cost: 0.05 }], durationMax: 10 },
  { name: 'Grok Imagine', category: 'Grok', unit: 's',
    t2vId: 'grok-imagine/text-to-video', i2vId: 'grok-imagine/image-to-video', extendId: 'grok-imagine/extend',
    prices: [{ resolution: '480p', cost: 0.012 }, { resolution: '720p', cost: 0.0225 }, { resolution: '1080p', cost: 0.04 }],
    durationMax: 30, resolutions: ['480p', '720p', '1080p'], supportsVideoRef: true },
  { name: 'Seedance 2', category: 'ByteDance', unit: 's', t2vId: 'bytedance/seedance-2', i2vId: 'bytedance/seedance-2', fflfId: 'bytedance/seedance-2',
    prices: [{ resolution: '480p', cost: 0.095 }, { resolution: '720p', cost: 0.205 }, { resolution: '1080p', cost: 0.51 }, { resolution: '4k', cost: 1.04 }], durationMax: 15,
    durationOptions: ['4', '5', '6', '8', '10', '12', '15'], resolutions: ['480p', '720p', '1080p', '4k'], supportsVideoRef: true, supportsAudioRef: true,
    refTags: { image: '@image_%d', video: '@video_%d', audio: '@audio_%d' } },
  { name: 'Seedance 2.5', category: 'ByteDance', unit: 's', t2vId: 'bytedance/seedance-2-5', i2vId: 'bytedance/seedance-2-5', fflfId: 'bytedance/seedance-2-5',
    prices: [{ resolution: '480p', cost: 0.14 }, { resolution: '720p', cost: 0.315 }], durationMax: 30,
    durationOptions: ['4', '5', '6', '8', '10', '12', '15', '20', '30'], resolutions: ['480p', '720p'], supportsVideoRef: true, supportsAudioRef: true,
    refTags: { image: '@image_%d', video: '@video_%d', audio: '@audio_%d' } },
  { name: 'Seedance 2 Fast', category: 'ByteDance', unit: 's', t2vId: 'bytedance/seedance-2-fast', i2vId: 'bytedance/seedance-2-fast', fflfId: 'bytedance/seedance-2-fast',
    prices: [{ resolution: '480p', cost: 0.059 }, { resolution: '720p', cost: 0.124 }], durationMax: 15,
    durationOptions: ['4', '5', '6', '8', '10', '12', '15'], resolutions: ['480p', '720p'], supportsVideoRef: true, supportsAudioRef: true,
    refTags: { image: '@image_%d', video: '@video_%d', audio: '@audio_%d' } },
  { name: 'Seedance 2 Mini', category: 'ByteDance', unit: 's', t2vId: 'bytedance/seedance-2-mini', i2vId: 'bytedance/seedance-2-mini', fflfId: 'bytedance/seedance-2-mini',
    prices: [{ resolution: '480p', cost: 0.019 }, { resolution: '720p', cost: 0.041 }], durationMax: 15,
    durationOptions: ['4', '5', '6', '8', '10', '12', '15'], resolutions: ['480p', '720p'], supportsVideoRef: true, supportsAudioRef: true,
    refTags: { image: '@image_%d', video: '@video_%d', audio: '@audio_%d' } },
  { name: 'Seedance 2.0 (Higgsfield)', category: 'ByteDance', unit: 's', provider: 'higgsfield',
    t2vId: 'bytedance/seedance-2.0/text-to-video',
    prices: [
      { resolution: '480p', cost: 0.135 },
      { resolution: '720p', cost: 0.302 },
      { resolution: '1080p', cost: 0.680 },
      { resolution: '4k', cost: 1.555 },
    ],
    durationMax: 15,
    durationOptions: ['4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'],
    resolutions: ['480p', '720p', '1080p', '4k'],
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'] },
  { name: 'Seedance 2.5 (Higgsfield)', category: 'ByteDance', unit: 's', provider: 'higgsfield',
    t2vId: 'bytedance/seedance-2.5/text-to-video',
    prices: [
      { resolution: '480p', cost: 0.206 },
      { resolution: '720p', cost: 0.462 },
    ],
    durationMax: 30,
    durationOptions: ['4', '5', '6', '8', '10', '12', '15', '20', '30'],
    resolutions: ['480p', '720p'],
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'] },
  { name: 'Kling 3.0 Standard (Higgsfield)', category: 'Kling', unit: 's', provider: 'higgsfield',
    t2vId: 'kling-video/v3.0/std/text-to-video',
    prices: [{ resolution: 'std', cost: 0.07 }],
    durationMax: 15,
    durationOptions: ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'],
    resolutions: ['std'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Wan 2.7', category: 'Wan', unit: 's', t2vId: 'wan-2-7-text-to-video', i2vId: 'wan-2-7-image-to-video',
    prices: [{ resolution: 's', cost: 0.04 }], durationMax: 10 },
  { name: 'Wan 3.0', category: 'Wan', unit: 's',
    t2vId: 'wan/3-0-video', i2vId: 'wan/3-0-video', fflfId: 'wan/3-0-video', refId: 'wan/3-0-video',
    prices: [{ resolution: '480p', cost: 0.04 }, { resolution: '720p', cost: 0.08 }, { resolution: '1080p', cost: 0.16 }],
    durationMax: 30, durationOptions: ['3', '4', '5', '6', '8', '10', '12', '15', '20', '30'],
    resolutions: ['480p', '720p', '1080p'],
    supportsVideoRef: true, supportsAudioRef: true,
    refTags: { image: 'Image%d', video: 'Video%d', audio: 'Audio%d' } },
  { name: 'Hailuo 2 Pro', category: 'Hailuo', unit: 's', t2vId: 'hailuo/02-text-to-video-pro',
    prices: [{ resolution: 's', cost: 0.06 }], durationMax: 10 },
  { name: 'Gemini Omni 1.1 Flash', category: 'Google', unit: 'video',
    t2vId: 'google/gemini-omni-flash-1-1', i2vId: 'google/gemini-omni-flash-1-1', fflfId: 'google/gemini-omni-flash-1-1',
    prices: [{ resolution: '360p', cost: 0.315 }, { resolution: '720p', cost: 0.315 }, { resolution: '1080p', cost: 0.315 }, { resolution: '4k', cost: 0.735 }],
    durationOptions: ['4', '6', '8', '10'], resolutions: ['360p', '720p', '1080p', '4k'],
    supportsVideoRef: true },
  { name: 'PixVerse V6', category: 'PixVerse', unit: 's',
    t2vId: 'pixverse-v6/text-to-video', i2vId: 'pixverse-v6/image-to-video', fflfId: 'pixverse-v6/image-to-video', refId: 'pixverse-v6/reference-to-video',
    prices: PIXVERSE_T2V_PRICES,
    durationMax: 15, resolutions: ['360p', '540p', '720p', '1080p'] },
  { name: 'OmniHuman 1.5', category: 'OmniHuman', unit: 's', t2vId: 'omnihuman-1-5',
    prices: [{ resolution: '1080', cost: 0.135 }],
    durationMax: 15, durationOptions: ['4', '5', '6', '8', '10', '12', '15'], resolutions: ['1080', '720'],
    supportsAudioRef: true },
  { name: 'P-Video Avatar', category: 'Replicate', unit: 's', provider: 'replicate',
    t2vId: 'prunaai/p-video-avatar', i2vId: 'prunaai/p-video-avatar',
    prices: [{ resolution: '720p', cost: 0.025 }, { resolution: '1080p', cost: 0.045 }],
    durationMax: 15, resolutions: ['720p', '1080p'], supportsAudioRef: true,
    replicateVoices: [
      'Zephyr (Female)', 'Puck (Male)', 'Charon (Male)', 'Kore (Female)', 'Fenrir (Male)',
      'Leda (Female)', 'Orus (Male)', 'Aoede (Female)', 'Callirrhoe (Female)', 'Autonoe (Female)',
      'Enceladus (Male)', 'Iapetus (Male)', 'Umbriel (Male)', 'Algenib (Male)', 'Despina (Female)',
      'Erinome (Female)', 'Laomedeia (Female)', 'Achernar (Female)', 'Algieba (Male)', 'Schedar (Male)',
      'Gacrux (Female)', 'Pulcherrima (Female)', 'Achird (Male)', 'Zubenelgenubi (Male)',
      'Vindemiatrix (Female)', 'Sadachbia (Male)', 'Sadaltager (Male)', 'Sulafat (Female)',
      'Alnilam (Male)', 'Rasalgethi (Male)',
    ],
    replicateLanguages: [
      'English (US)', 'English (UK)', 'Spanish', 'French', 'German', 'Italian',
      'Portuguese (Brazil)', 'Japanese', 'Korean', 'Hindi',
    ] },
  { name: 'Crystal Upscaler', category: 'Crystal', unit: 's', provider: 'replicate',
    t2vId: 'philz1337x/crystal-video-upscaler', i2vId: 'philz1337x/crystal-video-upscaler',
    prices: [{ resolution: 'video', cost: 0.10 }],
    supportsVideoRef: true },
  { name: 'P-Video', category: 'PrunaAI', unit: 's', provider: 'replicate',
    t2vId: 'prunaai/p-video', i2vId: 'prunaai/p-video',
    prices: [{ resolution: '720p', cost: 0.02 }, { resolution: '1080p', cost: 0.04 }],
    durationMax: 20, durationOptions: ['4', '5', '6', '8', '10', '12', '15', '20'], resolutions: ['720p', '1080p'],
    supportsAudioRef: true,
    pvAspectRatios: ['16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '1:1'] },
  { name: 'MiniMax H3', category: 'MiniMax', unit: 's',
    t2vId: 'minimax-h3/text-to-video', i2vId: 'minimax-h3/image-to-video', fflfId: 'minimax-h3/image-to-video', refId: 'minimax-h3/reference-to-video',
    prices: [{ resolution: '768P', cost: 0.04 }, { resolution: '2K', cost: 0.065 }],
    durationMax: 15, durationOptions: ['4', '5', '6', '8', '10', '12', '15'], resolutions: ['768P', '2K'],
    supportsVideoRef: true, supportsAudioRef: true },
  { name: 'MiniMax H3 (Fal)', category: 'MiniMax', unit: 's', provider: 'fal',
    t2vId: 'minimax/h3/reference-to-video', i2vId: 'minimax/h3/reference-to-video',
    prices: [{ resolution: '768P', cost: 0.08 }, { resolution: '2K', cost: 0.13 }, { resolution: '4K', cost: 0.16 }],
    durationMax: 15, durationOptions: ['5', '6', '8', '10', '12', '15'], resolutions: ['768P', '2K', '4K'],
    supportsVideoRef: true, supportsAudioRef: true,
    falAspectRatios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] },
  { name: 'MiniMax H3 Max Turbo (Fal)', category: 'MiniMax', unit: 's', provider: 'fal',
    t2vId: 'minimax/h3-max-turbo/text-to-video',
    prices: [{ resolution: '768P', cost: 0.01 }, { resolution: '480P', cost: 0.00625 }, { resolution: '1080P', cost: 0.02 }],
    durationMax: 15, durationOptions: ['5', '6', '8', '10', '12', '15'], resolutions: ['768P', '480P', '1080P'],
    falAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] },
  { name: 'MiniMax H3 Max (Fal)', category: 'MiniMax', unit: 's', provider: 'fal',
    t2vId: 'minimax/h3-max/text-to-video',
    prices: [{ resolution: '768P', cost: 0.02 }, { resolution: '480P', cost: 0.0125 }, { resolution: '1080P', cost: 0.04 }],
    durationMax: 15, durationOptions: ['5', '6', '8', '10', '12', '15'], resolutions: ['768P', '480P', '1080P'],
    falAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] },
  { name: 'MiniMax H3 Max Ref (Fal)', category: 'MiniMax', unit: 's', provider: 'fal',
    t2vId: 'minimax/h3-max/reference-to-video', i2vId: 'minimax/h3-max/reference-to-video', refId: 'minimax/h3-max/reference-to-video',
    prices: [{ resolution: '768P', cost: 0.08 }, { resolution: '480P', cost: 0.05 }],
    durationMax: 15, durationOptions: ['5', '6', '8', '10', '12', '15'], resolutions: ['768P', '480P'],
    supportsVideoRef: true, supportsAudioRef: true,
    refTags: { image: 'Image %d', video: 'Video %d', audio: 'Audio %d' },
    falAspectRatios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] },
  // MachGen video models (https://www.machgen.ai)
  { name: 'Wan2.2-A14B (MachGen)', category: 'Wan', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Wan2.2-A14B/t2v', i2vId: 'machgen/Wan2.2-A14B/i2v',
    prices: [{ resolution: '480p', cost: 0.018 }, { resolution: '720p', cost: 0.036 }],
    durationMax: 10, durationOptions: ['5', '6', '8', '10'], resolutions: ['480p', '720p'],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'] },
  { name: 'LTX-2.3-Pro (MachGen)', category: 'Lightricks', unit: 's', provider: 'machgen',
    t2vId: 'machgen/LTX-2.3-Pro/t2v', i2vId: 'machgen/LTX-2.3-Pro/i2v', fflfId: 'machgen/LTX-2.3-Pro/fflf',
    prices: [{ resolution: '540p', cost: 0.008 }, { resolution: '720p', cost: 0.015 }, { resolution: '1080p', cost: 0.03 }],
    durationMax: 10, durationOptions: ['5', '6', '8', '10'], resolutions: ['540p', '720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] },
  { name: 'Vidu-Q3-Turbo (MachGen)', category: 'Vidu', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Vidu-Q3-Turbo/t2v', i2vId: 'machgen/Vidu-Q3-Turbo/i2v', fflfId: 'machgen/Vidu-Q3-Turbo/fflf', refId: 'machgen/Vidu-Q3-Turbo/ref',
    prices: [{ resolution: '720p', cost: 0.03 }, { resolution: '1080p', cost: 0.06 }],
    durationMax: 8, durationOptions: ['4', '8'], resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Vidu-Q3-Pro (MachGen)', category: 'Vidu', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Vidu-Q3-Pro/t2v', i2vId: 'machgen/Vidu-Q3-Pro/i2v', fflfId: 'machgen/Vidu-Q3-Pro/fflf', refId: 'machgen/Vidu-Q3-Pro/ref',
    prices: [{ resolution: '720p', cost: 0.04 }, { resolution: '1080p', cost: 0.08 }],
    durationMax: 8, durationOptions: ['4', '8'], resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'MiniMax H3 (MachGen)', category: 'MiniMax', unit: 's', provider: 'machgen',
    t2vId: 'machgen/MiniMax-H3/t2v', i2vId: 'machgen/MiniMax-H3/i2v', fflfId: 'machgen/MiniMax-H3/fflf', refId: 'machgen/MiniMax-H3/ref',
    prices: [{ resolution: '480p', cost: 0.035 }, { resolution: '768p', cost: 0.04 }, { resolution: '1080p', cost: 0.08 }],
    durationMax: 15, durationOptions: ['5', '6', '8', '10', '12', '15'], resolutions: ['480p', '768p', '1080p'],
    supportsVideoRef: true,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'] },
  { name: 'MiniMax H3 Turbo (MachGen)', category: 'MiniMax', unit: 's', provider: 'machgen',
    t2vId: 'machgen/MiniMax-H3-Turbo/t2v', i2vId: 'machgen/MiniMax-H3-Turbo/i2v', fflfId: 'machgen/MiniMax-H3-Turbo/fflf', refId: 'machgen/MiniMax-H3-Turbo/ref',
    prices: [{ resolution: '480p', cost: 0.015 }, { resolution: '768p', cost: 0.020 }, { resolution: '1080p', cost: 0.040 }],
    durationMax: 15, durationOptions: ['5', '6', '8', '10', '12', '15'], resolutions: ['480p', '768p', '1080p'],
    supportsVideoRef: true,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'] },
  { name: 'Seedance 2.5 (MachGen)', category: 'ByteDance', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Seedance-2.5/t2v', i2vId: 'machgen/Seedance-2.5/i2v', fflfId: 'machgen/Seedance-2.5/fflf', refId: 'machgen/Seedance-2.5/ref',
    prices: [{ resolution: '720p', cost: 0.05 }, { resolution: '1080p', cost: 0.09 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p', '1080p'],
    supportsVideoRef: true,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'] },
  { name: 'Seedance 2.0 (MachGen)', category: 'ByteDance', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Seedance-2.0/t2v', i2vId: 'machgen/Seedance-2.0/i2v', fflfId: 'machgen/Seedance-2.0/fflf', refId: 'machgen/Seedance-2.0/ref',
    prices: [{ resolution: '720p', cost: 0.04 }, { resolution: '1080p', cost: 0.07 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p', '1080p'],
    supportsVideoRef: true,
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Seedance 2.0 Fast (MachGen)', category: 'ByteDance', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Seedance-2.0-Fast/t2v', i2vId: 'machgen/Seedance-2.0-Fast/i2v', fflfId: 'machgen/Seedance-2.0-Fast/fflf', refId: 'machgen/Seedance-2.0-Fast/ref',
    prices: [{ resolution: '720p', cost: 0.025 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p'],
    supportsVideoRef: true,
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Seedance 2.0 Mini (MachGen)', category: 'ByteDance', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Seedance-2.0-Mini/t2v', i2vId: 'machgen/Seedance-2.0-Mini/i2v', fflfId: 'machgen/Seedance-2.0-Mini/fflf', refId: 'machgen/Seedance-2.0-Mini/ref',
    prices: [{ resolution: '720p', cost: 0.02 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p'],
    supportsVideoRef: true,
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Kling-v3 (MachGen)', category: 'Kling', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Kling-v3/t2v', i2vId: 'machgen/Kling-v3/i2v', fflfId: 'machgen/Kling-v3/fflf',
    prices: [{ resolution: '720p', cost: 0.06 }, { resolution: '1080p', cost: 0.10 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Kling-o3 (MachGen)', category: 'Kling', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Kling-o3/t2v', refId: 'machgen/Kling-o3/ref',
    prices: [{ resolution: '720p', cost: 0.07 }, { resolution: '1080p', cost: 0.12 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Vidu-Q3 (MachGen)', category: 'Vidu', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Vidu-Q3/ref', refId: 'machgen/Vidu-Q3/ref',
    prices: [{ resolution: '720p', cost: 0.035 }],
    durationMax: 8, durationOptions: ['4', '8'], resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Vidu-Q3-Pro-Fast (MachGen)', category: 'Vidu', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Vidu-Q3-Pro-Fast/i2v', i2vId: 'machgen/Vidu-Q3-Pro-Fast/i2v',
    prices: [{ resolution: '720p', cost: 0.03 }],
    durationMax: 8, durationOptions: ['4', '8'], resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Alibaba-Wan-3.0 (MachGen)', category: 'Wan', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Alibaba-Wan-3.0/t2v', i2vId: 'machgen/Alibaba-Wan-3.0/i2v', fflfId: 'machgen/Alibaba-Wan-3.0/fflf', refId: 'machgen/Alibaba-Wan-3.0/ref',
    prices: [{ resolution: '720p', cost: 0.04 }, { resolution: '1080p', cost: 0.08 }],
    durationMax: 15, durationOptions: ['5', '10', '15'], resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Veo-3.1 (MachGen)', category: 'Google', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Veo-3.1/t2v',
    prices: [{ resolution: '720p', cost: 0.15 }, { resolution: '1080p', cost: 0.25 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16'] },
  { name: 'Veo-3.1-Fast (MachGen)', category: 'Google', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Veo-3.1-Fast/t2v',
    prices: [{ resolution: '720p', cost: 0.09 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16'] },
  { name: 'Pixverse-V6 (MachGen)', category: 'Pixverse', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Pixverse-V6/t2v', i2vId: 'machgen/Pixverse-V6/i2v', refId: 'machgen/Pixverse-V6/ref',
    prices: [{ resolution: '720p', cost: 0.04 }, { resolution: '1080p', cost: 0.08 }],
    durationMax: 8, durationOptions: ['5', '8'], resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Pixverse-C1 (MachGen)', category: 'Pixverse', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Pixverse-C1/t2v', i2vId: 'machgen/Pixverse-C1/i2v', refId: 'machgen/Pixverse-C1/ref',
    prices: [{ resolution: '720p', cost: 0.05 }, { resolution: '1080p', cost: 0.09 }],
    durationMax: 8, durationOptions: ['5', '8'], resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'HappyHorse-1.1 (MachGen)', category: 'HappyHorse', unit: 's', provider: 'machgen',
    t2vId: 'machgen/HappyHorse-1.1/t2v', i2vId: 'machgen/HappyHorse-1.1/i2v', refId: 'machgen/HappyHorse-1.1/ref',
    prices: [{ resolution: '720p', cost: 0.035 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16'] },
  { name: 'HappyHorse-1.0 (MachGen)', category: 'HappyHorse', unit: 's', provider: 'machgen',
    t2vId: 'machgen/HappyHorse-1.0/t2v', i2vId: 'machgen/HappyHorse-1.0/i2v', refId: 'machgen/HappyHorse-1.0/ref',
    prices: [{ resolution: '720p', cost: 0.025 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16'] },
  { name: 'Grok-Imagine-Video (MachGen)', category: 'xAI', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Grok-Imagine-Video/t2v',
    prices: [{ resolution: '720p', cost: 0.05 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Grok-Imagine-Video-1.5 (MachGen)', category: 'xAI', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Grok-Imagine-Video-1.5/i2v', i2vId: 'machgen/Grok-Imagine-Video-1.5/i2v',
    prices: [{ resolution: '720p', cost: 0.06 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Topaz-Video-Precision (MachGen)', category: 'Topaz', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Topaz-Video-Precision/upscale',
    prices: [{ resolution: '4K', cost: 0.05 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['4K'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Topaz-Video-Precision-Animation (MachGen)', category: 'Topaz', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Topaz-Video-Precision-Animation/upscale',
    prices: [{ resolution: '4K', cost: 0.05 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['4K'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Topaz-Video-Generative (MachGen)', category: 'Topaz', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Topaz-Video-Generative/upscale',
    prices: [{ resolution: '4K', cost: 0.06 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['4K'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Topaz-Video-Generative-Fast (MachGen)', category: 'Topaz', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Topaz-Video-Generative-Fast/upscale',
    prices: [{ resolution: '4K', cost: 0.04 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['4K'],
    aspectRatios: ['16:9', '9:16', '1:1'] },

  // Missing KIE video models
  { name: 'Sora 2 (KIE)', category: 'OpenAI', unit: 's', provider: 'kie',
    t2vId: 'sora-2', i2vId: 'sora-2',
    prices: [{ resolution: '720p', cost: 0.25 }],
    durationMax: 20, durationOptions: ['5', '10', '15', '20'], resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Runway Gen-4.5 (KIE)', category: 'Runway', unit: 's', provider: 'kie',
    t2vId: 'runway-gen-4-5', i2vId: 'runway-gen-4-5',
    prices: [{ resolution: '720p', cost: 0.10 }, { resolution: '1080p', cost: 0.15 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Veo 3.1 (KIE)', category: 'Google', unit: 's', provider: 'kie',
    t2vId: 'veo-3-1', i2vId: 'veo-3-1',
    prices: [{ resolution: '720p', cost: 0.15 }, { resolution: '1080p', cost: 0.20 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },

  // Missing Replicate video models
  { name: 'Runway Gen-4.5 (Replicate)', category: 'Runway', unit: 's', provider: 'replicate',
    t2vId: 'runway/gen-4.5', i2vId: 'runway/gen-4.5',
    prices: [{ resolution: '720p', cost: 0.10 }, { resolution: '1080p', cost: 0.15 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Veo 3.1 (Replicate)', category: 'Google', unit: 's', provider: 'replicate',
    t2vId: 'google/veo-3.1', i2vId: 'google/veo-3.1',
    prices: [{ resolution: '720p', cost: 0.15 }, { resolution: '1080p', cost: 0.20 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Kling 3.0 (Replicate)', category: 'Kling', unit: 's', provider: 'replicate',
    t2vId: 'kling-ai/kling-video-3.0', i2vId: 'kling-ai/kling-video-3.0',
    prices: [{ resolution: '720p', cost: 0.08 }],
    durationMax: 15, durationOptions: ['5', '10', '15'], resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Kling 1.5 Pro (Replicate)', category: 'Kling', unit: 's', provider: 'replicate',
    t2vId: 'kling-ai/kling-v1.5-pro', i2vId: 'kling-ai/kling-v1.5-pro',
    prices: [{ resolution: '720p', cost: 0.05 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Wan 2.1 Video (Replicate)', category: 'Wan', unit: 's', provider: 'replicate',
    t2vId: 'wan-video/wan-2.1', i2vId: 'wan-video/wan-2.1',
    prices: [{ resolution: '720p', cost: 0.025 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'LTX-Video (Replicate)', category: 'Lightricks', unit: 's', provider: 'replicate',
    t2vId: 'lightricks/ltx-video', i2vId: 'lightricks/ltx-video',
    prices: [{ resolution: '720p', cost: 0.01 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'MiniMax Video-01 (Replicate)', category: 'MiniMax', unit: 's', provider: 'replicate',
    t2vId: 'minimax/video-01', i2vId: 'minimax/video-01',
    prices: [{ resolution: '720p', cost: 0.03 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },

  // Missing fal.ai video models
  { name: 'Veo 3.1 (Fal)', category: 'Google', unit: 's', provider: 'fal',
    t2vId: 'fal-ai/google/veo-3-1', i2vId: 'fal-ai/google/veo-3-1',
    prices: [{ resolution: '720p', cost: 0.15 }, { resolution: '1080p', cost: 0.20 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p', '1080p'],
    falAspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Kling 3.0 Video (Fal)', category: 'Kling', unit: 's', provider: 'fal',
    t2vId: 'fal-ai/kling-video/v3/text-to-video', i2vId: 'fal-ai/kling-video/v3/image-to-video',
    prices: [{ resolution: 'std', cost: 0.08 }],
    durationMax: 15, durationOptions: ['5', '10', '15'], resolutions: ['std'],
    falAspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Kling 2.5 Turbo Video (Fal)', category: 'Kling', unit: 's', provider: 'fal',
    t2vId: 'fal-ai/kling-video/v2.5/turbo', i2vId: 'fal-ai/kling-video/v2.5/turbo',
    prices: [{ resolution: 'std', cost: 0.05 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['std'],
    falAspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Wan 3.0 Video (Fal)', category: 'Wan', unit: 's', provider: 'fal',
    t2vId: 'fal-ai/wan/v3/text-to-video', i2vId: 'fal-ai/wan/v3/image-to-video',
    prices: [{ resolution: '720p', cost: 0.05 }],
    durationMax: 15, durationOptions: ['5', '10', '15'], resolutions: ['720p'],
    falAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'] },
  { name: 'Wan 2.1 Video (Fal)', category: 'Wan', unit: 's', provider: 'fal',
    t2vId: 'fal-ai/wan/v2.1/text-to-video', i2vId: 'fal-ai/wan/v2.1/image-to-video',
    prices: [{ resolution: '720p', cost: 0.025 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p'],
    falAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'] },
  { name: 'Seedance 2.5 (Fal)', category: 'ByteDance', unit: 's', provider: 'fal',
    t2vId: 'fal-ai/bytedance/seedance-2-5', i2vId: 'fal-ai/bytedance/seedance-2-5',
    prices: [{ resolution: '720p', cost: 0.18 }],
    durationMax: 20, durationOptions: ['5', '10', '15', '20'], resolutions: ['720p'],
    falAspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'HunyuanVideo (Fal)', category: 'Tencent', unit: 's', provider: 'fal',
    t2vId: 'fal-ai/hunyuan-video', i2vId: 'fal-ai/hunyuan-video',
    prices: [{ resolution: '720p', cost: 0.03 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p'],
    falAspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'LTX-Video 2B (Fal)', category: 'Lightricks', unit: 's', provider: 'fal',
    t2vId: 'fal-ai/ltx-video', i2vId: 'fal-ai/ltx-video',
    prices: [{ resolution: '720p', cost: 0.008 }],
    durationMax: 10, durationOptions: ['5', '10'], resolutions: ['720p'],
    falAspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'PixVerse V6 (Fal)', category: 'PixVerse', unit: 's', provider: 'fal',
    t2vId: 'fal-ai/pixverse/v6', i2vId: 'fal-ai/pixverse/v6',
    prices: [{ resolution: '720p', cost: 0.036 }],
    durationMax: 15, durationOptions: ['5', '10', '15'], resolutions: ['720p'],
    falAspectRatios: ['16:9', '9:16', '1:1'] },


  // Missing Higgsfield video models
  { name: 'Wan 3.0 (Higgsfield)', category: 'Wan', unit: 's', provider: 'higgsfield',
    t2vId: 'higgsfield/wan-3-0/text-to-video', i2vId: 'higgsfield/wan-3-0/image-to-video',
    prices: [{ resolution: '720p', cost: 0.04 }],
    durationMax: 15, durationOptions: ['5', '10', '15'], resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'Soul 2.0 Cinema (Higgsfield)', category: 'Higgsfield', unit: 's', provider: 'higgsfield',
    t2vId: 'higgsfield/soul-2-0/text-to-video', i2vId: 'higgsfield/soul-2-0/image-to-video',
    prices: [{ resolution: '720p', cost: 0.12 }],
    durationMax: 15, durationOptions: ['5', '10', '15'], resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
  { name: 'MiniMax H3 (Higgsfield)', category: 'MiniMax', unit: 's', provider: 'higgsfield',
    t2vId: 'higgsfield/minimax-h3/text-to-video', i2vId: 'higgsfield/minimax-h3/image-to-video',
    prices: [{ resolution: '720p', cost: 0.05 }],
    durationMax: 15, durationOptions: ['5', '10', '15'], resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1'] },
]

// ─── Audio models ──────────────────────────────────────────────────────────

export const AUDIO_MODELS: ModelPricing[] = [
  { name: 'ElevenLabs TTS', category: 'ElevenLabs', unit: 'img', t2aId: 'elevenlabs-tts', kind: 'voice', provider: 'elevenlabs', engine: 'elevenlabs',
    prices: [{ resolution: 'clip', cost: 0.015 }] },
  { name: 'GPT TTS', category: 'OpenAI', unit: 'img', t2aId: 'gpt-tts-1', kind: 'voice', provider: 'kie',
    prices: [{ resolution: 'clip', cost: 0.004 }] },
  { name: 'MiniMax TTS', category: 'MiniMax', unit: 'img', t2aId: 'minimax-text-to-speech', kind: 'voice', provider: 'kie',
    prices: [{ resolution: 'clip', cost: 0.003 }] },
  { name: 'ElevenLabs Music', category: 'ElevenLabs', unit: 's', t2aId: 'elevenlabs-music', kind: 'music', provider: 'elevenlabs', engine: 'elevenlabs',
    prices: [{ resolution: 'std', cost: 0.004 }],
    durationMax: 600, durationOptions: ['15', '30', '60', '120', '180', '300'] },

  // Missing TTS (Voice) models
  { name: 'Qwen 3 TTS (KIE)', category: 'Qwen', unit: 'img', t2aId: 'qwen-3-tts', kind: 'voice', provider: 'kie',
    prices: [{ resolution: 'clip', cost: 0.015 }] },
  { name: 'ElevenLabs TTS (KIE)', category: 'ElevenLabs', unit: 'img', t2aId: 'elevenlabs-tts-kie', kind: 'voice', provider: 'kie',
    prices: [{ resolution: 'clip', cost: 0.020 }] },
  { name: 'Dia TTS (Fal)', category: 'Fal', unit: 'img', t2aId: 'fal-ai/dia-tts', kind: 'voice', provider: 'fal',
    prices: [{ resolution: 'clip', cost: 0.030 }] },
  { name: 'Orpheus TTS (Fal)', category: 'Fal', unit: 'img', t2aId: 'fal-ai/orpheus-tts', kind: 'voice', provider: 'fal',
    prices: [{ resolution: 'clip', cost: 0.025 }] },
  { name: 'Qwen Audio 3.0 TTS (Fal)', category: 'Qwen', unit: 'img', t2aId: 'fal-ai/qwen-audio-3-tts', kind: 'voice', provider: 'fal',
    prices: [{ resolution: 'clip', cost: 0.015 }] },
  { name: 'Kokoro TTS (Fal)', category: 'Kokoro', unit: 'img', t2aId: 'fal-ai/kokoro', kind: 'voice', provider: 'fal',
    prices: [{ resolution: 'clip', cost: 0.020 }] },
  { name: 'Gemini TTS (Fal)', category: 'Google', unit: 'img', t2aId: 'fal-ai/gemini-tts', kind: 'voice', provider: 'fal',
    prices: [{ resolution: 'clip', cost: 0.015 }] },
  { name: 'xAI TTS (Fal)', category: 'xAI', unit: 'img', t2aId: 'fal-ai/xai-tts', kind: 'voice', provider: 'fal',
    prices: [{ resolution: 'clip', cost: 0.025 }] },
  { name: 'ElevenLabs TTS (Fal)', category: 'ElevenLabs', unit: 'img', t2aId: 'fal-ai/elevenlabs/tts', kind: 'voice', provider: 'fal',
    prices: [{ resolution: 'clip', cost: 0.020 }] },
  { name: 'Gemini 3.1 Flash TTS (Replicate)', category: 'Google', unit: 'img', t2aId: 'google/gemini-3.1-flash-tts', kind: 'voice', provider: 'replicate',
    prices: [{ resolution: 'clip', cost: 0.015 }] },
  { name: 'F5-TTS (Replicate)', category: 'F5', unit: 'img', t2aId: 'f5-tts', kind: 'voice', provider: 'replicate',
    prices: [{ resolution: 'clip', cost: 0.005 }] },
  { name: 'Inworld TTS (Replicate)', category: 'Inworld', unit: 'img', t2aId: 'inworld/inworld-tts', kind: 'voice', provider: 'replicate',
    prices: [{ resolution: 'clip', cost: 0.010 }] },
  { name: 'Kokoro (Replicate)', category: 'Kokoro', unit: 'img', t2aId: 'cjwbw/kokoro', kind: 'voice', provider: 'replicate',
    prices: [{ resolution: 'clip', cost: 0.002 }] },
  { name: 'XTTS v2 (Replicate)', category: 'Coqui', unit: 'img', t2aId: 'lucataco/xtts-v2', kind: 'voice', provider: 'replicate',
    prices: [{ resolution: 'clip', cost: 0.005 }] },
  { name: 'Eleven-v3 (MachGen)', category: 'ElevenLabs', unit: 'img', t2aId: 'machgen/Eleven-v3', kind: 'voice', provider: 'machgen',
    prices: [{ resolution: 'clip', cost: 0.005 }] },
  { name: 'Eleven-SFX-v2 (MachGen)', category: 'ElevenLabs', unit: 'img', t2aId: 'machgen/Eleven-SFX-v2', kind: 'voice', provider: 'machgen',
    prices: [{ resolution: 'clip', cost: 0.005 }] },

  // Missing Music Generation models
  { name: 'ElevenLabs Music v2.5', category: 'ElevenLabs', unit: 's', t2aId: 'elevenlabs-music-v2-5', kind: 'music', provider: 'elevenlabs', engine: 'elevenlabs',
    prices: [{ resolution: 'std', cost: 0.004 }],
    durationMax: 600, durationOptions: ['15', '30', '60', '120', '180', '300'] },
  { name: 'Suno v4 / v4.5 (KIE)', category: 'Suno', unit: 'img', t2aId: 'suno-v4', kind: 'music', provider: 'kie',
    prices: [{ resolution: 'song', cost: 0.040 }] },
  { name: 'Suno v3.5 (KIE)', category: 'Suno', unit: 'img', t2aId: 'suno-v3-5', kind: 'music', provider: 'kie',
    prices: [{ resolution: 'song', cost: 0.030 }] },
  { name: 'MiniMax Music 3 (Fal)', category: 'MiniMax', unit: 'img', t2aId: 'fal-ai/minimax/music-3', kind: 'music', provider: 'fal',
    prices: [{ resolution: 'clip', cost: 0.030 }] },
  { name: 'MiniMax Music 2.0 (Fal)', category: 'MiniMax', unit: 'img', t2aId: 'fal-ai/minimax-music', kind: 'music', provider: 'fal',
    prices: [{ resolution: 'clip', cost: 0.020 }] },
  { name: 'CassetteAI (Fal)', category: 'CassetteAI', unit: 'img', t2aId: 'fal-ai/cassette-ai', kind: 'music', provider: 'fal',
    prices: [{ resolution: 'clip', cost: 0.015 }] },
  { name: 'Sonilo V1.1 (Fal)', category: 'Sonilo', unit: 'img', t2aId: 'fal-ai/sonilo', kind: 'music', provider: 'fal',
    prices: [{ resolution: 'clip', cost: 0.020 }] },
  { name: 'Stable Audio Open (Fal)', category: 'Stability', unit: 'img', t2aId: 'fal-ai/stable-audio-open', kind: 'music', provider: 'fal',
    prices: [{ resolution: 'clip', cost: 0.008 }] },
  { name: 'ElevenLabs Music (Fal)', category: 'ElevenLabs', unit: 's', t2aId: 'fal-ai/elevenlabs/music', kind: 'music', provider: 'fal',
    prices: [{ resolution: 'std', cost: 0.004 }],
    durationMax: 300, durationOptions: ['15', '30', '60', '120', '180', '300'] },
  { name: 'Lyria 3 (Replicate)', category: 'Google', unit: 'img', t2aId: 'google/lyria-3', kind: 'music', provider: 'replicate',
    prices: [{ resolution: 'clip', cost: 0.030 }] },
  { name: 'Stable Audio 2.5 (Replicate)', category: 'Stability', unit: 'img', t2aId: 'stability-ai/stable-audio-2.5', kind: 'music', provider: 'replicate',
    prices: [{ resolution: 'clip', cost: 0.020 }] },
  { name: 'Stable Audio Open 1.0 (Replicate)', category: 'Stability', unit: 'img', t2aId: 'stability-ai/stable-audio-open-1.0', kind: 'music', provider: 'replicate',
    prices: [{ resolution: 'clip', cost: 0.005 }] },
  { name: 'MusicGen (Replicate)', category: 'Meta', unit: 'img', t2aId: 'meta/musicgen', kind: 'music', provider: 'replicate',
    prices: [{ resolution: 'clip', cost: 0.010 }] },
  { name: 'Eleven-Music-v2 (MachGen)', category: 'ElevenLabs', unit: 'img', t2aId: 'machgen/Eleven-Music-v2', kind: 'music', provider: 'machgen',
    prices: [{ resolution: 'clip', cost: 0.008 }] },
]

// ─── Cost calculation (single source of truth) ─────────────────────────────

export function unitPrice(model: ModelPricing, resolution?: string): number {
  let perUnit = model.prices[0]?.cost || 0
  if (resolution) {
    const entry = model.prices.find(p => p.resolution === resolution)
    if (entry) perUnit = entry.cost
  }
  return perUnit
}

export function calcCost(model: ModelPricing, resolution?: string, duration?: number, batchSize = 1) {
  let perUnit = unitPrice(model, resolution)
  if (model.unit === 's' && duration) perUnit *= duration
  const totalDollars = perUnit * batchSize
  return {
    perUnitCredits: Math.round(perUnit * CREDITS_PER_DOLLAR),
    totalCredits: Math.round(totalDollars * CREDITS_PER_DOLLAR),
    perUnitDollars: perUnit,
    totalDollars,
  }
}

export function costCredits(model: ModelPricing, resolution?: string): number {
  return calcCost(model, resolution).totalCredits
}

export interface CostContext {
  resolution?: string
  aspectRatio?: string
  requestedSeconds?: number
  audioRefSeconds?: number
  wordCount?: number
  multiSceneSeconds?: number[]
  imageCount?: number
  inputVideoSeconds?: number
  batchSize?: number
}

export function getSeedance20Dimensions(resolution: string = '720p', aspectRatio: string = '16:9'): { width: number; height: number } {
  const res = resolution.toLowerCase()
  const ar = aspectRatio.toLowerCase()

  const dims: Record<string, Record<string, { width: number; height: number }>> = {
    '480p': {
      '16:9': { width: 854, height: 480 },
      '4:3': { width: 640, height: 480 },
      '1:1': { width: 480, height: 480 },
      '3:4': { width: 480, height: 640 },
      '9:16': { width: 480, height: 854 },
      '21:9': { width: 1120, height: 480 },
    },
    '720p': {
      '16:9': { width: 1280, height: 720 },
      '4:3': { width: 960, height: 720 },
      '1:1': { width: 720, height: 720 },
      '3:4': { width: 720, height: 960 },
      '9:16': { width: 720, height: 1280 },
      '21:9': { width: 1680, height: 720 },
    },
    '1080p': {
      '16:9': { width: 1920, height: 1080 },
      '4:3': { width: 1440, height: 1080 },
      '1:1': { width: 1080, height: 1080 },
      '3:4': { width: 1080, height: 1440 },
      '9:16': { width: 1080, height: 1920 },
      '21:9': { width: 2520, height: 1080 },
    },
    '4k': {
      '16:9': { width: 3840, height: 2160 },
      '4:3': { width: 2880, height: 2160 },
      '1:1': { width: 2160, height: 2160 },
      '3:4': { width: 2160, height: 2880 },
      '9:16': { width: 2160, height: 3840 },
      '21:9': { width: 5040, height: 2160 },
    },
  }
  return dims[res]?.[ar] || dims['720p']?.['16:9'] || { width: 1280, height: 720 }
}

// The billed duration depends on the model:
// - OmniHuman 1.5 is audio-driven (output length follows the attached audio)
// - P-Video Avatar is audio-driven too; without audio the speech length is
//   estimated from the script (~2.5 words/sec)
// - Kling 3.0 multi-shot bills the sum of all scene durations
export function resolveVideoDuration(model: ModelPricing, ctx: CostContext = {}): number {
  const audio = ctx.audioRefSeconds && ctx.audioRefSeconds > 0 ? ctx.audioRefSeconds : 0
  if (model.t2vId === 'omnihuman-1-5') return audio
  if (model.provider === 'replicate') {
    if (model.t2vId === 'prunaai/p-video-avatar') {
      return audio > 0 ? audio : Math.max(1, Math.round(((ctx.wordCount || 0) / 2.5) * 10) / 10)
    }
    return ctx.requestedSeconds || 0
  }
  if ((model.t2vId?.startsWith('kling-3') || model.t2vId?.startsWith('kling-video/v3')) && ctx.multiSceneSeconds && ctx.multiSceneSeconds.length > 0) {
    return ctx.multiSceneSeconds.reduce((s, x) => s + x, 0)
  }
  return ctx.requestedSeconds || 0
}

// Total cost for a video generation, including model-specific surcharges:
// - Wan 3.0 (KIE): Total = Unit Price × (Generated + Input Video Duration)
// - Gemini Omni 1.1 Flash (KIE):
//   No video: 4s/6s/8s/10s at 360p/720p/1080p = 63/84/105/126 credits ($0.315-$0.630), 4k = 147/168/189/210 credits ($0.735-$1.050)
//   With video: 360p/720p/1080p = 168 credits ($0.840), 4k = 252 credits ($1.260)
// - fal.ai MiniMax H3 / H3 Max: first 5/4 reference images free, +$0.08/$0.02 per extra image
// - KIE MiniMax H3: Total = Unit Price × (Generated + Input Video Duration) + Additional Image Cost
//   (first 5 images free, +$0.02 per extra image; audio input free)
// - Seedance 2.5 (Higgsfield): Token-metered pricing.
//   Billable video tokens = ceil((input video seconds + generated video seconds) × output width × output height × 24 fps / 1024).
//   At 480p or 720p: $0.0214 per 1,000 video tokens.
// - Seedance 2.0 (Higgsfield): Token-metered pricing.
//   Billable video tokens = ceil(generated video seconds × output width × output height × 24 fps / 1024).
//   Per 1,000 video tokens: 480p/720p/1080p $0.014, 4K $0.008.
export function calcVideoCost(model: ModelPricing, ctx: CostContext = {}) {
  if (model.t2vId === 'bytedance/seedance-2.5/text-to-video') {
    const dur = ctx.requestedSeconds || 5
    const totalSeconds = dur + (ctx.inputVideoSeconds || 0)
    const { width, height } = getSeedance20Dimensions(ctx.resolution, ctx.aspectRatio)
    const billableTokens = Math.ceil((totalSeconds * width * height * 24) / 1024)
    const baseDollars = (billableTokens / 1000) * 0.0214
    const totalDollars = baseDollars * (ctx.batchSize || 1)
    return {
      perUnitCredits: Math.round(baseDollars * CREDITS_PER_DOLLAR),
      totalCredits: Math.round(totalDollars * CREDITS_PER_DOLLAR),
      perUnitDollars: baseDollars,
      totalDollars,
    }
  }

  if (model.t2vId === 'bytedance/seedance-2.0/text-to-video') {
    const dur = ctx.requestedSeconds || 5
    const { width, height } = getSeedance20Dimensions(ctx.resolution, ctx.aspectRatio)
    const billableTokens = Math.ceil((dur * width * height * 24) / 1024)
    const ratePer1k = ctx.resolution?.toLowerCase() === '4k' ? 0.008 : 0.014
    const baseDollars = (billableTokens / 1000) * ratePer1k
    const totalDollars = baseDollars * (ctx.batchSize || 1)
    return {
      perUnitCredits: Math.round(baseDollars * CREDITS_PER_DOLLAR),
      totalCredits: Math.round(totalDollars * CREDITS_PER_DOLLAR),
      perUnitDollars: baseDollars,
      totalDollars,
    }
  }

  if (model.t2vId === 'google/gemini-omni-flash-1-1' || model.t2vId === 'gemini-omni-video') {
    const dur = ctx.requestedSeconds || 6
    const extraSteps = Math.max(0, (dur - 4) / 2)
    const is4k = ctx.resolution?.toLowerCase() === '4k'
    const hasInputVideo = (ctx.inputVideoSeconds || 0) > 0
    let baseDollars = is4k ? 0.735 : 0.315
    if (hasInputVideo) {
      baseDollars = is4k ? 1.260 : 0.840
    } else {
      baseDollars += extraSteps * 0.105
    }
    const totalDollars = baseDollars * (ctx.batchSize || 1)
    return {
      perUnitCredits: Math.round(baseDollars * CREDITS_PER_DOLLAR),
      totalCredits: Math.round(totalDollars * CREDITS_PER_DOLLAR),
      perUnitDollars: baseDollars,
      totalDollars,
    }
  }

  const duration = resolveVideoDuration(model, ctx)
  const base = calcCost(model, ctx.resolution, duration, ctx.batchSize || 1)
  const imageCount = ctx.imageCount || 0
  let surcharge = 0
  if (model.provider === 'fal' && model.t2vId?.startsWith('minimax/') && !model.t2vId.includes('text-to-video')) {
    const freeImages = model.t2vId.includes('h3-max') ? 4 : 5
    const extraCost = model.t2vId.includes('h3-max') ? 0.02 : 0.08
    surcharge += Math.max(0, imageCount - freeImages) * extraCost
  }
  if (model.t2vId?.startsWith('minimax-h3/') || model.t2vId?.startsWith('wan/3-0')) {
    if (model.t2vId?.startsWith('minimax-h3/')) {
      surcharge += Math.max(0, imageCount - 5) * 0.02
    }
    surcharge += (ctx.inputVideoSeconds || 0) * base.perUnitDollars
  }
  const totalDollars = base.totalDollars + surcharge
  return {
    ...base,
    totalDollars,
    totalCredits: Math.round(totalDollars * CREDITS_PER_DOLLAR),
  }
}

// ─── LLM / Chat models ───────────────────────────────────────────────────

export const LLM_MODELS: ModelPricing[] = [
  // ─── DeepSeek Native ──────────────────────────────────────────────
  {
    name: 'DeepSeek V3',
    category: 'DeepSeek',
    unit: 'img',
    modelId: 'deepseek-chat',
    prices: [{ resolution: 'default', cost: 0.002 }],
    provider: 'deepseek',
  },
  {
    name: 'DeepSeek R1',
    category: 'DeepSeek',
    unit: 'img',
    modelId: 'deepseek-reasoner',
    prices: [{ resolution: 'default', cost: 0.004 }],
    provider: 'deepseek',
  },

  // ─── OpenAI Native ────────────────────────────────────────────────
  {
    name: 'GPT-4o',
    category: 'OpenAI',
    unit: 'img',
    modelId: 'gpt-4o',
    prices: [{ resolution: 'default', cost: 0.005 }],
    provider: 'openai',
  },
  {
    name: 'GPT-4o mini',
    category: 'OpenAI',
    unit: 'img',
    modelId: 'gpt-4o-mini',
    prices: [{ resolution: 'default', cost: 0.001 }],
    provider: 'openai',
  },
  {
    name: 'o3-mini',
    category: 'OpenAI',
    unit: 'img',
    modelId: 'o3-mini',
    prices: [{ resolution: 'default', cost: 0.003 }],
    provider: 'openai',
  },
  {
    name: 'GPT-4.5 Preview',
    category: 'OpenAI',
    unit: 'img',
    modelId: 'gpt-4.5-preview',
    prices: [{ resolution: 'default', cost: 0.075 }],
    provider: 'openai',
  },

  // ─── Anthropic Native ─────────────────────────────────────────────
  {
    name: 'Claude 3.7 Sonnet',
    category: 'Anthropic',
    unit: 'img',
    modelId: 'claude-3-7-sonnet-20250219',
    prices: [{ resolution: 'default', cost: 0.015 }],
    provider: 'anthropic',
  },
  {
    name: 'Claude 3.5 Sonnet',
    category: 'Anthropic',
    unit: 'img',
    modelId: 'claude-3-5-sonnet-20241022',
    prices: [{ resolution: 'default', cost: 0.015 }],
    provider: 'anthropic',
  },
  {
    name: 'Claude 3.5 Haiku',
    category: 'Anthropic',
    unit: 'img',
    modelId: 'claude-3-5-haiku-20241022',
    prices: [{ resolution: 'default', cost: 0.002 }],
    provider: 'anthropic',
  },

  // ─── Google Gemini Native ─────────────────────────────────────────
  {
    name: 'Gemini 2.5 Pro',
    category: 'Google',
    unit: 'img',
    modelId: 'gemini-2.5-pro',
    prices: [{ resolution: 'default', cost: 0.005 }],
    provider: 'gemini',
  },
  {
    name: 'Gemini 2.5 Flash',
    category: 'Google',
    unit: 'img',
    modelId: 'gemini-2.5-flash',
    prices: [{ resolution: 'default', cost: 0.001 }],
    provider: 'gemini',
  },
  {
    name: 'Gemini 2.0 Flash',
    category: 'Google',
    unit: 'img',
    modelId: 'gemini-2.0-flash',
    prices: [{ resolution: 'default', cost: 0.0005 }],
    provider: 'gemini',
  },

  // ─── OpenRouter Models ─────────────────────────────────────────────
  {
    name: 'Claude 3.7 Sonnet (OpenRouter)',
    category: 'OpenRouter',
    unit: 'img',
    modelId: 'anthropic/claude-3.7-sonnet',
    prices: [{ resolution: 'default', cost: 0.003 }],
    provider: 'openrouter',
  },
  {
    name: 'DeepSeek R1 (OpenRouter)',
    category: 'OpenRouter',
    unit: 'img',
    modelId: 'deepseek/deepseek-r1',
    prices: [{ resolution: 'default', cost: 0.002 }],
    provider: 'openrouter',
  },
  {
    name: 'DeepSeek V3 (OpenRouter)',
    category: 'OpenRouter',
    unit: 'img',
    modelId: 'deepseek/deepseek-chat',
    prices: [{ resolution: 'default', cost: 0.001 }],
    provider: 'openrouter',
  },
  {
    name: 'Llama 3.3 70B (OpenRouter)',
    category: 'OpenRouter',
    unit: 'img',
    modelId: 'meta-llama/llama-3.3-70b-instruct',
    prices: [{ resolution: 'default', cost: 0.0008 }],
    provider: 'openrouter',
  },
  {
    name: 'Gemini 2.0 Flash (OpenRouter)',
    category: 'OpenRouter',
    unit: 'img',
    modelId: 'google/gemini-2.0-flash-001',
    prices: [{ resolution: 'default', cost: 0.0005 }],
    provider: 'openrouter',
  },
  {
    name: 'Mistral Large (OpenRouter)',
    category: 'OpenRouter',
    unit: 'img',
    modelId: 'mistralai/mistral-large-2411',
    prices: [{ resolution: 'default', cost: 0.002 }],
    provider: 'openrouter',
  },
  {
    name: 'Qwen 2.5 72B (OpenRouter)',
    category: 'OpenRouter',
    unit: 'img',
    modelId: 'qwen/qwen-2.5-72b-instruct',
    prices: [{ resolution: 'default', cost: 0.0008 }],
    provider: 'openrouter',
  },
  {
    name: 'GPT-4o (OpenRouter)',
    category: 'OpenRouter',
    unit: 'img',
    modelId: 'openai/gpt-4o',
    prices: [{ resolution: 'default', cost: 0.0025 }],
    provider: 'openrouter',
  },
  {
    name: 'o3-mini (OpenRouter)',
    category: 'OpenRouter',
    unit: 'img',
    modelId: 'openai/o3-mini',
    prices: [{ resolution: 'default', cost: 0.0015 }],
    provider: 'openrouter',
  },

  // ─── KIE.ai Hosted LLMs ───────────────────────────────────────────
  {
    name: 'Claude Opus 4.7 (KIE)',
    category: 'Anthropic',
    unit: 'img',
    modelId: 'claude-opus-4-7',
    prices: [{ resolution: 'default', cost: 0.025 }],
    provider: 'kie',
  },
  {
    name: 'Claude Opus 4.8 (KIE)',
    category: 'Anthropic',
    unit: 'img',
    modelId: 'claude-opus-4-8',
    prices: [{ resolution: 'default', cost: 0.03 }],
    provider: 'kie',
  },
  {
    name: 'Claude Fable 5 (KIE)',
    category: 'Anthropic',
    unit: 'img',
    modelId: 'claude-fable-5',
    prices: [{ resolution: 'default', cost: 0.035 }],
    provider: 'kie',
  },
  {
    name: 'Claude 3.7 Sonnet (KIE)',
    category: 'Anthropic',
    unit: 'img',
    modelId: 'claude-3-7-sonnet',
    prices: [{ resolution: 'default', cost: 0.015 }],
    provider: 'kie',
  },
  {
    name: 'GPT-5.2 (KIE)',
    category: 'OpenAI',
    unit: 'img',
    modelId: 'gpt-5-2',
    prices: [{ resolution: 'default', cost: 0.01 }],
    provider: 'kie',
  },
  {
    name: 'DeepSeek R1 (KIE)',
    category: 'DeepSeek',
    unit: 'img',
    modelId: 'deepseek-r1',
    prices: [{ resolution: 'default', cost: 0.003 }],
    provider: 'kie',
  },
  {
    name: 'Gemini 2.5 Pro (KIE)',
    category: 'Google',
    unit: 'img',
    modelId: 'gemini-2-5-pro',
    prices: [{ resolution: 'default', cost: 0.005 }],
    provider: 'kie',
  },
  {
    name: 'Grok 4.5 (KIE)',
    category: 'xAI',
    unit: 'img',
    modelId: 'grok-4-5',
    prices: [{ resolution: 'default', cost: 0.008 }],
    provider: 'kie',
  },
  {
    name: 'DeepSeek V3 (KIE)',
    category: 'DeepSeek',
    unit: 'img',
    modelId: 'deepseek-v3',
    prices: [{ resolution: 'default', cost: 0.002 }],
    provider: 'kie',
  },
]
