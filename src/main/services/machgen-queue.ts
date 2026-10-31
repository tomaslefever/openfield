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
import { MachgenApiClient, getMachgenModel, type MachgenTaskInput, type MachgenTaskStatusResponse } from './machgen'
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

/**
 * Picks the closest (width, height) pair from a model's fixed allowed-sizes list.
 * Aspect-ratio fidelity weighs much more than the resolution tier.
 */
function pickClosestAllowedSize(sizes: [number, number][], aspectRatio: string | null, targetHeight: number): [number, number] {
  const parseAspect = (ar: string | null): number | null => {
    if (!ar) return null
    const [w, h] = ar.split(':').map(Number)
    return w > 0 && h > 0 ? w / h : null
  }
  const target = parseAspect(aspectRatio)
  let best = sizes[0]
  let bestScore = Infinity
  for (const [w, h] of sizes) {
    const a = w / h
    const aspectErr = target ? Math.abs(a - target) / target : 0
    const tierErr = Math.abs(Math.max(w, h) - targetHeight) / Math.max(targetHeight, 1)
    const score = aspectErr * 4 + tierErr
    if (score < bestScore) {
      bestScore = score
      best = [w, h]
    }
  }
  return best
}

/**
 * Seedance 2.5 drafts: the draft asset records its 1080p final in its parameters
 * (`draftFinalTaskId`, then `draftFinalAssetId` once completed) so it can be marked and
 * never finalized twice. `sourceTaskId` is the draft's MachGen task id.
 */
