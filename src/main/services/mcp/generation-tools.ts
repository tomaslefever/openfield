import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import { getRawDb } from '../../db'
import { getAssetManager } from '../asset-manager'
import { resolveAssetFile, runFfmpeg } from '../asset-file'
import { getActiveWorkspaceId } from '../workspace-service'
import { getProviderQueue } from '../task-recovery'
import { normalizeProvider, routeModelToProvider, type QueueProvider } from '../provider-router'
import { notifyAssetsChanged, notifyAssetUpdated } from '../../ipc/assets'
import { requireLibraryCheck } from './library-gate'
import { IMAGE_MODELS } from '../kie/models'
import { pVideo2Kind, routePVideo2Model } from '../pruna/inputs'
// Each queue registers itself as a recoverable provider when its module loads
import '../task-queue'
import '../fal-queue'
import '../higgsfield-queue'
import '../machgen-queue'
import '../replicate-queue'
import '../apimart-queue'
import '../kling-queue'
import '../pruna-queue'
import {
  type McpTool,
  ToolInputError,
  ToolContent,
  READ_ONLY,
  DESTRUCTIVE,
  EDIT,
  GENERATE,
  CREATE,
  str,
  num,
  optStr,
} from './types'

// ─── Asset helpers ─────────────────────────────────────────────────────────────
// Rows come back camelCased from the DB wrapper (model_used → modelUsed).

/** model_used values of assets that were added by the user, not generated */
const NON_GENERATED_MODELS = ['upload', 'ref', 'import']

const TERMINAL_TASK_STATUSES = ['completed', 'failed', 'cancelled']

/** Single-asset fields of a generation payload, by the role they play */
const FRAME_KEYS: Record<string, string> = {
  imageAssetId: 'input_image',
  firstFrameAssetId: 'start_frame',
  lastFrameAssetId: 'end_frame',
  audioAssetId: 'input_audio',
}
const REF_LIST_KEYS: Record<string, string> = {
  imageRefs: 'image_reference',
  imageRefEntries: 'image_reference',
  videoRefs: 'video_reference',
  audioRefs: 'audio_reference',
}
/** Ids and timings of a previous run: resubmitting with them would resume/relink the old job */
const RUNTIME_KEYS = [
  'kieTaskId', 'requestId', 'predictionId', 'externalId',
  'generationTimeSeconds', 'generationTimeMs', 'generationTime', 'costTime',
  'sceneId', 'transitionId',
  'draftSourceTaskId', 'draftFinalTaskId', 'draftFinalAssetId', 'draftFinalError',
]

function parseJson(text: any): any {
  if (!text || typeof text !== 'string') return null
  try { return JSON.parse(text) } catch { return null }
}

function truncate(text: any, max: number): string {
  const s = typeof text === 'string' ? text : ''
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

/** `latest` → the most recent generated asset of the active workspace. */
function resolveAssetId(id: string): string {
  if (id !== 'latest') return id
  const row = getRawDb().prepare(
    `SELECT id FROM assets WHERE workspace_id = ? AND (is_archived = 0 OR is_archived IS NULL)
     AND model_used NOT IN ('upload', 'ref', 'import') ORDER BY created_at DESC LIMIT 1`,
  ).get(getActiveWorkspaceId()) as any
  if (!row) throw new ToolInputError('There are no generations in the active workspace yet')
  return row.id
}

export function requireAsset(id: string): any {
  const resolved = resolveAssetId(id)
  const asset = getAssetManager().getAsset(resolved) as any
  if (!asset) throw new ToolInputError(`Asset '${id}' not found. Use list_assets to find asset ids.`)
  return asset
}

function getTaskRow(taskId?: string | null): any {
  if (!taskId) return null
  return getRawDb().prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) || null
}

function assetState(asset: any): { status: 'ready' | 'pending' | 'failed'; error?: string; localPath: string | null } {
  const filePath: string = asset.filePath || ''
  if (filePath.startsWith('__error__')) {
    return { status: 'failed', error: filePath.replace(/^__error__:?/, '') || 'Generation failed', localPath: null }
  }
  const file = resolveAssetFile(asset.id)
  if (file) return { status: 'ready', localPath: file.path }
  const task = getTaskRow(asset.taskId)
  if (task && (task.status === 'failed' || task.status === 'cancelled')) {
    return { status: 'failed', error: task.errorMessage || `Task ${task.status}`, localPath: null }
  }
  if (filePath.startsWith('http') && (!task || task.status === 'completed')) return { status: 'ready', localPath: null }
  return { status: 'pending', localPath: null }
}

