import { EventEmitter } from 'events'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import { getRawDb } from '../db'
import { getActiveWorkspaceId, workspaceAssetSubDir, getTaskWorkspace } from './workspace-service'
import { ensurePlayableVideo } from './asset-manager'
import { attachTaskNotifications } from './task-notifications'
import { redactPayload } from './payload-redact'
import { persistMediaToAssets, hydratePayloadMedia } from './media-persist'
import { ReplicateApiClient, REPLICATE_MODELS, getReplicateModel, type Prediction } from './replicate'
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
  const entry = REPLICATE_MODELS.find(m => m.id === modelId)
  return entry?.version || ''
}

/** The owner/name Replicate expects for a catalog id */
function apiModelId(modelId: string): string {
  const entry = REPLICATE_MODELS.find(m => m.id === modelId)
  return entry?.apiModel || modelId
}

function isLipsync(modelId: string): boolean {
  return (modelId || '').startsWith('sync/lipsync')
}

/** Inline data URI, or the remote URL a ref already has (Replicate fetches it) */
async function replicateMediaUri(ref: MediaRef, fallbackMime: string): Promise<string | null> {
  if (ref?.base64) return `data:${ref.mime || fallbackMime};base64,${ref.base64}`
  return typeof ref?.url === 'string' && /^https?:\/\//.test(ref.url) ? ref.url : null
}

function modelName(modelId: string): string {
  const entry = REPLICATE_MODELS.find(m => m.id === modelId)
  return entry?.name || modelId
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

  private buildInput(payload: any): Record<string, any> {
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
