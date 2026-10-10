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
import { ApimartApiClient, getApimartModel, type ApimartTaskStatusResponse } from './apimart'
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

  async enqueue(type: string, payload: any): Promise<string> {
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
        const resumed = await this.pollTask(taskId, existingJobId)
        await this.handleSuccess(task, resumed)
        return
      }

      const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : task.payload
      const isImage = task.type === 'image' || payload?.mode === 'image' || payload?.type === 'image'

      const rawModel = payload?.model || ''
      const modelDef = getApimartModel(rawModel)
      const modelId = modelDef?.id || rawModel.replace(/^apimart\//, '').replace(/\/(t2v|i2v|fflf|ref|t2i|i2i|extend)$/, '').trim()

      if (!modelId) {
        throw new Error('APIMart error: Model ID is empty or invalid.')
      }

      logRun(raw, taskId, 'submit', `Submitting to APIMart: model=${modelId}, type=${isImage ? 'image' : 'video'}`, payload)

      let submitRes: any
      if (isImage) {
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

      const finalStatus = await this.pollTask(taskId, apimartTaskId)
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

  private async pollTask(taskId: string, apimartTaskId: string): Promise<ApimartTaskStatusResponse> {
    const raw = getRawDb()
    while (true) {
      const statusRes = await this.apiClient.getTaskStatus(apimartTaskId)
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
      const isImage = task.type === 'image' || taskPayload?.mode === 'image'
      const ext = isImage ? 'png' : 'mp4'
      const mime = isImage ? 'image/png' : 'video/mp4'
      const fileName = `${assetId}.${ext}`
      const taskWs = task.workspace_id || getTaskWorkspace(taskId)
      const subDir = workspaceAssetSubDir(isImage ? 'image' : 'video', taskWs)
      const localPath = `${subDir}/${fileName}`

      try {
        logRun(raw, taskId, 'download', `Downloading asset: ${remoteUrl.substring(0, 80)}...`)
        const buffer = await this.apiClient.downloadAsset(remoteUrl)
        await fs.mkdir(subDir, { recursive: true })
        await fs.writeFile(localPath, buffer)

        let fileSize = buffer.length
        if (!isImage) {
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
      const mime = isImage ? 'image/png' : 'video/mp4'
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

  async checkRemote(_task: any, apimartTaskId: string): Promise<RemoteTaskStatus> {
    const statusRes = await this.apiClient.getTaskStatus(apimartTaskId)
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
