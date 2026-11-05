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
  // GPT Image 2.6 Flare / Sunburst bill by tokens on KIE (image output $27 per 1M tokens, image
  // input $7.20, text input $4.50); per-image prices are estimates carried over from GPT Image 2.5.
  // Economy is a flat 5 credits ($0.025) per 1K image, 1K only.
  { id: 'gpt-image-2-6/flare-text-to-image', name: 'GPT Image 2.6 Flare', cost: 0.03, unit: 'img', category: 'OpenAI',
    prices: { '1K': 0.03, '2K': 0.05, '4K': 0.08 } },
  { id: 'gpt-image-2-6/flare-image-to-image', name: 'GPT Image 2.6 Flare I2I', cost: 0.03, unit: 'img', category: 'OpenAI',
    prices: { '1K': 0.03, '2K': 0.05, '4K': 0.08 } },
  { id: 'gpt-image-2-6/sunburst-text-to-image', name: 'GPT Image 2.6 Sunburst', cost: 0.03, unit: 'img', category: 'OpenAI',
    prices: { '1K': 0.03, '2K': 0.05, '4K': 0.08 } },
  { id: 'gpt-image-2-6/sunburst-image-to-image', name: 'GPT Image 2.6 Sunburst I2I', cost: 0.03, unit: 'img', category: 'OpenAI',
    prices: { '1K': 0.03, '2K': 0.05, '4K': 0.08 } },
  { id: 'gpt-image-2-6/economy-text-to-image', name: 'GPT Image 2.6 Economy', cost: 0.025, unit: 'img', category: 'OpenAI' },
  { id: 'gpt-image-2-6/economy-image-to-image', name: 'GPT Image 2.6 Economy I2I', cost: 0.025, unit: 'img', category: 'OpenAI' },
  // FLUX 3 Klein: 1.6 / 2.5 / 6.5 credits per 1K / 2K / 4K image; edit takes up to 10 refs at no extra cost
  { id: 'flux-3/klein-text-to-image', name: 'FLUX 3 Klein', cost: 0.008, unit: 'img', category: 'Flux',
    prices: { '1K': 0.008, '2K': 0.0125, '4K': 0.0325 } },
  { id: 'flux-3/klein-edit-image', name: 'FLUX 3 Klein Edit', cost: 0.008, unit: 'img', category: 'Flux',
    prices: { '1K': 0.008, '2K': 0.0125, '4K': 0.0325 } },
  { id: 'nano-banana-2', name: 'Nano Banana 2', cost: 0.04, unit: 'img', category: 'Google' },
  { id: 'nano-banana-2-1', name: 'Nano Banana 2.1', cost: 0.02, unit: 'img', category: 'Google',
    prices: { '1K': 0.02, '2K': 0.03, '4K': 0.045 } },
  { id: 'seedream/5-pro-text-to-image', name: 'Seedream 5 Pro', cost: 0.06, unit: 'img', category: 'Seedream' },
  { id: 'seedream/5-pro-image-to-image', name: 'Seedream 5 Pro I2I', cost: 0.06, unit: 'img', category: 'Seedream' },
  { id: 'seedream-5-pro-text-to-image', name: 'Seedream 5 Pro', cost: 0.06, unit: 'img', category: 'Seedream' },
  { id: 'seedream-5-pro-image-to-image', name: 'Seedream 5 Pro I2I', cost: 0.06, unit: 'img', category: 'Seedream' },
  { id: 'imagen4-fast', name: 'Imagen 4 Fast', cost: 0.04, unit: 'img', category: 'Google' },
  { id: 'google/imagen4-fast', name: 'Imagen 4 Fast', cost: 0.04, unit: 'img', category: 'Google' },
  { id: 'recraft/remove-background', name: 'Remove Background', cost: 0.02, unit: 'img', category: 'Recraft' },
  { id: 'qwen-image-3', name: 'Qwen Image 3', cost: 0.03, unit: 'img', category: 'Qwen',
    prices: { '1K': 0.03, '2K': 0.05 } },
  { id: 'qwen3/text-to-image', name: 'Qwen Image 3', cost: 0.03, unit: 'img', category: 'Qwen',
    prices: { '1K': 0.03, '2K': 0.05 } },
  { id: 'qwen3/image-to-image', name: 'Qwen Image 3 I2I', cost: 0.03, unit: 'img', category: 'Qwen',
    prices: { '1K': 0.03, '2K': 0.05 } },
]

