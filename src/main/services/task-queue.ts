import { EventEmitter } from 'events'
import { getRawDb } from '../db'
import { getActiveWorkspaceId, workspaceAssetSubDir, getTaskWorkspace } from './workspace-service'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import { OpenfieldApiClient } from './kie'
import { ensurePlayableVideo, ensureImageWebp, getAssetManager } from './asset-manager'
import { attachTaskNotifications } from './task-notifications'
import * as path from 'path'

export function extractUrls(resultJson: any): string[] {
  if (!resultJson) return []
  try {
    if (typeof resultJson === 'string') resultJson = JSON.parse(resultJson)
  } catch {}

  if (Array.isArray(resultJson)) {
    return resultJson.filter((u: any) => typeof u === 'string' && u.startsWith('http'))
  }

  // Try common field names for result URLs
  const fields = ['resultUrls', 'resultUrl', 'urls', 'url', 'imageUrls', 'imageUrl', 'image_url', 'videoUrl', 'video_url', 'outputUrl', 'output_url', 'downloadUrl', 'download_url', 'fileUrl', 'file_url', 'src', 'images']
  for (const field of fields) {
    if (resultJson[field] != null) {
      const val = resultJson[field]
      if (Array.isArray(val)) {
        const urls = val.filter((u: any) => typeof u === 'string' && u.startsWith('http'))
        if (urls.length > 0) return urls
      }
      if (typeof val === 'string' && val.startsWith('http')) return [val]
    }
  }

  // Try nested objects (data, result, output, images)
  const nestedKeys = ['data', 'result', 'output', 'images', 'results']
  for (const nk of nestedKeys) {
    const nested = resultJson[nk]
    if (nested && typeof nested === 'object') {
      if (Array.isArray(nested)) {
        const urls = nested.filter((u: any) => typeof u === 'string' && u.startsWith('http'))
        if (urls.length > 0) return urls
      }
      for (const field of fields) {
        if (nested[field] != null) {
          const val = nested[field]
          if (Array.isArray(val)) {
            const urls = val.filter((u: any) => typeof u === 'string' && u.startsWith('http'))
            if (urls.length > 0) return urls
          }
          if (typeof val === 'string' && val.startsWith('http')) return [val]
        }
      }
    }
  }

  // Last resort: recursive scan for URL-like strings without full stringify
  const collectUrls = (obj: any, depth: number): string[] => {
    if (depth > 10 || !obj) return []
    if (typeof obj === 'string' && obj.startsWith('http')) return [obj]
    if (Array.isArray(obj)) return obj.slice(0, 100).flatMap(x => collectUrls(x, depth + 1))
    if (typeof obj === 'object') {
      const vals = Object.values(obj)
      if (vals.length > 50) return [] // skip large objects likely containing binary data
      return vals.flatMap(x => collectUrls(x, depth + 1))
    }
    return []
  }
  const foundUrls = collectUrls(resultJson, 0)
  if (foundUrls.length > 0) {
    const filtered = foundUrls.filter(u => !u.includes('api.kie.ai') && !u.includes('kai.iekie'))
    if (filtered.length > 0) return [filtered[0]]
  }

  return []
}

function stripForStorage(payload: any): any {
  if (!payload || typeof payload !== 'object') return payload
  if (Array.isArray(payload)) return payload.map(stripForStorage)
  const cleaned: any = {}
  for (const [k, v] of Object.entries(payload)) {
    // Strip base64 but keep asset IDs (refs are now saved to disk in enqueue)
    if (k === 'imageBase64' || k === 'firstFrameBase64' || k === 'lastFrameBase64') {
      cleaned[k] = '' // cleared — use imageAssetId / firstFrameAssetId / lastFrameAssetId
    } else if (k === 'imageRefs' && Array.isArray(v)) {
      cleaned[k] = (v as any[]).map((r: any) => {
        const s: any = { name: r.name, refType: r.refType, mime: r.mime }
        if (r.assetId) s.assetId = r.assetId
        // Keep base64 only if no assetId (backward compat)
        if (!r.assetId && r.base64) s.base64 = r.base64
        return s
      })
    } else if (k === 'videoRefs' && Array.isArray(v)) {
      cleaned[k] = (v as any[]).map((r: any) => ({
        name: r.name,
        mime: r.mime,
        assetId: r.assetId,
        url: r.url,
        localPath: r.localPath,
        duration: r.duration,
        ...(!r.assetId && r.base64 ? { base64: r.base64 } : {}),
      }))
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      cleaned[k] = stripForStorage(v)
    } else {
      cleaned[k] = v
    }
  }
  return cleaned
}