function isGenerated(asset: any): boolean {
  return Boolean(asset.taskId) || !NON_GENERATED_MODELS.includes(asset.modelUsed)
}

interface ReferenceInfo {
  role: string
  assetId: string | null
  refType?: string
  name?: string
  mime?: string
  url?: string
  available?: boolean
}

/** Every media input of a generation payload (frames + reference lists), deduplicated. */
function extractReferences(payload: any, checkAvailability = true): ReferenceInfo[] {
  if (!payload || typeof payload !== 'object') return []
  const refs: ReferenceInfo[] = []
  const seen = new Set<string>()
  const push = (ref: ReferenceInfo) => {
    const key = `${ref.role}:${ref.assetId || ref.url || ref.name}`
    if (seen.has(key)) return
    seen.add(key)
    if (checkAvailability) ref.available = ref.assetId ? Boolean(resolveAssetFile(ref.assetId)) : Boolean(ref.url)
    refs.push(ref)
  }
  for (const [key, role] of Object.entries(FRAME_KEYS)) {
    if (typeof payload[key] === 'string' && payload[key]) push({ role, assetId: payload[key] })
  }
  for (const [key, role] of Object.entries(REF_LIST_KEYS)) {
    if (!Array.isArray(payload[key])) continue
    for (const r of payload[key]) {
      if (!r || typeof r !== 'object') continue
      const url = typeof r.url === 'string' && r.url.startsWith('http') ? r.url : undefined
      if (!r.assetId && !url) continue // inline media that was never persisted: not reusable
      push({ role, assetId: r.assetId || null, refType: r.refType, name: r.name, mime: r.mime, url })
    }
  }
  return refs
}

interface Generation {
  provider: QueueProvider
  type: string
  payload: any
}

/**
 * The parameters a generation was submitted with. tasks.payload is the most complete copy
 * (refs keep their urls); assets.parameters back-fills asset ids persisted after enqueue.
 */
function loadGeneration(asset: any): Generation | null {
  if (!isGenerated(asset)) return null
  const task = getTaskRow(asset.taskId)
  const params = parseJson(asset.parameters) || {}
  const payload = parseJson(task?.payload) || { ...params }

  for (const key of Object.keys(FRAME_KEYS)) {
    if (!payload[key] && params[key]) payload[key] = params[key]
  }
  for (const key of Object.keys(REF_LIST_KEYS)) {
    if (!Array.isArray(params[key])) continue
    if (!Array.isArray(payload[key])) { payload[key] = params[key]; continue }
    payload[key].forEach((r: any, i: number) => {
      if (r && typeof r === 'object' && !r.assetId && params[key][i]?.assetId) r.assetId = params[key][i].assetId
    })
  }

  if (!payload.model) payload.model = asset.modelUsed
  if (payload.prompt === undefined && asset.prompt) payload.prompt = asset.prompt
  const provider = normalizeProvider(task?.provider) || normalizeProvider(asset.provider) || routeModelToProvider(payload.model)
  return { provider, type: task?.type || asset.type, payload }
}

/**
 * Copy of a stored payload ready to submit again: run ids dropped, redacted base64 removed
 * (the queues re-hydrate media from the asset ids), refs that can no longer be loaded dropped.
 */
function prepareForResubmit(payload: any): { payload: any; droppedRefs: number } {
  const out = JSON.parse(JSON.stringify(payload || {}))
  for (const key of RUNTIME_KEYS) delete out[key]
  for (const key of ['imageBase64', 'firstFrameBase64', 'lastFrameBase64', 'audioBase64']) {
    if (!out[key]) delete out[key]
  }
  let droppedRefs = 0
  for (const key of Object.keys(REF_LIST_KEYS)) {
    if (!Array.isArray(out[key])) continue
    out[key] = out[key].filter((r: any) => {
      if (!r || typeof r !== 'object') return false
      if (!r.base64) delete r.base64
      const usable = Boolean(r.base64) || (r.assetId && resolveAssetFile(r.assetId)) || (typeof r.url === 'string' && r.url.startsWith('http'))
      if (!usable) droppedRefs++
      return usable
    })
    if (out[key].length === 0) delete out[key]
  }
  for (const key of Object.keys(FRAME_KEYS)) {
    if (out[key] && !resolveAssetFile(out[key])) { delete out[key]; droppedRefs++ }
  }
  return { payload: out, droppedRefs }
}

