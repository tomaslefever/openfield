import { EventEmitter } from 'events'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import * as syncFs from 'fs'
import { getRawDb } from '../db'
import { getActiveWorkspaceId, workspaceAssetSubDir, getTaskWorkspace } from './workspace-service'
import { ensurePlayableVideo } from './asset-manager'
import { attachTaskNotifications } from './task-notifications'
import { redactPayload } from './payload-redact'
import { persistMediaToAssets } from './media-persist'
import { ApimartApiClient, getApimartModel, APIMART_MODE_SUFFIX_RE, type ApimartTaskStatusResponse, type ApimartModelDef } from './apimart'
import { registerRecoverableProvider, readApiKey, RemoteJobFailedError, forgetFailedJob, markPlaceholderFailed, canAutoResume, type RecoverableQueue, type RemoteTaskStatus } from './task-recovery'
import { resolveAssetFileForUpload, prepareUploadFile } from './asset-file'

const POLL_INTERVAL_MS = 2000
const MAX_RETRIES = 3

function logRun(raw: any, taskId: string, step: string, message: string, payload?: any, level = 'info', workspaceId?: string) {
  try {
    const ws = workspaceId || getTaskWorkspace(taskId)
    raw.prepare('INSERT INTO run_logs (id, task_id, step, level, message, payload, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), taskId, step, level, message, payload ? JSON.stringify(redactPayload(payload)) : null, ws, Date.now())
  } catch {}
}

const HTTP_RE = /^https?:\/\//i

function clampInt(value: any, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function hasAny(payload: any, keys: string[]): boolean {
  return keys.some((k) => !!payload?.[k])
}

const FIRST_FRAME_KEYS = ['firstFrameUrl', 'firstFrameBase64', 'firstFrameAssetId']
const LAST_FRAME_KEYS = ['lastFrameUrl', 'lastFrameBase64', 'lastFrameAssetId']

/** Media for the per-model builders: images are uploaded to APIMart, video/audio must be public URLs. */
interface ApimartMedia {
  firstFrame: string | null
  lastFrame: string | null
  /** Reference images (excludes explicit first/last frames). */
  images: string[]
  videos: string[]
  audios: string[]
  hasExplicitFirst: boolean
  hasExplicitLast: boolean
}

export class ApimartQueue extends EventEmitter implements RecoverableQueue {
  private apiClient: ApimartApiClient
  readonly processing = new Set<string>()
  private coolingDown = new Set<string>()
  private uploadCache = new Map<string, string>()
  private maxConcurrent = 2

  constructor(apiKey: string) {
    super()
    this.apiClient = new ApimartApiClient(apiKey)
    attachTaskNotifications(this, 'APIMart')
  }

  setApiKey(apiKey: string) {
    this.apiClient.setApiKey(apiKey)
  }

  async enqueue(requestedType: string, payload: any): Promise<string> {
    // Flow Music models are audio tasks whatever the caller passed
    const type = getApimartModel(payload?.model)?.type === 'audio' ? 'audio' : requestedType
    const taskId = crypto.randomUUID()
    const raw = getRawDb()
    const now = Date.now()
    const wsId = getActiveWorkspaceId()

    // Media is persisted as binary assets on disk; the DB only stores asset IDs.
    const storedPayload = redactPayload(await persistMediaToAssets(payload))

    logRun(raw, taskId, 'enqueue', `APIMart task enqueued: model=${payload?.model}, mode=${payload?.mode}`, undefined, 'info', wsId)

    raw.prepare(
      'INSERT INTO tasks (task_id, provider, status, type, payload, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(taskId, 'apimart', 'pending', type, JSON.stringify(storedPayload), wsId, now, now)

    // Optimistic placeholder asset
    const assetId = crypto.randomUUID()
    const isImage = type === 'image'
    const isAudio = type === 'audio'
    const assetType = isImage ? 'image' : isAudio ? 'audio' : 'video'
    const mimeType = isImage ? 'image/png' : isAudio ? 'audio/mpeg' : 'video/mp4'
    raw.prepare(
      `INSERT INTO assets (id, type, file_path, local_path, file_name, mime_type, model_used, provider, prompt, parameters, credits_used, task_id, workspace_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      assetId, assetType, '', '', `pending-${taskId}`, mimeType,
      payload?.model || '', 'apimart', payload?.prompt || '', JSON.stringify(storedPayload),
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
    const pending = raw.prepare('SELECT * FROM tasks WHERE provider = ? AND status = ? ORDER BY created_at ASC').all('apimart', 'pending')
    for (const task of pending) {
      const taskId = task.taskId || task.task_id
      if (this.processing.size >= this.maxConcurrent) break
      if (this.coolingDown.has(taskId)) continue
      if (!this.processing.has(taskId)) this.processTask(task)
    }
  }

  private async resolveSource(source?: string, assetId?: string, defaultMime = 'image/png'): Promise<string | null> {
    const raw = getRawDb()
    let resolvedSource = source
    let mime = defaultMime

    const file = assetId ? await resolveAssetFileForUpload(assetId) : null
    if (file) {
      resolvedSource = file.path
      mime = file.mime || defaultMime
    }

    if (!resolvedSource) return null

    // Check upload cache
    const cacheKey = assetId || (resolvedSource.length < 500 ? resolvedSource : null)
    if (cacheKey && this.uploadCache.has(cacheKey)) {
      return this.uploadCache.get(cacheKey)!
    }

    const trimmed = resolvedSource.trim()
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed
    }

    try {
      if (!trimmed.startsWith('data:') && syncFs.existsSync(trimmed)) {
        const prepared = await prepareUploadFile(trimmed, mime)
        resolvedSource = prepared.path
        mime = prepared.mime || mime
      }
      const uploadedUrl = await this.apiClient.uploadImage(resolvedSource, mime)
      if (cacheKey) this.uploadCache.set(cacheKey, uploadedUrl)
      return uploadedUrl
    } catch (e: any) {
      console.warn('[ApimartQueue] Failed to upload source image:', e.message)
      return null
    }
  }

  private async processTask(task: any) {
    const raw = getRawDb()
    const taskId = task.taskId || task.task_id
    this.processing.add(taskId)

    logRun(raw, taskId, 'processing', 'APIMart task started processing')

    raw.prepare('UPDATE tasks SET status = ?, started_at = ?, updated_at = ? WHERE task_id = ?')
      .run('processing', Date.now(), Date.now(), taskId)

    this.emit('task:started', { taskId })

    try {
      // Retry of an already-submitted task: resume the same APIMart job instead of resubmitting
      const existingJobId = task.requestId || task.externalId
      if (existingJobId) {
        logRun(raw, taskId, 'recovery', `Resuming existing APIMart task: ${existingJobId}`)
        const resumed = await this.pollTask(taskId, existingJobId, task)
        await this.handleSuccess(task, resumed)
        return
      }

      const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : task.payload
      const isImage = task.type === 'image' || payload?.mode === 'image' || payload?.type === 'image'

      const rawModel = payload?.model || ''
      const modelDef = getApimartModel(rawModel)
      const modelId = modelDef?.id || rawModel.replace(/^apimart\//, '').replace(APIMART_MODE_SUFFIX_RE, '').trim()
      const modeSuffix = (String(rawModel).match(APIMART_MODE_SUFFIX_RE)?.[1] || '').toLowerCase()

      if (!modelId) {
        throw new Error('APIMart error: Model ID is empty or invalid.')
      }

      logRun(raw, taskId, 'submit', `Submitting to APIMart: model=${modelId}, type=${task.type === 'audio' ? 'audio' : isImage ? 'image' : 'video'}${modeSuffix ? `, mode=${modeSuffix}` : ''}`, payload)

      let submitRes: any
      if (modelDef?.builder) {
        // Models with a documented per-model request shape (added 2026-11)
        const body = await this.buildModelRequest(modelDef, modeSuffix, payload)
        logRun(raw, taskId, 'submit-body', `APIMart ${modelDef.builder} request`, body)
        submitRes = modelDef.builder === 'flowmusic'
          ? await this.apiClient.generateMusic(body)
          : modelDef.type === 'image'
            ? await this.apiClient.generateImage(body)
            : await this.apiClient.generateVideo(body)
      } else if (isImage) {
        // Collect reference images if any
        const imageUrls: string[] = []
        if (payload.imageBase64 || payload.imageAssetId || payload.imageUrl) {
          const u = await this.resolveSource(payload.imageUrl || payload.imageBase64, payload.imageAssetId, payload.imageMime || 'image/png')
          if (u) imageUrls.push(u)
        }
        if (payload.imageRefs && Array.isArray(payload.imageRefs)) {
          for (const ref of payload.imageRefs) {
            const u = await this.resolveSource(ref.url || ref.base64 || ref.localPath, ref.assetId, ref.mime || 'image/png')
            if (u && !imageUrls.includes(u)) imageUrls.push(u)
          }
        }

        const size = payload.aspectRatio || payload.aspect_ratio || payload.size || '1:1'
        const resolution = payload.resolution || '1K'

        submitRes = await this.apiClient.generateImage({
          model: modelId,
          prompt: payload.prompt || '',
          size: size === 'auto' ? '1:1' : size,
          resolution,
          n: 1,
          ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
        })
      } else {
        // Video task
        const imageUrls: string[] = []
        if (payload.firstFrameBase64 || payload.firstFrameAssetId || payload.firstFrameUrl) {
          const u = await this.resolveSource(payload.firstFrameUrl || payload.firstFrameBase64, payload.firstFrameAssetId, 'image/png')
          if (u) imageUrls.push(u)
        } else if (payload.imageBase64 || payload.imageAssetId || payload.imageUrl) {
          const u = await this.resolveSource(payload.imageUrl || payload.imageBase64, payload.imageAssetId, 'image/png')
          if (u) imageUrls.push(u)
        }

        if (payload.lastFrameBase64 || payload.lastFrameAssetId || payload.lastFrameUrl) {
          const u = await this.resolveSource(payload.lastFrameUrl || payload.lastFrameBase64, payload.lastFrameAssetId, 'image/png')
          if (u) imageUrls.push(u)
        }

        if (payload.imageRefs && Array.isArray(payload.imageRefs)) {
          for (const ref of payload.imageRefs) {
            const u = await this.resolveSource(ref.url || ref.base64 || ref.localPath, ref.assetId, ref.mime || 'image/png')
            if (u && !imageUrls.includes(u)) imageUrls.push(u)
          }
        }

        let duration = payload.duration ? Number(payload.duration) : 5
        if (modelDef?.durationMax && duration > modelDef.durationMax) {
          duration = modelDef.durationMax
        }

        let mode = payload.mode
        if (!mode) {
          const resStr = String(payload.resolution || '').toLowerCase()
          if (resStr.includes('4k')) mode = '4k'
          else if (resStr.includes('pro') || resStr.includes('1080')) mode = 'pro'
          else mode = 'std'
        }

        submitRes = await this.apiClient.generateVideo({
          model: modelId,
          prompt: payload.prompt || '',
          mode,
          duration,
          aspect_ratio: payload.aspectRatio || payload.aspect_ratio || '16:9',
          audio: payload.sound != null ? Boolean(payload.sound) : (payload.audio != null ? Boolean(payload.audio) : false),
          ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
        })
      }

      const apimartTaskId = submitRes?.data?.[0]?.task_id || submitRes?.data?.[0]?.id || submitRes?.task_id || submitRes?.id

      if (!apimartTaskId) {
        throw new Error(`APIMart did not return a valid task_id: ${JSON.stringify(submitRes)}`)
      }

      logRun(raw, taskId, 'submitted', `APIMart task_id assigned: ${apimartTaskId}`)

      raw.prepare('UPDATE tasks SET request_id = ?, external_id = ?, updated_at = ? WHERE task_id = ?')
        .run(apimartTaskId, apimartTaskId, Date.now(), taskId)

      const finalStatus = await this.pollTask(taskId, apimartTaskId, task)
      await this.handleSuccess(task, finalStatus)
    } catch (err: any) {
      logRun(raw, taskId, 'error', `Task failed: ${err.message}`, null, 'error')
      forgetFailedJob(taskId, err)
      await this.handleFailure(task, err.message)
    } finally {
      this.processing.delete(taskId)
      this.processQueue()
    }
  }

  /**
   * Video and audio references: APIMart only offers an image upload endpoint, so these must
   * already be public URLs (a pasted https URL, or an asset whose provider URL is still stored).
   */
  private resolveRemoteMedia(ref: any, kind: 'video' | 'audio'): string {
    const src = typeof ref === 'string' ? ref : ref?.url
    if (typeof src === 'string' && HTTP_RE.test(src.trim())) return src.trim()
    const assetId = typeof ref === 'object' ? ref?.assetId : undefined
    if (assetId) {
      try {
        const asset = getRawDb().prepare('SELECT file_path FROM assets WHERE id = ?').get(assetId) as any
        const fp = asset?.filePath ?? asset?.file_path
        if (typeof fp === 'string' && HTTP_RE.test(fp)) return fp
      } catch {}
    }
    throw new Error(
      kind === 'video'
        ? 'APIMart necesita una URL pública para el video de referencia (su API solo permite subir imágenes). Usa un video generado por un proveedor o una URL https.'
        : 'APIMart necesita una URL pública para el audio de referencia (su API solo permite subir imágenes). Usa un audio generado por un proveedor o una URL https.'
    )
  }

  private async collectMedia(payload: any): Promise<ApimartMedia> {
    const hasExplicitFirst = hasAny(payload, FIRST_FRAME_KEYS)
    const hasExplicitLast = hasAny(payload, LAST_FRAME_KEYS)

    const firstFrame = hasExplicitFirst
      ? await this.resolveSource(payload.firstFrameUrl || payload.firstFrameBase64, payload.firstFrameAssetId, 'image/png')
      : null
    if (hasExplicitFirst && !firstFrame) throw new Error('APIMart: no se pudo subir el primer fotograma.')
    const lastFrame = hasExplicitLast
      ? await this.resolveSource(payload.lastFrameUrl || payload.lastFrameBase64, payload.lastFrameAssetId, 'image/png')
      : null
    if (hasExplicitLast && !lastFrame) throw new Error('APIMart: no se pudo subir el último fotograma.')

    const images: string[] = []
    const pushImage = (u: string | null) => {
      if (u && u !== firstFrame && u !== lastFrame && !images.includes(u)) images.push(u)
    }
    const refs = Array.isArray(payload.imageRefs) ? payload.imageRefs : []
    for (const ref of refs) {
      pushImage(await this.resolveSource(ref?.url || ref?.base64 || ref?.localPath, ref?.assetId, ref?.mime || 'image/png'))
    }
    // The composer duplicates imageRefs[0] into imageBase64; only use it when there are no refs
    if (refs.length === 0 && (payload.imageBase64 || payload.imageAssetId || payload.imageUrl)) {
      pushImage(await this.resolveSource(payload.imageUrl || payload.imageBase64, payload.imageAssetId, payload.imageMime || 'image/png'))
    }
    if (Array.isArray(payload.image_urls)) {
      for (const u of payload.image_urls) if (typeof u === 'string' && HTTP_RE.test(u)) pushImage(u)
    }

    const videoSources: any[] = [
      ...(Array.isArray(payload.videoRefs) ? payload.videoRefs : []),
      ...(Array.isArray(payload.video_urls) ? payload.video_urls : []),
      ...(payload.videoUrl ? [payload.videoUrl] : []),
      ...(payload.video_url ? [payload.video_url] : []),
    ]
    const videos: string[] = []
    for (const v of videoSources) {
      const u = this.resolveRemoteMedia(v, 'video')
      if (!videos.includes(u)) videos.push(u)
    }

    const audioSources: any[] = [
      ...(Array.isArray(payload.audioRefs) ? payload.audioRefs : []),
      ...(Array.isArray(payload.audio_urls) ? payload.audio_urls : []),
    ]
    const audios: string[] = []
    for (const a of audioSources) {
      const u = this.resolveRemoteMedia(a, 'audio')
      if (!audios.includes(u)) audios.push(u)
    }

    return { firstFrame, lastFrame, images, videos, audios, hasExplicitFirst, hasExplicitLast }
  }

  /** Request body for models with a `builder` in the catalog. Only documented fields are sent. */
  private async buildModelRequest(modelDef: ApimartModelDef, modeSuffix: string, payload: any): Promise<any> {
    const prompt = String(payload?.prompt || '').trim()
    const aspect = String(payload?.aspectRatio || payload?.aspect_ratio || payload?.size || '').trim()
    const resStr = String(payload?.resolution || '').trim().toLowerCase()
    const apiModel = modelDef.apiModel || modelDef.id

    switch (modelDef.builder) {
      case 'flowmusic': {
        // docs.apimart.ai/en/api-reference/audios/flow-music/music-lyria-3-5
        const lyrics = String(payload?.lyrics || '').trim()
        const soundPrompt = String(payload?.soundPrompt || payload?.style || prompt).trim()
        if (!soundPrompt && !lyrics) throw new Error('Lyria 3.5 necesita un prompt de estilo o una letra.')
        const length = payload?.duration ?? payload?.length
        const bpm = Math.round(Number(payload?.bpm))
        return {
          model: apiModel,
          version: modelDef.apiVersion,
          ...(soundPrompt ? { sound_prompt: soundPrompt } : {}),
          ...(lyrics ? { lyrics } : {}),
          ...(payload?.title ? { title: String(payload.title).slice(0, 200) } : {}),
          ...(Number.isFinite(bpm) && bpm >= 1 ? { bpm: String(bpm) } : {}),
          ...(length != null && Number.isFinite(Number(length)) ? { length: clampInt(length, 1, 240, 60) } : {}),
          ...(payload?.seed != null && payload.seed !== '' ? { seed: String(payload.seed) } : {}),
        }
      }

      case 'nano-banana-2.1': {
        // docs.apimart.ai/en/api-reference/images/gemini-nano-banana-2.1/generation
        const media = await this.collectMedia(payload)
        const images = [media.firstFrame, ...media.images].filter((u): u is string => !!u)
        const resolution = resStr.includes('4k') ? '4K' : resStr.includes('2k') ? '2K' : '1K'
        const allowed = modelDef.aspectRatios || []
        return {
          model: apiModel,
          prompt,
          size: allowed.includes(aspect) ? aspect : 'auto',
          resolution,
          n: 1,
          ...(images.length > 0 ? { image_urls: images.slice(0, 14) } : {}),
        }
      }

      case 'flux-3': {
        // docs.apimart.ai/en/api-reference/images/flux-3-image(-klein)/generation
        const media = await this.collectMedia(payload)
        const images = [media.firstFrame, ...media.images].filter((u): u is string => !!u)
        const resolutions = modelDef.resolutions || []
        const resolution = resolutions.includes(resStr) ? resStr : '1k'
        const allowed = modelDef.aspectRatios || []
        const isKlein = modelDef.id === 'flux-3-image-klein'
        const seed = Math.round(Number(payload?.seed))
        return {
          model: apiModel,
          prompt,
          aspect_ratio: allowed.includes(aspect) ? aspect : 'auto',
          resolution,
          n: 1,
          ...(images.length > 0 ? { image_urls: images.slice(0, 10) } : {}),
          ...(isKlein && payload?.seed != null && Number.isFinite(seed) ? { seed } : {}),
        }
      }

      case 'veo-official': {
        // docs.apimart.ai/en/api-reference/videos/veo3/generation-official
        const media = await this.collectMedia(payload)
        // A single attached image (no FF toggle) is used as the first frame
        const firstFrame = media.firstFrame || media.images[0] || null
        if (media.videos.length > 0 || media.audios.length > 0) {
          throw new Error('Veo 3.1 (APIMart) no acepta videos ni audios de referencia.')
        }
        const requested = clampInt(payload?.duration, 4, 8, 8)
        const duration = requested <= 4 ? 4 : requested <= 6 ? 6 : 8
        const resolution = resStr.includes('4k') ? '4K' : resStr.includes('1080') ? '1080p' : '720p'
        const generateAudio = payload?.sound != null ? Boolean(payload.sound) : payload?.audio != null ? Boolean(payload.audio) : false
        const negative = String(payload?.negativePrompt || payload?.negative_prompt || '').trim()
        const seed = Math.round(Number(payload?.seed))
        if (!prompt) throw new Error('Veo 3.1 necesita un prompt.')
        return {
          model: apiModel,
          prompt,
          duration,
          aspect_ratio: aspect === '9:16' ? '9:16' : '16:9',
          resolution,
          generate_audio: generateAudio,
          ...(firstFrame ? { first_frame_image: firstFrame } : {}),
          ...(media.lastFrame && firstFrame ? { last_frame_image: media.lastFrame } : {}),
          ...(negative ? { negative_prompt: negative } : {}),
          ...(payload?.seed != null && Number.isFinite(seed) ? { seed } : {}),
        }
      }

      case 'kling-v4': {
        // docs.apimart.ai/en/api-reference/videos/kling-v4/generation
        const media = await this.collectMedia(payload)
        const resolution = resStr.includes('1080') ? '1080p' : '720p'
        const duration = clampInt(payload?.duration, 3, 30, 5)
        const baseAspects = ['16:9', '9:16', '1:1', '21:9']

        if (modeSuffix === 'edit' || modeSuffix === 'extend') {
          if (media.videos.length === 0) throw new Error(`Kling V4 ${modeSuffix === 'edit' ? 'Edit' : 'Extend'} necesita un video de origen.`)
          if (!prompt) throw new Error('Kling V4 necesita un prompt para editar o extender un video.')
          if (modeSuffix === 'edit') {
            // Duration and aspect ratio follow the input video; original audio is kept by default
            const editImages = [media.firstFrame, ...media.images].filter((u): u is string => !!u).slice(0, 10)
            return {
              model: apiModel,
              prompt,
              omni_reference_task_type: 'edit',
              video_url: media.videos[0],
              resolution,
              ...(editImages.length > 0 ? { image_urls: editImages } : {}),
            }
          }
          return {
            model: apiModel,
            prompt,
            omni_reference_task_type: 'extend',
            video_url: media.videos[0],
            duration,
            resolution,
            ...(media.lastFrame ? { last_frame_image: media.lastFrame } : {}),
          }
        }

        // Like KIE Kling 4.0: one image and nothing else is a first frame (image-to-video)
        const singleImage = !media.hasExplicitFirst && !media.hasExplicitLast && media.images.length === 1 && media.videos.length === 0 && media.audios.length === 0
        if (singleImage) {
          return {
            model: apiModel,
            ...(prompt ? { prompt } : {}),
            duration,
            resolution,
            image_with_roles: [{ url: media.images[0], role: 'first_frame' }],
          }
        }

        if (media.hasExplicitFirst || media.hasExplicitLast) {
          if (!media.firstFrame) throw new Error('Kling V4: el último fotograma necesita también un primer fotograma.')
          if (media.videos.length > 0 || media.audios.length > 0) {
            throw new Error('Kling V4: los fotogramas inicial/final no se pueden combinar con videos o audios de referencia.')
          }
          // Other attached images become intermediate keyframes (max 8, 10 images in total)
          const keyframes = media.images.slice(0, 8)
          return {
            model: apiModel,
            ...(prompt ? { prompt } : {}),
            duration,
            resolution,
            image_with_roles: [
              { url: media.firstFrame, role: 'first_frame' },
              ...keyframes.map((url) => ({ url, role: 'keyframe' })),
              ...(media.lastFrame ? [{ url: media.lastFrame, role: 'last_frame' }] : []),
            ],
          }
        }

        const refImages = media.images.slice(0, 10)
        const refVideos = media.videos.slice(0, 5)
        const refAudios = media.audios.slice(0, 3)
        if (refImages.length + refVideos.length + refAudios.length > 0) {
          if (!prompt) throw new Error('Kling V4 necesita un prompt en modo referencias.')
          if (refImages.length + refVideos.length + refAudios.length > 15) {
            throw new Error('Kling V4 admite como máximo 15 referencias en total (imágenes, videos y audios).')
          }
          return {
            model: apiModel,
            prompt,
            omni_reference_task_type: 'reference',
            duration,
            resolution,
            aspect_ratio: [...baseAspects, 'auto'].includes(aspect) ? aspect : 'auto',
            ...(refImages.length > 0 ? { image_with_roles: refImages.map((url) => ({ url, role: 'reference_image' })) } : {}),
            ...(refVideos.length > 0 ? { video_urls: refVideos } : {}),
            ...(refAudios.length > 0 ? { audio_urls: refAudios } : {}),
          }
        }

        if (!prompt) throw new Error('Kling V4 necesita un prompt.')
        return {
          model: apiModel,
          prompt,
          duration,
          resolution,
          aspect_ratio: baseAspects.includes(aspect) ? aspect : '16:9',
        }
      }

      case 'vidu-q4': {
        // docs.apimart.ai/en/api-reference/videos/vidu-q4-preview/generation
        const media = await this.collectMedia(payload)
        if (media.lastFrame) throw new Error('Vidu Q4 no admite último fotograma.')
        if (media.videos.length > 0) throw new Error('Vidu Q4 no admite videos de referencia.')
        const duration = clampInt(payload?.duration, 3, 16, 5)
        const resolutions: Record<string, string> = { '540p': '540p', '720p': '720p', '1080p': '1080p', '2k': '2K', '4k': '4K' }
        const resolution = resolutions[resStr] || '720p'
        const audio = payload?.sound != null ? Boolean(payload.sound) : true
        const seed = Math.round(Number(payload?.seed))
        const common = {
          model: apiModel,
          duration,
          resolution,
          audio,
          ...(payload?.seed != null && Number.isFinite(seed) ? { seed } : {}),
        }

        if (media.firstFrame) {
          if (media.images.length > 0 || media.audios.length > 0) {
            throw new Error('Vidu Q4: el primer fotograma no se puede combinar con otras imágenes o audios de referencia.')
          }
          return { ...common, ...(prompt ? { prompt } : {}), first_frame_image: media.firstFrame }
        }
        // Like KIE Vidu Q4: one image without audio is image-to-video; 2+ images or audio are references
        if (media.images.length === 1 && media.audios.length === 0) {
          return { ...common, ...(prompt ? { prompt } : {}), first_frame_image: media.images[0] }
        }

        if (media.images.length === 0) throw new Error('Vidu Q4 necesita al menos una imagen (no tiene texto a video).')
        if (!prompt) throw new Error('Vidu Q4 necesita un prompt en modo referencias.')
        return {
          ...common,
          prompt,
          aspect_ratio: (modelDef.aspectRatios || []).includes(aspect) ? aspect : '16:9',
          image_with_roles: media.images.slice(0, 15).map((url) => ({ url, role: 'reference_image' })),
          ...(media.audios.length > 0 ? { audio_urls: media.audios.slice(0, 3) } : {}),
        }
      }

      case 'minimax-h3-max': {
        // docs.apimart.ai/en/api-reference/videos/minimax-h3/max
        const media = await this.collectMedia(payload)
        if (!prompt) throw new Error('MiniMax H3 Max necesita un prompt.')
        const duration = clampInt(payload?.duration, 5, 15, 5)
        const resolution = resStr.includes('1080') ? '1080P' : resStr.includes('480') ? '480P' : '768P'
        const aspects = modelDef.aspectRatios || []
        const common = { model: apiModel, prompt: prompt.slice(0, 7000), duration, resolution }

        if (media.firstFrame || media.lastFrame) {
          if (media.videos.length > 0 || media.audios.length > 0) {
            throw new Error('MiniMax H3 Max: los fotogramas no se pueden combinar con videos o audios de referencia.')
          }
          return {
            ...common,
            ...(media.firstFrame ? { first_frame_image: media.firstFrame } : {}),
            ...(media.lastFrame ? { last_frame_image: media.lastFrame } : {}),
          }
        }

        // Like MachGen MiniMax H3: one image and nothing else is a first frame
        if (media.images.length === 1 && media.videos.length === 0 && media.audios.length === 0) {
          return { ...common, first_frame_image: media.images[0] }
        }

        const refImages = media.images.slice(0, 9)
        const refVideos = media.videos.slice(0, 3)
        const refAudios = media.audios.slice(0, 3)
        if (refAudios.length > 0 && refImages.length === 0 && refVideos.length === 0) {
          throw new Error('MiniMax H3 Max: el audio de referencia necesita al menos una imagen o un video.')
        }
        if (refImages.length + refVideos.length + refAudios.length > 0) {
          return {
            ...common,
            ...(aspects.includes(aspect) ? { aspect_ratio: aspect } : {}),
            ...(refImages.length > 0 ? { image_urls: refImages } : {}),
            ...(refVideos.length > 0 ? { video_urls: refVideos } : {}),
            ...(refAudios.length > 0 ? { audio_urls: refAudios } : {}),
          }
        }
        return { ...common, aspect_ratio: aspects.includes(aspect) ? aspect : '16:9' }
      }

      default:
        throw new Error(`APIMart: builder desconocido para ${modelDef.id}`)
    }
  }

  private async getStatus(task: any, apimartTaskId: string): Promise<ApimartTaskStatusResponse> {
    // Flow Music tasks have their own query endpoint
    if (task?.type === 'audio') {
      return (await this.apiClient.getMusicTaskStatus(apimartTaskId)) as unknown as ApimartTaskStatusResponse
    }
    return this.apiClient.getTaskStatus(apimartTaskId)
  }

  private async pollTask(taskId: string, apimartTaskId: string, task?: any): Promise<ApimartTaskStatusResponse> {
    const raw = getRawDb()
    while (true) {
      const statusRes = await this.getStatus(task, apimartTaskId)
      const data = statusRes.data || (statusRes as any)
      const status = data.status || statusRes.status

      this.emit('task:progress', {
        taskId,
        state: status,
        progress: data.progress,
      })

      if (status === 'completed' || status === 'SUCCESS') {
        return statusRes
      }

      if (status === 'failed' || status === 'FAILED') {
        const msg = data.error?.message || data.fail_reason || statusRes.error?.message || 'APIMart task failed'
        throw new RemoteJobFailedError(msg)
      }

      if (status === 'cancelled') {
        throw new Error('APIMart task was cancelled')
      }

      raw.prepare('UPDATE tasks SET updated_at = ? WHERE task_id = ?').run(Date.now(), taskId)
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }
  }

  private extractOutputUrl(statusRes: ApimartTaskStatusResponse): string | null {
    const data = statusRes.data || (statusRes as any)
    const result = data.result || statusRes.result

    if (!result) return null

    // Check images
    if (result.images && Array.isArray(result.images) && result.images.length > 0) {
      const item = result.images[0]
      if (typeof item === 'string') return item
      if (item?.url) {
        return Array.isArray(item.url) ? item.url[0] : item.url
      }
    }

    // Check videos
    if (result.videos && Array.isArray(result.videos) && result.videos.length > 0) {
      const item = result.videos[0]
      if (typeof item === 'string') return item
      if (item?.url) {
        return Array.isArray(item.url) ? item.url[0] : item.url
      }
    }

    // Flow Music: result.music[0].audio_url (m4a); wav_url as fallback
    if (Array.isArray(result.music) && result.music.length > 0) {
      const item = result.music[0]
      if (typeof item === 'string') return item
      if (item?.audio_url) return item.audio_url
      if (item?.wav_url) return item.wav_url
    }

    if (result.url) {
      return Array.isArray(result.url) ? result.url[0] : result.url
    }

    return null
  }

  private async handleSuccess(task: any, statusRes: ApimartTaskStatusResponse) {
    const raw = getRawDb()
    const taskId = task.taskId || task.task_id
    const taskPayload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})
    const assetId = crypto.randomUUID()
    const remoteUrl = this.extractOutputUrl(statusRes)

    const updatePlaceholder = (fields: Record<string, any>) => {
      const placeholder = raw.prepare('SELECT id FROM assets WHERE task_id = ? ORDER BY created_at ASC LIMIT 1').get(taskId) as any
      if (!placeholder) return null
      const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ')
      raw.prepare(`UPDATE assets SET ${sets}, updated_at = ? WHERE id = ?`)
        .run(...Object.values(fields), Date.now(), placeholder.id)
      return placeholder.id
    }

    let localAssetId: string | null = null

    if (remoteUrl) {
      const isAudio = task.type === 'audio'
      const isImage = !isAudio && (task.type === 'image' || taskPayload?.mode === 'image')
      const isWav = isAudio && /\.wav(\?|$)/i.test(remoteUrl)
      const ext = isImage ? 'png' : isAudio ? (isWav ? 'wav' : 'm4a') : 'mp4'
      const mime = isImage ? 'image/png' : isAudio ? (isWav ? 'audio/wav' : 'audio/mp4') : 'video/mp4'
      const fileName = `${assetId}.${ext}`
      const taskWs = task.workspace_id || getTaskWorkspace(taskId)
      const subDir = workspaceAssetSubDir(isImage ? 'image' : isAudio ? 'audio' : 'video', taskWs)
      const localPath = `${subDir}/${fileName}`

      try {
        logRun(raw, taskId, 'download', `Downloading asset: ${remoteUrl.substring(0, 80)}...`)
        const buffer = await this.apiClient.downloadAsset(remoteUrl)
        await fs.mkdir(subDir, { recursive: true })
        await fs.writeFile(localPath, buffer)

        let fileSize = buffer.length
        if (!isImage && !isAudio) {
          try {
            const res = await ensurePlayableVideo(localPath)
            fileSize = res.size
          } catch {}
        }

        localAssetId = updatePlaceholder({
          file_path: remoteUrl,
          local_path: localPath,
          file_name: fileName,
          mime_type: mime,
          model_used: taskPayload?.model || '',
          prompt: taskPayload?.prompt || '',
          parameters: JSON.stringify(redactPayload(taskPayload)),
          file_size: fileSize,
        })
      } catch (err: any) {
        logRun(raw, taskId, 'download-error', `Download failed: ${err.message}`, null, 'error')
        console.error('[ApimartQueue] Failed to download asset:', err.message)
        localAssetId = updatePlaceholder({
          file_path: remoteUrl,
          file_name: `remote-${assetId}`,
          mime_type: mime,
          model_used: taskPayload?.model || '',
          prompt: taskPayload?.prompt || '',
          parameters: JSON.stringify(redactPayload(taskPayload)),
        })
      }
    } else {
      const isImage = task.type === 'image'
      const mime = isImage ? 'image/png' : task.type === 'audio' ? 'audio/mp4' : 'video/mp4'
      localAssetId = updatePlaceholder({
        file_path: '',
        file_name: `completed-${assetId}`,
        mime_type: mime,
        model_used: taskPayload?.model || '',
        prompt: taskPayload?.prompt || '',
        parameters: JSON.stringify(redactPayload(taskPayload)),
      })
    }

    raw.prepare(
      'UPDATE tasks SET status = ?, result_asset_id = ?, completed_at = ?, updated_at = ? WHERE task_id = ?'
    ).run('completed', localAssetId, Date.now(), Date.now(), taskId)
    raw.save()

    logRun(raw, taskId, 'completed', 'APIMart task completed successfully', { assetId: localAssetId })
    this.emit('task:completed', { taskId, assetId: localAssetId, result: statusRes })
  }

  private async handleFailure(task: any, errorMessage: string) {
    const raw = getRawDb()
    const taskId = task.taskId || task.task_id
    const retryCount = (task.retryCount ?? task.retry_count ?? 0) + 1

    const isNonRetryable =
      errorMessage.includes('400') ||
      errorMessage.includes('401') ||
      errorMessage.includes('403') ||
      errorMessage.includes('404') ||
      errorMessage.includes('422') ||
      errorMessage.toLowerCase().includes('validation') ||
      errorMessage.toLowerCase().includes('unsupported') ||
      errorMessage.toLowerCase().includes('invalid')

    // Only resume an accepted job; never resubmit (see canAutoResume)
    if (retryCount <= MAX_RETRIES && !isNonRetryable && canAutoResume(taskId)) {
      logRun(raw, taskId, 'retry', `Retrying task (attempt ${retryCount}/${MAX_RETRIES}): ${errorMessage}`, null, 'warn')
      raw.prepare('UPDATE tasks SET status = ?, retry_count = ?, error_message = ?, updated_at = ? WHERE task_id = ?')
        .run('pending', retryCount, errorMessage, Date.now(), taskId)
      this.coolingDown.add(taskId)
      setTimeout(() => {
        this.coolingDown.delete(taskId)
        this.processQueue()
      }, 5000)
    } else {
      logRun(raw, taskId, 'failed', `Task permanently failed: ${errorMessage}`, null, 'error')
      raw.prepare('UPDATE tasks SET status = ?, error_message = ?, updated_at = ? WHERE task_id = ?')
        .run('failed', errorMessage, Date.now(), taskId)
      markPlaceholderFailed(taskId, errorMessage)
      this.emit('task:failed', { taskId, error: errorMessage })
    }
    raw.save()
  }

  // ─── RecoverableQueue (see task-recovery.ts) ─────────────────

  async checkRemote(task: any, apimartTaskId: string): Promise<RemoteTaskStatus> {
    const statusRes = await this.getStatus(task, apimartTaskId)
    const data = statusRes.data || (statusRes as any)
    const status = data.status || statusRes.status
    if (status === 'completed' || status === 'SUCCESS') return { state: 'completed', result: statusRes }
    if (status === 'failed' || status === 'FAILED') {
      return { state: 'failed', error: data.error?.message || data.fail_reason || statusRes.error?.message || 'APIMart task failed' }
    }
    if (status === 'cancelled') return { state: 'failed', error: 'APIMart task was cancelled' }
    return { state: 'running', detail: status, progress: data.progress }
  }

  async completeRemote(task: any, result: ApimartTaskStatusResponse): Promise<void> {
    await this.handleSuccess(task, result)
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const raw = getRawDb()
    raw.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE task_id = ?').run('cancelled', Date.now(), taskId)
    markPlaceholderFailed(taskId, 'Cancelled by user')
    raw.save()
    this.processing.delete(taskId)
    this.emit('task:failed', { taskId, error: 'Cancelled by user' })
    return true
  }
}

// Global queue singleton
let globalQueue: ApimartQueue | null = null

export function getApimartQueue(apiKey: string): ApimartQueue {
  if (!globalQueue) {
    globalQueue = new ApimartQueue(apiKey)
  } else {
    globalQueue.setApiKey(apiKey)
  }
  return globalQueue
}

registerRecoverableProvider('apimart', () => {
  const key = readApiKey('apimartApiKey')
  return key ? getApimartQueue(key) : null
})