export { stripForStorage }

// Build the parameters JSON persisted on assets: strip base64 but keep asset IDs.
// Backfills assetIds saved at enqueue time so recreate can reload refs even for
// tasks enqueued before assetIds were persisted in openfield_tasks.payload.
function buildStoredParams(taskPayload: any, raw: any, taskId: string, extraParams?: Record<string, any>): string {
  const base = stripForStorage(taskPayload)
  if (extraParams) {
    Object.assign(base, extraParams)
  }
  try {
    const placeholder = raw.prepare('SELECT parameters FROM assets WHERE task_id = ? ORDER BY created_at ASC LIMIT 1').get(taskId) as any
    if (placeholder?.parameters) {
      const existing = JSON.parse(placeholder.parameters)
      for (const k of ['imageAssetId', 'firstFrameAssetId', 'lastFrameAssetId']) {
        if (existing[k] && !base[k]) base[k] = existing[k]
      }
      for (const rk of ['imageRefs', 'videoRefs']) {
        if (Array.isArray(existing[rk]) && Array.isArray(base[rk])) {
          for (let i = 0; i < base[rk].length && i < existing[rk].length; i++) {
            if (existing[rk][i]?.assetId && !base[rk][i]?.assetId) base[rk][i].assetId = existing[rk][i].assetId
          }
        }
      }
    }
  } catch {}
  return JSON.stringify(base)
}

