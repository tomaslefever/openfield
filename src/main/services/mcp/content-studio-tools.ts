import crypto from 'crypto'
import { getRawDb } from '../../db'
import { getDramaProject, saveDramaProject } from '../../ipc/drama'
import {
  STAGES,
  STAGE_LABELS,
  type Stage,
  runInStudio,
  requireProject,
  stageStatuses,
  assertStageOpen,
  clearApprovalsFrom,
  setApproval,
  nextStep,
} from '../content-studio-agent'
import { type McpTool, ToolInputError, READ_ONLY, EDIT, CREATE, GENERATE, str, num, optStr } from './types'

const ELEVEN_VOICE_ID = /^[A-Za-z0-9]{16,}$/

const WORKFLOW = [
  'Content Studio runs one stage at a time, in this order: script → references (characters, locations, props) → keyframes → voices (ElevenLabs) → videos → final.',
  'A stage can only be generated once every earlier stage is complete AND approved by the user with content_studio_approve_stage.',
  'Never approve a stage on your own: show the user the results (preview_assets with the asset ids from content_studio_get_project) and approve only after they explicitly say so.',
  'Voices always come before videos: the dialogue audio is attached to each shot\'s video as its lip-sync reference.',
].join(' ')

// ─── Helpers ─────────────────────────────────────────────────

function stageOf(name: string): Stage {
  if (!(STAGES as readonly string[]).includes(name)) throw new ToolInputError(`Unknown stage '${name}'. Use one of: ${STAGES.join(', ')}`)
  return name as Stage
}

function earliest(a: Stage | null, b: Stage): Stage {
  return a === null || STAGES.indexOf(b) < STAGES.indexOf(a) ? b : a
}

/** Tells the app to persist the open project before the bridge rewrites it, then to reload it */
async function writeProject(projectId: string, mutate: (project: any) => void): Promise<any> {
  try { await runInStudio('flush', { projectId }) } catch { /* app window not reachable: write anyway */ }
  const project = requireProject(projectId)
  mutate(project)
  saveDramaProject(project)
  try { await runInStudio('reload', { projectId }) } catch { /* the app reads it on next open */ }
  return getDramaProject(projectId)
}

function assetPath(assetId?: string): string | undefined {
  if (!assetId) return undefined
  try {
    const a = getRawDb().prepare('SELECT file_path, local_path FROM assets WHERE id = ?').get(assetId) as any
    return a?.localPath || a?.local_path || a?.filePath || a?.file_path || undefined
  } catch {
    return undefined
  }
}

/** file:// url of a library asset, as Content Studio stores generated media */
function assetUrl(assetId: string): string {
  const p = assetPath(assetId)
  if (!p) throw new ToolInputError(`Asset '${assetId}' not found in the library`)
  return `file://${p.replace(/\\/g, '/')}`
}