/** Reference-list entry for an existing asset, in the shape the composer sends. */
function referenceEntry(asset: any): { list: 'imageRefs' | 'videoRefs' | 'audioRefs'; entry: any } {
  const file = resolveAssetFile(asset.id)
  if (!file) {
    const state = assetState(asset)
    throw new ToolInputError(`Asset '${asset.id}' cannot be used as a reference: it is ${state.status}${state.error ? ` (${state.error})` : ''}`)
  }
  const mime = asset.mimeType || file.mime || undefined
  if (asset.type === 'video') {
    return { list: 'videoRefs', entry: { assetId: asset.id, mime, name: asset.fileName, localPath: file.path, ...(asset.duration ? { duration: asset.duration } : {}) } }
  }
  if (asset.type === 'audio') {
    return { list: 'audioRefs', entry: { assetId: asset.id, mime, ...(asset.duration ? { duration: asset.duration } : {}) } }
  }
  return { list: 'imageRefs', entry: { assetId: asset.id, mime, name: asset.fileName, refType: 'image' } }
}

function addReferences(payload: any, assetIds: string[]): string[] {
  const added: string[] = []
  for (const id of assetIds) {
    const asset = requireAsset(id)
    const { list, entry } = referenceEntry(asset)
    payload[list] = Array.isArray(payload[list]) ? payload[list] : []
    if (payload[list].some((r: any) => r?.assetId === asset.id)) continue
    payload[list].push(entry)
    added.push(asset.id)
  }
  return added
}

function removeReferences(payload: any, assetIds: string[]): void {
  const ids = new Set(assetIds.map(resolveAssetId))
  for (const key of Object.keys(REF_LIST_KEYS)) {
    if (Array.isArray(payload[key])) payload[key] = payload[key].filter((r: any) => !ids.has(r?.assetId))
  }
  for (const key of Object.keys(FRAME_KEYS)) {
    if (ids.has(payload[key])) delete payload[key]
  }
}

function setFrame(payload: any, key: 'firstFrameAssetId' | 'lastFrameAssetId', assetId: string): void {
  const asset = requireAsset(assetId)
  if (asset.type !== 'image') throw new ToolInputError(`Frame '${assetId}' must be an image asset`)
  referenceEntry(asset) // availability check
  payload[key] = asset.id
}

/**
 * Same model-family switch the composer makes (t2iId → i2iId) when images are attached,
 * for the KIE ids that follow the "-text-to-image" / "-image-to-image" naming.
 */
function modelForReferences(model: string, type: string, payload: any): string {
  if (type !== 'image' || !Array.isArray(payload.imageRefs) || payload.imageRefs.length === 0) return model
  if (!model.endsWith('text-to-image')) return model
  const candidate = model.replace(/text-to-image$/, 'image-to-image')
  return IMAGE_MODELS.some(m => m.id === candidate) ? candidate : model
}

/** Provider-specific payload shape the renderer produces before sending. */
function adaptPayloadForProvider(provider: QueueProvider, type: string, payload: any): void {
  payload.type = type
  if (!payload.mode) payload.mode = type
  // P-Video 2 Pro (Pruna or Replicate) with references runs its -reference variant, which
  // takes the reference lists as they are
  if (pVideo2Kind(payload.model)) payload.model = routePVideo2Model(payload.model, payload)
  // Replicate takes a single input image instead of a reference list
  if (provider === 'replicate' && pVideo2Kind(payload.model) !== 'p-video-2-pro-reference' && Array.isArray(payload.imageRefs) && payload.imageRefs.length > 0) {
    const [first] = payload.imageRefs
    if (!payload.imageAssetId && first.assetId) {
      payload.imageAssetId = first.assetId
      payload.imageMime = first.mime
    }
    delete payload.imageRefs
  }
  // The composer omits provider for KIE and names it for every other queue
  if (provider === 'openfield') delete payload.provider
  else payload.provider = provider
}

const PROVIDER_LABEL: Record<QueueProvider, string> = {
  openfield: 'Kie.ai', fal: 'fal.ai', higgsfield: 'Higgsfield', machgen: 'MachGen', replicate: 'Replicate', apimart: 'APIMart', klingai: 'Kling AI', pruna: 'Pruna',
}

function safeNotify(fn: () => void): void {
  try { fn() } catch {}
}

async function enqueueVariants(provider: QueueProvider, type: string, payload: any, count: number) {
  const queue = getProviderQueue(provider)
  if (!queue) {
    throw new ToolInputError(`${PROVIDER_LABEL[provider]} is not configured: add its API key in Openfield → Settings → Providers`)
  }
  const tasks: Array<{ taskId: string; assetId: string | null }> = []
  for (let i = 0; i < count; i++) {
    // Queues mutate the payload they receive (asset persistence), so each variant gets its own copy
    const taskId = await queue.enqueue(type, JSON.parse(JSON.stringify(payload)))
    const placeholder = getRawDb().prepare('SELECT id FROM assets WHERE task_id = ? ORDER BY created_at ASC LIMIT 1').get(taskId) as any
    tasks.push({ taskId, assetId: placeholder?.id || null })
  }
  safeNotify(notifyAssetsChanged)
  return tasks
}