export const AUDIO_MODELS = [
  // TTS: KIE docs don't publish per-request prices; costs are estimates per clip
  { id: 'elevenlabs/text-to-speech-multilingual-v2', name: 'ElevenLabs Multilingual v2 (KIE)', cost: 0.020, unit: 'img', category: 'ElevenLabs' },
  { id: 'elevenlabs/text-to-speech-turbo-2-5', name: 'ElevenLabs Turbo 2.5 (KIE)', cost: 0.015, unit: 'img', category: 'ElevenLabs' },
  { id: 'google/gemini-3-1-flash-tts', name: 'Gemini 3.1 Flash TTS (KIE)', cost: 0.015, unit: 'img', category: 'Google' },
  { id: 'google/gemini-3-8-flash-tts', name: 'Gemini 3.8 Flash TTS (KIE)', cost: 0.015, unit: 'img', category: 'Google' },
  // Suno via ai-music-api/generate (see kie/music.ts); ~$0.06 per generation is an estimate
  { id: 'suno/V6', name: 'Suno V6', cost: 0.060, unit: 'img', category: 'Suno' },
  { id: 'suno/V6_MINI', name: 'Suno V6 Mini', cost: 0.060, unit: 'img', category: 'Suno' },
  { id: 'suno/V6_WILD', name: 'Suno V6 Wild', cost: 0.060, unit: 'img', category: 'Suno' },
] as const