function summarize(project: any, includePrompts = false) {
  const statuses = stageStatuses(project)
  const media = (assetId?: string, url?: string) => (assetId || url ? { asset_id: assetId, path: assetPath(assetId) || url?.replace(/^file:\/\//, '') } : null)
  return {
    id: project.id,
    title: project.title,
    logline: project.logline,
    settings: {
      content_type: project.contentType,
      aspect_ratio: project.aspectRatio,
      visual_style: project.visualStyle,
      image_model: project.imageModel,
      image_resolution: project.imageResolution,
      video_model: project.videoModel,
      video_resolution: project.videoResolution,
      voice_model: project.voiceModel,
      voice_source: project.voiceSource,
      narrator_voice_id: project.narratorVoiceId,
    },
    characters: (project.characters || []).map((c: any) => ({
      id: c.id, name: c.name, role: c.role, voice_id: c.voiceId, image: media(c.imageAssetId, c.imageUrl),
      ...(includePrompts ? { visual_prompt: c.visualPrompt } : {}),
    })),
    scenarios: (project.scenarios || []).map((s: any) => ({
      id: s.id, name: s.name, image: media(s.imageAssetId, s.imageUrl), ...(includePrompts ? { visual_prompt: s.visualPrompt } : {}),
    })),
    props: (project.props || []).map((p: any) => ({
      id: p.id, name: p.name, description: p.description, image: media(p.imageAssetId, p.imageUrl), ...(includePrompts ? { visual_prompt: p.visualPrompt } : {}),
    })),
    shots: (project.shots || []).map((sh: any) => ({
      id: sh.id,
      order: sh.order,
      scenario: sh.scenarioName,
      characters: sh.characterNames,
      props: sh.propNames,
      camera: sh.cameraMovement,
      action: sh.actionPrompt,
      dialogue: sh.dialogueText || undefined,
      speaker: sh.dialogueSpeaker || undefined,
      duration: sh.estimatedDuration,
      keyframe: media(sh.keyframeAssetId, sh.keyframeUrl),
      audio: sh.audioStatus === 'completed' ? media(sh.audioAssetId, sh.audioUrl) : (hasText(sh.dialogueText) ? { status: sh.audioStatus } : undefined),
      video: sh.videoStatus === 'completed' ? media(sh.videoAssetId, sh.videoUrl || sh.videoLocalPath) : { status: sh.videoStatus, task_id: sh.videoTaskId || undefined },
      ...(includePrompts ? { keyframe_prompt: sh.keyframePrompt, video_prompt: sh.videoPrompt, video_input_mode: sh.videoInputMode } : {}),
    })),
    final_video: project.finalVideoPath || project.finalVideoAssetId ? { asset_id: project.finalVideoAssetId, path: project.finalVideoPath } : null,
    stages: statuses,
    next_step: nextStep(statuses),
  }
}

const hasText = (v: any) => typeof v === 'string' && v.trim() !== ''

// Project-level fields: input name → [stored field, first stage it invalidates]
const PROJECT_FIELDS: Record<string, [string, Stage]> = {
  title: ['title', 'script'],
  logline: ['logline', 'script'],
  idea: ['ideaPrompt', 'script'],
  script: ['scriptText', 'script'],
  genre: ['genre', 'script'],
  tone: ['tone', 'script'],
  content_type: ['contentType', 'script'],
  aspect_ratio: ['aspectRatio', 'script'],
  visual_style: ['visualStyle', 'references'],
  image_model: ['imageModel', 'references'],
  image_resolution: ['imageResolution', 'references'],
  voice_model: ['voiceModel', 'voices'],
  voice_source: ['voiceSource', 'voices'],
  narrator_voice_id: ['narratorVoiceId', 'voices'],
  video_model: ['videoModel', 'videos'],
  video_resolution: ['videoResolution', 'videos'],
  video_duration: ['videoDuration', 'videos'],
}

const ELEMENT_FIELDS: Record<string, [string, Stage]> = {
  name: ['name', 'references'],
  role: ['role', 'references'],
  description: ['description', 'references'],
  visual_prompt: ['visualPrompt', 'references'],
  voice_id: ['voiceId', 'voices'],
  image_asset_id: ['imageAssetId', 'references'],
}

const SHOT_FIELDS: Record<string, [string, Stage]> = {
  scenario: ['scenarioName', 'keyframes'],
  characters: ['characterNames', 'keyframes'],
  props: ['propNames', 'keyframes'],
  camera: ['cameraMovement', 'keyframes'],
  action: ['actionPrompt', 'keyframes'],
  keyframe_prompt: ['keyframePrompt', 'keyframes'],
  keyframe_asset_id: ['keyframeAssetId', 'keyframes'],
  dialogue: ['dialogueText', 'voices'],
  speaker: ['dialogueSpeaker', 'voices'],
  duration: ['estimatedDuration', 'videos'],
  video_prompt: ['videoPrompt', 'videos'],
  video_input_mode: ['videoInputMode', 'videos'],
}

/** Applies a list of element patches (match by id, then name); returns the first stage touched */
function patchElements(list: any[], patches: any[], fields: Record<string, [string, Stage]>, matchKey: (x: any) => string, addStage: Stage): Stage | null {
  let first: Stage | null = null
  for (const p of patches || []) {
    const idx = list.findIndex((x) => (p.id && x.id === p.id) || (!p.id && p.name && matchKey(x) === String(p.name).toLowerCase().trim()))
    if (p.remove) {
      if (idx >= 0) { list.splice(idx, 1); first = earliest(first, addStage) }
      continue
    }
    const target = idx >= 0 ? list[idx] : { id: crypto.randomUUID() }
    for (const [key, [field, stage]] of Object.entries(fields)) {
      if (p[key] === undefined) continue
      if (JSON.stringify(target[field]) === JSON.stringify(p[key])) continue
      target[field] = p[key]
      first = earliest(first, stage)
    }
    if (p.image_asset_id) target.imageUrl = assetUrl(p.image_asset_id)
    if (p.keyframe_asset_id) target.keyframeUrl = assetUrl(p.keyframe_asset_id)
    if (idx < 0) { list.push(target); first = earliest(first, addStage) }
  }
  return first
}

function applyPatch(project: any, args: any): Stage | null {
  let first: Stage | null = null
  for (const [key, [field, stage]] of Object.entries(PROJECT_FIELDS)) {
    if (args[key] === undefined || project[field] === args[key]) continue
    project[field] = args[key]
    first = earliest(first, stage)
  }
  const byName = (x: any) => String(x.name || '').toLowerCase().trim()
  for (const [key, field] of [['characters', 'characters'], ['scenarios', 'scenarios'], ['props', 'props']] as const) {
    if (!Array.isArray(args[key])) continue
    project[field] = project[field] || []
    const s = patchElements(project[field], args[key], ELEMENT_FIELDS, byName, 'references')
    if (s) first = earliest(first, s)
  }
  if (Array.isArray(args.shots)) {
    if (args.replace_shots) {
      project.shots = []
      first = earliest(first, 'script')
    }
    project.shots = project.shots || []
    const byOrder = (x: any) => String(x.order)
    const patches = args.shots.map((p: any) => ({ ...p, name: p.id ? undefined : p.order }))
    const s = patchElements(project.shots, patches, SHOT_FIELDS, byOrder, 'script')
    if (s) first = earliest(first, s)
    project.shots.forEach((sh: any, i: number) => {
      sh.order = i + 1
      sh.shotNumber = i + 1
      sh.sceneNumber = sh.sceneNumber || 1
    })
    project.shotsCount = project.shots.length
  }
  return first
}

async function dispatch(projectId: string, kind: string, ids: string[], timeoutMs?: number) {
  if (ids.length === 0) return []
  return runInStudio('generate', { projectId, kind, ids }, timeoutMs)
}

function pick<T extends { id: string }>(items: T[], ids: string[] | undefined, missing: (x: T) => boolean, onlyMissing: boolean): string[] {
  const wanted = ids?.length ? items.filter((x) => ids.includes(x.id)) : items
  if (ids?.length && wanted.length !== ids.length) {
    const known = new Set(items.map((x) => x.id))
    throw new ToolInputError(`Unknown ids: ${ids.filter((id) => !known.has(id)).join(', ')}`)
  }
  return wanted.filter((x) => !onlyMissing || missing(x)).map((x) => x.id)
}

function taskIdsOf(results: any[]): string[] {
  return (results || []).map((r: any) => r.taskId).filter(Boolean)
}

// ─── Shared schemas ──────────────────────────────────────────

const elementSchema = (extra: Record<string, any> = {}) => ({
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Existing id (omit to add a new one; name also matches)' },
    name: { type: 'string' },
    visual_prompt: { type: 'string' },
    image_asset_id: { type: 'string', description: 'Attach an existing library image instead of generating one' },
    remove: { type: 'boolean' },
    ...extra,
  },
  additionalProperties: false,
})

const shotSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Existing shot id (or match by order); omit both to append' },
    order: { type: 'number' },
    scenario: { type: 'string', description: 'Location name' },
    characters: { type: 'array', items: { type: 'string' }, description: 'Character names on screen' },
    props: { type: 'array', items: { type: 'string' } },
    camera: { type: 'string' },
    action: { type: 'string' },
    dialogue: { type: 'string', description: 'Spoken line (empty for none). Supports ElevenLabs v3/v4 [audio tags]' },
    speaker: { type: 'string', description: 'Character name, or Narrador' },
    duration: { type: 'number', description: 'Seconds' },
    keyframe_prompt: { type: 'string' },
    keyframe_asset_id: { type: 'string', description: 'Attach an existing library image as the keyframe' },
    video_prompt: { type: 'string' },
    video_input_mode: { type: 'string', enum: ['ff', 'fflf', 'ref', 't2v'] },
    remove: { type: 'boolean' },
  },
  additionalProperties: false,
}

