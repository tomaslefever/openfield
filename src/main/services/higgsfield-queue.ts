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
import { registerRecoverableProvider, readApiKey, RemoteJobFailedError, forgetFailedJob, markPlaceholderFailed, canAutoResume, type RecoverableQueue, type RemoteTaskStatus } from './task-recovery'
import { resolveAssetFileForUpload, prepareUploadFile } from './asset-file'
import {
  HiggsfieldApiClient,
  normalizeHiggsfieldEndpoint,
  type Seedance20Input,
  type Seedance25Input,
  type SeedanceInput,
  type Kling30StdInput,
  type Wan30Input,
  type Wan30PrimeInput,
  type MiniMaxHailuoInput,
  type HiggsfieldVideoInput,
  type HiggsfieldImageInput,
  type MarketingStudioImageInput,
  type AiInfluencerInput,
  type AiInfluencerTier,
  type GenjutsuMotionTransferInput,
  CINEMA_STUDIO_4_CONTROLS,
  type CinemaStudio4Control,
  type CinemaStudio4Input,
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
      .run(crypto.randomUUID(), taskId, step, level, message, payload ? JSON.stringify(redactPayload(payload)) : null, ws, Date.now())
  } catch {}
}

const AI_INFLUENCER_HUMAN_TIERS = ['normal', 'freak', 'total']
const AI_INFLUENCER_TIERS = [...AI_INFLUENCER_HUMAN_TIERS, 'insects', 'frogs', 'cats', 'dogs', 'capybaras', 'birds']

/**
 * AI Influencer request body. The prompt goes in as `brief`; with `identityFromFirstImage` the
 * first attached image is the identity photo and the next ones (max 3) are clothing/item refs.
 * Human tiers must send variation_index 0 and no body_color, so those are dropped for them.
 */
