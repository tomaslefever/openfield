import { create } from 'zustand'
import {
  ModelPricing,
  IMAGE_MODELS,
  VIDEO_MODELS,
  AUDIO_MODELS,
  LLM_MODELS,
} from '../lib/models'
import {
  buildImagePayload,
  buildVideoPayload,
  buildAudioPayload,
} from '../lib/payload-builder'
import {
  DramaContentType,
  CONTENT_TYPES_CONFIG,
  getMasterSystemPrompt,
} from '../lib/content-type-prompts'
import {
  prepareTtsLine,
  stripAudioTags,
  supportsAudioTags,
  dialogueWritingDirective,
  buildKeyframePrompt,
  buildVideoPrompt,
  type PromptRef,
  type PromptCharacter,
} from '../lib/drama-prompts'
import { useWorkspaceStore } from './workspace-store'
import { useProvidersStore, isModelConfigured, getConfiguredProviderIds } from './providers-store'
import { toast } from 'sonner'

export interface GenerationHistoryItem {
  id: string
  url: string
  localPath?: string
  assetId?: string
  prompt?: string
  timestamp: number
  model?: string
  duration?: number
  inputMode?: 'ff' | 'fflf' | 'ref' | 't2v'
}

export interface DramaCharacter {
  id: string
  name: string
  role: string
  visualPrompt: string
  voiceId: string
  imageAssetId?: string
  imageUrl?: string
  imageBase64?: string
  generating?: boolean
  taskId?: string
  imageHistory?: GenerationHistoryItem[]
}

export interface DramaScenario {
  id: string
  name: string
  visualPrompt: string
  imageAssetId?: string
  imageUrl?: string
  generating?: boolean
  taskId?: string
  imageHistory?: GenerationHistoryItem[]
}

export interface DramaProp {
  id: string
  name: string
  description: string
  visualPrompt: string
  imageAssetId?: string
  imageUrl?: string
  generating?: boolean
  taskId?: string
  imageHistory?: GenerationHistoryItem[]
}

export interface DramaShot {
  id: string
  order: number
  sceneNumber: number
  shotNumber: number
  cameraMovement: string
  characterNames: string[]
  scenarioName: string
  propNames?: string[]
  actionPrompt: string
  dialogueText: string
  dialogueSpeaker: string
  estimatedDuration: number
  keyframePrompt: string
  keyframeAssetId?: string
  keyframeUrl?: string
  keyframeGenerating?: boolean
  keyframeTaskId?: string
  keyframeHistory?: GenerationHistoryItem[]
  videoAssetId?: string
  videoLocalPath?: string
  videoUrl?: string
  videoTaskId?: string
  videoStatus?: 'idle' | 'queued' | 'generating' | 'completed' | 'failed'
  videoProgress?: number
  videoHistory?: GenerationHistoryItem[]
  /** How the clip is driven: first frame (default), first+last frame, or ingredients (reference images) */
  videoInputMode?: 'ff' | 'fflf' | 'ref' | 't2v'
  /** Motion/action prompt for the clip; falls back to camera movement + action */
  videoPrompt?: string
  videoRefUrl?: string
  videoRefLocalPath?: string
  videoRefAssetId?: string
  videoRefName?: string
  lastFrameUrl?: string
  lastFrameAssetId?: string
  audioAssetId?: string
  audioLocalPath?: string
  audioUrl?: string
  audioTaskId?: string
  audioStatus?: 'idle' | 'generating' | 'completed' | 'failed'
  createdAt?: string
  updatedAt?: string
}

export type VoiceSource = 'eleven' | 'video'

export interface ParsedDialogueTurn {
  speaker: string
  text: string
  voiceId?: string
  isNarrator?: boolean
}

/** ElevenLabs premade voices: the narrator and the characters start on different voices */
export const DEFAULT_NARRATOR_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'
export const DEFAULT_CHARACTER_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'

/** The narrator / voice-over is not a character: "Narrador", "Locutor", "V.O.", "Narrador (V.O.)"... An empty speaker counts as narration */
export function isNarratorName(name?: string): boolean {
  const s = (name || '').toLowerCase().replace(/[()[\].]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return true
  return /^(?:narrador|narradora|locutor|locutora|narrator|voiceover|voice over|voz en off|en off|off|v o|vo)(?: (?:v o|vo|voz en off|en off|off))?$/.test(s)
}

/** ElevenLabs voice ids are 20 chars; shorter ids belong to other TTS providers */
function elevenVoiceOr(voiceId: string | undefined, fallback: string): string {
  return voiceId && voiceId.length > 15 ? voiceId : fallback
}

/**
 * Spoken text for TTS: drops a leading speaker prefix ("Carlos:", "Narrador -") and stage directions.
 * With audioTags (Eleven v4/v3) English [tags] stay and Spanish (cues) become v4 tags.
 */
export function cleanTextForTts(text: string, audioTags = false): string {
  if (!text) return ''
  const withoutSpeaker = text.trim().replace(/^[A-ZÁÉÍÓÚÑa-záéíóúñ0-9_ ]{1,30}[:\-–—]\s*/i, '')
  return prepareTtsLine(withoutSpeaker, audioTags)
}

export function parseDialogueTurns(
  dialogueText: string,
  defaultSpeaker: string = '',
  characters: DramaCharacter[] = [],
  defaultVoiceId: string = '',
  narratorVoiceId: string = defaultVoiceId
): ParsedDialogueTurn[] {
  if (!dialogueText || !dialogueText.trim()) return []

  const lines = dialogueText.split('\n').map((l) => l.trim()).filter(Boolean)
  const turns: ParsedDialogueTurn[] = []

  const charMap = new Map<string, DramaCharacter>()
  for (const c of characters) {
    if (!isNarratorName(c.name)) charMap.set(c.name.toLowerCase().trim(), c)
  }

  for (const line of lines) {
    // "Nombre: texto" or "[Nombre] texto"; a bracket is a speaker only when it names one (else it is an audio tag)
    const match = line.match(/^(?:\[([^\]]+)\]|([^:\-–—[\]]{1,40}?)\s*[:\-–—])\s*(.*)$/)
    const known = (n: string) => charMap.has(n.toLowerCase().trim()) || isNarratorName(n)
    const bracketIsSpeaker = !!match?.[1] && known(match[1])
    // "Te lo dije: no vuelvas" is a sentence, "Creador UGC: ..." is a speaker
    const prefixIsSpeaker = !!match?.[2] && (known(match[2]) || /^[A-ZÁÉÍÓÚÑ][\wáéíóúñ.]*(?: [A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ.]*){0,2}$/.test(match[2].trim()))
    if (match && (prefixIsSpeaker || bracketIsSpeaker)) {
      const speakerRaw = (match[1] || match[2] || '').trim()
      const textRaw = (match[3] || '').trim()
      if (textRaw) {
        const narrator = isNarratorName(speakerRaw)
        const foundChar = !narrator ? charMap.get(speakerRaw.toLowerCase()) : undefined
        turns.push({
          speaker: foundChar ? foundChar.name : speakerRaw,
          text: prepareTtsLine(textRaw, true),
          voiceId: narrator ? narratorVoiceId : (foundChar?.voiceId || defaultVoiceId),
          isNarrator: narrator,
        })
        continue
      }
    }

    const narrator = isNarratorName(defaultSpeaker)
    const foundChar = !narrator ? charMap.get((defaultSpeaker || '').toLowerCase().trim()) : undefined
    turns.push({
      speaker: foundChar ? foundChar.name : (defaultSpeaker || 'Narrador (V.O.)'),
      text: prepareTtsLine(line, true),
      voiceId: narrator ? narratorVoiceId : (foundChar?.voiceId || defaultVoiceId),
      isNarrator: narrator,
    })
  }

  return turns
}

/**
 * Robust duration extractor for script headers, scene tags, and shot descriptions.
 * Detects patterns like:
 * - (5s), (5 seg), (5 segundos), (5 sec), (5")
 * - [10s], [10 seg], [8 segs]
 * - "Duración: 5s", "Duracion: 6 segundos"
 * - (00:05), 00:08, 01:15
 * - " - 5s", " - 8 seg"
 */
