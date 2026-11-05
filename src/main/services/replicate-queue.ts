import { EventEmitter } from 'events'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import { getRawDb } from '../db'
import { getActiveWorkspaceId, workspaceAssetSubDir, getTaskWorkspace } from './workspace-service'
import { ensurePlayableVideo } from './asset-manager'
import { attachTaskNotifications } from './task-notifications'
import { redactPayload } from './payload-redact'
import { persistMediaToAssets, hydratePayloadMedia } from './media-persist'
import { ReplicateApiClient, getReplicateModel, resolveReplicateModelId, P_VIDEO_AVATAR_VOICES, P_VIDEO_AVATAR_LANGUAGES, type Prediction } from './replicate'
import { pVideo2Kind, buildPVideo2Input, validatePVideo2Input, type MediaRef } from './pruna/inputs'
import { registerRecoverableProvider, readApiKey, canAutoResume, RemoteJobFailedError, type RecoverableQueue, type RemoteTaskStatus } from './task-recovery'

const POLL_INTERVAL_MS = 2000
const MAX_RETRIES = 3

function logRun(raw: any, taskId: string, step: string, message: string, payload?: any, level = 'info', workspaceId?: string) {
  try {
    const ws = workspaceId || getTaskWorkspace(taskId)
    raw.prepare('INSERT INTO run_logs (id, task_id, step, level, message, payload, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), taskId, step, level, message, payload ? JSON.stringify(redactPayload(payload)) : null, ws, Date.now())
  } catch {}
}

function modelVersion(modelId: string): string {
  return getReplicateModel(modelId)?.version || ''
}

/** The owner/name Replicate expects for a catalog id (legacy ids resolve to their replacement) */
function apiModelId(modelId: string): string {
  const entry = getReplicateModel(modelId)
  return entry?.apiModel || entry?.id || modelId
}

/** Inline data URI, or the remote URL a ref already has (sync twin of replicateMediaUri) */
function mediaUri(ref: MediaRef | undefined, fallbackMime: string): string | undefined {
  if (ref?.base64) return /^(data:|https?:)/.test(ref.base64) ? ref.base64 : `data:${ref.mime || fallbackMime};base64,${ref.base64}`
  return typeof ref?.url === 'string' && /^https?:\/\//.test(ref.url) ? ref.url : undefined
}

/**
 * Media of a payload as data URIs / URLs. The composer sends Replicate models only imageBase64
 * (the first image); imageRefs, when present, carry every image.
 */
function collectMedia(payload: any) {
  const list = (refs: any, mime: string) => (Array.isArray(refs) ? refs : [])
    .map((r: MediaRef) => mediaUri(r, mime)).filter(Boolean) as string[]
  const refImages = list(payload.imageRefs, 'image/png')
  const single = mediaUri({ base64: payload.imageBase64, url: payload.imageUrl, mime: payload.imageMime }, 'image/png')
  return {
    images: refImages.length ? refImages : single ? [single] : [],
    videos: list(payload.videoRefs, 'video/mp4'),
    audios: list(payload.audioRefs, 'audio/mpeg'),
    firstFrame: mediaUri({ base64: payload.firstFrameBase64, url: payload.firstFrameUrl }, 'image/png'),
    lastFrame: mediaUri({ base64: payload.lastFrameBase64, url: payload.lastFrameUrl }, 'image/png'),
  }
}

type Media = ReturnType<typeof collectMedia>

const clampInt = (v: unknown, min: number, max: number, fallback: number) =>
  Math.min(max, Math.max(min, Math.round(Number(v) || fallback)))

function isLipsync(modelId: string): boolean {
  return (modelId || '').startsWith('sync/lipsync')
}

/** Inline data URI, or the remote URL a ref already has (Replicate fetches it) */
async function replicateMediaUri(ref: MediaRef, fallbackMime: string): Promise<string | null> {
  if (ref?.base64) return `data:${ref.mime || fallbackMime};base64,${ref.base64}`
  return typeof ref?.url === 'string' && /^https?:\/\//.test(ref.url) ? ref.url : null
}

function modelName(modelId: string): string {
  return getReplicateModel(modelId)?.name || modelId
}

export class ReplicateQueue extends EventEmitter implements RecoverableQueue {
  private apiClient: ReplicateApiClient
  readonly processing = new Set<string>()
  private coolingDown = new Set<string>()
  private maxConcurrent = 2

  constructor(apiKey: string) {
    super()
    this.apiClient = new ReplicateApiClient(apiKey)
    attachTaskNotifications(this, 'Replicate')
  }

  setApiKey(apiKey: string) {
    this.apiClient = new ReplicateApiClient(apiKey)
  }

  async enqueue(type: string, payload: any): Promise<string> {
    const taskId = crypto.randomUUID()
    const raw = getRawDb()
    const now = Date.now()
    const wsId = getActiveWorkspaceId()

    // Media is persisted as binary assets on disk; the DB only stores asset IDs.
    const storedPayload = redactPayload(await persistMediaToAssets(payload))

    logRun(raw, taskId, 'enqueue', `Replicate task enqueued: model=${modelName(payload?.model)}`, undefined, 'info', wsId)

    raw.prepare(
      'INSERT INTO tasks (task_id, provider, status, type, payload, workspace_id, created_at, updated_at) VALUES (?, \'replicate\', ?, ?, ?, ?, ?, ?)'
    ).run(taskId, 'pending', type, JSON.stringify(storedPayload), wsId, now, now)

    // Optimistic placeholder asset
    const assetId = crypto.randomUUID()
    const assetKind = type === 'image' ? 'image' : type === 'audio' ? 'audio' : 'video'
    const defaultMime = assetKind === 'image' ? 'image/png' : assetKind === 'audio' ? 'audio/mpeg' : 'video/mp4'

    raw.prepare(
      `INSERT INTO assets (id, type, file_path, local_path, file_name, mime_type, model_used, provider, prompt, parameters, credits_used, task_id, workspace_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      assetId, assetKind, '', '', `pending-${taskId}`, defaultMime,
      payload?.model || '', 'replicate', payload?.prompt || '', JSON.stringify(storedPayload),
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
    const pending = raw.prepare('SELECT * FROM tasks WHERE provider = \'replicate\' AND status = ? ORDER BY created_at ASC').all('pending')
    for (const task of pending) {
      const taskId = task.taskId || task.task_id
      if (this.processing.size >= this.maxConcurrent) break
      if (this.coolingDown.has(taskId)) continue
      if (!this.processing.has(taskId)) this.processTask(task)
    }
  }

  /** Per-model inputs for models whose schema the generic builder below does not fit */
  private buildModelInput(payload: any): Record<string, any> | null {
    const id = resolveReplicateModelId(String(payload.model || ''))
    const media = collectMedia(payload)
    switch (apiModelId(id)) {
      case 'kwaivgi/kling-v3-video': return this.buildKlingV3Input(payload, media)
      case 'kwaivgi/kling-v4.0': return this.buildKlingV4Input(payload, media)
      case 'minimax/h3-lite':
      case 'minimax/h3-highspeed': return this.buildMinimaxH3Input(payload, media, apiModelId(id) === 'minimax/h3-lite')
      case 'google/veo-3.1-lite':
      case 'google/veo-3.1-fast': return this.buildVeo31Input(payload, media, id === 'google/veo-3.1-lite')
      case 'prunaai/p-video-2-pro-avatar': return this.buildPVideo2ProAvatarInput(payload, media)
      case 'openai/gpt-image-2.6-flare':
      case 'openai/gpt-image-2.6-sunburst': return this.buildGptImage26Input(payload, media)
      case 'black-forest-labs/flux-3-image': return this.buildFlux3ImageInput(payload, media)
      case 'ideogram-ai/ideogram-4-5': return this.buildIdeogram45Input(payload, media)
      case 'ideogram-ai/ideogram-4-5-precise-edit': return this.buildIdeogram45PreciseEditInput(payload, media)
      case 'krea/krea-3': return this.buildKrea3Input(payload, media)
    }
    return null
  }

  /** Kling 3.0 (kwaivgi): start / end frame; mode standard (720p), pro (1080p) or 4k; 3–15 s */
  private buildKlingV3Input(payload: any, m: Media): Record<string, any> {
    const input: Record<string, any> = { prompt: payload.prompt || '' }
    const start = m.firstFrame || m.images[0]
    if (start) input.start_image = start
    // The end frame needs a start frame
    if (start && m.lastFrame) input.end_image = m.lastFrame
    const res = String(payload.resolution || '').toLowerCase()
    input.mode = res === '4k' ? '4k' : res === '1080p' ? 'pro' : 'standard'
    if (!start && ['16:9', '9:16', '1:1'].includes(payload.aspectRatio)) input.aspect_ratio = payload.aspectRatio
    if (payload.duration) input.duration = clampInt(payload.duration, 3, 15, 5)
    // Audio raises the price by half; only on when asked for
    input.generate_audio = payload.sound === true || payload.sound === 'on'
    return input
  }

  /**
   * Kling 4.0 (kwaivgi), one model for every mode, routed like the fal/KIE Kling 4.0: FF/LF →
   * keyframes (other images become middle keyframes); 2+ images or any video → references
   * (@image_N / @video_N); one image → start frame; else text. Up to 10 images in total.
   */
  private buildKlingV4Input(payload: any, m: Media): Record<string, any> {
    const input: Record<string, any> = {
      prompt: payload.prompt || '',
      resolution: String(payload.resolution || '').toLowerCase() === '720p' ? '720p' : '1080p',
    }
    let framed = false
    if (m.firstFrame || m.lastFrame) {
      framed = true
      if (m.firstFrame) input.start_image = m.firstFrame
      if (m.lastFrame) input.end_image = m.lastFrame
      const room = 10 - (m.firstFrame ? 1 : 0) - (m.lastFrame ? 1 : 0)
      if (m.images.length) input.middle_images = m.images.slice(0, Math.min(8, room))
    } else if (m.videos.length || m.images.length > 1) {
      if (m.images.length) input.reference_images = m.images.slice(0, 10)
    } else if (m.images.length === 1) {
      framed = true
      input.start_image = m.images[0]
    }
    if (m.videos.length) input.reference_videos = m.videos.slice(0, 5)
    // The aspect ratio comes from the frames when there are any
    if (!framed && ['16:9', '9:16', '1:1', '21:9'].includes(payload.aspectRatio)) input.aspect_ratio = payload.aspectRatio
    if (payload.duration) input.duration = clampInt(payload.duration, 3, 30, 5)
    return input
  }

  /**
   * MiniMax H3 Lite / Highspeed: first/last frame plus up to 9 reference images, 3 videos and
   * 3 audios; 4–15 s. Lite renders 480P or 768P; Highspeed only 768P (and has an adaptive ratio).
   */
  private buildMinimaxH3Input(payload: any, m: Media, lite: boolean): Record<string, any> {
    if (!payload.prompt) throw new Error('MiniMax H3 requiere un prompt.')
    const input: Record<string, any> = { prompt: payload.prompt }
    if (m.firstFrame) input.first_frame_image = m.firstFrame
    if (m.lastFrame) input.last_frame_image = m.lastFrame
    // The API asks for public URLs here; data URIs are sent for local files
    if (m.images.length) input.reference_image_urls = m.images.slice(0, 9)
    if (m.videos.length) input.reference_video_urls = m.videos.slice(0, 3)
    if (m.audios.length) input.reference_audio_urls = m.audios.slice(0, 3)
    input.duration = clampInt(payload.duration, 4, 15, 5)
    if (lite) input.resolution = String(payload.resolution || '').toUpperCase() === '480P' ? '480P' : '768P'
    const ratios = lite ? ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] : ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16']
    if (!lite && m.firstFrame && (!payload.aspectRatio || payload.aspectRatio === 'auto')) input.ratio = 'adaptive'
    else if (ratios.includes(payload.aspectRatio)) input.ratio = payload.aspectRatio
    return input
  }

  /** Veo 3.1 Lite / Fast: start (+ end) frame, 16:9 or 9:16, 4/6/8 s. Lite at 1080p is 8 s only. */
  private buildVeo31Input(payload: any, m: Media, lite: boolean): Record<string, any> {
    const input: Record<string, any> = { prompt: payload.prompt || '' }
    const image = m.firstFrame || m.images[0]
    if (image) input.image = image
    if (image && m.lastFrame) input.last_frame = m.lastFrame
    if (['16:9', '9:16'].includes(payload.aspectRatio)) input.aspect_ratio = payload.aspectRatio
    const res = String(payload.resolution || '720p').toLowerCase() === '1080p' ? '1080p' : '720p'
    input.resolution = res
    const wanted = Number(payload.duration) || 8
    const duration = [4, 6, 8].reduce((best, d) => Math.abs(d - wanted) < Math.abs(best - wanted) ? d : best, 8)
    input.duration = lite && res === '1080p' ? 8 : duration
    // Fast: audio costs $0.15/s vs $0.10/s without; Lite always has audio
    if (!lite) input.generate_audio = payload.sound !== false && payload.sound !== 'off'
    return input
  }

  /**
   * P-Video 2 Pro Avatar: a portrait speaks an audio track (the video matches its length) or, with
   * no audio, the prompt as a script read with Gemini TTS (voice and language from the composer).
   */
  private buildPVideo2ProAvatarInput(payload: any, m: Media): Record<string, any> {
    const image = m.firstFrame || m.images[0]
    if (!image) throw new Error('P-Video 2 Pro Avatar requiere un retrato.')
    const input: Record<string, any> = { image }
    if (m.audios[0]) {
      input.audio = m.audios[0]
      if (payload.prompt) input.prompt = payload.prompt
    } else {
      if (!payload.prompt) throw new Error('P-Video 2 Pro Avatar requiere un audio o un guion en el prompt.')
      input.voice_script = payload.prompt
      if (P_VIDEO_AVATAR_VOICES.includes(payload.voice)) input.voice = payload.voice
      if (P_VIDEO_AVATAR_LANGUAGES.includes(payload.voiceLanguage)) input.voice_language = payload.voiceLanguage
    }
    const res = String(payload.resolution || '768p').toLowerCase()
    input.resolution = ['480p', '768p', '1080p', '2k', '4k'].includes(res) ? res : '768p'
    return input
  }

  /** GPT Image 2.6 Flare / Sunburst: named ratios, or explicit 2K / 4K sizes; images edit */
  private buildGptImage26Input(payload: any, m: Media): Record<string, any> {
    const input: Record<string, any> = {
      prompt: payload.prompt || '',
      // "auto" quality bills $0.25 an image; high is $0.128
      quality: ['low', 'medium', 'high', 'xhigh', 'max'].includes(payload.quality) ? payload.quality : 'high',
      output_format: 'png',
    }
    if (payload.batchSize && payload.batchSize > 1) input.number_of_images = Math.min(10, payload.batchSize)
    const ar = String(payload.aspectRatio || '1:1')
    const res = String(payload.resolution || '1K').toUpperCase()
    const sized: Record<string, Record<string, string>> = {
      '2K': { '1:1': '2048x2048', '16:9': '2048x1152', '9:16': '1152x2048' },
      '4K': { '16:9': '3840x2160', '9:16': '2160x3840' },
    }
    input.aspect_ratio = sized[res]?.[ar] || (['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', 'auto'].includes(ar) ? ar : '1:1')
    if (m.images.length) input.input_images = m.images.slice(0, 16)
    return input
  }

  /** FLUX 3: text-to-image, or edit with up to 10 images (the request becomes an edit) */
  private buildFlux3ImageInput(payload: any, m: Media): Record<string, any> {
    const res = String(payload.resolution || '1K').toLowerCase()
    const ar = String(payload.aspectRatio || 'auto')
    const input: Record<string, any> = {
      prompt: payload.prompt || '',
      resolution: ['768sq', '1k', '1.5k', '2k', '4k'].includes(res) ? res : '1k',
      aspect_ratio: ['auto', '21:9', '2:1', '16:9', '3:2', '7:5', '4:3', '5:4', '1:1', '4:5', '3:4', '5:7', '2:3', '9:16', '1:2', '9:21'].includes(ar) ? ar : 'auto',
      output_format: 'png',
    }
    if (m.images.length) input.images = m.images.slice(0, 10)
    return input
  }

  /** Ideogram 4.5: generate, or edit up to 5 source images ("source" keeps their proportions) */
  private buildIdeogram45Input(payload: any, m: Media): Record<string, any> {
    const input: Record<string, any> = {
      prompt: payload.prompt || '',
      quality: ['very_low', 'low', 'medium', 'high'].includes(payload.quality) ? payload.quality : 'medium',
    }
    if (payload.batchSize && payload.batchSize > 1) input.num_images = Math.min(8, payload.batchSize)
    if (m.images.length) input.images = m.images.slice(0, 5)
    const ar = String(payload.aspectRatio || '')
    const sizes: Record<string, string> = {
      '1:1': '1024x1024', '4:3': '1280x896', '3:2': '1280x896', '5:4': '1280x896',
      '3:4': '896x1280', '2:3': '896x1280', '4:5': '896x1280', '16:9': '1344x768', '9:16': '768x1344',
      '21:9': '1536x640', '9:21': '640x1536',
    }
    input.size = sizes[ar] || (m.images.length ? 'source' : '1024x1024')
    return input
  }

  /** Ideogram 4.5 Precise Edit: one source image (restores unchanged pixels) + up to 4 references */
  private buildIdeogram45PreciseEditInput(payload: any, m: Media): Record<string, any> {
    if (!m.images[0]) throw new Error('Ideogram 4.5 Precise Edit requiere una imagen de origen.')
    const input: Record<string, any> = {
      prompt: payload.prompt || '',
      image: m.images[0],
      quality: ['very_low', 'low', 'medium', 'high'].includes(payload.quality) ? payload.quality : 'medium',
    }
    if (m.images.length > 1) input.reference_images = m.images.slice(1, 5)
    if (payload.batchSize && payload.batchSize > 1) input.num_images = Math.min(8, payload.batchSize)
    return input
  }

  /** Krea 3 (fast thinking): text-to-image, or edit / combine up to 8 images; 1k or 2k */
  private buildKrea3Input(payload: any, m: Media): Record<string, any> {
    const ar = String(payload.aspectRatio || 'auto')
    const input: Record<string, any> = {
      prompt: payload.prompt || '',
      thinking_mode: payload.thinkingMode === 'high' ? 'high' : 'fast',
      resolution: String(payload.resolution || '1K').toUpperCase() === '1K' ? '1k' : '2k',
      aspect_ratio: ['auto', '1:1', '4:5', '3:4', '2:3', '9:16', '5:4', '4:3', '3:2', '16:9', '21:9'].includes(ar) ? ar : 'auto',
    }
    if (m.images.length) input.images = m.images.slice(0, 8)
    return input
  }

  private buildInput(payload: any): Record<string, any> {
    const custom = this.buildModelInput(payload)
    if (custom) return custom
    const input: Record<string, any> = {}
    const isPVideo = payload.model === 'prunaai/p-video'
    const isAvatar = payload.model === 'prunaai/p-video-avatar'
    const isCrystalUpscaler = payload.model === 'philz1337x/crystal-video-upscaler'

    if (isCrystalUpscaler) {
      // Crystal Video Upscaler: requires a reference video (no prompt/resolution inputs)
      const videoRef = payload.videoRefs?.[0]
      if (videoRef?.base64) {
        input.video = `data:${videoRef.mime || 'video/mp4'};base64,${videoRef.base64}`
      }
      input.scale_factor = payload.scaleFactor ?? 2
      return input
    }

    if (isLipsync(payload.model)) {
      // Sync lipsync: the source video plus the audio its mouth should follow
      const videoRef = payload.videoRefs?.[0]
      const audioRef = payload.audioRefs?.[0]
      if (videoRef?.base64) input.video = `data:${videoRef.mime || 'video/mp4'};base64,${videoRef.base64}`
      if (audioRef?.base64) input.audio = `data:${audioRef.mime || 'audio/wav'};base64,${audioRef.base64}`
      input.sync_mode = payload.syncMode || 'cut_off'
      if (typeof payload.temperature === 'number') input.temperature = payload.temperature
      if (typeof payload.activeSpeaker === 'boolean') input.active_speaker = payload.activeSpeaker
      return input
    }

    // Nano Banana models take every reference image as a list in image_input
    if (apiModelId(payload.model || '').startsWith('google/nano-banana')) {
      const refs = (payload.imageRefs || []).filter((r: any) => r.base64)
      const uris = refs.length > 0
        ? refs.map((r: any) => `data:${r.mime || 'image/png'};base64,${r.base64}`)
        : payload.imageBase64 ? [`data:${payload.imageMime || 'image/png'};base64,${payload.imageBase64}`] : []
      if (uris.length > 0) input.image_input = uris
      if (payload.prompt) input.prompt = payload.prompt
      if (payload.resolution) input.resolution = payload.resolution
      if (payload.aspectRatio) input.aspect_ratio = payload.aspectRatio
      return input
    }

    const imageBase64 = payload.imageBase64 || payload.imageRefs?.[0]?.base64
    if (imageBase64) {
      const mime = payload.imageMime || payload.imageRefs?.[0]?.mime || 'image/png'
      input.image = `data:${mime};base64,${imageBase64}`
    }
    const audioRef = payload.audioRefs?.[0]
    if (audioRef?.base64) {
      input.audio = `data:${audioRef.mime || 'audio/mpeg'};base64,${audioRef.base64}`
    }
    if (payload.prompt) {
      if (isPVideo) input.prompt = payload.prompt
      else if (isAvatar) input.video_prompt = payload.prompt
      else {
        input.prompt = payload.prompt
        input.text = payload.prompt
      }
    }
    if (payload.resolution) input.resolution = payload.resolution
    if (payload.duration) input.duration = payload.duration
    if (payload.aspectRatio) input.aspect_ratio = payload.aspectRatio

    if (isPVideo) {
      if (payload.fps === 24 || payload.fps === 48) input.fps = payload.fps
      if (payload.draft) input.draft = payload.draft
    } else {
      if (payload.voice) input.voice = payload.voice
      if (payload.voiceLanguage) input.voice_language = payload.voiceLanguage
    }
    return input
  }

  private async processTask(task: any) {
    this.processing.add(task.taskId)
    const raw = getRawDb()

    logRun(raw, task.taskId, 'processing', 'Replicate task started processing')

    raw.prepare('UPDATE tasks SET status = ?, started_at = ?, updated_at = ? WHERE task_id = ?')
      .run('processing', Date.now(), Date.now(), task.taskId)

    this.emit('task:started', { taskId: task.taskId })

    try {
      const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})

      // Re-hydrate media from binary assets (base64 only lives in memory here)
      await hydratePayloadMedia(payload)

      let predictionId = task.predictionId || task.prediction_id || task.external_id || payload?.predictionId
      let prediction: Prediction | null = null

      if (predictionId) {
        logRun(raw, task.taskId, 'recovery', `Resuming existing prediction: ${predictionId}`)
      } else {
        const version = modelVersion(payload.model)
        // Pruna P-2 shares its input builder with the official Pruna provider
        const p2Kind = pVideo2Kind(payload.model)
        const input = p2Kind ? await buildPVideo2Input(p2Kind, payload, replicateMediaUri) : this.buildInput(payload)
        if (p2Kind) validatePVideo2Input(p2Kind, input, modelName(payload.model))
        if (!input.image && payload.model === 'prunaai/p-video-avatar') throw new Error('A portrait image is required for this model.')
        if (!input.prompt && !input.image && !input.audio && payload.model === 'prunaai/p-video') throw new Error('P-Video requires a prompt, image or audio.')
        if (!input.video && payload.model === 'philz1337x/crystal-video-upscaler') throw new Error('Crystal Upscaler requiere un video de referencia.')
        if ((!input.video || !input.audio) && isLipsync(payload.model)) throw new Error('Lipsync requiere un video y un audio de referencia.')

        logRun(raw, task.taskId, 'api-request', `Creating prediction: model=${modelName(payload.model)}, resolution=${payload.resolution || '720p'}`)
        prediction = await this.apiClient.createPrediction(version ? { version, input } : { model: apiModelId(payload.model), input })
        predictionId = prediction.id
        logRun(raw, task.taskId, 'api-response', `Prediction created: ${predictionId}`)

        payload.predictionId = predictionId
        raw.prepare('UPDATE tasks SET payload = ?, prediction_id = ?, external_id = ? WHERE task_id = ?')
          .run(JSON.stringify(redactPayload(payload)), predictionId, predictionId, task.taskId)
      }

      raw.prepare('UPDATE tasks SET updated_at = ? WHERE task_id = ?').run(Date.now(), task.taskId)
      logRun(raw, task.taskId, 'waiting', 'Polling prediction...')

      prediction = await this.poll(predictionId!, task.taskId)
      logRun(raw, task.taskId, 'completed', `Prediction succeeded in ${prediction.metrics?.predict_time?.toFixed(1)}s`)

      await this.handleSuccess(task, prediction)
    } catch (error: any) {
      logRun(getRawDb(), task.taskId, 'error', `Error: ${error.message}`, null, 'error')
      await this.handleError(task, error)
    } finally {
      this.processing.delete(task.taskId)
      this.processQueue()
    }
  }

  private async poll(predictionId: string, taskId: string): Promise<Prediction> {
    const raw = getRawDb()
    while (true) {
      const prediction = await this.apiClient.getPrediction(predictionId)
      this.emit('task:progress', { taskId, state: prediction.status })

      if (prediction.status === 'succeeded') return prediction
      if (prediction.status === 'failed') throw new RemoteJobFailedError(prediction.error || 'Prediction failed')
      if (prediction.status === 'canceled') throw new RemoteJobFailedError('Prediction canceled')

      raw.prepare('UPDATE tasks SET updated_at = ? WHERE task_id = ?').run(Date.now(), taskId)
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    }
  }

  private async handleSuccess(task: any, prediction: Prediction) {
    const raw = getRawDb()
    const assetId = crypto.randomUUID()
    const taskPayload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})

    const outputs = Array.isArray(prediction.output) ? prediction.output : prediction.output ? [prediction.output] : []
    const remoteUrl = outputs[0] || null

    let localAssetId: string | null = null

    const updatePlaceholder = (fields: Record<string, any>) => {
      const placeholder = raw.prepare('SELECT id FROM assets WHERE task_id = ? ORDER BY created_at ASC LIMIT 1').get(task.taskId) as any
      if (!placeholder) return null
      const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ')
      raw.prepare(`UPDATE assets SET ${sets}, updated_at = ? WHERE id = ?`)
        .run(...Object.values(fields), Date.now(), placeholder.id)
      return placeholder.id
    }

    const model = getReplicateModel(taskPayload?.model)
    let assetKind: 'image' | 'audio' | 'video' =
      task.type === 'image' || model?.type === 'image'
        ? 'image'
        : task.type === 'audio' || model?.type === 'audio'
        ? 'audio'
        : 'video'

    if (remoteUrl) {
      if (remoteUrl.match(/\.(png|jpg|jpeg|webp|avif)($|\?)/i)) {
        assetKind = 'image'
      } else if (remoteUrl.match(/\.(mp3|wav|ogg|m4a|aac|flac)($|\?)/i)) {
        assetKind = 'audio'
      } else if (remoteUrl.match(/\.(mp4|webm|mov|mkv)($|\?)/i)) {
        assetKind = 'video'
      }
    }

    if (remoteUrl) {
      const taskWs = task.workspace_id || getTaskWorkspace(task.taskId)
      const subDir = workspaceAssetSubDir(assetKind, taskWs)
      const defaultExt = assetKind === 'image' ? 'png' : assetKind === 'audio' ? 'mp3' : 'mp4'
      const defaultMime = assetKind === 'image' ? 'image/png' : assetKind === 'audio' ? 'audio/mpeg' : 'video/mp4'

      try {
        logRun(raw, task.taskId, 'download', `Downloading ${assetKind}: ${remoteUrl.substring(0, 80)}...`)
        const resp = await fetch(remoteUrl)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

        const contentType = resp.headers.get('content-type')?.split(';')[0]?.trim() || ''
        let ext = defaultExt
        let mime = defaultMime

        if (contentType.startsWith('image/')) {
          assetKind = 'image'
          mime = contentType
          ext = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/webp' ? 'webp' : 'png'
        } else if (contentType.startsWith('audio/')) {
          assetKind = 'audio'
          mime = contentType
          ext = contentType === 'audio/wav' || contentType === 'audio/x-wav' ? 'wav' : contentType === 'audio/ogg' ? 'ogg' : 'mp3'
        } else if (contentType.startsWith('video/')) {
          assetKind = 'video'
          mime = contentType
          ext = contentType === 'video/webm' ? 'webm' : 'mp4'
        }

        const fileName = `${assetId}.${ext}`
        const localPath = `${subDir}/${fileName}`

        const buffer = Buffer.from(await resp.arrayBuffer())
        await fs.mkdir(subDir, { recursive: true })
        await fs.writeFile(localPath, buffer)

        let fileSize = buffer.length
        if (assetKind === 'video') {
          try {
            const result = await ensurePlayableVideo(localPath)
            fileSize = result.size
          } catch {}
        }

        localAssetId = updatePlaceholder({
          file_path: remoteUrl,
          local_path: localPath,
          file_name: fileName,
          mime_type: mime,
          type: assetKind,
          model_used: taskPayload?.model || '',
          prompt: taskPayload?.prompt || '',
          parameters: JSON.stringify(redactPayload(taskPayload)),
          file_size: fileSize,
        })
      } catch (err: any) {
        logRun(raw, task.taskId, 'download-error', `Download failed: ${err.message}`, null, 'error')
        console.error('[ReplicateQueue] Failed to download asset:', err.message)
        localAssetId = updatePlaceholder({
          file_path: remoteUrl,
          file_name: `remote-${assetKind}-${assetId}`,
          mime_type: defaultMime,
          type: assetKind,
          model_used: taskPayload?.model || '',
          prompt: taskPayload?.prompt || '',
          parameters: JSON.stringify(redactPayload(taskPayload)),
        })
      }
    } else {
      logRun(raw, task.taskId, 'no-url', 'No output URL in prediction result', null, 'warn')
    }

    raw.prepare(
      'UPDATE tasks SET status = ?, result_asset_id = ?, progress = ?, completed_at = ?, updated_at = ? WHERE task_id = ?'
    ).run('completed', localAssetId, 100, Date.now(), Date.now(), task.taskId)

    raw.save()

    this.emit('task:completed', { taskId: task.taskId, assetId: localAssetId, output: outputs })
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

  async checkRemote(_task: any, predictionId: string): Promise<RemoteTaskStatus> {
    const prediction = await this.apiClient.getPrediction(predictionId)
    if (prediction.status === 'succeeded') return { state: 'completed', result: prediction }
    if (prediction.status === 'failed') return { state: 'failed', error: prediction.error || 'Prediction failed' }
    if (prediction.status === 'canceled') return { state: 'failed', error: 'Prediction canceled' }
    return { state: 'running', detail: prediction.status }
  }

  async completeRemote(task: any, result: Prediction): Promise<void> {
    await this.handleSuccess(task, result)
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const raw = getRawDb()
    const task = raw.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as any
    if (!task) return false
    const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})
    const predictionId = task.predictionId || task.prediction_id || task.external_id || payload?.predictionId
    if (predictionId) {
      try { await this.apiClient.cancelPrediction(predictionId) } catch {}
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
      const tasks = raw.prepare('SELECT * FROM tasks WHERE provider = ? AND status = ?').all('replicate', status) as any[]
      for (const task of tasks) {
        logRun(raw, task.taskId, 'recovery', 'Recovering interrupted Replicate task')
        this.processTask(task)
      }
    }
  }
}

let queueInstance: ReplicateQueue | null = null

export function getReplicateQueue(apiKey?: string): ReplicateQueue {
  if (!queueInstance) {
    if (!apiKey) throw new Error('Replicate API key not configured.')
    queueInstance = new ReplicateQueue(apiKey)
  }
  if (apiKey) queueInstance.setApiKey(apiKey)
  return queueInstance
}

export function initReplicateQueue(apiKey: string): ReplicateQueue {
  queueInstance = new ReplicateQueue(apiKey)
  return queueInstance
}

registerRecoverableProvider('replicate', () => {
  const key = readApiKey('replicateApiKey')
  return key ? getReplicateQueue(key) : null
})
