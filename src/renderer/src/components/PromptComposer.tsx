import { useState, useCallback, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, Settings2, X, Wand2, RotateCcw, ChevronDown, ChevronUp, Coins, Upload, Video, Image as ImageIcon, Plus, Music, AlertCircle, AlertTriangle, ArrowLeftRight, UserCircle, User, Mountain, Box, Check, Camera, Library, Maximize2, Minimize2, Shapes, Scale } from 'lucide-react'
import { StreamDuration } from './StreamDuration'
import { AiInfluencerControls, DEFAULT_AI_INFLUENCER_OPTS, type AiInfluencerOpts } from './AiInfluencerControls'
import { useElementsStore, type ElementKind, type StudioElement, KIND_CONFIG } from '../stores/elements-store'
import { useShortDramaStore } from '../stores/short-drama-store'
import { useAppStore } from '../stores/app-store'
import { RichPromptInput, type RichPromptInputHandle } from './RichPromptInput'
import { useWorkspaceStore } from '../stores/workspace-store'
import { AspectRatio, ASPECT_RATIOS } from './aspect-ratios'
import { ImageLibraryPicker } from './ImageLibraryPicker'
import {
  IMAGE_MODELS, VIDEO_MODELS, AUDIO_MODELS, PIXVERSE_T2V_PRICES, PIXVERSE_REF_PRICES,
  calcCost, calcVideoCost, type ModelPricing, cleanModelName, findModelById, SEEDANCE_DRAFT_RES,
} from '../lib/models'
import { useProvidersStore, isModelConfigured, PROVIDER_DEFS, hasAnyConfiguredProvider, type ProviderId } from '../stores/providers-store'
import { srcUrl } from '../services/file-url'
import { ViewportPopover } from './ui/ViewportPopover'
import { PriceBadge } from './models/PriceBadge'
import { PriceComparatorModal } from './models/PriceComparatorModal'
import { findPriceComparison } from '../lib/price-comparisons'
import {
  CameraControl,
  CAMERA_LENSES,
  CAMERA_SHOTS,
  CAMERA_LEVELS,
  CAMERA_MOVEMENTS,
  CAMERA_LIGHTING,
  CAMERA_FILM_LOOKS,
  CAMERA_SPEEDS,
  DEFAULT_CAMERA_STATE,
  type CameraOptionKey,
  stripCameraBlock,
  parseCameraBlock,
  formatCameraBlock,
} from './CameraControl'
import { SelectorOption } from './ui/SelectorOption'
import { ProviderLogo, getProviderForModel } from './icons/ProviderLogos'

const EMPTY_MODEL: ModelPricing = { name: '', category: '', unit: 'img', prices: [] }

export interface PromptComposerHandle {
  loadFromParams(params: {
    mode?: 'image' | 'video' | 'audio'
    prompt?: string
    model?: string
    upscaleEngine?: string
    aspectRatio?: string
    resolution?: string
    duration?: number
    fps?: number
    sound?: boolean
    instrumental?: boolean
    imageBase64?: string
    imageMime?: string
    imageAssetId?: string
    imageRefs?: { base64: string; mime: string; name?: string; refType?: string; assetId?: string }[]
    videoRefs?: { base64: string; mime: string; duration?: number; assetId?: string }[]
    audioRefs?: { base64: string; mime: string; assetId?: string }[]
    firstFrameBase64?: string
    firstFrameAssetId?: string
    lastFrameBase64?: string
    lastFrameAssetId?: string
    multiShots?: boolean
    multiPrompt?: { prompt: string; duration: number }[]
    provider?: ProviderId
    enhancePrompt?: boolean
    presetId?: string
    quality?: string
    moderation?: string
    influencer?: AiInfluencerOpts
    voice?: string
    voiceLanguage?: string
    draft?: boolean
  }): void
  addRefs(newRefs: { base64: string; mime: string; name?: string; refType?: string; duration?: number; assetId?: string }[]): void
  addAssets?(assets: any[]): Promise<void>
}

interface PromptComposerProps {
  onGenerate: (params: {
    mode?: 'image' | 'video' | 'audio'
    type?: 'image' | 'video' | 'audio'
    prompt: string
    model: string
    aspectRatio?: string
    resolution?: string
    batchSize?: number
    duration?: number
    fps?: number
    sound?: boolean
    instrumental?: boolean
    enhancePrompt?: boolean
    imageBase64?: string
    imageMime?: string
    imageRefs?: { base64: string; mime: string; name?: string; refType?: string }[]
    videoRefs?: { base64?: string; url?: string; localPath?: string; assetId?: string; mime: string; name?: string; duration?: number }[]
    audioRefs?: { base64: string; mime: string }[]
    firstFrameBase64?: string
    lastFrameBase64?: string
    firstFrameUrl?: string
    lastFrameUrl?: string
    multiShots?: boolean
    multiPrompt?: { prompt: string; duration: number }[]
    local?: boolean
    modelId?: string
    voiceId?: string
    engine?: string
    kind?: 'voice' | 'music'
    provider?: ProviderId
    presetId?: string
    quality?: string
    moderation?: string
    influencer?: AiInfluencerOpts
    voice?: string
    voiceLanguage?: string
    draft?: boolean
    /** Topaz upscale engine (MachGen); omitted = tier default */
    upscaleEngine?: string
  }) => void
  mode?: 'image' | 'video' | 'audio'
  onModeChange?: (mode: 'image' | 'video') => void
  subMode?: 'voice' | 'music'
  disabled?: boolean
  floating?: boolean
  embedded?: boolean
  iconOnlyGenerate?: boolean
  initialPrompt?: string
  onPromptChange?: (prompt: string) => void
  initialDuration?: number
  onDurationChange?: (duration: number) => void
  initialRefs?: Array<{ base64?: string; url?: string; localPath?: string; mime: string; name?: string; refType?: string; duration?: number; assetId?: string }>
  initialResolution?: string
  onResolutionChange?: (resolution: string) => void
  initialModel?: string
  onModelChange?: (model: string) => void
  initialAspectRatio?: string
  onAspectRatioChange?: (aspectRatio: string) => void
  initialFirstFrameBase64?: string
  initialFirstFrameUrl?: string
  initialLastFrameBase64?: string
  initialLastFrameUrl?: string
  initialSeedanceMode?: 'fflf' | 'ref'
  onMediaStateChange?: (state: {
    isFFLF: boolean
    firstFrameBase64: string | null
    firstFrameUrl?: string | null
    lastFrameBase64: string | null
    lastFrameUrl?: string | null
    refCount: number
    refs: Array<{ base64?: string; url?: string; localPath?: string; mime: string; name?: string; refType?: string; duration?: number; assetId?: string }>
  }) => void
  className?: string
}

