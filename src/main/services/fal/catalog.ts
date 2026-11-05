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

/** FLUX 3 Max launch promo on fal ran until 2026-11-07 (US time); list price applies from 2026-11-08 */
export const FLUX3_MAX_PROMO_ACTIVE = Date.now() < Date.UTC(2026, 10, 8, 8)
const FLUX3_MAX_COST_720P = FLUX3_MAX_PROMO_ACTIVE ? 0.0425 : 0.17

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
  // FLUX 3 Max (fal Research + Black Forest Labs): launch promo $0.0425/s 720p, $0.0725/s 1080p
  // until 2026-11-07; list price from 2026-11-08: $0.17/s 720p, $0.29/s 1080p (720p shown here)
  {
    id: 'blackforestlabs/flux-3-max/text-to-video',
    name: 'FLUX 3 Max',
    category: 'Flux',
    type: 'video',
    costPerSecond: FLUX3_MAX_COST_720P,
    resolutions: ['720p', '1080p'],
    aspectRatios: ['auto', '21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16'],
  },
  {
    id: 'blackforestlabs/flux-3-max/image-to-video',
    name: 'FLUX 3 Max I2V',
    category: 'Flux',
    type: 'video',
    costPerSecond: FLUX3_MAX_COST_720P,
    resolutions: ['720p', '1080p'],
    aspectRatios: ['auto', '21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16'],
  },
  {
    id: 'blackforestlabs/flux-3-max/keyframes-to-video',
    name: 'FLUX 3 Max Keyframes',
    category: 'Flux',
    type: 'video',
    costPerSecond: FLUX3_MAX_COST_720P,
    resolutions: ['720p', '1080p'],
    aspectRatios: ['auto', '21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16'],
  },
  // Kling 4.0 Flash (fal.ai/models/kling/v4/flash/*, Nov 2026): 720p only, 3–20 s.
  // $0.094/s; with reference videos (and video-to-video) $0.063/s billed on output + max(input, output) seconds
  {
    id: 'kling/v4/flash/text-to-video',
    name: 'Kling 4.0 Flash',
    category: 'Kling',
    type: 'video',
    costPerSecond: 0.094,
    resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1', '21:9'],
  },
  {
    id: 'kling/v4/flash/image-to-video',
    name: 'Kling 4.0 Flash I2V',
    category: 'Kling',
    type: 'video',
    costPerSecond: 0.094,
    resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1', '21:9'],
  },
  {
    id: 'kling/v4/flash/reference-to-video',
    name: 'Kling 4.0 Flash Reference',
    category: 'Kling',
    type: 'video',
    costPerSecond: 0.094,
    resolutions: ['720p'],
    aspectRatios: ['auto', '16:9', '9:16', '1:1', '21:9'],
  },
  {
    id: 'kling/v4/flash/video-to-video',
    name: 'Kling 4.0 Flash Edit',
    category: 'Kling',
    type: 'video',
    costPerSecond: 0.063,
    resolutions: ['720p'],
    aspectRatios: [],
  },
  // H3 Max Relight: re-lights a source video (≤15 s) from a lighting-sphere image; billed per
  // output second = source length. $0.05 / $0.08 / $0.16 / $0.32 per second at 480P / 768P / 1080P / 2K
  {
    id: 'minimax/h3-max/relight',
    name: 'MiniMax H3 Max Relight',
    category: 'MiniMax',
    type: 'video',
    costPerSecond: 0.08,
    resolutions: ['768P', '480P', '1080P', '2K'],
    aspectRatios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
  },
  // Sync-3 lipsync: video + audio (or a portrait + audio), $0.1333 per output second ($8/min)
  {
    id: 'fal-ai/sync-lipsync/v3',
    name: 'Sync-3 Lipsync',
    category: 'Sync',
    type: 'video',
    costPerSecond: 0.1333,
    resolutions: [],
    aspectRatios: [],
  },
  {
    id: 'fal-ai/sync-lipsync/v3/image-to-video',
    name: 'Sync-3 Lipsync (image)',
    category: 'Sync',
    type: 'video',
    costPerSecond: 0.1333,
    resolutions: [],
    aspectRatios: [],
  },
  // ByteDance video upscaler (standard tier, 30 fps): $0.0072 / $0.0144 / $0.0288 per second at
  // 1080p / 2K / 4K; 30–60 fps doubles it, the pro tier is ×10 (1080p here)
  {
    id: 'fal-ai/bytedance-upscaler/upscale/video',
    name: 'ByteDance Video Upscaler',
    category: 'ByteDance',
    type: 'video',
    costPerSecond: 0.0072,
    resolutions: ['1080p', '2k', '4k'],
    aspectRatios: [],
  },
  // Kling 4.0: $0.157/s 720p, $0.235/s 1080p (native audio included)
  {
    id: 'kling/v4/text-to-video',
    name: 'Kling 4.0',
    category: 'Kling',
    type: 'video',
    costPerSecond: 0.157,
    resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1', '21:9'],
  },
  {
    id: 'kling/v4/image-to-video',
    name: 'Kling 4.0 I2V',
    category: 'Kling',
    type: 'video',
    costPerSecond: 0.157,
    resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1', '21:9'],
  },
  {
    id: 'kling/v4/reference-to-video',
    name: 'Kling 4.0 Reference',
    category: 'Kling',
    type: 'video',
    costPerSecond: 0.157,
    resolutions: ['720p', '1080p'],
    aspectRatios: ['auto', '16:9', '9:16', '1:1', '21:9'],
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
  // GPT Image 2.6 (OpenAI, 2026-11-04): Flare is the fast default, Sunburst the precision model.
  // Token-billed like GPT Image 2 ($30/M image output tokens); fal's default quality is "high",
  // about $0.13 for 1024² (estimate). Edit takes up to 16 images.
  {
    id: 'openai/gpt-image-2.6/flare/text-to-image',
    name: 'GPT Image 2.6 Flare',
    category: 'OpenAI',
    type: 'image',
    costPerImage: 0.13,
    resolutions: ['1K', '2K', '4K'],
    aspectRatios: ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'],
    i2iId: 'openai/gpt-image-2.6/flare/edit',
    editImageField: 'image_urls',
  },
  {
    id: 'openai/gpt-image-2.6/sunburst/text-to-image',
    name: 'GPT Image 2.6 Sunburst',
    category: 'OpenAI',
    type: 'image',
    costPerImage: 0.13,
    resolutions: ['1K', '2K', '4K'],
    aspectRatios: ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'],
    i2iId: 'openai/gpt-image-2.6/sunburst/edit',
    editImageField: 'image_urls',
  },
  // Google
  {
    // fal.ai/models/google/nano-banana-2.1 — billed per token: ~$0.040 (1K) / $0.059 (2K) / $0.134 (4K)
    id: 'google/nano-banana-2.1',
    name: 'Nano Banana 2.1',
    category: 'Google',
    type: 'image',
    costPerImage: 0.04,
    resolutions: ['1K', '2K', '4K'],
    aspectRatios: ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '4:1', '1:4', '8:1', '1:8'],
    editId: 'google/nano-banana-2.1/edit',
    aspectField: 'aspect_ratio',
    supportsResolution: true,
    editImageField: 'image_urls',
  },
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
  // Ideogram 4.5 (typography): $0.03 / $0.06 / $0.22 per image at low / medium / high quality
  // (medium is the default; size does not change the price). Edit: source + up to 4 references
  {
    id: 'ideogram/v4.5',
    name: 'Ideogram 4.5',
    category: 'Ideogram',
    type: 'image',
    costPerImage: 0.06,
    resolutions: ['1K', '2K'],
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '2:1', '1:2', '3:1', '1:3'],
    editId: 'ideogram/v4.5/edit',
    editImageField: 'image_url',
  },
  // Krea 3: $0.025 per megapixel of output plus each reference image (1K ≈ $0.025, 2K ≈ $0.10)
  {
    id: 'krea/v3/text-to-image',
    name: 'Krea 3',
    category: 'Krea',
    type: 'image',
    costPerImage: 0.025,
    resolutions: ['1K', '2K'],
    aspectRatios: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'],
    editId: 'krea/v3/edit',
    editImageField: 'image_urls',
  },
  // Black Forest Labs
  // FLUX 3: $0.048 for a 1 MP (1K) image; fal says the price grows with resolution (1K here).
  // Edit takes 1–10 reference images
  {
    id: 'blackforestlabs/flux-3/text-to-image',
    name: 'FLUX 3',
    category: 'Flux',
    type: 'image',
    costPerImage: 0.048,
    resolutions: ['1K', '2K', '4K'],
    aspectRatios: ['auto', '21:9', '2:1', '16:9', '3:2', '7:5', '4:3', '5:4', '1:1', '4:5', '3:4', '5:7', '2:3', '9:16', '1:2'],
    editId: 'blackforestlabs/flux-3/edit-image',
    aspectField: 'aspect_ratio',
    supportsResolution: true,
    editImageField: 'image_urls',
  },
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
  // Wan 3.0: $0.05 / $0.10 / $0.20 per second at 480p / 720p / 1080p (720p here)
  { id: 'alibaba/wan-3.0/text-to-video', name: 'Wan 3.0 Video', category: 'Wan', type: 'video', costPerSecond: 0.10, resolutions: ['480p', '720p', '1080p'], aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'] },
  { id: 'alibaba/wan-3.0/image-to-video', name: 'Wan 3.0 I2V', category: 'Wan', type: 'video', costPerSecond: 0.10, resolutions: ['480p', '720p', '1080p'], aspectRatios: ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4'] },
  { id: 'fal-ai/wan/v2.1/text-to-video', name: 'Wan 2.1 Video', category: 'Wan', type: 'video', costPerSecond: 0.025, resolutions: ['720p'], aspectRatios: ['16:9', '9:16', '1:1'] },
  // US-hosted endpoints (the old fal-ai/bytedance/seedance-2-5 id answers 404). Token-metered by fal; ~$0.2205 / $0.473 / $1.164 per output second at 480p / 720p / 1080p (720p here).
  // With video inputs: × 0.6, billed on input + output seconds (see lib/models in the renderer)
  { id: 'bytedance/seedance-2.5/us/text-to-video', name: 'Seedance 2.5', category: 'ByteDance', type: 'video', costPerSecond: 0.473, resolutions: ['480p', '720p', '1080p'], aspectRatios: ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] },
  { id: 'bytedance/seedance-2.5/us/image-to-video', name: 'Seedance 2.5 I2V', category: 'ByteDance', type: 'video', costPerSecond: 0.473, resolutions: ['480p', '720p', '1080p'], aspectRatios: ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] },
  { id: 'bytedance/seedance-2.5/us/reference-to-video', name: 'Seedance 2.5 Reference', category: 'ByteDance', type: 'video', costPerSecond: 0.473, resolutions: ['480p', '720p', '1080p'], aspectRatios: ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] },
  { id: 'fal-ai/hunyuan-video', name: 'HunyuanVideo', category: 'Tencent', type: 'video', costPerSecond: 0.03, resolutions: ['720p'], aspectRatios: ['16:9', '9:16', '1:1'] },
  { id: 'fal-ai/ltx-video', name: 'LTX-Video 2B', category: 'Lightricks', type: 'video', costPerSecond: 0.008, resolutions: ['720p'], aspectRatios: ['16:9', '9:16', '1:1'] },
  { id: 'fal-ai/pixverse/v6', name: 'PixVerse V6', category: 'PixVerse', type: 'video', costPerSecond: 0.036, resolutions: ['720p'], aspectRatios: ['16:9', '9:16', '1:1'] },

  // Missing Audio/TTS models
  { id: 'fal-ai/dia-tts', name: 'Dia TTS', category: 'Fal', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/orpheus-tts', name: 'Orpheus TTS', category: 'Fal', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/qwen-audio-3-tts', name: 'Qwen Audio 3.0 TTS', category: 'Qwen', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/kokoro', name: 'Kokoro TTS', category: 'Kokoro', type: 'audio', resolutions: [], aspectRatios: [] },
  // Gemini 2.5 Flash/Pro TTS (still live); Gemini 3.1 Flash TTS is its own endpoint ($0.05 per 1,000 characters)
  { id: 'fal-ai/gemini-tts', name: 'Gemini TTS', category: 'Google', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/gemini-3.1-flash-tts', name: 'Gemini 3.1 Flash TTS', category: 'Google', type: 'audio', resolutions: [], aspectRatios: [] },
  // Grok TTS v1, $0.015 per 1,000 characters (the old fal-ai/xai-tts id answers 404)
  { id: 'xai/tts/v1', name: 'xAI TTS', category: 'xAI', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/elevenlabs/tts', name: 'ElevenLabs TTS (Fal)', category: 'ElevenLabs', type: 'audio', resolutions: [], aspectRatios: [] },

  // Missing Music models
  { id: 'fal-ai/minimax/music-3', name: 'MiniMax Music 3', category: 'MiniMax', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/minimax-music', name: 'MiniMax Music 2.0', category: 'MiniMax', type: 'audio', resolutions: [], aspectRatios: [] },
  // The old fal-ai/cassette-ai and fal-ai/sonilo ids answer 404 (see FAL_LEGACY_IDS).
  // CassetteAI: $0.02 per output minute, 10–180 s. Sonilo: $0.0025 per second per sample, up to 600 s
  { id: 'cassetteai/music-generator', name: 'CassetteAI', category: 'CassetteAI', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'sonilo/v1.1/text-to-music', name: 'Sonilo V1.1', category: 'Sonilo', type: 'audio', resolutions: [], aspectRatios: [] },
  // Lyria 3.5 (Google DeepMind): full songs up to a few minutes, length set in the prompt; $0.10 per generation
  { id: 'google/lyria-3.5', name: 'Lyria 3.5', category: 'Google', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/stable-audio-open', name: 'Stable Audio Open', category: 'Stability', type: 'audio', resolutions: [], aspectRatios: [] },
  { id: 'fal-ai/elevenlabs/music', name: 'ElevenLabs Music (Fal)', category: 'ElevenLabs', type: 'audio', costPerSecond: 0.004, resolutions: [], aspectRatios: [] },
]

/**
 * Ids fal retired (they answer 404), mapped to the endpoint that replaced them. Old renderer
 * entries and stored tasks keep working: they are submitted under the new id.
 */
export const FAL_LEGACY_IDS: Record<string, string> = {
  'fal-ai/xai-tts': 'xai/tts/v1',
  'fal-ai/sonilo': 'sonilo/v1.1/text-to-music',
  'fal-ai/cassette-ai': 'cassetteai/music-generator',
}

/** The endpoint to call for a model id (legacy ids resolve to their replacement) */
export function resolveFalModelId(modelId: string): string {
  return FAL_LEGACY_IDS[modelId] || modelId
}

export function getFalModel(modelId: string): FalModelCatalogEntry | undefined {
  const id = resolveFalModelId(modelId)
  return FAL_MODELS.find(m => m.id === id || m.i2iId === id || m.editId === id)
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