function summarizeAsset(asset: any) {
  const state = assetState(asset)
  const generation = isGenerated(asset) ? (parseJson(asset.parameters) || {}) : null
  return {
    id: asset.id,
    type: asset.type,
    status: state.status,
    ...(state.error ? { error: state.error } : {}),
    origin: isGenerated(asset) ? 'generated' : asset.modelUsed,
    model: isGenerated(asset) ? asset.modelUsed : null,
    provider: asset.provider || null,
    prompt: truncate(asset.prompt, 240),
    referenceCount: generation ? extractReferences(generation, false).length : 0,
    favorite: Boolean(asset.isFavorite),
    archived: Boolean(asset.isArchived),
    tags: asset.tags ? String(asset.tags).split(',').filter(Boolean) : [],
    taskId: asset.taskId || null,
    createdAt: asset.createdAt ? new Date(asset.createdAt).toISOString() : null,
  }
}

function assetDetails(asset: any) {
  const state = assetState(asset)
  const generation = loadGeneration(asset)
  const p = generation?.payload || {}
  return {
    ...summarizeAsset(asset),
    prompt: asset.prompt || p.prompt || '',
    mimeType: asset.mimeType,
    fileName: asset.fileName,
    localPath: state.localPath,
    width: asset.width ?? null,
    height: asset.height ?? null,
    duration: asset.duration ?? null,
    generation: generation
      ? {
          provider: generation.provider,
          type: generation.type,
          model: p.model,
          settings: Object.fromEntries(
            ['aspectRatio', 'resolution', 'duration', 'fps', 'sound', 'draft', 'quality', 'negativePrompt']
              .filter(k => p[k] !== undefined && p[k] !== '')
              .map(k => [k, p[k]]),
          ),
          references: extractReferences(p),
        }
      : null,
  }
}

// ─── Previews ──────────────────────────────────────────────────────────────────

const PREVIEW_MIN = 128
const PREVIEW_MAX = 1024

/** Small JPEG of an image, or of a video's first second, through ffmpeg (handles WebP too). */
async function renderPreview(srcPath: string, isVideo: boolean, size: number): Promise<string> {
  const out = path.join(os.tmpdir(), `openfield-mcp-preview-${crypto.randomUUID()}.jpg`)
  const scale = `scale='min(${size},iw)':'min(${size},ih)':force_original_aspect_ratio=decrease`
  const run = (seek: boolean) =>
    runFfmpeg(['-y', ...(seek ? ['-ss', '0.5'] : []), '-i', srcPath, '-frames:v', '1', '-vf', scale, '-q:v', '5', out])
  try {
    try {
      await run(isVideo)
    } catch (err) {
      if (!isVideo) throw err
      await run(false) // clips shorter than the seek point
    }
    return (await fsp.readFile(out)).toString('base64')
  } finally {
    fsp.unlink(out).catch(() => {})
  }
}

async function buildPreview(assetIds: string[], size: number, heading?: string): Promise<ToolContent> {
  const content: any[] = []
  const items: any[] = []
  if (heading) content.push({ type: 'text', text: heading })

  for (let i = 0; i < assetIds.length; i++) {
    const index = i + 1
    let asset: any
    try {
      asset = requireAsset(assetIds[i])
    } catch (err: any) {
      content.push({ type: 'text', text: `#${index} · ${assetIds[i]} — ${err.message}` })
      items.push({ index, assetId: assetIds[i], status: 'missing' })
      continue
    }
    const state = assetState(asset)
    const label = `#${index} · asset ${asset.id} · ${asset.type}${asset.modelUsed && isGenerated(asset) ? ` · ${asset.modelUsed}` : ''}`
    const prompt = truncate(asset.prompt, 160)
    items.push({ index, assetId: asset.id, type: asset.type, status: state.status, model: asset.modelUsed, prompt })

    if (state.status !== 'ready' || !state.localPath) {
      content.push({ type: 'text', text: `${label} — ${state.status}${state.error ? `: ${state.error}` : ''}` })
      continue
    }
    if (asset.type === 'audio') {
      content.push({ type: 'text', text: `${label} — audio, no visual preview (${state.localPath})` })
      continue
    }
    try {
      const data = await renderPreview(state.localPath, asset.type === 'video', size)
      content.push({ type: 'text', text: prompt ? `${label}\n"${prompt}"` : label })
      content.push({ type: 'image', data, mimeType: 'image/jpeg' })
    } catch (err: any) {
      content.push({ type: 'text', text: `${label} — preview failed: ${err?.message || err}` })
    }
  }
  return new ToolContent(content, { items })
}