export function updateDraftAssetParams(sourceTaskId: string, patch: Record<string, any>) {
  try {
    const raw = getRawDb()
    const draftTask = raw.prepare("SELECT task_id FROM tasks WHERE provider = 'machgen' AND (request_id = ? OR external_id = ?) LIMIT 1").get(sourceTaskId, sourceTaskId) as any
    if (!draftTask?.taskId) return
    const asset = raw.prepare('SELECT id, parameters FROM assets WHERE task_id = ? ORDER BY created_at ASC LIMIT 1').get(draftTask.taskId) as any
    if (!asset) return
    let params: any = {}
    try { params = JSON.parse(asset.parameters || '{}') } catch {}
    raw.prepare('UPDATE assets SET parameters = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify({ ...params, ...patch }), Date.now(), asset.id)
  } catch (err: any) {
    console.warn('[MachgenQueue] Could not update draft asset:', err?.message)
  }
}

/** A final that failed or was cancelled: release its draft so the final can be retried. */
function releaseDraftOfFinal(task: any, reason: string) {
  try {
    const payload = typeof task?.payload === 'string' ? JSON.parse(task.payload) : (task?.payload || {})
    if (payload?.draftSourceTaskId) {
      updateDraftAssetParams(String(payload.draftSourceTaskId), { draftFinalTaskId: null, draftFinalAssetId: null, draftFinalError: reason })
    }
  } catch {}
}

/**
 * MachGen returns no per-task charge (only the account balance), so the cost is derived from
 * what the completed task actually rendered — `metadata.duration_secs` and `metadata.height` —
 * times the catalog rate. Models with a `costPerSecWithVideoInput` rate bill input + output
 * seconds at that rate when the task had video refs. Returned in app credits (dollars × 200),
 * or null when not computable.
 */
function machgenTaskCostCredits(model: ReturnType<typeof getMachgenModel>, meta: any, payload?: any): number | null {
  const prices = model?.prices || []
  if (prices.length === 0) return null
  const height = Number(meta?.height) || 0
  const price = prices.find(p => p.height === height)
    || (height ? prices.reduce((a, b) => Math.abs((b.height || 0) - height) < Math.abs((a.height || 0) - height) ? b : a) : prices[0])
  let dollars: number | null = null
  if (price.costPerSec != null) {
    const secs = Number(meta?.duration_secs) || 0
    const videoRefs: any[] = Array.isArray(payload?.videoRefs) ? payload.videoRefs : []
    const inputSecs = videoRefs.reduce((s, v) => s + (Number(v?.duration) || 0), 0)
    if (secs > 0 && videoRefs.length > 0 && price.costPerSecWithVideoInput != null) {
      dollars = price.costPerSecWithVideoInput * (secs + inputSecs)
    } else if (secs > 0) dollars = price.costPerSec * secs
  } else if (price.cost != null) {
    dollars = price.cost
  }
  return dollars == null ? null : Math.round(dollars * 200 * 100) / 100
}

export class MachgenQueue extends EventEmitter implements RecoverableQueue {
  private apiClient: MachgenApiClient
  readonly processing = new Set<string>()
  private coolingDown = new Set<string>()
  private uploadCache = new Map<string, string>()
  private maxConcurrent = 2

  constructor(apiKey: string) {
    super()
    this.apiClient = new MachgenApiClient(apiKey)
    attachTaskNotifications(this, 'MachGen')
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

    logRun(raw, taskId, 'enqueue', `MachGen task enqueued: model=${payload?.model}, mode=${payload?.mode}`, undefined, 'info', wsId)

    raw.prepare(
      'INSERT INTO tasks (task_id, provider, status, type, payload, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(taskId, 'machgen', 'pending', type, JSON.stringify(storedPayload), wsId, now, now)

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
      payload?.model || '', 'machgen', payload?.prompt || '', JSON.stringify(storedPayload),
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
    const pending = raw.prepare('SELECT * FROM tasks WHERE provider = ? AND status = ? ORDER BY created_at ASC').all('machgen', 'pending')
    for (const task of pending) {
      const taskId = task.taskId || task.task_id
      if (this.processing.size >= this.maxConcurrent) break
      if (this.coolingDown.has(taskId)) continue
      if (!this.processing.has(taskId)) this.processTask(task)
    }
  }

  public async buildInput(payload: any): Promise<MachgenTaskInput> {
    const raw = getRawDb()
    const rawModel = payload?.model || ''
    const modelDef = getMachgenModel(rawModel)
    const modelId = modelDef?.id || rawModel.replace(/^machgen\//, '').replace(/\/(t2v|i2v|fflf|ref|upscale|t2i|i2i|t2s|t2d|t2sfx|t2m)$/, '').trim()
    if (!modelId) {
      throw new Error('MachGen error: Model ID is empty or invalid.')
    }

    // Resolves a media source (base64, local path, assetId, file://, data:) to an uploaded MachGen @input/... reference or URL
    const resolveSource = async (source?: string, assetId?: string, defaultMime = 'image/png'): Promise<string | null> => {
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
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('@input/')) {
        return trimmed
      }

      if (!trimmed.startsWith('data:') && syncFs.existsSync(trimmed)) {
        const prepared = await prepareUploadFile(trimmed, mime)
        resolvedSource = prepared.path
        mime = prepared.mime || mime
      }
      const inputRef = await this.apiClient.uploadSource(resolvedSource, mime)
      if (cacheKey) {
        this.uploadCache.set(cacheKey, inputRef)
      }
      return inputRef
    }

    const firstFrameUrl = await resolveSource(payload.firstFrameUrl || payload.firstFrameBase64, payload.firstFrameAssetId, 'image/png')
    const lastFrameUrl = await resolveSource(payload.lastFrameUrl || payload.lastFrameBase64, payload.lastFrameAssetId, 'image/png')
    const imageBase64Url = await resolveSource(payload.imageUrl || payload.imageBase64, payload.imageAssetId, payload.imageMime || 'image/png')

    // Collect image URLs
    const srcImageUrls: string[] = []
    let keyframeIndices: (0 | -1)[] | null = null

    // Check payload image inputs
    if (firstFrameUrl && lastFrameUrl && modelDef?.supportsEndFrame) {
      srcImageUrls.push(firstFrameUrl)
      srcImageUrls.push(lastFrameUrl)
      keyframeIndices = [0, -1]
    } else if (lastFrameUrl && !firstFrameUrl && (modelId === 'MiniMax-H3' || modelId === 'MiniMax-H3-Turbo')) {
      // Lone end frame uniquely supported by MiniMax-H3 and MiniMax-H3-Turbo
      srcImageUrls.push(lastFrameUrl)
      keyframeIndices = [-1]
    } else if (firstFrameUrl) {
      srcImageUrls.push(firstFrameUrl)
      keyframeIndices = [0]
    } else if (payload.imageRefs && payload.imageRefs.length > 0) {
      const ref0Url = await resolveSource(payload.imageRefs[0].url || payload.imageRefs[0].base64 || payload.imageRefs[0].localPath, payload.imageRefs[0].assetId, payload.imageRefs[0].mime || 'image/png')
      if (ref0Url) {
        if (payload.imageRefs.length > 1 && modelDef?.supportsEndFrame) {
          const ref1Url = await resolveSource(payload.imageRefs[1].url || payload.imageRefs[1].base64 || payload.imageRefs[1].localPath, payload.imageRefs[1].assetId, payload.imageRefs[1].mime || 'image/png')
          if (ref1Url) {
            srcImageUrls.push(ref0Url)
            srcImageUrls.push(ref1Url)
            keyframeIndices = [0, -1]
          } else {
            srcImageUrls.push(ref0Url)
            keyframeIndices = [0]
          }
        } else {
          srcImageUrls.push(ref0Url)
          keyframeIndices = [0]
        }
      }
    } else if (imageBase64Url) {
      srcImageUrls.push(imageBase64Url)
      keyframeIndices = [0]
    }

    // Determine task_type based on model capabilities and payload
    let taskType: MachgenTaskInput['task_type'] = 'T2V'

    if (payload.taskType && (!modelDef || modelDef.supportedTasks.includes(payload.taskType))) {
      taskType = payload.taskType
    } else if (payload.task_type && (!modelDef || modelDef.supportedTasks.includes(payload.task_type))) {
      taskType = payload.task_type
    } else if (modelDef?.supportedTasks.some(t => ['T2S', 'T2D', 'T2SFX', 'T2M'].includes(t))) {
      // Audio model
      if (modelDef.supportsT2M || payload.kind === 'music') {
        taskType = 'T2M'
      } else if (modelDef.supportsT2SFX || payload.kind === 'sfx') {
        taskType = 'T2SFX'
      } else if (modelDef.supportsT2D && (payload.mode === 'dialogue' || (payload.speakers && payload.speakers.length > 1))) {
        taskType = 'T2D'
      } else {
        taskType = 'T2S'
      }
    } else if (modelDef?.supportedTasks.some(t => ['T2I', 'I2I'].includes(t)) || (modelDef?.supportsUpscale && modelDef.category === 'Topaz' && !modelDef.id.includes('Video'))) {
      // Image model
      if (rawModel.endsWith('/upscale') || (modelDef?.supportsUpscale && !modelDef.supportsT2I && !modelDef.supportsI2I)) {
        taskType = 'UPSCALE'
      } else if (srcImageUrls.length > 0 && modelDef?.supportsI2I) {
        taskType = 'I2I'
      } else {
        taskType = 'T2I'
      }
    } else if (payload.type === 'image' || payload.mode === 'image') {
      // A model missing from this build's catalog must not silently drop the attached
      // references (it was sent as T2I with src_image_urls: null): treat it as I2I.
      if (!modelDef && srcImageUrls.length > 0) {
        console.warn(`[MachGen] Model "${rawModel}" is not in the catalog; sending its ${payload.imageRefs?.length || srcImageUrls.length} reference image(s) as I2I.`)
      }
      taskType = (srcImageUrls.length > 0 && (!modelDef || modelDef.supportsI2I)) ? 'I2I' : 'T2I'
    } else {
      // Video model
      if (rawModel.endsWith('/upscale') || (modelDef?.supportsUpscale && !modelDef.supportsT2V && !modelDef.supportsI2V && !modelDef.supportsR2V)) {
        taskType = 'UPSCALE'
      } else if ((payload.videoRefs?.length > 0 || rawModel.endsWith('/ref') || payload.inputMode === 'ref' || (payload.audioRefs?.length > 0 && modelDef?.supportsAudioRef)) && modelDef?.supportsR2V) {
        taskType = 'R2V'
      } else if (rawModel.endsWith('/fflf') || rawModel.endsWith('/i2v') || payload.inputMode === 'ff' || payload.inputMode === 'fflf') {
        taskType = modelDef?.supportsI2V ? 'I2V' : (modelDef?.supportsR2V ? 'R2V' : 'T2V')
      } else if (srcImageUrls.length > 0 && modelDef?.supportsI2V) {
        taskType = 'I2V'
      } else {
        taskType = modelDef?.supportsT2V ? 'T2V' : (modelDef?.supportsI2V ? 'I2V' : (modelDef?.supportsR2V ? 'R2V' : 'T2V'))
      }
    }

    // Safety fallback: ensure taskType is supported by model
    if (modelDef && !modelDef.supportedTasks.includes(taskType)) {
      taskType = modelDef.supportedTasks[0]
    }

    // Video Config resolution (only for video generation tasks)
    const isVideoTask = ['T2V', 'I2V', 'R2V'].includes(taskType)
    // Topaz UPSCALE: video models take the source in src_video_urls plus a video_config;
    // image models take it in src_image_urls plus an image_config. The prompt is empty.
    const isUpscale = taskType === 'UPSCALE'
    const isVideoUpscale = isUpscale && (/video/i.test(modelId) || payload.videoRefs?.length > 0)
    const isImageUpscale = isUpscale && !isVideoUpscale
    let videoConfig: MachgenTaskInput['video_config'] = null

    if (isVideoTask || isVideoUpscale) {
      let height = 720
      const resStr = String(payload.resolution || '').toLowerCase()
      if (resStr.includes('480')) height = 480
      else if (resStr.includes('540')) height = 540
      else if (resStr.includes('720')) height = 720
      else if (resStr.includes('768')) height = 768
      else if (resStr.includes('1080')) height = 1080
      else if (resStr.includes('1440') || resStr.includes('2k')) height = 1440
      else if (resStr.includes('4k') || resStr.includes('2160')) height = 2160

      if (modelDef?.allowedHeights && modelDef.allowedHeights.length > 0 && !modelDef.allowedHeights.includes(height)) {
        height = modelDef.allowedHeights[0]
      }

      let duration = Number(payload.duration) || 5
      if (modelDef?.allowedDurations && modelDef.allowedDurations.length > 0 && !modelDef.allowedDurations.includes(duration)) {
        duration = modelDef.allowedDurations.reduce((prev, curr) => Math.abs(curr - duration) < Math.abs(prev - duration) ? curr : prev)
      }

      let requestedRatio: string = payload.aspectRatio || '16:9'
      if (requestedRatio === 'auto') requestedRatio = '16:9'
      const taskAspectRatios = modelDef?.allowedAspectRatiosByTask?.[taskType]
      const allowedAspectRatios = taskAspectRatios || modelDef?.allowedAspectRatios
      if (allowedAspectRatios && allowedAspectRatios.length > 0 && !allowedAspectRatios.includes(requestedRatio)) {
        requestedRatio = allowedAspectRatios[0] || '16:9'
      }
      // An empty list for the task: the model takes the framing from the input image and rejects aspect_ratio
      const aspectRatio: string | null = taskAspectRatios && taskAspectRatios.length === 0 ? null : requestedRatio

      let fps = payload.fps != null ? Number(payload.fps) : (modelDef?.defaultFps || 24)
      const allowedFps = modelDef?.allowedFps?.[taskType]
      if (allowedFps && allowedFps.length > 0 && !allowedFps.includes(fps)) {
        fps = allowedFps.reduce((prev, curr) => Math.abs(curr - fps) < Math.abs(prev - fps) ? curr : prev)
      }
      const inferSteps = payload.inferSteps != null ? Number(payload.inferSteps) : modelDef?.defaultInferSteps

      videoConfig = {
        duration_secs: duration,
        height,
        width: payload.width || null,
        aspect_ratio: aspectRatio,
        fps,
        infer_steps: inferSteps || null,
        audio: payload.sound !== false && payload.audio !== false,
        bitrate_mode: payload.bitrateMode || null,
        negative_prompt: payload.negativePrompt || null,
        guidance_scale: payload.guidanceScale != null ? (Array.isArray(payload.guidanceScale) ? payload.guidanceScale : [Number(payload.guidanceScale)]) : null,
      }
    }

    // Draft mode (Seedance 2.5 T2V/I2V/R2V only): `draft` renders a 480p sample; a task with
    // `draftSourceTaskId` renders the 1080p final of that sample (the server reuses its prompt,
    // references, duration, aspect ratio, seed and audio). Both bypass allowedHeights.
    const draftCapable = modelId === 'Seedance-2.5' && isVideoTask
    const draftSourceTaskId: string | null = draftCapable && payload.draftSourceTaskId ? String(payload.draftSourceTaskId) : null
    const isDraft = draftCapable && !draftSourceTaskId && payload.draft === true
    if (videoConfig && isDraft) videoConfig.height = 480
    if (videoConfig && draftSourceTaskId) videoConfig.height = 1080

    // Image Config resolution (only for image generation tasks)
    const isImageTask = ['T2I', 'I2I'].includes(taskType) || isImageUpscale
    let imageConfig: MachgenTaskInput['image_config'] = null

    if (isImageTask) {
      let height = 1024
      const resStr = String(payload.resolution || '').toLowerCase()
      if (resStr.includes('4k')) height = 4096
      else if (resStr.includes('2k')) height = 2048
      else if (resStr.includes('1080')) height = 1080
      else if (resStr.includes('720')) height = 720
      else if (resStr.includes('1k')) height = 1024

      let aspectRatio = payload.aspectRatio || '1:1'
      if (aspectRatio === 'auto') aspectRatio = '1:1'

      let width: number | null = payload.width || null

      if (modelDef?.allowedSizes && modelDef.allowedSizes.length > 0) {
        // Models with a fixed list of allowed (width, height) pairs: snap to the
        // closest pair by aspect ratio and resolution tier instead of sending a
        // bare height (the API would otherwise derive the width from the source
        // image and reject the combination, e.g. GPT-Image-2.5 I2I 1821x1024).
        const [w, h] = pickClosestAllowedSize(modelDef.allowedSizes, aspectRatio, height)
        width = w
        height = h
        aspectRatio = null
      } else {
        if (modelDef?.allowedHeights && modelDef.allowedHeights.length > 0 && !modelDef.allowedHeights.includes(height)) {
          height = modelDef.allowedHeights[0]
        }
        if (modelDef?.allowedAspectRatios && modelDef.allowedAspectRatios.length > 0 && !modelDef.allowedAspectRatios.includes(aspectRatio)) {
          aspectRatio = modelDef.allowedAspectRatios[0] || '1:1'
        }
      }

      const inferSteps = payload.inferSteps != null ? Number(payload.inferSteps) : modelDef?.defaultInferSteps

      imageConfig = {
        height,
        width,
        aspect_ratio: aspectRatio,
        infer_steps: inferSteps || null,
      }
    }

    // Collect video URLs (R2V reference input only)
    const srcVideoUrls: string[] = []
    if (payload.videoRefs && Array.isArray(payload.videoRefs)) {
      for (const v of payload.videoRefs) {
        const vUrl = await resolveSource(v.url || v.base64 || v.localPath, v.assetId, v.mime || 'video/mp4')
        if (vUrl) srcVideoUrls.push(vUrl)
      }
    }

    // Collect audio URLs (R2V reference input only)
    const srcAudioUrls: string[] = []
    if (payload.audioRefs && Array.isArray(payload.audioRefs)) {
      for (const a of payload.audioRefs) {
        const aUrl = await resolveSource(a.url || a.base64 || a.localPath, a.assetId, a.mime || 'audio/mpeg')
        if (aUrl) srcAudioUrls.push(aUrl)
      }
    }

    // enhance_prompt
    let enhancePrompt = payload.enhancePrompt
    if (enhancePrompt === undefined) {
      enhancePrompt = modelId === 'MiniMax-H3' || modelId === 'MiniMax-H3-Turbo' || modelId === 'LTX-2.3-Pro' ? true : null
    }

    const isR2V = taskType === 'R2V'
    const isI2V = taskType === 'I2V'
    const isI2I = taskType === 'I2I'

    // I2V only accepts FF or FF-LF (keyframe indices [0] or [0, -1] / [-1]).
    // For R2V, if reference images are present, pass them as reference image inputs without keyframe indices.
    let finalImageUrls: string[] | null = null
    let finalKeyframeIndices: (0 | -1)[] | null = null

    if (isI2V) {
      finalImageUrls = srcImageUrls.length > 0 ? srcImageUrls : null
      finalKeyframeIndices = keyframeIndices
    } else if (isR2V) {
      if (payload.imageRefs && Array.isArray(payload.imageRefs) && payload.imageRefs.length > 0) {
        const refUrls: string[] = []
        for (const img of payload.imageRefs) {
          const imgUrl = await resolveSource(img.url || img.base64 || img.localPath, img.assetId, img.mime || 'image/png')
          if (imgUrl) refUrls.push(imgUrl)
        }
        finalImageUrls = refUrls.length > 0 ? refUrls : (srcImageUrls.length > 0 ? srcImageUrls : null)
      } else {
        finalImageUrls = srcImageUrls.length > 0 ? srcImageUrls : null
      }
      finalKeyframeIndices = null
    } else if (isI2I) {
      // Image-to-image: send every attached reference image (1..16 accepted by
      // models like GPT-Image-2.5). A bare height without these images was the
      // "accepts 1 to 16 input images; got 0" failure.
      if (payload.imageRefs && Array.isArray(payload.imageRefs) && payload.imageRefs.length > 0) {
        const refUrls: string[] = []
        for (const img of payload.imageRefs) {
          const imgUrl = await resolveSource(img.url || img.base64 || img.localPath, img.assetId, img.mime || 'image/png')
          if (imgUrl) refUrls.push(imgUrl)
        }
        finalImageUrls = refUrls.length > 0 ? refUrls : (srcImageUrls.length > 0 ? srcImageUrls : null)
      } else {
        finalImageUrls = srcImageUrls.length > 0 ? srcImageUrls : null
      }
      finalKeyframeIndices = null
      // No resolvable input images: degrade to plain text-to-image instead of
      // submitting an I2I request with zero inputs.
      if (!finalImageUrls) taskType = 'T2I'
    } else if (isImageUpscale) {
      // Upscale one image: the first attached one
      finalImageUrls = srcImageUrls.length > 0 ? [srcImageUrls[0]] : null
    }

    if (isVideoUpscale && srcVideoUrls.length === 0) throw new Error('Adjunta el video que quieres escalar con Topaz.')
    // Topaz processes (and bills) the whole source video: send its length, rounded up
    const sourceVideoSecs = Number(payload.videoRefs?.[0]?.duration) || 0
    if (isVideoUpscale && videoConfig) {
      // Topaz video UPSCALE only takes the output height and the length; aspect ratio, fps,
      // audio, etc. are rejected ("does not support configurable aspect_ratio for UPSCALE")
      videoConfig = {
        height: videoConfig.height,
        duration_secs: sourceVideoSecs > 0 ? Math.ceil(sourceVideoSecs) : videoConfig.duration_secs,
      }
    }
    if (isImageUpscale && !finalImageUrls) throw new Error('Adjunta la imagen que quieres escalar con Topaz.')

    const input: MachgenTaskInput = {
      model: modelId,
      task_type: taskType,
      prompt: isUpscale ? '' : (payload.prompt || ''),
      enhance_prompt: isUpscale ? null : enhancePrompt,
      prompt_enhancer: payload.promptEnhancer || null,
      seed: payload.seed != null ? Number(payload.seed) : null,
      optimization_level: payload.optimizationLevel || null,
      adapter: payload.adapter || null,
      src_image_urls: finalImageUrls,
      keyframe_indices: finalKeyframeIndices,
      src_video_urls: isR2V && srcVideoUrls.length > 0 ? srcVideoUrls : (isVideoUpscale ? srcVideoUrls.slice(0, 1) : null),
      src_audio_urls: isR2V && srcAudioUrls.length > 0 ? srcAudioUrls : null,
      src_task_ids: isR2V ? (payload.srcTaskIds || null) : null,
      reference_video_operation: isR2V ? (payload.referenceVideoOperation || null) : null,
      reference_video_start_secs: isR2V ? (payload.referenceVideoStartSecs || null) : null,
      subject_to_image_ids: isR2V ? (payload.subjectToImageIds || null) : null,
      subject_to_video_ids: isR2V ? (payload.subjectToVideoIds || null) : null,
      subject_to_audio_ids: isR2V ? (payload.subjectToAudioIds || null) : null,
      video_config: videoConfig,
      image_config: imageConfig,
      ...(isDraft ? { draft: true } : {}),
      ...(draftSourceTaskId ? { draft_source_task_id: draftSourceTaskId } : {}),
      upscale_config: taskType === 'UPSCALE'
        ? {
            // factor is only valid for image upscalers (video ones take the height from video_config)
            ...(isImageUpscale ? { factor: payload.upscaleFactor || 2 } : {}),
            // Only engines this model accepts; none → Topaz uses the tier default
            ...(payload.upscaleEngine && modelDef?.upscaleEngines?.includes(payload.upscaleEngine) ? { engine: payload.upscaleEngine } : {}),
          }
        : null,
    }

    return input
  }

  private async processTask(task: any) {
    const taskId = task.taskId || task.task_id
    this.processing.add(taskId)
    const raw = getRawDb()

    logRun(raw, taskId, 'processing', 'MachGen task started processing')

    raw.prepare('UPDATE tasks SET status = ?, started_at = ?, updated_at = ? WHERE task_id = ?')
      .run('processing', Date.now(), Date.now(), taskId)

    this.emit('task:started', { taskId })

    try {
      // Retry of an already-submitted task: resume the same MachGen job instead of resubmitting
      const existingJobId = task.requestId || task.externalId
      if (existingJobId) {
        logRun(raw, taskId, 'recovery', `Resuming existing MachGen task: ${existingJobId}`)
        const resumed = await this.pollTask(taskId, existingJobId)
        await this.handleSuccess(task, resumed)
        return
      }

      const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : task.payload
      const input = await this.buildInput(payload)

      logRun(raw, taskId, 'submit', `Submitting to MachGen: model=${input.model}, task_type=${input.task_type}`, input)

      const submitRes = await this.apiClient.generate(input)
      const machgenTaskId = submitRes.task_id

      logRun(raw, taskId, 'submitted', `MachGen task_id assigned: ${machgenTaskId}`)

      raw.prepare('UPDATE tasks SET request_id = ?, external_id = ?, updated_at = ? WHERE task_id = ?')
        .run(machgenTaskId, machgenTaskId, Date.now(), taskId)

      const finalStatus = await this.pollTask(taskId, machgenTaskId)
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

  private async pollTask(taskId: string, machgenTaskId: string): Promise<MachgenTaskStatusResponse> {
    const raw = getRawDb()
    while (true) {
      const statusRes = await this.apiClient.getTaskStatus(machgenTaskId)
      this.emit('task:progress', {
        taskId,
        state: statusRes.status,
        generationTime: statusRes.active_generation_time_secs || statusRes.generation_time_secs,
      })

      if (statusRes.status === 'COMPLETED') {
        return statusRes
      }

      if (statusRes.status === 'FAILED') {
        throw new RemoteJobFailedError(statusRes.error_msg || 'MachGen task failed without error message')
      }

      raw.prepare('UPDATE tasks SET updated_at = ? WHERE task_id = ?').run(Date.now(), taskId)
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    }
  }

  private async handleSuccess(task: any, statusRes: MachgenTaskStatusResponse) {
    const raw = getRawDb()
    const taskId = task.taskId || task.task_id
    const taskPayload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})
    const assetId = crypto.randomUUID()
    const remoteUrl = statusRes.task_output?.audio || statusRes.task_output?.video || statusRes.task_output?.image || null
    // Persisted on the asset (and task): computed from the response metadata, see machgenTaskCostCredits
    const costCredits = machgenTaskCostCredits(getMachgenModel(taskPayload?.model), statusRes.metadata, taskPayload)
    if (costCredits != null) {
      logRun(raw, taskId, 'cost', `Coste calculado: ${costCredits} cr ($${(costCredits / 200).toFixed(3)}) — ${statusRes.metadata?.duration_secs ?? '-'}s @ ${statusRes.metadata?.height ?? '-'}p`)
      raw.prepare('UPDATE tasks SET credits_used = ? WHERE task_id = ?').run(costCredits, taskId)
    }

    const updatePlaceholder = (rawFields: Record<string, any>) => {
      const placeholder = raw.prepare('SELECT id FROM assets WHERE task_id = ? ORDER BY created_at ASC LIMIT 1').get(taskId) as any
      if (!placeholder) return null
      const fields = costCredits != null ? { ...rawFields, credits_used: costCredits } : rawFields
      const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ')
      raw.prepare(`UPDATE assets SET ${sets}, updated_at = ? WHERE id = ?`)
        .run(...Object.values(fields), Date.now(), placeholder.id)
      return placeholder.id
    }

    let localAssetId: string | null = null

    if (remoteUrl) {
      const isAudio = task.type === 'audio' || !!statusRes.task_output?.audio
      const isImage = !isAudio && (task.type === 'image' || !!statusRes.task_output?.image)
      const ext = isAudio ? 'mp3' : isImage ? 'png' : 'mp4'
      const mime = isAudio ? 'audio/mpeg' : isImage ? 'image/png' : 'video/mp4'
      const fileName = `${assetId}.${ext}`
      const taskWs = task.workspace_id || getTaskWorkspace(taskId)
      const subDir = workspaceAssetSubDir(isAudio ? 'audio' : isImage ? 'image' : 'video', taskWs)
      const localPath = `${subDir}/${fileName}`

      try {
        logRun(raw, taskId, 'download', `Downloading asset: ${remoteUrl.substring(0, 80)}...`)
        const buffer = await this.apiClient.downloadAsset(remoteUrl)
        await fs.mkdir(subDir, { recursive: true })
        await fs.writeFile(localPath, buffer)

        let fileSize = buffer.length
        if (!isAudio && !isImage) {
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
        console.error('[MachgenQueue] Failed to download asset:', err.message)
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
      const isAudio = task.type === 'audio'
      const isImage = task.type === 'image'
      const mime = isAudio ? 'audio/mpeg' : isImage ? 'image/png' : 'video/mp4'
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

    // A 1080p final: mark its draft as finalized and link the final asset
    if (taskPayload?.draftSourceTaskId && localAssetId) {
      updateDraftAssetParams(String(taskPayload.draftSourceTaskId), { draftFinalTaskId: taskId, draftFinalAssetId: localAssetId, draftFinalError: null })
    }
    raw.save()

    logRun(raw, taskId, 'completed', 'MachGen task completed successfully', { assetId: localAssetId })
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
      errorMessage.toLowerCase().includes('not accept') ||
      errorMessage.toLowerCase().includes('validation') ||
      errorMessage.toLowerCase().includes('incorrect') ||
      errorMessage.toLowerCase().includes('unsupported') ||
      errorMessage.toLowerCase().includes('invalid')

    // Only resume an accepted job; never resubmit (see canAutoResume)
    if (retryCount <= MAX_RETRIES && !isNonRetryable && canAutoResume(taskId)) {
      logRun(raw, taskId, 'retry', `Retrying task (attempt ${retryCount}/${MAX_RETRIES}): ${errorMessage}`, null, 'warn')
      raw.prepare(
        'UPDATE tasks SET status = ?, retry_count = ?, error_message = ?, updated_at = ? WHERE task_id = ?'
      ).run('pending', retryCount, errorMessage, Date.now(), taskId)
      raw.save()
      this.emit('task:retrying', { taskId, retryCount, error: errorMessage })

      this.coolingDown.add(taskId)
      setTimeout(() => {
        this.coolingDown.delete(taskId)
        this.processQueue()
      }, 5000 * retryCount)
    } else {
      logRun(raw, taskId, 'failed', `Task failed permanently: ${errorMessage}`, null, 'error')
      raw.prepare(
        'UPDATE tasks SET status = ?, error_message = ?, updated_at = ? WHERE task_id = ?'
      ).run('failed', errorMessage, Date.now(), taskId)

      // Keep the placeholder as an error card (the grid shows the message)
      markPlaceholderFailed(taskId, errorMessage)
      releaseDraftOfFinal(task, errorMessage)
      raw.save()

      this.emit('task:failed', { taskId, error: errorMessage })
    }
  }

  // ─── RecoverableQueue (see task-recovery.ts) ─────────────────

  async checkRemote(_task: any, machgenTaskId: string): Promise<RemoteTaskStatus> {
    const statusRes = await this.apiClient.getTaskStatus(machgenTaskId)
    if (statusRes.status === 'COMPLETED') return { state: 'completed', result: statusRes }
    if (statusRes.status === 'FAILED') return { state: 'failed', error: statusRes.error_msg || 'MachGen task failed without error message' }
    return { state: 'running', detail: statusRes.status }
  }

  async completeRemote(task: any, result: MachgenTaskStatusResponse): Promise<void> {
    await this.handleSuccess(task, result)
  }

  cancelTask(taskId: string): boolean {
    const raw = getRawDb()
    const task = raw.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as any
    if (!task) return false

    if (task.status === 'completed' || task.status === 'failed') return false

    raw.prepare('UPDATE tasks SET status = ?, error_message = ?, updated_at = ? WHERE task_id = ?')
      .run('failed', 'Cancelled by user', Date.now(), taskId)

    markPlaceholderFailed(taskId, 'Cancelled by user')
    releaseDraftOfFinal(task, 'Cancelled by user')
    raw.save()

    this.processing.delete(taskId)
    logRun(raw, taskId, 'cancel', 'Task cancelled by user', null, 'warn')
    this.emit('task:failed', { taskId, error: 'Cancelled by user' })
    this.processQueue()
    return true
  }
}

let queueInstance: MachgenQueue | null = null

export function getMachgenQueue(apiKey: string): MachgenQueue {
  if (!queueInstance) {
    queueInstance = new MachgenQueue(apiKey)
  } else {
    queueInstance.setApiKey(apiKey)
  }
  return queueInstance
}

registerRecoverableProvider('machgen', () => {
  const key = readApiKey('machgenApiKey')
  return key ? getMachgenQueue(key) : null
})
