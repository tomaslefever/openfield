import { EventEmitter } from 'events'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import { getRawDb } from '../db'
import { getActiveWorkspaceId, workspaceAssetSubDir, getTaskWorkspace } from './workspace-service'
import { ensurePlayableVideo } from './asset-manager'
import { attachTaskNotifications } from './task-notifications'
import { redactPayload } from './payload-redact'
import { persistMediaToAssets, hydratePayloadMedia } from './media-persist'
import {
  PrunaApiClient, getPrunaModel, pVideo2Kind, buildPVideo2Input, validatePVideo2Input, routePVideo2Model,
  type MediaRef, type PrunaStatusResponse,
} from './pruna'
import { registerRecoverableProvider, readApiKey, RemoteJobFailedError, forgetFailedJob, markPlaceholderFailed, canAutoResume, type RecoverableQueue, type RemoteTaskStatus } from './task-recovery'

const POLL_INTERVAL_MS = 3000
const MAX_RETRIES = 3

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac',
}

function logRun(raw: any, taskId: string, step: string, message: string, payload?: any, level = 'info', workspaceId?: string) {
  try {
    const ws = workspaceId || getTaskWorkspace(taskId)
    raw.prepare('INSERT INTO run_logs (id, task_id, step, level, message, payload, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), taskId, step, level, message, payload ? JSON.stringify(redactPayload(payload)) : null, ws, Date.now())
  } catch {}
}

export class PrunaQueue extends EventEmitter implements RecoverableQueue {
  private apiClient: PrunaApiClient
  readonly processing = new Set<string>()
  private coolingDown = new Set<string>()
  private maxConcurrent = 2

  constructor(apiKey: string) {
    super()
    this.apiClient = new PrunaApiClient(apiKey)
    attachTaskNotifications(this, 'Pruna')
  }

  setApiKey(apiKey: string) {
    this.apiClient.setApiKey(apiKey)
  }

  async enqueue(type: string, payload: any): Promise<string> {
    const taskId = crypto.randomUUID()
    const raw = getRawDb()
    const now = Date.now()
    const wsId = getActiveWorkspaceId()

    // Callers that name the base Pro model with references get the -reference variant
    if (payload?.model) payload = { ...payload, model: routePVideo2Model(payload.model, payload) }

    // Media is persisted as binary assets on disk; the DB only stores asset IDs.
    const storedPayload = redactPayload(await persistMediaToAssets(payload))

    logRun(raw, taskId, 'enqueue', `Pruna task enqueued: model=${payload?.model}`, undefined, 'info', wsId)

    raw.prepare(
      'INSERT INTO tasks (task_id, provider, status, type, payload, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(taskId, 'pruna', 'pending', 'video', JSON.stringify(storedPayload), wsId, now, now)

    // Optimistic placeholder asset
    raw.prepare(
      `INSERT INTO assets (id, type, file_path, local_path, file_name, mime_type, model_used, provider, prompt, parameters, credits_used, task_id, workspace_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(), 'video', '', '', `pending-${taskId}`, 'video/mp4',
      payload?.model || '', 'pruna', payload?.prompt || '', JSON.stringify(storedPayload),
      0, taskId, wsId, now, now
    )
    raw.save()

    this.emit('task:enqueued', { taskId, type: type || 'video' })
    this.processQueue()
    return taskId
  }

  async processQueue() {
    if (this.processing.size >= this.maxConcurrent) return
    const raw = getRawDb()
    const pending = raw.prepare('SELECT * FROM tasks WHERE provider = ? AND status = ? ORDER BY created_at ASC').all('pruna', 'pending')
    for (const task of pending) {
      const taskId = task.taskId || task.task_id
      if (this.processing.size >= this.maxConcurrent) break
      if (this.coolingDown.has(taskId)) continue
      if (!this.processing.has(taskId)) this.processTask(task)
    }
  }

  /**
   * Media as Pruna takes it: remote URLs as is, inline content uploaded to /v1/files.
   * Uploads are cached per task so a ref repeated in several fields goes up once.
   */
  private mediaResolver(taskId: string) {
    const uploads = new Map<string, Promise<string>>()
    let count = 0
    return async (ref: MediaRef, fallbackMime: string): Promise<string | null> => {
      if (!ref) return null
      if (!ref.base64) return typeof ref.url === 'string' && /^https?:\/\//.test(ref.url) ? ref.url : null
      const mime = ref.mime || fallbackMime
      const key = `${mime}:${ref.base64.length}:${ref.base64.slice(0, 64)}:${ref.base64.slice(-64)}`
      if (!uploads.has(key)) {
        const name = `input-${++count}.${EXT_BY_MIME[mime] || mime.split('/')[1] || 'bin'}`
        uploads.set(key, this.apiClient.uploadFile(Buffer.from(ref.base64, 'base64'), mime, name).then(url => {
          logRun(getRawDb(), taskId, 'upload', `Uploaded ${name} (${mime}) to Pruna`)
          return url
        }))
      }
      return uploads.get(key)!
    }
  }

  private async processTask(task: any) {
    const raw = getRawDb()
    const taskId = task.taskId || task.task_id
    this.processing.add(taskId)

    logRun(raw, taskId, 'processing', 'Pruna task started processing')

    raw.prepare('UPDATE tasks SET status = ?, started_at = ?, updated_at = ? WHERE task_id = ?')
      .run('processing', Date.now(), Date.now(), taskId)

    this.emit('task:started', { taskId })

    try {
      // Retry of an already-submitted task: resume the same prediction instead of resubmitting
      const existingJobId = task.requestId || task.externalId || task.request_id || task.external_id
      if (existingJobId) {
        logRun(raw, taskId, 'recovery', `Resuming existing Pruna prediction: ${existingJobId}`)
        const resumed = await this.pollPrediction(taskId, existingJobId)
        await this.handleSuccess(task, resumed)
        return
      }

      const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})
      const model = getPrunaModel(payload?.model)
      const kind = pVideo2Kind(payload?.model)
      if (!model || !kind) throw new Error(`Pruna: unsupported model "${payload?.model}"`)

      // Re-hydrate media from binary assets (base64 only lives in memory here)
      await hydratePayloadMedia(payload)

      const input = await buildPVideo2Input(kind, payload, this.mediaResolver(taskId))
      validatePVideo2Input(kind, input, model.name)

      logRun(raw, taskId, 'submit', `Submitting to Pruna: model=${model.apiModel}`, { input })
      const prediction = await this.apiClient.createPrediction(model.apiModel, input)
      const predictionId = prediction?.id
      if (!predictionId) throw new Error(`Pruna did not return a prediction id: ${JSON.stringify(prediction)}`)

      logRun(raw, taskId, 'submitted', `Pruna prediction id assigned: ${predictionId}`)
      raw.prepare('UPDATE tasks SET request_id = ?, external_id = ?, updated_at = ? WHERE task_id = ?')
        .run(predictionId, predictionId, Date.now(), taskId)

      const final = await this.pollPrediction(taskId, predictionId)
      await this.handleSuccess(task, final)
    } catch (err: any) {
      logRun(raw, taskId, 'error', `Task failed: ${err.message}`, null, 'error')
      forgetFailedJob(taskId, err)
      await this.handleFailure(task, err.message)
    } finally {
      this.processing.delete(taskId)
      this.processQueue()
    }
  }

  private async pollPrediction(taskId: string, predictionId: string): Promise<PrunaStatusResponse> {
    const raw = getRawDb()
    while (true) {
      const remote = await this.apiClient.getStatus(predictionId)
      this.emit('task:progress', { taskId, state: remote.status })

      if (remote.status === 'succeeded') return remote
      if (remote.status === 'failed') throw new RemoteJobFailedError(remote.error || remote.message || 'Pruna prediction failed')
      if (remote.status === 'canceled') throw new RemoteJobFailedError(remote.message || 'Pruna prediction canceled')

      raw.prepare('UPDATE tasks SET updated_at = ? WHERE task_id = ?').run(Date.now(), taskId)
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }
  }

  private async handleSuccess(task: any, remote: PrunaStatusResponse) {
    const raw = getRawDb()
    const taskId = task.taskId || task.task_id
    const taskPayload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})
    const fileId = crypto.randomUUID()
    const remoteUrl = remote.generation_url || null

    const updatePlaceholder = (fields: Record<string, any>) => {
      const placeholder = raw.prepare('SELECT id FROM assets WHERE task_id = ? ORDER BY created_at ASC LIMIT 1').get(taskId) as any
      if (!placeholder) return null
      const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ')
      raw.prepare(`UPDATE assets SET ${sets}, updated_at = ? WHERE id = ?`)
        .run(...Object.values(fields), Date.now(), placeholder.id)
      return placeholder.id
    }
    const common = {
      mime_type: 'video/mp4',
      model_used: taskPayload?.model || '',
      prompt: taskPayload?.prompt || '',
      parameters: JSON.stringify(redactPayload(taskPayload)),
    }

    let localAssetId: string | null = null
    if (remoteUrl) {
      try {
        // Delivery URLs need the API key and expire after 24 h: download right away
        logRun(raw, taskId, 'download', `Downloading asset: ${remoteUrl.substring(0, 80)}...`)
        const { buffer, contentType } = await this.apiClient.download(remoteUrl)
        const isImage = contentType.startsWith('image/')
        const kind = isImage ? 'image' : 'video'
        const ext = isImage ? (EXT_BY_MIME[contentType] || 'png') : 'mp4'
        const fileName = `${fileId}.${ext}`
        const subDir = workspaceAssetSubDir(kind, task.workspace_id || getTaskWorkspace(taskId))
        const localPath = `${subDir}/${fileName}`
        await fs.mkdir(subDir, { recursive: true })
        await fs.writeFile(localPath, buffer)
        let fileSize = buffer.length
        if (!isImage) {
          try { fileSize = (await ensurePlayableVideo(localPath)).size } catch {}
        }
        localAssetId = updatePlaceholder({
          ...common,
          type: kind,
          mime_type: isImage ? contentType : 'video/mp4',
          file_path: remoteUrl,
          local_path: localPath,
          file_name: fileName,
          file_size: fileSize,
        })
      } catch (err: any) {
        logRun(raw, taskId, 'download-error', `Download failed: ${err.message}`, null, 'error')
        console.error('[PrunaQueue] Failed to download asset:', err.message)
        localAssetId = updatePlaceholder({ ...common, file_path: remoteUrl, file_name: `remote-${fileId}` })
      }
    } else {
      logRun(raw, taskId, 'no-url', 'No generation_url in the Pruna result', null, 'warn')
      localAssetId = updatePlaceholder({ ...common, file_path: '', file_name: `completed-${fileId}` })
    }

    raw.prepare('UPDATE tasks SET status = ?, result_asset_id = ?, progress = ?, completed_at = ?, updated_at = ? WHERE task_id = ?')
      .run('completed', localAssetId, 100, Date.now(), Date.now(), taskId)
    raw.save()

    logRun(raw, taskId, 'completed', 'Pruna task completed successfully', { assetId: localAssetId })
    this.emit('task:completed', { taskId, assetId: localAssetId, result: remote })
  }

  private async handleFailure(task: any, errorMessage: string) {
    const raw = getRawDb()
    const taskId = task.taskId || task.task_id
    const retryCount = (task.retryCount ?? task.retry_count ?? 0) + 1

    const lower = errorMessage.toLowerCase()
    const isNonRetryable =
      /\((400|401|402|403|404|410|422)\b/.test(errorMessage) ||
      lower.includes('unsupported') ||
      lower.includes('invalid') ||
      lower.includes('requiere')

    // Only resume an accepted job; never resubmit (see canAutoResume)
    if (retryCount <= MAX_RETRIES && !isNonRetryable && canAutoResume(taskId)) {
      logRun(raw, taskId, 'retry', `Retrying task (attempt ${retryCount}/${MAX_RETRIES}): ${errorMessage}`, null, 'warn')
      raw.prepare('UPDATE tasks SET status = ?, retry_count = ?, error_message = ?, updated_at = ? WHERE task_id = ?')
        .run('pending', retryCount, errorMessage, Date.now(), taskId)
      this.coolingDown.add(taskId)
      setTimeout(() => {
        this.coolingDown.delete(taskId)
        this.processQueue()
      }, 5000 * retryCount)
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

  async checkRemote(_task: any, predictionId: string): Promise<RemoteTaskStatus> {
    const remote = await this.apiClient.getStatus(predictionId)
    if (remote.status === 'succeeded') return { state: 'completed', result: remote }
    if (remote.status === 'failed' || remote.status === 'canceled') {
      return { state: 'failed', error: remote.error || remote.message || `Pruna prediction ${remote.status}` }
    }
    return { state: 'running', detail: remote.status }
  }

  async completeRemote(task: any, result: PrunaStatusResponse): Promise<void> {
    await this.handleSuccess(task, result)
  }

  /** P-API has no cancel endpoint: the task is dropped locally */
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
let globalQueue: PrunaQueue | null = null

export function getPrunaQueue(apiKey: string): PrunaQueue {
  if (!globalQueue) {
    globalQueue = new PrunaQueue(apiKey)
  } else {
    globalQueue.setApiKey(apiKey)
  }
  return globalQueue
}

registerRecoverableProvider('pruna', () => {
  const key = readApiKey('prunaApiKey')
  return key ? getPrunaQueue(key) : null
})
