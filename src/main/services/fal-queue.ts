import { EventEmitter } from 'events'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import { getRawDb } from '../db'
import { getActiveWorkspaceId, workspaceAssetSubDir, getTaskWorkspace } from './workspace-service'
import { ensurePlayableVideo } from './asset-manager'
import { attachTaskNotifications } from './task-notifications'
import { redactPayload } from './payload-redact'
import { persistMediaToAssets, hydratePayloadMedia } from './media-persist'
import { FalApiClient, getFalModel, resolveFalModelId, type FalImageResult, type FalVideoResult, type FalAudioResult, type FalResult, type FalRequestUrls } from './fal'
import { registerRecoverableProvider, readApiKey, canAutoResume, type RecoverableQueue, type RemoteTaskStatus } from './task-recovery'

/** Polling URLs fal returned on submit (older tasks have none: the client derives them from the model id) */
function falUrls(payload: any): FalRequestUrls {
  return { statusUrl: payload?.falStatusUrl, responseUrl: payload?.falResponseUrl, cancelUrl: payload?.falCancelUrl }
}

const POLL_INTERVAL_MS = 2000
const MAX_RETRIES = 3

function logRun(raw: any, taskId: string, step: string, message: string, payload?: any, level = 'info', workspaceId?: string) {
  try {
    const ws = workspaceId || getTaskWorkspace(taskId)
    raw.prepare('INSERT INTO run_logs (id, task_id, step, level, message, payload, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), taskId, step, level, message, payload ? JSON.stringify(redactPayload(payload)) : null, ws, Date.now())
  } catch {}
}

export class FalQueue extends EventEmitter implements RecoverableQueue {
  private apiClient: FalApiClient
  readonly processing = new Set<string>()
  private coolingDown = new Set<string>()
  private maxConcurrent = 2

  constructor(apiKey: string) {
    super()
    this.apiClient = new FalApiClient(apiKey)
    attachTaskNotifications(this, 'fal.ai')
  }

  setApiKey(apiKey: string) {
    this.apiClient = new FalApiClient(apiKey)
  }

  async enqueue(type: string, payload: any): Promise<string> {
    const taskId = crypto.randomUUID()
    const raw = getRawDb()
    const now = Date.now()
    const wsId = getActiveWorkspaceId()

    // Media is persisted as binary assets on disk; the DB only stores asset IDs.
    const storedPayload = redactPayload(await persistMediaToAssets(payload))

    logRun(raw, taskId, 'enqueue', `fal.ai task enqueued: model=${payload?.model}, hasImage=${!!payload?.imageBase64}`, undefined, 'info', wsId)

    raw.prepare(
      'INSERT INTO tasks (task_id, provider, status, type, payload, workspace_id, created_at, updated_at) VALUES (?, \'fal\', ?, ?, ?, ?, ?, ?)'
    ).run(taskId, 'pending', type, JSON.stringify(storedPayload), wsId, now, now)

    // Optimistic placeholder asset
    const assetId = crypto.randomUUID()
    raw.prepare(
      `INSERT INTO assets (id, type, file_path, local_path, file_name, mime_type, model_used, provider, prompt, parameters, credits_used, task_id, workspace_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      assetId, type, '', '', `pending-${taskId}`, type === 'image' ? 'image/png' : type === 'audio' ? 'audio/mpeg' : 'video/mp4',
      payload?.model || '', 'fal', payload?.prompt || '', JSON.stringify(storedPayload),
      0, taskId, wsId, now, now
    )
    raw.save()

    this.emit('task:enqueued', { taskId, type, assetId })
    this.processQueue()
    return taskId
  }

  async processQueue() {
    if (this.processing.size >= this.maxConcurrent) return
    const raw = getRawDb()
    const pending = raw.prepare('SELECT * FROM tasks WHERE provider = \'fal\' AND status = ? ORDER BY created_at ASC').all('pending')
    for (const task of pending) {
      const taskId = task.taskId || task.task_id
      if (this.processing.size >= this.maxConcurrent) break
      if (this.coolingDown.has(taskId)) continue
      if (!this.processing.has(taskId)) this.processTask(task)
    }
  }

  /**
   * The endpoint a payload runs on: retired ids resolve to their replacement, and Sync-3 with a
   * portrait instead of a video runs its image-to-video variant.
   */
  private routeEndpoint(payload: any): string {
    const id = resolveFalModelId(String(payload.model || ''))
    if (id === 'fal-ai/sync-lipsync/v3') {
      const { images, videos, firstFrame } = this.collectMedia(payload)
      if (!videos.length && (firstFrame || images.length)) return 'fal-ai/sync-lipsync/v3/image-to-video'
    }
    return id
  }

  private buildInput(payload: any): Record<string, any> {
    const id = String(payload.model || '')
    const model = getFalModel(id)
    if (model?.type === 'image') {
      if (id.startsWith('openai/gpt-image-2.6/')) return this.buildGptImage26Input(payload)
      if (id.startsWith('blackforestlabs/flux-3/')) return this.buildFlux3ImageInput(payload)
      if (id.startsWith('ideogram/v4.5')) return this.buildIdeogram45Input(payload)
      if (id.startsWith('krea/v3/')) return this.buildKrea3Input(payload)
      return this.buildImageInput(payload, model)
    }
    if (model?.type === 'audio') return this.buildAudioInput(payload)
    return this.buildVideoInput(payload)
  }

  private buildAudioInput(payload: any): Record<string, any> {
    const text = payload.prompt || payload.text || ''
    const seconds = (min: number, max: number, fallback: number) =>
      Math.min(max, Math.max(min, Math.round(Number(payload.duration) || fallback)))
    switch (payload.model) {
      case 'xai/tts/v1': {
        // Grok TTS: lowercase voice names and BCP-47 languages; anything else falls back to defaults
        const input: Record<string, any> = { text }
        const voice = String(payload.voice || '').toLowerCase()
        if (XAI_TTS_VOICES.includes(voice)) input.voice = voice
        if (XAI_TTS_LANGUAGES.includes(payload.voiceLanguage)) input.language = payload.voiceLanguage
        return input
      }
      case 'fal-ai/gemini-3.1-flash-tts': {
        const input: Record<string, any> = { prompt: text }
        const voice = GEMINI_TTS_VOICES.find(v => v.toLowerCase() === String(payload.voice || '').toLowerCase())
        if (voice) input.voice = voice
        return input
      }
      // Sonilo bills per second per sample (default 90 s upstream): ask for 30 s unless told otherwise
      case 'sonilo/v1.1/text-to-music':
        return { prompt: text, duration: seconds(1, 600, 30) }
      // CassetteAI requires a duration (10–180 s)
      case 'cassetteai/music-generator':
        return { prompt: text, duration: seconds(10, 180, 30) }
      case 'google/lyria-3.5': {
        // Length and structure go in the prompt; an optional image sets the mood
        const input: Record<string, any> = { prompt: text }
        const { images } = this.collectMedia(payload)
        if (images[0]) input.image_url = images[0]
        return input
      }
    }
    const input: Record<string, any> = {
      prompt: text,
      input: text,
      text: text,
    }
    if (payload.voice) input.voice = payload.voice
    if (payload.voiceLanguage) input.language = payload.voiceLanguage
    if (payload.duration) input.duration = Number(payload.duration)
    return input
  }

  /**
   * FLUX 3 Max: text-to-video, image-to-video (start frame, optional end frame) and
   * keyframes-to-video (up to 10 images spread evenly over the clip, 24 fps).
   */
  private buildFlux3MaxInput(payload: any): Record<string, any> {
    const toImageUrl = (v: string | undefined, mime = 'image/png') =>
      !v ? undefined : (/^(https?:|data:)/.test(v) ? v : `data:${mime};base64,${v}`)
    const duration = Math.min(20, Math.max(5, Math.round(Number(payload.duration) || 5)))
    const resolution = String(payload.resolution || '720p').toLowerCase() === '1080p' ? '1080p' : '720p'
    const aspectRatio = payload.aspectRatio && payload.aspectRatio !== 'adaptive' ? payload.aspectRatio : 'auto'

    const input: Record<string, any> = {
      prompt: payload.prompt || '',
      // fal validates duration as an integer literal: the string "5" answers 422
      duration,
      resolution,
      aspect_ratio: aspectRatio,
      generate_audio: payload.sound !== false && payload.sound !== 'off',
    }

    const images = [
      ...(payload.imageRefs || []).filter((r: any) => r?.base64 || /^https?:/.test(r?.url || ''))
        .map((r: any) => toImageUrl(r.base64 || r.url, r.mime || 'image/png')),
      ...(payload.imageRefs?.length ? [] : [toImageUrl(payload.imageBase64, payload.imageMime || 'image/png')]),
    ].filter(Boolean) as string[]
    const firstFrame = toImageUrl(payload.firstFrameBase64) || toImageUrl(/^https?:/.test(payload.firstFrameUrl || '') ? payload.firstFrameUrl : undefined)
    const lastFrame = toImageUrl(payload.lastFrameBase64) || toImageUrl(/^https?:/.test(payload.lastFrameUrl || '') ? payload.lastFrameUrl : undefined)

    if (payload.model.endsWith('/keyframes-to-video')) {
      const frames = images.slice(0, 10)
      const lastIndex = duration * 24 - 1
      input.keyframes = frames.map((image_url, i) => ({
        image_url,
        frame_index: frames.length === 1 ? 0 : Math.round((i * lastIndex) / (frames.length - 1)),
      }))
    } else if (payload.model.endsWith('/image-to-video')) {
      input.image_url = firstFrame || images[0]
      if (lastFrame) input.end_image_url = lastFrame
    }
    return input
  }

  /**
   * Kling 4.0: text-to-video; image-to-video (start frame, up to 8 middle keyframes, end frame);
   * reference-to-video (up to 10 images and 5 videos, cited in the prompt as @Image1 / @Video1).
   */
  private buildKlingV4Input(payload: any): Record<string, any> {
    const toUrl = (v: string | undefined, mime = 'image/png') =>
      !v ? undefined : (/^(https?:|data:)/.test(v) ? v : `data:${mime};base64,${v}`)
    const input: Record<string, any> = {
      prompt: payload.prompt || '',
      duration: Math.min(30, Math.max(3, Math.round(Number(payload.duration) || 5))),
      resolution: String(payload.resolution || '').toLowerCase() === '720p' ? '720p' : '1080p',
    }
    const images = [
      ...(payload.imageRefs?.length ? [] : [toUrl(payload.imageBase64, payload.imageMime || 'image/png')]),
      ...(payload.imageRefs || []).filter((r: any) => r?.base64 || /^https?:/.test(r?.url || ''))
        .map((r: any) => toUrl(r.base64 || r.url, r.mime || 'image/png')),
    ].filter(Boolean) as string[]
    const firstFrame = toUrl(payload.firstFrameBase64) || toUrl(/^https?:/.test(payload.firstFrameUrl || '') ? payload.firstFrameUrl : undefined)
    const lastFrame = toUrl(payload.lastFrameBase64) || toUrl(/^https?:/.test(payload.lastFrameUrl || '') ? payload.lastFrameUrl : undefined)

    if (payload.model === 'kling/v4/image-to-video') {
      // Remaining images, in order, are keyframes between the start and end frames
      const frames = firstFrame ? images : images.slice(1)
      input.start_image_url = firstFrame || images[0]
      if (frames.length) input.middle_image_urls = frames.slice(0, 8)
      if (lastFrame) input.end_image_url = lastFrame
      return input
    }
    const aspectRatio = payload.aspectRatio && payload.aspectRatio !== 'adaptive' ? payload.aspectRatio : undefined
    if (payload.model === 'kling/v4/reference-to-video') {
      if (images.length) input.image_urls = images.slice(0, 10)
      const videos = (payload.videoRefs || []).filter((r: any) => r?.base64 || /^https?:/.test(r?.url || ''))
        .map((r: any) => toUrl(r.base64 || r.url, r.mime || 'video/mp4'))
      if (videos.length) input.video_urls = videos.slice(0, 5)
      input.aspect_ratio = aspectRatio || 'auto'
      return input
    }
    input.aspect_ratio = aspectRatio && aspectRatio !== 'auto' ? aspectRatio : '16:9'
    return input
  }

  /** Media of a payload as URLs or data URIs, shared by the per-model builders below */
  private collectMedia(payload: any) {
    const toUrl = (v: string | undefined, mime: string) =>
      !v ? undefined : (/^(https?:|data:)/.test(v) ? v : `data:${mime};base64,${v}`)
    const fromRefs = (list: any[] | undefined, mime: string) => (list || [])
      .filter((r: any) => r?.base64 || /^https?:/.test(r?.url || ''))
      .map((r: any) => toUrl(r.base64 || r.url, r.mime || mime)).filter(Boolean) as string[]
    const images = [
      ...(payload.imageRefs?.length ? [] : [toUrl(payload.imageBase64, payload.imageMime || 'image/png')]),
      ...fromRefs(payload.imageRefs, 'image/png'),
    ].filter(Boolean) as string[]
    return {
      images,
      videos: fromRefs(payload.videoRefs, 'video/mp4'),
      audios: fromRefs(payload.audioRefs, 'audio/mpeg'),
      firstFrame: toUrl(payload.firstFrameBase64, 'image/png') || toUrl(/^https?:/.test(payload.firstFrameUrl || '') ? payload.firstFrameUrl : undefined, 'image/png'),
      lastFrame: toUrl(payload.lastFrameBase64, 'image/png') || toUrl(/^https?:/.test(payload.lastFrameUrl || '') ? payload.lastFrameUrl : undefined, 'image/png'),
    }
  }

  /**
   * Seedance 2.5 on fal (US-hosted): text-to-video; image-to-video (start + optional end frame);
   * reference-to-video (images, videos and audio cited as @Image1 / @Video1 / @Audio1).
   * Duration is a string enum ("4"–"30"); audio costs the same as silent video.
   */
  private buildSeedance25Input(payload: any): Record<string, any> {
    const { images, videos, audios, firstFrame, lastFrame } = this.collectMedia(payload)
    const res = String(payload.resolution || '720p').toLowerCase()
    const input: Record<string, any> = {
      prompt: payload.prompt || '',
      duration: String(Math.min(30, Math.max(4, Math.round(Number(payload.duration) || 5)))),
      resolution: ['480p', '720p', '1080p'].includes(res) ? res : '720p',
      generate_audio: payload.sound !== false && payload.sound !== 'off',
    }
    const aspectRatio = payload.aspectRatio && payload.aspectRatio !== 'adaptive' ? payload.aspectRatio : 'auto'
    if (payload.model.endsWith('/image-to-video')) {
      input.image_url = firstFrame || images[0]
      if (lastFrame) input.end_image_url = lastFrame
      input.aspect_ratio = 'auto'
    } else if (payload.model.endsWith('/reference-to-video')) {
      // A first frame picked as such still travels as the first reference image
      const refImages = [...(firstFrame ? [firstFrame] : []), ...images]
      if (refImages.length) input.image_urls = refImages.slice(0, 30)
      if (videos.length) input.video_urls = videos.slice(0, 10)
      if (audios.length) input.audio_urls = audios.slice(0, 10)
      input.aspect_ratio = aspectRatio
    } else {
      input.aspect_ratio = aspectRatio
    }
    return input
  }

  /** Wan 3.0 on fal: text-to-video, or image-to-video from a start frame (optional end frame). */
  private buildWan3Input(payload: any): Record<string, any> {
    const { images, firstFrame, lastFrame } = this.collectMedia(payload)
    const res = String(payload.resolution || '720p').toLowerCase()
    const input: Record<string, any> = {
      prompt: payload.prompt || '',
      // fal validates duration as an integer (2–30)
      duration: Math.min(30, Math.max(2, Math.round(Number(payload.duration) || 5))),
      resolution: ['480p', '720p', '1080p'].includes(res) ? res : '720p',
      audio: payload.sound !== false && payload.sound !== 'off',
    }
    const aspectRatio = payload.aspectRatio && payload.aspectRatio !== 'auto' ? payload.aspectRatio : 'adaptive'
    if (payload.model.endsWith('/image-to-video')) {
      input.start_image_url = firstFrame || images[0]
      if (lastFrame) input.end_image_url = lastFrame
      input.aspect_ratio = aspectRatio
    } else {
      input.aspect_ratio = aspectRatio === 'adaptive' ? '16:9' : aspectRatio
    }
    return input
  }

  /**
   * Kling 4.0 Flash: 720p only, 3–20 s. text-to-video; image-to-video (start frame only, no end
   * frame); reference-to-video (up to 10 images incl. an optional start frame, 5 videos, cited as
   * @Image1 / @Video1); video-to-video edits the first video (@Video1) with optional references.
   */
  private buildKlingV4FlashInput(payload: any): Record<string, any> {
    const { images, videos, firstFrame, lastFrame } = this.collectMedia(payload)
    const id = String(payload.model)
    const aspect = payload.aspectRatio && payload.aspectRatio !== 'adaptive' ? String(payload.aspectRatio) : ''
    const input: Record<string, any> = { resolution: '720p' }

    if (id.endsWith('/video-to-video')) {
      const [source, ...more] = videos
      if (!source) throw new Error('Kling 4.0 Flash Edit requiere un video de origen (3–20 s).')
      input.prompt = payload.prompt || ''
      input.video_url = source
      if (more.length) input.video_urls = more.slice(0, 4)
      const refImages = [...(firstFrame ? [firstFrame] : []), ...images]
      if (refImages.length) input.image_urls = refImages.slice(0, 10)
      // No duration: the output keeps the source video's length
      return input
    }

    input.duration = Math.min(20, Math.max(3, Math.round(Number(payload.duration) || 5)))
    if (id.endsWith('/image-to-video')) {
      const start = firstFrame || images[0] || lastFrame
      if (!start) throw new Error('Kling 4.0 Flash I2V requiere una imagen de inicio.')
      input.start_image_url = start
      if (payload.prompt) input.prompt = payload.prompt
      return input
    }

    input.prompt = payload.prompt || ''
    if (id.endsWith('/reference-to-video')) {
      // The start frame counts toward the 10-image limit
      if (firstFrame) input.start_image_url = firstFrame
      if (images.length) input.image_urls = images.slice(0, firstFrame ? 9 : 10)
      if (videos.length) input.video_urls = videos.slice(0, 5)
      input.aspect_ratio = ['auto', '16:9', '9:16', '1:1', '21:9'].includes(aspect) ? aspect : 'auto'
      return input
    }
    input.aspect_ratio = ['16:9', '9:16', '1:1', '21:9'].includes(aspect) ? aspect : '16:9'
    return input
  }

  /** H3 Max Relight: source video (≤15 s, output keeps its length) + a lighting-sphere image. */
  private buildH3RelightInput(payload: any): Record<string, any> {
    const { images, videos, firstFrame } = this.collectMedia(payload)
    const sphere = firstFrame || images[0]
    if (!videos[0] || !sphere) {
      throw new Error('H3 Max Relight requiere un video de origen (hasta 15 s) y una imagen de esfera con la iluminación.')
    }
    const res = String(payload.resolution || '768P').toUpperCase()
    const aspect = String(payload.aspectRatio || '')
    return {
      video_url: videos[0],
      reference_image_url: sphere,
      resolution: ['480P', '768P', '1080P', '2K'].includes(res) ? res : '768P',
      // adaptive keeps the source framing (fal's default would force 16:9)
      aspect_ratio: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(aspect) ? aspect : 'adaptive',
    }
  }

  /** Sync-3 lipsync: re-syncs a video to an audio track, or animates a portrait to it (image-to-video). */
  private buildSync3Input(payload: any): Record<string, any> {
    const { images, videos, audios, firstFrame } = this.collectMedia(payload)
    if (!audios[0]) throw new Error('Sync-3 requiere un audio de referencia.')
    if (String(payload.model).endsWith('/image-to-video')) {
      const image = firstFrame || images[0]
      if (!image) throw new Error('Sync-3 requiere un video o un retrato de referencia.')
      return { image_url: image, audio_url: audios[0] }
    }
    if (!videos[0]) throw new Error('Sync-3 requiere un video y un audio de referencia.')
    const input: Record<string, any> = {
      video_url: videos[0],
      audio_url: audios[0],
      sync_mode: ['cut_off', 'loop', 'bounce', 'silence', 'remap'].includes(payload.syncMode) ? payload.syncMode : 'cut_off',
    }
    const options: Record<string, any> = {}
    if (typeof payload.temperature === 'number') options.temperature = payload.temperature
    if (typeof payload.activeSpeaker === 'boolean') options.active_speaker_detection = { auto_detect: payload.activeSpeaker }
    if (Object.keys(options).length) input.options = options
    return input
  }

  /** ByteDance video upscaler (standard tier): one source video to 1080p / 2K / 4K. */
  private buildBytedanceUpscaleInput(payload: any): Record<string, any> {
    const { videos } = this.collectMedia(payload)
    if (!videos[0]) throw new Error('ByteDance Upscaler requiere un video de referencia.')
    const res = String(payload.resolution || '1080p').toLowerCase()
    const input: Record<string, any> = {
      video_url: videos[0],
      target_resolution: ['1080p', '2k', '4k'].includes(res) ? res : '1080p',
      enhancement_tier: 'standard',
    }
    // Above 30 fps the price doubles (above 60 fps, ×4): only sent when chosen explicitly
    const fps = Number(payload.fps)
    if (fps >= 24 && fps <= 120) input.target_fps = fps
    return input
  }

  private buildVideoInput(payload: any): Record<string, any> {
    const videoId = String(payload.model || '')
    if (videoId.startsWith('kling/v4/flash/')) return this.buildKlingV4FlashInput(payload)
    if (videoId === 'minimax/h3-max/relight') return this.buildH3RelightInput(payload)
    if (videoId.startsWith('fal-ai/sync-lipsync/v3')) return this.buildSync3Input(payload)
    if (videoId === 'fal-ai/bytedance-upscaler/upscale/video') return this.buildBytedanceUpscaleInput(payload)
    if (String(payload.model || '').startsWith('blackforestlabs/flux-3-max/')) return this.buildFlux3MaxInput(payload)
    if (String(payload.model || '').startsWith('kling/v4/')) return this.buildKlingV4Input(payload)
    if (String(payload.model || '').startsWith('bytedance/seedance-2.5/us/')) return this.buildSeedance25Input(payload)
    if (String(payload.model || '').startsWith('alibaba/wan-3.0/')) return this.buildWan3Input(payload)
    const isTextToVideo = payload.model?.includes('text-to-video')

    let aspectRatio = payload.aspectRatio || (isTextToVideo ? '16:9' : 'adaptive')
    if (isTextToVideo && aspectRatio === 'adaptive') {
      aspectRatio = '16:9'
    }

    const input: Record<string, any> = {
      prompt: payload.prompt || '',
      duration: Number(payload.duration) || 5,
      resolution: (payload.resolution || '768P').toUpperCase(),
      aspect_ratio: aspectRatio,
    }
    // MiniMax H3 on fal requires prompt_expansion_mode on every endpoint (text and reference to video)
    if (payload.promptExpansionMode) {
      input.prompt_expansion_mode = payload.promptExpansionMode
    } else if (isTextToVideo || String(payload.model || '').startsWith('minimax/')) {
      input.prompt_expansion_mode = 'balanced'
    }

    if (!isTextToVideo) {
      const toDataUri = (b64: string, mime: string) => `data:${mime};base64,${b64}`

      const imageRefs = (payload.imageRefs || []).filter((r: any) => r.base64)
      if (imageRefs.length > 0) {
        input.reference_image_urls = imageRefs.map((r: any) => toDataUri(r.base64, r.mime || 'image/png'))
      } else if (payload.imageBase64) {
        input.reference_image_urls = [toDataUri(payload.imageBase64, payload.imageMime || 'image/png')]
      }
      const videoRefs = (payload.videoRefs || []).filter((r: any) => r.base64)
      if (videoRefs.length > 0) {
        input.reference_video_urls = videoRefs.map((r: any) => toDataUri(r.base64, r.mime || 'video/mp4'))
      }
      const audioRefs = (payload.audioRefs || []).filter((r: any) => r.base64)
      if (audioRefs.length > 0) {
        input.reference_audio_urls = audioRefs.map((r: any) => toDataUri(r.base64, r.mime || 'audio/mpeg'))
      }
    }
    return input
  }

  private buildImageInput(payload: any, model: ReturnType<typeof getFalModel>): Record<string, any> {
    const toDataUri = (b64: string, mime: string) => `data:${mime};base64,${b64}`
    const input: Record<string, any> = {
      prompt: payload.prompt || '',
    }
    if (payload.batchSize && payload.batchSize > 1) input.num_images = payload.batchSize

    if (model?.aspectField === 'aspect_ratio') {
      input.aspect_ratio = payload.aspectRatio || '1:1'
      if (model?.supportsResolution && payload.resolution) input.resolution = payload.resolution
    } else {
      input.image_size = aspectToImageSize(payload.aspectRatio)
    }

    const imageRefs = (payload.imageRefs || []).filter((r: any) => r.base64)
    const refUrls = imageRefs.length > 0
      ? imageRefs.map((r: any) => toDataUri(r.base64, r.mime || 'image/png'))
      : payload.imageBase64
        ? [toDataUri(payload.imageBase64, payload.imageMime || 'image/png')]
        : []
    if (refUrls.length > 0) {
      const field = model?.editImageField || 'image_url'
      if (field === 'image_urls') input.image_urls = refUrls
      else input[field] = refUrls[0]
    }
    return input
  }

  /**
   * GPT Image 2.6 Flare / Sunburst. Presets only cover 4:3 and 16:9, so the size is sent as explicit
   * dimensions (multiples of 16, max edge 3840, 655,360–8,294,400 px) from the aspect ratio and
   * 1K / 2K / 4K; "auto" lets the model pick (edit: from the input images). Edit takes up to 16 images.
   */
  private buildGptImage26Input(payload: any): Record<string, any> {
    const { images } = this.collectMedia(payload)
    const input: Record<string, any> = { prompt: payload.prompt || '' }
    if (payload.batchSize && payload.batchSize > 1) input.num_images = Math.min(10, payload.batchSize)
    if (['auto', 'low', 'medium', 'high', 'xhigh', 'max'].includes(payload.quality)) input.quality = payload.quality
    const res = String(payload.resolution || '1K').toUpperCase()
    const budget = res === '4K' ? 8_294_400 : res === '2K' ? 2048 * 2048 : 1024 * 1024
    input.image_size = sizeForAspect(payload.aspectRatio, budget, { step: 16, maxEdge: 3840, maxPixels: 8_294_400 }) || 'auto'
    if (String(payload.model).endsWith('/edit')) {
      if (!images.length) throw new Error('GPT Image 2.6 Edit requiere al menos una imagen.')
      input.image_urls = images.slice(0, 16)
    }
    return input
  }

  /** FLUX 3 text-to-image / edit-image (1–10 references). Resolution tiers are lowercase (1k/2k/4k). */
  private buildFlux3ImageInput(payload: any): Record<string, any> {
    const { images } = this.collectMedia(payload)
    const res = String(payload.resolution || '1K').toLowerCase()
    const aspect = String(payload.aspectRatio || 'auto')
    const input: Record<string, any> = {
      prompt: payload.prompt || '',
      resolution: ['768sq', '1k', '1.5k', '2k', '4k'].includes(res) ? res : '1k',
      aspect_ratio: FLUX3_ASPECT_RATIOS.includes(aspect) ? aspect : 'auto',
      output_format: 'png',
    }
    if (String(payload.model).endsWith('/edit-image')) {
      if (!images.length) throw new Error('FLUX 3 Edit requiere al menos una imagen de referencia.')
      input.image_urls = images.slice(0, 10)
    }
    return input
  }

  /**
   * Ideogram 4.5. Text-to-image only accepts its own list of exact sizes (or a few presets), so the
   * aspect ratio + 1K/2K picks one. Edit: first image is the source, up to 4 more are references;
   * the output keeps the source size. Quality defaults to medium ($0.06).
   */
  private buildIdeogram45Input(payload: any): Record<string, any> {
    const { images } = this.collectMedia(payload)
    const input: Record<string, any> = { prompt: payload.prompt || '' }
    if (payload.batchSize && payload.batchSize > 1) input.num_images = Math.min(8, payload.batchSize)
    if (String(payload.model).endsWith('/edit')) {
      if (!images.length) throw new Error('Ideogram 4.5 Edit requiere una imagen de origen.')
      input.image_url = images[0]
      if (images.length > 1) input.reference_image_urls = images.slice(1, 5)
      if (['very_low', 'low', 'medium', 'high'].includes(payload.quality)) input.quality = payload.quality
      return input
    }
    if (['low', 'medium', 'high'].includes(payload.quality)) input.quality = payload.quality
    const sizes = IDEOGRAM45_SIZES[String(payload.aspectRatio || '1:1')] || IDEOGRAM45_SIZES['1:1']
    const [w, h] = sizes[String(payload.resolution || '').toUpperCase() === '2K' ? 1 : 0].split('x').map(Number)
    input.image_size = { width: w, height: h }
    return input
  }

  /**
   * Krea 3 text-to-image / edit (1–8 images, cited as <image-1>…). Billed per megapixel of output,
   * so the size is explicit: ~1 MP at 1K, ~4 MP at 2K (max 4,220,160 px); "auto" lets Krea choose (~4 MP).
   */
  private buildKrea3Input(payload: any): Record<string, any> {
    const { images } = this.collectMedia(payload)
    const input: Record<string, any> = { prompt: payload.prompt || '' }
    const budget = String(payload.resolution || '1K').toUpperCase() === '2K' ? 2048 * 2048 : 1024 * 1024
    input.image_size = sizeForAspect(payload.aspectRatio, budget, { step: 16, maxEdge: 4096, maxPixels: 4_220_160 }) || 'auto'
    if (String(payload.model).endsWith('/edit')) {
      if (!images.length) throw new Error('Krea 3 Edit requiere al menos una imagen.')
      input.image_urls = images.slice(0, 8)
    }
    return input
  }

  private async processTask(task: any) {
    this.processing.add(task.taskId)
    const raw = getRawDb()

    logRun(raw, task.taskId, 'processing', 'fal.ai task started processing')

    raw.prepare('UPDATE tasks SET status = ?, started_at = ?, updated_at = ? WHERE task_id = ?')
      .run('processing', Date.now(), Date.now(), task.taskId)

    this.emit('task:started', { taskId: task.taskId })

    try {
      const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})

      // Re-hydrate media from binary assets (base64 only lives in memory here)
      await hydratePayloadMedia(payload)

      let requestId = task.requestId || task.externalId || payload?.requestId

      if (requestId) {
        logRun(raw, task.taskId, 'recovery', `Resuming existing request: ${requestId}`)
      } else {
        if (!getFalModel(payload.model)) throw new Error(`Unknown fal.ai model: ${payload.model}`)
        // Retired ids and input-dependent variants run on their current endpoint
        payload.model = this.routeEndpoint(payload)
        const input = this.buildInput(payload)

        logRun(raw, task.taskId, 'api-request', `Submitting request: model=${payload.model}, resolution=${payload.resolution || '2K'}, duration=${payload.duration || 5}`)
        const res = await this.apiClient.submitRequest(payload.model, input)
        requestId = res.request_id
        logRun(raw, task.taskId, 'api-response', `Request submitted: ${requestId}`)

        payload.requestId = requestId
        // Poll where fal says: status and results live under the app id, not the endpoint path
        if (res.status_url) payload.falStatusUrl = res.status_url
        if (res.response_url) payload.falResponseUrl = res.response_url
        if (res.cancel_url) payload.falCancelUrl = res.cancel_url
        raw.prepare('UPDATE tasks SET payload = ?, external_id = ?, request_id = ? WHERE task_id = ?')
          .run(JSON.stringify(redactPayload(payload)), requestId, requestId, task.taskId)
      }

      raw.prepare('UPDATE tasks SET updated_at = ? WHERE task_id = ?').run(Date.now(), task.taskId)
      logRun(raw, task.taskId, 'waiting', 'Polling queue status...')

      const result = await this.poll(payload.model, requestId!, task.taskId, falUrls(payload))
      logRun(raw, task.taskId, 'completed', 'Request completed')

      await this.handleSuccess(task, result)
    } catch (error: any) {
      logRun(getRawDb(), task.taskId, 'error', `Error: ${error.message}`, null, 'error')
      await this.handleError(task, error)
    } finally {
      this.processing.delete(task.taskId)
      this.processQueue()
    }
  }

  private async poll(modelId: string, requestId: string, taskId: string, urls: FalRequestUrls): Promise<FalVideoResult | FalImageResult> {
    const raw = getRawDb()
    while (true) {
      const status = await this.apiClient.getRequestStatus(modelId, requestId, urls)
      this.emit('task:progress', { taskId, state: status.status, queuePosition: status.queue_position })

      if (status.status === 'COMPLETED') {
        return this.apiClient.getRequestResult(modelId, requestId, urls)
      }

      raw.prepare('UPDATE tasks SET updated_at = ? WHERE task_id = ?').run(Date.now(), taskId)
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    }
  }

  private async handleSuccess(task: any, result: FalResult) {
    const raw = getRawDb()
    const taskPayload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})
    const isImage = task.type === 'image' || !!(result as FalImageResult).images
    const isAudio = task.type === 'audio' || !!(result as any).audio_url || !!(result as any).audio_file || !!(result as any).audio

    if (isImage) {
      await this.handleImageSuccess(task, taskPayload, (result as FalImageResult).images || [])
      return
    }

    if (isAudio) {
      await this.handleAudioSuccess(task, taskPayload, result)
      return
    }

    const assetId = crypto.randomUUID()
    const remoteUrl = (result as FalVideoResult).video?.url || null

    const updatePlaceholder = (fields: Record<string, any>) => {
      const placeholder = raw.prepare('SELECT id FROM assets WHERE task_id = ? ORDER BY created_at ASC LIMIT 1').get(task.taskId) as any
      if (!placeholder) return null
      const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ')
      raw.prepare(`UPDATE assets SET ${sets}, updated_at = ? WHERE id = ?`)
        .run(...Object.values(fields), Date.now(), placeholder.id)
      return placeholder.id
    }

    let localAssetId: string | null = null

    if (remoteUrl) {
      const fileName = `${assetId}.mp4`
      const taskWs = task.workspace_id || getTaskWorkspace(task.taskId)
      const subDir = workspaceAssetSubDir('video', taskWs)
      const localPath = `${subDir}/${fileName}`

      try {
        logRun(raw, task.taskId, 'download', `Downloading video: ${remoteUrl.substring(0, 80)}...`)
        const resp = await fetch(remoteUrl)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const buffer = Buffer.from(await resp.arrayBuffer())
        await fs.mkdir(subDir, { recursive: true })
        await fs.writeFile(localPath, buffer)

        let fileSize = buffer.length
        try {
          const res = await ensurePlayableVideo(localPath)
          fileSize = res.size
        } catch {}

        localAssetId = updatePlaceholder({
          file_path: remoteUrl,
          local_path: localPath,
          file_name: fileName,
          mime_type: 'video/mp4',
          model_used: taskPayload?.model || '',
          prompt: taskPayload?.prompt || '',
          parameters: JSON.stringify(redactPayload(taskPayload)),
          file_size: fileSize,
        })
      } catch (err: any) {
        logRun(raw, task.taskId, 'download-error', `Download failed: ${err.message}`, null, 'error')
        console.error('[FalQueue] Failed to download asset:', err.message)
        localAssetId = updatePlaceholder({
          file_path: remoteUrl,
          file_name: `remote-video-${assetId}`,
          mime_type: 'video/mp4',
          model_used: taskPayload?.model || '',
          prompt: taskPayload?.prompt || '',
          parameters: JSON.stringify(redactPayload(taskPayload)),
        })
      }
    } else {
      logRun(raw, task.taskId, 'no-url', 'No output video URL in result', null, 'warn')
    }

    raw.prepare(
      'UPDATE tasks SET status = ?, result_asset_id = ?, progress = ?, completed_at = ?, updated_at = ? WHERE task_id = ?'
    ).run('completed', localAssetId, 100, Date.now(), Date.now(), task.taskId)

    raw.save()

    this.emit('task:completed', { taskId: task.taskId, assetId: localAssetId, output: remoteUrl })
  }

  private async handleImageSuccess(task: any, taskPayload: any, images: any[]) {
    const raw = getRawDb()
    const image = images[0]
    if (!image?.url) {
      logRun(raw, task.taskId, 'no-url', 'No output image URL in result', null, 'warn')
      raw.prepare(
        'UPDATE tasks SET status = ?, result_asset_id = ?, progress = ?, completed_at = ?, updated_at = ? WHERE task_id = ?'
      ).run('completed', null, 100, Date.now(), Date.now(), task.taskId)
      raw.save()
      this.emit('task:completed', { taskId: task.taskId, assetId: null, output: null })
      return
    }

    const assetId = crypto.randomUUID()
    const remoteUrl = image.url
    const mimeType = image.content_type || 'image/png'
    const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png'
    const fileName = `${assetId}.${ext}`
    const taskWs = task.workspace_id || getTaskWorkspace(task.taskId)
    const subDir = workspaceAssetSubDir('image', taskWs)
    const localPath = `${subDir}/${fileName}`

    const updatePlaceholder = (fields: Record<string, any>) => {
      const placeholder = raw.prepare('SELECT id FROM assets WHERE task_id = ? ORDER BY created_at ASC LIMIT 1').get(task.taskId) as any
      if (!placeholder) return null
      const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ')
      raw.prepare(`UPDATE assets SET ${sets}, updated_at = ? WHERE id = ?`)
        .run(...Object.values(fields), Date.now(), placeholder.id)
      return placeholder.id
    }

    let localAssetId: string | null = null

    try {
      logRun(raw, task.taskId, 'download', `Downloading image: ${remoteUrl.substring(0, 80)}...`)
      const resp = await fetch(remoteUrl)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const buffer = Buffer.from(await resp.arrayBuffer())
      await fs.mkdir(subDir, { recursive: true })
      await fs.writeFile(localPath, buffer)

      localAssetId = updatePlaceholder({
        file_path: remoteUrl,
        local_path: localPath,
        file_name: fileName,
        mime_type: mimeType,
        width: image.width || null,
        height: image.height || null,
        file_size: buffer.length,
        model_used: taskPayload?.model || '',
        prompt: taskPayload?.prompt || '',
        parameters: JSON.stringify(redactPayload(taskPayload)),
      })
    } catch (err: any) {
      logRun(raw, task.taskId, 'download-error', `Download failed: ${err.message}`, null, 'error')
      console.error('[FalQueue] Failed to download image:', err.message)
      localAssetId = updatePlaceholder({
        file_path: remoteUrl,
        file_name: `remote-image-${assetId}`,
        mime_type: mimeType,
        model_used: taskPayload?.model || '',
        prompt: taskPayload?.prompt || '',
        parameters: JSON.stringify(redactPayload(taskPayload)),
      })
    }

    raw.prepare(
      'UPDATE tasks SET status = ?, result_asset_id = ?, progress = ?, completed_at = ?, updated_at = ? WHERE task_id = ?'
    ).run('completed', localAssetId, 100, Date.now(), Date.now(), task.taskId)

    raw.save()

    this.emit('task:completed', { taskId: task.taskId, assetId: localAssetId, output: remoteUrl })
  }

  private async handleAudioSuccess(task: any, taskPayload: any, result: any) {
    const raw = getRawDb()
    const audioData = result?.audio_url || result?.audio_file || result?.audio || result
    const remoteUrl = typeof audioData === 'string' ? audioData : (audioData?.url || null)

    if (!remoteUrl) {
      logRun(raw, task.taskId, 'no-url', 'No output audio URL in result', null, 'warn')
      raw.prepare(
        'UPDATE tasks SET status = ?, result_asset_id = ?, progress = ?, completed_at = ?, updated_at = ? WHERE task_id = ?'
      ).run('completed', null, 100, Date.now(), Date.now(), task.taskId)
      raw.save()
      this.emit('task:completed', { taskId: task.taskId, assetId: null, output: null })
      return
    }

    const assetId = crypto.randomUUID()
    const mimeType = (typeof audioData === 'object' && audioData?.content_type) || 'audio/mpeg'
    const ext = mimeType === 'audio/wav' || mimeType === 'audio/x-wav' ? 'wav' : mimeType === 'audio/ogg' ? 'ogg' : 'mp3'
    const fileName = `${assetId}.${ext}`
    const taskWs = task.workspace_id || getTaskWorkspace(task.taskId)
    const subDir = workspaceAssetSubDir('audio', taskWs)
    const localPath = `${subDir}/${fileName}`

    const updatePlaceholder = (fields: Record<string, any>) => {
      const placeholder = raw.prepare('SELECT id FROM assets WHERE task_id = ? ORDER BY created_at ASC LIMIT 1').get(task.taskId) as any
      if (!placeholder) return null
      const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ')
      raw.prepare(`UPDATE assets SET ${sets}, updated_at = ? WHERE id = ?`)
        .run(...Object.values(fields), Date.now(), placeholder.id)
      return placeholder.id
    }

    let localAssetId: string | null = null

    try {
      logRun(raw, task.taskId, 'download', `Downloading audio: ${remoteUrl.substring(0, 80)}...`)
      const resp = await fetch(remoteUrl)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const buffer = Buffer.from(await resp.arrayBuffer())
      await fs.mkdir(subDir, { recursive: true })
      await fs.writeFile(localPath, buffer)

      localAssetId = updatePlaceholder({
        file_path: remoteUrl,
        local_path: localPath,
        file_name: fileName,
        mime_type: mimeType,
        type: 'audio',
        file_size: buffer.length,
        model_used: taskPayload?.model || '',
        prompt: taskPayload?.prompt || '',
        parameters: JSON.stringify(redactPayload(taskPayload)),
      })
    } catch (err: any) {
      logRun(raw, task.taskId, 'download-error', `Download failed: ${err.message}`, null, 'error')
      console.error('[FalQueue] Failed to download audio:', err.message)
      localAssetId = updatePlaceholder({
        file_path: remoteUrl,
        file_name: `remote-audio-${assetId}`,
        mime_type: mimeType,
        type: 'audio',
        model_used: taskPayload?.model || '',
        prompt: taskPayload?.prompt || '',
        parameters: JSON.stringify(redactPayload(taskPayload)),
      })
    }

    raw.prepare(
      'UPDATE tasks SET status = ?, result_asset_id = ?, progress = ?, completed_at = ?, updated_at = ? WHERE task_id = ?'
    ).run('completed', localAssetId, 100, Date.now(), Date.now(), task.taskId)
    raw.save()

    this.emit('task:completed', { taskId: task.taskId, assetId: localAssetId, output: remoteUrl })
  }

  private async handleError(task: any, error: Error) {
    const raw = getRawDb()
    const taskId = task.taskId || task.task_id
    const retryCount = (task.retryCount ?? task.retry_count ?? 0) + 1

    raw.prepare('UPDATE assets SET file_path = ?, updated_at = ? WHERE task_id = ? AND file_path = ?')
      .run(`__error__:${error.message}`, Date.now(), taskId, '')

    const isNonRetryable =
      error.message.includes('400') ||
      error.message.includes('401') ||
      error.message.includes('403') ||
      error.message.includes('404') ||
      error.message.includes('405') ||
      error.message.includes('422') ||
      error.message.toLowerCase().includes('validation') ||
      error.message.toLowerCase().includes('not supported') ||
      error.message.toLowerCase().includes('incorrect') ||
      error.message.toLowerCase().includes('invalid')

    // Only resume an accepted job; never resubmit (see canAutoResume)
    if (retryCount <= MAX_RETRIES && !isNonRetryable && canAutoResume(task.taskId || task.task_id, error)) {
      raw.prepare('UPDATE tasks SET status = ?, retry_count = ?, error_message = ?, updated_at = ? WHERE task_id = ?')
        .run('pending', retryCount, error.message, Date.now(), taskId)
      this.emit('task:retry', { taskId, attempt: retryCount, error: error.message })
      this.coolingDown.add(taskId)
      setTimeout(() => {
        this.coolingDown.delete(taskId)
        this.processQueue()
      }, 5000 * retryCount)
    } else {
      raw.prepare('UPDATE tasks SET status = ?, error_message = ?, updated_at = ? WHERE task_id = ?')
        .run('failed', error.message, Date.now(), taskId)
      this.emit('task:failed', { taskId, error: error.message })
    }
    raw.save()
  }

  // ─── RecoverableQueue (see task-recovery.ts) ─────────────────

  async checkRemote(task: any, requestId: string): Promise<RemoteTaskStatus> {
    const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})
    const status = await this.apiClient.getRequestStatus(payload.model, requestId, falUrls(payload))
    if (status.status !== 'COMPLETED') return { state: 'running', detail: status.status }
    try {
      return { state: 'completed', result: await this.apiClient.getRequestResult(payload.model, requestId, falUrls(payload)) }
    } catch (err: any) {
      // fal reports failed jobs as COMPLETED and returns the job error from the result endpoint
      if (/\((400|404|422)\)/.test(String(err?.message))) return { state: 'failed', error: err.message }
      throw err
    }
  }

  async completeRemote(task: any, result: FalResult): Promise<void> {
    await this.handleSuccess(task, result)
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const raw = getRawDb()
    const task = raw.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as any
    if (!task) return false
    const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})
    const requestId = task.requestId || task.request_id || task.external_id || payload?.requestId
    if (requestId && payload?.model) {
      try { await this.apiClient.cancelRequest(payload.model, requestId, falUrls(payload)) } catch {}
    }
    raw.prepare('UPDATE tasks SET status = ?, error_message = ?, updated_at = ? WHERE task_id = ?')
      .run('failed', 'Canceled by user', Date.now(), taskId)
    raw.prepare('UPDATE assets SET file_path = ?, updated_at = ? WHERE task_id = ? AND file_path = ?')
      .run('__error__:Canceled by user', Date.now(), taskId, '')
    raw.save()
    this.emit('task:failed', { taskId, error: 'Canceled by user' })
    return true
  }

  async recoverPendingTasks() {
    const raw = getRawDb()
    for (const status of ['processing', 'pending']) {
      const tasks = raw.prepare('SELECT * FROM tasks WHERE provider = ? AND status = ?').all('fal', status) as any[]
      for (const task of tasks) {
        logRun(raw, task.taskId, 'recovery', 'Recovering interrupted fal.ai task')
        this.processTask(task)
      }
    }
  }
}

let queueInstance: FalQueue | null = null

export function getFalQueue(apiKey?: string): FalQueue {
  if (!queueInstance) {
    if (!apiKey) throw new Error('fal.ai API key not configured.')
    queueInstance = new FalQueue(apiKey)
  }
  if (apiKey) queueInstance.setApiKey(apiKey)
  return queueInstance
}

export function initFalQueue(apiKey: string): FalQueue {
  queueInstance = new FalQueue(apiKey)
  return queueInstance
}

const ASPECT_TO_IMAGE_SIZE: Record<string, string> = {
  '1:1': 'square_1_1',
  '16:9': 'landscape_16_9',
  '9:16': 'portrait_9_16',
  '4:3': 'landscape_4_3',
  '3:4': 'portrait_3_4',
  '3:2': 'landscape_3_2',
  '2:3': 'portrait_2_3',
  '21:9': 'landscape_21_9',
  '5:4': 'landscape_5_4',
  '4:5': 'portrait_4_5',
  'auto': 'square_1_1',
}

function aspectToImageSize(aspectRatio?: string): string {
  return ASPECT_TO_IMAGE_SIZE[aspectRatio || '1:1'] || 'square_1_1'
}

/**
 * Explicit { width, height } for an aspect ratio ("16:9") near a pixel budget, rounded down to
 * multiples of `step` and kept under the endpoint's edge and pixel limits. Null for "auto" or
 * anything that is not a ratio.
 */
function sizeForAspect(aspect: string | undefined, pixels: number, limits: { step: number; maxEdge: number; maxPixels: number }) {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(aspect || ''))
  if (!m) return null
  const ratio = Number(m[1]) / Number(m[2])
  if (!ratio || !isFinite(ratio)) return null
  let w = Math.sqrt(pixels * ratio)
  let h = Math.sqrt(pixels / ratio)
  const scale = Math.min(1, limits.maxEdge / Math.max(w, h), Math.sqrt(limits.maxPixels / (w * h)))
  w *= scale
  h *= scale
  const snap = (v: number) => Math.max(limits.step, Math.floor(v / limits.step) * limits.step)
  return { width: snap(w), height: snap(h) }
}

/** FLUX 3 (fal) aspect ratios */
const FLUX3_ASPECT_RATIOS = ['auto', '21:9', '2:1', '16:9', '3:2', '7:5', '4:3', '5:4', '1:1', '4:5', '3:4', '5:7', '2:3', '9:16', '1:2']

/** Ideogram 4.5 text-to-image: exact sizes it accepts, per aspect ratio, as [1K, 2K] */
const IDEOGRAM45_SIZES: Record<string, [string, string]> = {
  '1:1': ['1024x1024', '2048x2048'],
  '16:9': ['1280x720', '2560x1440'],
  '9:16': ['720x1280', '1440x2560'],
  '4:3': ['1152x864', '2304x1728'],
  '3:4': ['864x1152', '1728x2304'],
  '3:2': ['1248x832', '2496x1664'],
  '2:3': ['832x1248', '1664x2496'],
  '5:4': ['1120x896', '2240x1792'],
  '4:5': ['896x1120', '1792x2240'],
  '16:10': ['1280x800', '2560x1600'],
  '10:16': ['800x1280', '1600x2560'],
  '2:1': ['1440x720', '2880x1440'],
  '1:2': ['720x1440', '1440x2880'],
  '3:1': ['3072x1024', '3072x1024'],
  '1:3': ['1024x3072', '1024x3072'],
}

/** Grok TTS v1 (xai/tts/v1) voices and languages */
const XAI_TTS_VOICES = ['carina', 'zagan', 'helix', 'orion', 'luna', 'iris', 'altair', 'zenith', 'perseus', 'helios', 'lux', 'kepler', 'rigel', 'cosmo', 'celeste', 'ursa', 'sirius', 'lumen', 'castor', 'naksh', 'atlas', 'aurora', 'liora', 'ara', 'eve', 'leo', 'rex', 'sal']
const XAI_TTS_LANGUAGES = ['auto', 'en', 'ar-EG', 'ar-SA', 'ar-AE', 'bn', 'zh', 'fr', 'de', 'hi', 'id', 'it', 'ja', 'ko', 'pt-BR', 'pt-PT', 'ru', 'es-MX', 'es-ES', 'tr', 'vi']

/** Gemini TTS voices (fal-ai/gemini-3.1-flash-tts) */
const GEMINI_TTS_VOICES = ['Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Aoede', 'Autonoe', 'Callirrhoe', 'Charon', 'Despina', 'Enceladus', 'Erinome', 'Fenrir', 'Gacrux', 'Iapetus', 'Kore', 'Laomedeia', 'Leda', 'Orus', 'Pulcherrima', 'Puck', 'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Schedar', 'Sulafat', 'Umbriel', 'Vindemiatrix', 'Zephyr', 'Zubenelgenubi']

registerRecoverableProvider('fal', () => {
  const key = readApiKey('falApiKey')
  return key ? getFalQueue(key) : null
})