const projectFieldsSchema = {
  title: { type: 'string' },
  logline: { type: 'string' },
  idea: { type: 'string' },
  script: { type: 'string' },
  genre: { type: 'string' },
  tone: { type: 'string' },
  content_type: { type: 'string', description: 'microdrama, libre, faceless, …' },
  aspect_ratio: { type: 'string', description: 'e.g. 9:16, 16:9' },
  visual_style: { type: 'string' },
  image_model: { type: 'string', description: 'App model name, e.g. "Nano-Banana-2.1 (MachGen)"' },
  image_resolution: { type: 'string', description: '1K, 2K, 4K' },
  video_model: { type: 'string', description: 'App model name, e.g. "Seedance 2.5 (MachGen)", "Kling 3.0"' },
  video_resolution: { type: 'string', description: 'e.g. 720p; "Draft 480p" runs Seedance 2.5 (MachGen) in draft mode' },
  video_duration: { type: 'number' },
  voice_model: { type: 'string', description: 'ElevenLabs model id, e.g. eleven_v4' },
  voice_source: { type: 'string', enum: ['eleven', 'video'], description: 'eleven = ElevenLabs TTS used as the lip-sync audio of each video' },
  narrator_voice_id: { type: 'string' },
  characters: { type: 'array', items: elementSchema({ role: { type: 'string' }, voice_id: { type: 'string', description: 'ElevenLabs voice id' } }) },
  scenarios: { type: 'array', items: elementSchema() },
  props: { type: 'array', items: elementSchema({ description: { type: 'string' } }) },
  shots: { type: 'array', items: shotSchema },
}