export const PromptComposer = forwardRef<PromptComposerHandle, PromptComposerProps>(function PromptComposer({
  onGenerate,
  mode: propMode = 'image',
  onModeChange,
  subMode,
  disabled,
  floating,
  embedded,
  iconOnlyGenerate,
  initialPrompt,
  onPromptChange,
  initialDuration,
  onDurationChange,
  initialRefs,
  initialResolution,
  onResolutionChange,
  initialModel,
  onModelChange,
  initialAspectRatio,
  onAspectRatioChange,
  initialFirstFrameBase64,
  initialFirstFrameUrl,
  initialLastFrameBase64,
  initialLastFrameUrl,
  initialSeedanceMode,
  onMediaStateChange,
  className,
}, ref) {
  const instanceId = useRef(Math.random().toString(36).slice(2)).current
  const [internalMode, setInternalMode] = useState<'image' | 'video' | 'audio'>(propMode)

  useEffect(() => {
    setInternalMode(propMode)
  }, [propMode])

  const mode = internalMode
  const elements = useElementsStore((s) => s.elements)
  const loadElements = useElementsStore((s) => s.loadElements)
  useEffect(() => { loadElements() }, [loadElements])

  const dramaCharacters = useShortDramaStore((s) => s.characters)
  const dramaProps = useShortDramaStore((s) => s.props)
  const dramaScenarios = useShortDramaStore((s) => s.scenarios)

  const allElements = useMemo<StudioElement[]>(() => {
    const dramaList: StudioElement[] = [
      ...dramaCharacters.map((c) => ({
        id: `drama-char-${c.id}`,
        name: c.name,
        kind: 'character' as const,
        description: c.role || c.visualPrompt || 'Personaje de la serie',
        tags: ['character', 'personaje', 'drama'],
        imageBase64: c.imageBase64,
        imageUrl: c.imageUrl,
        imageAssetId: c.imageAssetId,
        visualPrompt: c.visualPrompt,
        createdAt: 0,
        updatedAt: 0,
      } as any)),
      ...dramaProps.map((p) => ({
        id: `drama-prop-${p.id}`,
        name: p.name,
        kind: 'object' as const,
        description: p.visualPrompt || 'Prop / Objeto clave',
        tags: ['prop', 'objeto', 'drama'],
        imageUrl: p.imageUrl,
        imageAssetId: p.imageAssetId,
        visualPrompt: p.visualPrompt,
        createdAt: 0,
        updatedAt: 0,
      } as any)),
      ...dramaScenarios.map((sc) => ({
        id: `drama-scn-${sc.id}`,
        name: sc.name,
        kind: 'environment' as const,
        description: sc.visualPrompt || 'Escenario / Locación',
        tags: ['scenario', 'escenario', 'locación', 'drama'],
        imageUrl: sc.imageUrl,
        imageAssetId: sc.imageAssetId,
        visualPrompt: sc.visualPrompt,
        createdAt: 0,
        updatedAt: 0,
      } as any)),
    ]

    const existingNames = new Set(elements.map((e) => e.name.toLowerCase().trim()))
    const uniqueDrama = dramaList.filter((e) => e.name && !existingNames.has(e.name.toLowerCase().trim()))
    return [...uniqueDrama, ...elements]
  }, [elements, dramaCharacters, dramaProps, dramaScenarios])
  const [prompt, setPrompt] = useState(initialPrompt || '')
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (initialPrompt !== undefined && initialPrompt !== prompt) {
      setPrompt(initialPrompt)
      richInputRef.current?.setText(initialPrompt)
    }
  }, [initialPrompt])

  const [modelName, setModelName] = useState(() => {
    if (initialModel) return initialModel
    const storageKey = `openfield-model-${mode}`
    const def = mode === 'video' ? 'Seedance 2 Fast' : mode === 'audio' ? 'ElevenLabs TTS' : 'GPT Image 2'
    try {
      const local = localStorage.getItem(storageKey)
      if (mode === 'video' && (!local || local === 'Kling 3.0')) return def
      return local || def
    } catch { return def }
  })
  useEffect(() => {
    try { localStorage.setItem(`openfield-model-${mode}`, modelName) } catch {}
  }, [modelName, mode])
  // Read by loadFromParams (a stable imperative handle) to prefer the current model on ties
  const modelNameRef = useRef(modelName)
  modelNameRef.current = modelName

  useEffect(() => {
    if (initialModel !== undefined && initialModel !== modelName) {
      setModelName(initialModel)
    }
  }, [initialModel])

  useEffect(() => {
    if (mode === 'audio' && subMode) {
      const filtered = AUDIO_MODELS.filter(m => m.kind === subMode)
      if (filtered.length > 0 && !filtered.find(m => m.name === modelName)) {
        setModelName(filtered[0].name)
      }
    }
  }, [subMode, mode, modelName])
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio || (mode === 'image' ? '1:1' : '16:9'))

  useEffect(() => {
    if (initialAspectRatio !== undefined && initialAspectRatio !== aspectRatio) {
      setAspectRatio(initialAspectRatio)
    }
  }, [initialAspectRatio])

  // Apply the active workspace's remembered environment (model / aspect ratio / resolution)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeId)
  useEffect(() => {
    const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === activeWorkspaceId)
    const cfg = ws?.config || {}
    const models = mode === 'video' ? VIDEO_MODELS : mode === 'audio' ? AUDIO_MODELS : IMAGE_MODELS
    const savedModel = cfg[`${mode}:model`]
    const savedAr = cfg[`${mode}:aspectRatio`]
    const savedRes = cfg[`${mode}:resolution`]
    if (!initialModel && savedModel && models.some((m) => m.name === savedModel)) setModelName(savedModel)
    if (!initialAspectRatio && savedAr) setAspectRatio(savedAr)
    if (!initialResolution && savedRes) setResolution(savedRes)
  }, [activeWorkspaceId, mode, initialModel, initialAspectRatio, initialResolution])

  // A model picked in the price comparator for the other mode: applied after the mode switch,
  // once the workspace environment above has restored that mode's saved model (declared after
  // it so it runs last).
  const pendingPickRef = useRef<{ name: string; resolution: string } | null>(null)
  useEffect(() => {
    const pick = pendingPickRef.current
    if (!pick) return
    pendingPickRef.current = null
    setModelName(pick.name)
    setResolution(pick.resolution)
  }, [mode])
  const defaultModel = (mode === 'video' ? VIDEO_MODELS : mode === 'audio' ? AUDIO_MODELS : IMAGE_MODELS).find(m => {
    const def = mode === 'video' ? 'Seedance 2 Fast' : mode === 'audio' ? 'ElevenLabs TTS' : 'GPT Image 2'
    return m.name === (modelName || def)
  })
  const [resolution, setResolution] = useState(initialResolution || defaultModel?.prices[0]?.resolution || '1K')
  const [duration, setDuration] = useState(initialDuration || 5)

  useEffect(() => {
    if (initialResolution !== undefined && initialResolution !== resolution) {
      setResolution(initialResolution)
    }
  }, [initialResolution])

  useEffect(() => {
    if (initialDuration !== undefined && initialDuration !== duration) {
      setDuration(initialDuration)
    }
  }, [initialDuration])

  const handleDurationChange = (d: number) => {
    setDuration(d)
    onDurationChange?.(d)
  }

  const switchMode = (newMode: 'image' | 'video') => {
    if (newMode === internalMode) return
    setInternalMode(newMode)
    onModeChange?.(newMode)

    const appPage = useAppStore.getState().currentPage
    if (newMode === 'video' && appPage === 'image') {
      useAppStore.getState().setPage('video')
    } else if (newMode === 'image' && appPage === 'video') {
      useAppStore.getState().setPage('image')
    }

    const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === activeWorkspaceId)
    const cfg = ws?.config || {}
    const savedModel = cfg[`${newMode}:model`]
    const models = newMode === 'video' ? VIDEO_MODELS : IMAGE_MODELS
    const storageKey = `openfield-model-${newMode}`
    const def = newMode === 'video' ? 'Seedance 2 Fast' : 'GPT Image 2'
    let nextModel = def
    if (savedModel && models.some((m) => m.name === savedModel)) {
      nextModel = savedModel
    } else {
      try {
        const local = localStorage.getItem(storageKey)
        if (local && local !== 'Kling 3.0' && models.some((m) => m.name === local)) nextModel = local
      } catch {}
    }
    setModelName(nextModel)
    onModelChange?.(nextModel)

    const savedAr = cfg[`${newMode}:aspectRatio`]
    if (savedAr) {
      setAspectRatio(savedAr)
      onAspectRatioChange?.(savedAr)
    } else if (newMode === 'video' && aspectRatio === '1:1') {
      setAspectRatio('16:9')
      onAspectRatioChange?.('16:9')
    } else if (newMode === 'image' && aspectRatio === '16:9') {
      setAspectRatio('1:1')
      onAspectRatioChange?.('1:1')
    }

    const chosenModel = models.find((m) => m.name === nextModel)
    const savedRes = cfg[`${newMode}:resolution`]
    if (savedRes) {
      setResolution(savedRes)
      onResolutionChange?.(savedRes)
    } else if (chosenModel) {
      const validRes = chosenModel.resolutions || chosenModel.prices.map((p) => p.resolution)
      if (validRes.length > 0 && !validRes.includes(resolution)) {
        const defaultRes = validRes.includes('720p') ? '720p' : validRes[0]
        setResolution(defaultRes)
        onResolutionChange?.(defaultRes)
      }
    }
  }

  const [fps, setFps] = useState(30)
  const [batchSize, setBatchSize] = useState(1)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageMime, setImageMime] = useState<string>('image/png')
  const [refs, setRefs] = useState<Array<{ base64?: string; url?: string; localPath?: string; mime: string; name?: string; refType?: string; duration?: number; assetId?: string }>>(() => initialRefs ? [...initialRefs] : [])

  // Reordering reference chips by drag. Tracked by object identity so live moves keep it;
  // the ref object is also its React key source (index keys would remount chips on each move).
  type RefItem = (typeof refs)[number]
  const draggedRefRef = useRef<RefItem | null>(null)
  const [draggedRef, setDraggedRef] = useState<RefItem | null>(null)
  const refKeysRef = useRef(new WeakMap<object, string>())
  const refKeySeqRef = useRef(0)
  const refKeyOf = (r: RefItem) => {
    let k = refKeysRef.current.get(r)
    if (!k) { k = `ref-${++refKeySeqRef.current}`; refKeysRef.current.set(r, k) }
    return k
  }
  // Moves the dragged ref next to `target` (same media kind only). The order of `refs` is what
  // numbers the chips (Image 1, @image_1, ...) and the order sent to the provider.
  const moveDraggedRef = (target: RefItem, after: boolean) => {
    const dragged = draggedRefRef.current
    if (!dragged || dragged === target || refKind(dragged.mime) !== refKind(target.mime)) return
    setRefs(prev => {
      const from = prev.indexOf(dragged)
      if (from < 0 || prev.indexOf(target) < 0) return prev
      const next = prev.slice()
      next.splice(from, 1)
      const to = next.indexOf(target) + (after ? 1 : 0)
      if (to === from) return prev
      next.splice(to, 0, dragged)
      return next
    })
  }

  const prevInitialRefsSigRef = useRef<string>(initialRefs ? JSON.stringify(initialRefs) : '')
  useEffect(() => {
    if (initialRefs !== undefined) {
      const sig = JSON.stringify(initialRefs)
      if (sig !== prevInitialRefsSigRef.current) {
        prevInitialRefsSigRef.current = sig
        setRefs(initialRefs ? [...initialRefs] : [])
      }
    }
  }, [initialRefs])

  const [firstFrameBase64, setFirstFrameBase64] = useState<string | null>(initialFirstFrameBase64 || null)
  const [firstFrameUrl, setFirstFrameUrl] = useState<string | null>(initialFirstFrameUrl || null)
  const [lastFrameBase64, setLastFrameBase64] = useState<string | null>(initialLastFrameBase64 || null)
  const [lastFrameUrl, setLastFrameUrl] = useState<string | null>(initialLastFrameUrl || null)
  const firstFrameRef = useRef<string | null>(initialFirstFrameBase64 || null)
  const lastFrameRef = useRef<string | null>(initialLastFrameBase64 || null)
  const [seedanceMode, setSeedanceMode] = useState<'fflf' | 'ref'>(() => {
    if (initialSeedanceMode) return initialSeedanceMode
    try {
      const saved = localStorage.getItem('openfield-seedance-mode')
      if (saved === 'fflf' || saved === 'ref') return saved
      return 'fflf'
    } catch {
      return 'fflf'
    }
  })
  // Higgsfield ref-capable video models: FF/LF is opt-in; references default to the ref endpoint.
  const [higgsfieldFfEnabled, setHiggsfieldFfEnabled] = useState(false)
  // Topaz (MachGen) upscale engine; '' = the tier default (no engine sent)
  const [upscaleEngine, setUpscaleEngine] = useState('')

  // Sync external URLs only when the parent deliberately changes them
  const prevFirstFrameUrlRef = useRef(initialFirstFrameUrl)
  useEffect(() => {
    if (initialFirstFrameUrl !== undefined && initialFirstFrameUrl !== prevFirstFrameUrlRef.current) {
      prevFirstFrameUrlRef.current = initialFirstFrameUrl
      setFirstFrameUrl(initialFirstFrameUrl || null)
    }
  }, [initialFirstFrameUrl])

  const prevLastFrameUrlRef = useRef(initialLastFrameUrl)
  useEffect(() => {
    if (initialLastFrameUrl !== undefined && initialLastFrameUrl !== prevLastFrameUrlRef.current) {
      prevLastFrameUrlRef.current = initialLastFrameUrl
      setLastFrameUrl(initialLastFrameUrl || null)
    }
  }, [initialLastFrameUrl])
  const [dragOver, setDragOver] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showModels, setShowModels] = useState(false)
  const [showPriceCompare, setShowPriceCompare] = useState(false)
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [modelProviderFilter, setModelProviderFilter] = useState<string>('all')
  const [showRatios, setShowRatios] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [showRes, setShowRes] = useState(false)
  const [showCostInfo, setShowCostInfo] = useState(false)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [cameraDisabled, setCameraDisabled] = useState<CameraOptionKey[]>(DEFAULT_CAMERA_STATE.disabled)
  const [cameraBody, setCameraBody] = useState(DEFAULT_CAMERA_STATE.camera)
  const [cameraLens, setCameraLens] = useState(CAMERA_LENSES[2])
  const [cameraShot, setCameraShot] = useState(CAMERA_SHOTS[3])
  const [cameraLevel, setCameraLevel] = useState(CAMERA_LEVELS[0])
  const [cameraMovement, setCameraMovement] = useState(CAMERA_MOVEMENTS[0])
  const [lighting, setLighting] = useState(DEFAULT_CAMERA_STATE.lighting)
  const [filmLook, setFilmLook] = useState(DEFAULT_CAMERA_STATE.filmLook)
  const [cameraSpeed, setCameraSpeed] = useState(DEFAULT_CAMERA_STATE.speed)
  const [multiShots, setMultiShots] = useState(false)

  // A [camera_control] block typed or pasted into the textarea is parsed into the camera state
  // and removed from the visible prompt — the block only lives in the stored prompt.
  useEffect(() => {
    if (!prompt.includes('[camera_control]')) return
    const parsed = parseCameraBlock(prompt)
    if (parsed.enabled) {
      setCameraEnabled(true)
      setCameraDisabled(parsed.disabled)
      if (parsed.camera) setCameraBody(parsed.camera)
      if (parsed.lens) setCameraLens(parsed.lens)
      if (parsed.shot) setCameraShot(parsed.shot)
      if (parsed.level) setCameraLevel(parsed.level)
      if (parsed.movement) setCameraMovement(parsed.movement)
      if (parsed.lighting) setLighting(parsed.lighting)
      if (parsed.filmLook) setFilmLook(parsed.filmLook)
      if (parsed.speed) setCameraSpeed(parsed.speed)
    }
    setPrompt(stripCameraBlock(prompt))
  }, [prompt])
  const [multiPrompt, setMultiPrompt] = useState<{ prompt: string; duration: number }[]>([])
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [instrumental, setInstrumental] = useState(false)
  const [imageRefEntries, setImageRefEntries] = useState<{ name: string; type: 'subject' | 'background'; base64?: string; mime?: string }[]>([])
  const [replicateVoice, setReplicateVoice] = useState('Zephyr (Female)')
  const [replicateLanguage, setReplicateLanguage] = useState('English (US)')
  const [pVideoFps, setPVideoFps] = useState(24)
  const [pVideoDraft, setPVideoDraft] = useState(false)
  const [machgenEnhancePrompt, setMachgenEnhancePrompt] = useState(true)
  const [msPresetId, setMsPresetId] = useState<string>('')
  const [influencerOpts, setInfluencerOpts] = useState<AiInfluencerOpts>(DEFAULT_AI_INFLUENCER_OPTS)
  const [msEnhancePrompt, setMsEnhancePrompt] = useState<boolean>(true)
  const [msQuality, setMsQuality] = useState<'low' | 'medium' | 'high'>('high')
  const [msModeration, setMsModeration] = useState<'auto' | 'low'>('auto')
  const [msPresetsList, setMsPresetsList] = useState<{ id: string; name: string; type: string }[]>([])
  const [msLoadingPresets, setMsLoadingPresets] = useState<boolean>(false)
  const [msPresetsLoaded, setMsPresetsLoaded] = useState<boolean>(false)
  const [showMsPresets, setShowMsPresets] = useState<boolean>(false)
  const msPresetsRef = useRef<HTMLDivElement>(null)
  const [showRefsModal, setShowRefsModal] = useState(false)
  const [showAtMenu, setShowAtMenu] = useState(false)
  const [atMenuFilter, setAtMenuFilter] = useState('')
  const [atMenuIndex, setAtMenuIndex] = useState(0)
  const [atMenuFromElements, setAtMenuFromElements] = useState(false)
  const [showInsertMenu, setShowInsertMenu] = useState(false)
  const [showInsertLibrary, setShowInsertLibrary] = useState(false)
  const insertRef = useRef<HTMLDivElement>(null)
  const insertFileRef = useRef<HTMLInputElement>(null)
  const [badgePopover, setBadgePopover] = useState<{ elementName: string; rect: DOMRect } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const configuredProviders = useProvidersStore((s) => s.configuredProviders)

  useEffect(() => { firstFrameRef.current = firstFrameBase64 }, [firstFrameBase64])
  useEffect(() => { lastFrameRef.current = lastFrameBase64 }, [lastFrameBase64])

  const atMenuRef = useRef<HTMLDivElement>(null)
  const richInputRef = useRef<RichPromptInputHandle>(null)

  useEffect(() => {
    if (!showAtMenu || !atMenuRef.current) return
    const btn = atMenuRef.current.children[atMenuIndex] as HTMLElement | undefined
    btn?.scrollIntoView({ block: 'nearest' })
  }, [showAtMenu, atMenuIndex])

  const removedElementRefs = useRef<Set<string>>(new Set())

  // Sync element images into refs when @element badges are in the prompt
  useEffect(() => {
    const tags = [...new Set(prompt.match(/@element:([^\u200B]+)\u200B/g) || [])]
    const wanted: { base64?: string; url?: string; assetId?: string; name: string; refType: string }[] = []
    for (const tag of tags) {
      const elName = tag.replace('@element:', '').replace('\u200B', '').trim()
      const el = allElements.find(e => e.name.toLowerCase() === elName.toLowerCase())
      if (!el) continue
      const elAny = el as any
      const refType = el.kind === 'character' ? 'character' : el.kind === 'object' ? 'prop' : el.kind === 'environment' ? 'scenario' : 'Primary'
      if (el.imageBase64 && !removedElementRefs.current.has(el.imageBase64)) {
        wanted.push({ base64: el.imageBase64, name: el.name, refType })
      }
      if (elAny.imageUrl && !removedElementRefs.current.has(elAny.imageUrl)) {
        wanted.push({ url: elAny.imageUrl, assetId: elAny.imageAssetId, name: el.name, refType })
      }
      if (el.poseRef && !removedElementRefs.current.has(el.poseRef)) {
        wanted.push({ base64: el.poseRef, name: el.name, refType: 'Pose' })
      }
      for (let i = 0; i < (el.referenceImages || []).length; i++) {
        const refImg = el.referenceImages[i]
        if (refImg && !removedElementRefs.current.has(refImg)) {
          wanted.push({ base64: refImg, name: el.name, refType: `Mood ${i + 1}` })
        }
      }
    }

    // Clean up removedElementRefs for elements no longer in prompt
    const activeKeys = new Set(wanted.map(w => w.base64 || w.url || w.assetId).filter(Boolean))
    for (const key of removedElementRefs.current) {
      if (!activeKeys.has(key)) removedElementRefs.current.delete(key)
    }

    const badgedNames = new Set(tags.map(t => t.replace('@element:', '').replace('\u200B', '').trim().toLowerCase()))

    setRefs(prev => {
      const nonElement = prev.filter(r => !(r as any).elementName)
      const existing = prev.filter(r => (r as any).elementName)
      const existingKeys = new Set(existing.map(r => r.base64 || r.url || (r as any).assetId).filter(Boolean))

      let addedCount = 0
      for (const w of wanted) {
        const key = w.base64 || w.url || w.assetId
        if (key && !existingKeys.has(key)) {
          existing.push({
            base64: w.base64 || '',
            url: w.url,
            assetId: w.assetId,
            mime: 'image/png',
            name: w.name,
            elementName: w.name,
            refType: w.refType,
          } as any)
          existingKeys.add(key)
          addedCount++
        }
      }

      const keptElements = existing.filter(e => {
        const key = e.base64 || e.url || (e as any).assetId
        const elNameLower = ((e as any).elementName || '').toLowerCase()
        const keep = (key && activeKeys.has(key))
          || !badgedNames.has(elNameLower)
          || String((e as any).refType || '').startsWith('Mood')
        return keep && (!key || !removedElementRefs.current.has(key))
      })

      if (addedCount === 0 && keptElements.length === existing.length) {
        return prev
      }

      return [...nonElement, ...keptElements]
    })
  }, [prompt, allElements])
  const modelsRef = useRef<HTMLDivElement>(null)
  const ratiosRef = useRef<HTMLDivElement>(null)
  const resRef = useRef<HTMLDivElement>(null)
  const attachRef = useRef<HTMLDivElement>(null)
  const costRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const composerRootRef = useRef<HTMLDivElement>(null)
  const [isDragOverCard, setIsDragOverCard] = useState(false)
  const cardDragCounterRef = useRef(0)
  const dragCounterRef = useRef(0)
  const processDropRef = useRef<(file: File) => Promise<void>>(async () => {})

  useEffect(() => {
    if (errorMessage) {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      errorTimerRef.current = setTimeout(() => setErrorMessage(null), 4000)
    }
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    }
  }, [errorMessage])



  const showError = (msg: string) => setErrorMessage(msg)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modelsRef.current && !modelsRef.current.contains(e.target as Node)) setShowModels(false)
      if (ratiosRef.current && !ratiosRef.current.contains(e.target as Node)) setShowRatios(false)
      if (resRef.current && !resRef.current.contains(e.target as Node)) setShowRes(false)
      if (attachRef.current && !attachRef.current.contains(e.target as Node)) setShowAttach(false)
      if (costRef.current && !costRef.current.contains(e.target as Node)) setShowCostInfo(false)
      if (insertRef.current && !insertRef.current.contains(e.target as Node)) setShowInsertMenu(false)
      if (msPresetsRef.current && !msPresetsRef.current.contains(e.target as Node)) setShowMsPresets(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    const inLibraryDropzone = (e: DragEvent) => {
      const t = e.target as HTMLElement | null
      return !!t?.closest?.('[data-library-dropzone]')
    }
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault()
      if (inLibraryDropzone(e)) return
      const hasFiles = e.dataTransfer?.types?.includes('Files')
      const hasAudio = e.dataTransfer?.types?.some((t: string) => t.startsWith('audio/'))
      if (hasFiles || hasAudio) {
        dragCounterRef.current++
        setDragOver(true)
      }
    }
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault()
      dragCounterRef.current--
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0
        setDragOver(false)
      }
    }
    const onDragOver = (e: DragEvent) => { e.preventDefault() }
    const onDrop = async (e: DragEvent) => {
      e.preventDefault()
      if (inLibraryDropzone(e)) return
      dragCounterRef.current = 0
      setDragOver(false)
      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return
      const api = (window as any).electronAPI
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        // Persist external files to the Library (workspace-scoped) so they can
        // be reused as references later, then attach them to the composer.
        try {
          const { base64, mime } = await readFileAsBase64(file)
          await api?.assets.importBase64(base64, mime || 'application/octet-stream', file.name, undefined, 'import')
        } catch { /* keep composer-only fallback */ }
        await processDropRef.current(file)
      }
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
      dragCounterRef.current = 0
      setDragOver(false)
    }
  }, [])

  // Paste images from the clipboard as references (only when pasting inside the composer)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as Node | null
      if (target && composerRootRef.current && !composerRootRef.current.contains(target)) return
      const items = e.clipboardData?.items
      if (!items) return
      const imageItem = Array.from(items).find(it => it.type.startsWith('image/'))
      if (!imageItem) return
      const file = imageItem.getAsFile()
      if (!file) return
      e.preventDefault()
      processDropRef.current(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const hasAnyProvider = useMemo(() => hasAnyConfiguredProvider(configuredProviders), [configuredProviders])

  // Compute available modalities among currently active providers
  const availableModes = useMemo(() => {
    const modes: ('image' | 'video' | 'audio')[] = []
    if (IMAGE_MODELS.some(m => isModelConfigured(m, configuredProviders))) modes.push('image')
    if (VIDEO_MODELS.some(m => isModelConfigured(m, configuredProviders))) modes.push('video')
    if (AUDIO_MODELS.some(m => isModelConfigured(m, configuredProviders))) modes.push('audio')
    return modes
  }, [configuredProviders])

  const models = (mode === 'video' ? VIDEO_MODELS : mode === 'audio' ? AUDIO_MODELS : IMAGE_MODELS)
    .filter(m => mode === 'audio' && subMode ? m.kind === subMode : true)
    .filter(m => isModelConfigured(m, configuredProviders))

  const modelProviderPills = useMemo(() => {
    const pills: { id: string; label: string; count: number }[] = [
      { id: 'all', label: 'Todos', count: models.length }
    ]
    for (const p of PROVIDER_DEFS) {
      const count = models.filter((m) => (m.provider || 'kie') === p.id).length
      if (count > 0) {
        pills.push({ id: p.id, label: p.label, count })
      }
    }
    const known = new Set(pills.map((p) => p.id))
    for (const m of models) {
      const pid = m.provider || 'kie'
      if (!known.has(pid)) {
        const count = models.filter((item) => (item.provider || 'kie') === pid).length
        pills.push({ id: pid, label: pid.charAt(0).toUpperCase() + pid.slice(1), count })
        known.add(pid)
      }
    }
    return pills
  }, [models])

  useEffect(() => {
    if (modelProviderFilter !== 'all' && !modelProviderPills.some((p) => p.id === modelProviderFilter)) {
      setModelProviderFilter('all')
    }
  }, [modelProviderPills, modelProviderFilter])

  // If the current mode has 0 configured models, but another modality is available,
  // automatically adapt to an available mode!
  useEffect(() => {
    if (hasAnyProvider && models.length === 0 && availableModes.length > 0) {
      if (!availableModes.includes(internalMode)) {
        const nextMode = availableModes[0]
        setInternalMode(nextMode)
        onModeChange?.(nextMode as any)
      }
    }
  }, [hasAnyProvider, models.length, availableModes, internalMode, onModeChange])

  // When models list has items, automatically select the first valid model if current modelName is unconfigured
  useEffect(() => {
    if (models.length > 0 && !models.some(m => m.name === modelName)) {
      setModelName(models[0].name)
      onModelChange?.(models[0].name)
    }
  }, [models, modelName, onModeChange])

  // Fall back to an empty model so every derived value stays null-safe;
  // the UI shows the "no provider" notice only if zero providers are configured.
  const hasModel = models.length > 0
  const currentModel = hasModel ? (models.find(m => m.name === modelName) || models[0]!) : EMPTY_MODEL
  const currentModelRef = useRef(currentModel)
  currentModelRef.current = currentModel

  useEffect(() => {
    if (mode === 'audio' && currentModel?.durationOptions && !currentModel.durationOptions.includes(String(duration))) {
      setDuration(Number(currentModel.durationOptions[0]))
    }
  }, [currentModel?.name, mode, currentModel?.durationOptions])

  const hasImageRef = refs.some(r => r.mime.startsWith('image/'))
  const hasVideoRef = refs.some(r => r.mime.startsWith('video/'))
  const hasImageSupport = !!(currentModel.i2iId || currentModel.editId || currentModel.i2vId || currentModel.fflfId || currentModel.t2vId?.includes('genjutsu/motion-transfer'))
  const isKling = !!(currentModel.t2vId?.startsWith('kling') || currentModel.i2vId?.startsWith('kling'))
  const isKling30 = !!(currentModel.t2vId?.startsWith('kling-3') || currentModel.i2vId?.startsWith('kling-3') || currentModel.t2vId?.includes('kling-video/v3'))
  const isHiggsfield = currentModel.provider === 'higgsfield'
  const isMarketplace = isHiggsfield && (
    currentModel.t2iId?.includes('marketplace') ||
    currentModel.name?.toLowerCase().includes('marketplace')
  )
  const isGraphicAds = isHiggsfield && (
    currentModel.t2iId?.includes('graphic-ads') ||
    currentModel.name?.toLowerCase().includes('graphic ads')
  )
  const isMarketingStudio = isHiggsfield && (
    currentModel.t2iId?.includes('marketing-studio') ||
    currentModel.modelId?.includes('marketing-studio') ||
    isGraphicAds ||
    isMarketplace
  )
  // AI Influencer: fixed 2K 16:9 character sheet driven by a trait catalog (prompt = brief)
  const isAiInfluencer = isHiggsfield && currentModel.t2iId === 'higgsfield/ai-influencer'
  // Genjutsu Motion Transfer: one source video + 1–8 image refs; length and cost follow the video
  const isMotionTransfer = isHiggsfield && !!currentModel.t2vId?.includes('genjutsu/motion-transfer')

  useEffect(() => {
    if (isMarketplace) {
      setMsPresetId('f188a40a-098a-5fb3-bffc-eedfeaf9ecd7')
    } else if (isGraphicAds) {
      setMsPresetId('ef84af61-57cd-5f2e-b3ca-209d8038563c')
    }
  }, [currentModel.name, isMarketplace, isGraphicAds])

  useEffect(() => {
    if (isMarketingStudio && !msPresetsLoaded && !msLoadingPresets) {
      setMsLoadingPresets(true)
      const api = (window as any).electronAPI
      if (api?.higgsfield?.presets) {
        api.higgsfield.presets()
          .then((res: any) => {
            if (res?.items && Array.isArray(res.items)) {
              setMsPresetsList(res.items)
              if (!msPresetId && res.items.length > 0) {
                setMsPresetId(res.items[0].id)
              }
            }
          })
          .catch((err: any) => {
            console.warn('Failed to load Marketing Studio presets:', err)
          })
          .finally(() => {
            setMsLoadingPresets(false)
            setMsPresetsLoaded(true)
          })
      } else {
        setMsLoadingPresets(false)
      }
    }
  }, [isMarketingStudio, msPresetsLoaded, msLoadingPresets, msPresetId])
  const isSeedance = !!(currentModel.t2vId?.startsWith('bytedance/') || currentModel.i2vId?.startsWith('bytedance/')) && !isHiggsfield
  const isPixverseV6 = !!(currentModel.t2vId?.startsWith('pixverse-v6/') || currentModel.i2vId?.startsWith('pixverse-v6/') || currentModel.fflfId?.startsWith('pixverse-v6/'))
  const isGrok = !!(currentModel.t2vId?.startsWith('grok-imagine/') || currentModel.i2vId?.startsWith('grok-imagine/')) || currentModel.extendId?.startsWith('grok-imagine/')
  const isMinimaxH3 = !!(currentModel.t2vId?.startsWith('minimax-h3/') || currentModel.i2vId?.startsWith('minimax-h3/'))
  // Higgsfield video models with both image-to-video and reference-to-video (Seedance 2.0/2.5,
  // Wan 3.0/Prime, MiniMax H3): attached images are references; the FF toggle opts into I2V.
  const isHiggsfieldRefVideo = isHiggsfield && mode === 'video' && !!currentModel.i2vId && !!currentModel.refId
  const isWan3 = !!(currentModel.t2vId?.startsWith('wan/3-0') || currentModel.i2vId?.startsWith('wan/3-0'))

  // Models with refTags support prompt tags that reference attached files. The tag is always
  // rendered as a chip in the textarea, but the payload receives the plain token text
  // (e.g. Seedance @image_1, GPT Image 2 "Image 1").
  const refTagCfg = currentModel.refTags
  const isTagModel = !!refTagCfg

  const tagTemplates = useMemo(() => {
    if (!refTagCfg) return []
    return [refTagCfg.image, refTagCfg.video, refTagCfg.audio].filter(Boolean) as string[]
  }, [refTagCfg])

  // Ordered tags for every attached ref: @image_1, @image_2, @video_1, @audio_1, ...
  const tagRefItems = useMemo(() => {
    if (!refTagCfg) return []
    let img = 0
    let vid = 0
    let aud = 0
    return refs.map(r => {
      let tag: string | null = null
      if (r.mime.startsWith('image/') && refTagCfg.image) { img++; tag = refTagCfg.image.replace('%d', String(img)) }
      else if (r.mime.startsWith('video/') && refTagCfg.video) { vid++; tag = refTagCfg.video.replace('%d', String(vid)) }
      else if (r.mime.startsWith('audio/') && refTagCfg.audio) { aud++; tag = refTagCfg.audio.replace('%d', String(aud)) }
      return { ref: r, tag }
    })
  }, [refs, refTagCfg])

  const refMenuItems = useMemo(() => {
    if (!isTagModel) return []
    const q = atMenuFilter.toLowerCase()
    return tagRefItems.filter(it => it.tag && (q === '' || it.tag.toLowerCase().includes(q)))
  }, [isTagModel, tagRefItems, atMenuFilter])

  const elMenuItems = useMemo(() => {
    const q = atMenuFilter.toLowerCase().trim()
    return allElements.filter(el =>
      el.name.toLowerCase().includes(q) ||
      el.tags.some(t => t.toLowerCase().includes(q)) ||
      (el.description && el.description.toLowerCase().includes(q))
    ).slice(0, 10)
  }, [allElements, atMenuFilter])

  const attachElementImages = useCallback((el: StudioElement) => {
    const elAny = el as any
    const imgs: { base64?: string; url?: string; assetId?: string; label: string }[] = []
    if (el.imageBase64) imgs.push({ base64: el.imageBase64, label: 'Primary' })
    if (elAny.imageUrl) imgs.push({ url: elAny.imageUrl, assetId: elAny.imageAssetId, label: 'Primary' })
    if (el.poseRef) imgs.push({ base64: el.poseRef, label: 'Pose' })
    for (let i = 0; i < (el.referenceImages || []).length; i++) {
      if (el.referenceImages[i]) imgs.push({ base64: el.referenceImages[i], label: `Mood ${i + 1}` })
    }
    setRefs(prev => {
      const existing = new Set(prev.map(r => r.base64 || r.url || r.assetId))
      const added: any[] = []
      for (const img of imgs) {
        const key = img.base64 || img.url || img.assetId
        if (!key || existing.has(key)) continue
        existing.add(key)
        added.push({
          base64: img.base64 || '',
          url: img.url,
          assetId: img.assetId,
          mime: 'image/png',
          name: el.name,
          elementName: el.name,
          refType: img.label === 'Primary' ? (el.kind === 'character' ? 'character' : el.kind === 'object' ? 'prop' : 'scenario') : img.label,
        })
      }
      return added.length > 0 ? [...prev, ...added] : prev
    })
  }, [])

  function getActiveModelId(): string {
    if (mode === 'audio') return currentModel.t2aId || currentModel.modelId || ''
    if (mode === 'image') {
      const hasImage = !!(imageBase64 || hasImageRef || imageRefEntries.some(e => e.base64))
      if (hasImage && currentModel.editId) return currentModel.editId
      if (hasImage && currentModel.i2iId) return currentModel.i2iId
      return currentModel.t2iId || currentModel.modelId || currentModel.name || ''
    }
    if (isPixverseV6) {
      // Single PixVerse V6 model: route by input. FF/LF wins, then image refs, else text-to-video.
      if (firstFrameBase64 || lastFrameBase64) return 'pixverse-v6/image-to-video'
      if (imageBase64 || hasImageRef || imageRefEntries.some(e => e.base64)) return 'pixverse-v6/reference-to-video'
      return 'pixverse-v6/text-to-video'
    }
    if (isMinimaxH3 || isHiggsfieldRefVideo) {
      // Single MiniMax H3 model: route by input. FF/LF wins, then video/audio refs, then images, else text-to-video.
      const hasImages = imageBase64 || hasImageRef || imageRefEntries.some(e => e.base64)
      if (firstFrameBase64 || lastFrameBase64) return currentModel.fflfId || currentModel.i2vId || ''
      if (hasVideoRef || refs.some(r => r.mime.startsWith('audio/'))) return currentModel.refId || ''
      if (hasImages) return currentModel.refId || ''
      return currentModel.t2vId || ''
    }
    if (isMachgen) {
      const hasImages = !!(imageBase64 || hasImageRef || imageRefEntries.some(e => e.base64))
      const hasAudio = refs.some(r => r.mime.startsWith('audio/'))

      // MiniMax-H3 (MachGen)
      if (currentModel.t2vId?.includes('MiniMax-H3')) {
        if (firstFrameBase64 || lastFrameBase64) return currentModel.fflfId || currentModel.i2vId || ''
        if (hasVideoRef || hasAudio) return currentModel.refId || ''
        if (hasImages) {
          const imgCount = (imageBase64 ? 1 : 0) + refs.filter(r => r.mime.startsWith('image/')).length + imageRefEntries.filter(e => e.base64).length
          return imgCount > 1 ? (currentModel.refId || currentModel.i2vId || '') : (currentModel.i2vId || '')
        }
        return currentModel.t2vId || ''
      }

      // LTX-2.3-Pro (MachGen)
      if (currentModel.t2vId?.includes('LTX-2.3-Pro')) {
        if (firstFrameBase64 || lastFrameBase64) return currentModel.fflfId || currentModel.i2vId || ''
        if (hasImages) return currentModel.i2vId || ''
        return currentModel.t2vId || ''
      }

      // Wan2.2-A14B (MachGen)
      if (currentModel.t2vId?.includes('Wan2.2-A14B')) {
        if (hasImages || firstFrameBase64) return currentModel.i2vId || ''
        return currentModel.t2vId || ''
      }

      // General MachGen video models (Vidu, Seedance, Kling, etc.)
      if (firstFrameBase64 || lastFrameBase64) {
        return currentModel.fflfId || currentModel.i2vId || currentModel.t2vId || ''
      }
      if (hasVideoRef || (hasAudio && currentModel.refId)) {
        return currentModel.refId || currentModel.i2vId || currentModel.t2vId || ''
      }
      if (hasImages) {
        const imgCount = (imageBase64 ? 1 : 0) + refs.filter(r => r.mime.startsWith('image/')).length + imageRefEntries.filter(e => e.base64).length
        if (imgCount > 1 && currentModel.refId) {
          return currentModel.refId
        }
        return currentModel.i2vId || currentModel.refId || currentModel.t2vId || ''
      }

      return currentModel.t2vId || ''
    }
    if (isGrok) {
      // Single Grok Imagine model: route by attachments. Video → extend, image → image-to-video, else text-to-video.
      if (hasVideoRef) return currentModel.extendId || ''
      if (imageBase64 || hasImageRef || imageRefEntries.some(e => e.base64)) return currentModel.i2vId || ''
      return currentModel.t2vId || ''
    }
    if (imageBase64 && currentModel.i2vId) return currentModel.i2vId
    if ((firstFrameBase64 || lastFrameBase64) && (currentModel.fflfId || isKling)) return currentModel.fflfId || (imageBase64 ? (currentModel.i2vId || '') : (currentModel.t2vId || ''))
    return currentModel.t2vId || ''
  }
  const isFFLF = Boolean(((currentModel.fflfId || isKling || (mode === 'video' && !isHiggsfield)) && seedanceMode === 'fflf') || (isHiggsfieldRefVideo && higgsfieldFfEnabled))
  const isFFLFRef = useRef(isFFLF)
  isFFLFRef.current = isFFLF

  const onMediaStateChangeRef = useRef(onMediaStateChange)
  onMediaStateChangeRef.current = onMediaStateChange
  const lastEmittedMediaSignatureRef = useRef<string>('')

  useEffect(() => {
    if (!onMediaStateChangeRef.current) return

    const signature = JSON.stringify({
      isFFLF,
      hasFFB64: !!firstFrameBase64,
      firstFrameUrl: firstFrameUrl || null,
      hasLFB64: !!lastFrameBase64,
      lastFrameUrl: lastFrameUrl || null,
      refCount: refs.length,
      refKeys: refs.map((r) => r.url || r.assetId || (r.base64 ? r.base64.slice(0, 32) : '')),
    })

    if (signature === lastEmittedMediaSignatureRef.current) {
      return
    }
    lastEmittedMediaSignatureRef.current = signature

    onMediaStateChangeRef.current({
      isFFLF,
      firstFrameBase64,
      firstFrameUrl,
      lastFrameBase64,
      lastFrameUrl,
      refCount: refs.length,
      refs,
    })
  }, [isFFLF, firstFrameBase64, firstFrameUrl, lastFrameBase64, lastFrameUrl, refs])

  const isRefMode = (!!(currentModel.fflfId) && seedanceMode === 'ref') || currentModel.provider === 'fal' || (currentModel.provider === 'machgen' && seedanceMode === 'ref')
  const isOmniHuman = currentModel.t2vId === 'omnihuman-1-5'
  const isReplicate = currentModel.provider === 'replicate'
  const isPVideo = currentModel.t2vId === 'prunaai/p-video'
  const isReplicateAvatar = currentModel.t2vId === 'prunaai/p-video-avatar'
  const hasReplicateAudio = isReplicate && refs.some(r => r.mime.startsWith('audio/'))
  const isFal = currentModel.provider === 'fal'
  const isMachgen = currentModel.provider === 'machgen'
  const isMachgenSeedance25 = isMachgen && mode === 'video' && !!currentModel.t2vId?.startsWith('machgen/Seedance-2.5/')
  // Topaz upscalers (MachGen): only the source media and the engine matter. Aspect ratio, enhance,
  // FF, sound and camera do not apply; video ones also take no resolution (output height is fixed)
  const isTopaz = isMachgen && currentModel.category === 'Topaz'
  const isTopazVideo = isTopaz && mode === 'video'

  // Models with a video-reference limit (Topaz upscalers take one source video): keep the newest
  useEffect(() => {
    const max = currentModel.maxVideoRefs
    if (!max) return
    const videos = refs.filter(r => r.mime.startsWith('video/'))
    if (videos.length <= max) return
    const keep = new Set(videos.slice(-max))
    setRefs(prev => prev.filter(r => !r.mime.startsWith('video/') || keep.has(r)))
    setErrorMessage(`${cleanModelName(currentModel.name)} acepta ${max === 1 ? 'un solo video' : `${max} videos`}: se usa el último que agregaste.`)
  }, [refs, currentModel.maxVideoRefs, currentModel.name])
  // "Draft 480p" in the resolution menu: a 480p sample; the 1080p final is generated later from the asset
  const isSeedanceDraftRes = isMachgenSeedance25 && resolution === SEEDANCE_DRAFT_RES
  const isMachgenWan = isMachgen && !!currentModel.t2vId?.includes('Wan2.2-A14B')
  // FPS selector only when the model really offers more than one frame rate
  const fpsChoices = currentModel.fpsOptions || []
  const hasFpsChoice = mode === 'video' && fpsChoices.length > 1

  // Reset Replicate voice/language when switching to a Replicate model
  useEffect(() => {
    if (isReplicate && currentModel.replicateVoices?.length && !currentModel.replicateVoices.includes(replicateVoice)) {
      setReplicateVoice(currentModel.replicateVoices[0])
    }
    if (isReplicate && currentModel.replicateLanguages?.length && !currentModel.replicateLanguages.includes(replicateLanguage)) {
      setReplicateLanguage(currentModel.replicateLanguages[0])
    }
  }, [currentModel?.name, replicateVoice, replicateLanguage])

  // Reset aspect ratio to a supported value when switching to P-Video
  useEffect(() => {
    if (isPVideo && currentModel.pvAspectRatios?.length && !currentModel.pvAspectRatios.includes(aspectRatio)) {
      setAspectRatio('16:9')
    }
  }, [isPVideo, aspectRatio, currentModel?.name])

  // Reset parameters when switching MachGen models
  useEffect(() => {
    if (isMachgen && currentModel.aspectRatios?.length && !currentModel.aspectRatios.includes(aspectRatio)) {
      setAspectRatio(currentModel.aspectRatios[0] || '16:9')
    }
  }, [isMachgen, currentModel.name, currentModel.aspectRatios, aspectRatio])

  useEffect(() => {
    if (isMachgen && currentModel.resolutions?.length && !currentModel.resolutions.includes(resolution)) {
      setResolution(currentModel.resolutions[0])
    }
  }, [isMachgen, currentModel.name, currentModel.resolutions, resolution])

  useEffect(() => {
    if (isMachgen && currentModel.durationOptions?.length && !currentModel.durationOptions.includes(String(duration))) {
      setDuration(Number(currentModel.durationOptions[0]) || 5)
    }
  }, [isMachgen, currentModel.name, currentModel.durationOptions, duration])

  useEffect(() => {
    if (currentModel.fpsOptions?.length) setFps(currentModel.fpsOptions[0])
    if (isMachgen) setSoundEnabled(true)
  }, [isMachgen, currentModel.name, currentModel.fpsOptions])

  // Reset parameters when switching Higgsfield models
  useEffect(() => {
    if (isHiggsfield && currentModel.aspectRatios?.length && !currentModel.aspectRatios.includes(aspectRatio)) {
      setAspectRatio(currentModel.aspectRatios[0] || '16:9')
    }
  }, [isHiggsfield, currentModel.name, currentModel.aspectRatios, aspectRatio])

  useEffect(() => {
    if (isHiggsfield && currentModel.resolutions?.length && !currentModel.resolutions.includes(resolution)) {
      setResolution(currentModel.resolutions[0] || '720p')
    }
  }, [isHiggsfield, currentModel.name, currentModel.resolutions, resolution])

  useEffect(() => {
    if (isHiggsfield && currentModel.durationOptions?.length && !currentModel.durationOptions.includes(String(duration))) {
      setDuration(Number(currentModel.durationOptions[0]) || 5)
    }
  }, [isHiggsfield, currentModel.name, currentModel.durationOptions, duration])

  useEffect(() => {
    if (isHiggsfield) {
      setFps(24)
    }
  }, [isHiggsfield, currentModel.name])

  // Multi-shot is only supported by Kling 3.0: disable it on any other model
  useEffect(() => {
    if (!isKling30) {
      setMultiShots(false)
      setMultiPrompt([])
    }
  }, [isKling30])

  // Persist seedanceMode to localStorage so FFLF toggle survives remounts
  useEffect(() => {
    try { localStorage.setItem('openfield-seedance-mode', seedanceMode) } catch {}
  }, [seedanceMode])

  useEffect(() => { lastFrameRef.current = lastFrameBase64 }, [lastFrameBase64])
  const effectiveResolution = (soundEnabled && isKling && !isHiggsfield && resolution !== '4k') ? resolution + '-audio' : (soundEnabled && isPixverseV6) ? resolution + '-audio' : resolution
  // PixVerse V6 routes to a single model: use the price table of the routed mode
  const activeModelId = getActiveModelId()
  const activePixversePrices = isPixverseV6 ? (activeModelId === 'pixverse-v6/reference-to-video' ? PIXVERSE_REF_PRICES : PIXVERSE_T2V_PRICES) : undefined
  const costModel = activePixversePrices ? { ...currentModel, prices: activePixversePrices } : currentModel
  // Single source of truth for cost (models + formulas live in lib/models):
  // unit price × resolved duration + model-specific surcharges (MiniMax H3 video input / images, etc.)
  const { perUnitCredits, totalCredits, perUnitDollars, totalDollars } = calcVideoCost(costModel, {
    resolution: effectiveResolution,
    aspectRatio,
    requestedSeconds: duration,
    audioRefSeconds: refs.find(r => r.mime.startsWith('audio/'))?.duration || 0,
    wordCount: prompt.trim().split(/\s+/).filter(Boolean).length,
    multiSceneSeconds: multiShots && isKling30 ? multiPrompt.map(x => x.duration) : undefined,
    imageCount: refs.filter(r => r.mime.startsWith('image/')).length,
    inputVideoSeconds: refs.filter(r => r.mime.startsWith('video/')).reduce((s, r) => s + (r.duration || 0), 0),
    batchSize,
  })

  // Grok Imagine i2v with a single image: the output ratio follows the image (API behavior),
  // so the aspect ratio selector is disabled.
  const grokImageCount = (imageBase64 ? 1 : 0) + refs.filter(r => r.mime.startsWith('image/')).length + imageRefEntries.filter(e => e.base64).length
  const grokSingleI2v = isGrok && grokImageCount === 1 && !hasVideoRef

  const hasAspectRatio = !embedded && !isTopaz && !isAiInfluencer && !isMotionTransfer && (
    mode === 'image' ||
    (mode === 'video' && (
      isMachgen ||
      isHiggsfield ||
      isWan3 ||
      isFal ||
      isPVideo ||
      isMinimaxH3 ||
      Boolean(currentModel.aspectRatios?.length) ||
      Boolean(currentModel.pvAspectRatios?.length) ||
      Boolean(currentModel.falAspectRatios?.length) ||
      Boolean(currentModel.t2vId?.includes('gemini-omni')) ||
      Boolean(currentModel.t2vId?.startsWith('bytedance/')) ||
      Boolean(currentModel.t2vId?.startsWith('pixverse-v6/')) ||
      Boolean(currentModel.i2vId?.startsWith('pixverse-v6/')) ||
      Boolean(currentModel.t2vId?.startsWith('grok-imagine/')) ||
      Boolean(currentModel.i2vId?.startsWith('grok-imagine/'))
    ))
  )

  const availableAspectRatios = useMemo(() => {
    if (mode === 'image') {
      return currentModel.aspectRatios || (isFal && currentModel.falAspectRatios ? currentModel.falAspectRatios : ASPECT_RATIOS)
    }
    if ((isMachgen || isHiggsfield) && currentModel.aspectRatios && currentModel.aspectRatios.length > 0) return currentModel.aspectRatios
    if (isWan3) return ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16']
    if (isPVideo) return currentModel.pvAspectRatios || ['16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '1:1']
    if (isFal) return currentModel.falAspectRatios || ['adaptive', '16:9']
    if (currentModel.t2vId?.startsWith('bytedance/')) return ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', 'adaptive']
    if (currentModel.t2vId?.startsWith('pixverse-v6/') || currentModel.i2vId?.startsWith('pixverse-v6/')) return ['1:1', '16:9', '21:9', '2:3', '3:2', '3:4', '4:3', '9:16']
    if (currentModel.t2vId?.startsWith('grok-imagine/') || currentModel.i2vId?.startsWith('grok-imagine/')) return ['16:9', '9:16', '1:1', '2:3', '3:2']
    if (isMinimaxH3) return ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']
    if (currentModel.aspectRatios && currentModel.aspectRatios.length > 0) return currentModel.aspectRatios
    return ['16:9', '9:16']
  }, [mode, currentModel, isMachgen, isHiggsfield, isWan3, isPVideo, isFal, isMinimaxH3])

  const availableResolutions = useMemo(() => {
    if (currentModel.resolutions && currentModel.resolutions.length > 0) {
      return currentModel.resolutions
    }
    if (currentModel.prices && currentModel.prices.length > 1) {
      return currentModel.prices.map((p) => p.resolution)
    }
    if (mode === 'image') {
      return ['1K', '2K']
    }
    return []
  }, [currentModel, mode])

  useEffect(() => {
    if (hasAspectRatio && availableAspectRatios.length > 0 && !availableAspectRatios.includes(aspectRatio)) {
      setAspectRatio(availableAspectRatios[0])
    }
  }, [hasAspectRatio, availableAspectRatios, aspectRatio])

  useEffect(() => {
    if (availableResolutions.length > 0 && !availableResolutions.includes(resolution)) {
      setResolution(availableResolutions.find(r => r !== SEEDANCE_DRAFT_RES) || availableResolutions[0])
    }
  }, [availableResolutions, resolution])

  const readFileAsBase64 = (file: File): Promise<{ base64: string; mime: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve({ base64: result.split(',')[1], mime: file.type })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const video = document.createElement('video')
      video.preload = 'metadata'
      const done = new Promise<number>((res) => {
        video.onloadedmetadata = () => {
          URL.revokeObjectURL(url)
          res(video.duration)
        }
        video.onerror = () => {
          URL.revokeObjectURL(url)
          res(0)
        }
      })
      const timeout = new Promise<number>((res) => setTimeout(() => { URL.revokeObjectURL(url); res(0) }, 10000))
      Promise.race([done, timeout]).then(resolve)
      video.src = url
    })
  }

  const getDataVideoDuration = (base64: string, mime: string): Promise<number> => {
    return new Promise((resolve) => {
      const url = `data:${mime};base64,${base64}`
      const video = document.createElement('video')
      video.preload = 'metadata'
      const done = new Promise<number>((res) => {
        video.onloadedmetadata = () => res(isFinite(video.duration) ? video.duration : 0)
        video.onerror = () => res(0)
      })
      const timeout = new Promise<number>((res) => setTimeout(() => res(0), 10000))
      Promise.race([done, timeout]).then(resolve)
      video.src = url
    })
  }

  const getSrcVideoDuration = (src: string): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      const done = new Promise<number>((res) => {
        video.onloadedmetadata = () => res(isFinite(video.duration) ? video.duration : 0)
        video.onerror = () => res(0)
      })
      const timeout = new Promise<number>((res) => setTimeout(() => res(0), 10000))
      Promise.race([done, timeout]).then(resolve)
      video.src = src
    })
  }

  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const audio = document.createElement('audio')
      audio.preload = 'metadata'
      const done = new Promise<number>((res) => {
        audio.onloadedmetadata = () => {
          URL.revokeObjectURL(url)
          res(isFinite(audio.duration) ? audio.duration : 0)
        }
        audio.onerror = () => {
          URL.revokeObjectURL(url)
          res(0)
        }
      })
      const timeout = new Promise<number>((res) => setTimeout(() => { URL.revokeObjectURL(url); res(0) }, 10000))
      Promise.race([done, timeout]).then(resolve)
      audio.src = url
    })
  }

  const addVideoRefData = (base64: string, mime: string, duration?: number) => {
    const videoRefs = refs.filter(r => r.mime.startsWith('video/'))
    const isSeedanceModel = currentModel.t2vId?.startsWith('bytedance/') || currentModel.i2vId?.startsWith('bytedance/')
    if (isSeedanceModel && videoRefs.length >= 3) { showError('Seedance supports up to 3 video references'); return }
    if (isSeedanceModel) {
      const totalDur = videoRefs.reduce((s, r) => s + (r.duration || 0), 0)
      if (duration && duration > 0 && totalDur + duration > 15) { showError('Total video reference duration exceeds 15 seconds'); return }
    }
    setRefs(prev => [...prev, { base64, mime, duration }])
  }

  const handleVideoRef = async (file: File) => {
    const MAX_VIDEO_SIZE = 50 * 1024 * 1024
    if (file.size > MAX_VIDEO_SIZE) { showError(`Video "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(0)}MB). Max 50MB.`); return }
    const { base64, mime } = await readFileAsBase64(file)
    const duration = await getVideoDuration(file)
    addVideoRefData(base64, mime, duration)
  }

  processDropRef.current = async (file: File) => {
    const MAX_SIZE = file.type.startsWith('video/') ? 50 * 1024 * 1024 : file.type.startsWith('audio/') ? 20 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > MAX_SIZE) { showError(`"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(0)}MB)`); return }
    const { base64, mime } = await readFileAsBase64(file)
    if (file.type.startsWith('image/')) {
      if (isFFLF) {
        if (!firstFrameRef.current) { setFirstFrameBase64(base64); firstFrameRef.current = base64 }
        else if (!lastFrameRef.current) { setLastFrameBase64(base64); lastFrameRef.current = base64 }
        else { setRefs(prev => [...prev, { base64, mime }]) }
      } else if (isRefMode || mode === 'image' || !!currentModel.refId || (isHiggsfieldRefVideo && !isFFLF)) {
        setRefs(prev => [...prev, { base64, mime }])
      } else if (hasImageSupport) {
        setImageBase64(base64); setImageMime(mime)
      } else {
        showError(`Cannot read "${file.name}" (this model does not support image input)`)
      }
    } else if (file.type.startsWith('video/') && currentModel.supportsVideoRef) {
      try { await handleVideoRef(file) } catch (err) { console.error('Failed to process video ref:', err); showError(`Cannot read "${file.name}"`) }
    } else if (file.type.startsWith('audio/')) {
      if (!currentModel.supportsAudioRef) {
        const audioModels = VIDEO_MODELS.filter(m => m.supportsAudioRef && isModelConfigured(m, configuredProviders))
        if (audioModels.length > 0) {
          if (mode !== 'video') switchMode('video')
          setModelName(audioModels[0].name)
        } else {
          showError(`Cannot read "${file.name}" (this model does not support this file type)`)
          return
        }
      }
      const isOmniHuman = currentModel.t2vId === 'omnihuman-1-5'
      if (isOmniHuman) {
        const allowedAudioTypes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/ogg', 'audio/mp4']
        if (!allowedAudioTypes.includes(file.type)) {
          showError(`Audio format not supported by OmniHuman: ${file.type}`)
          return
        }
        if (file.size > 10 * 1024 * 1024) {
          showError('Audio exceeds the 10MB limit of OmniHuman')
          return
        }
      }
      const audioDuration = await getAudioDuration(file)
      setRefs(prev => [...prev, { base64, mime, duration: audioDuration }])
    } else {
      showError(`Cannot read "${file.name}" (this model does not support this file type)`)
    }
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>, slot: 'main' | 'first' | 'last') => {
    const file = e.target.files?.[0]
    if (!file) return
    const { base64, mime } = await readFileAsBase64(file)
    if (slot === 'main') { setRefs(prev => [...prev, { base64, mime }]) }
    else if (slot === 'first') { setFirstFrameBase64(base64); setFirstFrameUrl(null); firstFrameRef.current = base64 }
    else if (slot === 'last') { setLastFrameBase64(base64); setLastFrameUrl(null); lastFrameRef.current = base64 }
    e.target.value = ''
  }

  const removeImage = (slot: 'main' | 'first' | 'last') => {
    if (slot === 'main') setImageBase64(null)
    else if (slot === 'first') { setFirstFrameBase64(null); setFirstFrameUrl(null); firstFrameRef.current = null }
    else { setLastFrameBase64(null); setLastFrameUrl(null); lastFrameRef.current = null }
  }

  const insertImageRef = (item: { base64?: string; url?: string; localPath?: string; mime: string; assetId?: string; name?: string; refType?: string }) => {
    if (isFFLF) {
      if (!firstFrameRef.current && !firstFrameUrl && !firstFrameBase64) {
        if (item.base64) {
          setFirstFrameBase64(item.base64)
          firstFrameRef.current = item.base64
        } else if (item.url) {
          setFirstFrameUrl(item.url)
        }
      } else if (!lastFrameRef.current && !lastFrameUrl && !lastFrameBase64) {
        if (item.base64) {
          setLastFrameBase64(item.base64)
          lastFrameRef.current = item.base64
        } else if (item.url) {
          setLastFrameUrl(item.url)
        }
      } else {
        setRefs(prev => [...prev, item])
      }
    } else {
      setRefs(prev => [...prev, item])
    }
  }

  const insertImage = (base64: string, mime: string) => {
    insertImageRef({ base64, mime })
  }

  const handleInsertUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { showError('Only images can be inserted for now'); e.target.value = ''; return }
    const MAX_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_SIZE) { showError(`"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(0)}MB). Max 10MB.`); e.target.value = ''; return }
    try {
      const { base64, mime } = await readFileAsBase64(file)
      insertImage(base64, mime)
    } catch (err: any) {
      showError(`Cannot read "${file.name}": ${err?.message || err}`)
    }
    e.target.value = ''
    setShowInsertMenu(false)
  }

  const handleInsertLibraryOpen = () => {
    setShowInsertMenu(false)
    setShowInsertLibrary(true)
  }

  const addAssetsAsRefs = async (assetOrAssets: any | any[]) => {
    const assets = Array.isArray(assetOrAssets) ? assetOrAssets : [assetOrAssets]
    if (assets.length === 0) return
    try {
      const api = (window as any).electronAPI
      const assetIds = assets.map((a: any) => (typeof a === 'string' ? a : a?.id)).filter(Boolean)
      const b64Map = new Map<string, { base64: string; mime: string; localPath?: string }>()
      if (assetIds.length > 0 && api?.assets?.readBase64) {
        try {
          const results = await api.assets.readBase64(assetIds)
          if (Array.isArray(results)) {
            for (const r of results) {
              if (r?.id && r?.base64) {
                b64Map.set(r.id, r)
              }
            }
          }
        } catch (readErr) {
          console.warn('[PromptComposer] readBase64 warning:', readErr)
        }
      }

      for (const item of assets) {
        const asset = typeof item === 'string' ? { id: item } : item
        const res = b64Map.get(asset.id)
        const b64 = res?.base64 || asset.base64
        const mime = res?.mime || asset?.mimeType || (asset?.type === 'video' ? 'video/mp4' : asset?.type === 'audio' ? 'audio/mpeg' : 'image/png')
        const url = asset.url || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : undefined)
        const localPath = asset.localPath || res?.localPath

        if (mime.startsWith('video/')) {
          if (mode === 'image') {
            switchMode('video')
          }
          if (!currentModel.supportsVideoRef) {
            showError('This model does not support video references')
            continue
          }
          if (b64) {
            const duration = await getDataVideoDuration(b64, mime)
            addVideoRefData(b64, mime, duration)
          } else if (url || localPath) {
            // Library videos carry no base64: read the length from the asset or the file
            // (video upscalers estimate their cost from it)
            const duration = Number(asset.duration) > 0 ? Number(asset.duration) : await getSrcVideoDuration(srcUrl(localPath || url) || '')
            setRefs(prev => [...prev, { url: url || localPath, localPath, mime, assetId: asset.id, name: asset.name, refType: 'video', duration: duration || undefined }])
          }
        } else if (mime.startsWith('audio/')) {
          if (!currentModel.supportsAudioRef) {
            const audioModels = VIDEO_MODELS.filter(m => m.supportsAudioRef && isModelConfigured(m, configuredProviders))
            if (audioModels.length > 0) {
              if (mode !== 'video') switchMode('video')
              setModelName(audioModels[0].name)
            } else {
              showError('This model does not support audio references')
              continue
            }
          }
          setRefs(prev => [...prev, { base64: b64, url, localPath, mime, assetId: asset.id, name: asset.name, refType: 'audio' }])
        } else {
          insertImageRef({
            base64: b64,
            url,
            localPath,
            mime,
            assetId: asset.id,
            name: asset.name,
            refType: asset.refType || 'image',
          })
        }
      }
    } catch (err: any) {
      showError(`Cannot load assets: ${err?.message || err}`)
    }
  }

  const handleInsertLibrarySelect = async (assetOrAssets: any | any[]) => {
    await addAssetsAsRefs(assetOrAssets)
    setShowInsertLibrary(false)
  }

  const handleCardDragEnter = (e: React.DragEvent) => {
    const types = e.dataTransfer.types
    if (
      types.includes('application/x-openfield-asset') ||
      types.includes('application/x-openfield-assets') ||
      types.includes('Files') ||
      types.includes('text/plain') ||
      types.some((t: string) => t.startsWith('audio/'))
    ) {
      e.preventDefault()
      e.stopPropagation()
      cardDragCounterRef.current++
      setIsDragOverCard(true)
    }
  }

  const handleCardDragOver = (e: React.DragEvent) => {
    const types = e.dataTransfer.types
    if (
      types.includes('application/x-openfield-asset') ||
      types.includes('application/x-openfield-assets') ||
      types.includes('Files') ||
      types.includes('text/plain') ||
      types.some((t: string) => t.startsWith('audio/'))
    ) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
      if (!isDragOverCard) setIsDragOverCard(true)
    }
  }

  const handleCardDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    cardDragCounterRef.current--
    if (cardDragCounterRef.current <= 0) {
      cardDragCounterRef.current = 0
      setIsDragOverCard(false)
    }
  }

  const handleCardDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    cardDragCounterRef.current = 0
    setIsDragOverCard(false)

    // Check openfield asset(s)
    const assetsJson = e.dataTransfer.getData('application/x-openfield-assets')
    const assetJson = e.dataTransfer.getData('application/x-openfield-asset')
    if (assetsJson || assetJson) {
      try {
        const raw = assetsJson ? JSON.parse(assetsJson) : [JSON.parse(assetJson)]
        const assetsList = Array.isArray(raw) ? raw : [raw]
        await addAssetsAsRefs(assetsList)
        return
      } catch (err) {
        console.error('Failed to parse dropped asset:', err)
      }
    }

    // Check plain text asset ID
    const text = e.dataTransfer.getData('text/plain')
    if (text && !text.includes('\n') && text.length > 5 && text.length < 80) {
      try {
        await addAssetsAsRefs([{ id: text.trim() }])
        return
      } catch {}
    }

    // Check native files
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const api = (window as any).electronAPI
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        try {
          const { base64, mime } = await readFileAsBase64(file)
          await api?.assets.importBase64(base64, mime || 'application/octet-stream', file.name, undefined, 'import')
        } catch { /* fallback */ }
        await processDropRef.current(file)
      }
    }
  }

  const handleFrameDrop = async (e: React.DragEvent, slot: 'first' | 'last') => {
    e.preventDefault()
    e.stopPropagation()
    cardDragCounterRef.current = 0
    setIsDragOverCard(false)

    // Check openfield assets
    const assetsJson = e.dataTransfer.getData('application/x-openfield-assets')
    const assetJson = e.dataTransfer.getData('application/x-openfield-asset')
    if (assetsJson || assetJson) {
      try {
        const raw = assetsJson ? JSON.parse(assetsJson) : [JSON.parse(assetJson)]
        const assetsList = Array.isArray(raw) ? raw : [raw]
        const asset = assetsList[0]
        if (asset) {
          const api = (window as any).electronAPI
          let b64 = asset.base64
          if (!b64 && api?.assets?.readBase64 && asset.id) {
            const res = await api.assets.readBase64([asset.id])
            b64 = res?.[0]?.base64
          }
          const url = asset.url || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : undefined) || asset.localPath
          if (slot === 'first') {
            if (b64) {
              setFirstFrameBase64(b64)
              setFirstFrameUrl(null)
              firstFrameRef.current = b64
            } else if (url) {
              setFirstFrameUrl(url)
              setFirstFrameBase64(null)
            }
          } else {
            if (b64) {
              setLastFrameBase64(b64)
              setLastFrameUrl(null)
              lastFrameRef.current = b64
            } else if (url) {
              setLastFrameUrl(url)
              setLastFrameBase64(null)
            }
          }
          return
        }
      } catch (err) {
        console.error('Failed to drop frame asset:', err)
      }
    }

    // Check native files
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      try {
        const { base64 } = await readFileAsBase64(file)
        if (slot === 'first') {
          setFirstFrameBase64(base64)
          setFirstFrameUrl(null)
          firstFrameRef.current = base64
        } else {
          setLastFrameBase64(base64)
          setLastFrameUrl(null)
          lastFrameRef.current = base64
        }
      } catch (err) {
        console.error('Failed to read file for frame:', err)
      }
    }
  }

  useImperativeHandle(ref, () => ({
    loadFromParams(params) {
      if (params.mode && (params.mode === 'image' || params.mode === 'video')) {
        setInternalMode(params.mode)
      }
      if (params.prompt) {
        // Restore camera control from the stored [camera_control] block and keep it out of
        // the textarea (it only persists in the stored prompt).
        const parsedCamera = parseCameraBlock(params.prompt)
        if (parsedCamera.enabled) {
          setCameraEnabled(true)
          setCameraDisabled(parsedCamera.disabled)
          if (parsedCamera.camera) setCameraBody(parsedCamera.camera)
          if (parsedCamera.lens) setCameraLens(parsedCamera.lens)
          if (parsedCamera.shot) setCameraShot(parsedCamera.shot)
          if (parsedCamera.level) setCameraLevel(parsedCamera.level)
          if (parsedCamera.movement) setCameraMovement(parsedCamera.movement)
          if (parsedCamera.lighting) setLighting(parsedCamera.lighting)
          if (parsedCamera.filmLook) setFilmLook(parsedCamera.filmLook)
          if (parsedCamera.speed) setCameraSpeed(parsedCamera.speed)
        }
        setPrompt(stripCameraBlock(params.prompt))
      }
      if (params.model) {
        const effectiveMode = params.mode || mode
        const models = effectiveMode === 'video' ? VIDEO_MODELS : effectiveMode === 'audio' ? AUDIO_MODELS : IMAGE_MODELS
        const match = findModelById(models, params.model, { provider: params.provider, preferName: modelNameRef.current })
        if (match) setModelName(match.name)
      }
      if (params.aspectRatio) setAspectRatio(params.aspectRatio)
      if (params.resolution) setResolution(params.resolution)
      setUpscaleEngine(params.upscaleEngine || '')
      if (params.duration != null) setDuration(params.duration)
      if (params.fps != null) { setFps(params.fps); if (params.fps === 24 || params.fps === 48) setPVideoFps(params.fps) }
      if (params.sound != null) setSoundEnabled(params.sound)
      if (params.instrumental != null) setInstrumental(!!params.instrumental)
      if (params.draft != null) setPVideoDraft(params.draft)
      if (params.draft && String(params.model || '').includes('Seedance-2.5')) setResolution(SEEDANCE_DRAFT_RES)
      if (params.voice) setReplicateVoice(params.voice)
      if (params.enhancePrompt != null) {
        setMachgenEnhancePrompt(params.enhancePrompt)
        setMsEnhancePrompt(params.enhancePrompt)
      }
      if (params.presetId) setMsPresetId(params.presetId)
      if (params.quality && (params.quality === 'low' || params.quality === 'medium' || params.quality === 'high')) {
        setMsQuality(params.quality as any)
      }
      if (params.moderation && (params.moderation === 'auto' || params.moderation === 'low')) {
        setMsModeration(params.moderation as any)
      }
      if (params.influencer && typeof params.influencer === 'object') {
        setInfluencerOpts({ ...DEFAULT_AI_INFLUENCER_OPTS, ...params.influencer })
      }
      if (params.multiShots) {
        setMultiShots(true)
        if (params.multiPrompt && params.multiPrompt.length > 0) {
          setMultiPrompt(params.multiPrompt)
        }
      }

      const hasFF = !!params.firstFrameBase64
      const hasLF = !!params.lastFrameBase64
      const imageRefs = params.imageRefs || []
      const hasImageRefs = !!params.imageBase64 || imageRefs.length > 0
      const isFFLFMode = hasFF || hasLF

      const newRefs: { base64: string; mime: string; duration?: number; assetId?: string }[] = []

      if (isFFLFMode) {
        setSeedanceMode('fflf')
        if (hasFF) { setFirstFrameBase64(params.firstFrameBase64!); firstFrameRef.current = params.firstFrameBase64! }
        if (hasLF) { setLastFrameBase64(params.lastFrameBase64!); lastFrameRef.current = params.lastFrameBase64! }
        if (hasImageRefs) {
          if (params.imageBase64) newRefs.push({ base64: params.imageBase64, mime: params.imageMime || 'image/png', assetId: params.imageAssetId })
          for (const ir of imageRefs) newRefs.push({ base64: ir.base64, mime: ir.mime || 'image/png', assetId: ir.assetId })
        }
      } else {
        if (params.imageBase64) newRefs.push({ base64: params.imageBase64, mime: params.imageMime || 'image/png', assetId: params.imageAssetId })
        for (const ir of imageRefs) newRefs.push({ base64: ir.base64, mime: ir.mime || 'image/png', assetId: ir.assetId })
      }

      if (params.videoRefs) {
        for (const vr of params.videoRefs) {
          newRefs.push({ base64: vr.base64, mime: vr.mime || 'video/mp4', duration: vr.duration, assetId: vr.assetId })
        }
      }
      if (params.audioRefs) {
        for (const ar of params.audioRefs) {
          newRefs.push({ base64: ar.base64, mime: ar.mime || 'audio/mpeg', duration: (ar as any).duration })
        }
      }
      // Deduplicate by base64 (imageBase64 and imageRefs[0] are the same image by construction)
      if (newRefs.length > 0) {
        const seen = new Set<string>()
        const deduped = newRefs.filter(r => {
          if (seen.has(r.base64)) return false
          seen.add(r.base64)
          return true
        })
        if (deduped.length > 0) {
          setRefs(deduped)
          // Measure durations for audio refs without one (e.g. loaded from saved parameters),
          // used for the OmniHuman cost estimate and the >15s warning
          const audios = deduped.filter(r => r.mime.startsWith('audio/') && !r.duration)
          for (const a of audios) {
            const el = document.createElement('audio')
            el.preload = 'metadata'
            el.onloadedmetadata = () => {
              const d = isFinite(el.duration) ? el.duration : 0
              setRefs(prev => prev.map(r => (r.base64 === a.base64 ? { ...r, duration: d } : r)))
            }
            el.onerror = () => {}
            el.src = `data:${a.mime};base64,${a.base64}`
          }
        }
      }
    },
    addRefs(newRefs) {
      const model = currentModelRef.current
      const imageRefs = newRefs.filter(r => r.mime.startsWith('image/'))
      const videoRefs = newRefs.filter(r => r.mime.startsWith('video/'))
      const audioRefs = newRefs.filter(r => r.mime.startsWith('audio/'))

      if (videoRefs.length > 0 && !model?.supportsVideoRef) {
        showError('This model does not support video references')
      }
      let supportsAudio = !!model?.supportsAudioRef
      if (audioRefs.length > 0 && !supportsAudio) {
        const audioModels = VIDEO_MODELS.filter(m => m.supportsAudioRef && isModelConfigured(m, configuredProviders))
        if (audioModels.length > 0) {
          if (mode !== 'video') switchMode('video')
          setModelName(audioModels[0].name)
          supportsAudio = true
        } else {
          showError('This model does not support audio references')
        }
      }

      const allowedOther = [
        ...(model?.supportsVideoRef ? videoRefs : []),
        ...(supportsAudio ? audioRefs : []),
      ]

      if (isFFLFRef.current && imageRefs.length > 0) {
        let ffAssigned = !!firstFrameRef.current
        let lfAssigned = !!lastFrameRef.current
        const remaining: { base64: string; mime: string }[] = []
        for (const ref of imageRefs) {
          if (!ffAssigned) { setFirstFrameBase64(ref.base64); firstFrameRef.current = ref.base64; ffAssigned = true }
          else if (!lfAssigned) { setLastFrameBase64(ref.base64); lastFrameRef.current = ref.base64; lfAssigned = true }
          else { remaining.push(ref) }
        }
        if (remaining.length > 0 || allowedOther.length > 0) {
          setRefs(prev => [...prev, ...remaining, ...allowedOther])
        }
      } else {
        setRefs(prev => [...prev, ...imageRefs, ...allowedOther])
      }
    },
    addAssets(assets) {
      return addAssetsAsRefs(assets)
    },
  }), [mode])

  // Empties the draft: prompt, references, frames and per-generation options. The model,
  // aspect ratio, resolution and duration are kept (they are the workspace's environment).
  const clearDraft = () => {
    // Clear via ref first to avoid race with internalChangeRef in RichPromptInput
    richInputRef.current?.setText('')
    setPrompt('')
    setImageBase64(null)
    setRefs([])
    removedElementRefs.current.clear()
    setFirstFrameBase64(null)
    setLastFrameBase64(null)
    firstFrameRef.current = null
    lastFrameRef.current = null
    setMultiShots(false)
    setMultiPrompt([])
    setSoundEnabled(isMachgen)
    setShowRefsModal(false)
    setImageRefEntries([])
  }

  const resetComposer = () => {
    clearDraft()
    setFirstFrameUrl(null)
    setLastFrameUrl(null)
    setHiggsfieldFfEnabled(false)
    setCameraEnabled(false)
    setShowAtMenu(false)
    setErrorMessage(null)
    onPromptChange?.('')
  }

  const handleGenerate = useCallback(() => {
    const persistEnv = () => {
      const wsStore = useWorkspaceStore.getState()
      if (!wsStore.activeId) return
      wsStore.updateConfig(wsStore.activeId, {
        [`${mode}:model`]: modelName,
        [`${mode}:aspectRatio`]: aspectRatio,
        [`${mode}:resolution`]: resolution,
      }).catch(() => {})
    }
    if (mode === 'audio') {
      if (!prompt.trim()) return
      const activeAudioId = getActiveModelId()
      if (!activeAudioId) {
        showError('Por favor selecciona un modelo válido para generar audio.')
        return
      }
      persistEnv()
      onGenerate({
        mode,
        type: 'audio',
        prompt: prompt.trim(),
        model: activeAudioId,
        duration: currentModel.kind === 'music' && !currentModel.hideDuration ? duration : undefined,
        instrumental: currentModel.supportsInstrumental ? instrumental : undefined,
        modelId: currentModel.modelId,
        voiceId: currentModel.voiceId,
        engine: currentModel.engine,
        kind: currentModel.kind,
        provider: currentModel.provider || 'kie',
      })
      richInputRef.current?.setText('')
      setPrompt('')
      setExpanded(false)
      return
    }
    if (!prompt.trim() && !imageBase64 && !firstFrameBase64 && !lastFrameBase64 && refs.length === 0 && !imageRefEntries.some(e => e.base64)) return
    const activeId = getActiveModelId()
    if (!activeId) {
      showError('Por favor selecciona un modelo válido para generar.')
      return
    }
    const imageRefItems = refs.filter(r => r.mime.startsWith('image/'))
    const videoRefItems = refs.filter(r => r.mime.startsWith('video/'))
    const audioRefItems = refs.filter(r => r.mime.startsWith('audio/'))
    const namedRefItems = showRefsModal ? imageRefEntries.filter(e => e.base64) : []

    if (activeId === 'recraft/remove-background' && imageRefItems.length === 0 && imageRefEntries.filter(e => e.base64).length === 0) {
      showError('Adjunta una imagen para quitar el fondo')
      return
    }

    if (activeId === 'omnihuman-1-5') {
      if (imageRefItems.length === 0 && imageRefEntries.filter(e => e.base64).length === 0) {
        showError('Adjunta una imagen (retrato) para OmniHuman')
        return
      }
      if (audioRefItems.length === 0) {
        showError('Adjunta un audio para OmniHuman')
        return
      }
    }

    // Extract element references from prompt and collect their images
    const elementTags = [...new Set(prompt.match(/@element:([^\u200B]+)\u200B/g) || [])]
    const elementImages: { base64: string; mime: string; name?: string; refType?: string; url?: string; assetId?: string }[] = []
    for (const tag of elementTags) {
      const elName = tag.replace('@element:', '').replace('\u200B', '').trim()
      const el = allElements.find(e => e.name.toLowerCase() === elName.toLowerCase())
      if (!el) continue
      const elAny = el as any
      if (el.imageBase64) elementImages.push({ base64: el.imageBase64, mime: 'image/png', name: el.name, refType: 'element_primary' })
      if (elAny.imageUrl) elementImages.push({ base64: '', url: elAny.imageUrl, assetId: elAny.imageAssetId, mime: 'image/png', name: el.name, refType: el.kind === 'character' ? 'character' : el.kind === 'object' ? 'prop' : 'scenario' })
      if (el.poseRef) elementImages.push({ base64: el.poseRef, mime: 'image/png', name: el.name, refType: 'element_pose' })
      for (const refImg of (el.referenceImages || [])) {
        elementImages.push({ base64: refImg, mime: 'image/png', name: el.name, refType: 'element_ref' })
      }
    }

    // Build final imageRefs: named refs first, then element images, then dropped refs
    let finalImageRefs: Array<{ base64: string; mime: string; name?: string; refType?: string; url?: string; assetId?: string }> = showRefsModal && imageRefEntries.length > 0
      ? imageRefEntries.filter(e => e.base64).map(e => ({ base64: e.base64!, mime: e.mime || 'image/png', name: e.name, refType: e.type }))
      : imageRefItems.map(r => ({ base64: r.base64 || '', mime: r.mime, name: r.name, refType: r.refType, url: r.url, assetId: r.assetId }))

    if (elementImages.length > 0) {
      finalImageRefs = [...finalImageRefs, ...elementImages]
    }

    // Deduplicate by base64 (element images may already be in refs from the UI sync)
    const seen = new Set<string>()
    finalImageRefs = finalImageRefs.filter(r => {
      const key = r.base64 || r.url || r.assetId || ''
      if (key && seen.has(key)) return false
      if (key) seen.add(key)
      return true
    })

    // Grok i2v at 1080p only supports a single image; multi-image + aspect ratio need 480p/720p
    if (isGrok && activeId === 'grok-imagine/image-to-video' && resolution === '1080p' && finalImageRefs.length > 1) {
      showError('1080p solo soporta una imagen. Usa 720p o 480p para múltiples referencias.')
      return
    }

    // Tag models: every tag in the prompt must match an attached ref. Skipped for plain-text
    // tags ("Image 1") which are too generic to validate reliably.
    if (isTagModel && !refTagCfg.skipTagValidation) {
      const kinds: { template: string; label: string; count: number }[] = [
        { template: refTagCfg.image || '', label: 'imagen', count: refs.filter(r => r.mime.startsWith('image/')).length },
        { template: refTagCfg.video || '', label: 'video', count: refs.filter(r => r.mime.startsWith('video/')).length },
        { template: refTagCfg.audio || '', label: 'audio', count: refs.filter(r => r.mime.startsWith('audio/')).length },
      ]
      for (const k of kinds) {
        if (!k.template) continue
        const re = new RegExp(k.template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%d/g, '(\\d+)'), 'g')
        for (const m of prompt.matchAll(re)) {
          const n = Number(m[1])
          if (n < 1 || n > k.count) {
            showError(`${m[0]} no coincide con ninguna referencia de ${k.label} adjunta`)
            return
          }
        }
      }
    }

    if (isMotionTransfer) {
      const imageCount = imageRefItems.length + namedRefItems.length + elementImages.length + (imageBase64 ? 1 : 0)
      if (videoRefItems.length === 0) {
        showError('Adjunta el video de origen (mín. 4 s) para Motion Transfer')
        return
      }
      if (imageCount === 0) {
        showError('Adjunta al menos una imagen de referencia (personaje, lugar o estilo)')
        return
      }
      const srcSecs = videoRefItems[0].duration
      if (srcSecs != null && srcSecs > 0 && srcSecs < 4) {
        showError('El video de origen debe durar al menos 4 segundos')
        return
      }
      if (imageCount > 8) {
        showError('Motion Transfer acepta hasta 8 imágenes de referencia')
        return
      }
    }

    if (isMarketingStudio) {
      if (!msPresetId && msPresetsList.length > 0) {
        setMsPresetId(msPresetsList[0].id)
      }
    }

    persistEnv()

    // Camera control: persisted inside [camera_control] tags — any previous block is replaced
    // (no duplication) and the block is only appended when the camera toggle is on.
    const basePrompt = stripCameraBlock(prompt)
    const cameraBlock = formatCameraBlock({
      enabled: cameraEnabled,
      disabled: cameraDisabled,
      camera: cameraBody,
      lens: cameraLens,
      shot: cameraShot,
      level: cameraLevel,
      movement: cameraMovement,
      lighting,
      filmLook,
      speed: cameraSpeed,
    }, mode)
    const finalPrompt = (basePrompt
      ? basePrompt + (cameraBlock ? `\n\n${cameraBlock}` : '')
      : cameraBlock)
      // Normalize badge terminators (zero-width space, nbsp) so API tags like @image_1 parse cleanly
      .replace(/\u200B/g, '').replace(/\u00A0/g, ' ')

    onGenerate({
      mode,
      type: mode,
      prompt: finalPrompt,
      model: activeId,
      provider: (currentModel.provider && currentModel.provider !== 'kie') ? currentModel.provider : undefined,
      voice: isReplicate && !isPVideo ? replicateVoice : undefined,
      voiceLanguage: isReplicate && !isPVideo ? replicateLanguage : undefined,
      aspectRatio: aspectRatio,
      resolution: isSeedanceDraftRes ? '480p' : resolution,
      batchSize,
      // OmniHuman is audio-driven: the audio determines the length, no duration/FPS
      duration: mode === 'video' && activeId !== 'omnihuman-1-5' && (!isReplicate || isPVideo) ? duration : undefined,
      fps: mode === 'video' && activeId !== 'omnihuman-1-5' && (!isReplicate || isPVideo)
        ? (isPVideo ? pVideoFps : (hasFpsChoice ? fps : undefined))
        : undefined,
      draft: isPVideo ? pVideoDraft : (isSeedanceDraftRes ? true : undefined),
      sound: mode === 'video' && !isReplicate ? soundEnabled : undefined,
      enhancePrompt: isMarketingStudio ? msEnhancePrompt : undefined,
      presetId: isMarketingStudio ? (msPresetId || (isMarketplace ? 'f188a40a-098a-5fb3-bffc-eedfeaf9ecd7' : 'ef84af61-57cd-5f2e-b3ca-209d8038563c')) : undefined,
      quality: isMarketingStudio ? msQuality : undefined,
      moderation: isMarketingStudio ? msModeration : undefined,
      influencer: isAiInfluencer ? influencerOpts : undefined,
      // In image mode imageBase64 duplicates imageRefs[0] (same image by construction) and the
      // API only uses refs when present, so skip it to keep stored parameters clean.
      // Video models that ignore imageRefs still need imageBase64.
      imageBase64: isReplicate ? (imageBase64 || finalImageRefs[0]?.base64 || undefined) : (mode === 'image' && finalImageRefs.length > 0) ? undefined : (namedRefItems.length > 0 ? namedRefItems[0].base64 : (imageRefItems.length > 0) ? imageRefItems[0].base64 : ((activeId !== currentModel.t2iId && activeId !== currentModel.t2vId) ? (imageBase64 || undefined) : undefined)),
      imageMime: isReplicate ? (imageMime || finalImageRefs[0]?.mime || 'image/png') : (namedRefItems[0]?.mime || imageRefItems[0]?.mime || imageMime),
      imageRefs: isReplicate ? undefined : (finalImageRefs.length > 0 ? finalImageRefs : undefined),
      videoRefs: videoRefItems.length > 0 ? videoRefItems.map(r => ({
        base64: r.base64 || '',
        url: r.url,
        localPath: r.localPath,
        assetId: r.assetId,
        mime: r.mime || 'video/mp4',
        name: r.name,
        duration: r.duration,
      })) : undefined,
      audioRefs: audioRefItems.length > 0 ? audioRefItems.map(r => ({ base64: r.base64 || '', mime: r.mime, duration: r.duration })) : undefined,
      firstFrameBase64: isFFLF ? (firstFrameBase64 || undefined) : undefined,
      firstFrameUrl: isFFLF ? (firstFrameUrl || undefined) : undefined,
      lastFrameBase64: isFFLF ? (lastFrameBase64 || undefined) : undefined,
      lastFrameUrl: isFFLF ? (lastFrameUrl || undefined) : undefined,
      multiShots: !isReplicate && multiShots ? multiShots : undefined,
      multiPrompt: !isReplicate && multiShots && multiPrompt.length > 0 ? multiPrompt : undefined,
      upscaleEngine: upscaleEngine && currentModel.upscaleEngines?.includes(upscaleEngine) ? upscaleEngine : undefined,
      modelId: currentModel.modelId,
    })
    setExpanded(false)
    if (!embedded) clearDraft()
  }, [prompt, aspectRatio, resolution, batchSize, duration, fps, imageBase64, imageMime, refs, firstFrameBase64, firstFrameUrl, lastFrameBase64, lastFrameUrl, currentModel, onGenerate, mode, isFFLF, multiShots, multiPrompt, soundEnabled, instrumental, showRefsModal, imageRefEntries, elements, isReplicate, isFal, isMachgen, isHiggsfield, isMarketingStudio, msEnhancePrompt, msPresetId, msQuality, msModeration, isAiInfluencer, isMotionTransfer, influencerOpts, hasFpsChoice, isPVideo, pVideoFps, pVideoDraft, isSeedanceDraftRes, replicateVoice, replicateLanguage, upscaleEngine, cameraEnabled, cameraDisabled, cameraBody, cameraLens, cameraShot, cameraLevel, cameraMovement, lighting, filmLook, cameraSpeed, embedded])

  const ffImageSrc = firstFrameUrl
    ? srcUrl(firstFrameUrl)
    : firstFrameBase64
    ? (firstFrameBase64.startsWith('data:') || firstFrameBase64.startsWith('http') || firstFrameBase64.startsWith('file:') || firstFrameBase64.startsWith('/')
      ? srcUrl(firstFrameBase64)
      : `data:image/png;base64,${firstFrameBase64}`)
    : null

  const lfImageSrc = lastFrameUrl
    ? srcUrl(lastFrameUrl)
    : lastFrameBase64
    ? (lastFrameBase64.startsWith('data:') || lastFrameBase64.startsWith('http') || lastFrameBase64.startsWith('file:') || lastFrameBase64.startsWith('/')
      ? srcUrl(lastFrameBase64)
      : `data:image/png;base64,${lastFrameBase64}`)
    : null

  const hasMedia = refs.length > 0 || !!imageBase64 || !!firstFrameBase64 || !!firstFrameUrl || !!lastFrameBase64 || !!lastFrameUrl

  if (!hasAnyProvider) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,420px)] popover-surface rounded-2xl px-4 py-3 flex items-center gap-2.5">
        <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <p className="text-[11px] text-surface-300">
          No provider activated for this section. Add an API key or switch a provider on in Settings → Providers to generate.
        </p>
      </div>
    )
  }

  return (
    <>
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-accent-500/10 border-2 border-dashed border-accent-500/60 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-accent-400">
            <Upload size={24} />
            <span className="text-xs font-medium">Drop image, video or audio</span>
          </div>
        </div>
      )}
      {errorMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 border border-red-400/30 rounded-lg px-4 py-2 shadow-float flex items-center gap-2 animate-[pulse_0.3s_ease-in-out]">
          <AlertCircle size={14} className="text-white flex-shrink-0" />
          <span className="text-xs text-white">{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-white/70 hover:text-white flex-shrink-0">
            <X size={12} />
          </button>
        </div>
      )}
      <div ref={composerRootRef} className={embedded ? `w-full relative ${className || ''}` : `${floating ? 'absolute inset-x-0 bottom-0' : 'sticky bottom-0'} z-40 px-4 pb-4 pt-2 pointer-events-none`}>
        <div className={embedded ? 'w-full' : 'max-w-5xl mx-auto pointer-events-auto flex items-end gap-2.5'}>
          {/* Floating mode switcher (Image / Video) oriented vertically */}
          {!embedded && mode !== 'audio' && (
            <div className="flex flex-col p-1 bg-sidebar/95 border border-surface-800 rounded-2xl shadow-float backdrop-blur-xl backdrop-saturate-150 gap-1 shrink-0 self-end mb-0.5">
              <button
                type="button"
                onClick={() => switchMode('image')}
                className={`group flex flex-col items-center justify-center w-[50px] h-[46px] rounded-lg transition-all duration-150 active:scale-95 cursor-pointer select-none ${
                  mode === 'image'
                    ? 'bg-accent-600 text-on-accent shadow-md shadow-accent-600/30 font-semibold'
                    : 'text-surface-400 hover:text-surface-100 hover:bg-surface-800/80'
                }`}
                title="Modo Imagen"
              >
                <ImageIcon size={18} className="shrink-0 transition-transform duration-150 group-hover:scale-110" />
                <span className="text-[10px] font-medium leading-none mt-1 tracking-tight">Imagen</span>
              </button>
              <button
                type="button"
                onClick={() => switchMode('video')}
                className={`group flex flex-col items-center justify-center w-[50px] h-[46px] rounded-lg transition-all duration-150 active:scale-95 cursor-pointer select-none ${
                  mode === 'video'
                    ? 'bg-accent-600 text-on-accent shadow-md shadow-accent-600/30 font-semibold'
                    : 'text-surface-400 hover:text-surface-100 hover:bg-surface-800/80'
                }`}
                title="Modo Video"
              >
                <Video size={18} className="shrink-0 transition-transform duration-150 group-hover:scale-110" />
                <span className="text-[10px] font-medium leading-none mt-1 tracking-tight">Video</span>
              </button>
            </div>
          )}

          <div
            ref={cardRef}
            data-composer-dropzone
            className={`flex-1 min-w-0 relative ${embedded ? 'bg-surface-900 border border-hairline rounded-2xl' : 'bg-sidebar/90 border border-surface-800 rounded-block shadow-float'} backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isDragOverCard ? 'ring-2 ring-accent-400 border-accent-400/80 shadow-float' : ''}`}
            onDragEnter={handleCardDragEnter}
            onDragOver={handleCardDragOver}
            onDragLeave={handleCardDragLeave}
            onDrop={handleCardDrop}
          >
            {/* Visual drag-over indicator */}
            {isDragOverCard && (
              <div className="absolute inset-0 z-30 bg-accent-500/15 backdrop-blur-sm border-2 border-dashed border-accent-400/80 rounded-2xl flex items-center justify-center pointer-events-none animate-in fade-in duration-150">
                <div className="flex items-center gap-2.5 px-4 py-2 bg-surface-900/90 border border-accent-400/40 rounded-pill shadow-float text-accent-300 text-xs font-medium">
                  <Upload size={16} className="animate-bounce" />
                  <span>Soltar para agregar como referencia</span>
                </div>
              </div>
            )}
            {/* Reset button, left of the maximize toggle */}
            <button
              onClick={resetComposer}
              title="Restablecer composer"
              className="absolute right-[38px] top-3 z-20 text-surface-400 hover:text-surface-100 p-1 rounded-full hover:bg-surface-800/60 transition-all duration-200 active:scale-90"
            >
              <RotateCcw size={14} />
            </button>
            {/* Maximize/Minimize toggle button anchored to the top-right corner of PromptComposer */}
            <button
              onClick={() => setExpanded(e => !e)}
              title={expanded ? 'Shrink composer' : 'Expand composer'}
              className="absolute right-3 top-3 z-20 text-surface-400 hover:text-surface-100 p-1 rounded-full hover:bg-surface-800/60 transition-all duration-200 active:scale-90"
            >
              {expanded ? <Minimize2 size={14} className="transition-transform duration-200" /> : <Maximize2 size={14} className="transition-transform duration-200" />}
            </button>
            {/* Reference chips at top: one row per media kind, reorderable by drag within a row */}
            {hasMedia && (
              <div className="flex flex-col gap-1.5 pl-3 pr-16 pt-2.5">
                {(['image', 'video', 'audio', 'other'] as const).map(kind => {
                const rowItems = refs
                  .map((ref, i) => ({ ref, i }))
                  .filter(({ ref }) => refKind(ref.mime) === kind && !(isFFLF && kind === 'image' && !(ref as any).elementName && !(ref as any).name))
                const showMainImage = kind === 'image' && !!imageBase64 && !refs.some(r => r.mime.startsWith('image/'))
                const showOmniWarn = kind === 'audio' && isOmniHuman && ((refs.find(r => r.mime.startsWith('audio/'))?.duration || 0) > 15)
                if (rowItems.length === 0 && !showMainImage) return null
                const acceptsDrag = (e: React.DragEvent) =>
                  e.dataTransfer.types.includes(REF_REORDER_TYPE) && !!draggedRefRef.current && refKind(draggedRefRef.current.mime) === kind
                return (
                  <div
                    key={kind}
                    className="flex flex-wrap items-center gap-1.5"
                    // Accept the drop in the gaps between chips of this row too
                    onDragOver={(e) => { if (acceptsDrag(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move' } }}
                    onDrop={(e) => { if (e.dataTransfer.types.includes(REF_REORDER_TYPE)) { e.preventDefault(); e.stopPropagation() } }}
                  >
                {rowItems.map(({ ref, i }) => {
                  const elRef = ref as any
                  const isElementRef = !!elRef.elementName
                  const imgIdx = refs.filter((r, j) => r.mime.startsWith('image/') && j <= i).length
                  const vidIdx = refs.filter((r, j) => r.mime.startsWith('video/') && j <= i).length
                  const audIdx = refs.filter((r, j) => r.mime.startsWith('audio/') && j <= i).length
                  const tagLabel = isTagModel ? (tagRefItems[i]?.tag || '') : ''
                  let chipLabel: string
                  if (elRef.name) {
                    chipLabel = elRef.name
                  } else if (tagLabel) {
                    chipLabel = tagLabel
                  } else if (isElementRef) {
                    chipLabel = `${elRef.elementName} · ${elRef.refType}`
                  } else if (ref.mime.startsWith('image/')) {
                    chipLabel = `Image ${imgIdx}`
                  } else if (ref.mime.startsWith('video/')) {
                    chipLabel = `Video ${vidIdx}`
                  } else if (ref.mime.startsWith('audio/')) {
                    chipLabel = `Audio ${audIdx}`
                  } else {
                    chipLabel = 'File'
                  }
                  const handleRemove = () => {
                    const key = ref.base64 || elRef.url || elRef.assetId
                    if (isElementRef && key) {
                      removedElementRefs.current.add(key)
                    }
                    setRefs(prev => prev.filter((_, j) => j !== i))
                  }
                  return (
                    <ChipRef
                      key={refKeyOf(ref)}
                      mime={ref.mime}
                      base64={ref.base64}
                      url={elRef.url}
                      localPath={ref.localPath}
                      assetId={ref.assetId}
                      label={chipLabel}
                      onRemove={handleRemove}
                      draggable={rowItems.length > 1}
                      isDragging={draggedRef === ref}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(REF_REORDER_TYPE, String(i))
                        e.dataTransfer.effectAllowed = 'move'
                        draggedRefRef.current = ref
                        setDraggedRef(ref)
                      }}
                      onDragOver={(e) => {
                        if (!acceptsDrag(e)) return
                        e.preventDefault()
                        e.stopPropagation()
                        e.dataTransfer.dropEffect = 'move'
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        moveDraggedRef(ref, e.clientX > rect.left + rect.width / 2)
                      }}
                      onDrop={(e) => { if (e.dataTransfer.types.includes(REF_REORDER_TYPE)) { e.preventDefault(); e.stopPropagation() } }}
                      onDragEnd={() => { draggedRefRef.current = null; setDraggedRef(null) }}
                    />
                  )
                })}
                {showOmniWarn && <OmniAudioWarn />}
                {showMainImage && <ChipImage src={`data:image/png;base64,${imageBase64}`} label={isReplicate ? 'Portrait' : 'Image 1'} onRemove={() => removeImage('main')} />}
                  </div>
                )
                })}
              </div>
            )}

          {/* Main row */}
          <div className="flex items-stretch gap-2 p-2">
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="flex items-stretch gap-2">
            {/* Dropzones next to textarea (only in FF/LF mode) */}
            {isFFLF && (
                <div className="flex gap-1 flex-shrink-0">
                  <div className="relative group">
                    <label
                      htmlFor={`file-first-${instanceId}`}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' }}
                      onDrop={(e) => handleFrameDrop(e, 'first')}
                      className="aspect-square h-[52px] border border-dashed border-surface-700 hover:border-accent-500/50 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors gap-0.5 overflow-hidden"
                    >
                      {ffImageSrc ? (
                        <img src={ffImageSrc} className="w-full h-full object-cover" alt="FF" />
                      ) : (
                        <>
                          <Upload size={10} className="text-surface-500" />
                          <span className="text-[8px] text-surface-500">FF</span>
                        </>
                      )}
                    </label>
                    {ffImageSrc && (
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeImage('first') }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-surface-950 border border-surface-700 rounded-full flex items-center justify-center text-surface-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X size={10} />
                      </button>
                    )}
                  </div>
                  <input id={`file-first-${instanceId}`} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, 'first')} />
                  {ffImageSrc && lfImageSrc && !(multiShots && isKling30) && (
                    <button
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation()
                        const ffB = lastFrameBase64
                        const lfB = firstFrameBase64
                        const ffU = lastFrameUrl
                        const lfU = firstFrameUrl
                        setFirstFrameBase64(ffB)
                        setLastFrameBase64(lfB)
                        setFirstFrameUrl(ffU)
                        setLastFrameUrl(lfU)
                        firstFrameRef.current = ffB
                        lastFrameRef.current = lfB
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded-full bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors flex-shrink-0"
                      title="Swap FF/LF"
                    >
                      <ArrowLeftRight size={12} />
                    </button>
                  )}
                  {!(multiShots && isKling30) && (
                    <div className="relative group">
                      <label
                        htmlFor={`file-last-${instanceId}`}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' }}
                        onDrop={(e) => handleFrameDrop(e, 'last')}
                        className="aspect-square h-[52px] border border-dashed border-surface-700 hover:border-accent-500/50 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors gap-0.5 overflow-hidden"
                      >
                        {lfImageSrc ? (
                          <img src={lfImageSrc} className="w-full h-full object-cover" alt="LF" />
                        ) : (
                          <>
                            <Upload size={10} className="text-surface-500" />
                            <span className="text-[8px] text-surface-500">LF</span>
                          </>
                        )}
                      </label>
                      {lfImageSrc && (
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeImage('last') }}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-surface-950 border border-surface-700 rounded-full flex items-center justify-center text-surface-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  )}
                  {!(multiShots && isKling30) && <input id={`file-last-${instanceId}`} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, 'last')} />}
                </div>
            )}

            <div className="flex-1 relative">
              <RichPromptInput
                ref={richInputRef}
                value={prompt}
                onChange={(text) => {
                    setPrompt(text)
                    onPromptChange?.(text)
                  }}
                  onAtState={(active, query) => {
                    if (active) {
                      setAtMenuFilter(query)
                      setAtMenuIndex(0)
                      setShowAtMenu(true)
                    } else {
                      setShowAtMenu(false)
                      setAtMenuFromElements(false)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (showAtMenu) {
                      const refEntries = isTagModel ? [] : (showRefsModal ? imageRefEntries.filter(re => re.name && re.name.toLowerCase().startsWith(atMenuFilter.toLowerCase())) : [])
                      const navRefs: any[] = isTagModel ? refMenuItems : refEntries
                      const navEls: any[] = isTagModel ? (atMenuFromElements ? elMenuItems : []) : elMenuItems
                      const totalItems = navRefs.length + navEls.length
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setAtMenuIndex(prev => Math.min(prev + 1, Math.max(0, totalItems - 1)))
                        return
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setAtMenuIndex(prev => Math.max(prev - 1, 0))
                        return
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (atMenuIndex < navRefs.length) {
                          const item = navRefs[atMenuIndex]
                          if (isTagModel) {
                            if (item?.tag) richInputRef.current?.insertText(item.tag)
                          } else if (item) {
                            setPrompt(prev => (prev + ' @' + item.name).trim() + ' ')
                          }
                        } else {
                          const el = navEls[atMenuIndex - navRefs.length]
                          if (el) {
                            if (isTagModel) {
                              attachElementImages(el)
                            } else {
                              richInputRef.current?.insertBadge(el)
                              attachElementImages(el)
                            }
                          }
                        }
                        setShowAtMenu(false)
                        return
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        setShowAtMenu(false)
                        return
                      }
                      return
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleGenerate()
                    }
                  }}
                  elements={allElements}
                  onBadgeClick={(name, rect) => setBadgePopover({ elementName: name, rect })}
                  expanded={expanded}
                  tagPatterns={tagTemplates}
                  placeholder={mode === 'image' ? 'Describe what you want to generate...' : mode === 'audio' ? 'Describe the voice line or music track...' : isReplicate ? 'Type what the avatar should say...' : 'Describe the video you want to create...'}
                />
                {/* @ autocomplete dropdown */}
                {showAtMenu && (() => {
                  const refEntries = (showRefsModal ? imageRefEntries.filter(re => re.name && re.name.toLowerCase().startsWith(atMenuFilter.toLowerCase())) : [])
                  const KIND_ICON_MAP: Record<ElementKind, typeof User> = {
                    avatar: UserCircle,
                    character: User,
                    environment: Mountain,
                    object: Box,
                  }
                  const mimeLabel = (mime: string) => mime.startsWith('image/') ? 'Image' : mime.startsWith('video/') ? 'Video' : mime.startsWith('audio/') ? 'Audio' : 'File'
                  const syntaxHint = refTagCfg ? [refTagCfg.image, refTagCfg.video, refTagCfg.audio].filter(Boolean).map(t => (t as string).replace('%d', '1')).join(' · ') : ''
                  const elRow = (el: StudioElement, i: number, attach: boolean) => {
                    const elAny = el as any
                    const Icon = KIND_ICON_MAP[el.kind] || User
                    const cfg = KIND_CONFIG[el.kind] || KIND_CONFIG.character
                    const imgSrc = elAny.imageUrl
                      ? srcUrl(elAny.imageUrl)
                      : el.imageBase64
                      ? `data:image/png;base64,${el.imageBase64}`
                      : null
                    return (
                      <button
                        key={(attach ? 'att-' : 'el-') + el.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (attach) {
                            attachElementImages(el)
                          } else {
                            richInputRef.current?.insertBadge(el)
                            attachElementImages(el)
                          }
                          setShowAtMenu(false)
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${atMenuIndex === i ? 'bg-surface-700/60 text-surface-100' : 'text-surface-300 hover:bg-surface-700/50 hover:text-surface-100'}`}
                      >
                        {imgSrc ? (
                          <img src={imgSrc} className="w-5 h-5 rounded-full object-cover shrink-0 border border-ink/10" alt="" />
                        ) : (
                          <div className={`w-5 h-5 rounded-full shrink-0 ${cfg.color === 'text-violet-400' ? 'bg-violet-500/20' : cfg.color === 'text-blue-400' ? 'bg-blue-500/20' : cfg.color === 'text-emerald-400' ? 'bg-emerald-500/20' : 'bg-amber-500/20'} flex items-center justify-center`}>
                            <Icon size={11} className={cfg.color} />
                          </div>
                        )}
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className={`font-medium truncate ${cfg.color}`}>@{el.name}</span>
                          {el.description && <span className="text-[9px] text-surface-500 truncate leading-tight">{el.description}</span>}
                        </div>
                        <span className="text-[10px] text-surface-500 ml-auto shrink-0">
                          {el.kind === 'character' ? 'Personaje' : el.kind === 'object' ? 'Prop' : el.kind === 'environment' ? 'Escenario' : (attach ? 'Adjuntar' : cfg.label)}
                        </span>
                      </button>
                    )
                  }
                  return (
                    <div ref={atMenuRef} className="absolute left-3 bottom-full mb-1 popover-surface rounded-2xl py-1 min-w-[180px] z-50 max-h-48 overflow-y-auto">
                      {isTagModel ? (
                        <>
                          <div className="eyebrow px-3 pt-1.5 pb-0.5">Referencias</div>
                          {refMenuItems.length === 0 && (
                            <div className="px-3 py-1.5 text-[11px] text-surface-500">
                              {tagRefItems.length === 0
                                ? 'No hay referencias adjuntas. Arrastra archivos o usa "From elements".'
                                : 'Sin coincidencias'}
                            </div>
                          )}
                          {refMenuItems.map((item, i) => (
                            <button
                              key={'tagref-' + i}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                if (item.tag) richInputRef.current?.insertText(item.tag)
                                setShowAtMenu(false)
                              }}
                              className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${atMenuIndex === i ? 'bg-surface-700/60 text-surface-100' : 'text-surface-300 hover:bg-surface-700/50 hover:text-surface-100'}`}
                            >
                              {item.ref.mime.startsWith('image/') ? (
                                <img src={`data:${item.ref.mime};base64,${item.ref.base64}`} className="w-5 h-5 rounded object-cover" alt="" />
                              ) : (
                                <div className="w-5 h-5 rounded bg-surface-700 flex items-center justify-center">
                                  {item.ref.mime.startsWith('video/') ? <Video size={10} className="text-surface-400" /> : <Music size={10} className="text-surface-400" />}
                                </div>
                              )}
                              <span className="text-cyan-600 dark:text-cyan-400">{item.tag}</span>
                              <span className="text-[10px] text-surface-500 ml-auto">{mimeLabel(item.ref.mime)}</span>
                            </button>
                          ))}
                          <div className="h-px bg-surface-700/60 my-1" />
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setAtMenuFromElements(v => !v)}
                            className="w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 text-surface-300 hover:bg-surface-700/50 hover:text-surface-100"
                          >
                            <Shapes size={12} className="text-accent-400" /> From elements
                            {atMenuFromElements ? <ChevronUp size={12} className="ml-auto text-surface-500" /> : <ChevronDown size={12} className="ml-auto text-surface-500" />}
                          </button>
                          {atMenuFromElements && (
                            <>
                              {elMenuItems.length === 0 && (
                                <div className="px-3 py-1.5 text-[11px] text-surface-500">
                                  {elements.length === 0
                                    ? 'No hay elementos. Crea uno primero en la pestaña Elements.'
                                    : 'Sin coincidencias'}
                                </div>
                              )}
                              {elMenuItems.map((el, idx) => elRow(el, refMenuItems.length + idx, true))}
                            </>
                          )}
                          {syntaxHint && (
                            <div className="px-3 py-1.5 text-[10px] text-surface-600 border-t border-surface-700/60">
                              Tags: <span className="text-cyan-600/80 dark:text-cyan-400/80">{syntaxHint}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {refEntries.length === 0 && elMenuItems.length === 0 && (
                            <div className="px-3 py-2 text-xs text-surface-500">
                              {elements.length === 0
                                ? 'No hay elementos. Crea uno primero en la pestaña Elements.'
                                : 'Sin coincidencias'}
                            </div>
                          )}
                          {refEntries.map((re, i) => (
                            <button
                              key={'ref-' + i}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setPrompt(prev => (prev + ' @' + re.name).trim() + ' ')
                                setShowAtMenu(false)
                              }}
                              className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${atMenuIndex === i ? 'bg-surface-700/60 text-surface-100' : 'text-surface-300 hover:bg-surface-700/50 hover:text-surface-100'}`}
                            >
                              {re.base64 ? (
                                <img src={`data:${re.mime};base64,${re.base64}`} className="w-5 h-5 rounded object-cover" alt="" />
                              ) : (
                                <div className="w-5 h-5 rounded bg-surface-700" />
                              )}
                              <span className="text-accent-400">@{re.name}</span>
                              <span className="text-[10px] text-surface-500 ml-auto">{re.type}</span>
                            </button>
                          ))}
                          {elMenuItems.map((el, idx) => elRow(el, refEntries.length + idx, false))}
                        </>
                      )}
                    </div>
                  )
                })()}
              </div>
              </div>

            {/* Element badge popover — shows all related images */}
            {badgePopover && (() => {
              const el = elements.find(e => e.name === badgePopover.elementName)
              if (!el) return null
              const allImages: { base64: string; label: string }[] = []
              if (el.imageBase64) allImages.push({ base64: el.imageBase64, label: 'Primary' })
              if (el.poseRef) allImages.push({ base64: el.poseRef, label: 'Pose' })
              for (let i = 0; i < (el.referenceImages || []).length; i++) {
                allImages.push({ base64: el.referenceImages[i], label: `Mood ${i + 1}` })
              }
              if (allImages.length === 0) return null
              const usedBase64s = new Set(refs.map(r => r.base64))
              return (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBadgePopover(null)} />
                  <div className="fixed z-50 popover-surface rounded-2xl p-3 min-w-[240px] max-w-[320px]" style={{ left: Math.min(badgePopover.rect.left, window.innerWidth - 340) + 'px', bottom: (window.innerHeight - badgePopover.rect.top + 8) + 'px' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-surface-200">{el.name}</span>
                      <button onClick={() => setBadgePopover(null)} className="text-surface-500 hover:text-surface-100">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {allImages.map((img, i) => {
                        const isUsed = usedBase64s.has(img.base64)
                        return (
                          <button
                            key={i}
                            disabled={isUsed}
                            onClick={() => {
                              setRefs(prev => [...prev, { base64: img.base64, mime: 'image/png', elementName: el.name, refType: img.label } as any])
                            }}
                            className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${isUsed ? 'border-accent-500/50 opacity-50 cursor-not-allowed' : 'border-surface-700 hover:border-accent-500/60 cursor-pointer'}`}
                          >
                            <img src={`data:image/png;base64,${img.base64}`} className="w-full h-full object-cover" alt="" />
                            {isUsed && (
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <Check size={16} className="text-accent-400" />
                              </div>
                            )}
                            <span className="absolute bottom-0 left-0 right-0 text-[8px] text-white bg-black/60 px-1 py-0.5 truncate">{img.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              )
            })()}

            {/* Multi-shot editor for Kling */}
            {multiShots && isKling30 && (() => {
              const maxTotal = 15
              const totalDuration = multiPrompt.reduce((s, x) => s + x.duration, 0)
              const canAdd = multiPrompt.length < 5
              return (
              <div className="border-t border-surface-800/60 px-3 py-2 space-y-1.5">
                {multiPrompt.map((shot, i) => {
                  const otherSum = multiPrompt.reduce((s, x, j) => j === i ? s : s + x.duration, 0)
                  const maxForThis = maxTotal - otherSum
                  const options = [2, 3, 4, 5, 6, 8, 10].filter(d => d <= maxForThis || d === shot.duration)
                  return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-surface-500 w-5 flex-shrink-0">#{i + 1}</span>
                    <input
                      value={shot.prompt}
                      onChange={(e) => {
                        const next = [...multiPrompt]
                        next[i] = { ...next[i], prompt: e.target.value }
                        setMultiPrompt(next)
                      }}
                      placeholder={`Shot ${i + 1} prompt...`}
                      className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-2 py-1 text-xs text-surface-200 outline-none focus:border-accent-500/50"
                    />
                    <select
                      value={shot.duration}
                      onChange={(e) => {
                        const next = [...multiPrompt]
                        next[i] = { ...next[i], duration: Number(e.target.value) }
                        setMultiPrompt(next)
                      }}
                      className="bg-surface-800 border border-surface-700 rounded-lg px-1.5 py-1 text-[11px] text-surface-300 outline-none w-12"
                    >
                      {options.map(d => <option key={d} value={d}>{d}s</option>)}
                    </select>
                    <button onClick={() => setMultiPrompt(prev => prev.filter((_, j) => j !== i))}
                      className="p-1 text-surface-500 hover:text-red-400">
                      <X size={12} />
                    </button>
                  </div>
                )})}
                <div className="flex items-center justify-between">
                  <button onClick={() => setMultiPrompt(prev => [...prev, { prompt: '', duration: totalDuration >= maxTotal ? 0 : Math.min(5, maxTotal - totalDuration) }])}
                    disabled={!canAdd || totalDuration >= maxTotal}
                    className={`text-[10px] ${canAdd && totalDuration < maxTotal ? 'text-accent-400 hover:text-accent-300' : 'text-surface-700 cursor-not-allowed'}`}>
                    + Add shot
                  </button>
                  <span className={`text-[10px] ${totalDuration > maxTotal ? 'text-red-600 dark:text-red-400' : 'text-surface-500'}`}>
                    Total: {totalDuration}s / {maxTotal}s
                  </span>
                </div>
              </div>
            )})()}

            {/* Bottom bar: model, toggles, selects */}
            <div className="flex items-center gap-1.5 pl-1 pb-0.5">
              {/* Insert image */}
              <div className="relative" ref={insertRef}>
                <button onClick={() => setShowInsertMenu(!showInsertMenu)}
                  className={`flex items-center justify-center h-7 px-2.5 rounded-pill text-[11px] font-medium border transition-all shadow-sm ${showInsertMenu ? 'bg-surface-800 text-surface-100 border-surface-600' : 'bg-surface-900/90 hover:bg-surface-800/90 text-surface-300 hover:text-surface-100 border-surface-700/80 hover:border-surface-600'}`}
                  title="Insert image">
                  <Plus size={12} />
                </button>
                {showInsertMenu && (
                  <div className="astryx-selector-popup absolute bottom-full left-0 mb-1.5 popover-surface rounded-2xl p-1 min-w-[190px] z-50 animate-in fade-in zoom-in-95 duration-150">
                    <button onClick={handleInsertLibraryOpen}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 text-surface-300 hover:text-surface-100 hover:bg-surface-800/60 transition-colors">
                      <Library size={12} className="text-accent-400" /> Insert from library
                    </button>
                    <button onClick={() => insertFileRef.current?.click()}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 text-surface-300 hover:text-surface-100 hover:bg-surface-800/60 transition-colors">
                      <Upload size={12} className="text-blue-400" /> Upload file
                    </button>
                  </div>
                )}
              </div>
              <input ref={insertFileRef} type="file" accept="image/*" className="hidden" onChange={handleInsertUpload} />

              {/* Model */}
              {!embedded && (
              <div className="relative" ref={modelsRef}>
                <button
                  onClick={() => {
                    setShowModels(!showModels)
                    if (!showModels) setModelSearchQuery('')
                  }}
                  className="flex items-center gap-1.5 h-7 px-2.5 py-1 bg-surface-900/90 hover:bg-surface-800/90 border border-surface-700/80 hover:border-surface-600 rounded-pill text-[11px] font-medium text-surface-200 transition-all shadow-sm"
                >
                  <span className="flex size-3.5 shrink-0 items-center justify-center">
                    <ProviderLogo provider={getProviderForModel(currentModel)} size={13} />
                  </span>
                  <span className="font-medium text-surface-100">{cleanModelName(currentModel.name) || (models.length === 0 ? 'Sin proveedor' : 'Seleccionar Modelo')}</span>
                  <ChevronDown size={11} className={`text-surface-400 transition-transform duration-150 ${showModels ? 'rotate-180 text-surface-200' : ''}`} />
                </button>
                  {showModels && (() => {
                    const q = modelSearchQuery.toLowerCase().trim()
                    const filteredBySearch = q
                    ? models.filter(m => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) || (m.provider && m.provider.toLowerCase().includes(q)))
                    : models

                    const filtered = modelProviderFilter === 'all'
                      ? filteredBySearch
                      : filteredBySearch.filter(m => (m.provider || 'kie') === modelProviderFilter)

                    const groups = PROVIDER_DEFS.map((p) => ({
                      id: p.id,
                      label: p.label,
                      provider: p.id,
                      items: filtered.filter((m) => (m.provider || 'kie') === p.id),
                    })).filter((g) => g.items.length > 0)

                    const existingGroupIds = new Set(groups.map((g) => g.id))
                    const extraProviders = Array.from(new Set(filtered.map((m) => m.provider || 'kie').filter((pid) => !existingGroupIds.has(pid))))
                    for (const pid of extraProviders) {
                      groups.push({
                        id: pid,
                        label: pid.charAt(0).toUpperCase() + pid.slice(1),
                        provider: pid,
                        items: filtered.filter((m) => (m.provider || 'kie') === pid),
                      })
                    }

                    return (
                    <div className="astryx-selector-popup absolute bottom-full left-0 mb-1.5 popover-surface rounded-2xl p-1 min-w-[290px] w-max max-w-[380px] max-h-[380px] flex flex-col overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                      {/* Astryx Search */}
                      <div className="p-1.5 border-b border-surface-800 bg-surface-950/50 flex-shrink-0 flex items-center gap-1.5">
                        <div className="relative flex items-center flex-1">
                          <input
                            type="text"
                            value={modelSearchQuery}
                            onChange={(e) => setModelSearchQuery(e.target.value)}
                            placeholder="Buscar modelo..."
                            autoFocus
                            className="w-full bg-surface-800/90 text-xs text-surface-200 pl-2.5 pr-6 py-1.5 rounded-lg border border-surface-700/80 outline-none focus:border-accent-500 placeholder:text-surface-500 transition-colors"
                          />
                          {modelSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setModelSearchQuery('')}
                              className="absolute right-2 text-surface-500 hover:text-surface-300"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                        {(mode === 'video' || mode === 'image') && (
                          <button
                            type="button"
                            onClick={() => { setShowModels(false); setShowPriceCompare(true) }}
                            title="Comparar precios entre proveedores"
                            className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-pill border border-surface-700/80 bg-surface-800/90 text-[11px] font-medium text-surface-300 hover:text-accent-300 hover:border-accent-500/50 transition-colors"
                          >
                            <Scale size={12} />
                            Comparar
                          </button>
                        )}
                      </div>

                      {/* Provider Filter Badges / Pills */}
                      {modelProviderPills.length > 1 && (
                        <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 border-b border-surface-800/80 bg-surface-950/40 scrollbar-none shrink-0">
                          {modelProviderPills.map((pill) => {
                            const active = modelProviderFilter === pill.id
                            return (
                              <button
                                key={pill.id}
                                type="button"
                                onClick={() => setModelProviderFilter(pill.id)}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                  active
                                    ? 'bg-accent-500/20 text-accent-300 border border-accent-500/40 shadow-xs'
                                    : 'bg-surface-800/60 hover:bg-surface-800 text-surface-400 hover:text-surface-200 border border-surface-700/60'
                                }`}
                              >
                                {pill.id !== 'all' && (
                                  <span className="flex size-3 shrink-0 items-center justify-center">
                                    <ProviderLogo provider={pill.id} size={11} />
                                  </span>
                                )}
                                <span>{pill.label}</span>
                                <span className={`text-[9px] ${active ? 'text-accent-400 font-semibold' : 'text-surface-500'}`}>
                                  {pill.count}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {/* Model list with Astryx SelectorOption */}
                      <div className="overflow-y-auto max-h-[280px] p-0.5 space-y-0.5 divide-y divide-surface-800/40">
                        {groups.length === 0 ? (
                          <div className="p-4 text-center text-xs text-surface-400 space-y-2">
                            <p>No hay modelos disponibles para este modo con los proveedores configurados.</p>
                            {availableModes.filter((am) => am !== mode).length > 0 && (
                              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                                {availableModes.filter((am) => am !== mode).map((am) => (
                                  <button
                                    key={am}
                                    type="button"
                                    onClick={() => {
                                      switchMode(am as any)
                                      setShowModels(false)
                                    }}
                                    className="px-2.5 py-1 bg-accent-600 hover:bg-accent-500 text-on-accent rounded-pill text-[11px] font-medium transition-colors"
                                  >
                                    Cambiar a {am === 'video' ? 'Video' : am === 'image' ? 'Imagen' : 'Audio'}
                                  </button>
                                ))}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => useAppStore.getState().setPage('providers')}
                              className="text-[11px] text-accent-400 hover:text-accent-300 underline block mx-auto cursor-pointer pt-1"
                            >
                              Configurar más Providers →
                            </button>
                          </div>
                        ) : (
                          groups.map((g) => (
                            <div key={g.id} className="py-1">
                              <div className="eyebrow px-2.5 pt-1.5 pb-1 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <ProviderLogo provider={g.provider} size={12} />
                                  <span>{g.label}</span>
                                </span>
                                <span className="text-[9px] font-mono text-surface-600">{g.items.length}</span>
                              </div>
                              <div className="space-y-0.5">
                                {g.items.map((m) => {
                                  const isSelected = modelName === m.name
                                  const isKie = (m.provider || 'kie') === 'kie'
                                  const costDisplay = isKie
                                    ? `${Math.round((m.prices[0]?.cost || 0) * 200)} cr`
                                    : `$${(m.prices[0]?.cost || 0).toFixed(3)}/${m.unit === 's' ? 's' : 'img'}`

                                  const descriptionText = `${m.category}${m.resolutions && m.resolutions.length > 0 ? ` • ${m.resolutions.join(', ')}` : ''}`
                                  const pId = getProviderForModel(m)

                                  return (
                                    <SelectorOption
                                      key={`${g.label}-${m.name}`}
                                      icon={<ProviderLogo provider={pId} size={15} />}
                                      label={cleanModelName(m.name)}
                                      description={descriptionText}
                                      layout="stacked"
                                      selected={isSelected}
                                      hideCheck
                                      size="sm"
                                      onClick={() => {
                                        setModelName(m.name)
                                        setShowModels(false)
                                        if (m.resolutions && m.resolutions.length > 0) {
                                          // The draft option is opt-in, never the default
                                          setResolution(m.resolutions.find(r => r !== SEEDANCE_DRAFT_RES) || m.resolutions[0])
                                        } else if (m.prices && m.prices[0]) {
                                          setResolution(m.prices[0].resolution)
                                        }
                                        if (!m.t2vId?.startsWith('pixverse-v6/') && !m.i2vId?.startsWith('pixverse-v6/')) {
                                          setShowRefsModal(false)
                                          setImageRefEntries([])
                                        }
                                      }}
                                      endContent={
                                        costDisplay ? (
                                          <PriceBadge model={m} label={costDisplay} activeResolution={isSelected ? resolution : undefined} />
                                        ) : null
                                      }
                                    />
                                  )
                                })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    )
                  })()}
              </div>
              )}

              {showPriceCompare && (
                <PriceComparatorModal
                  initialComparisonId={findPriceComparison(currentModel)?.id}
                  initialKind={mode === 'image' ? 'image' : 'video'}
                  onClose={() => setShowPriceCompare(false)}
                  onUse={(m, res) => {
                    const pickMode = m.t2iId ? 'image' : 'video'
                    if (pickMode !== mode) {
                      // Switching mode restores that mode's saved model; the pick is applied after it
                      pendingPickRef.current = { name: m.name, resolution: res }
                      switchMode(pickMode)
                    } else {
                      setModelName(m.name)
                      setResolution(res)
                    }
                    setShowPriceCompare(false)
                  }}
                />
              )}

              {/* Camera control */}
              {mode !== 'audio' && !isTopaz && !isAiInfluencer && !isMotionTransfer && (
                <CameraControl
                  enabled={cameraEnabled}
                  onToggleEnabled={setCameraEnabled}
                  disabled={cameraDisabled}
                  onDisabledChange={setCameraDisabled}
                  camera={cameraBody}
                  onCameraChange={setCameraBody}
                  lens={cameraLens}
                  onLensChange={setCameraLens}
                  shot={cameraShot}
                  onShotChange={setCameraShot}
                  level={cameraLevel}
                  onLevelChange={setCameraLevel}
                  movement={cameraMovement}
                  onMovementChange={setCameraMovement}
                  lighting={lighting}
                  onLightingChange={setLighting}
                  filmLook={filmLook}
                  onFilmLookChange={setFilmLook}
                  speed={cameraSpeed}
                  onSpeedChange={setCameraSpeed}
                  mode={mode}
                  embedded={embedded}
                />
              )}

              {/* Audio duration for music models */}
              {mode === 'audio' && currentModel.kind === 'music' && !currentModel.hideDuration && (
                <StreamDuration
                  value={duration}
                  options={currentModel.durationOptions}
                  min={3}
                  max={currentModel.durationMax || 600}
                  onChange={handleDurationChange}
                />
              )}

              {mode === 'audio' && currentModel.supportsInstrumental && (
                <button type="button" onClick={() => setInstrumental(!instrumental)}
                  title={instrumental ? 'Instrumental: sin voces' : 'Con voces (letra generada por el modelo)'}
                  className={`flex items-center gap-1 h-7 px-2.5 py-1 rounded-pill text-[11px] font-medium border transition-all shadow-sm ${
                    instrumental
                      ? 'bg-accent-600 text-on-accent border-accent-500'
                      : 'bg-surface-900/90 hover:bg-surface-800/90 border-surface-700/80 hover:border-surface-600 text-surface-300 hover:text-surface-100'
                  }`}>
                  <Music size={11} />
                  Instrumental
                </button>
              )}

              {/* Toggles: FF, Multi-shot, Image Refs, Sound */}
              {!isTopaz && (((currentModel.fflfId || isKling || mode === 'video') && !isHiggsfield) || isHiggsfieldRefVideo) && (
                <button
                  type="button"
                  onClick={() => {
                    if (isHiggsfieldRefVideo) {
                      if (isFFLF) {
                        setHiggsfieldFfEnabled(false)
                        const back: any[] = []
                        if (firstFrameBase64) back.push({ base64: firstFrameBase64, mime: 'image/png' })
                        else if (firstFrameUrl) back.push({ url: firstFrameUrl, mime: 'image/png' })
                        if (lastFrameBase64) back.push({ base64: lastFrameBase64, mime: 'image/png' })
                        else if (lastFrameUrl) back.push({ url: lastFrameUrl, mime: 'image/png' })
                        setFirstFrameBase64(null)
                        setFirstFrameUrl(null)
                        setLastFrameBase64(null)
                        setLastFrameUrl(null)
                        firstFrameRef.current = null
                        lastFrameRef.current = null
                        if (back.length) setRefs(prev => [...prev, ...back])
                      } else {
                        setHiggsfieldFfEnabled(true)
                        const userImageRefs = refs.filter(r => r.mime.startsWith('image/') && !(r as any).elementName)
                        const others = refs.filter(r => !userImageRefs.includes(r))
                        if (userImageRefs[0]?.base64) {
                          setFirstFrameBase64(userImageRefs[0].base64)
                          firstFrameRef.current = userImageRefs[0].base64
                        } else if (userImageRefs[0]?.url) {
                          setFirstFrameUrl(userImageRefs[0].url)
                        }
                        if (userImageRefs[1]?.base64) {
                          setLastFrameBase64(userImageRefs[1].base64)
                          lastFrameRef.current = userImageRefs[1].base64
                        } else if (userImageRefs[1]?.url) {
                          setLastFrameUrl(userImageRefs[1].url)
                        }
                        setRefs([...userImageRefs.slice(2), ...others])
                      }
                    } else if (isFFLF) {
                      setSeedanceMode('ref')
                      setFirstFrameBase64(null)
                      setFirstFrameUrl(null)
                      setLastFrameBase64(null)
                      setLastFrameUrl(null)
                      firstFrameRef.current = null
                      lastFrameRef.current = null
                    } else {
                      setSeedanceMode('fflf')
                      // Redistribute user image refs into FF/LF: 1 ref -> FF, 2 refs -> FF + LF
                      const userImageRefs = refs.filter(r => r.mime.startsWith('image/') && !(r as any).elementName)
                      const others = refs.filter(r => !userImageRefs.includes(r))
                      if (userImageRefs[0]?.base64) {
                        setFirstFrameBase64(userImageRefs[0].base64)
                        firstFrameRef.current = userImageRefs[0].base64
                      } else if (userImageRefs[0]?.url) {
                        setFirstFrameUrl(userImageRefs[0].url)
                      }
                      if (userImageRefs[1]?.base64) {
                        setLastFrameBase64(userImageRefs[1].base64)
                        lastFrameRef.current = userImageRefs[1].base64
                      } else if (userImageRefs[1]?.url) {
                        setLastFrameUrl(userImageRefs[1].url)
                      }
                      setRefs([...userImageRefs.slice(2), ...others])
                    }
                  }}
                  className={`flex items-center gap-1 h-7 px-2.5 py-1 rounded-pill text-[11px] font-medium border transition-all shadow-sm ${
                    isFFLF
                      ? 'bg-accent-600 text-on-accent border-accent-500'
                      : 'bg-surface-900/90 hover:bg-surface-800/90 border-surface-700/80 hover:border-surface-600 text-surface-300 hover:text-surface-100'
                  }`}
                >
                  FF
                </button>
              )}
              {isPixverseV6 && (
                <button onClick={() => {
                    if (imageRefEntries.length === 0) setImageRefEntries([{ name: '', type: 'subject' }])
                    setShowRefsModal(true)
                  }}
                  className={`flex items-center gap-1 h-7 px-2.5 py-1 rounded-pill text-[11px] font-medium border transition-all shadow-sm ${
                    imageRefEntries.some(e => e.base64)
                      ? 'bg-accent-600 text-on-accent border-accent-500'
                      : 'bg-surface-900/90 hover:bg-surface-800/90 border-surface-700/80 hover:border-surface-600 text-surface-300 hover:text-surface-100'
                  }`}>
                  Refs {imageRefEntries.some(e => e.base64) ? <span className="text-[10px]">({imageRefEntries.filter(e => e.base64).length})</span> : null}
                </button>
              )}
              {isKling30 && (
                <button onClick={() => { setMultiShots(!multiShots); if (!multiShots && multiPrompt.length === 0) setMultiPrompt([{ prompt: '', duration: 5 }]) }}
                  className={`flex items-center gap-1 h-7 px-2.5 py-1 rounded-pill text-[11px] font-medium border transition-all shadow-sm ${
                    multiShots
                      ? 'bg-accent-600 text-on-accent border-accent-500'
                      : 'bg-surface-900/90 hover:bg-surface-800/90 border-surface-700/80 hover:border-surface-600 text-surface-300 hover:text-surface-100'
                  }`}>
                  Multi-shot
                </button>
              )}
              {(isKling || isSeedance || isPixverseV6 || isWan3 || isHiggsfield || isMachgen) && mode === 'video' && !isTopaz && !isMotionTransfer && (
                <button onClick={() => setSoundEnabled(!soundEnabled)}
                  title={soundEnabled ? 'Sonido / Audio activado' : 'Sonido / Audio desactivado'}
                  className={`flex items-center justify-center h-7 px-2.5 py-1 rounded-pill text-[11px] font-medium border transition-all shadow-sm ${
                    soundEnabled
                      ? 'bg-accent-600 text-on-accent border-accent-500'
                      : 'bg-surface-900/90 hover:bg-surface-800/90 border-surface-700/80 hover:border-surface-600 text-surface-300 hover:text-surface-100'
                  }`}>
                  <Music size={11} />
                </button>
              )}

              {/* Selects */}

              {/* Aspect Ratio Selector */}
              {hasAspectRatio && (
                <div className="relative" ref={ratiosRef}>
                  <button
                    type="button"
                    onClick={() => { if (!grokSingleI2v) setShowRatios(!showRatios) }}
                    disabled={grokSingleI2v}
                    title={grokSingleI2v ? 'Con una sola imagen, el aspecto del video sigue la imagen adjunta (Grok i2v). Usa 2+ imágenes o text-to-video para elegir el ratio.' : undefined}
                    className="flex items-center gap-1.5 h-7 px-2.5 py-1 bg-surface-900/90 hover:bg-surface-800/90 border border-surface-700/80 hover:border-surface-600 rounded-pill text-[11px] font-medium text-surface-200 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>{aspectRatio}</span>
                    <ChevronDown size={11} className={`text-surface-400 transition-transform duration-150 ${showRatios ? 'rotate-180 text-surface-200' : ''}`} />
                  </button>
                  {showRatios && (
                    <div className="astryx-selector-popup absolute bottom-full left-0 mb-1.5 popover-surface rounded-2xl p-1 min-w-[100px] z-50 animate-in fade-in zoom-in-95 duration-150">
                      {availableAspectRatios.map((r) => {
                        const isSelected = aspectRatio === r
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => { setAspectRatio(r); setShowRatios(false) }}
                            className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition-colors flex items-center justify-between ${
                              isSelected
                                ? 'text-accent-400 bg-accent-500/10 font-medium'
                                : 'text-surface-300 hover:text-surface-100 hover:bg-surface-800/60'
                            }`}
                          >
                            <span>{r}</span>
                            {isSelected && <span className="size-1.5 rounded-full bg-accent-400" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Resolution Selector */}
              {!embedded && !isTopazVideo && availableResolutions.length > 0 && (
                <div className="relative" ref={resRef}>
                  <button
                    type="button"
                    onClick={() => setShowRes(!showRes)}
                    className="flex items-center gap-1.5 h-7 px-2.5 py-1 bg-surface-900/90 hover:bg-surface-800/90 border border-surface-700/80 hover:border-surface-600 rounded-pill text-[11px] font-medium text-surface-200 transition-all shadow-sm"
                  >
                    <span>{resolution || availableResolutions[0]}</span>
                    <ChevronDown size={11} className={`text-surface-400 transition-transform duration-150 ${showRes ? 'rotate-180 text-surface-200' : ''}`} />
                  </button>
                  {showRes && (
                    <div className="astryx-selector-popup absolute bottom-full left-0 mb-1.5 popover-surface rounded-2xl p-1 min-w-[90px] z-50 animate-in fade-in zoom-in-95 duration-150">
                      {availableResolutions.map((r) => {
                        const isSelected = (resolution || availableResolutions[0]) === r
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => { setResolution(r); setShowRes(false) }}
                            className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition-colors flex items-center justify-between ${
                              isSelected
                                ? 'text-accent-400 bg-accent-500/10 font-medium'
                                : 'text-surface-300 hover:text-surface-100 hover:bg-surface-800/60'
                            }`}
                          >
                            <span>{r}</span>
                            {isSelected && <span className="size-1.5 rounded-full bg-accent-400" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Duration for video */}
              {mode === 'video' && currentModel.durationFromInputVideo && (
                <span
                  className="flex items-center h-7 px-2.5 rounded-pill text-[11px] border bg-surface-900/90 border-surface-700/80 text-surface-300 shadow-sm"
                  title={isMotionTransfer ? 'Motion Transfer usa el video de origen (mín. 4 s, se recorta a 30 s): la duración y el coste salen de su largo' : 'El upscale procesa el video completo: la duración y el coste salen de su largo'}
                >
                  {(() => {
                    const secs = refs.find(r => r.mime.startsWith('video/'))?.duration
                    return secs ? `${Math.ceil(secs)}s (del video)` : 'Duración: la del video'
                  })()}
                </span>
              )}
              {mode === 'video' && !currentModel.durationFromInputVideo && currentModel.t2vId !== 'omnihuman-1-5' && (!isReplicate || isPVideo) && !(multiShots && isKling30) && (
                <StreamDuration
                  value={duration}
                  options={currentModel.durationOptions}
                  min={isPVideo ? 1 : 4}
                  max={currentModel.durationMax || 15}
                  onChange={handleDurationChange}
                />
              )}

              {/* Topaz upscale engine (MachGen). Auto = the tier default; every engine in a tier costs the same */}
              {mode === 'video' && !!currentModel.upscaleEngines?.length && (
                <label
                  className="flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-pill text-[11px] border bg-surface-900/90 border-surface-700/80 text-surface-300 shadow-sm"
                  title="Topaz engine: pick the one that fits the source (all engines in this tier cost the same)"
                >
                  <span className="text-surface-500">Engine</span>
                  <select
                    value={currentModel.upscaleEngines.includes(upscaleEngine) ? upscaleEngine : ''}
                    onChange={(e) => setUpscaleEngine(e.target.value)}
                    className="bg-transparent text-surface-100 outline-none cursor-pointer"
                  >
                    <option value="" className="bg-surface-900">Auto</option>
                    {currentModel.upscaleEngines.map((eng) => (
                      <option key={eng} value={eng} className="bg-surface-900">{eng}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* Replicate Avatar voice & language */}
              {isReplicateAvatar && (
                <>
                  <select
                    value={replicateVoice}
                    onChange={(e) => setReplicateVoice(e.target.value)}
                    disabled={hasReplicateAudio}
                    title={hasReplicateAudio ? 'Voice is driven by the attached audio' : 'Voice'}
                    className="h-7 bg-surface-900/90 border border-surface-700/80 hover:border-surface-600 rounded-pill px-2 py-1 text-[11px] font-medium text-surface-200 outline-none transition-all shadow-sm max-w-[140px] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {currentModel.replicateVoices?.map((v) => <option key={v} value={v} className="bg-surface-900 text-surface-200">{v.replace(' (Female)', ' ♀').replace(' (Male)', ' ♂')}</option>)}
                  </select>
                  <select
                    value={replicateLanguage}
                    onChange={(e) => setReplicateLanguage(e.target.value)}
                    disabled={hasReplicateAudio}
                    title={hasReplicateAudio ? 'Language is driven by the attached audio' : 'Language'}
                    className="h-7 bg-surface-900/90 border border-surface-700/80 hover:border-surface-600 rounded-pill px-2 py-1 text-[11px] font-medium text-surface-200 outline-none transition-all shadow-sm max-w-[140px] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {currentModel.replicateLanguages?.map((l) => <option key={l} value={l} className="bg-surface-900 text-surface-200">{l}</option>)}
                  </select>
                </>
              )}

              {/* P-Video FPS and Draft */}
              {isPVideo && (
                <>
                  <select
                    value={pVideoFps}
                    onChange={(e) => setPVideoFps(Number(e.target.value))}
                    title="FPS"
                    className="h-7 bg-surface-900/90 border border-surface-700/80 hover:border-surface-600 rounded-pill px-2 py-1 text-[11px] font-medium text-surface-200 outline-none transition-all shadow-sm"
                  >
                    <option value={24} className="bg-surface-900 text-surface-200">24 fps</option>
                    <option value={48} className="bg-surface-900 text-surface-200">48 fps</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setPVideoDraft(!pVideoDraft)}
                    title="Draft mode: 4x faster, lower-quality preview"
                    className={`flex items-center gap-1 h-7 px-2.5 py-1 rounded-pill text-[11px] font-medium border transition-all shadow-sm ${
                      pVideoDraft
                        ? 'bg-accent-600 text-on-accent border-accent-500'
                        : 'bg-surface-900/90 hover:bg-surface-800/90 border-surface-700/80 hover:border-surface-600 text-surface-300 hover:text-surface-100'
                    }`}
                  >
                    Draft
                  </button>
                </>
              )}

              {/* FPS: only for models that offer more than one frame rate */}
              {hasFpsChoice && !isPVideo && (
                <div className="flex items-center gap-1">
                  <select
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    title="FPS (fotogramas por segundo)"
                    className="h-7 bg-surface-900/90 border border-surface-700/80 hover:border-surface-600 rounded-pill px-2 py-1 text-[11px] font-medium text-surface-200 outline-none transition-all shadow-sm"
                  >
                    {fpsChoices.map((f) => (
                      <option key={f} value={f} className="bg-surface-900 text-surface-200">{f} fps</option>
                    ))}
                  </select>
                </div>
              )}

              {/* AI Influencer: trait catalog, seed, identity image */}
              {isAiInfluencer && (
                <AiInfluencerControls value={influencerOpts} onChange={setInfluencerOpts} />
              )}

              {/* Graphic Ads Image Controls */}
              {isMarketingStudio && (
                <>
                  {/* Quality selector */}
                  <select
                    value={msQuality}
                    onChange={(e) => setMsQuality(e.target.value as any)}
                    title="Calidad de renderizado"
                    className="h-7 bg-surface-900/90 border border-surface-700/80 hover:border-surface-600 rounded-pill px-2 py-1 text-[11px] font-medium text-surface-200 outline-none transition-all shadow-sm"
                  >
                    <option value="high" className="bg-surface-900 text-surface-200">High</option>
                    <option value="medium" className="bg-surface-900 text-surface-200">Medium</option>
                    <option value="low" className="bg-surface-900 text-surface-200">Low</option>
                  </select>

                  {/* Moderation selector */}
                  <select
                    value={msModeration}
                    onChange={(e) => setMsModeration(e.target.value as any)}
                    title="Nivel de moderación de contenido"
                    className="h-7 bg-surface-900/90 border border-surface-700/80 hover:border-surface-600 rounded-pill px-2 py-1 text-[11px] font-medium text-surface-200 outline-none transition-all shadow-sm"
                  >
                    <option value="auto" className="bg-surface-900 text-surface-200">Mod: Auto</option>
                    <option value="low" className="bg-surface-900 text-surface-200">Mod: Low</option>
                  </select>

                  {/* Enhance Prompt toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = !msEnhancePrompt
                      setMsEnhancePrompt(next)
                      if (next && msPresetsList.length === 0 && !msLoadingPresets) {
                        setMsLoadingPresets(true)
                        const api = (window as any).electronAPI
                        api?.higgsfield?.presets?.().then((res: any) => {
                          if (res?.items && Array.isArray(res.items)) {
                            setMsPresetsList(res.items)
                            if (!msPresetId && res.items.length > 0) setMsPresetId(res.items[0].id)
                          }
                        }).finally(() => {
                          setMsLoadingPresets(false)
                          setMsPresetsLoaded(true)
                        })
                      }
                    }}
                    title={`${isMarketplace ? 'Marketplace Design' : 'Graphic Ads'} Enhance: optimiza y expande el prompt para un mejor diseño estético`}
                    className={`flex items-center gap-1 h-7 px-2.5 py-1 rounded-pill text-[11px] font-medium border transition-all shadow-sm ${
                      msEnhancePrompt
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-400 font-semibold'
                        : 'bg-surface-900/90 hover:bg-surface-800/90 border-surface-700/80 hover:border-surface-600 text-surface-300 hover:text-surface-100'
                    }`}
                  >
                    <Sparkles size={11} className={msEnhancePrompt ? 'animate-pulse' : ''} /> Enhance
                  </button>

                  {/* Preset Selector Dropdown */}
                  {(msEnhancePrompt || msPresetsList.length > 0) && (
                    <div className="relative" ref={msPresetsRef}>
                      <button
                        type="button"
                        onClick={() => setShowMsPresets(!showMsPresets)}
                        title={`Selecciona el estilo o preset de ${isMarketplace ? 'Marketplace Design' : 'Graphic Ads'}`}
                        className="flex items-center gap-1.5 h-7 px-2.5 py-1 bg-surface-900/90 hover:bg-surface-800/90 border border-surface-700/80 hover:border-surface-600 rounded-pill text-[11px] font-medium text-surface-200 transition-all shadow-sm max-w-[170px]"
                      >
                        <span className="truncate">
                          {msLoadingPresets
                            ? 'Cargando presets...'
                            : (msPresetsList.find(p => p.id === msPresetId)?.name || 'Preset')}
                        </span>
                        <ChevronDown size={11} className={`text-surface-400 transition-transform duration-150 shrink-0 ${showMsPresets ? 'rotate-180 text-surface-200' : ''}`} />
                      </button>
                      {showMsPresets && (
                        <div className="astryx-selector-popup absolute bottom-full left-0 mb-1.5 popover-surface rounded-2xl p-1 min-w-[200px] max-w-[280px] max-h-[260px] overflow-y-auto z-50 animate-in fade-in zoom-in-95 duration-150">
                          {msLoadingPresets ? (
                            <div className="p-3 text-center text-xs text-surface-400">Cargando presets...</div>
                          ) : msPresetsList.length === 0 ? (
                            <div className="p-3 text-center text-xs text-surface-400">No hay presets disponibles</div>
                          ) : (
                            msPresetsList.map((preset) => {
                              const isSelected = msPresetId === preset.id
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() => {
                                    setMsPresetId(preset.id)
                                    setShowMsPresets(false)
                                  }}
                                  className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition-colors flex items-center justify-between ${
                                    isSelected
                                      ? 'text-accent-400 bg-accent-500/10 font-medium'
                                      : 'text-surface-300 hover:text-surface-100 hover:bg-surface-800/60'
                                  }`}
                                >
                                  <span className="truncate pr-2">{preset.name}</span>
                                  {isSelected && <span className="size-1.5 rounded-full bg-accent-400 shrink-0" />}
                                </button>
                              )
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="flex-1" />
            </div>
              </div>

              {/* Right side: Generate button */}
              <div className="self-end shrink-0">
                <button onClick={handleGenerate} disabled={disabled || (mode === 'audio' ? !prompt.trim() : (showRefsModal ? !prompt.trim() || (!imageRefEntries.some(e => e.base64) && !imageBase64 && refs.length === 0) : (multiShots ? !multiPrompt.some(s => s.prompt.trim()) || multiPrompt.reduce((a, x) => a + x.duration, 0) > 15 : (isFFLF ? (!prompt.trim() && !firstFrameBase64 && !(isMachgen && lastFrameBase64)) : (isAiInfluencer ? false : isMotionTransfer ? (!hasVideoRef || (!hasImageRef && !imageBase64 && !imageRefEntries.some(e => e.base64))) : isHiggsfield ? !prompt.trim() : (isReplicate ? (isPVideo ? !prompt.trim() : (!prompt.trim() && !imageBase64 && !refs.some(r => r.mime.startsWith('audio/')) && !refs.some(r => r.mime.startsWith('video/')))) : !prompt.trim() && !imageBase64 && !firstFrameBase64 && refs.length === 0))))))}
                  className={`flex-shrink-0 aspect-square flex flex-col items-center justify-center gap-0.5 ${iconOnlyGenerate ? 'w-10 h-10 p-0' : 'w-16 h-16 p-1'} bg-accent-600 hover:bg-accent-500 disabled:bg-accent-600/50 disabled:cursor-not-allowed text-on-accent rounded-full text-sm font-medium transition-all active:scale-[0.97] cursor-pointer`}
                  title="Generar">
                  {iconOnlyGenerate ? (
                    <Sparkles size={16} />
                  ) : (
                    <>
                      <span className="flex items-center justify-center gap-1 leading-none">
                        <Sparkles size={13} />
                        <span className="text-xs font-semibold leading-none">{totalCredits}</span>
                      </span>
                      <span className="text-[10px] opacity-80 leading-none">
                        ${totalDollars.toFixed(2)}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Hidden file inputs */}
        <input id="file-all" type="file" accept={[
          ...(mode === 'image' || hasImageSupport ? ['image/*'] : []),
          ...(currentModel.supportsVideoRef ? ['video/*'] : []),
          ...(currentModel.supportsAudioRef ? ['audio/*'] : []),
        ].join(',')} className="hidden" onChange={async (e) => {
          const files = e.target.files
          if (!files || files.length === 0) return
          let localFF = firstFrameRef.current
          let localLF = lastFrameRef.current
          for (let i = 0; i < files.length; i++) {
            const file = files[i]
            const MAX_SIZE = file.type.startsWith('video/') ? 50 * 1024 * 1024 : file.type.startsWith('audio/') ? 20 * 1024 * 1024 : 10 * 1024 * 1024
            if (file.size > MAX_SIZE) { showError(`"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(0)}MB)`); continue }
            const { base64, mime } = await readFileAsBase64(file)
            if (mime.startsWith('audio/') && !currentModel.supportsAudioRef) { showError(`Cannot read "${file.name}" (this model does not support audio input)`); continue }
            if (mime.startsWith('video/') && !currentModel.supportsVideoRef) { showError(`Cannot read "${file.name}" (this model does not support video input)`); continue }
            if (mime.startsWith('image/') && mode !== 'image' && !hasImageSupport) { showError(`Cannot read "${file.name}" (this model does not support image input)`); continue }
            if (mime.startsWith('image/') && isFFLF) {
              if (!localFF) { setFirstFrameBase64(base64); firstFrameRef.current = base64; localFF = base64 }
              else if (!localLF) { setLastFrameBase64(base64); lastFrameRef.current = base64; localLF = base64 }
              else setRefs(prev => [...prev, { base64, mime }])
            } else {
              setRefs(prev => [...prev, { base64, mime }])
            }
          }
          e.target.value = ''
        }} />
        <input id={`file-video-${instanceId}`} type="file" accept="video/*" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          await handleVideoRef(file)
          e.target.value = ''
        }} />
        <input id={`file-audio-${instanceId}`} type="file" accept="audio/*" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          if (file.size > 20 * 1024 * 1024) { showError(`Audio "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(0)}MB)`); return }
          const { base64, mime } = await readFileAsBase64(file)
          setRefs(prev => [...prev, { base64, mime }])
          e.target.value = ''
        }} />
      </div>

      {/* Image References Modal */}
      {showRefsModal && (typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={() => setShowRefsModal(false)}>
          <div className="modal-scrim" />
          <div
            className="relative modal-surface w-[420px] max-w-[94vw] max-h-[80vh] flex flex-col z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
              <h3 className="text-sm font-medium text-surface-200">Image References</h3>
              <button onClick={() => setShowRefsModal(false)} className="text-surface-500 hover:text-surface-300">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-3 space-y-3">
              {imageRefEntries.map((entry, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-surface-500 w-4 flex-shrink-0">#{i + 1}</span>
                  <label className="w-10 h-10 border border-dashed border-surface-700 hover:border-accent-500/50 rounded-lg flex items-center justify-center cursor-pointer flex-shrink-0 overflow-hidden">
                    {entry.base64 ? (
                      <img src={`data:${entry.mime};base64,${entry.base64}`} className="w-full h-full object-cover" alt={entry.name} />
                    ) : (
                      <Upload size={12} className="text-surface-500" />
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const { base64, mime } = await readFileAsBase64(file)
                      const next = [...imageRefEntries]
                      next[i] = { ...next[i], base64, mime }
                      setImageRefEntries(next)
                      e.target.value = ''
                    }} />
                  </label>
                  <div className="flex-1 flex gap-1.5">
                    <input
                      value={entry.name}
                      onChange={(e) => {
                        const next = [...imageRefEntries]
                        next[i] = { ...next[i], name: e.target.value }
                        setImageRefEntries(next)
                      }}
                      placeholder="Name (type @name in prompt)"
                      className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-2 py-1.5 text-xs text-surface-200 outline-none focus:border-accent-500/50"
                    />
                    <select
                      value={entry.type}
                      onChange={(e) => {
                        const next = [...imageRefEntries]
                        next[i] = { ...next[i], type: e.target.value as 'subject' | 'background' }
                        setImageRefEntries(next)
                      }}
                      className="bg-surface-800 border border-surface-700 rounded-lg px-1.5 py-1.5 text-[11px] text-surface-300 outline-none w-24"
                    >
                      <option value="subject">Subject</option>
                      <option value="background">Background</option>
                    </select>
                  </div>
                  <button onClick={() => setImageRefEntries(prev => prev.filter((_, j) => j !== i))}
                    className="p-1 text-surface-500 hover:text-red-400 flex-shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setImageRefEntries(prev => [...prev, { name: '', type: 'subject' }])}
                disabled={imageRefEntries.length >= 5}
                className={`w-full py-2 border border-dashed rounded-lg text-xs transition-colors ${imageRefEntries.length < 5 ? 'border-surface-700 text-surface-500 hover:border-accent-500/50 hover:text-accent-400' : 'border-surface-800 text-surface-700 cursor-not-allowed'}`}
              >
                + Add reference
              </button>
            </div>
            <div className="border-t border-surface-800 px-4 py-2.5">
              <button
                onClick={() => setShowRefsModal(false)}
                className="w-full py-2 bg-accent-600 hover:bg-accent-500 text-on-accent rounded-pill text-sm font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null)}

      {/* Insert image from library modal */}
      {showInsertLibrary && (
        <ImageLibraryPicker
          onSelect={handleInsertLibrarySelect}
          onClose={() => setShowInsertLibrary(false)}
          allowVideo={currentModel.supportsVideoRef}
          allowAudio={currentModel.supportsAudioRef}
        />
      )}
    </>
  )
})

function OmniAudioWarn() {
  const [hover, setHover] = useState(false)
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  return (
    <span
      ref={anchorRef}
      className="relative flex-shrink-0 flex items-center self-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 cursor-help" />
      {hover && (
        <ViewportPopover anchor={anchorRef.current}>
          <span className="block w-[340px] max-w-full p-1 text-[10px] text-surface-300 leading-relaxed">
            Duration must be less than 60 seconds (recommended 15 seconds or less; exceeding this will cause quality degradation). Accepted file types: audio/mpeg, audio/wav, audio/x-wav, audio/aac, audio/ogg, audio/mp4. Max file size: 10MB.
          </span>
        </ViewportPopover>
      )}
    </span>
  )
}

// Media inside a preview never exceeds the viewport (popover padding + margins = 28px)
const PREVIEW_IMG_STYLE: React.CSSProperties = { maxWidth: 'min(400px, calc(100vw - 28px))', maxHeight: 'min(420px, calc(100vh - 28px))' }
const PREVIEW_VIDEO_STYLE: React.CSSProperties = { maxWidth: 'min(420px, calc(100vw - 28px))', maxHeight: 'min(320px, calc(100vh - 28px))' }

// Drag type for reordering reference chips (never matches the composer's file/asset drop types)
const REF_REORDER_TYPE = 'application/x-openfield-ref-reorder'

type RefKind = 'image' | 'video' | 'audio' | 'other'
function refKind(mime: string): RefKind {
  return mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'other'
}

interface ChipDragProps {
  draggable?: boolean
  isDragging?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
}

function ChipRef({ mime, base64, url, localPath, assetId, onRemove, label, draggable, isDragging, onDragStart, onDragOver, onDrop, onDragEnd }: { mime: string; base64?: string; url?: string; localPath?: string; assetId?: string; onRemove: () => void; label?: string } & ChipDragProps) {
  const [hover, setHover] = useState(false)
  const hoverRef = useRef(false)
  hoverRef.current = hover
  const pillRef = useRef<HTMLSpanElement | null>(null)
  // Chromium cannot decode some audio (e.g. 32-bit float WAV): on error, play a converted copy
  const [fallbackSrc, setFallbackSrc] = useState<string | null>(null)
  const fallbackTriedRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [curTime, setCurTime] = useState(0)
  const [dur, setDur] = useState(0)
  const displayLabel = label || (mime.startsWith('video/') ? 'Video' : mime.startsWith('audio/') ? 'Audio' : 'File')
  // Preview sources, best first. A dragged generated asset carries the provider URL in `url`
  // (it expires) while the file on disk is in `localPath`; sending works through the asset id,
  // so the preview must not depend on the remote URL alone. Each media error moves to the next.
  const [resolvedAssetSrc, setResolvedAssetSrc] = useState<string | null>(null)
  const candidates = useMemo(() => {
    const list: string[] = []
    const add = (s?: string | null) => { if (s && !list.includes(s)) list.push(s) }
    if (localPath && !/^https?:/.test(localPath)) add(srcUrl(localPath))
    if (base64) {
      add((base64.startsWith('data:') || base64.startsWith('http') || base64.startsWith('app-file:') || base64.startsWith('blob:'))
        ? base64
        : `data:${mime};base64,${base64}`)
    }
    if (url) add(srcUrl(url))
    if (resolvedAssetSrc) add(resolvedAssetSrc)
    return list
  }, [localPath, base64, url, mime, resolvedAssetSrc])
  const [srcIdx, setSrcIdx] = useState(0)
  const src = candidates[srcIdx] || ''
  const assetLookupTriedRef = useRef(false)

  // Last resort: ask the library for the asset's file on disk
  const lookupAssetFile = useCallback(() => {
    if (!assetId || assetLookupTriedRef.current) return false
    assetLookupTriedRef.current = true
    ;(window as any).electronAPI?.assets?.get?.(assetId).then((a: any) => {
      const p = [a?.localPath, a?.filePath].find((x) => typeof x === 'string' && x && !x.startsWith('__error__') && !/^https?:/.test(x))
      const resolved = p ? srcUrl(p) : null
      if (!resolved) return
      setResolvedAssetSrc(resolved)
      setSrcIdx(prev => {
        // Point at the resolved entry (appended last, unless it was already tried)
        const idx = candidates.indexOf(resolved)
        return idx >= 0 ? idx : candidates.length
      })
    }).catch(() => {})
    return true
  }, [assetId, candidates])

  // Nothing to show at all (e.g. a ref restored with only its asset id)
  useEffect(() => {
    if (candidates.length === 0) lookupAssetFile()
  }, [candidates.length, lookupAssetFile])

  /** Advances to the next preview source; false when there is none left. */
  const nextSource = () => {
    if (srcIdx < candidates.length - 1) { setSrcIdx(srcIdx + 1); return true }
    return lookupAssetFile()
  }
  const isAudio = mime.startsWith('audio/')

  const handleAudioError = async () => {
    if (fallbackSrc) return
    if (nextSource()) return
    if (fallbackTriedRef.current) return
    fallbackTriedRef.current = true
    try {
      const playable = await (window as any).electronAPI?.assets?.playableAudio?.({ path: localPath || url, base64, mime })
      if (playable) setFallbackSrc(srcUrl(playable) || null)
    } catch {}
  }

  useEffect(() => {
    if (!isAudio) return
    const a = audioRef.current
    if (!a) return
    if (hover) {
      a.currentTime = 0
      setProgress(0)
      setCurTime(0)
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    } else {
      a.pause()
      a.currentTime = 0
      setPlaying(false)
      setProgress(0)
      setCurTime(0)
    }
  }, [hover, isAudio])

  // Linear progress via requestAnimationFrame (smoother than timeupdate events)
  useEffect(() => {
    if (!playing || !isAudio) return
    let raf = 0
    const tick = () => {
      const a = audioRef.current
      if (a) {
        const c = a.currentTime
        setCurTime(c)
        setProgress(a.duration ? (c / a.duration) * 100 : 0)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, isAudio])

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <span
      className={`relative flex-shrink-0 ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'opacity-40' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      draggable={draggable}
      onDragStart={draggable ? (e) => {
        // Ghost = the pill only, not the large hover preview
        setHover(false)
        if (pillRef.current) e.dataTransfer.setDragImage(pillRef.current, 12, 12)
        onDragStart?.(e)
      } : undefined}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {isAudio && (
        <audio
          ref={audioRef}
          src={fallbackSrc || src}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
          onError={handleAudioError}
          onCanPlay={(e) => {
            // The converted copy arrives after the hover started: start it if still hovered
            const a = e.currentTarget
            if (fallbackSrc && hoverRef.current && a.paused) {
              a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
            }
          }}
        />
      )}
      <span ref={pillRef} className="inline-flex items-center gap-1.5 bg-surface-800/80 border border-surface-700 rounded-full pr-1 p-0.5 text-[11px] text-surface-300">
        {mime.startsWith('image/') ? (
          <img src={src} draggable={false} onError={() => nextSource()} className="size-5 rounded-full object-cover" alt="" />
        ) : mime.startsWith('video/') ? (
          <span className="size-5 rounded-full bg-surface-700 flex items-center justify-center flex-shrink-0">
            <Video size={10} className="text-surface-400" />
          </span>
        ) : (
          <span className="size-5 rounded-full bg-surface-700 flex items-center justify-center flex-shrink-0">
            <Music size={10} className="text-surface-400" />
          </span>
        )}
        <span>{displayLabel}</span>
        <button onClick={onRemove} className="text-surface-500 hover:text-red-400 cursor-pointer flex-shrink-0 ml-0.5">
          <X size={14} />
        </button>
      </span>
      {hover && !isDragging && (
        <ViewportPopover anchor={pillRef.current}>
          {mime.startsWith('image/') ? (
            <img src={src} style={PREVIEW_IMG_STYLE} onError={() => nextSource()} className="block object-contain rounded" alt="" />
          ) : mime.startsWith('video/') ? (
            <video src={src} style={PREVIEW_VIDEO_STYLE} onError={() => nextSource()} className="block rounded bg-black" muted autoPlay loop playsInline />
          ) : (
            <div className="w-[280px] px-3 py-2.5 flex items-center gap-2 bg-surface-900/60 rounded">
              <Music size={14} className="text-surface-400 flex-shrink-0" />
              <div className="flex-1 h-1.5 bg-surface-700 rounded-full overflow-hidden">
                <div className="h-full bg-accent-500 rounded-full" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[10px] text-surface-500 font-mono flex-shrink-0">{fmt(curTime)} / {fmt(dur)}</span>
            </div>
          )}
        </ViewportPopover>
      )}
    </span>
  )
}

function ChipVideo({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-surface-800/80 border border-surface-700 rounded-full pl-1 pr-2 h-10 text-[11px] text-surface-300 flex-shrink-0">
      <span className="size-8 rounded-full bg-surface-700 flex items-center justify-center flex-shrink-0">
        <Video size={12} className="text-surface-400" />
      </span>
      <span>{label}</span>
      <button onClick={onRemove} className="text-surface-500 hover:text-red-400 cursor-pointer flex-shrink-0 ml-0.5">
        <X size={14} />
      </button>
    </span>
  )
}

function ChipImage({ src, label, onRemove }: { src: string; label: string; onRemove: () => void }) {
  const [hover, setHover] = useState(false)
  const pillRef = useRef<HTMLSpanElement | null>(null)
  return (
    <span className="relative flex-shrink-0" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span ref={pillRef} className="inline-flex items-center gap-1.5 bg-surface-800/80 border border-surface-700 rounded-full pr-1 p-0.5 text-[11px] text-surface-300">
        <img src={src} className="size-5 rounded-full object-cover" alt="" />
        <span>{label}</span>
        <button onClick={onRemove} className="text-surface-500 hover:text-red-400 cursor-pointer flex-shrink-0 ml-0.5">
          <X size={14} />
        </button>
      </span>
      {hover && (
        <ViewportPopover anchor={pillRef.current}>
          <img src={src} style={PREVIEW_IMG_STYLE} className="block object-contain rounded" alt="" />
        </ViewportPopover>
      )}
    </span>
  )
}

function AddChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="h-10 w-16 border border-dashed border-surface-700 rounded-md flex items-center justify-center text-surface-500 hover:border-surface-500 transition-colors flex-shrink-0 relative">
      <span className="text-[9px]">{label}</span>
    </button>
  )
}
