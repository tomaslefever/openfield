/**
 * Pruna P-2 video inputs, shared by the official Pruna API and Replicate (`prunaai/*`): both
 * expose the same schema (docs.api.pruna.ai/guides/models/p-video-2*, Oct 2026). Only how media
 * becomes a URI differs (uploaded file URL vs inline data URI), so that is injected.
 *
 * - p-video-2: P-Video successor. FF/LF, audio, 1–20 s, 720p/1080p, 24/48 fps, draft.
 * - p-video-2-pro: MiniMax H3 with first/last frame. 5–15 s, 480p/768p, quality/speed/cost.
 * - p-video-2-pro-reference: lists of up to 9 images / 3 videos / 3 audios plus optional
 *   start/end frames (which count toward the 9 images). speed/cost only.
 */

export type PVideo2Kind = 'p-video-2' | 'p-video-2-pro' | 'p-video-2-pro-reference'

export type MediaRef = { base64?: string; url?: string; mime?: string }

/** Turns a media ref into a URI the API accepts, or null when it has no usable content. */
export type MediaResolver = (ref: MediaRef, fallbackMime: string) => Promise<string | null>

const ASPECT_RATIOS = ['16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '1:1']

/** P-2 variant of a model id from either provider ('prunaai/p-video-2-pro', 'pruna/p-video-2-pro'). */
export function pVideo2Kind(modelId?: string | null): PVideo2Kind | null {
  const name = String(modelId || '').replace(/^(prunaai|pruna)\//, '')
  return name === 'p-video-2' || name === 'p-video-2-pro' || name === 'p-video-2-pro-reference' ? name : null
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)))

async function resolveAll(refs: unknown, fallbackMime: string, resolve: MediaResolver): Promise<string[]> {
  if (!Array.isArray(refs)) return []
  const out: string[] = []
  for (const r of refs) {
    const uri = r && typeof r === 'object' ? await resolve(r as MediaRef, fallbackMime) : null
    if (uri) out.push(uri)
  }
  return out
}

export async function buildPVideo2Input(kind: PVideo2Kind, payload: any, resolve: MediaResolver): Promise<Record<string, any>> {
  const input: Record<string, any> = {}
  if (payload.prompt) input.prompt = payload.prompt
  if (Number.isInteger(payload.seed)) input.seed = payload.seed

  const firstFrame = await resolve({ base64: payload.firstFrameBase64, url: payload.firstFrameUrl }, 'image/png')
  const lastFrame = await resolve({ base64: payload.lastFrameBase64, url: payload.lastFrameUrl }, 'image/png')
  const singleImage = await resolve({ base64: payload.imageBase64, url: payload.imageUrl, mime: payload.imageMime }, 'image/png')
  const aspect = payload.aspectRatio

  if (kind === 'p-video-2') {
    const imageUris = firstFrame || singleImage ? [] : await resolveAll((payload.imageRefs || []).slice(0, 1), 'image/png', resolve)
    const audioUris = await resolveAll((payload.audioRefs || []).slice(0, 1), 'audio/mpeg', resolve)
    const image = firstFrame || singleImage || imageUris[0]
    if (image) input.image = image
    if (lastFrame) input.last_frame_image = lastFrame
    if (audioUris[0]) input.audio = audioUris[0]
    // The audio sets the length; otherwise an omitted duration lets the model pick it
    else if (payload.duration) input.duration = clamp(Number(payload.duration), 1, 20)
    input.resolution = payload.resolution === '1080p' ? '1080p' : '720p'
    if (payload.fps === 24 || payload.fps === 48) input.fps = payload.fps
    if (payload.draft) input.draft = true
    if (ASPECT_RATIOS.includes(aspect)) input.aspect_ratio = aspect
    return input
  }

  input.duration = clamp(Number(payload.duration) || 5, 5, 15)
  input.resolution = payload.resolution === '480p' ? '480p' : '768p'
  if (['off', 'turbo', 'max'].includes(payload.promptUpsampler)) input.prompt_upsampler = payload.promptUpsampler

  if (kind === 'p-video-2-pro') {
    input.mode = ['quality', 'speed', 'cost'].includes(payload.pvMode) ? payload.pvMode : 'speed'
    const image = firstFrame || singleImage
    if (image) input.image = image
    if (lastFrame) input.last_frame_image = lastFrame
    if (ASPECT_RATIOS.includes(aspect)) input.aspect_ratio = aspect
    return input
  }

  // Reference variant: no quality mode; start/end frames count toward the 9-image limit
  input.mode = payload.pvMode === 'cost' ? 'cost' : 'speed'
  if (firstFrame) input.first_frame_image = firstFrame
  if (lastFrame) input.last_frame_image = lastFrame
  const frameCount = (firstFrame ? 1 : 0) + (lastFrame ? 1 : 0)
  const refImages = await resolveAll((payload.imageRefs || []).slice(0, 9 - frameCount), 'image/png', resolve)
  const images = refImages.length > 0 ? refImages : singleImage ? [singleImage] : []
  if (images.length > 0) input.image = images
  const videos = await resolveAll((payload.videoRefs || []).slice(0, 3), 'video/mp4', resolve)
  if (videos.length > 0) input.video = videos
  const audios = await resolveAll((payload.audioRefs || []).slice(0, 3), 'audio/mpeg', resolve)
  if (audios.length > 0) input.audio = audios
  if (payload.keepAudio && audios.length === 1) input.keep_audio = true
  if (aspect === 'adaptive' || ASPECT_RATIOS.includes(aspect)) input.aspect_ratio = aspect
  return input
}

/** Request checks the API would otherwise reject after queueing. Messages are user-facing. */
export function validatePVideo2Input(kind: PVideo2Kind, input: Record<string, any>, displayName: string): void {
  if (!input.prompt) throw new Error(`${displayName} requiere un prompt.`)
  if (kind === 'p-video-2-pro-reference' && !input.image && !input.video) {
    throw new Error('P-Video 2 Pro con referencias requiere al menos una imagen o video de referencia.')
  }
}

/**
 * MCP / API callers name the base Pro model; like the composer, any reference routes it to the
 * -reference variant. Returns the model id to use (same provider prefix).
 */
export function routePVideo2Model(modelId: string, payload: any): string {
  if (pVideo2Kind(modelId) !== 'p-video-2-pro') return modelId
  const hasRefs = ['imageRefs', 'videoRefs', 'audioRefs'].some(k => Array.isArray(payload?.[k]) && payload[k].length > 0)
  return hasRefs ? `${modelId}-reference` : modelId
}