const projectIdSchema = { project_id: { type: 'string' } }
const idsSchema = { ids: { type: 'array', items: { type: 'string' }, description: 'Only these items (default: all of the stage)' } }
const onlyMissingSchema = { only_missing: { type: 'boolean', description: 'Skip items that already have a result (default true)' } }

// ─── Tools ───────────────────────────────────────────────────

export function getContentStudioTools(): McpTool[] {
  return [
    {
      name: 'content_studio_list_projects',
      title: 'List Content Studio projects',
      description: `List Content Studio pieces with the progress of each stage. ${WORKFLOW}`,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: READ_ONLY,
      handler: async () => {
        const rows = getRawDb().prepare('SELECT id FROM drama_projects ORDER BY updated_at DESC LIMIT 50').all() as any[]
        return rows.map((r) => getDramaProject(r.id)).filter(Boolean).map((p: any) => {
          const statuses = stageStatuses(p)
          return { id: p.id, title: p.title, workspace_id: p.workspaceId, stages: statuses.map((s) => `${s.stage}: ${s.done}/${s.total}${s.approved ? ' ✓' : ''}`), next_step: nextStep(statuses) }
        })
      },
    },
    {
      name: 'content_studio_get_project',
      title: 'Get Content Studio project',
      description: 'A piece with its characters, locations, props and shots, the asset ids of every generated image/audio/video (use preview_assets to show them), each stage\'s status and approval, and the next allowed step.',
      inputSchema: {
        type: 'object',
        properties: { ...projectIdSchema, include_prompts: { type: 'boolean', description: 'Also return the visual / keyframe / video prompts' } },
        required: ['project_id'],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => summarize(requireProject(str(args.project_id)), !!args.include_prompts),
    },
    {
      name: 'content_studio_create_project',
      title: 'Create Content Studio project',
      description: `Create a piece in Content Studio (the script stage): settings, characters, locations, props and shots. Nothing is generated. ${WORKFLOW}`,
      inputSchema: {
        type: 'object',
        properties: { ...projectFieldsSchema, workspace_id: { type: 'string', description: 'Default: the active workspace' } },
        required: ['title'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => {
        const project: any = {
          id: crypto.randomUUID(),
          workspaceId: optStr(args.workspace_id),
          currentStage: 1,
          voiceSource: 'eleven',
          voiceModel: 'eleven_v4',
          characters: [],
          scenarios: [],
          props: [],
          shots: [],
        }
        applyPatch(project, args)
        const { id } = saveDramaProject(project)
        try { await runInStudio('refreshList', {}) } catch { /* listed on next visit */ }
        return summarize(requireProject(id))
      },
    },
    {
      name: 'content_studio_update_project',
      title: 'Update Content Studio project',
      description: 'Edit a piece: settings, and characters / locations / props / shots patched by id (or name / shot order); remove: true deletes one, an entry without a match is added. replace_shots: true replaces the whole shot list. Changing something un-approves its stage and every later one (e.g. editing a dialogue line resets the voices and videos approvals). Generated media is kept; regenerate it with the stage tool.',
      inputSchema: {
        type: 'object',
        properties: { ...projectIdSchema, ...projectFieldsSchema, replace_shots: { type: 'boolean' } },
        required: ['project_id'],
        additionalProperties: false,
      },
      annotations: EDIT,
      handler: async (args) => {
        const projectId = str(args.project_id)
        let touched: Stage | null = null
        const project = await writeProject(projectId, (p) => { touched = applyPatch(p, args) })
        if (touched) clearApprovalsFrom(projectId, touched)
        return { ...(touched ? { unapproved_from: touched } : {}), ...summarize(project) }
      },
    },
    {
      name: 'content_studio_approve_stage',
      title: 'Approve Content Studio stage',
      description: 'Record that the USER approved a stage, which unlocks the next one. Call it only after showing the user that stage\'s results and receiving their explicit approval in the conversation — never on your own judgement, never to get past a blocked step.',
      inputSchema: {
        type: 'object',
        properties: { ...projectIdSchema, stage: { type: 'string', enum: [...STAGES] }, user_quote: { type: 'string', description: 'The user\'s words approving it' } },
        required: ['project_id', 'stage', 'user_quote'],
        additionalProperties: false,
      },
      annotations: EDIT,
      handler: async (args) => {
        const project = requireProject(str(args.project_id))
        const stage = stageOf(str(args.stage))
        const statuses = stageStatuses(project)
        const status = statuses[STAGES.indexOf(stage)]
        const blocker = statuses.slice(0, STAGES.indexOf(stage)).find((s) => !s.approved)
        if (blocker) throw new ToolInputError(`Approve "${blocker.label}" first: stages are approved in order.`)
        if (!status.complete) throw new ToolInputError(`"${status.label}" is not complete (${status.done}/${status.total}${status.missing ? `; missing: ${status.missing.join(', ')}` : ''}).`)
        setApproval(project.id, stage, str(args.user_quote))
        const after = stageStatuses(project)
        return { approved: stage, stages: after, next_step: nextStep(after) }
      },
    },
    {
      name: 'content_studio_generate_references',
      title: 'Generate characters, locations and props',
      description: 'Stage 2: generate the character sheets, location and prop images with Content Studio (project image model and style). Needs the script stage approved. Returns task ids for wait_for_tasks.',
      inputSchema: {
        type: 'object',
        properties: { ...projectIdSchema, ...idsSchema, ...onlyMissingSchema },
        required: ['project_id'],
        additionalProperties: false,
      },
      annotations: GENERATE,
      handler: async (args) => {
        const project = requireProject(str(args.project_id))
        assertStageOpen(project, 'references')
        const ids: string[] | undefined = args.ids?.length ? args.ids : undefined
        const onlyMissing = args.only_missing !== false && !ids
        const noImage = (x: any) => !(x.imageUrl || x.imageAssetId)
        if (ids) pick([...project.characters, ...project.scenarios, ...project.props], ids, noImage, false)
        const scoped = (list: any[]) => list.filter((x) => (ids ? ids.includes(x.id) : !onlyMissing || noImage(x))).map((x) => x.id)
        clearApprovalsFrom(project.id, 'references')
        const results = [
          ...(await dispatch(project.id, 'character', scoped(project.characters))),
          ...(await dispatch(project.id, 'scenario', scoped(project.scenarios))),
          ...(await dispatch(project.id, 'prop', scoped(project.props))),
        ]
        return { results, task_ids: taskIdsOf(results), next: 'wait_for_tasks with task_ids (preview: true), show the user, then content_studio_approve_stage("references") only on their approval.' }
      },
    },
    {
      name: 'content_studio_generate_keyframes',
      title: 'Generate shot keyframes',
      description: 'Stage 3: generate each shot\'s first frame with Content Studio, using the approved characters, locations and props as references. Needs the references stage approved.',
      inputSchema: {
        type: 'object',
        properties: { ...projectIdSchema, ...idsSchema, ...onlyMissingSchema },
        required: ['project_id'],
        additionalProperties: false,
      },
      annotations: GENERATE,
      handler: async (args) => {
        const project = requireProject(str(args.project_id))
        assertStageOpen(project, 'keyframes')
        const ids = pick(project.shots, args.ids, (sh: any) => !(sh.keyframeUrl || sh.keyframeAssetId), args.only_missing !== false && !args.ids?.length)
        clearApprovalsFrom(project.id, 'keyframes')
        const results = await dispatch(project.id, 'keyframe', ids)
        return { results, task_ids: taskIdsOf(results), next: 'wait_for_tasks with task_ids (preview: true), show every keyframe to the user, then content_studio_approve_stage("keyframes") only on their approval.' }
      },
    },
    {
      name: 'content_studio_generate_voices',
      title: 'Generate dialogue voices (ElevenLabs)',
      description: 'Stage 4: generate the dialogue audio of every shot with a line, with ElevenLabs (project voice model, e.g. eleven_v4) and each speaker\'s voice id. Needs the keyframes stage approved and an ElevenLabs voice id on every speaking character (set it with content_studio_update_project; find one with content_studio_list_voices). Runs synchronously and returns each shot\'s audio status.',
      inputSchema: {
        type: 'object',
        properties: { ...projectIdSchema, ...idsSchema, ...onlyMissingSchema },
        required: ['project_id'],
        additionalProperties: false,
      },
      annotations: GENERATE,
      handler: async (args) => {
        const project = requireProject(str(args.project_id))
        assertStageOpen(project, 'voices')
        if (project.voiceSource === 'video') throw new ToolInputError('voice_source is "video": the video model speaks the lines itself. Set voice_source "eleven" with content_studio_update_project to generate ElevenLabs voices.')
        if (!String(project.voiceModel || '').startsWith('eleven_')) throw new ToolInputError(`voice_model is "${project.voiceModel}"; set an ElevenLabs model such as eleven_v4.`)
        const dialogueShots = project.shots.filter((sh: any) => hasText(sh.dialogueText))
        const speakers = new Set(dialogueShots.map((sh: any) => String(sh.dialogueSpeaker || '').toLowerCase().trim()).filter(Boolean))
        const unvoiced = project.characters.filter((c: any) => speakers.has(String(c.name).toLowerCase().trim()) && !ELEVEN_VOICE_ID.test(c.voiceId || ''))
        if (unvoiced.length) throw new ToolInputError(`Assign an ElevenLabs voice id to: ${unvoiced.map((c: any) => c.name).join(', ')} (content_studio_list_voices, then content_studio_update_project).`)
        const ids = pick(dialogueShots, args.ids, (sh: any) => sh.audioStatus !== 'completed', args.only_missing !== false && !args.ids?.length)
        clearApprovalsFrom(project.id, 'voices')
        const results = await dispatch(project.id, 'voice', ids, 10 * 60_000)
        return { results, next: 'Show the user the audio of each shot (content_studio_get_project lists the files), then content_studio_approve_stage("voices") only on their approval.' }
      },
    },
    {
      name: 'content_studio_generate_videos',
      title: 'Generate shot videos',
      description: 'Stage 5: generate each shot\'s video with Content Studio (project video model and resolution), from its keyframe, with the shot\'s ElevenLabs audio as lip-sync reference. Needs the voices stage complete and approved.',
      inputSchema: {
        type: 'object',
        properties: { ...projectIdSchema, ...idsSchema, ...onlyMissingSchema },
        required: ['project_id'],
        additionalProperties: false,
      },
      annotations: GENERATE,
      handler: async (args) => {
        const project = requireProject(str(args.project_id))
        assertStageOpen(project, 'videos')
        const ids = pick(project.shots, args.ids, (sh: any) => sh.videoStatus !== 'completed', args.only_missing !== false && !args.ids?.length)
        clearApprovalsFrom(project.id, 'videos')
        const results = await dispatch(project.id, 'video', ids, 5 * 60_000)
        return { results, task_ids: taskIdsOf(results), next: 'wait_for_tasks with task_ids, show the clips to the user, then content_studio_approve_stage("videos") only on their approval.' }
      },
    },
    {
      name: 'content_studio_assemble',
      title: 'Assemble final video',
      description: 'Stage 6: assemble the approved shot videos into the final piece with Content Studio. Needs the videos stage approved.',
      inputSchema: {
        type: 'object',
        properties: { ...projectIdSchema, include_subtitles: { type: 'boolean' }, bg_music: { type: 'boolean' } },
        required: ['project_id'],
        additionalProperties: false,
      },
      annotations: GENERATE,
      handler: async (args) => {
        const project = requireProject(str(args.project_id))
        assertStageOpen(project, 'final')
        clearApprovalsFrom(project.id, 'final')
        const final = await runInStudio('assemble', { projectId: project.id, options: { includeSubtitles: !!args.include_subtitles, bgMusic: !!args.bg_music } }, 10 * 60_000)
        return { ...summarize(requireProject(project.id)), assembly: final }
      },
    },
    {
      name: 'content_studio_list_voices',
      title: 'List ElevenLabs voices',
      description: 'Search ElevenLabs voices (account and voice library) to cast characters and the narrator.',
      inputSchema: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          language: { type: 'string', description: 'e.g. es' },
          gender: { type: 'string', description: 'male, female' },
          page_size: { type: 'number', minimum: 1, description: 'Default 30' },
        },
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => runInStudio('listVoices', {
        search: optStr(args.search),
        language: optStr(args.language),
        gender: optStr(args.gender),
        pageSize: Math.min(100, Math.floor(num(args.page_size, 30))),
      }),
    },
    {
      name: 'content_studio_open',
      title: 'Open in Content Studio',
      description: 'Show a piece in the app\'s Content Studio so the user can review it.',
      inputSchema: { type: 'object', properties: { ...projectIdSchema }, required: ['project_id'], additionalProperties: false },
      annotations: READ_ONLY,
      handler: async (args) => {
        const project = requireProject(str(args.project_id))
        await runInStudio('open', { projectId: project.id })
        return { opened: project.id, title: project.title, stage_labels: STAGE_LABELS }
      },
    },
  ]
}