// ─── Tasks ─────────────────────────────────────────────────────────────────────

function taskSnapshot(taskId: string) {
  const task = getTaskRow(taskId)
  if (!task) return { taskId, status: 'not_found', assetId: null, error: null }
  const asset = getRawDb().prepare('SELECT id FROM assets WHERE task_id = ? ORDER BY created_at ASC LIMIT 1').get(taskId) as any
  return {
    taskId,
    status: task.status as string,
    progress: task.progress ?? 0,
    assetId: task.resultAssetId || asset?.id || null,
    error: task.errorMessage || null,
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ─── Tools ─────────────────────────────────────────────────────────────────────

const ASSET_ID_DESC = 'Asset id (from list_assets / get_task), or "latest" for the most recent generation'
const IMPORTABLE = /\.(png|jpe?g|webp|gif|mp4|webm|mov|mp3|wav|ogg)$/i

export function getGenerationTools(): McpTool[] {
  return [
    {
      name: 'list_assets',
      title: 'List assets',
      description: 'List the generations and imported media of the active workspace, newest first, with status (ready/pending/failed), model, prompt and how many references each generation used. Use it to resolve "the previous image", "the last 4 videos", etc.',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['image', 'video', 'audio'] },
          search: { type: 'string', description: 'Text matched against prompt, file name, model and tags' },
          model: { type: 'string', description: 'Exact model id' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Assets having all these tags' },
          favorites_only: { type: 'boolean' },
          archived: { type: 'boolean', description: 'true lists only archived assets (default: only non-archived)' },
          generated_only: { type: 'boolean', description: 'Exclude uploads/imported references (default true)' },
          limit: { type: 'number', minimum: 1, description: 'Default 12, max 50' },
          offset: { type: 'number', minimum: 0 },
        },
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => {
        const limit = Math.min(Math.max(Math.floor(num(args.limit, 12)), 1), 50)
        const offset = Math.max(Math.floor(num(args.offset, 0)), 0)
        const { assets, total } = getAssetManager().queryAssets({
          type: optStr(args.type) as any,
          search: optStr(args.search),
          modelUsed: optStr(args.model),
          tags: Array.isArray(args.tags) && args.tags.length > 0 ? args.tags : undefined,
          isFavorite: args.favorites_only ? true : undefined,
          isArchived: args.archived === true ? true : undefined,
          generatedOnly: args.generated_only !== false,
          limit,
          offset,
        })
        return { total, offset, count: assets.length, assets: (assets as any[]).map(summarizeAsset) }
      },
    },
    {
      name: 'get_asset',
      title: 'Get asset',
      description: 'Get one asset in detail: status, local file path, and for generations the provider, model, settings and every reference it used (input image, start/end frames, image/video/audio references) with their asset ids — ready to reuse in generate or recreate_generation.',
      inputSchema: {
        type: 'object',
        properties: { asset_id: { type: 'string', description: ASSET_ID_DESC } },
        required: ['asset_id'],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => ({ asset: assetDetails(requireAsset(str(args.asset_id))) }),
    },
    {
      name: 'preview_assets',
      title: 'Preview assets',
      description: 'Show 1–8 images or videos (first frame) side by side, numbered #1..#N, so the user can compare and pick one — e.g. to choose which variant to use as a reference. Pending or failed assets are reported as text.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Up to 8 asset ids ("latest" allowed)' },
          size: { type: 'number', minimum: PREVIEW_MIN, description: `Longest side in px. Default 512, max ${PREVIEW_MAX}` },
        },
        required: ['asset_ids'],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => {
        const ids: string[] = args.asset_ids
        if (ids.length > 8) throw new ToolInputError('preview_assets takes at most 8 asset ids')
        return buildPreview(ids, Math.min(Math.floor(num(args.size, 512)), PREVIEW_MAX))
      },
    },
    {
      name: 'generate',
      title: 'Generate image or video',
      description: [
        'Queue a new image or video generation (uses API credits), like the Playground composer.',
        'Write the prompt from a prompt-library template (search_prompt_library → get_library_prompt) adapted to the brief; without a recent library check the first call is refused once with the closest templates.',
        'References: pass existing asset ids in reference_asset_ids (images, videos or audio), and/or reuse_references_from to copy every reference and frame of a previous generation ("use the references of the previous image" → reuse_references_from: "latest").',
        'count > 1 queues that many independent variants (e.g. 4 to let the user choose one; then wait_for_tasks with preview: true).',
        'Returns task ids and placeholder asset ids; poll get_task or call wait_for_tasks.',
      ].join(' '),
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          model: { type: 'string', description: 'Model id from get_service_models. With image references, a "-text-to-image" KIE model is switched to its "-image-to-image" variant automatically.' },
          type: { type: 'string', enum: ['image', 'video'], description: 'Default image' },
          provider: { type: 'string', enum: ['kie', 'fal', 'replicate', 'machgen', 'apimart', 'higgsfield', 'klingai', 'pruna'], description: 'Optional; inferred from the model id. Pass it when the model came from that service\'s catalog.' },
          aspect_ratio: { type: 'string', description: 'e.g. 1:1, 16:9, 9:16, 4:3, 3:4, 21:9. Seedance 2.5 (MachGen) with a start/end frame only accepts adaptive (the frame sets the framing); any other value is replaced by adaptive.' },
          resolution: { type: 'string', description: 'e.g. 1K, 2K, 4K (image) or 720p, 1080p (video)' },
          duration: { type: 'number', minimum: 1, description: 'Video seconds' },
          reference_asset_ids: { type: 'array', items: { type: 'string' }, description: 'Existing assets to attach as references' },
          reuse_references_from: { type: 'string', description: 'Copy all references and frames of this generation (asset id or "latest")' },
          start_frame_asset_id: { type: 'string', description: 'Video: image asset used as first frame' },
          end_frame_asset_id: { type: 'string', description: 'Video: image asset used as last frame' },
          count: { type: 'number', minimum: 1, description: 'Variants to queue, 1–4. Default 1' },
          extra_params: { type: 'object', description: 'Advanced provider fields merged into the payload as-is (e.g. {"sound": true, "fps": 24})' },
        },
        required: ['prompt', 'model'],
        additionalProperties: false,
      },
      annotations: GENERATE,
      handler: async (args) => {
        const type = str(args.type, 'image')
        requireLibraryCheck(str(args.prompt), type === 'video' ? 'video' : 'image', str(args.model))
        const count = Math.floor(num(args.count, 1))
        if (count > 4) throw new ToolInputError('count must be between 1 and 4')
        const provider = routeModelToProvider(str(args.model), optStr(args.provider))

        let payload: any = {}
        let droppedRefs = 0
        if (args.reuse_references_from) {
          const source = requireAsset(str(args.reuse_references_from))
          const gen = loadGeneration(source)
          if (!gen) throw new ToolInputError(`Asset '${source.id}' is not a generation, so it has no references to reuse. Use it in reference_asset_ids instead.`)
          const prepared = prepareForResubmit(gen.payload)
          droppedRefs = prepared.droppedRefs
          for (const key of [...Object.keys(FRAME_KEYS), ...Object.keys(REF_LIST_KEYS)]) {
            if (prepared.payload[key] !== undefined) payload[key] = prepared.payload[key]
          }
        }
        if (Array.isArray(args.reference_asset_ids)) addReferences(payload, args.reference_asset_ids)
        if (args.start_frame_asset_id) setFrame(payload, 'firstFrameAssetId', str(args.start_frame_asset_id))
        if (args.end_frame_asset_id) setFrame(payload, 'lastFrameAssetId', str(args.end_frame_asset_id))

        if (args.extra_params && typeof args.extra_params === 'object') payload = { ...payload, ...args.extra_params }
        payload.prompt = str(args.prompt)
        payload.model = modelForReferences(str(args.model), type, payload)
        if (args.aspect_ratio) payload.aspectRatio = str(args.aspect_ratio)
        if (args.resolution) payload.resolution = str(args.resolution)
        if (args.duration !== undefined) payload.duration = num(args.duration)
        adaptPayloadForProvider(provider, type, payload)

        const tasks = await enqueueVariants(provider, type, payload, count)
        return {
          provider: PROVIDER_LABEL[provider],
          model: payload.model,
          ...(payload.model !== args.model ? { note: `Switched to ${payload.model} because image references were attached` } : {}),
          type,
          references: extractReferences(payload),
          ...(droppedRefs ? { droppedReferences: droppedRefs } : {}),
          tasks,
          next: 'Call wait_for_tasks with these task ids (preview: true to show the results).',
        }
      },
    },
    {
      name: 'recreate_generation',
      title: 'Recreate generation',
      description: 'Queue a generation again with the exact settings and references of an existing one, like the Playground "Recreate" button (uses API credits). Any field you pass overrides the original — e.g. a new prompt with the same references, another model, or extra/removed references. count > 1 queues several variants.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_id: { type: 'string', description: ASSET_ID_DESC },
          prompt: { type: 'string', description: 'Replaces the original prompt' },
          model: { type: 'string', description: 'Replaces the model (the provider is re-inferred)' },
          provider: { type: 'string', enum: ['kie', 'fal', 'replicate', 'machgen', 'apimart', 'higgsfield', 'klingai', 'pruna'] },
          aspect_ratio: { type: 'string' },
          resolution: { type: 'string' },
          duration: { type: 'number', minimum: 1 },
          add_reference_asset_ids: { type: 'array', items: { type: 'string' } },
          remove_reference_asset_ids: { type: 'array', items: { type: 'string' } },
          keep_references: { type: 'boolean', description: 'false drops every original reference and frame (default true)' },
          count: { type: 'number', minimum: 1, description: 'Variants to queue, 1–4. Default 1' },
        },
        required: ['asset_id'],
        additionalProperties: false,
      },
      annotations: GENERATE,
      handler: async (args) => {
        const count = Math.floor(num(args.count, 1))
        if (count > 4) throw new ToolInputError('count must be between 1 and 4')
        const source = requireAsset(str(args.asset_id))
        const gen = loadGeneration(source)
        if (!gen) throw new ToolInputError(`Asset '${source.id}' was ${source.modelUsed === 'upload' ? 'uploaded' : 'imported'}, not generated — there is nothing to recreate`)

        const { payload, droppedRefs } = prepareForResubmit(gen.payload)
        if (args.keep_references === false) removeReferences(payload, extractReferences(payload, false).map(r => r.assetId!).filter(Boolean))
        if (Array.isArray(args.remove_reference_asset_ids)) removeReferences(payload, args.remove_reference_asset_ids)
        if (Array.isArray(args.add_reference_asset_ids)) addReferences(payload, args.add_reference_asset_ids)

        let provider = gen.provider
        if (args.model || args.provider) {
          payload.model = str(args.model, payload.model)
          provider = routeModelToProvider(payload.model, optStr(args.provider))
        }
        if (args.prompt !== undefined) payload.prompt = str(args.prompt)
        if (args.aspect_ratio) payload.aspectRatio = str(args.aspect_ratio)
        if (args.resolution) payload.resolution = str(args.resolution)
        if (args.duration !== undefined) payload.duration = num(args.duration)
        const requestedModel = payload.model
        payload.model = modelForReferences(payload.model, gen.type, payload)
        adaptPayloadForProvider(provider, gen.type, payload)

        const tasks = await enqueueVariants(provider, gen.type, payload, count)
        return {
          recreatedFrom: source.id,
          provider: PROVIDER_LABEL[provider],
          model: payload.model,
          ...(payload.model !== requestedModel ? { note: `Switched to ${payload.model} because image references were attached` } : {}),
          type: gen.type,
          prompt: truncate(payload.prompt, 240),
          references: extractReferences(payload),
          ...(droppedRefs ? { droppedReferences: droppedRefs, warning: `${droppedRefs} original reference(s) are no longer on disk and were left out` } : {}),
          tasks,
          next: 'Call wait_for_tasks with these task ids (preview: true to show the results).',
        }
      },
    },
    {
      name: 'wait_for_tasks',
      title: 'Wait for tasks',
      description: 'Wait until generation tasks finish (completed, failed or cancelled) or the timeout passes, then report each task\'s status and result asset id. With preview: true, finished images/videos are shown numbered so the user can pick one.',
      inputSchema: {
        type: 'object',
        properties: {
          task_ids: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Up to 8 task ids' },
          timeout_seconds: { type: 'number', minimum: 1, description: 'Default 60, max 240. Call again if tasks are still running.' },
          preview: { type: 'boolean', description: 'Show the finished results as images (default false)' },
          preview_size: { type: 'number', minimum: PREVIEW_MIN, description: 'Default 512' },
        },
        required: ['task_ids'],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => {
        const ids: string[] = args.task_ids
        if (ids.length > 8) throw new ToolInputError('wait_for_tasks takes at most 8 task ids')
        const deadline = Date.now() + Math.min(num(args.timeout_seconds, 60), 240) * 1000
        let snapshots = ids.map(taskSnapshot)
        const finished = () => snapshots.every(s => TERMINAL_TASK_STATUSES.includes(s.status) || s.status === 'not_found')
        while (!finished() && Date.now() < deadline) {
          await sleep(2000)
          snapshots = ids.map(taskSnapshot)
        }
        const result = {
          done: finished(),
          tasks: snapshots,
          ...(finished() ? {} : { next: 'Some tasks are still running — call wait_for_tasks again.' }),
        }
        if (!args.preview) return result

        const ready = snapshots.filter(s => s.status === 'completed' && s.assetId).map(s => s.assetId as string)
        if (ready.length === 0) return result
        const preview = await buildPreview(ready, Math.min(Math.floor(num(args.preview_size, 512)), PREVIEW_MAX),
          `${ready.length} of ${snapshots.length} task(s) completed${result.done ? '' : ' (others still running)'}:`)
        return new ToolContent(preview.content, { ...result, previews: preview.structured?.items })
      },
    },
    {
      name: 'update_assets',
      title: 'Update assets',
      description: 'Favorite/unfavorite, tag or archive/unarchive one or more assets. The open library updates immediately.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
          favorite: { type: 'boolean' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Replaces all tags' },
          add_tags: { type: 'array', items: { type: 'string' }, description: 'Adds tags, keeping the existing ones' },
          archived: { type: 'boolean', description: 'Archive (true) or restore (false)' },
        },
        required: ['asset_ids'],
        additionalProperties: false,
      },
      annotations: EDIT,
      handler: async (args) => {
        if (args.favorite === undefined && !args.tags && !args.add_tags && args.archived === undefined) {
          throw new ToolInputError('Nothing to update: pass favorite, tags, add_tags or archived')
        }
        const am = getAssetManager()
        const ids = (args.asset_ids as string[]).map(id => requireAsset(id).id)
        for (const id of ids) {
          const asset = am.getAsset(id) as any
          if (args.favorite !== undefined && Boolean(asset.isFavorite) !== args.favorite) am.toggleFavorite(id)
          if (Array.isArray(args.tags)) am.updateTags(id, args.tags.map((t: string) => t.trim()).filter(Boolean))
        }
        if (Array.isArray(args.add_tags)) am.addTagsMultiple(ids, args.add_tags)
        if (args.archived !== undefined) am.archiveAssets(ids, args.archived)

        const updated = ids.map(id => am.getAsset(id))
        for (const asset of updated) safeNotify(() => notifyAssetUpdated(asset))
        if (args.archived !== undefined) safeNotify(notifyAssetsChanged)
        return { updated: updated.map(summarizeAsset) }
      },
    },
    {
      name: 'delete_assets',
      title: 'Delete assets',
      description: 'Remove assets from the library. By default they are archived (restorable with update_assets archived: false); permanent: true deletes the records and their files for good.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
          permanent: { type: 'boolean', description: 'Delete files permanently instead of archiving (default false)' },
        },
        required: ['asset_ids'],
        additionalProperties: false,
      },
      annotations: DESTRUCTIVE,
      handler: async (args) => {
        const am = getAssetManager()
        const ids = (args.asset_ids as string[]).map(id => requireAsset(id).id)
        const count = args.permanent === true ? am.deleteAssets(ids) : am.archiveAssets(ids, true)
        safeNotify(notifyAssetsChanged)
        return args.permanent === true ? { deleted: count, assetIds: ids } : { archived: count, assetIds: ids, restore: 'update_assets with archived: false' }
      },
    },
    {
      name: 'import_asset',
      title: 'Import file',
      description: 'Import a local image, video or audio file into the active workspace library, e.g. to use it as a reference. Returns the new asset id.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path of a .png/.jpg/.webp/.gif/.mp4/.webm/.mov/.mp3/.wav/.ogg file' },
        },
        required: ['file_path'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => {
        const filePath = str(args.file_path)
        if (!path.isAbsolute(filePath)) throw new ToolInputError('file_path must be absolute')
        if (!IMPORTABLE.test(filePath)) throw new ToolInputError('Unsupported file type: use png, jpg, webp, gif, mp4, webm, mov, mp3, wav or ogg')
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new ToolInputError(`File not found: ${filePath}`)
        const type = /\.(mp4|webm|mov)$/i.test(filePath) ? 'video' : /\.(mp3|wav|ogg)$/i.test(filePath) ? 'audio' : 'image'
        const imported = await getAssetManager().importFile(filePath, type)
        safeNotify(notifyAssetsChanged)
        return { asset: summarizeAsset(getAssetManager().getAsset(imported.id)) }
      },
    },
  ]
}
