import { EventEmitter } from 'events'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import { getRawDb } from '../db'
import { getActiveWorkspaceId, workspaceAssetSubDir, getTaskWorkspace } from './workspace-service'
import { ensurePlayableVideo } from './asset-manager'
import { attachTaskNotifications } from './task-notifications'
import {
  HiggsfieldApiClient,
  type Seedance20Input,
  type Seedance25Input,
  type SeedanceInput,
  type Kling30StdInput,
  type HiggsfieldVideoInput,
  type HiggsfieldStatusResponse,
  type HiggsfieldCompletedStatus,
  type SeedanceResolution,
  type SeedanceAspectRatio,
} from './higgsfield'

const POLL_INTERVAL_MS = 2000
const MAX_RETRIES = 3

function logRun(raw: any, taskId: string, step: string, message: string, payload?: any, level = 'info', workspaceId?: string) {
  try {
    const ws = workspaceId || getTaskWorkspace(taskId)
    raw.prepare('INSERT INTO run_logs (id, task_id, step, level, message, payload, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), taskId, step, level, message, payload ? JSON.stringify(payload) : null, ws, Date.now())
  } catch {}
}

export class HiggsfieldQueue extends EventEmitter {
  private apiClient: HiggsfieldApiClient
  private processing = new Set<string>()
  private cancelUrls = new Map<string, string>()
  private maxConcurrent = 2

  constructor(apiKey: string) {
    super()
    this.apiClient = new HiggsfieldApiClient(apiKey)
    attachTaskNotifications(this, 'Higgsfield')
  }

  setApiKey(apiKey: string) {
    this.apiClient.setApiKey(apiKey)
  }

  async enqueue(type: string, payload: any): Promise<string> {
    const taskId = crypto.randomUUID()
    const raw = getRawDb()
    const now = Date.now()
    const wsId = getActiveWorkspaceId()

    logRun(raw, taskId, 'enqueue', `Higgsfield task enqueued: model=${payload?.model}`, undefined, 'info', wsId)

    raw.prepare(
      'INSERT INTO higgsfield_tasks (task_id, status, type, payload, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(taskId, 'pending', type, JSON.stringify(payload), wsId, now, now)

    // Optimistic placeholder asset
    const assetId = crypto.randomUUID()
    raw.prepare(
      `INSERT INTO assets (id, type, file_path, local_path, file_name, mime_type, model_used, prompt, parameters, credits_used, task_id, workspace_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      assetId, 'video', '', '', `pending-${taskId}`, 'video/mp4',
      payload?.model || 'bytedance/seedance-2.0/text-to-video', payload?.prompt || '', JSON.stringify(payload),
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
    const pending = raw.prepare('SELECT * FROM higgsfield_tasks WHERE status = ? ORDER BY created_at ASC').all('pending')
    for (const task of pending) {
      if (this.processing.size >= this.maxConcurrent) break
      if (!this.processing.has(task.taskId)) this.processTask(task)
    }
  }

  public buildInput(payload: any): HiggsfieldVideoInput {
    const prompt = String(payload?.prompt || '').trim()
    const isKling = String(payload?.model || '').includes('kling')
    const isSeedance25 = String(payload?.model || '').includes('seedance-2.5')

    if (isKling) {
      const sound: 'on' | 'off' = (payload?.sound === false || payload?.sound === 'off') ? 'off' : 'on'
      let duration = Number(payload?.duration) || 5
      if (duration < 3) duration = 3
      if (duration > 15) duration = 15

      const arStr = String(payload?.aspectRatio || '').toLowerCase()
      let aspectRatio: '16:9' | '9:16' | '1:1' = '16:9'
      if (['16:9', '9:16', '1:1'].includes(arStr)) {
        aspectRatio = arStr as '16:9' | '9:16' | '1:1'
      }

      const cfgScale = typeof payload?.cfgScale === 'number'
        ? payload.cfgScale
        : (typeof payload?.cfg_scale === 'number' ? payload.cfg_scale : 0.5)

      const multiShots = Boolean(payload?.multiShots ?? payload?.multi_shots ?? false)

      let multiPrompt: Array<{ prompt: string; duration: number }> | undefined
      if (multiShots && Array.isArray(payload?.multiPrompt) && payload.multiPrompt.length > 0) {
        multiPrompt = payload.multiPrompt.slice(0, 6).map((p: any) => ({
          prompt: String(p.prompt || '').slice(0, 512),
          duration: Math.max(1, Math.min(15, Number(p.duration) || 5)),
        }))
      }

      const input: Kling30StdInput = {
        sound,
        duration,
        cfg_scale: cfgScale,
        multi_shots: multiShots,
        aspect_ratio: aspectRatio,
      }
      if (prompt) {
        input.prompt = prompt
      }
      if (multiPrompt && multiPrompt.length > 0) {
        input.multi_prompt = multiPrompt
      }
      if (Array.isArray(payload?.elements) && payload.elements.length > 0) {
        input.elements = payload.elements
      }
      return input
    }

    let duration = Number(payload?.duration) || 5
    const maxDur = isSeedance25 ? 30 : 15
    if (duration < 4) duration = 4
    if (duration > maxDur) duration = maxDur

    let resolution: SeedanceResolution = '720p'
    const resStr = String(payload?.resolution || '').toLowerCase()
    if (resStr.includes('480')) resolution = '480p'
    else if (resStr.includes('720')) resolution = '720p'
    else if (!isSeedance25 && resStr.includes('1080')) resolution = '1080p'
    else if (!isSeedance25 && resStr.includes('4k')) resolution = '4k'

    let aspectRatio: SeedanceAspectRatio = '16:9'
    const arStr = String(payload?.aspectRatio || '').toLowerCase()
    if (['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'].includes(arStr)) {
      aspectRatio = arStr as SeedanceAspectRatio
    }

    const generateAudio = payload?.sound !== undefined
      ? !!payload.sound
      : (payload?.generate_audio !== undefined ? !!payload.generate_audio : true)

    if (isSeedance25) {
      const bitrateMode: 'standard' | 'high' = payload?.bitrate_mode === 'standard' ? 'standard' : 'high'
      const outputFormat: 'mp4' | 'mov' = payload?.output_format === 'mov' ? 'mov' : 'mp4'
      const res25: '480p' | '720p' = (resolution === '480p' || resolution === '720p') ? resolution : '720p'
      return {
        prompt,
        duration,
        resolution: res25,
        aspect_ratio: aspectRatio,
        bitrate_mode: bitrateMode,
        output_format: outputFormat,
        generate_audio: generateAudio,
      } as Seedance25Input
    }

    return {
      prompt,
      duration,
      resolution,
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
    } as Seedance20Input
  }

  private async processTask(task: any) {
    this.processing.add(task.taskId)
    const raw = getRawDb()

    raw.prepare('UPDATE higgsfield_tasks SET status = ?, started_at = ?, updated_at = ? WHERE task_id = ?')
      .run('processing', Date.now(), Date.now(), task.taskId)

    try {
      const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : task.payload
      const isImage = task.type === 'image' || payload?.mode === 'image'
      const isKling = String(payload?.model || '').includes('kling')
      const isSeedance25 = String(payload?.model || '').includes('seedance-2.5')
      const input = this.buildInput(payload)
      const modelName = isImage
        ? 'Higgsfield Image'
        : isKling
        ? 'Kling 3.0 Standard'
        : isSeedance25
        ? 'Seedance 2.5'
        : 'Seedance 2.0'

      const displayPrompt = String((input as any).prompt || (input as any).multi_prompt?.[0]?.prompt || '').substring(0, 60)
      logRun(raw, task.taskId, 'submit', `Submitting to Higgsfield ${modelName}: prompt="${displayPrompt}"`, input)

      const submitRes = isImage
        ? await this.apiClient.generate(payload?.model || '/text-to-image', input)
        : isKling
        ? await this.apiClient.generateKling30Std(input as Kling30StdInput)
        : isSeedance25
        ? await this.apiClient.generateSeedance25(input as Seedance25Input)
        : await this.apiClient.generateSeedance20(input as Seedance20Input)
      const hfRequestId = submitRes.request_id

      if (submitRes.cancel_url) {
        this.cancelUrls.set(task.taskId, submitRes.cancel_url)
      }

      logRun(raw, task.taskId, 'submitted', `Higgsfield request_id assigned: ${hfRequestId}`)

      raw.prepare('UPDATE higgsfield_tasks SET request_id = ?, updated_at = ? WHERE task_id = ?')
        .run(hfRequestId, Date.now(), task.taskId)

      if (submitRes.status === 'completed') {
        await this.handleSuccess(task, submitRes as HiggsfieldCompletedStatus)
        return
      }

      if (submitRes.status === 'failed') {
        throw new Error((submitRes as any).error || 'Higgsfield task failed upon submission')
      }

      if (submitRes.status === 'nsfw') {
        throw new Error('Content flagged by safety filter (NSFW)')
      }

      if (submitRes.status === 'canceled') {
        throw new Error('Task was canceled')
      }

      const finalStatus = await this.pollTask(task.taskId, submitRes.status_url)
      await this.handleSuccess(task, finalStatus as HiggsfieldCompletedStatus)
    } catch (err: any) {
      logRun(raw, task.taskId, 'error', `Task failed: ${err.message}`, null, 'error')
      await this.handleFailure(task, err.message)
    } finally {
      this.cancelUrls.delete(task.taskId)
      this.processing.delete(task.taskId)
      this.processQueue()
    }
  }

  private async pollTask(taskId: string, statusUrl: string): Promise<HiggsfieldStatusResponse> {
    const raw = getRawDb()
    while (true) {
      const statusRes = await this.apiClient.getStatus(statusUrl)

      this.emit('task:progress', {
        taskId,
        state: statusRes.status,
      })

      if (statusRes.status === 'completed') {
        return statusRes
      }

      if (statusRes.status === 'failed') {
        throw new Error((statusRes as any).error || 'Higgsfield generation failed')
      }

      if (statusRes.status === 'nsfw') {
        throw new Error('Content flagged by safety filter (NSFW)')
      }

      if (statusRes.status === 'canceled') {
        throw new Error('Task was canceled')
      }

      raw.prepare('UPDATE higgsfield_tasks SET updated_at = ? WHERE task_id = ?').run(Date.now(), taskId)
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    }
  }

  private async handleSuccess(task: any, statusRes: HiggsfieldCompletedStatus) {
    const raw = getRawDb()
    const taskPayload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})
    const assetId = crypto.randomUUID()
    const remoteUrl = statusRes.video?.url || (statusRes as any).image?.url || (statusRes as any).images?.[0]?.url || (statusRes as any).output?.url || null

    const updatePlaceholder = (fields: Record<string, any>) => {
      const placeholder = raw.prepare('SELECT id FROM assets WHERE task_id = ? ORDER BY created_at ASC LIMIT 1').get(task.taskId) as any
      if (!placeholder) return null
      const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ')
      raw.prepare(`UPDATE assets SET ${sets}, updated_at = ? WHERE id = ?`)
        .run(...Object.values(fields), Date.now(), placeholder.id)
      return placeholder.id
    }

    let localAssetId: string | null = null

    const isImage = task.type === 'image' || taskPayload?.mode === 'image' || (!statusRes.video?.url && !!((statusRes as any).image?.url || (statusRes as any).images?.[0]?.url))
    const isMov = !isImage && taskPayload?.output_format === 'mov'
    const ext = isImage ? 'png' : isMov ? 'mov' : 'mp4'
    const mime = isImage ? 'image/png' : isMov ? 'video/quicktime' : 'video/mp4'

    if (remoteUrl) {
      const fileName = `${assetId}.${ext}`
      const taskWs = task.workspace_id || getTaskWorkspace(task.taskId)
      const subDir = workspaceAssetSubDir(isImage ? 'image' : 'video', taskWs)
      const localPath = `${subDir}/${fileName}`

      try {
        logRun(raw, task.taskId, 'download', `Downloading asset: ${remoteUrl.substring(0, 80)}...`)
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
          model_used: taskPayload?.model || (isImage ? 'higgsfield/soul-image-2' : 'bytedance/seedance-2.0/text-to-video'),
          prompt: taskPayload?.prompt || '',
          parameters: JSON.stringify(taskPayload),
          file_size: fileSize,
        })
      } catch (err: any) {
        logRun(raw, task.taskId, 'download-error', `Download failed: ${err.message}`, null, 'error')
        console.error('[HiggsfieldQueue] Failed to download asset:', err.message)
        localAssetId = updatePlaceholder({
          file_path: remoteUrl,
          file_name: `remote-${assetId}.${ext}`,
          mime_type: mime,
          model_used: taskPayload?.model || (isImage ? 'higgsfield/soul-image-2' : 'bytedance/seedance-2.0/text-to-video'),
          prompt: taskPayload?.prompt || '',
          parameters: JSON.stringify(taskPayload),
        })
      }
    } else {
      localAssetId = updatePlaceholder({
        file_path: '',
        file_name: `completed-${assetId}.${ext}`,
        mime_type: mime,
        model_used: taskPayload?.model || (isImage ? 'higgsfield/soul-image-2' : 'bytedance/seedance-2.0/text-to-video'),
        prompt: taskPayload?.prompt || '',
        parameters: JSON.stringify(taskPayload),
      })
    }

    raw.prepare(
      'UPDATE higgsfield_tasks SET status = ?, result_asset_id = ?, progress = 100, completed_at = ?, updated_at = ? WHERE task_id = ?'
    ).run('completed', localAssetId || assetId, Date.now(), Date.now(), task.taskId)

    raw.save()

    logRun(raw, task.taskId, 'complete', `Higgsfield task completed successfully! Asset: ${localAssetId}`)
    this.emit('task:completed', { taskId: task.taskId, assetId: localAssetId || assetId })
  }

  private async handleFailure(task: any, errorMessage: string) {
    const raw = getRawDb()
    const currentRetries = task.retry_count || 0

    if (currentRetries < MAX_RETRIES && !errorMessage.includes('NSFW') && !errorMessage.includes('canceled') && !errorMessage.includes('API key')) {
      logRun(raw, task.taskId, 'retry', `Retrying task (${currentRetries + 1}/${MAX_RETRIES}): ${errorMessage}`, null, 'warn')
      raw.prepare(
        'UPDATE higgsfield_tasks SET status = ?, retry_count = ?, error_message = ?, updated_at = ? WHERE task_id = ?'
      ).run('pending', currentRetries + 1, errorMessage, Date.now(), task.taskId)
    } else {
      logRun(raw, task.taskId, 'failed', `Higgsfield task marked as failed: ${errorMessage}`, null, 'error')
      raw.prepare(
        'UPDATE higgsfield_tasks SET status = ?, error_message = ?, updated_at = ? WHERE task_id = ?'
      ).run('failed', errorMessage, Date.now(), task.taskId)

      // Delete optimistic placeholder
      try {
        raw.prepare('DELETE FROM assets WHERE task_id = ? AND (file_path = "" OR file_path IS NULL)').run(task.taskId)
      } catch {}
      raw.save()

      this.emit('task:failed', { taskId: task.taskId, error: errorMessage })
    }
  }

  cancelTask(taskId: string): boolean {
    const raw = getRawDb()
    const task = raw.prepare('SELECT * FROM higgsfield_tasks WHERE task_id = ?').get(taskId) as any
    if (!task) return false

    if (task.status === 'completed' || task.status === 'failed') return false

    const cancelUrl = this.cancelUrls.get(taskId)
    if (cancelUrl) {
      this.apiClient.cancel(cancelUrl).catch(() => {})
      this.cancelUrls.delete(taskId)
    }

    raw.prepare('UPDATE higgsfield_tasks SET status = ?, error_message = ?, updated_at = ? WHERE task_id = ?')
      .run('failed', 'Cancelled by user', Date.now(), taskId)

    try {
      raw.prepare('DELETE FROM assets WHERE task_id = ? AND (file_path = "" OR file_path IS NULL)').run(taskId)
    } catch {}
    raw.save()

    this.processing.delete(taskId)
    logRun(raw, taskId, 'cancel', 'Task cancelled by user', null, 'warn')
    this.emit('task:failed', { taskId, error: 'Cancelled by user' })
    this.processQueue()
    return true
  }
}

let queueInstance: HiggsfieldQueue | null = null

export function getHiggsfieldQueue(apiKey: string): HiggsfieldQueue {
  if (!queueInstance) {
    queueInstance = new HiggsfieldQueue(apiKey)
  } else {
    queueInstance.setApiKey(apiKey)
  }
  return queueInstance
}