export const VIDEO_MODELS = [
  // Kling 4.0: $0.1425/s 720p, $0.2125/s 1080p; with a reference video $0.085/$0.1275 per
  // second of max(output × 2, input + output) (see calcVideoCost in the renderer)
  { id: 'kling-4.0/reference-to-video', name: 'Kling 4.0', cost: 0.1425, unit: 's', category: 'Kling',
    prices: { '720P': 0.1425, '1080P': 0.2125, '720p': 0.1425, '1080p': 0.2125 } },
  { id: 'kling-4.0/keyframe-to-video', name: 'Kling 4.0', cost: 0.1425, unit: 's', category: 'Kling',
    prices: { '720P': 0.1425, '1080P': 0.2125, '720p': 0.1425, '1080p': 0.2125 } },
  // Kling 4.0 Flash: 720p only, $0.085/s (17 credits); with a reference video $0.0565/s
  // (11.3 credits) of max(output × 2, input + output) seconds, like Kling 4.0
  { id: 'kling-4.0/flash-reference-to-video', name: 'Kling 4.0 Flash', cost: 0.085, unit: 's', category: 'Kling',
    prices: { '720P': 0.085, '720p': 0.085 } },
  { id: 'kling-4.0/flash-keyframe-to-video', name: 'Kling 4.0 Flash', cost: 0.085, unit: 's', category: 'Kling',
    prices: { '720P': 0.085, '720p': 0.085 } },
  { id: 'kling-3.0/video', name: 'Kling 3.0', cost: 18, unit: 's', category: 'Kling' },
  { id: 'kling/v25-turbo-text-to-video-pro', name: 'Kling 2.5 Turbo', cost: 10, unit: 's', category: 'Kling' },
  { id: 'grok-imagine/text-to-video', name: 'Grok Imagine', cost: 0.012, unit: 's', category: 'Grok' },
  { id: 'grok-imagine/image-to-video', name: 'Grok Imagine', cost: 0.012, unit: 's', category: 'Grok' },
  { id: 'grok-imagine/extend', name: 'Grok Imagine', cost: 0.012, unit: 's', category: 'Grok' },
  { id: 'grok-imagine/upscale', name: 'Grok Upscale', cost: 0, unit: 'video', category: 'Grok' },
  // Grok Imagine Video 1.5 Preview: 2.4 / 4.5 credits/s at 480p / 720p. KIE lists a third rate,
  // 8 credits/s, also labelled "720p"; taken here as the 1080p rate.
  { id: 'grok-imagine-video-1-5-preview', name: 'Grok Imagine Video 1.5', cost: 0.012, unit: 's', category: 'Grok',
    prices: { '480p': 0.012, '720p': 0.0225, '1080p': 0.04, '480P': 0.012, '720P': 0.0225, '1080P': 0.04 } },
  { id: 'bytedance/seedance-2', name: 'Seedance 2', cost: 0.205, unit: 's', category: 'ByteDance' },
  // Seedance 2.5: 28 / 63 / 158 credits/s at 480p / 720p / 1080p (17 / 38 / 95 with a reference
  // video, over input + output seconds). A draft (draft: true) is a 480p run.
  { id: 'bytedance/seedance-2-5', name: 'Seedance 2.5', cost: 0.315, unit: 's', category: 'ByteDance',
    prices: { '480p': 0.14, '720p': 0.315, '1080p': 0.79, '480P': 0.14, '720P': 0.315, '1080P': 0.79 } },
  // Draft → 1080p final: the 1080p Seedance 2.5 rate over the draft's duration (with-video drafts
  // keep the with-video rate, $0.475/s, over input + output)
  { id: 'bytedance/seedance-2-5-draft', name: 'Seedance 2.5 Final', cost: 0.79, unit: 's', category: 'ByteDance' },
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
  // OmniHuman 2.0: 14 credits/s, 720p, billed on the output length (= the driving audio, 4–300 s)
  { id: 'omnihuman-2-0', name: 'OmniHuman 2.0', cost: 0.07, unit: 's', category: 'OmniHuman' },
  { id: 'google/gemini-omni-flash-1-1', name: 'Gemini Omni 1.1 Flash', cost: 0.42, unit: 'video', category: 'Google' },
  // Gemini Omni Video: same per-video table as 1.1 Flash (720p/1080p 63–126 credits by duration,
  // 4K 147–210; with a video input 168 / 252), see getEstimatedCost
  { id: 'gemini-omni-video', name: 'Gemini Omni Video', cost: 0.42, unit: 'video', category: 'Google' },
  // Vidu Q4 Preview: 7.2 / 15.2 / 19.2 / 30.4 / 62.4 credits/s at 540p / 720p / 1080p / 2K / 4K
  { id: 'vidu-q4/image-to-video', name: 'Vidu Q4', cost: 0.076, unit: 's', category: 'Vidu',
    prices: { '540p': 0.036, '720p': 0.076, '1080p': 0.096, '2k': 0.152, '4k': 0.312, '540P': 0.036, '720P': 0.076, '1080P': 0.096, '2K': 0.152, '4K': 0.312 } },
  { id: 'vidu-q4/reference-to-video', name: 'Vidu Q4', cost: 0.076, unit: 's', category: 'Vidu',
    prices: { '540p': 0.036, '720p': 0.076, '1080p': 0.096, '2k': 0.152, '4k': 0.312, '540P': 0.036, '720P': 0.076, '1080P': 0.096, '2K': 0.152, '4K': 0.312 } },
  { id: 'runway-gen-4-5', name: 'Runway Gen-4.5', cost: 0.10, unit: 's', category: 'Runway',
    prices: { '720p': 0.10, '1080p': 0.15, '720P': 0.10, '1080P': 0.15 } },
  { id: 'veo-3-1', name: 'Veo 3.1', cost: 0.15, unit: 's', category: 'Google',
    prices: { '720p': 0.15, '1080p': 0.20, '720P': 0.15, '1080P': 0.20 } },
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