export function extractDurationFromText(text?: string): number | undefined {
  if (!text) return undefined

  // 1. mm:ss timecode format (e.g. (00:05), 00:08, [01:10])
  const timecodeMatch = text.match(/(?:^|[(\[\s–—-])(\d{1,2}):(\d{2})(?:[)\]\s–—-]|$)/)
  if (timecodeMatch) {
    const mins = parseInt(timecodeMatch[1], 10)
    const secs = parseInt(timecodeMatch[2], 10)
    const total = mins * 60 + secs
    if (total > 0 && total <= 300) return total
  }

  // 2. Explicit duration labels (e.g. "Duración: 5s", "Duracion estimada: 8 seg")
  const explicitMatch = text.match(/(?:duraci[oó]n|duration)(?:\s+estimada)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:s(?:eg(?:undo)?s?)?|sec(?:ond)?s?)?\b/i)
  if (explicitMatch) {
    const val = Math.round(parseFloat(explicitMatch[1]))
    if (val > 0 && val <= 300) return val
  }

  // 3. Bracketed/parenthesized duration (e.g. (5s), (5 seg), (5 segundos), [10s], [8 segs], (5"))
  const bracketMatch = text.match(/[(\[]\s*(\d+(?:\.\d+)?)\s*(?:s(?:eg(?:undo)?s?)?|sec(?:ond)?s?|")\s*[)\]]/i)
  if (bracketMatch) {
    const val = Math.round(parseFloat(bracketMatch[1]))
    if (val > 0 && val <= 300) return val
  }

  // 4. Inline duration with separator (e.g. " - 5s", " : 8 seg", " ~ 6s", " de 5 segundos")
  const inlineMatch = text.match(/(?:^|[\s–—:|~de])\s*(\d+(?:\.\d+)?)\s*(?:s(?:eg(?:undo)?s?)?|sec(?:ond)?s?|")(?:\s|[\),.;–—:]|$)/i)
  if (inlineMatch) {
    const val = Math.round(parseFloat(inlineMatch[1]))
    if (val > 0 && val <= 300) return val
  }

  return undefined
}

/** Storyboard and video share stage 3; projects saved on the old video stage (4) land there */
function normalizeStage(stage?: number): number {
  if (!stage || stage < 1) return 1
  return stage === 4 ? 3 : Math.min(stage, 5)
}

async function dispatchGeneration(api: any, type: 'video' | 'image' | 'audio', payload: any) {
  const provider = payload?.provider || (
    payload?.model?.startsWith('klingai/') ? 'klingai' :
    payload?.model?.startsWith('pruna/') ? 'pruna' :
    payload?.model?.startsWith('apimart/') ? 'apimart' :
    payload?.model?.startsWith('machgen/') ? 'machgen' :
    payload?.model?.startsWith('higgsfield/') ||
    payload?.model?.startsWith('bytedance/seedance-2.0') ||
    payload?.model?.startsWith('bytedance/seedance-2.5') ||
    payload?.model?.startsWith('kling-video/') ||
    payload?.model?.startsWith('minimax/h3/') ||
    payload?.model?.startsWith('alibaba/wan-3.0') ||
    payload?.model?.startsWith('higgsfield-ai/') ||
    payload?.model?.startsWith('flux-pro/') ||
    payload?.model?.startsWith('xai/grok-imagine') ? 'higgsfield' :
    payload?.model?.startsWith('fal-ai/') || payload?.model?.startsWith('minimax/') ? 'fal' :
    payload?.model?.startsWith('prunaai/') ? 'replicate' : 'kie'
  )
  if (provider === 'klingai' && api?.kling?.generate) {
    return api.kling.generate(payload)
  }
  if (provider === 'pruna' && api?.pruna?.generate) {
    return api.pruna.generate(payload)
  }
  if (provider === 'apimart' && api?.apimart?.generate) {
    return api.apimart.generate(payload)
  }
  if (provider === 'machgen' && api?.machgen?.generate) {
    return api.machgen.generate(payload)
  }
  if (provider === 'fal' && api?.fal?.generate) {
    return api.fal.generate(payload)
  }
  if (provider === 'higgsfield' && api?.higgsfield?.generate) {
    return api.higgsfield.generate(payload)
  }
  if (provider === 'replicate' && api?.replicate?.generate) {
    return api.replicate.generate(payload)
  }
  if (type === 'video') return api?.openfield?.generateVideo?.(payload)
  if (type === 'audio') return api?.openfield?.generateAudio?.(payload)
  return api?.openfield?.generateImage?.(payload)
}

export interface FinalVideoState {
  assetId?: string
  localPath?: string
  url?: string
  rendering?: boolean
  error?: string
  progress?: number
}

export interface DramaProjectSummary {
  id: string
  workspaceId?: string
  title: string
  logline: string
  ideaPrompt: string
  contentType?: DramaContentType
  customPromptGuide?: string
  genre: string
  tone: string
  visualStyle: string
  aspectRatio: string
  currentStage: number
  coverImage: string
  updatedAt: number
  createdAt: number
  progress: {
    overall: number
    stage1: number
    stage2: number
    stage3: number
    stage4: number
    stage5: number
    stage6: number
    stats: {
      totalChars: number
      genChars: number
      totalScns: number
      genScns: number
      totalProps: number
      genProps: number
      totalShots: number
      genKeyframes: number
      genVideos: number
      totalVoices: number
      genVoices: number
      hasFinalVideo: boolean
    }
  }
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

const isNanoBanana21 = (m: ModelPricing) => /nano[- ]banana[- ]2\.1/i.test(m.name)
const isNanoBananaPro = (m: ModelPricing) => /nano[- ]banana[- ]pro/i.test(m.name)

/** The model matching `match` on the first configured provider, in the Providers order */
function firstConfiguredImageModel(match: (m: ModelPricing) => boolean): ModelPricing | undefined {
  try {
    const ids = getConfiguredProviderIds(useProvidersStore.getState().configuredProviders)
    for (const id of ids) {
      const found = IMAGE_MODELS.find((m) => match(m) && (m.provider || 'kie') === id)
      if (found) return found
    }
  } catch {}
  return undefined
}

/** Nano Banana 2.1 by default; Nano Banana Pro of the first configured provider when no provider offers 2.1 */
export const getDefaultImageModel = (): ModelPricing =>
  firstConfiguredImageModel(isNanoBanana21) ||
  firstConfiguredImageModel(isNanoBananaPro) ||
  IMAGE_MODELS.find(isNanoBanana21) ||
  IMAGE_MODELS[0]

/** Generates with `model`; if Nano Banana 2.1 is refused, retries on Nano Banana Pro of the first configured provider */
async function dispatchImage(api: any, model: ModelPricing, build: (model: ModelPricing) => any) {
  let failure: unknown
  try {
    const task = await dispatchGeneration(api, 'image', build(model))
    if (typeof task === 'string' ? task : (task?.taskId || task?.id)) return task
  } catch (err) {
    failure = err
  }
  const fallback = isNanoBanana21(model) ? firstConfiguredImageModel(isNanoBananaPro) : undefined
  if (!fallback) {
    if (failure) throw failure
    return undefined
  }
  console.warn(`[DramaStore] ${model.name} failed, retrying with ${fallback.name}:`, failure)
  toast.info(`${model.name} no respondió: usando ${fallback.name}`)
  return dispatchGeneration(api, 'image', build(fallback))
}

const DEFAULT_IMAGE_MODEL = getDefaultImageModel()

/** The shot's people: on-screen speakers first (in speaking order), then the rest of its cast */
function shotCast(
  state: { characters: DramaCharacter[]; narratorVoiceId?: string },
  shot: DramaShot
): { charsInShot: DramaCharacter[]; speakers: string[]; turns: ParsedDialogueTurn[] } {
  const turns = parseDialogueTurns(shot.dialogueText || '', shot.dialogueSpeaker, state.characters)
  const byName = (n: string) => state.characters.find((c) => c.name.toLowerCase().trim() === n.toLowerCase().trim())
  const speakerChars: DramaCharacter[] = []
  for (const t of turns) {
    const c = t.isNarrator ? undefined : byName(t.speaker)
    if (c && !speakerChars.includes(c)) speakerChars.push(c)
  }
  const rest = state.characters.filter(
    (c) => (shot.characterNames || []).includes(c.name) && !isNarratorName(c.name) && !speakerChars.includes(c)
  )
  return { charsInShot: [...speakerChars, ...rest], speakers: speakerChars.map((c) => c.name), turns }
}

function toPromptRef(r: { refType?: string; name?: string }): PromptRef {
  const role = r.refType === 'character' || r.refType === 'scenario' || r.refType === 'prop' ? r.refType : 'frame'
  return { role, name: r.name || '' }
}

function promptCharacter(c: DramaCharacter, refs: PromptRef[]): PromptCharacter {
  return {
    name: c.name,
    role: c.role,
    visualPrompt: c.visualPrompt,
    hasRef: refs.some((r) => r.role === 'character' && r.name === c.name),
  }
}
const DEFAULT_VIDEO_MODEL = VIDEO_MODELS.find(m => m.t2vId === 'kling-3.0/video') || VIDEO_MODELS[0]
const DEFAULT_VOICE_MODEL = AUDIO_MODELS.find(m => m.t2aId === 'eleven_v4') || AUDIO_MODELS[0]
export const getDefaultLlmModel = (): ModelPricing => {
  try {
    const configured = useProvidersStore.getState().configuredProviders
    const found = LLM_MODELS.find((m) => isModelConfigured(m, configured))
    if (found) return found
  } catch {}
  return LLM_MODELS[0]
}
const DEFAULT_LLM_MODEL = getDefaultLlmModel()

interface ShortDramaState {
  // Navigation & View Mode
  viewMode: 'hub' | 'editor'
  setViewMode: (mode: 'hub' | 'editor') => void
  projectsList: DramaProjectSummary[]
  isLoadingProjects: boolean
  isSaving: boolean
  lastSavedAt?: number
  resetForWorkspace: () => void

  // Current Project State
  id: string
  workspaceId: string
  title: string
  contentType: DramaContentType
  customPromptGuide: string
  ideaPrompt: string
  genre: string
  tone: string
  visualStyle: string
  aspectRatio: string
  shotsCount: number
  currentStage: number
  isGeneratingScript: boolean
  scriptError?: string
  isAutoRunning: boolean
  autoRunStatus: string

  // Global & Stage Model Selectors
  llmModel: ModelPricing
  imageModel: ModelPricing
  imageResolution: string
  videoModel: ModelPricing
  videoResolution: string
  videoDuration: number
  isSequentialVideoGen: boolean
  videoGenBatchSize: number
  setIsSequentialVideoGen: (enabled: boolean) => void
  setVideoGenBatchSize: (size: number) => void
  voiceModel: ModelPricing
  voiceId: string
  /** Narrator / voice-over voice, kept apart from the characters' voices */
  narratorVoiceId: string
  /** 'eleven': ElevenLabs voices drive every shot (consistent); 'video': the video model voices each shot */
  voiceSource: VoiceSource

  script: string
  logline: string
  characters: DramaCharacter[]
  scenarios: DramaScenario[]
  props: DramaProp[]
  shots: DramaShot[]
  finalVideo: FinalVideoState

  // Project DB Operations
  fetchProjectsList: (workspaceId?: string) => Promise<void>
  openProject: (id: string) => Promise<void>
  createNewProject: (initialData?: Partial<ShortDramaState>) => Promise<string>
  saveCurrentProject: () => Promise<void>
  debouncedAutoSave: (delayMs?: number) => void
  deleteProject: (id: string) => Promise<void>
  duplicateProject: (id: string) => Promise<void>
  moveProjectWorkspace: (projectId: string, newWorkspaceId: string) => Promise<void>

  // Editor Actions
  setStage: (stage: number) => void
  setMetadata: (data: Partial<ShortDramaState>) => void
  setLlmModel: (model: ModelPricing) => void
  setImageModel: (model: ModelPricing, resolution?: string) => void
  setVideoModel: (model: ModelPricing, resolution?: string, duration?: number) => void
  setVoiceModel: (model: ModelPricing, voiceId?: string) => void
  setNarratorVoice: (voiceId: string) => void
  setVoiceSource: (source: VoiceSource) => void
  setScript: (script: string) => void

  updateCharacter: (id: string, data: Partial<DramaCharacter>) => void
  addCharacter: (char: Omit<DramaCharacter, 'id'>) => void
  removeCharacter: (id: string) => void

  updateScenario: (id: string, data: Partial<DramaScenario>) => void
  addScenario: (scn: Omit<DramaScenario, 'id'>) => void
  removeScenario: (id: string) => void

  updateProp: (id: string, data: Partial<DramaProp>) => void
  addProp: (prop: Omit<DramaProp, 'id'>) => void
  removeProp: (id: string) => void

  updateShot: (id: string, data: Partial<DramaShot>) => void
  addShot: (shot?: Partial<DramaShot>) => void
  duplicateShot: (id: string) => void
  removeShot: (id: string) => void
  reorderShots: (startIndex: number, endIndex: number) => void

  generateScriptBreakdown: (promptOverride?: string) => Promise<void>
  parseScriptToShots: (scriptText?: string) => void
  generateCharacterImage: (characterId: string) => Promise<void>
  generateAllCharacterImages: (onlyMissing?: boolean) => Promise<void>
  regenerateCharacterVisualPrompt: (characterId: string) => Promise<void>
  regenerateAllCharacterVisualPrompts: () => Promise<void>
  generateScenarioImage: (scenarioId: string) => Promise<void>
  generateAllScenarioImages: (onlyMissing?: boolean) => Promise<void>
  regenerateScenarioVisualPrompt: (scenarioId: string) => Promise<void>
  regenerateAllScenarioVisualPrompts: () => Promise<void>
  generatePropImage: (propId: string) => Promise<void>
  generateAllPropImages: (onlyMissing?: boolean) => Promise<void>
  regeneratePropVisualPrompt: (propId: string) => Promise<void>
  regenerateAllPropVisualPrompts: () => Promise<void>
  regenerateAllStage2Prompts: () => Promise<void>
  generateShotKeyframe: (
    shotId: string,
    customParams?: {
      prompt?: string
      model?: ModelPricing
      resolution?: string
      aspectRatio?: string
      imageBase64?: string
      imageUrl?: string
      imageRefs?: any[]
    }
  ) => Promise<void>
  generateAllKeyframes: (onlyMissing?: boolean) => Promise<void>
  regenerateShotKeyframePrompt: (shotId: string) => Promise<void>
  regenerateAllKeyframePrompts: () => Promise<void>
  generateShotVideo: (
    shotId: string,
    customParams?: {
      prompt?: string
      duration?: number
      model?: ModelPricing
      resolution?: string
      firstFrameBase64?: string
      firstFrameUrl?: string
      firstFrameAssetId?: string
      lastFrameBase64?: string
      lastFrameUrl?: string
      lastFrameAssetId?: string
      imageRefs?: any[]
      videoRefs?: any[]
      cameraMovement?: string
      cameraLens?: string
      cameraShot?: string
      cameraLevel?: string
      lighting?: string
      filmLook?: string
      inputMode?: 'ff' | 'fflf' | 'ref' | 't2v'
    }
  ) => Promise<void>
  generateAllVideos: () => Promise<void>
  generateShotVoice: (shotId: string, customDialogueText?: string) => Promise<void>
  generateAllVoices: (onlyMissing?: boolean) => Promise<void>
  assembleFinalEpisode: (options?: { includeSubtitles?: boolean; bgMusic?: boolean }) => Promise<void>
  runFullAutoPipeline: () => Promise<void>
  syncPendingTasks: () => Promise<void>
  /** Follows a task started outside the store (e.g. QuickPromptComposer) */
  trackImageTask: (kind: 'character' | 'scenario' | 'prop' | 'keyframe', id: string, taskId: string) => void
  restoreCharacterImage: (charId: string, historyItemId: string) => void
  restoreScenarioImage: (scnId: string, historyItemId: string) => void
  restorePropImage: (propId: string, historyItemId: string) => void
  restoreShotKeyframe: (shotId: string, historyItemId: string) => void
  restoreShotVideo: (shotId: string, historyItemId: string) => void
  updateShotVideoInputMode: (shotId: string, mode: 'ff' | 'fflf' | 'ref' | 't2v') => void
  pollCharacterTask: (charId: string, taskId: string) => void
  pollScenarioTask: (scenarioId: string, taskId: string) => void
  pollPropTask: (propId: string, taskId: string) => void
  pollKeyframeTask: (shotId: string, taskId: string) => void
  pollVideoTask: (shotId: string, taskId: string) => void
  pollAudioTask: (shotId: string, taskId: string) => void
  reset: () => void
}

let autoSaveTimer: any = null
const activePolling = new Map<string, any>()
// Element/shot keys whose generation request is being dispatched right now
const inFlight = new Set<string>()

const FAILED_STATUSES = new Set(['failed', 'error', 'cancelled', 'canceled'])
// A task the DB no longer knows about is given up after this many checks
const MAX_MISSING_CHECKS = 20

/** Polls a task until it completes or fails; one watcher per task id */
function watchTask(
  taskId: string,
  intervalMs: number,
  handlers: {
    done: (status: any) => void | Promise<void>
    fail: (error?: string) => void
    progress?: (status: any) => void
  },
) {
  const api = (window as any).electronAPI
  if (!api?.openfield?.taskStatus || activePolling.has(taskId)) return
  let missing = 0
  const stop = () => {
    clearInterval(activePolling.get(taskId))
    activePolling.delete(taskId)
  }
  const check = async () => {
    try {
      const status = await api.openfield.taskStatus(taskId)
      if (!activePolling.has(taskId)) return
      if (!status) {
        if (++missing >= MAX_MISSING_CHECKS) {
          stop()
          handlers.fail('La tarea ya no existe')
        }
        return
      }
      missing = 0
      if (status.status === 'completed') {
        stop()
        await handlers.done(status)
      } else if (FAILED_STATUSES.has(status.status)) {
        stop()
        handlers.fail(status.status === 'cancelled' || status.status === 'canceled' ? 'Cancelada' : status.errorMessage || status.error)
      } else {
        handlers.progress?.(status)
      }
    } catch (err) {
      console.warn('[DramaStore] Task poll error:', taskId, err)
    }
  }
  activePolling.set(taskId, setInterval(check, intervalMs))
  check()
}

function taskResult(status: any): { assetId?: string; url?: string; localPath?: string } {
  let url = status.outputUrl || status.localPath || status.resultUrl
  if (!url && status.resultJson) {
    try {
      const p = typeof status.resultJson === 'string' ? JSON.parse(status.resultJson) : status.resultJson
      url = p.url || p.resultUrls?.[0] || p.imageUrl || p.videoUrl || p.audioUrl
    } catch { /* malformed result */ }
  }
  return { assetId: status.assetId, url, localPath: status.localPath }
}

async function taskResultWithPath(status: any) {
  const result = taskResult(status)
  if (!result.localPath && result.assetId) {
    try {
      const asset = await (window as any).electronAPI?.assets?.get(result.assetId)
      result.localPath = asset?.localPath || asset?.local_path || undefined
    } catch { /* keep the url */ }
  }
  return result
}

/** Prepends a version, dropping older entries for the same file */
function withHistory(
  history: GenerationHistoryItem[] | undefined,
  item: Omit<GenerationHistoryItem, 'id' | 'timestamp' | 'url'> & { url?: string },
): GenerationHistoryItem[] {
  const entry: GenerationHistoryItem = { id: uid(), timestamp: Date.now(), ...item, url: item.url || '' }
  return [entry, ...(history || []).filter((h) => h.url !== entry.url && (!entry.assetId || h.assetId !== entry.assetId))]
}

function notifyFailure(what: string, error?: string) {
  if (error === 'Cancelada') return
  toast.error(`No se pudo generar ${what}`, { description: error })
}

/** Resolves once `done()` holds (false on timeout) */
function waitUntil(done: () => boolean, timeoutMs = 20 * 60 * 1000, intervalMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    if (done()) return resolve(true)
    const start = Date.now()
    const timer = setInterval(() => {
      if (done()) {
        clearInterval(timer)
        resolve(true)
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer)
        resolve(false)
      }
    }, intervalMs)
  })
}

/** Marks `key` as dispatching so syncPendingTasks leaves its flags alone */
async function dispatchTracked<T>(key: string, run: () => Promise<T>): Promise<T> {
  inFlight.add(key)
  try {
    return await run()
  } finally {
    inFlight.delete(key)
  }
}

function waitForShotVideo(shotId: string, maxWaitMs = 900000): Promise<DramaShot | null> {
  return new Promise((resolve) => {
    const start = Date.now()
    const timer = setInterval(() => {
      const currentShot = useShortDramaStore.getState().shots.find((s) => s.id === shotId)
      if (!currentShot) {
        clearInterval(timer)
        resolve(null)
        return
      }
      if (currentShot.videoStatus === 'completed' || currentShot.videoStatus === 'failed') {
        clearInterval(timer)
        resolve(currentShot)
        return
      }
      if (Date.now() - start > maxWaitMs) {
        clearInterval(timer)
        resolve(currentShot)
        return
      }
    }, 1200)
  })
}

export const useShortDramaStore = create<ShortDramaState>((set, get) => ({
  viewMode: 'hub',
  setViewMode: async (mode) => {
    if (mode === 'hub') {
      const state = get()
      if (
        state.id &&
        (state.characters.length > 0 ||
          state.shots.length > 0 ||
          state.script.trim().length > 0 ||
          state.logline.trim().length > 0 ||
          (state.title && state.title !== 'Nueva Microserie' && state.title !== 'Microserie AI'))
      ) {
        await get().saveCurrentProject()
      }
      await get().fetchProjectsList('all')
    }
    set({ viewMode: mode })
  },
  projectsList: [],
  isLoadingProjects: false,
  isSaving: false,
  lastSavedAt: undefined,

  id: uid(),
  workspaceId: '',
  title: 'Content Studio',
  contentType: 'microdrama',
  customPromptGuide: '',
  ideaPrompt: '',
  genre: 'Drama de Suspenso',
  tone: 'Cinematográfico y Misterioso',
  visualStyle: 'Fotorealismo cinematográfico, iluminación dramática de claroscuro, 8K',
  aspectRatio: '9:16',
  shotsCount: 4,
  currentStage: 1,
  isGeneratingScript: false,
  scriptError: undefined,
  isAutoRunning: false,
  autoRunStatus: '',

  llmModel: DEFAULT_LLM_MODEL,
  imageModel: DEFAULT_IMAGE_MODEL,
  imageResolution: '1K',
  videoModel: DEFAULT_VIDEO_MODEL,
  videoResolution: '720p',
  videoDuration: 5,
  isSequentialVideoGen: true,
  videoGenBatchSize: 2,
  voiceModel: DEFAULT_VOICE_MODEL,
  voiceId: 'male-qn-qingse',
  narratorVoiceId: DEFAULT_NARRATOR_VOICE_ID,
  voiceSource: 'eleven',

  script: '',
  logline: '',
  characters: [],
  scenarios: [],
  props: [],
  shots: [],
  finalVideo: {},

  // ─── Database Operations ──────────────────────────────────────────
  fetchProjectsList: async (workspaceId?: string) => {
    try {
      set({ isLoadingProjects: true })
      const api = (window as any).electronAPI
      if (api?.drama?.listProjects) {
        const list = await api.drama.listProjects(workspaceId || 'all')
        set({ projectsList: Array.isArray(list) ? list : [] })
      }
    } catch (err) {
      console.error('[Drama Store] Error listing projects:', err)
    } finally {
      set({ isLoadingProjects: false })
    }
  },

  resetForWorkspace: () => {
    set({
      id: '',
      workspaceId: '',
      title: 'Mi Microserie AI',
      contentType: 'microdrama',
      customPromptGuide: '',
      characters: [],
      scenarios: [],
      props: [],
      shots: [],
      finalVideo: {},
      viewMode: 'hub',
    })
    get().fetchProjectsList('all')
  },

  openProject: async (id: string) => {
    try {
      const api = (window as any).electronAPI
      if (api?.drama?.getProject) {
        const proj = await api.drama.getProject(id)
        if (proj) {
          const llm = LLM_MODELS.find((m) => m.modelId === proj.llmModel || m.name === proj.llmModel) || DEFAULT_LLM_MODEL
          const imgM = IMAGE_MODELS.find((m) => m.name === proj.imageModel) || IMAGE_MODELS.find((m) => m.t2iId === proj.imageModel || (proj.imageModel === 'seedream-5-pro-text-to-image' && m.t2iId === 'seedream/5-pro-text-to-image')) || DEFAULT_IMAGE_MODEL
          const vidM = VIDEO_MODELS.find((m) => m.name === proj.videoModel) || VIDEO_MODELS.find((m) => m.t2vId === proj.videoModel) || DEFAULT_VIDEO_MODEL
          const audM = AUDIO_MODELS.find((m) => m.t2aId === proj.voiceModel || m.name === proj.voiceModel) || DEFAULT_VOICE_MODEL

          const cType: DramaContentType = proj.contentType || proj.content_type || 'microdrama'

          set({
            id: proj.id,
            workspaceId: proj.workspaceId || proj.workspace_id || '',
            title: proj.title || 'Pieza Content Studio',
            contentType: cType,
            customPromptGuide: proj.customPromptGuide || proj.custom_prompt_guide || '',
            logline: proj.logline || '',
            ideaPrompt: proj.ideaPrompt || '',
            genre: proj.genre || 'Drama de Suspenso',
            tone: proj.tone || 'Cinematográfico',
            visualStyle: proj.visualStyle || '',
            aspectRatio: proj.aspectRatio || '9:16',
            shotsCount: typeof proj.shotsCount === 'number' ? proj.shotsCount : (typeof proj.shots_count === 'number' ? proj.shots_count : (proj.shots?.length || 4)),
            currentStage: normalizeStage(proj.currentStage),
            llmModel: llm,
            imageModel: imgM,
            imageResolution: proj.imageResolution || '1K',
            videoModel: vidM,
            videoResolution: proj.videoResolution || '720p',
            videoDuration: proj.videoDuration || 5,
            voiceModel: audM,
            voiceId: proj.voiceId || 'male-qn-qingse',
            // Older projects cast the narrator as a character: reuse that voice
            narratorVoiceId:
              proj.narratorVoiceId ||
              (proj.characters || []).find((c: DramaCharacter) => isNarratorName(c.name) && c.voiceId?.length > 15)?.voiceId ||
              DEFAULT_NARRATOR_VOICE_ID,
            voiceSource: proj.voiceSource === 'video' ? 'video' : 'eleven',
            script: proj.scriptText || '',
            characters: proj.characters || [],
            scenarios: proj.scenarios || [],
            props: proj.props || [],
            shots: proj.shots || [],
            finalVideo: {
              assetId: proj.finalVideoAssetId,
              localPath: proj.finalVideoPath,
            },
            viewMode: 'editor',
            lastSavedAt: proj.updatedAt || Date.now(),
          })
          get().syncPendingTasks()
          return
        }
      }
    } catch (err) {
      console.error('[Drama Store] Error opening project:', id, err)
    }
  },

  createNewProject: async (initialData) => {
    const newId = uid()
    const cType: DramaContentType = initialData?.contentType || 'microdrama'
    const config = CONTENT_TYPES_CONFIG[cType] || CONTENT_TYPES_CONFIG.microdrama
    const currentActiveWs = useWorkspaceStore.getState().activeId || ''

    set({
      id: newId,
      workspaceId: initialData?.workspaceId || currentActiveWs,
      title: initialData?.title || `Nueva Pieza - ${config.shortLabel}`,
      contentType: cType,
      customPromptGuide: initialData?.customPromptGuide || '',
      ideaPrompt: initialData?.ideaPrompt || '',
      genre: initialData?.genre || config.genres[0] || 'Drama de Suspenso',
      tone: initialData?.tone || config.tones[0] || 'Cinematográfico y Misterioso',
      visualStyle: initialData?.visualStyle || config.defaultVisualStyle,
      aspectRatio: initialData?.aspectRatio || config.defaultAspectRatio,
      shotsCount: typeof initialData?.shotsCount === 'number' ? initialData.shotsCount : config.defaultShotsCount,
      voiceModel: initialData?.voiceModel || DEFAULT_VOICE_MODEL,
      narratorVoiceId: initialData?.narratorVoiceId || DEFAULT_NARRATOR_VOICE_ID,
      voiceSource: initialData?.voiceSource || 'eleven',
      imageModel: initialData?.imageModel || getDefaultImageModel(),
      currentStage: 1,
      script: '',
      logline: '',
      characters: [],
      scenarios: [],
      props: [],
      shots: [],
      finalVideo: {},
      isGeneratingScript: false,
      scriptError: undefined,
      isAutoRunning: false,
      autoRunStatus: '',
      viewMode: 'editor',
    })

    // Immediately save row to database and sync project list
    await get().saveCurrentProject()
    await get().fetchProjectsList()
    return newId
  },

  debouncedAutoSave: (delayMs = 600) => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
    }
    autoSaveTimer = setTimeout(() => {
      get().saveCurrentProject()
    }, delayMs)
  },

  saveCurrentProject: async () => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }
    const state = get()
    try {
      set({ isSaving: true })
      const api = (window as any).electronAPI
      if (api?.drama?.saveProject) {
        const payload = {
          id: state.id,
          workspaceId: state.workspaceId || undefined,
          title: state.title,
          contentType: state.contentType,
          customPromptGuide: state.customPromptGuide,
          logline: state.logline,
          ideaPrompt: state.ideaPrompt,
          genre: state.genre,
          tone: state.tone,
          visualStyle: state.visualStyle,
          aspectRatio: state.aspectRatio,
          shotsCount: state.shotsCount,
          currentStage: state.currentStage,
          llmModel: state.llmModel.modelId || state.llmModel.name,
          // Names are unique; ids are shared across providers (loading still accepts old ids)
          imageModel: state.imageModel.name || state.imageModel.t2iId,
          imageResolution: state.imageResolution,
          videoModel: state.videoModel.name || state.videoModel.t2vId,
          videoResolution: state.videoResolution,
          videoDuration: state.videoDuration,
          voiceModel: state.voiceModel.t2aId || state.voiceModel.name,
          voiceId: state.voiceId,
          narratorVoiceId: state.narratorVoiceId,
          voiceSource: state.voiceSource,
          scriptText: state.script,
          finalVideoAssetId: state.finalVideo.assetId,
          finalVideoPath: state.finalVideo.localPath,
          characters: state.characters,
          scenarios: state.scenarios,
          props: state.props,
          shots: state.shots,
        }
        await api.drama.saveProject(payload)
        set({ lastSavedAt: Date.now() })
      }
    } catch (err) {
      console.error('[Drama Store] Error auto-saving project:', err)
    } finally {
      set({ isSaving: false })
    }
  },

  deleteProject: async (id: string) => {
    try {
      const api = (window as any).electronAPI
      if (api?.drama?.deleteProject) {
        await api.drama.deleteProject(id)
        await get().fetchProjectsList()
      }
    } catch (err) {
      console.error('[Drama Store] Error deleting project:', id, err)
    }
  },

  duplicateProject: async (id: string) => {
    try {
      const api = (window as any).electronAPI
      if (api?.drama?.duplicateProject) {
        await api.drama.duplicateProject(id)
        await get().fetchProjectsList()
      }
    } catch (err) {
      console.error('[Drama Store] Error duplicating project:', id, err)
    }
  },

  moveProjectWorkspace: async (projectId: string, newWorkspaceId: string) => {
    try {
      const api = (window as any).electronAPI
      if (api?.drama?.moveWorkspace) {
        await api.drama.moveWorkspace(projectId, newWorkspaceId)
        if (get().id === projectId) {
          set({ workspaceId: newWorkspaceId })
        }
        await get().fetchProjectsList()
      }
    } catch (err) {
      console.error('[Drama Store] Error moving project workspace:', err)
    }
  },

  // ─── Editor Actions ───────────────────────────────────────────────
  setStage: (stage) => {
    set({ currentStage: normalizeStage(stage) })
    get().saveCurrentProject()
  },

  setMetadata: (data) => {
    set((s) => ({ ...s, ...data }))
    get().debouncedAutoSave()
  },

  setLlmModel: (model) => {
    set({ llmModel: model })
    get().saveCurrentProject()
  },

  setImageModel: (model, resolution) => {
    set((s) => ({
      imageModel: model,
      imageResolution: resolution || model.prices[0]?.resolution || '1K',
    }))
    get().saveCurrentProject()
  },

  setVideoModel: (model, resolution, duration) => {
    set((s) => ({
      videoModel: model,
      videoResolution: resolution || '720p',
      videoDuration: duration || s.videoDuration,
    }))
    get().saveCurrentProject()
  },

  setIsSequentialVideoGen: (enabled) => {
    set({ isSequentialVideoGen: enabled })
  },

  setVideoGenBatchSize: (size) => {
    set({ videoGenBatchSize: Math.max(1, Math.min(10, size)) })
  },

  setVoiceModel: (model, voiceId) => {
    set((s) => ({
      voiceModel: model,
      voiceId: voiceId || s.voiceId,
    }))
    get().saveCurrentProject()
  },

  setNarratorVoice: (voiceId) => {
    set({ narratorVoiceId: voiceId })
    get().saveCurrentProject()
  },

  setVoiceSource: (source) => {
    set({ voiceSource: source })
    get().saveCurrentProject()
  },

  setScript: (script) => {
    set({ script })
    get().debouncedAutoSave()
  },

  // ─── Characters ───────────────────────────────────────────────────
  updateCharacter: (id, data) => {
    set((s) => ({
      characters: s.characters.map((c) => (c.id === id ? { ...c, ...data } : c)),
    }))
    const api = (window as any).electronAPI
    if (api?.drama?.updateCharacter) {
      api.drama.updateCharacter(id, data).catch(() => {})
    }
    get().debouncedAutoSave()
  },

  addCharacter: (char) => {
    const newChar: DramaCharacter = { id: uid(), ...char }
    set((s) => ({ characters: [...s.characters, newChar] }))
    get().saveCurrentProject()
  },

  removeCharacter: (id) => {
    set((s) => ({ characters: s.characters.filter((c) => c.id !== id) }))
    get().saveCurrentProject()
  },

  // ─── Scenarios ────────────────────────────────────────────────────
  updateScenario: (id, data) => {
    set((s) => ({
      scenarios: s.scenarios.map((scn) => (scn.id === id ? { ...scn, ...data } : scn)),
    }))
    const api = (window as any).electronAPI
    if (api?.drama?.updateScenario) {
      api.drama.updateScenario(id, data).catch(() => {})
    }
    get().debouncedAutoSave()
  },

  addScenario: (scn) => {
    const newScn: DramaScenario = { id: uid(), ...scn }
    set((s) => ({ scenarios: [...s.scenarios, newScn] }))
    get().saveCurrentProject()
  },

  removeScenario: (id) => {
    set((s) => ({ scenarios: s.scenarios.filter((scn) => scn.id !== id) }))
    get().saveCurrentProject()
  },

  // ─── Props / Key Objects ──────────────────────────────────────────
  updateProp: (id, data) => {
    set((s) => ({
      props: s.props.map((pr) => (pr.id === id ? { ...pr, ...data } : pr)),
    }))
    const api = (window as any).electronAPI
    if (api?.drama?.updateProp) {
      api.drama.updateProp(id, data).catch(() => {})
    }
    get().debouncedAutoSave()
  },

  addProp: (prop) => {
    const newProp: DramaProp = { id: uid(), ...prop }
    set((s) => ({ props: [...s.props, newProp] }))
    get().saveCurrentProject()
  },

  removeProp: (id) => {
    set((s) => ({ props: s.props.filter((pr) => pr.id !== id) }))
    get().saveCurrentProject()
  },

  // ─── Shots ────────────────────────────────────────────────────────
  updateShot: (id, data) => {
    set((s) => ({
      shots: s.shots.map((sh) => (sh.id === id ? { ...sh, ...data } : sh)),
    }))
    const api = (window as any).electronAPI
    if (api?.drama?.updateShot) {
      api.drama.updateShot(id, data).catch(() => {})
    }
    get().debouncedAutoSave()
  },

  addShot: (shotData) => {
    set((s) => {
      const order = s.shots.length + 1
      const newShot: DramaShot = {
        id: uid(),
        order,
        sceneNumber: 1,
        shotNumber: order,
        cameraMovement: 'Plano Medio',
        characterNames: s.characters[0] ? [s.characters[0].name] : [],
        scenarioName: s.scenarios[0] ? s.scenarios[0].name : 'Escena principal',
        propNames: s.props[0] ? [s.props[0].name] : [],
        actionPrompt: 'El personaje reacciona al entorno con intensidad dramática.',
        dialogueText: '',
        dialogueSpeaker: s.characters[0] ? s.characters[0].name : '',
        estimatedDuration: s.videoDuration || 5,
        keyframePrompt: 'Cinematic shot, highly detailed, dramatic lighting',
        videoStatus: 'idle',
        audioStatus: 'idle',
        ...shotData,
      }
      return { shots: [...s.shots, newShot] }
    })
    get().saveCurrentProject()
  },

  duplicateShot: (id) => {
    set((s) => {
      const targetIndex = s.shots.findIndex((sh) => sh.id === id)
      if (targetIndex === -1) return s
      const source = s.shots[targetIndex]
      const duplicatedShot: DramaShot = {
        ...source,
        id: uid(),
        keyframeTaskId: undefined,
        keyframeGenerating: false,
        videoTaskId: undefined,
        videoStatus: source.videoUrl ? 'completed' : 'idle',
        videoProgress: 0,
        audioTaskId: undefined,
        audioStatus: source.audioUrl ? 'completed' : 'idle',
        createdAt: new Date().toISOString(),
      }
      const newShots = [...s.shots]
      newShots.splice(targetIndex + 1, 0, duplicatedShot)
      return {
        shots: newShots.map((sh, idx) => ({ ...sh, order: idx + 1, shotNumber: idx + 1 })),
      }
    })
    get().saveCurrentProject()
  },

  removeShot: (id) => {
    set((s) => ({
      shots: s.shots
        .filter((sh) => sh.id !== id)
        .map((sh, idx) => ({ ...sh, order: idx + 1, shotNumber: idx + 1 })),
    }))
    get().saveCurrentProject()
  },

  reorderShots: (startIndex, endIndex) => {
    set((s) => {
      const result = Array.from(s.shots)
      const [removed] = result.splice(startIndex, 1)
      result.splice(endIndex, 0, removed)
      return {
        shots: result.map((sh, idx) => ({ ...sh, order: idx + 1, shotNumber: idx + 1 })),
      }
    })
    get().saveCurrentProject()
  },

  // ─── Script Generation (Stage 1) ──────────────────────────────────
  generateScriptBreakdown: async (promptOverride) => {
    const state = get()
    const prompt = promptOverride || state.ideaPrompt
    if (!prompt.trim()) return

    set({ isGeneratingScript: true, scriptError: undefined })

    try {
      const api = (window as any).electronAPI
      const shotsCount = typeof state.shotsCount === 'number' ? state.shotsCount : 4
      const style = state.visualStyle
      const genre = state.genre
      const tone = state.tone
      const modelId = state.llmModel.modelId || state.llmModel.name

      if (!api?.openfield?.agentChat) {
        throw new Error('El servicio de chat con IA no está registrado en el entorno.')
      }

      const sysPrompt = getMasterSystemPrompt(state.contentType, {
        shotsCount,
        genre,
        tone,
        visualStyle: style,
        customPromptGuide: state.customPromptGuide,
      }) + dialogueWritingDirective(state.voiceSource)

      const shotsText = shotsCount > 0
        ? `Cantidad requerida de escenas/tomas: ${shotsCount}`
        : 'Cantidad de escenas/tomas: AUTO (determina libremente la cantidad óptima según el desarrollo narrativo)'

      const userContent = state.customPromptGuide && state.customPromptGuide.trim()
        ? `GUÍA Y DIRECTIVAS DE EXTRACCIÓN Y PROMPTS:\n${state.customPromptGuide.trim()}\n\nCONTENIDO / IDEA:\n${prompt}\nGénero: ${genre}\nTono: ${tone}\nEstilo visual: ${style}\n${shotsText}`
        : `Idea: ${prompt}\nGénero: ${genre}\nTono: ${tone}\nEstilo visual: ${style}\n${shotsText}`

      const res = await api.openfield.agentChat({
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userContent },
        ],
        model: modelId,
        provider: state.llmModel.provider || 'kie',
        stream: false,
      })

      const text = res?.content || res?.message?.content || ''
      if (!text) {
        throw new Error(`El modelo LLM (${state.llmModel.name}) no devolvió contenido. Verifica las credenciales del proveedor ${state.llmModel.provider?.toUpperCase() || 'KIE'}.`)
      }

      let jsonStr = text
      const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (codeMatch) {
        jsonStr = codeMatch[1]
      } else {
        const firstBrace = text.indexOf('{')
        const lastBrace = text.lastIndexOf('}')
        if (firstBrace !== -1 && lastBrace !== -1) {
          jsonStr = text.substring(firstBrace, lastBrace + 1)
        }
      }

      let breakdown: any = null
      try {
        breakdown = JSON.parse(jsonStr)
      } catch (parseErr) {
        throw new Error(`No se pudo interpretar el JSON retornado por ${state.llmModel.name}. Respuesta: ${text.slice(0, 160)}...`)
      }

      if (!breakdown || !Array.isArray(breakdown.shots) || breakdown.shots.length === 0) {
        throw new Error(`El LLM (${state.llmModel.name}) no generó una estructura de tomas válida.`)
      }

      // Populate store with breakdown
      // The narrator has its own voice in stage 4; it is never cast as a character
      const characters: DramaCharacter[] = (breakdown.characters || [])
        .filter((c: any) => !(c?.name && isNarratorName(c.name)))
        .map((c: any) => ({
        id: uid(),
        name: c.name || 'Personaje',
        role: c.role || 'Rol',
        visualPrompt: c.visualPrompt || `${c.name}, cinematic portrait, 8k, detailed, photorealistic`,
        voiceId: 'male-qn-qingse',
      }))

      const scenarios: DramaScenario[] = (breakdown.scenarios || []).map((s: any) => ({
        id: uid(),
        name: s.name || 'Locación',
        visualPrompt: s.visualPrompt || `${s.name}, cinematic film set, dramatic lighting, 8k`,
      }))

      const props: DramaProp[] = (breakdown.props || []).map((pr: any) => ({
        id: uid(),
        name: pr.name || 'Objeto Clave',
        description: pr.description || '',
        visualPrompt: pr.visualPrompt || `${pr.name}, cinematic isolated macro shot, 8k, photorealistic`,
      }))

      // Extract any scene/shot durations specified in the user's input prompt/script
      const promptLines = prompt.split('\n')
      const promptSceneDurations: Record<number, number> = {}
      for (const pLine of promptLines) {
        const match = pLine.match(/(?:escena|toma|scene|shot)\s*#?(\d+)/i)
        if (match) {
          const num = parseInt(match[1], 10)
          const dur = extractDurationFromText(pLine)
          if (num > 0 && dur) {
            promptSceneDurations[num] = dur
          }
        }
      }

      const shots: DramaShot[] = (breakdown.shots || []).map((sh: any, idx: number) => {
        const orderNum = sh.order || idx + 1
        const sceneNum = sh.sceneNumber || 1
        const shotNum = sh.shotNumber || idx + 1

        let parsedDuration: number | undefined
        if (typeof sh.estimatedDuration === 'number' && sh.estimatedDuration > 0) {
          parsedDuration = Math.round(sh.estimatedDuration)
        } else if (typeof sh.duration === 'number' && sh.duration > 0) {
          parsedDuration = Math.round(sh.duration)
        } else if (typeof sh.durationSeconds === 'number' && sh.durationSeconds > 0) {
          parsedDuration = Math.round(sh.durationSeconds)
        } else if (typeof sh.estimatedDuration === 'string' || typeof sh.duration === 'string') {
          parsedDuration = extractDurationFromText(sh.estimatedDuration || sh.duration)
        }

        if (!parsedDuration) {
          parsedDuration =
            promptSceneDurations[shotNum] ||
            promptSceneDurations[orderNum] ||
            promptSceneDurations[sceneNum] ||
            extractDurationFromText(sh.actionPrompt || '') ||
            extractDurationFromText(sh.cameraMovement || '') ||
            extractDurationFromText(sh.dialogueText || '')
        }

        const finalDuration = parsedDuration && parsedDuration > 0 ? parsedDuration : (state.videoDuration || 5)

        return {
          id: uid(),
          order: orderNum,
          sceneNumber: sceneNum,
          shotNumber: shotNum,
          cameraMovement: sh.cameraMovement || 'Plano Medio',
          characterNames: Array.isArray(sh.characterNames) ? sh.characterNames.filter((n: string) => !isNarratorName(n)) : [],
          scenarioName: sh.scenarioName || scenarios[0]?.name || 'Escena',
          propNames: Array.isArray(sh.propNames) ? sh.propNames : [],
          actionPrompt: sh.actionPrompt || '',
          dialogueText: sh.dialogueText || '',
          dialogueSpeaker: sh.dialogueSpeaker || '',
          estimatedDuration: finalDuration,
          keyframePrompt: sh.keyframePrompt || `${sh.actionPrompt}, cinematic lighting, photorealistic, 8k`,
          videoStatus: 'idle',
          audioStatus: 'idle',
        }
      })

      set({
        title: breakdown.title || state.title,
        logline: breakdown.logline || state.logline,
        characters,
        scenarios,
        props,
        shots,
        isGeneratingScript: false,
        script: text,
      })

      // Persist breakdown to SQLite
      await get().saveCurrentProject()
    } catch (err: any) {
      console.error('[Drama Store] Error in LLM breakdown:', err)
      set({
        isGeneratingScript: false,
        scriptError: err?.message || 'Ocurrió un error al contactar al LLM de KIE.',
      })
    }
  },

  parseScriptToShots: (scriptText?: string) => {
    const state = get()
    const text = scriptText || state.script
    if (!text || !text.trim()) return

    const lines = text.split('\n')
    const extractedShots: DramaShot[] = []
    let currentSceneNum = 1
    let currentSceneName = state.scenarios[0]?.name || 'Escena 1'
    let currentSceneDuration: number | undefined
    let shotIndex = 0

    let pendingAction = ''
    let pendingDialogue = ''
    let pendingSpeaker = ''
    let pendingCamera = 'Plano Medio'
    let pendingShotDuration: number | undefined

    const flushShot = () => {
      if (pendingAction.trim() || pendingDialogue.trim()) {
        shotIndex++
        const finalDur = pendingShotDuration || currentSceneDuration || state.videoDuration || 5
        extractedShots.push({
          id: uid(),
          order: shotIndex,
          sceneNumber: currentSceneNum,
          shotNumber: shotIndex,
          cameraMovement: pendingCamera,
          characterNames: state.characters[0] ? [state.characters[0].name] : [],
          scenarioName: currentSceneName,
          propNames: [],
          actionPrompt: pendingAction.trim(),
          dialogueText: pendingDialogue.trim(),
          dialogueSpeaker: pendingSpeaker.trim() || 'Narrador',
          estimatedDuration: finalDur,
          keyframePrompt: `${pendingAction.trim()}, cinematic lighting, 8k`,
          videoStatus: 'idle',
          audioStatus: 'idle',
        })
        pendingAction = ''
        pendingDialogue = ''
        pendingSpeaker = ''
        pendingCamera = 'Plano Medio'
        pendingShotDuration = undefined
      }
    }

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const sceneMatch = trimmed.match(/^##\s+(.+)/)
      const shotMatch = trimmed.match(/^###\s+(.+)/)

      if (sceneMatch) {
        flushShot()
        const rawTitle = sceneMatch[1].trim()
        currentSceneDuration = extractDurationFromText(rawTitle)
        currentSceneName = rawTitle.replace(/[(\[].*?[)\]]/g, '').trim() || `Escena ${currentSceneNum}`
        currentSceneNum++
        continue
      }

      if (shotMatch) {
        flushShot()
        const rawShot = shotMatch[1].trim()
        pendingShotDuration = extractDurationFromText(rawShot)
        pendingCamera = rawShot.replace(/[(\[].*?[)\]]/g, '').trim() || 'Plano Medio'
        continue
      }

      // Check dialogue format: "CARLOS: Hola" or "Carlos: Hola"
      const dialogueMatch = trimmed.match(/^([A-ZÁÉÍÓÚÑa-záéíóúñ0-9_ ]{1,30})[:\-–—]\s*["“'«]?(.*?)["”'»]?$/)
      if (dialogueMatch && !trimmed.startsWith('#')) {
        pendingSpeaker = dialogueMatch[1].trim()
        pendingDialogue = dialogueMatch[2].trim()
        continue
      }

      if (!trimmed.startsWith('#')) {
        const lineDur = extractDurationFromText(trimmed)
        if (lineDur && !pendingShotDuration) {
          pendingShotDuration = lineDur
        }
        pendingAction += (pendingAction ? ' ' : '') + trimmed
      }
    }
    flushShot()

    if (extractedShots.length > 0) {
      set({ shots: extractedShots })
      get().saveCurrentProject()
    }
  },

  // ─── Task Polling and Auto-Reconnection ─────────────────────────────
  pollCharacterTask: (charId: string, taskId: string) => {
    if (!taskId) return
    get().updateCharacter(charId, { taskId, generating: true })
    watchTask(taskId, 1500, {
      done: (status) => {
        const { assetId, url } = taskResult(status)
        const current = get().characters.find((c) => c.id === charId)
        get().updateCharacter(charId, {
          generating: false,
          imageAssetId: assetId,
          imageUrl: url,
          imageHistory: withHistory(current?.imageHistory, { url, assetId, prompt: current?.visualPrompt, model: get().imageModel.name }),
          taskId,
        })
        get().saveCurrentProject()
      },
      fail: (error) => {
        get().updateCharacter(charId, { generating: false })
        notifyFailure(`el retrato de ${get().characters.find((c) => c.id === charId)?.name || 'personaje'}`, error)
      },
    })
  },

  pollScenarioTask: (scenarioId: string, taskId: string) => {
    if (!taskId) return
    get().updateScenario(scenarioId, { taskId, generating: true })
    watchTask(taskId, 1500, {
      done: (status) => {
        const { assetId, url } = taskResult(status)
        const current = get().scenarios.find((s) => s.id === scenarioId)
        get().updateScenario(scenarioId, {
          generating: false,
          imageAssetId: assetId,
          imageUrl: url,
          imageHistory: withHistory(current?.imageHistory, { url, assetId, prompt: current?.visualPrompt, model: get().imageModel.name }),
          taskId,
        })
        get().saveCurrentProject()
      },
      fail: (error) => {
        get().updateScenario(scenarioId, { generating: false })
        notifyFailure(`la locación ${get().scenarios.find((s) => s.id === scenarioId)?.name || ''}`.trim(), error)
      },
    })
  },

  pollPropTask: (propId: string, taskId: string) => {
    if (!taskId) return
    get().updateProp(propId, { taskId, generating: true })
    watchTask(taskId, 1500, {
      done: (status) => {
        const { assetId, url } = taskResult(status)
        const current = get().props.find((p) => p.id === propId)
        get().updateProp(propId, {
          generating: false,
          imageAssetId: assetId,
          imageUrl: url,
          imageHistory: withHistory(current?.imageHistory, { url, assetId, prompt: current?.visualPrompt, model: get().imageModel.name }),
          taskId,
        })
        get().saveCurrentProject()
      },
      fail: (error) => {
        get().updateProp(propId, { generating: false })
        notifyFailure(`el objeto ${get().props.find((p) => p.id === propId)?.name || ''}`.trim(), error)
      },
    })
  },

  pollKeyframeTask: (shotId: string, taskId: string) => {
    if (!taskId) return
    get().updateShot(shotId, { keyframeTaskId: taskId, keyframeGenerating: true })
    watchTask(taskId, 1500, {
      done: (status) => {
        const { assetId, url } = taskResult(status)
        const current = get().shots.find((s) => s.id === shotId)
        get().updateShot(shotId, {
          keyframeGenerating: false,
          keyframeAssetId: assetId,
          keyframeUrl: url,
          keyframeHistory: withHistory(current?.keyframeHistory, {
            url,
            assetId,
            prompt: current?.keyframePrompt || current?.actionPrompt,
            model: get().imageModel.name,
          }),
          keyframeTaskId: taskId,
        })
        get().saveCurrentProject()
      },
      fail: (error) => {
        get().updateShot(shotId, { keyframeGenerating: false })
        notifyFailure(`el frame de la toma ${get().shots.find((s) => s.id === shotId)?.order ?? ''}`.trim(), error)
      },
    })
  },

  pollVideoTask: (shotId: string, taskId: string) => {
    if (!taskId) return
    get().updateShot(shotId, { videoTaskId: taskId, videoStatus: 'generating' })
    watchTask(taskId, 2000, {
      done: async (status) => {
        const { assetId, url, localPath } = await taskResultWithPath(status)
        const current = get().shots.find((s) => s.id === shotId)
        get().updateShot(shotId, {
          videoStatus: 'completed',
          videoProgress: 100,
          videoAssetId: assetId,
          videoUrl: url,
          videoLocalPath: localPath,
          videoHistory: withHistory(current?.videoHistory, {
            url,
            localPath,
            assetId,
            prompt: current?.actionPrompt,
            model: get().videoModel.name,
            duration: current?.estimatedDuration || 5,
            inputMode: current?.videoInputMode || 'ff',
          }),
          videoTaskId: taskId,
        })
        get().saveCurrentProject()
      },
      fail: (error) => {
        get().updateShot(shotId, { videoStatus: 'failed' })
        notifyFailure(`el video de la toma ${get().shots.find((s) => s.id === shotId)?.order ?? ''}`.trim(), error)
      },
      progress: (status) => {
        const progress = typeof status?.progress === 'number' && status.progress > 0 ? status.progress : undefined
        const shot = get().shots.find((s) => s.id === shotId)
        if (shot && (shot.videoStatus !== 'generating' || (progress && progress !== shot.videoProgress))) {
          get().updateShot(shotId, { videoStatus: 'generating', videoProgress: progress ?? shot.videoProgress })
        }
      },
    })
  },

  restoreCharacterImage: (charId: string, historyItemId: string) => {
    const char = get().characters.find((c) => c.id === charId)
    const item = char?.imageHistory?.find((h) => h.id === historyItemId)
    if (item) {
      get().updateCharacter(charId, {
        imageUrl: item.url,
        imageAssetId: item.assetId,
      })
      get().saveCurrentProject()
    }
  },

  restoreScenarioImage: (scnId: string, historyItemId: string) => {
    const scn = get().scenarios.find((s) => s.id === scnId)
    const item = scn?.imageHistory?.find((h) => h.id === historyItemId)
    if (item) {
      get().updateScenario(scnId, {
        imageUrl: item.url,
        imageAssetId: item.assetId,
      })
      get().saveCurrentProject()
    }
  },

  restorePropImage: (propId: string, historyItemId: string) => {
    const prop = get().props.find((p) => p.id === propId)
    const item = prop?.imageHistory?.find((h) => h.id === historyItemId)
    if (item) {
      get().updateProp(propId, {
        imageUrl: item.url,
        imageAssetId: item.assetId,
      })
      get().saveCurrentProject()
    }
  },

  restoreShotKeyframe: (shotId: string, historyItemId: string) => {
    const shot = get().shots.find((s) => s.id === shotId)
    const item = shot?.keyframeHistory?.find((h) => h.id === historyItemId)
    if (item && shot) {
      get().updateShot(shotId, {
        keyframeUrl: item.url,
        keyframeAssetId: item.assetId,
        keyframePrompt: item.prompt || shot.keyframePrompt,
      })
      get().saveCurrentProject()
    }
  },

  restoreShotVideo: (shotId: string, historyItemId: string) => {
    const shot = get().shots.find((s) => s.id === shotId)
    const item = shot?.videoHistory?.find((h) => h.id === historyItemId)
    if (item) {
      get().updateShot(shotId, {
        videoUrl: item.url,
        videoLocalPath: item.localPath,
        videoAssetId: item.assetId,
        videoStatus: 'completed',
      })
      get().saveCurrentProject()
    }
  },

  updateShotVideoInputMode: (shotId: string, mode: 'ff' | 'fflf' | 'ref' | 't2v') => {
    get().updateShot(shotId, { videoInputMode: mode })
    get().saveCurrentProject()
  },

  pollAudioTask: (shotId: string, taskId: string) => {
    if (!taskId) return
    get().updateShot(shotId, { audioTaskId: taskId, audioStatus: 'generating' })
    watchTask(taskId, 2000, {
      done: async (status) => {
        const { assetId, url, localPath } = await taskResultWithPath(status)
        get().updateShot(shotId, {
          audioStatus: 'completed',
          audioAssetId: assetId,
          audioUrl: url,
          audioLocalPath: localPath,
          audioTaskId: taskId,
        })
        get().saveCurrentProject()
      },
      fail: (error) => {
        get().updateShot(shotId, { audioStatus: 'failed' })
        notifyFailure(`el audio de la toma ${get().shots.find((s) => s.id === shotId)?.order ?? ''}`.trim(), error)
      },
    })
  },

  trackImageTask: (kind, id, taskId) => {
    if (kind === 'character') get().pollCharacterTask(id, taskId)
    else if (kind === 'scenario') get().pollScenarioTask(id, taskId)
    else if (kind === 'prop') get().pollPropTask(id, taskId)
    else get().pollKeyframeTask(id, taskId)
    get().saveCurrentProject()
  },

  syncPendingTasks: async () => {
    const state = get()

    // Resume whatever was in flight when the project was saved; clear flags whose
    // task never got an id (the app closed mid-dispatch) so nothing spins forever.
    for (const char of state.characters) {
      if (!char.generating || inFlight.has(char.id)) continue
      if (char.taskId) get().pollCharacterTask(char.id, char.taskId)
      else get().updateCharacter(char.id, { generating: false })
    }
    for (const scn of state.scenarios) {
      if (!scn.generating || inFlight.has(scn.id)) continue
      if (scn.taskId) get().pollScenarioTask(scn.id, scn.taskId)
      else get().updateScenario(scn.id, { generating: false })
    }
    for (const prop of state.props) {
      if (!prop.generating || inFlight.has(prop.id)) continue
      if (prop.taskId) get().pollPropTask(prop.id, prop.taskId)
      else get().updateProp(prop.id, { generating: false })
    }
    for (const shot of state.shots) {
      if (shot.keyframeGenerating && !inFlight.has(`kf:${shot.id}`)) {
        if (shot.keyframeTaskId) get().pollKeyframeTask(shot.id, shot.keyframeTaskId)
        else get().updateShot(shot.id, { keyframeGenerating: false })
      }
      if ((shot.videoStatus === 'generating' || shot.videoStatus === 'queued') && !inFlight.has(`vid:${shot.id}`)) {
        if (shot.videoTaskId) get().pollVideoTask(shot.id, shot.videoTaskId)
        else get().updateShot(shot.id, { videoStatus: shot.videoUrl || shot.videoLocalPath ? 'completed' : 'idle' })
      }
      if (shot.audioStatus === 'generating' && !inFlight.has(`aud:${shot.id}`)) {
        if (shot.audioTaskId) get().pollAudioTask(shot.id, shot.audioTaskId)
        else get().updateShot(shot.id, { audioStatus: shot.audioUrl || shot.audioLocalPath ? 'completed' : 'idle' })
      }
    }
  },

  // ─── Media Generation (Stage 2: Characters, Scenarios, Props) ──────
  generateCharacterImage: async (charId: string) => {
    const state = get()
    const char = state.characters.find((c) => c.id === charId)
    if (!char || char.generating) return

    get().updateCharacter(charId, { generating: true, taskId: undefined })

    try {
      const api = (window as any).electronAPI
      const styleSuffix = state.visualStyle && state.visualStyle.trim()
        ? `, ${state.visualStyle.trim()} style, 8k resolution, highly detailed`
        : ''
      const basePose = 'professional reference pose sheet 3 views + 1'
      let charPrompt = (char.visualPrompt || `${char.name}, ${char.role}`).trim()
      if (!charPrompt.toLowerCase().includes('professional reference pose sheet')) {
        charPrompt = `${basePose}, ${charPrompt}`
      }
      const prompt = `${charPrompt}${styleSuffix}`
      const task = await dispatchTracked(charId, () =>
        dispatchImage(api, state.imageModel, (model) => buildImagePayload(model, prompt, {
          aspectRatio: '1:1',
          resolution: state.imageResolution,
        })),
      )
      const taskId = typeof task === 'string' ? task : (task?.taskId || task?.id)

      if (taskId) {
        get().updateCharacter(charId, { taskId, generating: true })
        await get().saveCurrentProject()
        get().pollCharacterTask(charId, taskId)
      } else {
        get().updateCharacter(charId, { generating: false })
        notifyFailure(`el retrato de ${char.name}`, 'El proveedor no devolvió una tarea')
      }
    } catch (err) {
      console.error('[DramaStore] Character image gen failed:', err)
      get().updateCharacter(charId, { generating: false })
      notifyFailure(`el retrato de ${char.name}`, (err as any)?.message)
    }
  },

  generateAllCharacterImages: async (onlyMissing = false) => {
    const chars = get().characters.filter((c) => !onlyMissing || !c.imageUrl)
    for (const char of chars) {
      await get().generateCharacterImage(char.id)
    }
  },

  regenerateCharacterVisualPrompt: async (characterId: string) => {
    const state = get()
    const char = state.characters.find((c) => c.id === characterId)
    if (!char) return

    const api = (window as any).electronAPI
    if (!api?.openfield?.agentChat) {
      throw new Error('El servicio de IA no está disponible.')
    }

    const modelId = state.llmModel.modelId || state.llmModel.name
    const sysPrompt = `You are an expert AI visual prompt engineer specializing in character consistency portraits for film and short drama production.
Generate a concise, highly detailed photographic character turnaround prompt in English for text-to-image models.
CRITICAL REQUIREMENT: The prompt MUST start with the exact phrase "professional reference pose sheet 3 views + 1".
Include: 3 views turnaround (front view, side profile view, 3/4 view), distinctive facial features, hair style and color, skin texture, approximate age, expression, iconic clothing/costume, dramatic studio lighting, cinematic realism, strictly matching the visual style: "${state.visualStyle || 'Cinematic photorealistic, 8k'}".
Output ONLY the English prompt text directly, without markdown, quotes, or commentary.`

    const userContent = `Character Name: ${char.name}
Role in Story: ${char.role}
Story Title: ${state.title}
Story Logline / Idea: ${state.ideaPrompt || state.logline}
Genre: ${state.genre}
Tone: ${state.tone}
Visual Style (MANDATORY TO EMBED): ${state.visualStyle || 'Cinematic photorealistic, 8k'}`

    const res = await api.openfield.agentChat({
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userContent },
      ],
      model: modelId,
      provider: state.llmModel.provider || 'kie',
      stream: false,
    })

    const text = (res?.content || res?.message?.content || '').trim().replace(/^["']|["']$/g, '')
    if (text) {
      get().updateCharacter(characterId, { visualPrompt: text })
      await get().saveCurrentProject()
    }
  },

  regenerateAllCharacterVisualPrompts: async () => {
    const chars = get().characters
    for (const c of chars) {
      await get().regenerateCharacterVisualPrompt(c.id)
    }
  },

  generateScenarioImage: async (scenarioId: string) => {
    const state = get()
    const scn = state.scenarios.find((s) => s.id === scenarioId)
    if (!scn || scn.generating) return

    get().updateScenario(scenarioId, { generating: true, taskId: undefined })

    try {
      const api = (window as any).electronAPI
      const styleSuffix = state.visualStyle && state.visualStyle.trim()
        ? `, ${state.visualStyle.trim()} style, 8k resolution, highly detailed`
        : ''
      let scnPrompt = (scn.visualPrompt || scn.name).trim()
      if (!scnPrompt.toLowerCase().includes('no people') && !scnPrompt.toLowerCase().includes('empty environment')) {
        scnPrompt = `${scnPrompt}, empty environment, completely unpopulated, no people, no humans`
      }
      const prompt = `${scnPrompt}${styleSuffix}`
      const task = await dispatchTracked(scenarioId, () =>
        dispatchImage(api, state.imageModel, (model) => buildImagePayload(model, prompt, {
          aspectRatio: state.aspectRatio,
          resolution: state.imageResolution,
        })),
      )
      const taskId = typeof task === 'string' ? task : (task?.taskId || task?.id)

      if (taskId) {
        get().updateScenario(scenarioId, { taskId, generating: true })
        await get().saveCurrentProject()
        get().pollScenarioTask(scenarioId, taskId)
      } else {
        get().updateScenario(scenarioId, { generating: false })
        notifyFailure(`la locación ${scn.name}`, 'El proveedor no devolvió una tarea')
      }
    } catch (err) {
      console.error('[DramaStore] Scenario image gen failed:', err)
      get().updateScenario(scenarioId, { generating: false })
      notifyFailure(`la locación ${scn.name}`, (err as any)?.message)
    }
  },

  generateAllScenarioImages: async (onlyMissing = false) => {
    const scns = get().scenarios.filter((scn) => !onlyMissing || !scn.imageUrl)
    for (const scn of scns) {
      await get().generateScenarioImage(scn.id)
    }
  },

  regenerateScenarioVisualPrompt: async (scenarioId: string) => {
    const state = get()
    const scn = state.scenarios.find((s) => s.id === scenarioId)
    if (!scn) return

    const api = (window as any).electronAPI
    if (!api?.openfield?.agentChat) {
      throw new Error('El servicio de IA no está disponible.')
    }

    const modelId = state.llmModel.modelId || state.llmModel.name
    const sysPrompt = `You are an expert cinematic production designer and AI prompt engineer for film locations and set environments.
Generate a concise, highly detailed cinematic environment prompt in English.
CRITICAL REQUIREMENT: The environment MUST BE COMPLETELY EMPTY. NO humans, NO people, NO crowds, NO pedestrians, NO silhouettes.
Include: architecture, spatial depth, atmospheric lighting, mood, color palette, weather/time of day, environmental textures, ending with "empty environment, completely unpopulated, no people, no humans", strictly matching the visual style: "${state.visualStyle || 'Cinematic photorealistic, 8k'}".
Output ONLY the English prompt text directly, without markdown, quotes, or commentary.`

    const userContent = `Location / Set Name: ${scn.name}
Story Title: ${state.title}
Story Logline / Idea: ${state.ideaPrompt || state.logline}
Genre: ${state.genre}
Tone: ${state.tone}
Visual Style (MANDATORY TO EMBED): ${state.visualStyle || 'Cinematic photorealistic, 8k'}`

    const res = await api.openfield.agentChat({
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userContent },
      ],
      model: modelId,
      provider: state.llmModel.provider || 'kie',
      stream: false,
    })

    const text = (res?.content || res?.message?.content || '').trim().replace(/^["']|["']$/g, '')
    if (text) {
      get().updateScenario(scenarioId, { visualPrompt: text })
      await get().saveCurrentProject()
    }
  },

  regenerateAllScenarioVisualPrompts: async () => {
    const scns = get().scenarios
    for (const s of scns) {
      await get().regenerateScenarioVisualPrompt(s.id)
    }
  },

  generateAllPropImages: async (onlyMissing = false) => {
    const props = get().props.filter((pr) => !onlyMissing || !pr.imageUrl)
    for (const pr of props) {
      await get().generatePropImage(pr.id)
    }
  },

  generatePropImage: async (propId: string) => {
    const state = get()
    const pr = state.props.find((p) => p.id === propId)
    if (!pr || pr.generating) return

    get().updateProp(propId, { generating: true, taskId: undefined })

    try {
      const api = (window as any).electronAPI
      const styleSuffix = state.visualStyle && state.visualStyle.trim()
        ? `, ${state.visualStyle.trim()} style, macro product photography, 8k resolution, highly detailed`
        : ''
      let propPrompt = (pr.visualPrompt || `${pr.name}, ${pr.description}`).trim()
      if (!propPrompt.toLowerCase().includes('studio background') && !propPrompt.toLowerCase().includes('isolated')) {
        propPrompt = `${propPrompt}, isolated product shot on clean plain neutral grey studio background, studio lighting, centered, macro photography, no humans, no hands, no people`
      }
      const prompt = `${propPrompt}${styleSuffix}`
      const task = await dispatchTracked(propId, () =>
        dispatchImage(api, state.imageModel, (model) => buildImagePayload(model, prompt, {
          aspectRatio: '1:1',
          resolution: state.imageResolution,
        })),
      )
      const taskId = typeof task === 'string' ? task : (task?.taskId || task?.id)

      if (taskId) {
        get().updateProp(propId, { taskId, generating: true })
        await get().saveCurrentProject()
        get().pollPropTask(propId, taskId)
      } else {
        get().updateProp(propId, { generating: false })
        notifyFailure(`el objeto ${pr.name}`, 'El proveedor no devolvió una tarea')
      }
    } catch (err) {
      console.error('[DramaStore] Prop image gen failed:', err)
      get().updateProp(propId, { generating: false })
      notifyFailure(`el objeto ${pr.name}`, (err as any)?.message)
    }
  },

  regeneratePropVisualPrompt: async (propId: string) => {
    const state = get()
    const prop = state.props.find((p) => p.id === propId)
    if (!prop) return

    const api = (window as any).electronAPI
    if (!api?.openfield?.agentChat) {
      throw new Error('El servicio de IA no está disponible.')
    }

    const modelId = state.llmModel.modelId || state.llmModel.name
    const sysPrompt = `You are an expert cinematic prop master and AI visual prompt engineer for film props and key objects.
Generate a concise, highly detailed macro product / prop photography prompt in English.
CRITICAL REQUIREMENT: The item MUST BE ISOLATED ON A CLEAN PLAIN WHITE OR NEUTRAL GREY STUDIO BACKGROUND. NO humans, NO hands holding it, NO people.
Include: material textures, craftsmanship, markings, centered studio lighting, sharp macro focus, clean plain neutral grey studio background, centered, no humans, no hands, no people, strictly matching the visual style: "${state.visualStyle || 'Cinematic photorealistic, 8k'}".
Output ONLY the English prompt text directly, without markdown, quotes, or commentary.`

    const userContent = `Prop / Key Object Name: ${prop.name}
Prop Description / Significance: ${prop.description}
Story Title: ${state.title}
Story Logline / Idea: ${state.ideaPrompt || state.logline}
Genre: ${state.genre}
Visual Style (MANDATORY TO EMBED): ${state.visualStyle || 'Cinematic photorealistic, 8k'}`

    const res = await api.openfield.agentChat({
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userContent },
      ],
      model: modelId,
      provider: state.llmModel.provider || 'kie',
      stream: false,
    })

    const text = (res?.content || res?.message?.content || '').trim().replace(/^["']|["']$/g, '')
    if (text) {
      get().updateProp(propId, { visualPrompt: text })
      await get().saveCurrentProject()
    }
  },

  regenerateAllPropVisualPrompts: async () => {
    const props = get().props
    for (const p of props) {
      await get().regeneratePropVisualPrompt(p.id)
    }
  },

  regenerateAllStage2Prompts: async () => {
    await get().regenerateAllCharacterVisualPrompts()
    await get().regenerateAllScenarioVisualPrompts()
    await get().regenerateAllPropVisualPrompts()
  },

  // ─── Keyframe Generation (Stage 3) ────────────────────────────────
  generateShotKeyframe: async (
    shotId: string,
    customParams?: {
      prompt?: string
      model?: ModelPricing
      resolution?: string
      aspectRatio?: string
      imageBase64?: string
      imageUrl?: string
      imageRefs?: any[]
    }
  ) => {
    const state = get()
    const shot = state.shots.find((s) => s.id === shotId)
    if (!shot || shot.keyframeGenerating) return

    get().updateShot(shotId, { keyframeGenerating: true, keyframeTaskId: undefined })

    try {
      const api = (window as any).electronAPI
      const targetModel = customParams?.model || state.imageModel

      let imageRefs: Array<{
        assetId?: string
        imageUrl?: string
        base64?: string
        mime?: string
        name?: string
        refType?: string
      }> = []

      // Everyone who speaks on screen travels as a reference, speakers first in speaking order
      const { charsInShot, speakers } = shotCast(state, shot)
      const scnInShot = state.scenarios.find((s) => s.name === shot.scenarioName)
      const propsInShot = state.props.filter((p) => (shot.propNames || []).includes(p.name))

      // If customParams.imageRefs is explicitly passed (even if empty []), respect it directly
      if (customParams && 'imageRefs' in customParams) {
        imageRefs = customParams.imageRefs ? [...customParams.imageRefs] : []
      } else {
        // Characters first (speakers first)
        for (const char of charsInShot) {
          if (char.imageAssetId || char.imageUrl) {
            imageRefs.push({
              assetId: char.imageAssetId,
              imageUrl: char.imageUrl,
              name: char.name,
              refType: 'character',
            })
          }
        }

        // Scenario next
        if (scnInShot && (scnInShot.imageAssetId || scnInShot.imageUrl)) {
          imageRefs.push({
            assetId: scnInShot.imageAssetId,
            imageUrl: scnInShot.imageUrl,
            name: scnInShot.name,
            refType: 'scenario',
          })
        }

        // Props next
        for (const pr of propsInShot) {
          if (pr.imageAssetId || pr.imageUrl) {
            imageRefs.push({
              assetId: pr.imageAssetId,
              imageUrl: pr.imageUrl,
              name: pr.name,
              refType: 'prop',
            })
          }
        }
      }

      // If we have assetIds and electronAPI.assets.readBase64 is available, hydrate base64
      const assetIdsToRead = imageRefs.filter((r) => r.assetId && !r.base64).map((r) => r.assetId!)
      if (assetIdsToRead.length > 0 && api?.assets?.readBase64) {
        try {
          const b64List = await api.assets.readBase64(assetIdsToRead)
          if (Array.isArray(b64List)) {
            const b64Map = new Map(b64List.map((x: any) => [x.id, x]))
            imageRefs = imageRefs.map((r) => {
              if (r.assetId && b64Map.has(r.assetId)) {
                const found = b64Map.get(r.assetId)!
                return { ...r, base64: found.base64, mime: found.mime || 'image/png' }
              }
              return r
            })
          }
        } catch (b64Err) {
          console.warn('[DramaStore] Failed reading base64 for imageRefs:', b64Err)
        }
      }

      // 3. Prompt: an explicit prompt goes as is; otherwise the Landking structure binds each attached image to its element
      let fullPrompt = customParams?.prompt
      if (!fullPrompt) {
        const promptRefs = imageRefs.map(toPromptRef)
        const frameText = (shot.keyframePrompt || '').trim() || [
          (shot.actionPrompt || 'Cinematic opening shot').trim(),
          propsInShot.length ? `Key objects in frame: ${propsInShot.map((p) => `<${p.name}>`).join(', ')}.` : '',
        ].filter(Boolean).join(' ')
        fullPrompt = buildKeyframePrompt({
          model: targetModel,
          refs: promptRefs,
          camera: shot.keyframePrompt?.trim() ? undefined : shot.cameraMovement,
          frame: frameText,
          characters: charsInShot.map((c) => promptCharacter(c, promptRefs)),
          speakers,
          location: scnInShot && {
            name: scnInShot.name,
            visualPrompt: scnInShot.visualPrompt,
            hasRef: promptRefs.some((r) => r.role === 'scenario' && r.name === scnInShot.name),
          },
          visualStyle: state.visualStyle,
        })
      }

      const task = await dispatchTracked(`kf:${shotId}`, () =>
        dispatchImage(api, targetModel, (model) => buildImagePayload(model, fullPrompt, {
          aspectRatio: customParams?.aspectRatio || state.aspectRatio,
          resolution: customParams?.resolution || state.imageResolution,
          imageRefs: imageRefs.length > 0 ? imageRefs : undefined,
          imageRefAssetId: imageRefs[0]?.assetId,
          imageBase64: customParams?.imageBase64 || imageRefs[0]?.base64,
          imageUrl: customParams?.imageUrl || imageRefs[0]?.imageUrl,
        })),
      )
      const taskId = typeof task === 'string' ? task : (task?.taskId || task?.id)

      if (taskId) {
        get().updateShot(shotId, { keyframeTaskId: taskId, keyframeGenerating: true })
        await get().saveCurrentProject()
        get().pollKeyframeTask(shotId, taskId)
      } else {
        get().updateShot(shotId, { keyframeGenerating: false })
        notifyFailure(`el frame de la toma ${shot.order}`, 'El proveedor no devolvió una tarea')
      }
    } catch (err) {
      console.error('[DramaStore] Keyframe gen failed:', err)
      get().updateShot(shotId, { keyframeGenerating: false })
      notifyFailure(`el frame de la toma ${shot.order}`, (err as any)?.message)
    }
  },

  generateAllKeyframes: async (onlyMissing = false) => {
    const shots = get().shots.filter((sh) => !onlyMissing || !sh.keyframeUrl)
    for (const shot of shots) {
      await get().generateShotKeyframe(shot.id)
    }
  },

  regenerateShotKeyframePrompt: async (shotId: string) => {
    const state = get()
    const shot = state.shots.find((s) => s.id === shotId)
    if (!shot) return

    const api = (window as any).electronAPI
    if (!api?.openfield?.agentChat) {
      throw new Error('El servicio de IA no está disponible.')
    }

    const modelId = state.llmModel.modelId || state.llmModel.name
    const charsInShot = state.characters.filter((c) => (shot.characterNames || []).includes(c.name))
    const scnInShot = state.scenarios.find((s) => s.name === shot.scenarioName)
    const propsInShot = state.props.filter((p) => (shot.propNames || []).includes(p.name))

    const sysPrompt = `You are a world-class Hollywood cinematographer and AI visual prompt engineer for Image-to-Video models.
Generate a concise, highly detailed cinematic image prompt in English for the EXACT FIRST FRAME (Frame 0 / opening moment) of this shot.

CRITICAL RULES:
1. Focus strictly on what is visible at the very opening moment (Frame 0).
2. If the scene describes an action where a character starts alone before another character enters, describe ONLY that initial character and starting composition. Do NOT include characters who enter later in the scene.
3. Include camera angle/framing, lighting, character pose/expression at frame 0, environmental details, strictly incorporating the visual style: "${state.visualStyle || 'Cinematic, 8k, photorealistic'}".
4. Name every character, location and object with its tag exactly as given (e.g. <Ana>, <Cafetería>): their reference images are attached and bound to those tags, so describe position, pose, expression and action, not their faces.
5. Whoever speaks in this shot has a natural, closed-mouth expression, about to speak. When two or more people talk, place each one clearly in frame (left/right, foreground/background).
6. Output ONLY the English prompt text directly, without quotes, markdown, section headers or commentary.`

    const userContent = `Scene Action: ${shot.actionPrompt}
Camera Movement: ${shot.cameraMovement}
Dialogue / Locution: ${shot.dialogueText ? `${shot.dialogueSpeaker}: "${stripAudioTags(shot.dialogueText)}"` : 'None'}
Environment: ${scnInShot ? `${scnInShot.name} - ${scnInShot.visualPrompt}` : shot.scenarioName || 'Cinematic environment'}
Characters involved in scene: ${charsInShot.map((c) => `<${c.name}> (${c.visualPrompt || ''})`).join(', ') || 'None'}
Location tag: ${scnInShot ? `<${scnInShot.name}>` : 'None'}
Objects: ${propsInShot.map((p) => `<${p.name}>`).join(', ') || 'None'}
Visual Style (MANDATORY TO EMBED): ${state.visualStyle || 'Cinematic, 8k, photorealistic'}`

    const res = await api.openfield.agentChat({
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userContent },
      ],
      model: modelId,
      provider: state.llmModel.provider || 'kie',
      stream: false,
    })

    const text = (res?.content || res?.message?.content || '').trim().replace(/^["']|["']$/g, '')
    if (text) {
      get().updateShot(shotId, { keyframePrompt: text })
      await get().saveCurrentProject()
    }
  },

  regenerateAllKeyframePrompts: async () => {
    const shots = get().shots
    for (const shot of shots) {
      await get().regenerateShotKeyframePrompt(shot.id)
    }
  },

  // ─── Voice Generation (Generated in Storyboard / Stage 4 for LipSync) ─
  generateShotVoice: async (shotId: string, customDialogueText?: string) => {
    const state = get()
    const shot = state.shots.find((s) => s.id === shotId)
    const effectiveDialogue = (customDialogueText !== undefined ? customDialogueText : shot?.dialogueText) || ''
    if (!shot || !effectiveDialogue.trim() || shot.audioStatus === 'generating') return
    // With video-model voices the clip speaks for itself: no TTS track
    if (state.voiceSource === 'video') {
      if (customDialogueText !== undefined) get().updateShot(shotId, { dialogueText: customDialogueText })
      return
    }

    if (customDialogueText !== undefined && customDialogueText !== shot.dialogueText) {
      get().updateShot(shotId, { dialogueText: customDialogueText, audioStatus: 'generating', audioTaskId: undefined })
    } else {
      get().updateShot(shotId, { audioStatus: 'generating', audioTaskId: undefined })
    }

    inFlight.add(`aud:${shotId}`)
    try {
      const api = (window as any).electronAPI
      const speakerRaw = (shot.dialogueSpeaker || '').trim()
      const isNarratorSpeaker = isNarratorName(speakerRaw)

      const speakerChar = !isNarratorSpeaker
        ? state.characters.find(
            (c) => c.name.toLowerCase().trim() === speakerRaw.toLowerCase()
          )
        : undefined
      const narratorVoiceId = state.narratorVoiceId || DEFAULT_NARRATOR_VOICE_ID
      const characterVoiceId = speakerChar?.voiceId || state.voiceId || DEFAULT_CHARACTER_VOICE_ID
      const defaultVoiceId = isNarratorSpeaker ? narratorVoiceId : characterVoiceId

      // Parse dialogue turns (detects multiple speakers if present); narrator turns take the narrator voice
      const parsedTurns = parseDialogueTurns(
        effectiveDialogue,
        shot.dialogueSpeaker,
        state.characters,
        characterVoiceId,
        narratorVoiceId
      )

      const hasElevenVoice =
        state.characters.some((c) => c.voiceId && c.voiceId.length > 15) ||
        narratorVoiceId.length > 15 ||
        defaultVoiceId.length > 15
      const isElevenLabs =
        state.voiceModel.provider === 'elevenlabs' ||
        (api?.elevenlabs?.generate && hasElevenVoice)

      if (isElevenLabs) {
        try {
          const modelId = state.voiceModel.t2aId || state.voiceModel.name || 'eleven_v4'
          // Voices from other providers can't be used here: fall back to the default narrator / character voice
          const turnVoice = (t?: ParsedDialogueTurn) =>
            (t?.isNarrator ?? isNarratorSpeaker)
              ? elevenVoiceOr(t?.voiceId || narratorVoiceId, DEFAULT_NARRATOR_VOICE_ID)
              : elevenVoiceOr(t?.voiceId || characterVoiceId, DEFAULT_CHARACTER_VOICE_ID)
          let asset: any

          // If there are 2 or more dialogue turns with assigned voice IDs, use native text-to-dialogue
          if (parsedTurns.length >= 2 && api?.elevenlabs?.generateDialogue) {
            // Eleven v4 and v3 do multi-speaker dialogue natively and read [audio tags]
            const dialogueModel = modelId.startsWith('eleven_') ? modelId : 'eleven_v4'
            const inputsFor = (model: string) => parsedTurns.map((t) => ({
              text: prepareTtsLine(t.text, supportsAudioTags(model)),
              voiceId: turnVoice(t),
            }))
            try {
              asset = await api.elevenlabs.generateDialogue({ inputs: inputsFor(dialogueModel), model: dialogueModel })
            } catch (dialogueErr) {
              // Text-to-dialogue may not accept every TTS model: retry with v3
              if (dialogueModel === 'eleven_v3') throw dialogueErr
              console.warn(`[DramaStore] Dialogue failed with ${dialogueModel}, retrying with eleven_v3:`, dialogueErr)
              asset = await api.elevenlabs.generateDialogue({ inputs: inputsFor('eleven_v3'), model: 'eleven_v3' })
            }
          } else if (api?.elevenlabs?.generate) {
            const singleVoiceId = turnVoice(parsedTurns[0])
            const singleModel = modelId.startsWith('eleven_') ? modelId : 'eleven_v4'
            const tags = supportsAudioTags(singleModel)
            // For single-voice generation, combine all spoken turns without character prefix headers
            const singlePrompt = parsedTurns.length > 0
              ? parsedTurns.map((t) => prepareTtsLine(t.text, tags)).filter(Boolean).join(' ')
              : cleanTextForTts(effectiveDialogue, tags)

            asset = await api.elevenlabs.generate({
              voiceId: singleVoiceId,
              prompt: singlePrompt,
              model: singleModel,
            })
          }

          if (asset) {
            const localPath = asset.localPath || asset.local_path || asset.filePath
            const audioUrl = localPath ? `file://${localPath}` : (asset.url || asset.path)
            get().updateShot(shotId, {
              audioStatus: 'completed',
              audioAssetId: asset.id,
              audioUrl,
              audioLocalPath: localPath,
              audioTaskId: undefined,
            })
            await get().saveCurrentProject()
            return
          }
        } catch (elErr: any) {
          console.warn('[DramaStore] ElevenLabs generation error, attempting KIE fallback:', elErr)
        }
      }

      // KIE / Generic Openfield TTS flow
      const cleanPrompt = parsedTurns.length > 0
        ? parsedTurns.map((t) => stripAudioTags(t.text)).filter(Boolean).join(' ')
        : cleanTextForTts(effectiveDialogue)

      const payload = buildAudioPayload(state.voiceModel, cleanPrompt, { voiceId: defaultVoiceId })
      const task = await dispatchGeneration(api, 'audio', payload)
      const taskId = typeof task === 'string' ? task : (task?.taskId || task?.id)

      if (taskId) {
        get().updateShot(shotId, { audioTaskId: taskId, audioStatus: 'generating' })
        await get().saveCurrentProject()
        get().pollAudioTask(shotId, taskId)
      } else {
        get().updateShot(shotId, { audioStatus: 'failed' })
        notifyFailure(`el audio de la toma ${shot.order}`, 'El proveedor no devolvió una tarea')
      }
    } catch (err) {
      console.error('[DramaStore] Audio gen failed:', err)
      get().updateShot(shotId, { audioStatus: 'failed' })
      notifyFailure(`el audio de la toma ${shot.order}`, (err as any)?.message)
    } finally {
      inFlight.delete(`aud:${shotId}`)
    }
  },

  generateAllVoices: async (onlyMissing = false) => {
    if (get().voiceSource === 'video') return
    const shots = get().shots
    for (const shot of shots) {
      if (onlyMissing && shot.audioStatus === 'completed' && (shot.audioUrl || shot.audioLocalPath)) continue
      if (shot.dialogueText && shot.dialogueText.trim()) {
        await get().generateShotVoice(shot.id)
      }
    }
  },

  // ─── Video Generation (Stage 4: Audio-Driven / LipSync Video) ───────
  generateShotVideo: async (shotId: string, customParams?: {
    prompt?: string
    duration?: number
    model?: ModelPricing
    resolution?: string
    firstFrameBase64?: string
    firstFrameUrl?: string
    firstFrameAssetId?: string
    lastFrameBase64?: string
    lastFrameUrl?: string
    lastFrameAssetId?: string
    imageRefs?: any[]
    videoRefs?: any[]
    cameraMovement?: string
    cameraLens?: string
    cameraShot?: string
    cameraLevel?: string
    lighting?: string
    filmLook?: string
    inputMode?: 'ff' | 'fflf' | 'ref' | 't2v'
  }) => {
    const state = get()
    const shot = state.shots.find((s) => s.id === shotId)
    if (!shot || shot.videoStatus === 'generating' || shot.videoStatus === 'queued') return

    inFlight.add(`vid:${shotId}`)
    get().updateShot(shotId, { videoStatus: 'queued', videoProgress: 10, videoTaskId: undefined })

    try {
      const api = (window as any).electronAPI
      const requestedMode = customParams?.inputMode || shot.videoInputMode || 'ff'
      const targetModel = customParams?.model || state.videoModel

      // 1. The shot's people: on-screen speakers first, in speaking order
      const { charsInShot, speakers, turns } = shotCast(state, shot)
      const propsInShot = state.props.filter((p) => (shot.propNames || []).includes(p.name))
      const scenario = state.scenarios.find((sc) => sc.name === shot.scenarioName)

      // Several voices in one shot: send everyone as a tagged reference so each line lands on the right face
      const multiVoice = speakers.length >= 2
      const inputMode =
        multiVoice && (requestedMode === 'ff' || requestedMode === 't2v') && targetModel.refId && !customParams?.imageRefs
          ? 'ref'
          : requestedMode
      const useElevenVoices = state.voiceSource === 'eleven'

      // First Frame Handling
      let firstFrameBase64 = customParams?.firstFrameBase64
      // Ingredients mode never pins a first frame: the keyframe travels as one more reference
      const usesFirstFrame = inputMode === 'ff' || inputMode === 'fflf'
      let firstFrameAssetId = customParams?.firstFrameAssetId || (usesFirstFrame ? shot.keyframeAssetId : undefined)
      let firstFrameUrl = customParams?.firstFrameUrl || (usesFirstFrame ? shot.keyframeUrl : undefined)

      if (!firstFrameBase64 && firstFrameAssetId && api?.assets?.readBase64) {
        try {
          const b64List = await api.assets.readBase64([firstFrameAssetId])
          if (Array.isArray(b64List) && b64List.length > 0 && b64List[0].base64) {
            firstFrameBase64 = b64List[0].base64
          }
        } catch (b64Err) {
          console.warn('[DramaStore] Failed reading base64 for keyframe:', b64Err)
        }
      }

      // Last Frame Handling for FF/LF mode
      let lastFrameBase64 = customParams?.lastFrameBase64
      let lastFrameAssetId = customParams?.lastFrameAssetId || (inputMode === 'fflf' ? shot.lastFrameAssetId : undefined)
      let lastFrameUrl = customParams?.lastFrameUrl || (inputMode === 'fflf' ? shot.lastFrameUrl : undefined)

      // Fallback: If in fflf mode and no last frame specified, use next shot's keyframe
      if (inputMode === 'fflf' && !lastFrameUrl && !lastFrameAssetId && !lastFrameBase64) {
        const nextShot = state.shots.find((s) => s.order === shot.order + 1)
        if (nextShot) {
          lastFrameUrl = nextShot.keyframeUrl
          lastFrameAssetId = nextShot.keyframeAssetId
        }
      }

      if (!lastFrameBase64 && lastFrameAssetId && api?.assets?.readBase64) {
        try {
          const b64List = await api.assets.readBase64([lastFrameAssetId])
          if (Array.isArray(b64List) && b64List.length > 0 && b64List[0].base64) {
            lastFrameBase64 = b64List[0].base64
          }
        } catch (b64Err) {
          console.warn('[DramaStore] Failed reading base64 for last frame:', b64Err)
        }
      }

      // Image References Handling for Reference Mode
      let imageRefs = customParams?.imageRefs || []
      if (inputMode === 'ref' && imageRefs.length === 0) {
        // Ingredients: characters (speakers first), location, props, then the shot's frame as its FIRST FRAME LOOK
        for (const char of charsInShot) {
          if (char.imageAssetId || char.imageUrl) {
            imageRefs.push({
              assetId: char.imageAssetId,
              url: char.imageUrl,
              name: char.name,
              mime: 'image/png',
              refType: 'character',
            })
          }
        }
        if (scenario && (scenario.imageAssetId || scenario.imageUrl)) {
          imageRefs.push({
            assetId: scenario.imageAssetId,
            url: scenario.imageUrl,
            name: scenario.name,
            mime: 'image/png',
            refType: 'scenario',
          })
        }
        for (const prop of propsInShot) {
          if (prop.imageAssetId || prop.imageUrl) {
            imageRefs.push({
              assetId: prop.imageAssetId,
              url: prop.imageUrl,
              name: prop.name,
              mime: 'image/png',
              refType: 'prop',
            })
          }
        }
        if (shot.keyframeAssetId || shot.keyframeUrl) {
          imageRefs.push({
            assetId: shot.keyframeAssetId,
            url: shot.keyframeUrl,
            name: `Toma ${shot.order}`,
            mime: 'image/png',
            refType: 'image',
          })
        }
        // Not every provider resolves asset ids: send the bytes along
        const ids = imageRefs.map((r: any) => r.assetId).filter(Boolean)
        if (ids.length > 0 && api?.assets?.readBase64) {
          try {
            const b64List = await api.assets.readBase64(ids)
            const byId = new Map<string, any>((b64List || []).map((r: any) => [r.id, r]))
            imageRefs = imageRefs.map((r: any) => {
              const hit = r.assetId ? byId.get(r.assetId) : undefined
              return hit?.base64 ? { ...r, base64: hit.base64, mime: hit.mime || r.mime } : r
            })
          } catch (b64Err) {
            console.warn('[DramaStore] Failed reading base64 for ingredients:', b64Err)
          }
        }
      }

      // Video References Handling (supports chained sequential video reference)
      let videoRefs = customParams?.videoRefs || []
      if (videoRefs.length === 0 && (shot.videoRefUrl || shot.videoRefAssetId || shot.videoRefLocalPath)) {
        videoRefs.push({
          url: shot.videoRefUrl,
          localPath: shot.videoRefLocalPath,
          assetId: shot.videoRefAssetId,
          name: shot.videoRefName || 'Ref Video Anterior',
          mime: 'video/mp4',
        })
      }

      // Gather audio reference from Storyboard if available
      let audioRefs: Array<{ assetId?: string; audioUrl?: string; base64?: string; mime?: string; name?: string }> = []
      if (useElevenVoices && (shot.audioAssetId || shot.audioUrl)) {
        audioRefs.push({
          assetId: shot.audioAssetId,
          audioUrl: shot.audioUrl,
          name: 'dialogue_audio',
          mime: 'audio/mpeg',
        })
      }

      if (audioRefs.length > 0 && audioRefs[0].assetId && api?.assets?.readBase64) {
        try {
          const b64List = await api.assets.readBase64([audioRefs[0].assetId])
          if (Array.isArray(b64List) && b64List.length > 0) {
            audioRefs[0].base64 = b64List[0].base64
            audioRefs[0].mime = b64List[0].mime || 'audio/mpeg'
          }
        } catch (b64Err) {
          console.warn('[DramaStore] Failed reading base64 for dialogue audio:', b64Err)
        }
      }

      // Prompt: an explicit prompt goes as is; otherwise the Landking structure binds every attached file to its element
      let prompt = customParams?.prompt
      if (!prompt) {
        const refsSent = inputMode === 'ref' ? imageRefs.map(toPromptRef) : []
        const camera = shot.videoPrompt?.trim()
          ? ''
          : [customParams?.cameraMovement || shot.cameraMovement, customParams?.cameraShot, customParams?.cameraLens, customParams?.cameraLevel]
              .filter((x) => x && x.trim())
              .join(', ')
        const castInPrompt = charsInShot.filter((c) => !isNarratorName(c.name))
        prompt = buildVideoPrompt({
          model: targetModel,
          refs: refsSent,
          videoRefCount: videoRefs.length,
          hasAudio: audioRefs.length > 0 && targetModel.supportsAudioRef !== false,
          voiceSource: state.voiceSource,
          pinnedFirstFrame: usesFirstFrame && Boolean(firstFrameAssetId || firstFrameUrl || firstFrameBase64),
          camera,
          action: shot.videoPrompt?.trim() || shot.actionPrompt || '',
          characters: castInPrompt.map((c) => promptCharacter(c, refsSent)),
          turns: turns.map((t) => ({ speaker: t.speaker, text: t.text, isNarrator: t.isNarrator })),
          location: scenario && {
            name: scenario.name,
            visualPrompt: scenario.visualPrompt,
            hasRef: refsSent.some((r) => r.role === 'scenario' && r.name === scenario.name),
          },
          visualStyle: state.visualStyle,
          lighting: customParams?.lighting,
          filmLook: customParams?.filmLook,
        })
      }

      const payload = buildVideoPayload(targetModel, prompt, {
        aspectRatio: state.aspectRatio,
        resolution: customParams?.resolution || state.videoResolution,
        duration: customParams?.duration || shot.estimatedDuration || state.videoDuration || 5,
        firstFrameAssetId: usesFirstFrame ? firstFrameAssetId : undefined,
        firstFrameBase64: usesFirstFrame ? firstFrameBase64 : undefined,
        firstFrameUrl: usesFirstFrame ? firstFrameUrl : undefined,
        lastFrameAssetId: inputMode === 'fflf' ? lastFrameAssetId : undefined,
        lastFrameBase64: inputMode === 'fflf' ? lastFrameBase64 : undefined,
        imageRefs: inputMode === 'ref' && imageRefs.length > 0 ? imageRefs : undefined,
        videoRefs: videoRefs.length > 0 ? videoRefs : undefined,
        audioAssetId: useElevenVoices ? shot.audioAssetId : undefined,
        audioUrl: useElevenVoices ? shot.audioUrl : undefined,
        audioBase64: audioRefs[0]?.base64,
        audioRefs: audioRefs.length > 0 ? audioRefs : undefined,
        // Video-model voices: the clip generates its own speech
        sound: audioRefs.length > 0 || (!useElevenVoices && turns.length > 0),
      })

      // If reference mode and imageRefs exist, ensure they're assigned to payload
      if (inputMode === 'ref' && imageRefs.length > 0) {
        payload.imageRefs = imageRefs
      }
      if (videoRefs.length > 0) {
        payload.videoRefs = videoRefs
      }

      const task = await dispatchTracked(`vid:${shotId}`, () => dispatchGeneration(api, 'video', payload))
      const taskId = typeof task === 'string' ? task : (task?.taskId || task?.id)

      if (taskId) {
        get().updateShot(shotId, {
          videoTaskId: taskId,
          videoStatus: 'generating',
          videoProgress: 20,
          videoInputMode: requestedMode,
        })
        await get().saveCurrentProject()
        get().pollVideoTask(shotId, taskId)
      } else {
        get().updateShot(shotId, { videoStatus: 'failed' })
        notifyFailure(`el video de la toma ${shot.order}`, 'El proveedor no devolvió una tarea')
      }
    } catch (err) {
      console.error('[DramaStore] Video gen failed:', err)
      get().updateShot(shotId, { videoStatus: 'failed' })
      notifyFailure(`el video de la toma ${shot.order}`, (err as any)?.message)
    } finally {
      inFlight.delete(`vid:${shotId}`)
    }
  },

  generateAllVideos: async () => {
    const state = get()
    const isSequential = state.isSequentialVideoGen
    const shots = [...state.shots].sort((a, b) => a.order - b.order)
    if (shots.length === 0) return

    if (isSequential) {
      let lastCompletedVideo: {
        url?: string
        localPath?: string
        assetId?: string
        order: number
      } | null = null

      for (const shot of shots) {
        // If already completed and has valid video, preserve as reference and skip regeneration
        if (shot.videoStatus === 'completed' && (shot.videoUrl || shot.videoLocalPath || shot.videoAssetId)) {
          lastCompletedVideo = {
            url: shot.videoUrl,
            localPath: shot.videoLocalPath,
            assetId: shot.videoAssetId,
            order: shot.order,
          }
          continue
        }

        const activeModel = get().videoModel
        const supportsVideoRef = Boolean(activeModel.supportsVideoRef)
        const customParams: any = {}

        if (supportsVideoRef && lastCompletedVideo) {
          const vRef = {
            url: lastCompletedVideo.url,
            localPath: lastCompletedVideo.localPath,
            assetId: lastCompletedVideo.assetId,
            name: `Toma ${lastCompletedVideo.order}`,
            mime: 'video/mp4',
          }
          customParams.videoRefs = [vRef]

          // Sync into shot state so card visual pill updates immediately
          get().updateShot(shot.id, {
            videoRefUrl: lastCompletedVideo.url,
            videoRefLocalPath: lastCompletedVideo.localPath,
            videoRefAssetId: lastCompletedVideo.assetId,
            videoRefName: `Toma ${lastCompletedVideo.order}`,
          })
        }

        await get().generateShotVideo(shot.id, customParams)
        const finishedShot = await waitForShotVideo(shot.id)

        if (
          finishedShot &&
          finishedShot.videoStatus === 'completed' &&
          (finishedShot.videoUrl || finishedShot.videoLocalPath || finishedShot.videoAssetId)
        ) {
          lastCompletedVideo = {
            url: finishedShot.videoUrl,
            localPath: finishedShot.videoLocalPath,
            assetId: finishedShot.videoAssetId,
            order: finishedShot.order,
          }
        }
      }
    } else {
      // Batch mode: concurrent execution in chunks of videoGenBatchSize
      const batchSize = Math.max(1, state.videoGenBatchSize || 2)
      const pendingShots = shots.filter(
        (s) => s.videoStatus !== 'completed' || (!s.videoUrl && !s.videoLocalPath && !s.videoAssetId)
      )

      for (let i = 0; i < pendingShots.length; i += batchSize) {
        const batch = pendingShots.slice(i, i + batchSize)
        await Promise.all(batch.map((shot) => get().generateShotVideo(shot.id)))
        await Promise.all(batch.map((shot) => waitForShotVideo(shot.id)))
      }
    }
  },

  // ─── Final Assembly (Stage 6) ─────────────────────────────────────
  assembleFinalEpisode: async (options) => {
    const state = get()
    set({ finalVideo: { rendering: true, error: undefined, progress: 10 } })

    try {
      const api = (window as any).electronAPI
      const validShots = state.shots.filter((s) => s.videoLocalPath || s.videoUrl || s.videoAssetId)
      if (validShots.length === 0) {
        throw new Error('No hay videos generados listos para ensamblar.')
      }

      if (!api?.ffmpeg?.assembleDrama) {
        throw new Error('El motor FFmpeg no está disponible en este entorno.')
      }

      const shotsData = validShots.map((s) => ({
        videoPath: s.videoLocalPath,
        videoUrl: s.videoUrl,
        videoAssetId: s.videoAssetId,
        // Subtitles carry the spoken words only, never the [audio tags]
        dialogue: (s.dialogueText || '').split('\n').map(stripAudioTags).filter(Boolean).join('\n'),
        speaker: s.dialogueSpeaker,
        duration: s.estimatedDuration,
      }))

      const res = await api.ffmpeg.assembleDrama({
        title: state.title,
        shots: shotsData,
        aspectRatio: state.aspectRatio,
        includeSubtitles: options?.includeSubtitles ?? true,
      })

      if (res?.success && res?.outputPath) {
        set({
          finalVideo: {
            rendering: false,
            localPath: res.outputPath,
            url: `file://${res.outputPath}`,
            progress: 100,
          },
        })
        await get().saveCurrentProject()
      } else {
        throw new Error(res?.error || 'Falló la compilación del video final')
      }
    } catch (err: any) {
      console.error('[DramaStore] Assembly failed:', err)
      set({
        finalVideo: {
          rendering: false,
          error: err?.message || 'Error en el ensamblado',
        },
      })
    }
  },

  runFullAutoPipeline: async () => {
    if (get().isAutoRunning) return
    set({ isAutoRunning: true, autoRunStatus: 'Iniciando…' })

    // Each phase uses the previous one's results (portraits → frames → videos),
    // so it waits for the dispatched tasks to land before moving on.
    const imagesPending = () => {
      const s = get()
      return s.characters.some((c) => c.generating) || s.scenarios.some((x) => x.generating) || s.props.some((p) => p.generating)
    }
    const framesPending = () => get().shots.some((sh) => sh.keyframeGenerating || sh.audioStatus === 'generating')

    try {
      if (get().shots.length === 0) {
        set({ autoRunStatus: '1/5 · Guión y tomas' })
        await get().generateScriptBreakdown()
        const { scriptError, shots } = get()
        if (scriptError) throw new Error(scriptError)
        if (shots.length === 0) throw new Error('El guión no produjo tomas')
      }

      set({ autoRunStatus: '2/5 · Personajes, locaciones y objetos' })
      await get().generateAllCharacterImages(true)
      await get().generateAllScenarioImages(true)
      await get().generateAllPropImages(true)
      await waitUntil(() => !imagesPending())

      set({ autoRunStatus: '3/5 · Frames y diálogos' })
      await get().generateAllKeyframes(true)
      await get().generateAllVoices(true)
      await waitUntil(() => !framesPending())

      set({ autoRunStatus: '4/5 · Videos' })
      await get().generateAllVideos()

      set({ autoRunStatus: '5/5 · Ensamblaje' })
      await get().assembleFinalEpisode()
      const { finalVideo } = get()
      if (finalVideo.error) throw new Error(finalVideo.error)

      set({ isAutoRunning: false, autoRunStatus: '' })
      toast.success('Pieza completada', { description: 'El video final está listo en Ensamblaje.' })
    } catch (err: any) {
      set({ isAutoRunning: false, autoRunStatus: '' })
      toast.error('El pipeline automático se detuvo', { description: err?.message })
    }
  },

  reset: () => {
    const config = CONTENT_TYPES_CONFIG[get().contentType] || CONTENT_TYPES_CONFIG.microdrama
    set({
      ideaPrompt: '',
      genre: config.genres[0] || 'Drama de Suspenso',
      tone: config.tones[0] || 'Cinematográfico y Misterioso',
      visualStyle: config.defaultVisualStyle,
      shotsCount: config.defaultShotsCount,
      currentStage: 1,
      isGeneratingScript: false,
      scriptError: undefined,
      isAutoRunning: false,
      autoRunStatus: '',
      script: '',
      logline: '',
      characters: [],
      scenarios: [],
      props: [],
      shots: [],
      finalVideo: {},
    })
    get().saveCurrentProject()
  },
}))
