import { EventEmitter } from 'events'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import { getRawDb, getAssetSubDir } from '../db'
import { ensurePlayableVideo } from './asset-manager'
import { FalApiClient, getFalModel, type FalVideoResult } from './fal'

const POLL_INTERVAL_MS = 2000
const MAX_RETRIES = 3

function logRun(raw: any, taskId: string, step: string, message: string, payload?: any, level = 'info') {
  try {
    raw.prepare('INSERT INTO run_logs (id, task_id, step, level, message, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), taskId, step, level, message, payload ? JSON.stringify(payload) : null, Date.now())
  } catch {}
}

export class FalQueue extends EventEmitter {
  private apiClient: FalApiClient
  private processing = new Set<string>()
  private maxConcurrent = 2

  constructor(apiKey: string) {
    super()
    this.apiClient = new FalApiClient(apiKey)
  }

  setApiKey(apiKey: string) {
    this.apiClient = new FalApiClient(apiKey)
  }

  async enqueue(type: string, payload: any): Promise<string> {
    const taskId = crypto.randomUUID()
    const raw = getRawDb()
    const now = Date.now()

    logRun(raw, taskId, 'enqueue', `fal.ai task enqueued: model=${payload?.model}, hasImage=${!!payload?.imageBase64}`)

    raw.prepare(
      'INSERT INTO fal_tasks (task_id, status, type, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(taskId, 'pending', type, JSON.stringify(payload), now, now)

    // Optimistic placeholder asset
    const assetId = crypto.randomUUID()
    raw.prepare(
      `INSERT INTO assets (id, type, file_path, local_path, file_name, mime_type, model_used, prompt, parameters, credits_used, task_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      assetId, type, '', '', `pending-${taskId}`, 'video/mp4',
      payload?.model || '', payload?.prompt || '', JSON.stringify(payload),
      0, taskId, now, now
    )
    raw.save()

    this.emit('task:enqueued', { taskId, type, assetId })
    this.processQueue()
    return taskId
  }

  private async processQueue() {
    if (this.processing.size >= this.maxConcurrent) return
    const raw = getRawDb()
    const pending = raw.prepare('SELECT * FROM fal_tasks WHERE status = ? ORDER BY created_at ASC').all('pending')
    for (const task of pending) {
      if (this.processing.size >= this.maxConcurrent) break
      if (!this.processing.has(task.taskId)) this.processTask(task)
    }
  }

  private buildInput(payload: any): Record<string, any> {
    const input: Record<string, any> = {
      prompt: payload.prompt || '',
      duration: payload.duration || 5,
      resolution: payload.resolution || '2K',
      aspect_ratio: payload.aspectRatio || 'adaptive',
    }
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
    return input
  }

  private async processTask(task: any) {
    this.processing.add(task.taskId)
    const raw = getRawDb()

    logRun(raw, task.taskId, 'processing', 'fal.ai task started processing')

    raw.prepare('UPDATE fal_tasks SET status = ?, started_at = ?, updated_at = ? WHERE task_id = ?')
      .run('processing', Date.now(), Date.now(), task.taskId)

    this.emit('task:started', { taskId: task.taskId })

    try {
      const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})

      let requestId = task.requestId || payload?.requestId

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
        raw.prepare('UPDATE fal_tasks SET payload = ?, request_id = ? WHERE task_id = ?')
          .run(JSON.stringify(payload), requestId, task.taskId)
      }

      raw.prepare('UPDATE fal_tasks SET updated_at = ? WHERE task_id = ?').run(Date.now(), task.taskId)
      logRun(raw, task.taskId, 'waiting', 'Polling queue status...')

      const result = await this.poll(payload.model, requestId!, task.taskId)
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

  private async poll(modelId: string, requestId: string, taskId: string): Promise<FalVideoResult> {
    const raw = getRawDb()
    while (true) {
      const status = await this.apiClient.getRequestStatus(modelId, requestId)
      this.emit('task:progress', { taskId, state: status.status, queuePosition: status.queue_position })

      if (status.status === 'COMPLETED') {
        return this.apiClient.getRequestResult(modelId, requestId)
      }

      raw.prepare('UPDATE fal_tasks SET updated_at = ? WHERE task_id = ?').run(Date.now(), taskId)
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    }
  }

  private async handleSuccess(task: any, result: FalVideoResult) {
    const raw = getRawDb()
    const assetId = crypto.randomUUID()
    const taskPayload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})

    const remoteUrl = result.video?.url || null

    const updatePlaceholder = (fields: Record<string, any>) => {
      const placeholder = raw.prepare('SELECT id FROM assets WHERE task_id = ? AND file_path = ? LIMIT 1').get(task.taskId, '') as any
      if (!placeholder) return null
      const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ')
      raw.prepare(`UPDATE assets SET ${sets}, updated_at = ? WHERE id = ?`)
        .run(...Object.values(fields), Date.now(), placeholder.id)
      return placeholder.id
    }

    let localAssetId: string | null = null

    if (remoteUrl) {
      const fileName = `${assetId}.mp4`
      const subDir = getAssetSubDir('video')
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
          parameters: JSON.stringify(taskPayload),
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
          parameters: JSON.stringify(taskPayload),
        })
      }
    } else {
      logRun(raw, task.taskId, 'no-url', 'No output video URL in result', null, 'warn')
    }

    raw.prepare(
      'UPDATE fal_tasks SET status = ?, result_asset_id = ?, progress = ?, completed_at = ?, updated_at = ? WHERE task_id = ?'
    ).run('completed', localAssetId, 100, Date.now(), Date.now(), task.taskId)

    raw.save()

    this.emit('task:completed', { taskId: task.taskId, assetId: localAssetId, output: remoteUrl })
  }

  private async handleError(task: any, error: Error) {
    const raw = getRawDb()
    const retryCount = (task.retryCount || 0) + 1

    raw.prepare('UPDATE assets SET file_path = ?, updated_at = ? WHERE task_id = ? AND file_path = ?')
      .run(`__error__:${error.message}`, Date.now(), task.taskId, '')

    if (retryCount <= MAX_RETRIES) {
      raw.prepare('UPDATE fal_tasks SET status = ?, retry_count = ?, error_message = ?, updated_at = ? WHERE task_id = ?')
        .run('pending', retryCount, error.message, Date.now(), task.taskId)
      this.emit('task:retry', { taskId: task.taskId, attempt: retryCount, error: error.message })
      setTimeout(() => this.processQueue(), 5000 * retryCount)
    } else {
      raw.prepare('UPDATE fal_tasks SET status = ?, error_message = ?, updated_at = ? WHERE task_id = ?')
        .run('failed', error.message, Date.now(), task.taskId)
      this.emit('task:failed', { taskId: task.taskId, error: error.message })
    }
    raw.save()
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const raw = getRawDb()
    const task = raw.prepare('SELECT * FROM fal_tasks WHERE task_id = ?').get(taskId) as any
    if (!task) return false
    const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})
    const requestId = task.requestId || payload?.requestId
    if (requestId && payload?.model) {
      try { await this.apiClient.cancelRequest(payload.model, requestId) } catch {}
    }
    raw.prepare('UPDATE fal_tasks SET status = ?, error_message = ?, updated_at = ? WHERE task_id = ?')
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
      const tasks = raw.prepare('SELECT * FROM fal_tasks WHERE status = ?').all(status) as any[]
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