function logRun(raw: any, taskId: string, step: string, message: string, payload?: any, level = 'info', workspaceId?: string) {
  try {
    const ws = workspaceId || getTaskWorkspace(taskId)
    raw.prepare('INSERT INTO run_logs (id, task_id, step, level, message, payload, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), taskId, step, level, message, payload ? JSON.stringify(stripForStorage(payload)) : null, ws, Date.now())
  } catch {}
}

export class TaskQueue extends EventEmitter {
  private apiClient: OpenfieldApiClient
  private processing = new Set<string>()
  private coolingDown = new Set<string>()
  private maxConcurrent = 3

  constructor(apiKey: string) {
    super()
    this.apiClient = new OpenfieldApiClient(apiKey)
    attachTaskNotifications(this, 'Openfield')
  }

  setApiKey(apiKey: string) {
    this.apiClient = new OpenfieldApiClient(apiKey)
  }
  async enqueue(type: string, payload: any): Promise<string> {
    const taskId = crypto.randomUUID()
    const raw = getRawDb()
    const now = Date.now()
    const wsId = getActiveWorkspaceId()

    // Save reference images to disk as binary assets (so parameters only store asset IDs)
    const enrichedPayload = { ...payload }
    try {
      const am = getAssetManager()
      if (enrichedPayload.imageBase64 && typeof enrichedPayload.imageBase64 === 'string' && enrichedPayload.imageBase64.length > 100) {
        const r = await am.importBase64(enrichedPayload.imageBase64, enrichedPayload.imageMime || 'image/png', 'input_image.png', { modelUsed: 'ref', workspaceId: wsId })
        enrichedPayload.imageAssetId = r.id
      }
      if (enrichedPayload.imageRefs && Array.isArray(enrichedPayload.imageRefs)) {
        enrichedPayload.imageRefs = await Promise.all(enrichedPayload.imageRefs.map(async (r: any) => {
          if (r.base64 && r.base64.length > 100) {
            const a = await am.importBase64(r.base64, r.mime || 'image/png', r.name || 'ref.png', { modelUsed: 'ref', workspaceId: wsId })
            return { ...r, assetId: a.id }
          }
          return r
        }))
      }
      if (enrichedPayload.firstFrameBase64 && typeof enrichedPayload.firstFrameBase64 === 'string' && enrichedPayload.firstFrameBase64.length > 100) {
        const r = await am.importBase64(enrichedPayload.firstFrameBase64, 'image/png', 'firstframe.png', { modelUsed: 'ref', workspaceId: wsId })
        enrichedPayload.firstFrameAssetId = r.id
      }
      if (enrichedPayload.lastFrameBase64 && typeof enrichedPayload.lastFrameBase64 === 'string' && enrichedPayload.lastFrameBase64.length > 100) {
        const r = await am.importBase64(enrichedPayload.lastFrameBase64, 'image/png', 'lastframe.png', { modelUsed: 'ref', workspaceId: wsId })
        enrichedPayload.lastFrameAssetId = r.id
      }
    } catch (err) { console.warn('[TaskQueue] Failed to save refs to disk:', err) }

    // Store payloads stripped of large binary data for assets/parameters (keep structure for recreate)
    const storedPayload = stripForStorage(enrichedPayload)

    logRun(raw, taskId, 'enqueue', `Task enqueued: type=${type}`, { type, model: payload?.model, prompt: payload?.prompt?.substring(0, 100), hasImage: !!payload?.imageBase64 }, 'info', wsId)

    // Persist the enriched payload (with asset IDs) so handleSuccess/refresh keep
    // disk-backed refs instead of overwriting them with raw base64.
    raw.prepare(
      'INSERT INTO tasks (task_id, provider, status, type, payload, workspace_id, created_at, updated_at) VALUES (?, \'openfield\', ?, ?, ?, ?, ?, ?)'
    ).run(taskId, 'pending', type, JSON.stringify(enrichedPayload), wsId, now, now)

    // Create optimistic placeholder asset immediately
    const assetId = crypto.randomUUID()
    raw.prepare(
      `INSERT INTO assets (id, type, file_path, local_path, file_name, mime_type, model_used, prompt, parameters, credits_used, task_id, workspace_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      assetId, type, '', '', `pending-${taskId}`, type === 'image' ? 'image/png' : type === 'audio' ? 'audio/mpeg' : 'video/mp4',
      payload?.model || '', payload?.prompt || '', JSON.stringify(storedPayload),
      0, taskId, wsId, now, now
    )
    raw.save()

    this.emit('task:enqueued', { taskId, type, assetId })
    this.processQueue()
    return taskId
  }
  private async processQueue() {
    if (this.processing.size >= this.maxConcurrent) return
    const raw = getRawDb()
    const pending = raw.prepare('SELECT * FROM tasks WHERE provider = \'openfield\' AND status = ? ORDER BY created_at ASC').all('pending')
    for (const task of pending) {
      const taskId = task.taskId || task.task_id
      if (this.processing.size >= this.maxConcurrent) break
      if (this.coolingDown.has(taskId)) continue
      if (!this.processing.has(taskId)) this.processTask(task)
    }
  }

  private async processTask(task: any) {
    const taskId = task.taskId || task.task_id
    this.processing.add(taskId)
    const raw = getRawDb()

    logRun(raw, taskId, 'processing', 'Task started processing')

    raw.prepare('UPDATE tasks SET status = ?, started_at = ?, updated_at = ? WHERE task_id = ?')
      .run('processing', Date.now(), Date.now(), taskId)

    this.emit('task:started', { taskId })

    try {
      const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : task.payload

      // If we already have an API task ID (recovery), skip creation and poll directly
      let kieTaskId = task.kieTaskId || task.openfieldTaskId || task.externalId || payload?.kieTaskId
      if (kieTaskId) {
        logRun(raw, task.taskId, 'recovery', `Resuming existing task: ${kieTaskId}`)
      } else {
        logRun(raw, task.taskId, 'api-request', `Sending to API: model=${payload?.model || 'unknown'}, prompt=${(payload?.prompt || '').substring(0, 100)}, hasImage=${!!payload?.imageBase64}`, payload)

        if (task.type === 'image') {
          kieTaskId = await this.apiClient.generateImage(payload || {})
        } else if (task.type === 'video') {
          kieTaskId = await this.apiClient.generateVideo(payload || {})
        } else if (task.type === 'audio') {
          kieTaskId = await this.apiClient.generateAudio(payload || {})
        } else {
          throw new Error(`Unsupported task type: ${task.type}`)
        }

        logRun(raw, task.taskId, 'api-response', `Task created: ${kieTaskId}`)

        // Store KIE task ID in dedicated column and payload for recovery
        payload.kieTaskId = kieTaskId
        raw.prepare('UPDATE tasks SET payload = ?, external_id = ?, openfield_task_id = ? WHERE task_id = ?')
            .run(JSON.stringify(payload), kieTaskId, kieTaskId, task.taskId)
      }

      raw.prepare('UPDATE tasks SET updated_at = ? WHERE task_id = ?').run(Date.now(), task.taskId)

      logRun(raw, task.taskId, 'waiting', 'Polling API for completion...')

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
    const creditsUsed = Math.round(result.creditsConsumed || 0)

    // Calculate generation time (in seconds and ms)
    const startedAt = task.started_at || task.created_at || Date.now()
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    let genTimeSeconds: number
    let genTimeMs: number

    if (result.costTime && typeof result.costTime === 'number' && result.costTime > 0) {
      if (result.costTime > 1000) {
        genTimeMs = result.costTime
        genTimeSeconds = Number((result.costTime / 1000).toFixed(1))
      } else {
        genTimeSeconds = Number(result.costTime.toFixed(1))
        genTimeMs = Math.round(result.costTime * 1000)
      }
    } else {
      genTimeMs = elapsedMs
      genTimeSeconds = Number((elapsedMs / 1000).toFixed(1))
    }

    const extraParams = {
      generationTimeSeconds: genTimeSeconds,
      generationTimeMs: genTimeMs,
      generationTime: `${genTimeSeconds}s`,
      costTime: result.costTime || genTimeSeconds,
    }

    const resultUrls = extractUrls(result.resultJson)

    let localAssetId: string | null = null
    const type = task.type as 'image' | 'video' | 'audio'
    const remoteUrl = resultUrls.length > 0 ? resultUrls[0] : null

    const defaultMime = () => type === 'image' ? 'image/png' : type === 'audio' ? 'audio/mpeg' : 'video/mp4'

    const updatePlaceholderWithRemote = () => {
      if (!remoteUrl) return
      const placeholder = raw.prepare('SELECT id FROM assets WHERE task_id = ? ORDER BY created_at ASC LIMIT 1').get(task.taskId) as any
      if (placeholder) {
        raw.prepare(
          `UPDATE assets SET file_path = ?, file_name = ?, mime_type = ?, model_used = ?, prompt = ?, parameters = ?, updated_at = ? WHERE id = ?`
        ).run(
          remoteUrl, `${type === 'image' ? 'remote' : type === 'audio' ? 'remote-audio' : 'remote-video'}-${assetId}`, defaultMime(),
          taskPayload?.model || result.model || '',
          taskPayload?.prompt || '',
          buildStoredParams(taskPayload, raw, task.taskId, extraParams),
          Date.now(),
          placeholder.id
        )
        localAssetId = placeholder.id
      }
    }

    if (remoteUrl) {
      const ext = type === 'video' ? '.mp4' : type === 'audio' ? '.mp3' : '.png'
      let fileName = `${assetId}${ext}`
      const taskWs = task.workspace_id || getTaskWorkspace(task.taskId)
      const subDir = workspaceAssetSubDir(type, taskWs)
      let localPath = `${subDir}/${fileName}`

      try {
        logRun(raw, task.taskId, 'download', `Downloading ${type}: ${remoteUrl.substring(0, 80)}...`)
        const resp = await fetch(remoteUrl)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const buffer = Buffer.from(await resp.arrayBuffer())
        await fs.mkdir(subDir, { recursive: true })
        await fs.writeFile(localPath, buffer)

        // For videos, ensure h264 encoding for browser playback.
        // For images, convert to WebP when the setting is enabled.
        let fileSize = buffer.length
        let mime = defaultMime()
        if (type === 'video') {
          try {
            const result = await ensurePlayableVideo(localPath)
            fileSize = result.size
          } catch {}
        } else if (type === 'image') {
          const res = await ensureImageWebp(localPath, mime)
          localPath = res.path
          mime = res.mime
          fileName = path.basename(res.path)
          fileSize = res.size
        }

        localAssetId = assetId

        // Find the placeholder asset for this task
        const placeholder = raw.prepare('SELECT id FROM assets WHERE task_id = ? ORDER BY created_at ASC LIMIT 1').get(task.taskId) as any

        if (placeholder) {
          // Update placeholder with real data (keep original ID)
          raw.prepare(
            `UPDATE assets SET file_path = ?, local_path = ?, file_name = ?, mime_type = ?, model_used = ?, prompt = ?, parameters = ?, file_size = ?, credits_used = ?, updated_at = ? WHERE id = ?`
          ).run(
            remoteUrl, localPath, fileName, mime,
            taskPayload?.model || result.model || '',
            taskPayload?.prompt || '',
            buildStoredParams(taskPayload, raw, task.taskId, extraParams),
            fileSize,
            creditsUsed,
            Date.now(),
            placeholder.id
          )
          localAssetId = placeholder.id
        } else {
          raw.prepare(
            `INSERT INTO assets (id, type, file_path, local_path, file_name, mime_type, model_used, prompt, parameters, file_size, credits_used, task_id, workspace_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            assetId, type, remoteUrl, localPath, fileName, mime,
            taskPayload?.model || result.model || '',
            taskPayload?.prompt || '',
            buildStoredParams(taskPayload, raw, task.taskId, extraParams),
            fileSize,
            creditsUsed,
            task.taskId, taskWs, Date.now(), Date.now()
          )
        }
      } catch (err: any) {
        logRun(raw, task.taskId, 'download-error', `Download failed: ${err.message}`, null, 'error')
        console.error('[TaskQueue] Failed to download asset:', err.message)
        // Fallback: update placeholder with remote URL so image still shows in gallery
        updatePlaceholderWithRemote()
      }
    } else {
      logRun(raw, task.taskId, 'no-url', `No result URL found in resultJson: ${JSON.stringify(result.resultJson).substring(0, 200)}`, null, 'warn')
      console.warn('[TaskQueue] No result URL found in resultJson. Full response:', JSON.stringify(result).substring(0, 500))
    }

    raw.prepare(
      'UPDATE tasks SET status = ?, result_asset_id = ?, credits_used = ?, progress = ?, completed_at = ?, updated_at = ? WHERE task_id = ?'
    ).run('completed', localAssetId, creditsUsed, 100, Date.now(), Date.now(), task.taskId)

    // Link the result back to the storyboard scene/transition that requested it
    if (localAssetId) {
      try {
        if (taskPayload.sceneId) {
          const col = type === 'image' ? 'image_asset_id' : 'video_asset_id'
          raw.prepare(`UPDATE storyboard_scenes SET ${col} = ?, updated_at = ? WHERE id = ?`)
            .run(localAssetId, Date.now(), taskPayload.sceneId)
        }
        if (taskPayload.transitionId) {
          raw.prepare('UPDATE storyboard_transitions SET video_asset_id = ?, updated_at = ? WHERE id = ?')
            .run(localAssetId, Date.now(), taskPayload.transitionId)
        }
      } catch (err: any) {
        console.warn('[TaskQueue] Failed to link result to storyboard:', err?.message)
      }
    }

    raw.save()

    this.emit('task:completed', {
      taskId: task.taskId,
      assetId: localAssetId,
      creditsConsumed: creditsUsed,
      resultUrls,
    })
  }

  private async handleError(task: any, error: Error) {
    const raw = getRawDb()
    const taskId = task.taskId || task.task_id
    const retryCount = (task.retryCount ?? task.retry_count ?? 0) + 1

    // Mark placeholder asset as errored
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

    if (retryCount <= 3 && !isNonRetryable) {
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

  async getCreditBalance(): Promise<number> {
    try { return await this.apiClient.getAccountCredits() }
    catch { return -1 }
  }

  async recoverPendingTasks() {
    const raw = getRawDb()
    const processing = raw.prepare('SELECT * FROM tasks WHERE provider = \'openfield\' AND status = ?').all('processing') as any[]
    for (const task of processing) {
      logRun(raw, task.taskId, 'recovery', 'Recovering interrupted task')
      this.processTask(task)
    }
    const pending = raw.prepare('SELECT * FROM tasks WHERE provider = \'openfield\' AND status = ?').all('pending') as any[]
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
    raw.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE task_id = ?').run('cancelled', Date.now(), taskId)
    this.processing.delete(taskId)
    this.emit('task:cancelled', { taskId })
  }

  async retryTask(taskId: string) {
    const raw = getRawDb()
    raw.prepare('UPDATE tasks SET status = ?, retry_count = 0, error_message = NULL, updated_at = ? WHERE task_id = ?')
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
