export interface FalModelCatalogEntry {
  id: string
  name: string
  category: string
  type: 'video' | 'image' | 'audio'
  /** Video models: billed per second of output */
  costPerSecond?: number
  /** Image models: billed per generated image */
  costPerImage?: number
  resolutions: string[]
  aspectRatios: string[]
  /** Video models: reference images included in the base price */
  freeReferenceImages?: number
  /** Video models: surcharge per reference image beyond the free count */
  extraReferenceImageCost?: number
  /** Image models: alternate endpoint used when an image is attached */
  i2iId?: string
  /** Image models: edit endpoint (image + instructions) */
  editId?: string
  /** Image models: input field used to pass the aspect ratio */
  aspectField?: 'image_size' | 'aspect_ratio'
  /** Image models: endpoint accepts an explicit resolution parameter */
  supportsResolution?: boolean
  /** Image models: input field used for attached reference images */
  editImageField?: 'image_url' | 'image_urls' | 'image'
}

export const FAL_MODELS: FalModelCatalogEntry[] = [
  {
    id: 'minimax/h3-max-turbo/text-to-video',
    name: 'MiniMax H3 Max Turbo',
    category: 'MiniMax',
    type: 'video',
    costPerSecond: 0.01,
    resolutions: ['768P', '480P', '1080P'],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
  },
  {
    id: 'minimax/h3-max/text-to-video',
    name: 'MiniMax H3 Max',
    category: 'MiniMax',
    type: 'video',
    costPerSecond: 0.02,
    resolutions: ['768P', '480P', '1080P'],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
  },
  {
    id: 'minimax/h3-max/reference-to-video',
    name: 'MiniMax H3 Max Reference',
    category: 'MiniMax',
    type: 'video',
    costPerSecond: 0.08,
    resolutions: ['768P', '480P'],
    aspectRatios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    freeReferenceImages: 4,
    extraReferenceImageCost: 0.02,
  },
  {
    id: 'minimax/h3/reference-to-video',
    name: 'MiniMax H3',
    category: 'MiniMax',
    type: 'video',
    costPerSecond: 0.13,
    resolutions: ['768P', '2K', '4K'],
    aspectRatios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    freeReferenceImages: 5,
    extraReferenceImageCost: 0.08,
  },
  // OpenAI
  {
    id: 'openai/gpt-image-2',
    name: 'GPT Image 2',
    category: 'OpenAI',
    type: 'image',
    costPerImage: 0.05,
    resolutions: ['1K', '2K', '4K'],
    aspectRatios: ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'],
    i2iId: 'openai/gpt-image-2/edit',
    editImageField: 'image_url',
  },
  // Google
  {
    id: 'fal-ai/nano-banana-pro',
    name: 'Nano Banana Pro',
    category: 'Google',
    type: 'image',
    costPerImage: 0.15,
    resolutions: ['1K', '2K', '4K'],
    aspectRatios: ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'],
    editId: 'fal-ai/nano-banana-pro/edit',
    aspectField: 'aspect_ratio',
    supportsResolution: true,
    editImageField: 'image_urls',
  },
  // Recraft
  {
    id: 'fal-ai/recraft/v4/text-to-image',
    name: 'Recraft V4',
    category: 'Recraft',
    type: 'image',
    costPerImage: 0.04,
    resolutions: ['1K', '2K'],
    aspectRatios: ['1:1', '16:9', '4:3', '3:4', '9:16'],
  },
  {
    id: 'fal-ai/recraft/v4/pro/text-to-image',
    name: 'Recraft V4 Pro',
    category: 'Recraft',
    type: 'image',
    costPerImage: 0.25,
    resolutions: ['1K', '2K'],
    aspectRatios: ['1:1', '16:9', '4:3', '3:4', '9:16'],
  },
  {
    id: 'fal-ai/recraft/v3/text-to-image',
    name: 'Recraft V3',
    category: 'Recraft',
    type: 'image',
    costPerImage: 0.04,
    resolutions: ['1K', '2K'],
    aspectRatios: ['1:1', '16:9', '4:3', '3:4', '9:16'],
  },
  // ImagineArt
  {
    id: 'imagineart/imagineart-2.0-preview/text-to-image',
    name: 'ImagineArt 2.0',
    category: 'ImagineArt',
    type: 'image',
    costPerImage: 0.04,
    resolutions: ['1K', '2K'],
    aspectRatios: ['1:1', '16:9', '4:3', '3:4', '9:16'],
  },
  // Black Forest Labs
  {
    id: 'fal-ai/flux-pro/kontext',
    name: 'FLUX.1 Kontext [pro]',
    category: 'Flux',
    type: 'image',
    costPerImage: 0.04,
    resolutions: ['1K', '2K'],
    aspectRatios: ['1:1', '16:9', '3:2', '4:3', '3:4', '2:3', '9:16'],
    editId: 'fal-ai/flux-pro/kontext',
    editImageField: 'image',
  },
  {
    id: 'fal-ai/flux-krea-lora/stream',
    name: 'FLUX Krea LoRA stream',
    category: 'Flux',
    type: 'image',
    costPerImage: 0.035,
    resolutions: ['1K', '2K'],
    aspectRatios: ['1:1', '16:9', '3:2', '4:3', '3:4', '2:3', '9:16'],
  },
  // Bria
  {
    id: 'bria/fibo/generate',
    name: 'Bria FIBO',
    category: 'Bria',
    type: 'image',
    costPerImage: 0.04,
    resolutions: ['1K', '2K'],
    aspectRatios: ['1:1', '16:9', '4:3', '3:4', '9:16'],
  },
  // Missing Image models
  { id: 'fal-ai/flux/dev', name: 'FLUX.1 [dev]', category: 'Flux', type: 'image', costPerImage: 0.025, resolutions: ['1K'], aspectRatios: ['1:1', '16:9', '9:16'] },
  { id: 'fal-ai/flux/schnell', name: 'FLUX.1 [schnell]', category: 'Flux', type: 'image', costPerImage: 0.003, resolutions: ['1K'], aspectRatios: ['1:1', '16:9', '9:16'] },
  { id: 'fal-ai/flux-pro', name: 'FLUX.1 [pro]', category: 'Flux', type: 'image', costPerImage: 0.040, resolutions: ['1K'], aspectRatios: ['1:1', '16:9', '9:16'] },
  { id: 'fal-ai/ideogram/v2', name: 'Ideogram v2', category: 'Ideogram', type: 'image', costPerImage: 0.080, resolutions: ['1K'], aspectRatios: ['1:1', '16:9', '9:16'] },
  { id: 'fal-ai/ideogram/v2/turbo', name: 'Ideogram v2 Turbo', category: 'Ideogram', type: 'image', costPerImage: 0.040, resolutions: ['1K'], aspectRatios: ['1:1', '16:9', '9:16'] },
  { id: 'fal-ai/kling-o1/image-to-image', name: 'Kling O1 Image', category: 'Kling', type: 'image', costPerImage: 0.040, resolutions: ['1K'], aspectRatios: ['1:1', '16:9', '9:16'] },

  // Missing Video models
  { id: 'fal-ai/google/veo-3-1', name: 'Veo 3.1', category: 'Google', type: 'video', costPerSecond: 0.15, resolutions: ['720p', '1080p'], aspectRatios: ['16:9', '9:16', '1:1'] },
  { id: 'fal-ai/kling-video/v3/text-to-video', name: 'Kling 3.0 Video', category: 'Kling', type: 'video', costPerSecond: 0.08, resolutions: ['std'], aspectRatios: ['16:9', '9:16', '1:1'] },
  { id: 'fal-ai/kling-video/v2.5/turbo', name: 'Kling 2.5 Turbo Video', category: 'Kling', type: 'video', costPerSecond: 0.05, resolutions: ['std'], aspectRatios: ['16:9', '9:16', '1:1'] },
  { id: 'fal-ai/wan/v3/text-to-video', name: 'Wan 3.0 Video', category: 'Wan', type: 'video', costPerSecond: 0.05, resolutions: ['720p'], aspectRatios: ['16:9', '9:16', '1:1'] },
  { id: 'fal-ai/wan/v2.1/text-to-video', name: 'Wan 2.1 Video', category: 'Wan', type: 'video', costPerSecond: 0.025, resolutions: ['720p'], aspectRatios: ['16:9', '9:16', '1:1'] },
  { id: 'fal-ai/bytedance/seedance-2-5', name: 'Seedance 2.5', category: 'ByteDance', type: 'video', costPerSecond: 0.18, resolutions: ['720p'], aspectRatios: ['16:9', '9:16', '1:1'] },
  { id: 'fal-ai/hunyuan-video', name: 'HunyuanVideo', category: 'Tencent', type: 'video', costPerSecond: 0.03, resolutions: ['720p'], aspectRatios: ['16:9', '9:16', '1:1'] },
  { id: 'fal-ai/ltx-video', name: 'LTX-Video 2B', category: 'Lightricks', type: 'video', costPerSecond: 0.008, resolutions: ['720p'], aspectRatios: ['16:9', '9:16', '1:1'] },
  { id: 'fal-ai/pixverse/v6', name: 'PixVerse V6', category: 'PixVerse', type: 'video', costPerSecond: 0.036, resolutions: ['720p'], aspectRatios: ['16:9', '9:16', '1:1'] },

  // Missing Audio/TTS models
  { id: 'fal-ai/dia-tts', name: 'Dia TTS', category: 'Fal', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/orpheus-tts', name: 'Orpheus TTS', category: 'Fal', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/qwen-audio-3-tts', name: 'Qwen Audio 3.0 TTS', category: 'Qwen', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/kokoro', name: 'Kokoro TTS', category: 'Kokoro', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/gemini-tts', name: 'Gemini TTS', category: 'Google', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/xai-tts', name: 'xAI TTS', category: 'xAI', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/elevenlabs/tts', name: 'ElevenLabs TTS (Fal)', category: 'ElevenLabs', type: 'audio', resolutions: [], aspectRatios: [] },

  // Missing Music models
  { id: 'fal-ai/minimax/music-3', name: 'MiniMax Music 3', category: 'MiniMax', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/minimax-music', name: 'MiniMax Music 2.0', category: 'MiniMax', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/cassette-ai', name: 'CassetteAI', category: 'CassetteAI', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/sonilo', name: 'Sonilo V1.1', category: 'Sonilo', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/stable-audio-open', name: 'Stable Audio Open', category: 'Stability', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/elevenlabs/music', name: 'ElevenLabs Music (Fal)', category: 'ElevenLabs', type: 'audio', costPerSecond: 0.004, resolutions: [], aspectRatios: [] },
]

export function getFalModel(modelId: string): FalModelCatalogEntry | undefined {
  return FAL_MODELS.find(m => m.id === modelId || m.i2iId === modelId || m.editId === modelId)
}

/**
 * Estimated cost: seconds × per-second price (video) or per-image price ×
 * count (image), plus the surcharge for reference images beyond the free count.
 */
export function estimateFalCost(modelId: string, durationSeconds: number, referenceImageCount = 0, imageCount = 1): number {
  const model = getFalModel(modelId)
  if (!model) return 0
  const extraImages = Math.max(0, referenceImageCount - (model.freeReferenceImages || 0))
  const extraCost = extraImages * (model.extraReferenceImageCost || 0)
  if (model.type === 'image') {
    return (model.costPerImage || 0) * Math.max(1, imageCount) + extraCost
  }
  return (model.costPerSecond || 0) * Math.max(0, durationSeconds) + extraCost
}