export function buildAiInfluencerInput(opts: any, prompt: string, imageUrls: string[]): AiInfluencerInput {
  const tier = (AI_INFLUENCER_TIERS.includes(opts?.tier) ? opts.tier : 'normal') as AiInfluencerTier
  const isHuman = AI_INFLUENCER_HUMAN_TIERS.includes(tier)
  const input: AiInfluencerInput = { tier }

  const selection: Record<string, string[]> = {}
  for (const [cat, keys] of Object.entries(opts?.selection || {})) {
    const clean = Array.isArray(keys) ? keys.filter(k => typeof k === 'string' && k) : []
    if (clean.length > 0) selection[cat] = clean
  }
  if (Object.keys(selection).length > 0) input.selection = selection

  const identityFromFirst = opts?.identityFromFirstImage !== false
  const identity = identityFromFirst ? imageUrls[0] : undefined
  const items = (identityFromFirst ? imageUrls.slice(1) : imageUrls).slice(0, 3)
  if (identity) input.image_url = identity
  if (items.length > 0) input.item_image_urls = items

  if (prompt) input.brief = prompt.slice(0, 4000)

  const seed = Math.round(Number(opts?.seed))
  if (Number.isFinite(seed) && seed >= 1 && seed <= 1_000_000) input.seed = seed

  if (!isHuman) {
    const variation = Math.round(Number(opts?.variationIndex))
    if (Number.isFinite(variation) && variation > 0) input.variation_index = Math.min(variation, 2_147_483_647)
    if (typeof opts?.bodyColor === 'string' && /^#[0-9a-f]{6}$/i.test(opts.bodyColor)) input.body_color = opts.bodyColor.toUpperCase()
    if (tier === 'insects' && typeof opts?.pinnedSpecies === 'string' && opts.pinnedSpecies.trim()) {
      input.pinned_species = opts.pinnedSpecies.trim().slice(0, 64)
    }
  }
  return input
}

/**
 * Cinema Studio 4.0 request body. One endpoint: text-to-video with no media, reference-to-video
 * when any media array is nonempty. Creative controls (era, genre, light, pacing, camera_*,
 * color_palette) are read from the payload as snake_case keys and sent only when they hold a
 * documented value: an omitted field lets the director choose, and "auto" is rejected by the API.
 */
export function buildCinemaStudio4Input(
  payload: any,
  prompt: string,
  imageUrls: string[],
  videoUrls: string[],
  audioUrls: string[],
  generateAudio: boolean,
): CinemaStudio4Input {
  if (!/\S/.test(prompt)) throw new Error('Cinema Studio 4.0 necesita un prompt')
  if (imageUrls.length > 30) throw new Error('Cinema Studio 4.0 acepta hasta 30 imágenes de referencia')
  if (videoUrls.length > 10) throw new Error('Cinema Studio 4.0 acepta hasta 10 videos de referencia')
  if (audioUrls.length > 10) throw new Error('Cinema Studio 4.0 acepta hasta 10 audios de referencia')

  let duration = Math.round(Number(payload?.duration) || 5)
  if (duration < 4) duration = 4
  if (duration > 30) duration = 30

  const resolution: '480p' | '720p' = String(payload?.resolution || '').includes('480') ? '480p' : '720p'

  let aspect_ratio: SeedanceAspectRatio = '16:9'
  const arStr = String(payload?.aspectRatio || payload?.aspect_ratio || '').toLowerCase()
  if (['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'].includes(arStr)) aspect_ratio = arStr as SeedanceAspectRatio

  const input: CinemaStudio4Input = {
    prompt,
    duration,
    resolution,
    aspect_ratio,
    generate_audio: generateAudio,
    ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
    ...(videoUrls.length > 0 ? { video_urls: videoUrls } : {}),
    ...(audioUrls.length > 0 ? { audio_urls: audioUrls } : {}),
  }

  for (const key of Object.keys(CINEMA_STUDIO_4_CONTROLS) as CinemaStudio4Control[]) {
    const value = String(payload?.[key] ?? '').trim().toLowerCase()
    if ((CINEMA_STUDIO_4_CONTROLS[key] as readonly string[]).includes(value)) {
      (input as Record<string, unknown>)[key] = value
    }
  }
  return input
}

export class HiggsfieldQueue extends EventEmitter implements RecoverableQueue {
  private apiClient: HiggsfieldApiClient
  readonly processing = new Set<string>()
  private coolingDown = new Set<string>()
  private cancelUrls = new Map<string, string>()
  private maxConcurrent = 2
  private uploadCache = new Map<string, string>()

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

    // Media is persisted as binary assets on disk; the DB only stores asset IDs.
    const storedPayload = redactPayload(await persistMediaToAssets(payload))

    logRun(raw, taskId, 'enqueue', `Higgsfield task enqueued: model=${payload?.model}`, undefined, 'info', wsId)

    raw.prepare(
      'INSERT INTO tasks (task_id, provider, status, type, payload, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(taskId, 'higgsfield', 'pending', type, JSON.stringify(storedPayload), wsId, now, now)

    // Optimistic placeholder asset
    const assetId = crypto.randomUUID()
    raw.prepare(
      `INSERT INTO assets (id, type, file_path, local_path, file_name, mime_type, model_used, provider, prompt, parameters, credits_used, task_id, workspace_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      assetId, type === 'image' ? 'image' : 'video', '', '', `pending-${taskId}`, type === 'image' ? 'image/png' : 'video/mp4',
      payload?.model || 'bytedance/seedance-2.0/text-to-video', 'higgsfield', payload?.prompt || '', JSON.stringify(storedPayload),
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
    const pending = raw.prepare('SELECT * FROM tasks WHERE provider = ? AND status = ? ORDER BY created_at ASC').all('higgsfield', 'pending')
    for (const task of pending) {
      const taskId = task.taskId || task.task_id
      if (this.processing.size >= this.maxConcurrent) break
      if (this.coolingDown.has(taskId)) continue
      if (!this.processing.has(taskId)) this.processTask(task)
    }
  }

  public async resolveMediaSource(raw: any, source?: string, assetId?: string, defaultMime = 'image/png'): Promise<string | null> {
    let resolvedSource = source
    let mime = defaultMime

    if (assetId) {
      const file = await resolveAssetFileForUpload(assetId)
      if (file) {
        resolvedSource = file.path
        mime = file.mime || defaultMime
      } else {
        // Not on disk (e.g. download failed): fall back to the provider URL
        try {
          const asset = raw.prepare('SELECT file_path, mime_type FROM assets WHERE id = ?').get(assetId) as any
          if (typeof asset?.filePath === 'string' && asset.filePath.startsWith('http')) {
            resolvedSource = asset.filePath
            mime = asset.mimeType || defaultMime
          }
        } catch {}
      }
    }

    if (!resolvedSource) return null

    const trimmed = String(resolvedSource).trim()

    const cacheKey = assetId || (trimmed.length < 500 && !trimmed.startsWith('http') ? trimmed : null)
    if (cacheKey && this.uploadCache.has(cacheKey)) {
      return this.uploadCache.get(cacheKey)!
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      // Remote URLs from other providers (MachGen, KIE tempfiles, fal/cloudfront, ...) are not
      // guaranteed to be reachable from Higgsfield's servers. Download the bytes and re-upload
      // them through Higgsfield's own upload flow so the generation API can always access them.
      try {
        const buffer = await this.apiClient.downloadAsset(trimmed)
        const publicUrl = await this.apiClient.uploadSource(buffer, mime)
        if (cacheKey) {
          this.uploadCache.set(cacheKey, publicUrl)
        }
        return publicUrl
      } catch {
        // Fall back to passing the URL through unchanged (previous behavior)
        return trimmed
      }
    }

    // Local file: Higgsfield only accepts MP4 video (mkv/webm/mov → 422 on content_type)
    let uploadSource = resolvedSource
    if (!trimmed.startsWith('data:') && syncFs.existsSync(trimmed)) {
      const prepared = await prepareUploadFile(trimmed, mime)
      uploadSource = prepared.path
      mime = prepared.mime || mime
    }
    const publicUrl = await this.apiClient.uploadSource(uploadSource, mime)
    if (cacheKey) {
      this.uploadCache.set(cacheKey, publicUrl)
    }
    return publicUrl
  }

  public buildInput(payload: any): HiggsfieldVideoInput {
    const prompt = String(payload?.prompt || '').trim()
    const modelStr = String(payload?.model || '').toLowerCase()
    const isKling = modelStr.includes('kling')
    const isSeedance25 = modelStr.includes('seedance-2.5')
    const isMiniMax = modelStr.includes('minimax') || modelStr.includes('hailuo')
    const isWan = modelStr.includes('wan')

    if (isMiniMax) {
      const isHailuo = modelStr.includes('hailuo')
      let duration = Number(payload?.duration) || 5
      if (isHailuo) {
        if (duration < 3) duration = 3
        if (duration > 10) duration = 10
      } else {
        if (duration < 5) duration = 5
        if (duration > 15) duration = 15
      }

      const resStr = String(payload?.resolution || '').toUpperCase()
      let resolution = '2K'
      if (isHailuo && resStr.includes('720')) resolution = '720p'
      else if (isHailuo && resStr.includes('1080')) resolution = '1080p'

      return {
        prompt,
        duration,
        resolution,
        aspect_ratio: payload?.aspectRatio || 'auto',
        aigc_watermark: false,
      } as any
    }

    if (isWan) {
      const isWanPrime = modelStr.includes('wan-3.0-prime')
      let duration = Number(payload?.duration) || 5
      if (duration < 2) duration = 2
      if (duration > 30) duration = 30

      const generateAudio = payload?.sound !== undefined
        ? (payload.sound !== false && payload.sound !== 'off')
        : (payload?.generate_audio !== undefined ? !!payload.generate_audio : true)

      if (isWanPrime) {
        let resolution: '480p' | '720p' | '1080p' = '1080p'
        const resStr = String(payload?.resolution || '').toLowerCase()
        if (resStr.includes('480')) resolution = '480p'
        else if (resStr.includes('720')) resolution = '720p'
        else if (resStr.includes('1080')) resolution = '1080p'

        const arStr = String(payload?.aspectRatio || '').toLowerCase()
        let aspectRatio: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive' = 'adaptive'
        if (['16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'].includes(arStr)) {
          aspectRatio = arStr as any
        }

        const input: Wan30PrimeInput = {
          prompt,
          duration,
          resolution,
          aspect_ratio: aspectRatio,
          generate_audio: generateAudio,
          ...(payload?.enable_thinking !== undefined ? { enable_thinking: !!payload.enable_thinking } : {}),
          ...(payload?.seed !== undefined ? { seed: Number(payload.seed) } : {}),
        }
        return input
      }

      let resolution: '480p' | '720p' | '1080p' = '720p'
      const resStr = String(payload?.resolution || '').toLowerCase()
      if (resStr.includes('480')) resolution = '480p'
      else if (resStr.includes('1080')) resolution = '1080p'

      return {
        prompt,
        duration,
        resolution,
        aspect_ratio: payload?.aspectRatio || '16:9',
        generate_audio: generateAudio,
      } as any
    }

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
      if (prompt) input.prompt = prompt
      if (multiPrompt && multiPrompt.length > 0) input.multi_prompt = multiPrompt
      if (Array.isArray(payload?.elements) && payload.elements.length > 0) input.elements = payload.elements
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
    else if (resStr.includes('1080')) resolution = '1080p'
    else if (!isSeedance25 && resStr.includes('4k')) resolution = '4k'

    let aspectRatio: SeedanceAspectRatio = '16:9'
    const arStr = String(payload?.aspectRatio || '').toLowerCase()
    if (['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'].includes(arStr)) {
      aspectRatio = arStr as SeedanceAspectRatio
    }

    const generateAudio = payload?.sound !== undefined
      ? (payload.sound !== false && payload.sound !== 'off')
      : (payload?.generate_audio !== undefined ? !!payload.generate_audio : true)

    if (isSeedance25) {
      const bitrateMode: 'standard' | 'high' = payload?.bitrate_mode === 'standard' ? 'standard' : 'high'
      const outputFormat: 'mp4' | 'mov' = payload?.output_format === 'mov' ? 'mov' : 'mp4'
      // Seedance 2.5 accepts 480p / 720p / 1080p (no 4k)
      const res25: '480p' | '720p' | '1080p' = (resolution === '480p' || resolution === '720p' || resolution === '1080p') ? resolution : '720p'
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

    raw.prepare('UPDATE tasks SET status = ?, started_at = ?, updated_at = ? WHERE task_id = ?')
      .run('processing', Date.now(), Date.now(), task.taskId)

    try {
      // Retry of an already-submitted task (e.g. a status check failed on the network): resume
      // the same Higgsfield job instead of resubmitting it, which would generate and charge twice
      const existingRequestId = task.requestId || task.externalId
      if (existingRequestId) {
        logRun(raw, task.taskId, 'recovery', `Resuming existing request: ${existingRequestId}`)
        const resumed = await this.pollTask(task.taskId, `/requests/${existingRequestId}/status`)
        await this.handleSuccess(task, resumed as HiggsfieldCompletedStatus)
        return
      }

      const payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : task.payload
      const isImage = task.type === 'image' || payload?.mode === 'image'
      const modelStr = String(payload?.model || '').toLowerCase()
      const prompt = String(payload?.prompt || '').trim()

      logRun(raw, task.taskId, 'start', `Iniciando tarea Higgsfield: model=${payload?.model || 'default'}`)

      // Resolve media inputs
      const firstFrameSource = payload.imageUrl || payload.firstFrameUrl || payload.firstFrameBase64 || payload.imageBase64 || payload.imageRefs?.[0]?.url || payload.imageRefs?.[0]?.base64
      const firstFrameAssetId = payload.imageAssetId || payload.firstFrameAssetId || payload.imageRefs?.[0]?.assetId
      const firstFrameUrl = await this.resolveMediaSource(raw, firstFrameSource, firstFrameAssetId, payload.imageMime || 'image/png')

      const endFrameSource = payload.lastFrameUrl || payload.lastFrameBase64 || payload.endImageUrl || payload.end_image_url
      const endFrameAssetId = payload.lastFrameAssetId
      const endFrameUrl = await this.resolveMediaSource(raw, endFrameSource, endFrameAssetId, 'image/png')

      // Resolve video references (e.g. from sequence mode or PromptComposer)
      const rawVideoRefs: any[] = []
      if (Array.isArray(payload.videoRefs) && payload.videoRefs.length > 0) {
        rawVideoRefs.push(...payload.videoRefs)
      }
      if (Array.isArray(payload.video_urls) && payload.video_urls.length > 0) {
        rawVideoRefs.push(...payload.video_urls)
      }
      if (Array.isArray(payload.videoUrls) && payload.videoUrls.length > 0) {
        rawVideoRefs.push(...payload.videoUrls)
      }
      if (payload.videoUrl) rawVideoRefs.push(payload.videoUrl)
      if (payload.video_url) rawVideoRefs.push(payload.video_url)

      const resolvedVideoUrls: string[] = []
      for (const v of rawVideoRefs) {
        const src = typeof v === 'string' ? v : (v?.url || v?.base64 || v?.localPath)
        const aId = typeof v === 'object' ? v?.assetId : undefined
        const u = await this.resolveMediaSource(raw, src, aId, 'video/mp4')
        if (u) resolvedVideoUrls.push(u)
      }

      // Resolve audio references
      const rawAudioRefs: any[] = []
      if (Array.isArray(payload.audioRefs)) rawAudioRefs.push(...payload.audioRefs)
      if (Array.isArray(payload.audio_urls)) rawAudioRefs.push(...payload.audio_urls)
      if (Array.isArray(payload.audioUrls)) rawAudioRefs.push(...payload.audioUrls)
      const resolvedAudioUrls: string[] = []
      for (const a of rawAudioRefs) {
        const src = typeof a === 'string' ? a : (a?.url || a?.base64)
        const aId = typeof a === 'object' ? a?.assetId : undefined
        const u = await this.resolveMediaSource(raw, src, aId, 'audio/mpeg')
        if (u) resolvedAudioUrls.push(u)
      }

      // Resolve multi-image references if any
      const rawImageRefs: any[] = []
      if (Array.isArray(payload.imageRefs) && payload.imageRefs.length > 1) {
        rawImageRefs.push(...payload.imageRefs.slice(1))
      }
      if (Array.isArray(payload.image_urls)) rawImageRefs.push(...payload.image_urls)
      const resolvedImageUrls: string[] = []
      if (firstFrameUrl) resolvedImageUrls.push(firstFrameUrl)
      for (const img of rawImageRefs) {
        const src = typeof img === 'string' ? img : (img?.url || img?.base64)
        const aId = typeof img === 'object' ? img?.assetId : undefined
        const u = await this.resolveMediaSource(raw, src, aId, 'image/png')
        if (u && !resolvedImageUrls.includes(u)) resolvedImageUrls.push(u)
      }

      let endpoint = normalizeHiggsfieldEndpoint(payload?.model || (isImage ? '/higgsfield-ai/soul/v2/standard' : '/bytedance/seedance-2.0/text-to-video'))
      let input: any = {}

      const isWan = modelStr.includes('wan')
      const isKling = modelStr.includes('kling')
      const isMiniMax = modelStr.includes('minimax') || modelStr.includes('hailuo')
      const isSeedance25 = modelStr.includes('seedance-2.5')

      const generateAudio = payload?.sound !== undefined
        ? (payload.sound !== false && payload.sound !== 'off')
        : (payload?.generate_audio !== undefined ? !!payload.generate_audio : true)

      // Endpoint routing shared by every Higgsfield video model. The composer only sends
      // firstFrame*/lastFrame* when the FF toggle is on; attached images otherwise are references.
      //  - explicit start/end frame (and no video/audio refs) → image-to-video
      //  - any reference (images, videos, audio) → reference-to-video, if the model has one
      //  - an image on a model without reference-to-video → image-to-video (first image as frame)
      //  - nothing attached → text-to-video
      const hasExplicitFrames = !!(payload?.firstFrameUrl || payload?.firstFrameBase64 || payload?.firstFrameAssetId || payload?.lastFrameUrl || payload?.lastFrameBase64 || payload?.lastFrameAssetId)
      const hasAvRefs = resolvedVideoUrls.length > 0 || resolvedAudioUrls.length > 0
      const routeVideo = (hasRefEndpoint: boolean): 't2v' | 'i2v' | 'ref' => {
        if (hasExplicitFrames && !hasAvRefs && firstFrameUrl) return 'i2v'
        if (hasRefEndpoint && (resolvedImageUrls.length > 0 || hasAvRefs)) return 'ref'
        if (firstFrameUrl) return 'i2v'
        return 't2v'
      }

      const isMarketingStudio =
        modelStr.includes('marketing-studio') ||
        modelStr.includes('graphic ads') ||
        modelStr.includes('graphic-ads') ||
        modelStr.includes('marketplace')

      const isAiInfluencer = modelStr.includes('ai-influencer')
      const isMotionTransfer = modelStr.includes('genjutsu/motion-transfer')
      // 'higgsfield/soul-2-0/text-to-video' is the id of the old "Soul 2.0 Cinema" entry
      const isCinemaStudio4 = modelStr.includes('cinema-studio/4.0') || modelStr.includes('soul-2-0')

      if (isAiInfluencer) {
        endpoint = '/higgsfield/ai-influencer'
        input = buildAiInfluencerInput(payload?.influencer, prompt, resolvedImageUrls)
      } else if (isMotionTransfer) {
        endpoint = '/higgsfield/genjutsu/motion-transfer/v1.0'
        if (resolvedVideoUrls.length === 0) {
          throw new Error('Motion Transfer necesita un video de origen')
        }
        if (resolvedImageUrls.length === 0) {
          throw new Error('Motion Transfer necesita al menos una imagen de referencia')
        }
        const resStr = String(payload?.resolution || '').toLowerCase()
        const resolution: GenjutsuMotionTransferInput['resolution'] =
          resStr.includes('480') ? '480p' : resStr.includes('1080') ? '1080p' : '720p'
        const mtInput: GenjutsuMotionTransferInput = {
          video_url: resolvedVideoUrls[0],
          image_urls: resolvedImageUrls.slice(0, 8),
          resolution,
        }
        if (prompt) mtInput.prompt = prompt.slice(0, 10000)
        input = mtInput
      } else if (isCinemaStudio4) {
        endpoint = '/higgsfield/cinema-studio/4.0'
        input = buildCinemaStudio4Input(payload, prompt, resolvedImageUrls, resolvedVideoUrls, resolvedAudioUrls, generateAudio)
      } else if (isMarketingStudio) {
        endpoint = '/marketing-studio/image'
        const isMarketplace = modelStr.includes('marketplace')
        const defaultPreset = isMarketplace
          ? 'f188a40a-098a-5fb3-bffc-eedfeaf9ecd7'
          : 'ef84af61-57cd-5f2e-b3ca-209d8038563c'

        const resStr = String(payload?.resolution || '2k').toLowerCase()
        const resolution = (resStr === '1k' || resStr === '2k' || resStr === '4k') ? resStr : '2k'
        const arStr = String(payload?.aspectRatio || payload?.aspect_ratio || 'auto').toLowerCase()
        const validAR = ['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9']
        const aspectRatio = validAR.includes(arStr) ? arStr : 'auto'

        const moderation: 'auto' | 'low' = payload?.moderation === 'low' ? 'low' : 'auto'
        const presetId = String(payload?.presetId || payload?.preset_id || defaultPreset).trim()
        const hasImages = resolvedImageUrls.length > 0
        const requestedEnhance = payload?.enhancePrompt ?? payload?.enhance_prompt

        // In Higgsfield Marketing Studio schema:
        // When enhance_prompt is true, image_urls (1-2 items) and preset_id are required, quality is 'high'.
        // When no images are provided (text-only direct generation), enhance_prompt must be false.
        const enhancePrompt = requestedEnhance !== undefined
          ? Boolean(requestedEnhance && hasImages)
          : hasImages

        const msInput: MarketingStudioImageInput = {
          prompt,
          moderation,
          resolution: resolution as '1k' | '2k' | '4k',
          aspect_ratio: aspectRatio as any,
          enhance_prompt: enhancePrompt,
        }

        if (enhancePrompt) {
          msInput.preset_id = presetId
          msInput.quality = 'high'
          msInput.image_urls = resolvedImageUrls.slice(0, 2)
        } else {
          const quality: 'low' | 'medium' | 'high' = payload?.quality === 'low' || payload?.quality === 'medium' ? payload.quality : 'high'
          msInput.quality = quality
          if (presetId) {
            msInput.preset_id = presetId
          }
          if (hasImages) {
            msInput.image_urls = resolvedImageUrls.slice(0, 16)
          }
        }

        input = msInput
      } else if (isImage) {
        endpoint = normalizeHiggsfieldEndpoint(payload?.model || '/higgsfield-ai/soul/v2/standard')

        const isGrok = modelStr.includes('grok')
        const isIdeogram = modelStr.includes('ideogram')
        const isRecraft = modelStr.includes('recraft')
        const isQwen = modelStr.includes('qwen')
        const isZImage = modelStr.includes('z-image')

        if (isGrok) {
          endpoint = '/xai/grok-imagine-image-2.0'
          const resStr = String(payload?.resolution || '').toLowerCase().trim()
          const resolution: '1k' | '2k' = (resStr.includes('2k') || resStr.includes('1080') || resStr.includes('4k')) ? '2k' : '1k'
          const arStr = String(payload?.aspectRatio || payload?.aspect_ratio || 'auto').toLowerCase()
          const validGrokAR = ['auto', '1:1', '1:2', '2:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16']
          const aspect_ratio = validGrokAR.includes(arStr) ? arStr : 'auto'
          const quality: 'low' | 'medium' = payload?.quality === 'low' ? 'low' : 'medium'

          input = {
            prompt,
            quality,
            resolution,
            aspect_ratio,
            ...(resolvedImageUrls.length > 0 ? { image_urls: resolvedImageUrls } : {}),
          }
        } else if (isIdeogram) {
          endpoint = '/ideogram/v4.0'
          const arStr = String(payload?.aspectRatio || payload?.aspect_ratio || '1:1').toLowerCase()
          const validAR = ['1:1', '1:2', '2:1', '2:3', '3:2', '4:5', '5:4', '9:16', '16:9', '5:8', '8:5', '3:4', '4:3', '9:22', '22:9', '9:23', '23:9', '3:8', '8:3', '5:12', '12:5', '1:3', '3:1']
          const aspect_ratio = validAR.includes(arStr) ? arStr : '1:1'
          const renderingSpeed = payload?.renderingSpeed || payload?.rendering_speed || 'DEFAULT'

          input = {
            prompt,
            aspect_ratio,
            rendering_speed: renderingSpeed,
            ...(firstFrameUrl ? { image_url: firstFrameUrl } : {}),
            ...(payload?.imageWeight ? { image_weight: payload.imageWeight } : {}),
          }
        } else if (isRecraft) {
          endpoint = '/recraft/v4.1/text-to-image'
          const arStr = String(payload?.aspectRatio || payload?.aspect_ratio || '1:1').toLowerCase()
          const validAR = ['1:1', '2:1', '1:2', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '6:10', '14:10', '10:14', '16:9', '9:16']
          const aspect_ratio = validAR.includes(arStr) ? arStr : '1:1'

          input = {
            prompt,
            resolution: '1k',
            aspect_ratio,
            output_format: payload?.outputFormat || 'jpg',
          }
        } else if (isQwen) {
          endpoint = '/alibaba/qwen-image-3/text-to-image'
          const resStr = String(payload?.resolution || '').toLowerCase().trim()
          const resolution: '1k' | '2k' = (resStr.includes('2k') || resStr.includes('1080') || resStr.includes('4k')) ? '2k' : '1k'
          const arStr = String(payload?.aspectRatio || payload?.aspect_ratio || '1:1').toLowerCase()
          const validAR = ['1:1', '2:3', '3:2', '3:4', '4:3', '7:9', '9:7', '9:16', '16:9', '21:9']
          const aspect_ratio = validAR.includes(arStr) ? arStr : '1:1'

          input = {
            prompt,
            resolution,
            aspect_ratio,
            prompt_extend: payload?.promptExtend ?? true,
            enable_thinking: payload?.enableThinking ?? true,
            prompt_extend_mode: payload?.promptExtendMode || 'direct',
            ...(payload?.seed !== undefined ? { seed: payload.seed } : {}),
          }
        } else if (isZImage) {
          endpoint = '/z-image/turbo'
          const resStr = String(payload?.resolution || '').toLowerCase().trim()
          const resolution: '1k' | '2k' = (resStr.includes('2k') || resStr.includes('1080') || resStr.includes('4k')) ? '2k' : '1k'
          const arStr = String(payload?.aspectRatio || payload?.aspect_ratio || '1:1').toLowerCase()
          const validAR = ['1:1', '2:3', '3:2', '3:4', '4:3', '7:9', '9:7', '9:16', '16:9', '21:9']
          const aspect_ratio = validAR.includes(arStr) ? arStr : '1:1'

          input = {
            prompt,
            resolution,
            aspect_ratio,
            prompt_extend: false,
            ...(payload?.seed !== undefined ? { seed: payload.seed } : {}),
          }
        } else {
          // Soul v1 (soul/standard), Soul Cinema (soul/cinema), Soul Image 2.0 (soul/v2/standard, default)
          if (endpoint.includes('soul/cinema')) {
            endpoint = '/higgsfield-ai/soul/cinema'
          } else if (endpoint.includes('soul/standard') && !endpoint.includes('soul/v2')) {
            endpoint = '/higgsfield-ai/soul/standard'
          } else {
            endpoint = '/higgsfield-ai/soul/v2/standard'
          }
          const isSoulV1 = endpoint === '/higgsfield-ai/soul/standard'

          let resolution: '720p' | '1080p' = '720p'
          const resStr = String(payload?.resolution || '').toLowerCase().trim()
          if (resStr.includes('1080') || resStr.includes('2k') || resStr.includes('4k') || resStr.includes('pro')) {
            resolution = '1080p'
          } else {
            resolution = '720p'
          }

          const arStr = String(payload?.aspectRatio || payload?.aspect_ratio || '4:3').toLowerCase()
          const validAR = ['9:16', '16:9', '4:3', '3:4', '1:1', '2:3', '3:2']
          const aspect_ratio = validAR.includes(arStr) ? arStr : '4:3'

          input = {
            prompt,
            aspect_ratio,
            resolution,
            enhance_prompt: payload?.enhancePrompt ?? true,
            // Only Soul v1 takes an image, as image_reference_url (it guides prompt enhancement)
            ...(isSoulV1 && firstFrameUrl ? { image_reference_url: firstFrameUrl } : {}),
            // Cinema and v2 reject an explicit null seed
            ...(payload?.seed != null ? { seed: payload.seed } : {}),
            // The API takes 1 or 4, but only images[0] is saved, so a batch of 4 would bill 4 for 1
            batch_size: 1,
          }
        }
      } else if (isKling) {
        const sound: 'on' | 'off' = generateAudio ? 'on' : 'off'
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

        if (firstFrameUrl) {
          endpoint = '/kling-video/v3.0/std/image-to-video'
          input = {
            image_url: firstFrameUrl,
            prompt,
            sound,
            duration,
            cfg_scale: cfgScale,
            multi_shots: multiShots,
            ...(multiPrompt && multiPrompt.length > 0 ? { multi_prompt: multiPrompt } : {}),
            ...(Array.isArray(payload?.elements) && payload.elements.length > 0 ? { elements: payload.elements } : {}),
          }
        } else {
          endpoint = '/kling-video/v3.0/std/text-to-video'
          input = {
            prompt,
            sound,
            duration,
            aspect_ratio: aspectRatio,
            cfg_scale: cfgScale,
            multi_shots: multiShots,
            ...(multiPrompt && multiPrompt.length > 0 ? { multi_prompt: multiPrompt } : {}),
            ...(Array.isArray(payload?.elements) && payload.elements.length > 0 ? { elements: payload.elements } : {}),
          }
        }
      } else if (isWan) {
        const isWanPrime = modelStr.includes('wan-3.0-prime')

        let duration = Number(payload?.duration) || 5
        if (duration < 2) duration = 2
        if (duration > 30) duration = 30

        if (isWanPrime) {
          let resolution: '480p' | '720p' | '1080p' = '1080p'
          const resStr = String(payload?.resolution || '').toLowerCase()
          if (resStr.includes('480')) resolution = '480p'
          else if (resStr.includes('720')) resolution = '720p'
          else if (resStr.includes('1080')) resolution = '1080p'

          const arStr = String(payload?.aspectRatio || '').toLowerCase()
          let aspect_ratio: string = 'adaptive'
          if (['16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'].includes(arStr)) {
            aspect_ratio = arStr
          }

          const seed = payload?.seed !== undefined ? Number(payload.seed) : undefined
          const enableThinking = payload?.enable_thinking !== undefined ? !!payload.enable_thinking : undefined
          const fileUrl = payload?.file_url || payload?.fileUrl || undefined
          const linkUrl = payload?.link_url || payload?.linkUrl || undefined

          const route = routeVideo(true)
          if (route === 'ref' || fileUrl || linkUrl) {
            endpoint = '/alibaba/wan-3.0-prime/reference-to-video'
            input = {
              prompt,
              ...(resolvedImageUrls.length > 0 ? { image_urls: resolvedImageUrls } : {}),
              ...(resolvedVideoUrls.length > 0 ? { video_urls: resolvedVideoUrls } : {}),
              ...(resolvedAudioUrls.length > 0 ? { audio_urls: resolvedAudioUrls } : {}),
              duration,
              resolution,
              aspect_ratio,
              generate_audio: generateAudio,
              ...(seed !== undefined ? { seed } : {}),
              ...(enableThinking !== undefined ? { enable_thinking: enableThinking } : {}),
              ...(fileUrl ? { file_url: fileUrl } : {}),
              ...(linkUrl ? { link_url: linkUrl } : {}),
            }
          } else if (route === 'i2v') {
            endpoint = '/alibaba/wan-3.0-prime/image-to-video'
            input = {
              prompt,
              image_url: firstFrameUrl,
              ...(endFrameUrl ? { end_image_url: endFrameUrl } : {}),
              duration,
              resolution,
              aspect_ratio,
              generate_audio: generateAudio,
              ...(seed !== undefined ? { seed } : {}),
              ...(enableThinking !== undefined ? { enable_thinking: enableThinking } : {}),
            }
          } else {
            endpoint = '/alibaba/wan-3.0-prime/text-to-video'
            input = {
              prompt,
              duration,
              resolution,
              aspect_ratio,
              generate_audio: generateAudio,
              ...(seed !== undefined ? { seed } : {}),
              ...(enableThinking !== undefined ? { enable_thinking: enableThinking } : {}),
            }
          }
        } else {
          let resolution: '480p' | '720p' | '1080p' = '720p'
          const resStr = String(payload?.resolution || '').toLowerCase()
          if (resStr.includes('480')) resolution = '480p'
          else if (resStr.includes('1080')) resolution = '1080p'
          else resolution = '720p'

          const aspect_ratio = payload?.aspectRatio || '16:9'

          const route = routeVideo(true)
          if (route === 'ref') {
            endpoint = '/alibaba/wan-3.0/reference-to-video'
            input = {
              prompt,
              ...(resolvedVideoUrls.length > 0 ? { video_urls: resolvedVideoUrls } : {}),
              ...(resolvedImageUrls.length > 0 ? { image_urls: resolvedImageUrls } : {}),
              ...(resolvedAudioUrls.length > 0 ? { audio_urls: resolvedAudioUrls } : {}),
              duration,
              resolution,
              aspect_ratio,
              generate_audio: generateAudio,
            }
          } else if (route === 'i2v') {
            endpoint = '/alibaba/wan-3.0/image-to-video'
            input = {
              prompt,
              image_url: firstFrameUrl,
              ...(endFrameUrl ? { end_image_url: endFrameUrl } : {}),
              duration,
              resolution,
              aspect_ratio,
              generate_audio: generateAudio,
            }
          } else {
            endpoint = '/alibaba/wan-3.0/text-to-video'
            input = {
              prompt,
              duration,
              resolution,
              aspect_ratio,
              generate_audio: generateAudio,
            }
          }
        }
      } else if (isMiniMax) {
        const isHailuo = modelStr.includes('hailuo')

        let duration = Number(payload?.duration) || 5
        if (isHailuo) {
          if (duration < 3) duration = 3
          if (duration > 10) duration = 10
        } else {
          if (duration < 5) duration = 5
          if (duration > 15) duration = 15
        }

        // MiniMax H3 (Video Generation V2) is 2K only; Hailuo keeps its resolutions
        const resStr = String(payload?.resolution || '').toUpperCase()
        let resolution = '2K'
        if (isHailuo && resStr.includes('720')) resolution = '720p'
        else if (isHailuo && resStr.includes('1080')) resolution = '1080p'

        const arStr = String(payload?.aspectRatio || '').toLowerCase()
        let aspect_ratio: string = payload?.aspectRatio || 'auto'
        if (['auto', 'adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(arStr)) {
          aspect_ratio = arStr
        }

        const route = routeVideo(!isHailuo)
        if (route === 'ref') {
          // MiniMax H3 with reference images (and/or videos/audio) → reference-to-video
          endpoint = '/minimax/h3/reference-to-video'
          input = {
            prompt,
            ...(resolvedImageUrls.length > 0 ? { image_urls: resolvedImageUrls.slice(0, 9) } : {}),
            ...(resolvedVideoUrls.length > 0 ? { video_urls: resolvedVideoUrls.slice(0, 3) } : {}),
            ...(resolvedAudioUrls.length > 0 ? { audio_urls: resolvedAudioUrls.slice(0, 3) } : {}),
            duration,
            resolution: '2K',
            aspect_ratio,
            aigc_watermark: false,
          }
        } else if (route === 'i2v') {
          // FF toggle (or Hailuo with an image) → I2V with first frame (+ optional last frame)
          endpoint = isHailuo ? '/minimax/hailuo-2.3/standard/image-to-video' : '/minimax/h3/image-to-video'
          input = {
            prompt,
            image_url: firstFrameUrl,
            ...(endFrameUrl ? { end_image_url: endFrameUrl } : {}),
            duration,
            resolution,
            aspect_ratio,
            aigc_watermark: false,
          }
        } else {
          endpoint = isHailuo ? '/minimax/hailuo-2.3/standard/text-to-video' : '/minimax/h3/text-to-video'
          input = {
            prompt,
            duration,
            resolution,
            aspect_ratio,
            aigc_watermark: false,
          }
        }
      } else if (isSeedance25) {
        let duration = Number(payload?.duration) || 5
        if (duration < 4) duration = 4
        if (duration > 30) duration = 30

        // Seedance 2.5 accepts 480p / 720p / 1080p (no 4k)
        const res25Str = String(payload?.resolution || '')
        const res25: '480p' | '720p' | '1080p' = res25Str.includes('480') ? '480p' : res25Str.includes('1080') ? '1080p' : '720p'
        let aspectRatio: SeedanceAspectRatio = '16:9'
        const arStr = String(payload?.aspectRatio || '').toLowerCase()
        if (['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'].includes(arStr)) {
          aspectRatio = arStr as SeedanceAspectRatio
        }

        const bitrate_mode: 'standard' | 'high' = payload?.bitrate_mode === 'standard' ? 'standard' : 'high'
        const output_format: 'mp4' | 'mov' = payload?.output_format === 'mov' ? 'mov' : 'mp4'

        const route = routeVideo(true)
        if (route === 'ref') {
          endpoint = '/bytedance/seedance-2.5/reference-to-video'
          input = {
            prompt,
            duration,
            resolution: res25,
            aspect_ratio: aspectRatio,
            ...(resolvedVideoUrls.length > 0 ? { video_urls: resolvedVideoUrls } : {}),
            ...(resolvedImageUrls.length > 0 ? { image_urls: resolvedImageUrls } : {}),
            ...(resolvedAudioUrls.length > 0 ? { audio_urls: resolvedAudioUrls } : {}),
            bitrate_mode,
            output_format,
            generate_audio: generateAudio,
          }
        } else if (route === 'i2v') {
          endpoint = '/bytedance/seedance-2.5/image-to-video'
          input = {
            prompt,
            image_url: firstFrameUrl,
            ...(endFrameUrl ? { end_image_url: endFrameUrl } : {}),
            duration,
            resolution: res25,
            bitrate_mode,
            output_format,
            generate_audio: generateAudio,
          }
        } else {
          endpoint = '/bytedance/seedance-2.5/text-to-video'
          input = {
            prompt,
            duration,
            resolution: res25,
            aspect_ratio: aspectRatio,
            bitrate_mode,
            output_format,
            generate_audio: generateAudio,
          }
        }
      } else {
        // Seedance 2.0 (default)
        let duration = Number(payload?.duration) || 5
        if (duration < 4) duration = 4
        if (duration > 15) duration = 15

        let resolution: SeedanceResolution = '720p'
        const resStr = String(payload?.resolution || '').toLowerCase()
        if (resStr.includes('480')) resolution = '480p'
        else if (resStr.includes('720')) resolution = '720p'
        else if (resStr.includes('1080')) resolution = '1080p'
        else if (resStr.includes('4k')) resolution = '4k'

        let aspectRatio: SeedanceAspectRatio = '16:9'
        const arStr = String(payload?.aspectRatio || '').toLowerCase()
        if (['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'].includes(arStr)) {
          aspectRatio = arStr as SeedanceAspectRatio
        }

        const route = routeVideo(true)
        if (route === 'ref') {
          endpoint = '/bytedance/seedance-2.0/reference-to-video'
          input = {
            prompt,
            duration,
            resolution,
            aspect_ratio: aspectRatio,
            ...(resolvedVideoUrls.length > 0 ? { video_urls: resolvedVideoUrls } : {}),
            ...(resolvedImageUrls.length > 0 ? { image_urls: resolvedImageUrls } : {}),
            ...(resolvedAudioUrls.length > 0 ? { audio_urls: resolvedAudioUrls } : {}),
            generate_audio: generateAudio,
          }
        } else if (route === 'i2v') {
          endpoint = '/bytedance/seedance-2.0/image-to-video'
          input = {
            prompt,
            image_url: firstFrameUrl,
            ...(endFrameUrl ? { end_image_url: endFrameUrl } : {}),
            duration,
            resolution,
            aspect_ratio: aspectRatio,
            generate_audio: generateAudio,
          }
        } else {
          endpoint = '/bytedance/seedance-2.0/text-to-video'
          input = {
            prompt,
            duration,
            resolution,
            aspect_ratio: aspectRatio,
            generate_audio: generateAudio,
          }
        }
      }

      const displayPrompt = String(input.prompt || input.multi_prompt?.[0]?.prompt || '').substring(0, 60)
      logRun(raw, task.taskId, 'submit', `Enviando a Higgsfield (${endpoint}): prompt="${displayPrompt}"`, input)

      const submitRes = await this.apiClient.generate(endpoint, input)
      const hfRequestId = submitRes.request_id

      if (submitRes.cancel_url) {
        this.cancelUrls.set(task.taskId, submitRes.cancel_url)
      }

      logRun(raw, task.taskId, 'submitted', `Higgsfield request_id asignado: ${hfRequestId}`)

      raw.prepare('UPDATE tasks SET request_id = ?, external_id = ?, updated_at = ? WHERE task_id = ?')
        .run(hfRequestId, hfRequestId, Date.now(), task.taskId)

      if (submitRes.status === 'completed') {
        await this.handleSuccess(task, submitRes as HiggsfieldCompletedStatus)
        return
      }

      if (submitRes.status === 'failed') {
        throw new Error((submitRes as any).error || 'La tarea falló al enviarse a Higgsfield')
      }

      if (submitRes.status === 'nsfw') {
        throw new Error('Contenido marcado por filtro de seguridad (NSFW)')
      }

      if (submitRes.status === 'canceled') {
        throw new Error('La tarea fue cancelada')
      }

      const finalStatus = await this.pollTask(task.taskId, submitRes.status_url)
      await this.handleSuccess(task, finalStatus as HiggsfieldCompletedStatus)
    } catch (err: any) {
      logRun(raw, task.taskId, 'error', `Task failed: ${err.message}`, null, 'error')
      forgetFailedJob(task.taskId, err)
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
        throw new RemoteJobFailedError((statusRes as any).error || 'Higgsfield generation failed')
      }

      if (statusRes.status === 'nsfw') {
        throw new Error('Content flagged by safety filter (NSFW)')
      }

      if (statusRes.status === 'canceled') {
        throw new Error('Task was canceled')
      }

      raw.prepare('UPDATE tasks SET updated_at = ? WHERE task_id = ?').run(Date.now(), taskId)
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
      if (!placeholder) {
        // Placeholder gone (e.g. a reconciled task whose row was cleaned up): create the asset
        const cols = ['id', 'type', 'provider', 'credits_used', 'task_id', 'workspace_id', 'created_at', 'updated_at', ...Object.keys(fields)]
        raw.prepare(`INSERT INTO assets (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(
          assetId, isImage ? 'image' : 'video', 'higgsfield', 0, task.taskId,
          task.workspaceId || getTaskWorkspace(task.taskId), task.createdAt || Date.now(), Date.now(),
          ...Object.values(fields),
        )
        return assetId
      }
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
          model_used: taskPayload?.model || (isImage ? 'higgsfield-ai/soul/v2/standard' : 'bytedance/seedance-2.0/text-to-video'),
          prompt: taskPayload?.prompt || '',
          parameters: JSON.stringify(redactPayload(taskPayload)),
          file_size: fileSize,
        })
      } catch (err: any) {
        logRun(raw, task.taskId, 'download-error', `Download failed: ${err.message}`, null, 'error')
        console.error('[HiggsfieldQueue] Failed to download asset:', err.message)
        localAssetId = updatePlaceholder({
          file_path: remoteUrl,
          file_name: `remote-${assetId}.${ext}`,
          mime_type: mime,
          model_used: taskPayload?.model || (isImage ? 'higgsfield-ai/soul/v2/standard' : 'bytedance/seedance-2.0/text-to-video'),
          prompt: taskPayload?.prompt || '',
          parameters: JSON.stringify(redactPayload(taskPayload)),
        })
      }
    } else {
      localAssetId = updatePlaceholder({
        file_path: '',
        file_name: `completed-${assetId}.${ext}`,
        mime_type: mime,
        model_used: taskPayload?.model || (isImage ? 'higgsfield-ai/soul/v2/standard' : 'bytedance/seedance-2.0/text-to-video'),
        prompt: taskPayload?.prompt || '',
        parameters: JSON.stringify(redactPayload(taskPayload)),
      })
    }

    raw.prepare(
      'UPDATE tasks SET status = ?, result_asset_id = ?, progress = 100, completed_at = ?, updated_at = ? WHERE task_id = ?'
    ).run('completed', localAssetId || assetId, Date.now(), Date.now(), task.taskId)

    raw.save()

    logRun(raw, task.taskId, 'complete', `Higgsfield task completed successfully! Asset: ${localAssetId}`)
    this.emit('task:completed', { taskId: task.taskId, assetId: localAssetId || assetId })
  }

  private async handleFailure(task: any, errorMessage: string) {
    const raw = getRawDb()
    const taskId = task.taskId || task.task_id
    const currentRetries = (task.retryCount ?? task.retry_count ?? 0)
    const retryCount = currentRetries + 1

    const isNonRetryable =
      errorMessage.includes('400') ||
      errorMessage.includes('401') ||
      errorMessage.includes('403') ||
      errorMessage.includes('404') ||
      errorMessage.includes('422') ||
      errorMessage.includes('NSFW') ||
      errorMessage.includes('canceled') ||
      errorMessage.includes('API key') ||
      errorMessage.toLowerCase().includes('credenciales') ||
      errorMessage.toLowerCase().includes('credentials') ||
      errorMessage.toLowerCase().includes('validation') ||
      errorMessage.toLowerCase().includes('incorrect') ||
      errorMessage.toLowerCase().includes('unsupported')

    // Only resume an accepted job; never resubmit (see canAutoResume)
    if (currentRetries < MAX_RETRIES && !isNonRetryable && canAutoResume(taskId)) {
      logRun(raw, taskId, 'retry', `Retrying task (${retryCount}/${MAX_RETRIES}): ${errorMessage}`, null, 'warn')
      raw.prepare(
        'UPDATE tasks SET status = ?, retry_count = ?, error_message = ?, updated_at = ? WHERE task_id = ?'
      ).run('pending', retryCount, errorMessage, Date.now(), taskId)
      raw.save()

      this.coolingDown.add(taskId)
      setTimeout(() => {
        this.coolingDown.delete(taskId)
        this.processQueue()
      }, 5000 * retryCount)
    } else {
      logRun(raw, taskId, 'failed', `Higgsfield task marked as failed: ${errorMessage}`, null, 'error')
      raw.prepare(
        'UPDATE tasks SET status = ?, error_message = ?, updated_at = ? WHERE task_id = ?'
      ).run('failed', errorMessage, Date.now(), taskId)

      // Keep the placeholder as an error card (the grid shows the message)
      markPlaceholderFailed(taskId, errorMessage)
      raw.save()

      this.emit('task:failed', { taskId, error: errorMessage })
    }
  }

  // ─── RecoverableQueue (see task-recovery.ts) ─────────────────

  async checkRemote(task: any, requestId: string): Promise<RemoteTaskStatus> {
    const statusRes = await this.apiClient.getStatus(`/requests/${requestId}/status`)
    if (statusRes.status === 'completed') return { state: 'completed', result: statusRes }
    if (statusRes.status === 'failed') return { state: 'failed', error: (statusRes as any).error || 'Higgsfield generation failed' }
    if (statusRes.status === 'nsfw') return { state: 'failed', error: 'Content flagged by safety filter (NSFW)' }
    if (statusRes.status === 'canceled') return { state: 'failed', error: 'Task was canceled' }
    if (statusRes.cancel_url) this.cancelUrls.set(task.taskId, statusRes.cancel_url)
    return { state: 'running', detail: statusRes.status }
  }

  async completeRemote(task: any, result: HiggsfieldCompletedStatus): Promise<void> {
    this.cancelUrls.delete(task.taskId)
    await this.handleSuccess(task, result)
  }

  cancelTask(taskId: string): boolean {
    const raw = getRawDb()
    const task = raw.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as any
    if (!task) return false

    if (task.status === 'completed' || task.status === 'failed') return false

    const cancelUrl = this.cancelUrls.get(taskId)
    if (cancelUrl) {
      this.apiClient.cancel(cancelUrl).catch(() => {})
      this.cancelUrls.delete(taskId)
    }

    raw.prepare('UPDATE tasks SET status = ?, error_message = ?, updated_at = ? WHERE task_id = ?')
      .run('failed', 'Cancelled by user', Date.now(), taskId)

    markPlaceholderFailed(taskId, 'Cancelled by user')
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

registerRecoverableProvider('higgsfield', () => {
  const key = readApiKey('higgsfieldApiKey')
  return key ? getHiggsfieldQueue(key) : null
})
