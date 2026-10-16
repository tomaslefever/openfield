import { EventEmitter } from 'events'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import { getRawDb } from '../db'
import { getActiveWorkspaceId, workspaceAssetSubDir, getTaskWorkspace } from './workspace-service'
import { ensurePlayableVideo } from './asset-manager'
import { attachTaskNotifications } from './task-notifications'
import { redactPayload } from './payload-redact'
import { persistMediaToAssets } from './media-persist'
import { KlingApiClient, getKlingModel, type KlingContent, type KlingTask, type KlingVideoSettings } from './kling'
import { registerRecoverableProvider, readApiKey, RemoteJobFailedError, forgetFailedJob, markPlaceholderFailed, canAutoResume, type RecoverableQueue, type RemoteTaskStatus } from './task-recovery'
import { resolveAssetFileForUpload } from './asset-file'

const POLL_INTERVAL_MS = 3000
const MAX_RETRIES = 3

function logRun(raw: any, taskId: string, step: string, message: string, payload?: any, level = 'info', workspaceId?: string) {
  try {
    const ws = workspaceId || getTaskWorkspace(taskId)
    raw.prepare('INSERT INTO run_logs (id, task_id, step, level, message, payload, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), taskId, step, level, message, payload ? JSON.stringify(redactPayload(payload)) : null, ws, Date.now())
  } catch {}
}

/** Composer resolutions → Kling's enum (older std/pro naming included). */
function toKlingResolution(value: unknown, allowed: string[]): '720p' | '1080p' | '4k' {
  const v = String(value || '').toLowerCase()
  const res = v.includes('4k') ? '4k' : v.includes('1080') || v.includes('pro') ? '1080p' : '720p'
  return (allowed.includes(res) ? res : allowed[0]) as '720p' | '1080p' | '4k'
}

/** Multi-shot prompt in Kling's format: "shot n, seconds, words; shot n, seconds, words;" */
function buildMultiShotPrompt(shots: Array<{ prompt: string; duration: number }>): string {
  return shots
    .slice(0, 6)
    .map((s, i) => `shot ${i + 1}, ${Math.max(1, Math.round(Number(s.duration) || 1))}, ${String(s.prompt || '').replace(/;/g, ',').trim()}`)
    .join('; ') + ';'
}

export class KlingQueue extends EventEmitter implements RecoverableQueue {
  private apiClient: KlingApiClient
  readonly processing = new Set<string>()
  private coolingDown = new Set<string>()
  private maxConcurrent = 2

  constructor(apiKey: string) {
    super()
    this.apiClient = new KlingApiClient(apiKey)
    attachTaskNotifications(this, 'Kling')
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

    logRun(raw, taskId, 'enqueue', `Kling task enqueued: model=${payload?.model}`, undefined, 'info', wsId)

    raw.prepare(
      'INSERT INTO tasks (task_id, provider, status, type, payload, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(taskId, 'klingai', 'pending', 'video', JSON.stringify(storedPayload), wsId, now, now)

    // Optimistic placeholder asset
    raw.prepare(
      `INSERT INTO assets (id, type, file_path, local_path, file_name, mime_type, model_used, provider, prompt, parameters, credits_used, task_id, workspace_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(), 'video', '', '', `pending-${taskId}`, 'video/mp4',
      payload?.model || '', 'klingai', payload?.prompt || '', JSON.stringify(storedPayload),
      0, taskId, wsId, now, now
    )
    raw.save()

    this.emit('task:enqueued', { taskId, type: 'video' })
    this.processQueue()
    return taskId
  }

  async processQueue() {
    if (this.processing.size >= this.maxConcurrent) return
    const raw = getRawDb()
    const pending = raw.prepare('SELECT * FROM tasks WHERE provider = ? AND status = ? ORDER BY created_at ASC').all('klingai', 'pending')
    for (const task of pending) {
      const taskId = task.taskId || task.task_id
      if (this.processing.size >= this.maxConcurrent) break
      if (this.coolingDown.has(taskId)) continue
      if (!this.processing.has(taskId)) this.processTask(task)
    }
  }

  /** An image reference as Kling takes it (URL or raw base64), from an asset or a source string. */
  private async resolveImage(source?: string, assetId?: string): Promise<string | null> {
    const file = assetId ? await resolveAssetFileForUpload(assetId) : null
    const resolved = file?.path || source
    if (!resolved) return null
    return this.apiClient.toImageInput(resolved)
  }

  private async processTask(task: any) {
    const raw = getRawDb()
    const taskId = task.taskId || task.task_id
    this.processing.add(taskId)

    logRun(raw, taskId, 'processing', 'Kling task started processing')

    raw.prepare('UPDATE tasks SET status = ?, started_at = ?, updated_at = ? WHERE task_id = ?')
      .run('processing', Date.now(), Date.now(), taskId)

    this.emit('task:started', { taskId })

    try {
      // Retry of an already-submitted task: resume the same Kling job instead of resubmitting
      const existingJobId = task.requestId || task.externalId
      if (existingJobId) {
        logRun(raw, taskId, 'recovery', `Resuming existing Kling task: ${existingJobId}`)
        const resumed = await this.pollTask(taskId, existingJobId)
        await this.handleSuccess(task, resumed)
        return
      }

      const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : task.payload
      const model = getKlingModel(payload?.model)
      if (!model) throw new Error(`Kling: unsupported model "${payload?.model}"`)

      const firstFrame =
        (await this.resolveImage(payload.firstFrameUrl || payload.firstFrameBase64, payload.firstFrameAssetId)) ||
        (await this.resolveImage(payload.imageUrl || payload.imageBase64, payload.imageAssetId)) ||
        (Array.isArray(payload.imageRefs) && payload.imageRefs[0]
          ? await this.resolveImage(payload.imageRefs[0].url || payload.imageRefs[0].base64 || payload.imageRefs[0].localPath, payload.imageRefs[0].assetId)
          : null)
      const lastFrame = model.supportsLastFrame
        ? await this.resolveImage(payload.lastFrameUrl || payload.lastFrameBase64, payload.lastFrameAssetId)
        : null

      if (lastFrame && !firstFrame) throw new Error('Kling: a last frame needs a first frame too')
      if (!firstFrame && !model.supportsTextToVideo) throw new Error(`Kling: ${model.name} needs a first-frame image`)

      const shots = model.multiShot && payload.multiShots && Array.isArray(payload.multiPrompt) && payload.multiPrompt.length > 0
        ? payload.multiPrompt as Array<{ prompt: string; duration: number }>
        : null
      const prompt = shots ? buildMultiShotPrompt(shots) : String(payload.prompt || '')

      let duration = shots
        ? shots.slice(0, 6).reduce((s, x) => s + Math.max(1, Math.round(Number(x.duration) || 1)), 0)
        : Math.round(Number(payload.duration) || 5)
      const minDuration = model.durationOptions[0]
      const maxDuration = model.durationOptions[model.durationOptions.length - 1]
      duration = Math.min(maxDuration, Math.max(minDuration, duration))

      const settings: KlingVideoSettings = {
        resolution: toKlingResolution(payload.resolution, model.resolutions),
        duration,
      }
      if (!firstFrame) settings.aspect_ratio = model.aspectRatios.includes(payload.aspectRatio) ? payload.aspectRatio : '16:9'
      if (model.audioSetting) settings.audio = payload.sound || payload.audio ? 'native' : 'off'
      if (model.multiShotSetting) settings.multi_shot = !!shots

      logRun(raw, taskId, 'submit', `Submitting to Kling: model=${model.id}, ${firstFrame ? 'image' : 'text'}-to-video`, { ...payload, settings })

      let submitted
      if (firstFrame) {
        const contents: KlingContent[] = [{ type: 'prompt', text: prompt }, { type: 'first_frame', url: firstFrame }]
        if (lastFrame) contents.push({ type: 'last_frame', url: lastFrame })
        submitted = await this.apiClient.imageToVideo(model.id, { contents, settings })
      } else {
        submitted = await this.apiClient.textToVideo(model.id, { prompt, settings })
      }

      const klingTaskId = submitted?.id
      if (!klingTaskId) throw new Error(`Kling did not return a task id: ${JSON.stringify(submitted)}`)

      logRun(raw, taskId, 'submitted', `Kling task id assigned: ${klingTaskId}`)
      raw.prepare('UPDATE tasks SET request_id = ?, external_id = ?, updated_at = ? WHERE task_id = ?')
        .run(klingTaskId, klingTaskId, Date.now(), taskId)

      const finalTask = await this.pollTask(taskId, klingTaskId)
      await this.handleSuccess(task, finalTask)
    } catch (err: any) {
      logRun(raw, taskId, 'error', `Task failed: ${err.message}`, null, 'error')
      forgetFailedJob(taskId, err)
      await this.handleFailure(task, err.message)
    } finally {
      this.processing.delete(taskId)
      this.processQueue()
    }
  }

  private async pollTask(taskId: string, klingTaskId: string): Promise<KlingTask> {
    const raw = getRawDb()
    while (true) {
      const remote = await this.apiClient.getTask(klingTaskId)
      this.emit('task:progress', { taskId, state: remote.status })

      if (remote.status === 'succeeded') return remote
      if (remote.status === 'failed') throw new RemoteJobFailedError(remote.message || 'Kling task failed')

      raw.prepare('UPDATE tasks SET updated_at = ? WHERE task_id = ?').run(Date.now(), taskId)
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }
  }

  private async handleSuccess(task: any, remote: KlingTask) {
    const raw = getRawDb()
    const taskId = task.taskId || task.task_id
    const taskPayload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})
    const fileId = crypto.randomUUID()
    const remoteUrl = remote.outputs?.find((o) => o.type === 'video' && o.url)?.url || null

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
      const fileName = `${fileId}.mp4`
      const subDir = workspaceAssetSubDir('video', task.workspace_id || getTaskWorkspace(taskId))
      const localPath = `${subDir}/${fileName}`
      try {
        logRun(raw, taskId, 'download', `Downloading asset: ${remoteUrl.substring(0, 80)}...`)
        const buffer = await this.apiClient.downloadAsset(remoteUrl)
        await fs.mkdir(subDir, { recursive: true })
        await fs.writeFile(localPath, buffer)
        let fileSize = buffer.length
        try { fileSize = (await ensurePlayableVideo(localPath)).size } catch {}
        localAssetId = updatePlaceholder({ ...common, file_path: remoteUrl, local_path: localPath, file_name: fileName, file_size: fileSize })
      } catch (err: any) {
        logRun(raw, taskId, 'download-error', `Download failed: ${err.message}`, null, 'error')
        console.error('[KlingQueue] Failed to download asset:', err.message)
        localAssetId = updatePlaceholder({ ...common, file_path: remoteUrl, file_name: `remote-${fileId}` })
      }
    } else {
      localAssetId = updatePlaceholder({ ...common, file_path: '', file_name: `completed-${fileId}` })
    }

    raw.prepare('UPDATE tasks SET status = ?, result_asset_id = ?, completed_at = ?, updated_at = ? WHERE task_id = ?')
      .run('completed', localAssetId, Date.now(), Date.now(), taskId)
    raw.save()

    logRun(raw, taskId, 'completed', 'Kling task completed successfully', { assetId: localAssetId })
    this.emit('task:completed', { taskId, assetId: localAssetId, result: remote })
  }

  private async handleFailure(task: any, errorMessage: string) {
    const raw = getRawDb()
    const taskId = task.taskId || task.task_id
    const retryCount = (task.retryCount ?? task.retry_count ?? 0) + 1

    const lower = errorMessage.toLowerCase()
    const isNonRetryable =
      /\((400|401|403|404|422)\b/.test(errorMessage) ||
      lower.includes('unsupported') ||
      lower.includes('invalid') ||
      lower.includes('needs a')

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

  async checkRemote(_task: any, klingTaskId: string): Promise<RemoteTaskStatus> {
    const remote = await this.apiClient.getTask(klingTaskId)
    if (remote.status === 'succeeded') return { state: 'completed', result: remote }
    if (remote.status === 'failed') return { state: 'failed', error: remote.message || 'Kling task failed' }
    return { state: 'running', detail: remote.status }
  }

  async completeRemote(task: any, result: KlingTask): Promise<void> {
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
let globalQueue: KlingQueue | null = null

export function getKlingQueue(apiKey: string): KlingQueue {
  if (!globalQueue) {
    globalQueue = new KlingQueue(apiKey)
  } else {
    globalQueue.setApiKey(apiKey)
  }
  return globalQueue
}

registerRecoverableProvider('klingai', () => {
  const key = readApiKey('klingApiKey')
  return key ? getKlingQueue(key) : null
})
