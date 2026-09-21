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
import { useWorkspaceStore } from './workspace-store'

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
  videoInputMode?: 'ff' | 'fflf' | 'ref' | 't2v'
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

export interface ParsedDialogueTurn {
  speaker: string
  text: string
  voiceId?: string
}

export function cleanTextForTts(text: string): string {
  if (!text) return ''
  let cleaned = text.trim()

  // 1. Remove bracketed/parenthesized stage directions or tone tags
  cleaned = cleaned.replace(/\((?:susurrando|gritando|enojado|triste|alegre|serio|pausa|llorando|riendo|agitado|v\.o\.|locutor|voz en off|off|en off|acento [^)]+|tono [^)]+|[\w\s]{1,25})\)/gi, (match) => {
    return match.length <= 30 ? '' : match
  })
  cleaned = cleaned.replace(/\[(?:susurrando|gritando|enojado|triste|alegre|serio|pausa|llorando|riendo|agitado|v\.o\.|locutor|voz en off|off|en off|acento [^\]]+|tono [^\]]+|[\w\s]{1,25})\]/gi, (match) => {
    return match.length <= 30 ? '' : match
  })

  // 2. Remove leading speaker prefix e.g. "Carlos:", "[Carlos]", "Ana - ", "Narrador: "
  cleaned = cleaned.replace(/^(?:\[[^\]]+\]|[A-ZÁÉÍÓÚÑa-záéíóúñ0-9_ ]{1,30}[:\-–—])\s*/i, '')

  // 3. Remove outer surrounding quotes if present
  cleaned = cleaned.replace(/^["“'«](.*)["”'»]$/s, '$1')

  // 4. Normalize multiple whitespaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  return cleaned
}

export function parseDialogueTurns(
  dialogueText: string,
  defaultSpeaker: string = '',
  characters: DramaCharacter[] = [],
  defaultVoiceId: string = ''
): ParsedDialogueTurn[] {
  if (!dialogueText || !dialogueText.trim()) return []

  const lines = dialogueText.split('\n').map((l) => l.trim()).filter(Boolean)
  const turns: ParsedDialogueTurn[] = []

  const charMap = new Map<string, DramaCharacter>()
  for (const c of characters) {
    charMap.set(c.name.toLowerCase().trim(), c)
  }

  const isNarrator = (s: string) => !s || /^(?:narrador|narradora|locutor|locutora|v\.o\.|voz en off|off|voiceover|narrator)$/i.test(s.trim())

  for (const line of lines) {
    const match = line.match(/^(?:\[([^\]]+)\]|([^:\-–—]+)[:\-–—])\s*["“'«]?(.*?)["”'»]?$/i)
    if (match) {
      const speakerRaw = (match[1] || match[2] || '').trim()
      const textRaw = (match[3] || '').trim()
      if (textRaw) {
        const foundChar = !isNarrator(speakerRaw) ? charMap.get(speakerRaw.toLowerCase()) : undefined
        const voiceId = foundChar?.voiceId || defaultVoiceId
        turns.push({
          speaker: foundChar ? foundChar.name : speakerRaw,
          text: cleanTextForTts(textRaw),
          voiceId,
        })
        continue
      }
    }

    const foundChar = !isNarrator(defaultSpeaker) ? charMap.get((defaultSpeaker || '').toLowerCase().trim()) : undefined
    turns.push({
      speaker: foundChar ? foundChar.name : (defaultSpeaker || 'Narrador (V.O.)'),
      text: cleanTextForTts(line),
      voiceId: foundChar?.voiceId || defaultVoiceId,
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

async function dispatchGeneration(api: any, type: 'video' | 'image' | 'audio', payload: any) {
  const provider = payload?.provider || (
    payload?.model?.startsWith('machgen/') ? 'machgen' :
    payload?.model?.startsWith('fal-ai/') || payload?.model?.startsWith('minimax/') ? 'fal' :
    payload?.model?.startsWith('higgsfield/') ? 'higgsfield' :
    payload?.model?.startsWith('prunaai/') ? 'replicate' : 'kie'
  )
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

const DEFAULT_IMAGE_MODEL = IMAGE_MODELS.find(m => m.t2iId === 'seedream/5-pro-text-to-image' || m.t2iId === 'seedream-5-pro-text-to-image') || IMAGE_MODELS[0]
const DEFAULT_VIDEO_MODEL = VIDEO_MODELS.find(m => m.t2vId === 'kling-3.0/video') || VIDEO_MODELS[0]
const DEFAULT_VOICE_MODEL = AUDIO_MODELS.find(m => m.t2aId === 'minimax-text-to-speech') || AUDIO_MODELS[0]
const DEFAULT_LLM_MODEL = LLM_MODELS.find(m => m.modelId === 'gemini-3-pro') || LLM_MODELS[0]

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
  voiceModel: ModelPricing
  voiceId: string

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
  generateAllCharacterImages: () => Promise<void>
  regenerateCharacterVisualPrompt: (characterId: string) => Promise<void>
  regenerateAllCharacterVisualPrompts: () => Promise<void>
  generateScenarioImage: (scenarioId: string) => Promise<void>
  generateAllScenarioImages: () => Promise<void>
  regenerateScenarioVisualPrompt: (scenarioId: string) => Promise<void>
  regenerateAllScenarioVisualPrompts: () => Promise<void>
  generatePropImage: (propId: string) => Promise<void>
  generateAllPropImages: () => Promise<void>
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
  generateAllKeyframes: () => Promise<void>
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
  generateAllVoices: () => Promise<void>
  assembleFinalEpisode: (options?: { includeSubtitles?: boolean; bgMusic?: boolean }) => Promise<void>
  runFullAutoPipeline: () => Promise<void>
  syncPendingTasks: () => Promise<void>
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
  voiceModel: DEFAULT_VOICE_MODEL,
  voiceId: 'male-qn-qingse',

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
          const imgM = IMAGE_MODELS.find((m) => m.t2iId === proj.imageModel || (proj.imageModel === 'seedream-5-pro-text-to-image' && m.t2iId === 'seedream/5-pro-text-to-image') || m.name === proj.imageModel) || DEFAULT_IMAGE_MODEL
          const vidM = VIDEO_MODELS.find((m) => m.t2vId === proj.videoModel || m.name === proj.videoModel) || DEFAULT_VIDEO_MODEL
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
            currentStage: proj.currentStage || 1,
            llmModel: llm,
            imageModel: imgM,
            imageResolution: proj.imageResolution || '1K',
            videoModel: vidM,
            videoResolution: proj.videoResolution || '720p',
            videoDuration: proj.videoDuration || 5,
            voiceModel: audM,
            voiceId: proj.voiceId || 'male-qn-qingse',
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
          imageModel: state.imageModel.t2iId || state.imageModel.name,
          imageResolution: state.imageResolution,
          videoModel: state.videoModel.t2vId || state.videoModel.name,
          videoResolution: state.videoResolution,
          videoDuration: state.videoDuration,
          voiceModel: state.voiceModel.t2aId || state.voiceModel.name,
          voiceId: state.voiceId,
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
    set({ currentStage: stage })
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

  setVoiceModel: (model, voiceId) => {
    set((s) => ({
      voiceModel: model,
      voiceId: voiceId || s.voiceId,
    }))
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
      })

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
        stream: false,
      })

      const text = res?.content || res?.message?.content || ''
      if (!text) {
        throw new Error(`El modelo LLM (${state.llmModel.name}) no devolvió contenido. Verifica las credenciales de KIE.`)
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
      const characters: DramaCharacter[] = (breakdown.characters || []).map((c: any) => ({
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
          characterNames: Array.isArray(sh.characterNames) ? sh.characterNames : [],
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
          dialogueSpeaker: pendingSpeaker.trim() || (state.characters[0]?.name || 'Locutor'),
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
    const api = (window as any).electronAPI
    if (!api?.openfield?.taskStatus) return

    get().updateCharacter(charId, { taskId, generating: true })

    if (activePolling.has(taskId)) return

    const check = async () => {
      try {
        const status = await api.openfield.taskStatus(taskId)
        if (status?.status === 'completed') {
          const t = activePolling.get(taskId)
          if (t) clearInterval(t)
          activePolling.delete(taskId)

          let assetId = status.assetId
          let imageUrl = status.outputUrl || status.localPath || status.resultUrl
          if (!imageUrl && status.resultJson) {
            try {
              const p = typeof status.resultJson === 'string' ? JSON.parse(status.resultJson) : status.resultJson
              imageUrl = p.url || p.resultUrls?.[0] || p.imageUrl
            } catch {}
          }

          const currentChar = get().characters.find((c) => c.id === charId)
          const newHistoryItem: GenerationHistoryItem = {
            id: uid(),
            url: imageUrl,
            assetId,
            prompt: currentChar?.visualPrompt,
            timestamp: Date.now(),
            model: get().imageModel.name,
          }
          const existingHistory = currentChar?.imageHistory || []
          const updatedHistory = [newHistoryItem, ...existingHistory.filter((h) => h.url !== imageUrl && h.assetId !== assetId)]

          get().updateCharacter(charId, {
            generating: false,
            imageAssetId: assetId,
            imageUrl,
            imageHistory: updatedHistory,
            taskId,
          })
          get().saveCurrentProject()
        } else if (status?.status === 'failed') {
          const t = activePolling.get(taskId)
          if (t) clearInterval(t)
          activePolling.delete(taskId)
          get().updateCharacter(charId, { generating: false })
        }
      } catch (err) {
        console.warn('[DramaStore] Character poll error:', err)
      }
    }

    check()
    const timer = setInterval(check, 1500)
    activePolling.set(taskId, timer)
  },

  pollScenarioTask: (scenarioId: string, taskId: string) => {
    if (!taskId) return
    const api = (window as any).electronAPI
    if (!api?.openfield?.taskStatus) return

    get().updateScenario(scenarioId, { taskId, generating: true })

    if (activePolling.has(taskId)) return

    const check = async () => {
      try {
        const status = await api.openfield.taskStatus(taskId)
        if (status?.status === 'completed') {
          const t = activePolling.get(taskId)
          if (t) clearInterval(t)
          activePolling.delete(taskId)

          let assetId = status.assetId
          let imageUrl = status.outputUrl || status.localPath || status.resultUrl
          if (!imageUrl && status.resultJson) {
            try {
              const p = typeof status.resultJson === 'string' ? JSON.parse(status.resultJson) : status.resultJson
              imageUrl = p.url || p.resultUrls?.[0] || p.imageUrl
            } catch {}
          }

          const currentScn = get().scenarios.find((s) => s.id === scenarioId)
          const newHistoryItem: GenerationHistoryItem = {
            id: uid(),
            url: imageUrl,
            assetId,
            prompt: currentScn?.visualPrompt,
            timestamp: Date.now(),
            model: get().imageModel.name,
          }
          const existingHistory = currentScn?.imageHistory || []
          const updatedHistory = [newHistoryItem, ...existingHistory.filter((h) => h.url !== imageUrl && h.assetId !== assetId)]

          get().updateScenario(scenarioId, {
            generating: false,
            imageAssetId: assetId,
            imageUrl,
            imageHistory: updatedHistory,
            taskId,
          })
          get().saveCurrentProject()
        } else if (status?.status === 'failed') {
          const t = activePolling.get(taskId)
          if (t) clearInterval(t)
          activePolling.delete(taskId)
          get().updateScenario(scenarioId, { generating: false })
        }
      } catch (err) {
        console.warn('[DramaStore] Scenario poll error:', err)
      }
    }

    check()
    const timer = setInterval(check, 1500)
    activePolling.set(taskId, timer)
  },

  pollPropTask: (propId: string, taskId: string) => {
    if (!taskId) return
    const api = (window as any).electronAPI
    if (!api?.openfield?.taskStatus) return

    get().updateProp(propId, { taskId, generating: true })

    if (activePolling.has(taskId)) return

    const check = async () => {
      try {
        const status = await api.openfield.taskStatus(taskId)
        if (status?.status === 'completed') {
          const t = activePolling.get(taskId)
          if (t) clearInterval(t)
          activePolling.delete(taskId)

          let assetId = status.assetId
          let imageUrl = status.outputUrl || status.localPath || status.resultUrl
          if (!imageUrl && status.resultJson) {
            try {
              const p = typeof status.resultJson === 'string' ? JSON.parse(status.resultJson) : status.resultJson
              imageUrl = p.url || p.resultUrls?.[0] || p.imageUrl
            } catch {}
          }

          const currentProp = get().props.find((p) => p.id === propId)
          const newHistoryItem: GenerationHistoryItem = {
            id: uid(),
            url: imageUrl,
            assetId,
            prompt: currentProp?.visualPrompt,
            timestamp: Date.now(),
            model: get().imageModel.name,
          }
          const existingHistory = currentProp?.imageHistory || []
          const updatedHistory = [newHistoryItem, ...existingHistory.filter((h) => h.url !== imageUrl && h.assetId !== assetId)]

          get().updateProp(propId, {
            generating: false,
            imageAssetId: assetId,
            imageUrl,
            imageHistory: updatedHistory,
            taskId,
          })
          get().saveCurrentProject()
        } else if (status?.status === 'failed') {
          const t = activePolling.get(taskId)
          if (t) clearInterval(t)
          activePolling.delete(taskId)
          get().updateProp(propId, { generating: false })
        }
      } catch (err) {
        console.warn('[DramaStore] Prop poll error:', err)
      }
    }

    check()
    const timer = setInterval(check, 1500)
    activePolling.set(taskId, timer)
  },

  pollKeyframeTask: (shotId: string, taskId: string) => {
    if (!taskId) return
    const api = (window as any).electronAPI
    if (!api?.openfield?.taskStatus) return

    get().updateShot(shotId, { keyframeTaskId: taskId, keyframeGenerating: true })

    if (activePolling.has(taskId)) return

    const check = async () => {
      try {
        const status = await api.openfield.taskStatus(taskId)
        if (status?.status === 'completed') {
          const t = activePolling.get(taskId)
          if (t) clearInterval(t)
          activePolling.delete(taskId)

          let assetId = status.assetId
          let imageUrl = status.outputUrl || status.localPath || status.resultUrl
          if (!imageUrl && status.resultJson) {
            try {
              const p = typeof status.resultJson === 'string' ? JSON.parse(status.resultJson) : status.resultJson
              imageUrl = p.url || p.resultUrls?.[0] || p.imageUrl
            } catch {}
          }

          const currentShot = get().shots.find((s) => s.id === shotId)
          const newHistoryItem: GenerationHistoryItem = {
            id: uid(),
            url: imageUrl,
            assetId,
            prompt: currentShot?.keyframePrompt || currentShot?.actionPrompt,
            timestamp: Date.now(),
            model: get().imageModel.name,
          }
          const existingHistory = currentShot?.keyframeHistory || []
          const updatedHistory = [newHistoryItem, ...existingHistory.filter((h) => h.url !== imageUrl && h.assetId !== assetId)]

          get().updateShot(shotId, {
            keyframeGenerating: false,
            keyframeAssetId: assetId,
            keyframeUrl: imageUrl,
            keyframeHistory: updatedHistory,
            keyframeTaskId: taskId,
          })
          get().saveCurrentProject()
        } else if (status?.status === 'failed') {
          const t = activePolling.get(taskId)
          if (t) clearInterval(t)
          activePolling.delete(taskId)
          get().updateShot(shotId, { keyframeGenerating: false })
        }
      } catch (err) {
        console.warn('[DramaStore] Keyframe poll error:', err)
      }
    }

    check()
    const timer = setInterval(check, 1500)
    activePolling.set(taskId, timer)
  },

  pollVideoTask: (shotId: string, taskId: string) => {
    if (!taskId) return
    const api = (window as any).electronAPI
    if (!api?.openfield?.taskStatus) return

    get().updateShot(shotId, { videoTaskId: taskId, videoStatus: 'generating' })

    if (activePolling.has(taskId)) return

    const check = async () => {
      try {
        const status = await api.openfield.taskStatus(taskId)
        if (status?.status === 'completed') {
          const t = activePolling.get(taskId)
          if (t) clearInterval(t)
          activePolling.delete(taskId)

          let assetId = status.assetId
          let videoUrl = status.outputUrl || status.localPath || status.resultUrl
          let localPath = status.localPath
          if (!videoUrl && status.resultJson) {
            try {
              const p = typeof status.resultJson === 'string' ? JSON.parse(status.resultJson) : status.resultJson
              videoUrl = p.url || p.resultUrls?.[0] || p.videoUrl
            } catch {}
          }
          if (!localPath && assetId && api?.assets?.get) {
            const asset = await api.assets.get(assetId)
            if (asset?.local_path) localPath = asset.local_path
          }

          const currentShot = get().shots.find((s) => s.id === shotId)
          const newHistoryItem: GenerationHistoryItem = {
            id: uid(),
            url: videoUrl,
            localPath,
            assetId,
            prompt: currentShot?.actionPrompt,
            timestamp: Date.now(),
            model: get().videoModel.name,
            duration: currentShot?.estimatedDuration || 5,
            inputMode: currentShot?.videoInputMode || 'ff',
          }
          const existingHistory = currentShot?.videoHistory || []
          const updatedHistory = [newHistoryItem, ...existingHistory.filter((h) => h.url !== videoUrl && h.assetId !== assetId)]

          get().updateShot(shotId, {
            videoStatus: 'completed',
            videoProgress: 100,
            videoAssetId: assetId,
            videoUrl,
            videoLocalPath: localPath,
            videoHistory: updatedHistory,
            videoTaskId: taskId,
          })
          get().saveCurrentProject()
        } else if (status?.status === 'failed') {
          const t = activePolling.get(taskId)
          if (t) clearInterval(t)
          activePolling.delete(taskId)
          get().updateShot(shotId, { videoStatus: 'failed' })
        } else {
          get().updateShot(shotId, {
            videoStatus: 'generating',
            videoProgress: status?.progress || 50,
          })
        }
      } catch {}
    }

    check()
    const timer = setInterval(check, 2000)
    activePolling.set(taskId, timer)
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
    const api = (window as any).electronAPI
    if (!api?.openfield?.taskStatus) return

    get().updateShot(shotId, { audioTaskId: taskId, audioStatus: 'generating' })

    if (activePolling.has(taskId)) return

    const check = async () => {
      try {
        const status = await api.openfield.taskStatus(taskId)
        if (status?.status === 'completed') {
          const t = activePolling.get(taskId)
          if (t) clearInterval(t)
          activePolling.delete(taskId)

          let assetId = status.assetId
          let audioUrl = status.outputUrl || status.localPath || status.resultUrl
          let localPath = status.localPath

          if (!localPath && assetId && api?.assets?.get) {
            const asset = await api.assets.get(assetId)
            if (asset?.local_path) localPath = asset.local_path
          }

          get().updateShot(shotId, {
            audioStatus: 'completed',
            audioAssetId: assetId,
            audioUrl,
            audioLocalPath: localPath,
            audioTaskId: taskId,
          })
          get().saveCurrentProject()
        } else if (status?.status === 'failed') {
          const t = activePolling.get(taskId)
          if (t) clearInterval(t)
          activePolling.delete(taskId)
          get().updateShot(shotId, { audioStatus: 'failed' })
        }
      } catch {}
    }

    check()
    const timer = setInterval(check, 2000)
    activePolling.set(taskId, timer)
  },

  syncPendingTasks: async () => {
    const state = get()

    // 1. Sync characters with pending task
    for (const char of state.characters) {
      if (char.taskId && !char.imageUrl) {
        get().pollCharacterTask(char.id, char.taskId)
      }
    }

    // 2. Sync scenarios
    for (const scn of state.scenarios) {
      if (scn.taskId && !scn.imageUrl) {
        get().pollScenarioTask(scn.id, scn.taskId)
      }
    }

    // 3. Sync props
    for (const prop of state.props) {
      if (prop.taskId && !prop.imageUrl) {
        get().pollPropTask(prop.id, prop.taskId)
      }
    }

    // 4. Sync shots
    for (const shot of state.shots) {
      if (shot.keyframeTaskId && !shot.keyframeUrl) {
        get().pollKeyframeTask(shot.id, shot.keyframeTaskId)
      }
      if (shot.videoTaskId && shot.videoStatus !== 'completed') {
        get().pollVideoTask(shot.id, shot.videoTaskId)
      }
      if (shot.audioTaskId && shot.audioStatus !== 'completed') {
        get().pollAudioTask(shot.id, shot.audioTaskId)
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
      const payload = buildImagePayload(state.imageModel, prompt, {
        aspectRatio: '1:1',
        resolution: state.imageResolution,
      })

      const task = await dispatchGeneration(api, 'image', payload)
      const taskId = typeof task === 'string' ? task : (task?.taskId || task?.id)

      if (taskId) {
        get().updateCharacter(charId, { taskId, generating: true })
        await get().saveCurrentProject()
        get().pollCharacterTask(charId, taskId)
      } else {
        get().updateCharacter(charId, { generating: false })
      }
    } catch (err) {
      console.error('[DramaStore] Character image gen failed:', err)
      get().updateCharacter(charId, { generating: false })
    }
  },

  generateAllCharacterImages: async () => {
    const chars = get().characters
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
      const payload = buildImagePayload(state.imageModel, prompt, {
        aspectRatio: state.aspectRatio,
        resolution: state.imageResolution,
      })

      const task = await dispatchGeneration(api, 'image', payload)
      const taskId = typeof task === 'string' ? task : (task?.taskId || task?.id)

      if (taskId) {
        get().updateScenario(scenarioId, { taskId, generating: true })
        await get().saveCurrentProject()
        get().pollScenarioTask(scenarioId, taskId)
      } else {
        get().updateScenario(scenarioId, { generating: false })
      }
    } catch (err) {
      console.error('[DramaStore] Scenario image gen failed:', err)
      get().updateScenario(scenarioId, { generating: false })
    }
  },

  generateAllScenarioImages: async () => {
    const scns = get().scenarios
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

  generateAllPropImages: async () => {
    const props = get().props
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
      const payload = buildImagePayload(state.imageModel, prompt, {
        aspectRatio: '1:1',
        resolution: state.imageResolution,
      })

      const task = await dispatchGeneration(api, 'image', payload)
      const taskId = typeof task === 'string' ? task : (task?.taskId || task?.id)

      if (taskId) {
        get().updateProp(propId, { taskId, generating: true })
        await get().saveCurrentProject()
        get().pollPropTask(propId, taskId)
      } else {
        get().updateProp(propId, { generating: false })
      }
    } catch (err) {
      console.error('[DramaStore] Prop image gen failed:', err)
      get().updateProp(propId, { generating: false })
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

      // If customParams.imageRefs is explicitly passed (even if empty []), respect it directly
      if (customParams && 'imageRefs' in customParams) {
        imageRefs = customParams.imageRefs ? [...customParams.imageRefs] : []
      } else {
        // 1. Gather all linked characters, scenario, props, and dialogue speaker
        const charsInShot = state.characters.filter((c) => (shot.characterNames || []).includes(c.name))
        const speakerChar = state.characters.find(
          (c) => (shot.dialogueSpeaker || '').toLowerCase().trim() === c.name.toLowerCase().trim()
        )
        if (speakerChar && !charsInShot.some((c) => c.id === speakerChar.id)) {
          charsInShot.unshift(speakerChar)
        }

        const scnInShot = state.scenarios.find((s) => s.name === shot.scenarioName)
        const propsInShot = state.props.filter((p) => (shot.propNames || []).includes(p.name))

        // Characters first (speaker first)
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

      // 3. Build prompt: if customParams.prompt is provided or shot has a customized keyframePrompt, use it directly
      let fullPrompt = customParams?.prompt
      if (!fullPrompt) {
        if (shot.keyframePrompt && shot.keyframePrompt.trim()) {
          fullPrompt = shot.keyframePrompt.trim()
        } else {
          const promptParts: string[] = []

          // Camera framing for opening frame
          if (shot.cameraMovement && shot.cameraMovement.trim()) {
            promptParts.push(`Camera: ${shot.cameraMovement.trim()}`)
          }

          // Exact initial frame (Frame 0) composition description
          const initialFrameText = (shot.actionPrompt || 'Cinematic dramatic opening shot').trim()
          promptParts.push(`Initial Frame (Frame 0): ${initialFrameText}`)

          // Environment
          const scnInShot = state.scenarios.find((s) => s.name === shot.scenarioName)
          if (scnInShot && (scnInShot.visualPrompt || scnInShot.name)) {
            promptParts.push(`Environment: ${scnInShot.name}${scnInShot.visualPrompt ? ` (${scnInShot.visualPrompt})` : ''}`)
          }

          // Props / Key objects visible in frame
          const propsInShot = state.props.filter((p) => (shot.propNames || []).includes(p.name))
          if (propsInShot.length > 0) {
            const propDescriptions = propsInShot
              .map((p) => `${p.name}${p.visualPrompt || p.description ? ` (${p.visualPrompt || p.description})` : ''}`)
              .join(', ')
            promptParts.push(`Key Objects: ${propDescriptions}`)
          }

          // Visual style & cinematic quality
          const styleSuffix = state.visualStyle
            ? `${state.visualStyle} style, cinematic lighting, 8k resolution, highly detailed, masterwork composition`
            : 'cinematic lighting, 8k resolution, highly detailed, masterwork composition'
          promptParts.push(styleSuffix)

          // Audio/Ambient directive: Diegetic SFX allowed, strictly NO music (music is inserted in final assembly)
          promptParts.push('ambient diegetic sound effects (SFX), foley audio, strictly no background music, no soundtrack, no musical score')

          fullPrompt = promptParts.join(', ')
        }
      }

      const payload = buildImagePayload(targetModel, fullPrompt, {
        aspectRatio: customParams?.aspectRatio || state.aspectRatio,
        resolution: customParams?.resolution || state.imageResolution,
        imageRefs: imageRefs.length > 0 ? imageRefs : undefined,
        imageRefAssetId: imageRefs[0]?.assetId,
        imageBase64: customParams?.imageBase64 || imageRefs[0]?.base64,
        imageUrl: customParams?.imageUrl || imageRefs[0]?.imageUrl,
      })

      const task = await dispatchGeneration(api, 'image', payload)
      const taskId = typeof task === 'string' ? task : (task?.taskId || task?.id)

      if (taskId) {
        get().updateShot(shotId, { keyframeTaskId: taskId, keyframeGenerating: true })
        await get().saveCurrentProject()
        get().pollKeyframeTask(shotId, taskId)
      } else {
        get().updateShot(shotId, { keyframeGenerating: false })
      }
    } catch (err) {
      console.error('[DramaStore] Keyframe gen failed:', err)
      get().updateShot(shotId, { keyframeGenerating: false })
    }
  },

  generateAllKeyframes: async () => {
    const shots = get().shots
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
4. Output ONLY the English prompt text directly, without quotes, markdown, or commentary.`

    const userContent = `Scene Action: ${shot.actionPrompt}
Camera Movement: ${shot.cameraMovement}
Dialogue / Locution: ${shot.dialogueText ? `${shot.dialogueSpeaker}: "${shot.dialogueText}"` : 'None'}
Environment: ${scnInShot ? `${scnInShot.name} - ${scnInShot.visualPrompt}` : shot.scenarioName || 'Cinematic environment'}
Characters involved in scene: ${charsInShot.map((c) => `${c.name} (${c.visualPrompt || ''})`).join(', ') || 'None'}
Objects: ${propsInShot.map((p) => p.name).join(', ') || 'None'}
Visual Style (MANDATORY TO EMBED): ${state.visualStyle || 'Cinematic, 8k, photorealistic'}`

    const res = await api.openfield.agentChat({
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userContent },
      ],
      model: modelId,
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

    if (customDialogueText !== undefined && customDialogueText !== shot.dialogueText) {
      get().updateShot(shotId, { dialogueText: customDialogueText, audioStatus: 'generating', audioTaskId: undefined })
    } else {
      get().updateShot(shotId, { audioStatus: 'generating', audioTaskId: undefined })
    }

    try {
      const api = (window as any).electronAPI
      const speakerRaw = (shot.dialogueSpeaker || '').trim()
      const isNarratorSpeaker =
        !speakerRaw ||
        /^(?:narrador|narradora|locutor|locutora|v\.o\.|voz en off|off|voiceover|narrator)$/i.test(speakerRaw)

      const speakerChar = !isNarratorSpeaker
        ? state.characters.find(
            (c) => c.name.toLowerCase().trim() === speakerRaw.toLowerCase()
          )
        : undefined
      const defaultVoiceId = speakerChar?.voiceId || state.voiceId || '21m00Tcm4TlvDq8ikWAM'

      // Parse dialogue turns (detects multiple speakers if present)
      const parsedTurns = parseDialogueTurns(
        effectiveDialogue,
        shot.dialogueSpeaker,
        state.characters,
        defaultVoiceId
      )

      const hasElevenVoice =
        state.characters.some((c) => c.voiceId && c.voiceId.length > 15) ||
        (defaultVoiceId && defaultVoiceId.length > 15)
      const isElevenLabs =
        state.voiceModel.provider === 'elevenlabs' ||
        (api?.elevenlabs?.generate && hasElevenVoice)

      if (isElevenLabs) {
        try {
          const modelId = state.voiceModel.t2aId || state.voiceModel.name || 'eleven_multilingual_v2'
          let asset: any

          // If there are 2 or more dialogue turns with assigned voice IDs, use native text-to-dialogue
          if (parsedTurns.length >= 2 && api?.elevenlabs?.generateDialogue) {
            const dialogueModel = modelId.startsWith('eleven_') ? modelId : 'eleven_v3'
            asset = await api.elevenlabs.generateDialogue({
              inputs: parsedTurns.map((t) => ({
                text: cleanTextForTts(t.text),
                voiceId: t.voiceId || defaultVoiceId,
              })),
              model: dialogueModel,
            })
          } else if (api?.elevenlabs?.generate) {
            const singleVoiceId = parsedTurns[0]?.voiceId || defaultVoiceId
            // For single-voice generation, combine all spoken turns without character prefix headers
            const singlePrompt = parsedTurns.length > 0
              ? parsedTurns.map((t) => cleanTextForTts(t.text)).filter(Boolean).join(' ')
              : cleanTextForTts(effectiveDialogue)

            asset = await api.elevenlabs.generate({
              voiceId: singleVoiceId,
              prompt: singlePrompt,
              model: modelId.startsWith('eleven_') ? modelId : 'eleven_multilingual_v2',
            })
          }

          if (asset) {
            const localPath = asset.local_path || asset.filePath
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
        ? parsedTurns.map((t) => cleanTextForTts(t.text)).filter(Boolean).join(' ')
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
      }
    } catch (err) {
      console.error('[DramaStore] Audio gen failed:', err)
      get().updateShot(shotId, { audioStatus: 'failed' })
    }
  },

  generateAllVoices: async () => {
    const shots = get().shots
    for (const shot of shots) {
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

    get().updateShot(shotId, { videoStatus: 'queued', videoProgress: 10, videoTaskId: undefined })

    try {
      const api = (window as any).electronAPI
      const inputMode = customParams?.inputMode || shot.videoInputMode || 'ff'
      const targetModel = customParams?.model || state.videoModel

      // 1. Gather all linked characters and speaker
      const charsInShot = state.characters.filter((c) => (shot.characterNames || []).includes(c.name))
      const propsInShot = state.props.filter((p) => (shot.propNames || []).includes(p.name))
      const speakerChar = state.characters.find(
        (c) => (shot.dialogueSpeaker || '').toLowerCase().trim() === c.name.toLowerCase().trim()
      )
      if (speakerChar && !charsInShot.some((c) => c.id === speakerChar.id)) {
        charsInShot.unshift(speakerChar)
      }

      let prompt = customParams?.prompt
      if (!prompt) {
        const promptParts: string[] = []
        const cameraMov = customParams?.cameraMovement || shot.cameraMovement
        if (cameraMov && cameraMov.trim()) {
          promptParts.push(cameraMov.trim())
        }
        if (customParams?.cameraShot) promptParts.push(customParams.cameraShot)
        if (customParams?.cameraLens) promptParts.push(customParams.cameraLens)
        if (customParams?.cameraLevel) promptParts.push(customParams.cameraLevel)
        if (customParams?.lighting) promptParts.push(customParams.lighting)
        if (customParams?.filmLook) promptParts.push(customParams.filmLook)

        if (shot.actionPrompt && shot.actionPrompt.trim()) {
          promptParts.push(shot.actionPrompt.trim())
        }

        if (shot.dialogueText && shot.dialogueText.trim()) {
          const speaker = shot.dialogueSpeaker ? shot.dialogueSpeaker.trim() : 'Narrator (V.O.)'
          const isVO = /v\.?o\.?|off|narrad|voz en off/i.test(speaker)
          if (isVO) {
            promptParts.push(`voice-over narration (V.O.): [${speaker}]: "${shot.dialogueText.trim()}", dramatic pacing, atmospheric cinematic visual tone aligned with voiceover`)
          } else {
            promptParts.push(`character ${speaker} speaking dialogue: "${shot.dialogueText.trim()}", expressive lipsync motion, realistic mouth movement while talking`)
          }
        }

        if (charsInShot.length > 0) {
          const charDescs = charsInShot.map((c) => `${c.name} (${c.visualPrompt || ''})`).join(', ')
          promptParts.push(`featuring: ${charDescs}`)
        }

        if (state.visualStyle && state.visualStyle.trim()) {
          promptParts.push(`${state.visualStyle.trim()} style, consistent visual aesthetic`)
        }

        promptParts.push('cinematic video, high quality motion, realistic flow')
        promptParts.push('diegetic sound effects (SFX), foley ambience, natural speech, strictly no background music, no soundtrack, no musical score, no bgm')
        prompt = promptParts.join(', ')
      }

      // First Frame Handling
      let firstFrameBase64 = customParams?.firstFrameBase64
      let firstFrameAssetId = customParams?.firstFrameAssetId || (inputMode !== 't2v' ? shot.keyframeAssetId : undefined)
      let firstFrameUrl = customParams?.firstFrameUrl || (inputMode !== 't2v' ? shot.keyframeUrl : undefined)

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
        // Collect linked character portraits and prop images as references
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
      }

      // Gather audio reference from Storyboard if available
      let audioRefs: Array<{ assetId?: string; audioUrl?: string; base64?: string; mime?: string; name?: string }> = []
      if (shot.audioAssetId || shot.audioUrl) {
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

      const payload = buildVideoPayload(targetModel, prompt, {
        aspectRatio: state.aspectRatio,
        resolution: customParams?.resolution || state.videoResolution,
        duration: customParams?.duration || shot.estimatedDuration || state.videoDuration || 5,
        firstFrameAssetId: inputMode !== 't2v' ? firstFrameAssetId : undefined,
        firstFrameBase64: inputMode !== 't2v' ? firstFrameBase64 : undefined,
        firstFrameUrl: inputMode !== 't2v' ? firstFrameUrl : undefined,
        lastFrameAssetId: inputMode === 'fflf' ? lastFrameAssetId : undefined,
        lastFrameBase64: inputMode === 'fflf' ? lastFrameBase64 : undefined,
        audioAssetId: shot.audioAssetId,
        audioUrl: shot.audioUrl,
        audioBase64: audioRefs[0]?.base64,
        audioRefs: audioRefs.length > 0 ? audioRefs : undefined,
        sound: Boolean(shot.audioAssetId || shot.audioUrl),
      })

      // If reference mode and imageRefs exist, ensure they're assigned to payload
      if (inputMode === 'ref' && imageRefs.length > 0) {
        payload.imageRefs = imageRefs
      }

      const task = await dispatchGeneration(api, 'video', payload)
      const taskId = typeof task === 'string' ? task : (task?.taskId || task?.id)

      if (taskId) {
        get().updateShot(shotId, {
          videoTaskId: taskId,
          videoStatus: 'generating',
          videoProgress: 20,
          videoInputMode: inputMode,
        })
        await get().saveCurrentProject()
        get().pollVideoTask(shotId, taskId)
      } else {
        get().updateShot(shotId, { videoStatus: 'failed' })
      }
    } catch (err) {
      console.error('[DramaStore] Video gen failed:', err)
      get().updateShot(shotId, { videoStatus: 'failed' })
    }
  },

  generateAllVideos: async () => {
    const shots = get().shots
    for (const shot of shots) {
      await get().generateShotVideo(shot.id)
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
        dialogue: s.dialogueText,
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
    const state = get()
    if (state.isAutoRunning) return
    set({ isAutoRunning: true, autoRunStatus: 'Iniciando Pipeline...' })

    try {
      // 1. Script breakdown if empty
      if (state.shots.length === 0) {
        set({ autoRunStatus: '1/5 Generando Guión & Tomas...' })
        await get().generateScriptBreakdown()
      }

      // 2. Character & Scenario & Prop portraits
      set({ autoRunStatus: '2/5 Generando Retratos, Locaciones y Props...' })
      await get().generateAllCharacterImages()
      await get().generateAllScenarioImages()
      await get().generateAllPropImages()

      // 3. Storyboard Frames & Audio Synthesis
      set({ autoRunStatus: '3/5 Generando Storyboard (Frames & Diálogos)...' })
      await get().generateAllKeyframes()
      await get().generateAllVoices()

      // 4. Video Generation & LipSync Animation
      set({ autoRunStatus: '4/5 Animando Tomas a Video con LipSync (I2V)...' })
      await get().generateAllVideos()

      // 5. Assembly
      set({ autoRunStatus: '5/5 Ensamblando Pieza con FFmpeg...' })
      await get().assembleFinalEpisode()

      set({ isAutoRunning: false, autoRunStatus: '¡Pieza Audiovisual Completada con Éxito!' })
    } catch (err: any) {
      set({ isAutoRunning: false, autoRunStatus: `Detenido por error: ${err?.message}` })
    }
  },

  reset: () =>
    set({
      id: uid(),
      title: 'Microserie AI',
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
      script: '',
      logline: '',
      characters: [],
      scenarios: [],
      props: [],
      shots: [],
      finalVideo: {},
    }),
}))
