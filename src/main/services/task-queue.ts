import { EventEmitter } from 'events'
import { getRawDb, getAssetSubDir } from '../db'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import { KieApiClient } from './kie-api'
import { ensurePlayableVideo } from './asset-manager'

export function extractUrls(resultJson: any): string[] {
  if (!resultJson) return []
  try {
    if (typeof resultJson === 'string') resultJson = JSON.parse(resultJson)
  } catch {}

  if (Array.isArray(resultJson)) {
    return resultJson.filter((u: any) => typeof u === 'string' && u.startsWith('http'))
  }

  // Try common field names for result URLs
  const fields = ['resultUrls', 'resultUrl', 'urls', 'url', 'videoUrl', 'video_url', 'outputUrl', 'output_url', 'downloadUrl', 'download_url', 'fileUrl', 'file_url']
  for (const field of fields) {
    if (resultJson[field] != null) {
      const val = resultJson[field]
      if (Array.isArray(val)) return val.filter((u: any) => typeof u === 'string' && u.startsWith('http'))
      if (typeof val === 'string' && val.startsWith('http')) return [val]
    }
  }

  // Try nested objects
  if (resultJson.data && typeof resultJson.data === 'object') {
    for (const field of fields) {
      if (resultJson.data[field] != null) {
        const val = resultJson.data[field]
        if (Array.isArray(val)) return val.filter((u: any) => typeof u === 'string' && u.startsWith('http'))
        if (typeof val === 'string' && val.startsWith('http')) return [val]
      }
    }
  }

  return []
}

