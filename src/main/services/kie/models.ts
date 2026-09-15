export const IMAGE_MODELS = [
  { id: 'gpt-image-2-text-to-image', name: 'GPT Image 2', cost: 0.03, unit: 'img', category: 'OpenAI',
    prices: { '1K': 0.03, '2K': 0.05, '4K': 0.08 } },
  { id: 'gpt-image-2-image-to-image', name: 'GPT Image 2 I2I', cost: 0.03, unit: 'img', category: 'OpenAI',
    prices: { '1K': 0.03, '2K': 0.05, '4K': 0.08 } },
  { id: 'gpt-image-2-5-flare-text-to-image', name: 'GPT Image 2.5 Flare', cost: 0.03, unit: 'img', category: 'OpenAI',
    prices: { '1K': 0.03, '2K': 0.05, '4K': 0.08 } },
  { id: 'gpt-image-2-5-flare-image-to-image', name: 'GPT Image 2.5 Flare I2I', cost: 0.03, unit: 'img', category: 'OpenAI',
    prices: { '1K': 0.03, '2K': 0.05, '4K': 0.08 } },
  { id: 'gpt-image-2-5-sunburst-text-to-image', name: 'GPT Image 2.5 Sunburst', cost: 0.03, unit: 'img', category: 'OpenAI',
    prices: { '1K': 0.03, '2K': 0.05, '4K': 0.08 } },
  { id: 'gpt-image-2-5-sunburst-image-to-image', name: 'GPT Image 2.5 Sunburst I2I', cost: 0.03, unit: 'img', category: 'OpenAI',
    prices: { '1K': 0.03, '2K': 0.05, '4K': 0.08 } },
  { id: 'nano-banana-2', name: 'Nano Banana 2', cost: 0.04, unit: 'img', category: 'Google' },
  { id: 'seedream/5-pro-text-to-image', name: 'Seedream 5 Pro', cost: 0.06, unit: 'img', category: 'Seedream' },
  { id: 'seedream/5-pro-image-to-image', name: 'Seedream 5 Pro I2I', cost: 0.06, unit: 'img', category: 'Seedream' },
  { id: 'seedream-5-pro-text-to-image', name: 'Seedream 5 Pro', cost: 0.06, unit: 'img', category: 'Seedream' },
  { id: 'seedream-5-pro-image-to-image', name: 'Seedream 5 Pro I2I', cost: 0.06, unit: 'img', category: 'Seedream' },
  { id: 'flux2-pro-text-to-image', name: 'Flux 2 Pro', cost: 0.05, unit: 'img', category: 'Flux' },
  { id: 'grok-imagine/text-to-image', name: 'Grok Imagine', cost: 0.02, unit: 'img', category: 'Grok' },
  { id: 'imagen4-fast', name: 'Imagen 4 Fast', cost: 0.04, unit: 'img', category: 'Google' },
  { id: 'recraft/remove-background', name: 'Remove Background', cost: 0.02, unit: 'img', category: 'Recraft' },
]

export const AUDIO_MODELS = [
  { id: 'gpt-tts-1', name: 'GPT TTS', cost: 0.004, unit: 'img', category: 'OpenAI' },
  { id: 'minimax-text-to-speech', name: 'MiniMax TTS', cost: 0.003, unit: 'img', category: 'MiniMax' },
  { id: 'openaudio-text-to-music', name: 'OpenAudio Music', cost: 0.004, unit: 's', category: 'OpenAudio' },
  { id: 'mucat-text-to-music', name: 'MuCat Music', cost: 0.006, unit: 's', category: 'MuCat' },
] as const

