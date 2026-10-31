import { EventEmitter } from 'events'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import { getRawDb } from '../db'
import { getActiveWorkspaceId, workspaceAssetSubDir, getTaskWorkspace } from './workspace-service'
import { ensurePlayableVideo } from './asset-manager'
import { attachTaskNotifications } from './task-notifications'
import { redactPayload } from './payload-redact'
import { persistMediaToAssets, hydratePayloadMedia } from './media-persist'
import { FalApiClient, getFalModel, type FalImageResult, type FalVideoResult, type FalAudioResult, type FalResult, type FalRequestUrls } from './fal'
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

  private buildInput(payload: any): Record<string, any> {
    const model = getFalModel(payload.model)
    if (model?.type === 'image') return this.buildImageInput(payload, model)
    if (model?.type === 'audio') return this.buildAudioInput(payload)
    return this.buildVideoInput(payload)
  }

  private buildAudioInput(payload: any): Record<string, any> {
    const text = payload.prompt || payload.text || ''
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

  private buildVideoInput(payload: any): Record<string, any> {
    if (String(payload.model || '').startsWith('kling/v4/')) return this.buildKlingV4Input(payload)
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

registerRecoverableProvider('fal', () => {
  const key = readApiKey('falApiKey')
  return key ? getFalQueue(key) : null
})