function logRun(raw: any, taskId: string, step: string, message: string, payload?: any, level = 'info') {
  try {
    raw.prepare('INSERT INTO run_logs (id, task_id, step, level, message, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), taskId, step, level, message, payload ? JSON.stringify(payload) : null, Date.now())
    raw.save()
  } catch {}
}

export class TaskQueue extends EventEmitter {
  private apiClient: KieApiClient
  private processing = new Set<string>()
  private maxConcurrent = 3

  constructor(apiKey: string) {
    super()
    this.apiClient = new KieApiClient(apiKey)
  }

  setApiKey(apiKey: string) {
    this.apiClient = new KieApiClient(apiKey)
  }
  async enqueue(type: string, payload: any): Promise<string> {
    const taskId = crypto.randomUUID()
    const raw = getRawDb()
    const now = Date.now()

    logRun(raw, taskId, 'enqueue', `Task enqueued: type=${type}`, { type, model: payload?.model, prompt: payload?.prompt?.substring(0, 100), hasImage: !!payload?.imageBase64, imageLen: payload?.imageBase64?.length || 0 })

    raw.prepare(
      'INSERT INTO kie_tasks (task_id, status, type, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(taskId, 'pending', type, JSON.stringify(payload), now, now)

    // Create optimistic placeholder asset immediately
    const assetId = crypto.randomUUID()
    raw.prepare(
      `INSERT INTO assets (id, type, file_path, local_path, file_name, mime_type, model_used, prompt, parameters, credits_used, task_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      assetId, type, '', '', `pending-${taskId}`, type === 'image' ? 'image/png' : 'video/mp4',
      payload?.model || '', payload?.prompt || '', JSON.stringify(payload || {}),
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
    const pending = raw.prepare('SELECT * FROM kie_tasks WHERE status = ? ORDER BY created_at ASC').all('pending')
    for (const task of pending) {
      if (this.processing.size >= this.maxConcurrent) break
      if (!this.processing.has(task.taskId)) this.processTask(task)
    }
  }

  private async processTask(task: any) {
    this.processing.add(task.taskId)
    const raw = getRawDb()

    logRun(raw, task.taskId, 'processing', 'Task started processing')

    raw.prepare('UPDATE kie_tasks SET status = ?, started_at = ?, updated_at = ? WHERE task_id = ?')
      .run('processing', Date.now(), Date.now(), task.taskId)

    this.emit('task:started', { taskId: task.taskId })

    try {
      const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : task.payload

      // If we already have a KIE task ID (recovery), skip creation and poll directly
      let kieTaskId = task.kieTaskId || payload?.kieTaskId
      if (kieTaskId) {
        logRun(raw, task.taskId, 'recovery', `Resuming existing KIE task: ${kieTaskId}`)
      } else {
        logRun(raw, task.taskId, 'api-request', `Sending to KIE: model=${payload?.model || 'unknown'}, prompt=${(payload?.prompt || '').substring(0, 100)}, hasImage=${!!payload?.imageBase64}`, payload)

        if (task.type === 'image') {
          kieTaskId = await this.apiClient.generateImage(payload || {})
        } else if (task.type === 'video') {
          kieTaskId = await this.apiClient.generateVideo(payload || {})
        } else {
          throw new Error(`Unsupported task type: ${task.type}`)
        }

        logRun(raw, task.taskId, 'api-response', `KIE task created: ${kieTaskId}`)

        // Store KIE task ID in dedicated column and payload for recovery
        payload.kieTaskId = kieTaskId
        raw.prepare('UPDATE kie_tasks SET payload = ?, kie_task_id = ? WHERE task_id = ?')
          .run(JSON.stringify(payload), kieTaskId, task.taskId)
      }

      raw.prepare('UPDATE kie_tasks SET updated_at = ? WHERE task_id = ?').run(Date.now(), task.taskId)

      logRun(raw, task.taskId, 'waiting', 'Polling KIE for completion...')

      const result = await this.apiClient.waitForCompletion(kieTaskId, (state, progress) => {
        this.emit('task:progress', { taskId: task.taskId, state, progress })
      })

      logRun(raw, task.taskId, 'completed', `Generation done. State=${result.state}, Credits=${result.creditsConsumed}`)

      await this.handleSuccess(task, result, kieTaskId)
    } catch (error: any) {
      logRun(getRawDb(), task.taskId, 'error', `Error: ${error.message}`, null, 'error')
      await this.handleError(task, error)
    } finally {
      this.processing.delete(task.taskId)
      this.processQueue()
    }
  }

  private async handleSuccess(task: any, result: any, kieTaskId: string) {
    const raw = getRawDb()
    const assetId = crypto.randomUUID()
    const taskPayload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})

    const resultUrls = extractUrls(result.resultJson)

    let localAssetId: string | null = null

    if (resultUrls.length > 0) {
      const type = task.type as 'image' | 'video'
      const ext = type === 'video' ? '.mp4' : '.png'
      const fileName = `${assetId}${ext}`
      const subDir = getAssetSubDir(type)
      const localPath = `${subDir}/${fileName}`
      const url = resultUrls[0]

      try {
        logRun(raw, task.taskId, 'download', `Downloading ${type}: ${url.substring(0, 80)}...`)
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const buffer = Buffer.from(await resp.arrayBuffer())
        await fs.mkdir(subDir, { recursive: true })
        await fs.writeFile(localPath, buffer)

        // For videos, ensure h264 encoding for browser playback
        let fileSize = buffer.length
        let mime = type === 'image' ? 'image/png' : 'video/mp4'
        if (type === 'video') {
          try {
            const result = await ensurePlayableVideo(localPath)
            fileSize = result.size
          } catch {}
        }

        localAssetId = assetId

        // Find the placeholder asset for this task
        const placeholder = raw.prepare('SELECT id FROM assets WHERE task_id = ? AND file_path = ? LIMIT 1').get(task.taskId, '') as any

        if (placeholder) {
          // Update placeholder with real data (keep original ID)
          raw.prepare(
            `UPDATE assets SET file_path = ?, local_path = ?, file_name = ?, mime_type = ?, model_used = ?, prompt = ?, parameters = ?, file_size = ?, credits_used = ?, updated_at = ? WHERE id = ?`
          ).run(
            url, localPath, fileName, mime,
            taskPayload?.model || result.model || '',
            taskPayload?.prompt || '',
            JSON.stringify(taskPayload),
            fileSize,
            result.creditsConsumed || 0,
            Date.now(),
            placeholder.id
          )
          localAssetId = placeholder.id
        } else {
          raw.prepare(
            `INSERT INTO assets (id, type, file_path, local_path, file_name, mime_type, model_used, prompt, parameters, file_size, credits_used, task_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            assetId, type, url, localPath, fileName, mime,
            taskPayload?.model || result.model || '',
            taskPayload?.prompt || '',
            JSON.stringify(taskPayload),
            fileSize,
            result.creditsConsumed || 0,
            task.taskId, Date.now(), Date.now()
          )
        }
      } catch (err: any) {
        logRun(raw, task.taskId, 'download-error', `Download failed: ${err.message}`, null, 'error')
        console.error('Failed to download asset:', err)
      }
    } else {
      logRun(raw, task.taskId, 'no-url', `No result URL found in resultJson: ${JSON.stringify(result.resultJson).substring(0, 200)}`, null, 'warn')
    }

    raw.prepare(
      'UPDATE kie_tasks SET status = ?, result_asset_id = ?, credits_used = ?, progress = ?, completed_at = ?, updated_at = ? WHERE task_id = ?'
    ).run('completed', localAssetId, result.creditsConsumed || 0, 100, Date.now(), Date.now(), task.taskId)

    raw.save()

    this.emit('task:completed', {
      taskId: task.taskId,
      assetId: localAssetId,
      creditsConsumed: result.creditsConsumed || 0,
      resultUrls,
    })
  }

  private async handleError(task: any, error: Error) {
    const raw = getRawDb()
    const retryCount = (task.retryCount || 0) + 1

    // Mark placeholder asset as errored
    raw.prepare('UPDATE assets SET file_path = ?, updated_at = ? WHERE task_id = ? AND file_path = ?')
      .run(`__error__:${error.message}`, Date.now(), task.taskId, '')

    if (retryCount <= 3) {
      raw.prepare('UPDATE kie_tasks SET status = ?, retry_count = ?, error_message = ?, updated_at = ? WHERE task_id = ?')
        .run('pending', retryCount, error.message, Date.now(), task.taskId)
      this.emit('task:retry', { taskId: task.taskId, attempt: retryCount, error: error.message })
      setTimeout(() => this.processQueue(), 5000 * retryCount)
    } else {
      raw.prepare('UPDATE kie_tasks SET status = ?, error_message = ?, updated_at = ? WHERE task_id = ?')
        .run('failed', error.message, Date.now(), task.taskId)
      this.emit('task:failed', { taskId: task.taskId, error: error.message })
    }
    raw.save()
  }

  async getCreditBalance(): Promise<number> {
    try { return await this.apiClient.getAccountCredits() }
    catch { return -1 }
  }

  async recoverPendingTasks() {
    const raw = getRawDb()
    const processing = raw.prepare('SELECT * FROM kie_tasks WHERE status = ?').all('processing') as any[]
    for (const task of processing) {
      logRun(raw, task.taskId, 'recovery', 'Recovering interrupted task')
      this.processTask(task)
    }
    const pending = raw.prepare('SELECT * FROM kie_tasks WHERE status = ?').all('pending') as any[]
    for (const task of pending) {
      logRun(raw, task.taskId, 'recovery', 'Recovering pending task')
      this.processTask(task)
    }
  }

  getEstimatedCost(modelId: string, duration?: number): number {
    return this.apiClient.getEstimatedCost(modelId, duration)
  }

  async cancelTask(taskId: string) {
    const raw = getRawDb()
    raw.prepare('UPDATE kie_tasks SET status = ?, updated_at = ? WHERE task_id = ?').run('cancelled', Date.now(), taskId)
    this.processing.delete(taskId)
    this.emit('task:cancelled', { taskId })
  }

  async retryTask(taskId: string) {
    const raw = getRawDb()
    raw.prepare('UPDATE kie_tasks SET status = ?, retry_count = 0, error_message = NULL, updated_at = ? WHERE task_id = ?')
      .run('pending', Date.now(), taskId)
    this.processQueue()
  }
}

let instance: TaskQueue | null = null

export function getTaskQueue(apiKey?: string): TaskQueue {
  if (!instance && apiKey) instance = new TaskQueue(apiKey)
  else if (instance && apiKey) instance.setApiKey(apiKey)
  if (!instance) throw new Error('TaskQueue not initialized')
  return instance
}

export function initTaskQueue(apiKey: string): TaskQueue {
  instance = new TaskQueue(apiKey)
  return instance
}
