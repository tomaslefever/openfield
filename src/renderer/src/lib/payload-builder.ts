import { ModelPricing, IMAGE_MODELS, VIDEO_MODELS, AUDIO_MODELS } from './models'

export interface ImageGenerationPayload {
  model: string
  provider?: string
  prompt: string
  negative_prompt?: string
  aspect_ratio?: string
  resolution?: string
  image_url?: string
  imageBase64?: string
  imageRefs?: any[]
  [key: string]: any
}

export interface VideoGenerationPayload {
  model: string
  provider?: string
  prompt: string
  negative_prompt?: string
  aspect_ratio?: string
  duration?: number | string
  resolution?: string
  firstFrameAssetId?: string
  firstFrameBase64?: string
  firstFrameUrl?: string
  lastFrameAssetId?: string
  lastFrameBase64?: string
  imageRefs?: any[]
  videoRefs?: any[]
  [key: string]: any
}

export interface AudioGenerationPayload {
  model: string
  provider?: string
  prompt?: string
  text?: string
  voice_id?: string
  voiceId?: string
  [key: string]: any
}

/**
 * Builds a valid image generation payload for Openfield / KIE
 */
export function buildImagePayload(
  model: ModelPricing,
  prompt: string,
  options?: {
    aspectRatio?: string
    resolution?: string
    imageRefAssetId?: string
    imageBase64?: string
    imageUrl?: string
    imageRefs?: Array<{ assetId?: string; base64?: string; mime?: string; name?: string; refType?: string }>
  }
): ImageGenerationPayload {
  const hasRefs = Boolean(
    options?.imageRefAssetId ||
    options?.imageBase64 ||
    options?.imageUrl ||
    (options?.imageRefs && options.imageRefs.length > 0)
  )
  const modelId = hasRefs ? (model.i2iId || model.t2iId || model.name) : (model.t2iId || model.name)

  const ar = options?.aspectRatio && options.aspectRatio !== 'auto' ? options.aspectRatio : '1:1'
  const res = options?.resolution || '1K'

  const payload: ImageGenerationPayload = {
    model: modelId,
    provider: model.provider,
    prompt: prompt.trim(),
    aspect_ratio: ar,
    aspectRatio: ar,
    resolution: res,
  }

  if (options?.imageRefs && options.imageRefs.length > 0) {
    payload.imageRefs = options.imageRefs
  } else if (options?.imageRefAssetId) {
    payload.imageRefs = [{ assetId: options.imageRefAssetId, name: 'reference', refType: 'image' }]
  }

  if (options?.imageBase64) {
    payload.imageBase64 = options.imageBase64
  }

  if (options?.imageUrl) {
    payload.image_url = options.imageUrl
  }

  return payload
}

/**
 * Builds a valid video generation payload for Openfield / KIE (Kling, Hailuo, Grok, MiniMax, Seedance, etc.)
 */
export function buildVideoPayload(
  model: ModelPricing,
  prompt: string,
  options?: {
    aspectRatio?: string
    resolution?: string
    duration?: number
    firstFrameAssetId?: string
    firstFrameBase64?: string
    firstFrameUrl?: string
    lastFrameAssetId?: string
    lastFrameBase64?: string
    videoRefs?: Array<{ assetId?: string; base64?: string; url?: string; localPath?: string; mime?: string; name?: string; duration?: number }>
    audioAssetId?: string
    audioBase64?: string
    audioUrl?: string
    audioRefs?: Array<{ assetId?: string; base64?: string; mime?: string; name?: string }>
    sound?: boolean
  }
): VideoGenerationPayload {
  const hasVideoRefs = Boolean(options?.videoRefs && options.videoRefs.length > 0)
  const hasFirstFrame = Boolean(options?.firstFrameAssetId || options?.firstFrameBase64 || options?.firstFrameUrl)
  const modelId = (hasVideoRefs && model.refId)
    ? model.refId
    : hasFirstFrame
    ? (model.i2vId || model.t2vId || model.name)
    : (model.t2vId || model.name)

  const payload: VideoGenerationPayload = {
    model: modelId,
    provider: model.provider,
    prompt: prompt.trim(),
    aspectRatio: options?.aspectRatio || '9:16',
    aspect_ratio: options?.aspectRatio || '9:16',
  }

  if (options?.resolution) {
    payload.resolution = options.resolution
  }

  if (options?.duration) {
    payload.duration = options.duration
  }

  if (options?.firstFrameBase64 || options?.firstFrameAssetId || options?.firstFrameUrl) {
    if (options.firstFrameBase64) payload.firstFrameBase64 = options.firstFrameBase64
    if (options.firstFrameAssetId) payload.firstFrameAssetId = options.firstFrameAssetId
    if (options.firstFrameUrl) payload.firstFrameUrl = options.firstFrameUrl
    payload.imageRefs = [{
      assetId: options.firstFrameAssetId,
      base64: options.firstFrameBase64,
      url: options.firstFrameUrl,
      mime: 'image/png',
      name: 'first_frame',
      refType: 'image',
    }]
  }

  if (options?.firstFrameUrl) {
    payload.firstFrameUrl = options.firstFrameUrl
  }

  if (options?.lastFrameAssetId) {
    payload.lastFrameAssetId = options.lastFrameAssetId
  }

  if (options?.lastFrameBase64) {
    payload.lastFrameBase64 = options.lastFrameBase64
  }

  if (options?.videoRefs && options.videoRefs.length > 0) {
    payload.videoRefs = options.videoRefs
  }

  if (options?.audioRefs && options.audioRefs.length > 0) {
    payload.audioRefs = options.audioRefs
  } else if (options?.audioAssetId) {
    payload.audioRefs = [{ assetId: options.audioAssetId, name: 'dialogue_audio', mime: 'audio/mpeg' }]
  }

  if (options?.audioBase64) {
    payload.audioBase64 = options.audioBase64
  }

  if (options?.audioUrl) {
    payload.audioUrl = options.audioUrl
  }

  if (options?.sound !== undefined) {
    payload.sound = options.sound
  } else if (options?.audioAssetId || options?.audioBase64 || (options?.audioRefs && options.audioRefs.length > 0)) {
    payload.sound = true
  }

  return payload
}

/**
 * Builds a valid audio / TTS generation payload
 */
export function buildAudioPayload(
  model: ModelPricing,
  text: string,
  options?: {
    voiceId?: string
  }
): AudioGenerationPayload {
  const modelId = model.t2aId || model.modelId || 'minimax-text-to-speech'

  return {
    model: modelId,
    provider: model.provider,
    prompt: text,
    text: text,
    voice_id: options?.voiceId || 'male-qn-qingse',
    voiceId: options?.voiceId || 'male-qn-qingse',
  }
}

export function findModelById(modelId: string, kind: 'image' | 'video' | 'audio'): ModelPricing | undefined {
  if (kind === 'image') {
    return IMAGE_MODELS.find(m => m.t2iId === modelId || m.i2iId === modelId || m.name === modelId)
  }
  if (kind === 'video') {
    return VIDEO_MODELS.find(m => m.t2vId === modelId || m.i2vId === modelId || m.name === modelId)
  }
  if (kind === 'audio') {
    return AUDIO_MODELS.find(m => m.t2aId === modelId || m.modelId === modelId || m.name === modelId)
  }
  return undefined
}
