export const CREDITS_PER_DOLLAR = 200

export interface PriceEntry {
  resolution: string
  cost: number
}

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
  provider?: 'kie' | 'replicate' | 'fal' | 'elevenlabs' | 'machgen' | 'higgsfield'
  replicateVoices?: string[]
  replicateLanguages?: string[]
  falAspectRatios?: string[]
  pvAspectRatios?: string[]
  aspectRatios?: string[]
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
  // MachGen models (https://www.machgen.ai/docs/rest_api)
  { name: 'MiniMax H3 (MachGen)', category: 'MiniMax', unit: 's', provider: 'machgen',
    t2vId: 'machgen/MiniMax-H3/t2v', i2vId: 'machgen/MiniMax-H3/i2v', fflfId: 'machgen/MiniMax-H3/fflf', refId: 'machgen/MiniMax-H3/ref',
    prices: [{ resolution: '480p', cost: 0.035 }, { resolution: '768p', cost: 0.04 }, { resolution: '1440p', cost: 0.10 }],
    durationMax: 15, durationOptions: ['5', '6', '8', '10', '12', '15'], resolutions: ['480p', '768p', '1440p'],
    supportsVideoRef: true, supportsAudioRef: true,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'] },
  { name: 'LTX-2.3-Pro (MachGen)', category: 'Lightricks', unit: 's', provider: 'machgen',
    t2vId: 'machgen/LTX-2.3-Pro/t2v', i2vId: 'machgen/LTX-2.3-Pro/i2v', fflfId: 'machgen/LTX-2.3-Pro/fflf',
    prices: [{ resolution: '540p', cost: 0.008 }, { resolution: '720p', cost: 0.015 }, { resolution: '1080p', cost: 0.03 }],
    durationMax: 10, durationOptions: ['5', '6', '8', '10'], resolutions: ['540p', '720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] },
  { name: 'Wan2.2-A14B (MachGen)', category: 'Wan', unit: 's', provider: 'machgen',
    t2vId: 'machgen/Wan2.2-A14B/t2v', i2vId: 'machgen/Wan2.2-A14B/i2v',
    prices: [{ resolution: '480p', cost: 0.018 }, { resolution: '720p', cost: 0.036 }],
    durationMax: 10, durationOptions: ['5', '6', '8', '10'], resolutions: ['480p', '720p'],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'] },
]

// ─── Audio models ──────────────────────────────────────────────────────────

export const AUDIO_MODELS: ModelPricing[] = [
  { name: 'GPT TTS', category: 'OpenAI', unit: 'img', t2aId: 'gpt-tts-1', kind: 'voice',
    prices: [{ resolution: 'clip', cost: 0.004 }] },
  { name: 'MiniMax TTS', category: 'MiniMax', unit: 'img', t2aId: 'minimax-text-to-speech', kind: 'voice',
    prices: [{ resolution: 'clip', cost: 0.003 }] },
  { name: 'ElevenLabs Music', category: 'ElevenLabs', unit: 's', t2aId: 'elevenlabs-music', kind: 'music', provider: 'elevenlabs', engine: 'elevenlabs',
    prices: [{ resolution: 'std', cost: 0.004 }],
    durationMax: 600, durationOptions: ['15', '30', '60', '120', '180', '300'] },
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