export const VIDEO_MODELS = [
  { id: 'kling-3.0/video', name: 'Kling 3.0', cost: 18, unit: 's', category: 'Kling' },
  { id: 'kling/v25-turbo-text-to-video-pro', name: 'Kling 2.5 Turbo', cost: 10, unit: 's', category: 'Kling' },
  { id: 'grok-imagine/text-to-video', name: 'Grok Imagine', cost: 0.012, unit: 's', category: 'Grok' },
  { id: 'grok-imagine/image-to-video', name: 'Grok Imagine', cost: 0.012, unit: 's', category: 'Grok' },
  { id: 'grok-imagine/extend', name: 'Grok Imagine', cost: 0.012, unit: 's', category: 'Grok' },
  { id: 'grok-imagine/upscale', name: 'Grok Upscale', cost: 0, unit: 'video', category: 'Grok' },
  { id: 'bytedance/seedance-2', name: 'Seedance 2', cost: 0.205, unit: 's', category: 'ByteDance' },
  { id: 'bytedance/seedance-2-5', name: 'Seedance 2.5', cost: 0.315, unit: 's', category: 'ByteDance' },
  { id: 'bytedance/seedance-2-fast', name: 'Seedance 2 Fast', cost: 0.124, unit: 's', category: 'ByteDance' },
  { id: 'bytedance/seedance-2-mini', name: 'Seedance 2 Mini', cost: 0.041, unit: 's', category: 'ByteDance' },
  { id: 'wan-2-7-text-to-video', name: 'Wan 2.7', cost: 0.04, unit: 's', category: 'Wan' },
  { id: 'wan/3-0-video', name: 'Wan 3.0', cost: 0.16, unit: 's', category: 'Wan',
    prices: { '480P': 0.04, '720P': 0.08, '1080P': 0.16, '480p': 0.04, '720p': 0.08, '1080p': 0.16 }, chargesVideoInput: true },
  { id: 'wan-3-0-video', name: 'Wan 3.0', cost: 0.16, unit: 's', category: 'Wan',
    prices: { '480P': 0.04, '720P': 0.08, '1080P': 0.16, '480p': 0.04, '720p': 0.08, '1080p': 0.16 }, chargesVideoInput: true },
  { id: 'hailuo/02-text-to-video-pro', name: 'Hailuo 2 Pro', cost: 0.06, unit: 's', category: 'Hailuo' },
  { id: 'minimax-h3/text-to-video', name: 'MiniMax H3', cost: 0.04, unit: 's', category: 'MiniMax',
    prices: { '768P': 0.04, '2K': 0.065 }, imageCost: 0.02, freeImages: 5, chargesVideoInput: true },
  { id: 'minimax-h3/image-to-video', name: 'MiniMax H3', cost: 0.04, unit: 's', category: 'MiniMax',
    prices: { '768P': 0.04, '2K': 0.065 }, imageCost: 0.02, freeImages: 5, chargesVideoInput: true },
  { id: 'minimax-h3/reference-to-video', name: 'MiniMax H3', cost: 0.04, unit: 's', category: 'MiniMax',
    prices: { '768P': 0.04, '2K': 0.065 }, imageCost: 0.02, freeImages: 5, chargesVideoInput: true },
  { id: 'pixverse-v6/text-to-video', name: 'PixVerse V6', cost: 0.020, unit: 's', category: 'PixVerse' },
  { id: 'pixverse-v6/image-to-video', name: 'PixVerse V6', cost: 0.020, unit: 's', category: 'PixVerse' },
  { id: 'pixverse-v6/reference-to-video', name: 'PixVerse V6', cost: 0.0225, unit: 's', category: 'PixVerse' },
  { id: 'pixverse-v6/transition', name: 'PixVerse V6 Transition', cost: 0.020, unit: 's', category: 'PixVerse' },
  { id: 'omnihuman-1-5', name: 'OmniHuman 1.5', cost: 0.135, unit: 's', category: 'OmniHuman' },
  { id: 'google/gemini-omni-flash-1-1', name: 'Gemini Omni 1.1 Flash', cost: 0.42, unit: 'video', category: 'Google' },
  { id: 'gemini-omni-video', name: 'Gemini Omni 1.1 Flash', cost: 0.42, unit: 'video', category: 'Google' },
] as const

export interface CostEstimateOptions {
  duration?: number
  resolution?: string
  inputVideoSeconds?: number
  imageCount?: number
}

// Total Cost = Unit Price × (Generated Video Duration + Input Video Duration) + Additional Image Cost
// MiniMax H3 (KIE): 768P $0.04/s (8 credits/s), 2K $0.065/s (13 credits/s); video input at the selected resolution rate;
// first 5 images free, +$0.02 per extra image (4 credits/image); audio input free.
// Wan 3.0 (KIE): 480P $0.04/s (8 credits/s), 720P $0.08/s (16 credits/s), 1080P $0.16/s (32 credits/s);
// billing rule: (input video duration + output video duration) × unit price.
export function getEstimatedCost(modelId: string, options?: CostEstimateOptions | number): number {
  const allModels = [...IMAGE_MODELS, ...VIDEO_MODELS, ...AUDIO_MODELS] as any[]
  const model = allModels.find(m => m.id === modelId)
  if (!model) return 0
  const opts: CostEstimateOptions = typeof options === 'number' ? { duration: options } : (options || {})

  if (modelId === 'google/gemini-omni-flash-1-1' || modelId === 'gemini-omni-video') {
    const dur = opts.duration || 6
    const extraSteps = Math.max(0, (dur - 4) / 2)
    const is4k = opts.resolution?.toLowerCase() === '4k'
    const hasInputVideo = (opts.inputVideoSeconds || 0) > 0
    if (hasInputVideo) {
      return is4k ? 1.260 : 0.840
    }
    return (is4k ? 0.735 : 0.315) + extraSteps * 0.105
  }

  let rate = model.cost || 0
  if (model.prices && opts.resolution) {
    const resUpper = opts.resolution.toUpperCase()
    if (model.prices[resUpper] != null) {
      rate = model.prices[resUpper]
    } else if (model.prices[opts.resolution] != null) {
      rate = model.prices[opts.resolution]
    }
  }
  if (model.unit === 's' && opts.duration != null) {
    const inputSeconds = model.chargesVideoInput ? (opts.inputVideoSeconds || 0) : 0
    let total = rate * (opts.duration + inputSeconds)
    if (model.imageCost && opts.imageCount) {
      total += Math.max(0, opts.imageCount - (model.freeImages ?? 0)) * model.imageCost
    }
    return total
  }
  return model.cost || 0
}
