import { useState, useCallback, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, Settings2, X, Wand2, ChevronDown, ChevronUp, Coins, Upload, Video, Image as ImageIcon, Plus, Music, AlertCircle, AlertTriangle, ArrowLeftRight, UserCircle, User, Mountain, Box, Check, Camera, Library, Maximize2, Minimize2, Shapes } from 'lucide-react'
import { StreamDuration } from './StreamDuration'
import { useElementsStore, type ElementKind, type StudioElement, KIND_CONFIG } from '../stores/elements-store'
import { useShortDramaStore } from '../stores/short-drama-store'
import { useAppStore } from '../stores/app-store'
import { RichPromptInput, type RichPromptInputHandle } from './RichPromptInput'
import { useWorkspaceStore } from '../stores/workspace-store'
import { AspectRatio, ASPECT_RATIOS } from './aspect-ratios'
import { ImageLibraryPicker } from './ImageLibraryPicker'
import {
  IMAGE_MODELS, VIDEO_MODELS, AUDIO_MODELS, PIXVERSE_T2V_PRICES, PIXVERSE_REF_PRICES,
  calcCost, calcVideoCost, type ModelPricing, cleanModelName,
} from '../lib/models'
import { useProvidersStore, isModelConfigured, PROVIDER_DEFS, hasAnyConfiguredProvider, type ProviderId } from '../stores/providers-store'
import { srcUrl } from '../services/file-url'
import {
  CameraControl,
  CAMERA_LENSES,
  CAMERA_SHOTS,
  CAMERA_LEVELS,
  CAMERA_MOVEMENTS,
  CAMERA_LIGHTING,
  CAMERA_FILM_LOOKS,
  CAMERA_SPEEDS,
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
    aspectRatio?: string
    resolution?: string
    duration?: number
    fps?: number
    sound?: boolean
    imageBase64?: string
    imageMime?: string
    imageRefs?: { base64: string; mime: string; name?: string; refType?: string }[]
    videoRefs?: { base64: string; mime: string; duration?: number; assetId?: string }[]
    audioRefs?: { base64: string; mime: string }[]
    firstFrameBase64?: string
    lastFrameBase64?: string
    multiShots?: boolean
    multiPrompt?: { prompt: string; duration: number }[]
    provider?: ProviderId
    enhancePrompt?: boolean
    voice?: string
    voiceLanguage?: string
    draft?: boolean
  }): void
  addRefs(newRefs: { base64: string; mime: string; name?: string; refType?: string; duration?: number; assetId?: string }[]): void
}

interface PromptComposerProps {
  onGenerate: (params: {
    mode?: 'image' | 'video' | 'audio'
    prompt: string
    model: string
    aspectRatio?: string
    resolution?: string
    batchSize?: number
    duration?: number
    fps?: number
    sound?: boolean
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
    voice?: string
    voiceLanguage?: string
    draft?: boolean
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
    const def = mode === 'video' ? 'Seedance 2 Fast' : mode === 'audio' ? 'GPT TTS' : 'GPT Image 2'
    try {
      const local = localStorage.getItem(storageKey)
      if (mode === 'video' && (!local || local === 'Kling 3.0')) return def
      return local || def
    } catch { return def }
  })
  useEffect(() => {
    try { localStorage.setItem(`openfield-model-${mode}`, modelName) } catch {}
  }, [modelName, mode])

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
  const defaultModel = (mode === 'video' ? VIDEO_MODELS : mode === 'audio' ? AUDIO_MODELS : IMAGE_MODELS).find(m => {
    const def = mode === 'video' ? 'Seedance 2 Fast' : mode === 'audio' ? 'GPT TTS' : 'GPT Image 2'
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
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [showRatios, setShowRatios] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [showRes, setShowRes] = useState(false)
  const [showCostInfo, setShowCostInfo] = useState(false)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [cameraLens, setCameraLens] = useState(CAMERA_LENSES[2])
  const [cameraShot, setCameraShot] = useState(CAMERA_SHOTS[3])
  const [cameraLevel, setCameraLevel] = useState(CAMERA_LEVELS[0])
  const [cameraMovement, setCameraMovement] = useState(CAMERA_MOVEMENTS[0])
  const [lighting, setLighting] = useState('')
  const [filmLook, setFilmLook] = useState('')
  const [cameraSpeed, setCameraSpeed] = useState('')
  const [multiShots, setMultiShots] = useState(false)

  // A [camera_control] block typed or pasted into the textarea is parsed into the camera state
  // and removed from the visible prompt — the block only lives in the stored prompt.
  useEffect(() => {
    if (!prompt.includes('[camera_control]')) return
    const parsed = parseCameraBlock(prompt)
    if (parsed.lens || parsed.shot || parsed.level || parsed.movement || parsed.lighting || parsed.filmLook || parsed.speed) {
      setCameraEnabled(true)
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
  const [imageRefEntries, setImageRefEntries] = useState<{ name: string; type: 'subject' | 'background'; base64?: string; mime?: string }[]>([])
  const [replicateVoice, setReplicateVoice] = useState('Zephyr (Female)')
  const [replicateLanguage, setReplicateLanguage] = useState('English (US)')
  const [pVideoFps, setPVideoFps] = useState(24)
  const [pVideoDraft, setPVideoDraft] = useState(false)
  const [machgenEnhancePrompt, setMachgenEnhancePrompt] = useState(true)
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
      if (e.dataTransfer?.types?.includes('Files')) {
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
  const hasImageSupport = !!(currentModel.i2iId || currentModel.editId || currentModel.i2vId || currentModel.fflfId)
  const isKling = !!(currentModel.t2vId?.startsWith('kling') || currentModel.i2vId?.startsWith('kling'))
  const isKling30 = !!(currentModel.t2vId?.startsWith('kling-3') || currentModel.i2vId?.startsWith('kling-3') || currentModel.t2vId?.includes('kling-video/v3'))
  const isHiggsfield = currentModel.provider === 'higgsfield'
  const isSeedance = !!(currentModel.t2vId?.startsWith('bytedance/') || currentModel.i2vId?.startsWith('bytedance/')) && !isHiggsfield
  const isPixverseV6 = !!(currentModel.t2vId?.startsWith('pixverse-v6/') || currentModel.i2vId?.startsWith('pixverse-v6/') || currentModel.fflfId?.startsWith('pixverse-v6/'))
  const isGrok = !!(currentModel.t2vId?.startsWith('grok-imagine/') || currentModel.i2vId?.startsWith('grok-imagine/')) || currentModel.extendId?.startsWith('grok-imagine/')
  const isMinimaxH3 = !!(currentModel.t2vId?.startsWith('minimax-h3/') || currentModel.i2vId?.startsWith('minimax-h3/'))
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
    if (isPixverseV6) {
      // Single PixVerse V6 model: route by input. FF/LF wins, then image refs, else text-to-video.
      if (firstFrameBase64 || lastFrameBase64) return 'pixverse-v6/image-to-video'
      if (imageBase64 || hasImageRef || imageRefEntries.some(e => e.base64)) return 'pixverse-v6/reference-to-video'
      return 'pixverse-v6/text-to-video'
    }
    if (isMinimaxH3) {
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

      return currentModel.t2vId || ''
    }
    if (isGrok) {
      // Single Grok Imagine model: route by attachments. Video → extend, image → image-to-video, else text-to-video.
      if (hasVideoRef) return currentModel.extendId || ''
      if (imageBase64 || hasImageRef || imageRefEntries.some(e => e.base64)) return currentModel.i2vId || ''
      return currentModel.t2vId || ''
    }
    if (mode === 'image') {
      const hasImage = imageBase64 || hasImageRef
      if (hasImage && currentModel.editId) return currentModel.editId
      if (hasImage && currentModel.i2iId) return currentModel.i2iId
      return currentModel.t2iId || ''
    }
    if (imageBase64 && currentModel.i2vId) return currentModel.i2vId
    if ((firstFrameBase64 || lastFrameBase64) && (currentModel.fflfId || isKling)) return currentModel.fflfId || (imageBase64 ? (currentModel.i2vId || '') : (currentModel.t2vId || ''))
    return currentModel.t2vId || ''
  }
  const isFFLF = Boolean((currentModel.fflfId || isKling || (mode === 'video' && !isHiggsfield)) && seedanceMode === 'fflf')
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
  const isMachgenWan = isMachgen && !!currentModel.t2vId?.includes('Wan2.2-A14B')

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
    if (isMachgen) {
      if (isMachgenWan) {
        setFps(16)
      } else {
        setFps(24)
      }
    }
  }, [isMachgen, isMachgenWan, currentModel.name])

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
      } else if (isRefMode || mode === 'image') {
        setRefs(prev => [...prev, { base64, mime }])
      } else if (hasImageSupport) {
        setImageBase64(base64); setImageMime(mime)
      } else {
        showError(`Cannot read "${file.name}" (this model does not support image input)`)
      }
    } else if (file.type.startsWith('video/') && currentModel.supportsVideoRef) {
      try { await handleVideoRef(file) } catch (err) { console.error('Failed to process video ref:', err); showError(`Cannot read "${file.name}"`) }
    } else if (file.type.startsWith('audio/') && currentModel.supportsAudioRef) {
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

  const insertImageRef = (item: { base64?: string; url?: string; mime: string; assetId?: string; name?: string; refType?: string }) => {
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

  const handleInsertLibrarySelect = async (assetOrAssets: any | any[]) => {
    const assets = Array.isArray(assetOrAssets) ? assetOrAssets : [assetOrAssets]
    if (assets.length === 0) return
    try {
      const api = (window as any).electronAPI
      const assetIds = assets.map((a: any) => a.id).filter(Boolean)
      const b64Map = new Map<string, { base64: string; mime: string }>()
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

      for (const asset of assets) {
        const res = b64Map.get(asset.id)
        const b64 = res?.base64
        const mime = res?.mime || asset?.mimeType || (asset?.type === 'video' ? 'video/mp4' : asset?.type === 'audio' ? 'audio/mpeg' : 'image/png')
        const url = asset.url || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : undefined)

        if (mime.startsWith('video/')) {
          if (!currentModel.supportsVideoRef) { showError('This model does not support video references'); continue }
          if (b64) {
            const duration = await getDataVideoDuration(b64, mime)
            addVideoRefData(b64, mime, duration)
          } else if (url) {
            setRefs(prev => [...prev, { url, mime, assetId: asset.id, name: asset.name, refType: 'video' }])
          }
        } else if (mime.startsWith('audio/')) {
          if (!currentModel.supportsAudioRef) { showError('This model does not support audio references'); continue }
          setRefs(prev => [...prev, { base64: b64, url, mime, assetId: asset.id, name: asset.name, refType: 'audio' }])
        } else {
          insertImageRef({
            base64: b64,
            url,
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
    setShowInsertLibrary(false)
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
        if (parsedCamera.lens || parsedCamera.shot || parsedCamera.level || parsedCamera.movement || parsedCamera.lighting || parsedCamera.filmLook || parsedCamera.speed) {
          setCameraEnabled(true)
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
        const models = mode === 'video' ? VIDEO_MODELS : mode === 'audio' ? AUDIO_MODELS : IMAGE_MODELS
        for (const m of models) {
          if (m.t2iId === params.model || m.i2iId === params.model || m.editId === params.model ||
              m.t2vId === params.model || m.i2vId === params.model || m.fflfId === params.model ||
              m.refId === params.model || m.extendId === params.model ||
              m.t2aId === params.model || m.voiceId === params.model) {
            setModelName(m.name)
            break
          }
        }
      }
      if (params.aspectRatio) setAspectRatio(params.aspectRatio)
      if (params.resolution) setResolution(params.resolution)
      if (params.duration != null) setDuration(params.duration)
      if (params.fps != null) { setFps(params.fps); if (params.fps === 24 || params.fps === 48) setPVideoFps(params.fps) }
      if (params.sound != null) setSoundEnabled(params.sound)
      if (params.draft != null) setPVideoDraft(params.draft)
      if (params.voice) setReplicateVoice(params.voice)
      if (params.voiceLanguage) setReplicateLanguage(params.voiceLanguage)
      if (params.enhancePrompt != null) setMachgenEnhancePrompt(params.enhancePrompt)
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
          if (params.imageBase64) newRefs.push({ base64: params.imageBase64, mime: params.imageMime || 'image/png' })
          for (const ir of imageRefs) newRefs.push({ base64: ir.base64, mime: ir.mime || 'image/png' })
        }
      } else {
        if (params.imageBase64) newRefs.push({ base64: params.imageBase64, mime: params.imageMime || 'image/png' })
        for (const ir of imageRefs) newRefs.push({ base64: ir.base64, mime: ir.mime || 'image/png' })
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
      if (audioRefs.length > 0 && !model?.supportsAudioRef) {
        showError('This model does not support audio references')
      }

      const allowedOther = [
        ...(model?.supportsVideoRef ? videoRefs : []),
        ...(model?.supportsAudioRef ? audioRefs : []),
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
  }), [mode])

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
      persistEnv()
      onGenerate({
        prompt: prompt.trim(),
        model: activeAudioId,
        duration: currentModel.kind === 'music' ? duration : undefined,
        modelId: currentModel.modelId,
        voiceId: currentModel.voiceId,
        engine: currentModel.engine,
        kind: currentModel.kind,
        provider: currentModel.provider || 'kie',
      })
      richInputRef.current?.setText('')
      setPrompt('')
      return
    }
    if (!prompt.trim() && !imageBase64 && !firstFrameBase64 && !lastFrameBase64 && refs.length === 0 && !imageRefEntries.some(e => e.base64)) return
    const activeId = getActiveModelId()
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

    persistEnv()

    // Camera control: persisted inside [camera_control] tags — any previous block is replaced
    // (no duplication) and the block is only appended when the camera toggle is on.
    const basePrompt = stripCameraBlock(prompt)
    const cameraBlock = formatCameraBlock({
      enabled: cameraEnabled,
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
      prompt: finalPrompt,
      model: activeId,
      provider: (currentModel.provider && currentModel.provider !== 'kie') ? currentModel.provider : undefined,
      voice: isReplicate && !isPVideo ? replicateVoice : undefined,
      voiceLanguage: isReplicate && !isPVideo ? replicateLanguage : undefined,
      aspectRatio: aspectRatio,
      resolution: resolution,
      batchSize,
      // OmniHuman is audio-driven: the audio determines the length, no duration/FPS
      duration: mode === 'video' && activeId !== 'omnihuman-1-5' && (!isReplicate || isPVideo) ? duration : undefined,
      fps: mode === 'video' && activeId !== 'omnihuman-1-5' && (!isReplicate || isPVideo) ? (isPVideo ? pVideoFps : fps) : undefined,
      draft: isPVideo ? pVideoDraft : undefined,
      sound: mode === 'video' && !isReplicate ? soundEnabled : undefined,
      enhancePrompt: isMachgen ? machgenEnhancePrompt : undefined,
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
      modelId: currentModel.modelId,
    })
    if (!embedded) {
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
      setSoundEnabled(false)
      setShowRefsModal(false)
      setImageRefEntries([])
    }
  }, [prompt, aspectRatio, resolution, batchSize, duration, fps, imageBase64, imageMime, refs, firstFrameBase64, firstFrameUrl, lastFrameBase64, lastFrameUrl, currentModel, onGenerate, mode, isFFLF, multiShots, multiPrompt, soundEnabled, showRefsModal, imageRefEntries, elements, isReplicate, isFal, isMachgen, isHiggsfield, machgenEnhancePrompt, isPVideo, pVideoFps, pVideoDraft, replicateVoice, replicateLanguage, cameraEnabled, cameraLens, cameraShot, cameraLevel, cameraMovement, lighting, filmLook, cameraSpeed, embedded])

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
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,420px)] bg-surface-900 border border-surface-700 rounded-xl px-4 py-3 shadow-xl shadow-black/40 flex items-center gap-2.5">
        <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
        <p className="text-[11px] text-surface-300">
          No provider activated for this section. Add an API key in Settings → Providers to generate.
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
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 border border-red-400/30 rounded-lg px-4 py-2 shadow-xl flex items-center gap-2 animate-[pulse_0.3s_ease-in-out]">
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
            <div className="flex flex-col p-1 bg-sidebar/95 border border-white/20 rounded-xl shadow-xl shadow-black/40 backdrop-blur-xl backdrop-saturate-150 gap-1 shrink-0 self-end mb-0.5">
              <button
                type="button"
                onClick={() => switchMode('image')}
                className={`group flex flex-col items-center justify-center w-[50px] h-[46px] rounded-lg transition-all duration-150 active:scale-95 cursor-pointer select-none ${
                  mode === 'image'
                    ? 'bg-accent-600 text-white shadow-md shadow-accent-600/30 font-semibold'
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
                    ? 'bg-accent-600 text-white shadow-md shadow-accent-600/30 font-semibold'
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
            className={`flex-1 min-w-0 relative ${embedded ? 'bg-black/60 border border-white/10 rounded-xl shadow-lg' : 'bg-sidebar/90 border border-white/20 rounded-2xl shadow-2xl shadow-black/40'} backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`}
          >
            {/* Maximize/Minimize toggle button anchored to the top-right corner of PromptComposer */}
            <button
              onClick={() => setExpanded(e => !e)}
              title={expanded ? 'Shrink composer' : 'Expand composer'}
              className="absolute right-3 top-3 z-20 text-surface-400 hover:text-surface-100 p-1 rounded-md hover:bg-surface-800/60 transition-all duration-200 active:scale-90"
            >
              {expanded ? <Minimize2 size={14} className="transition-transform duration-200" /> : <Maximize2 size={14} className="transition-transform duration-200" />}
            </button>
            {/* Image chips at top */}
            {hasMedia && (
              <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
                {refs.map((ref, i) => {
                  if (isFFLF && ref.mime.startsWith('image/') && !(ref as any).elementName && !(ref as any).name) return null
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
                  return <ChipRef key={i} mime={ref.mime} base64={ref.base64} url={elRef.url} label={chipLabel} onRemove={handleRemove} />
                })}
                {isOmniHuman && ((refs.find(r => r.mime.startsWith('audio/'))?.duration || 0) > 15) && (
                  <OmniAudioWarn />
                )}
                {imageBase64 && !refs.some(r => r.mime.startsWith('image/')) && <ChipImage src={`data:image/png;base64,${imageBase64}`} label={isReplicate ? 'Portrait' : 'Image 1'} onRemove={() => removeImage('main')} />}
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
                    <label htmlFor={`file-first-${instanceId}`} className="aspect-square h-[52px] border border-dashed border-surface-700 hover:border-accent-500/50 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors gap-0.5 overflow-hidden">
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
                      <label htmlFor={`file-last-${instanceId}`} className="aspect-square h-[52px] border border-dashed border-surface-700 hover:border-accent-500/50 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors gap-0.5 overflow-hidden">
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
                          <img src={imgSrc} className="w-5 h-5 rounded-full object-cover shrink-0 border border-white/10" alt="" />
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
                    <div ref={atMenuRef} className="absolute left-3 bottom-full mb-1 bg-surface-800 border border-surface-700 rounded-lg py-1 min-w-[180px] shadow-xl z-50 max-h-48 overflow-y-auto">
                      {isTagModel ? (
                        <>
                          <div className="px-3 pt-1.5 pb-0.5 text-[9px] uppercase tracking-wider text-surface-600">Referencias</div>
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
                              <span className="text-cyan-400">{item.tag}</span>
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
                              Tags: <span className="text-cyan-400/80">{syntaxHint}</span>
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
                  <div className="fixed z-50 bg-surface-800 border border-surface-700 rounded-xl p-3 shadow-xl min-w-[240px] max-w-[320px]" style={{ left: Math.min(badgePopover.rect.left, window.innerWidth - 340) + 'px', bottom: (window.innerHeight - badgePopover.rect.top + 8) + 'px' }}>
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
                            <span className="absolute bottom-0 left-0 right-0 text-[8px] text-surface-100 bg-black/60 px-1 py-0.5 truncate">{img.label}</span>
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
                  <span className={`text-[10px] ${totalDuration > maxTotal ? 'text-red-400' : 'text-surface-500'}`}>
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
                  className={`flex items-center justify-center h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors ${showInsertMenu ? 'bg-surface-700 text-surface-200' : 'bg-surface-800/80 text-surface-500 hover:text-surface-300'}`}
                  title="Insert image">
                  <Plus size={12} />
                </button>
                {showInsertMenu && (
                  <div className="absolute bottom-full left-0 mb-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[190px] shadow-xl z-50">
                    <button onClick={handleInsertLibraryOpen}
                      className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 text-surface-300 hover:bg-surface-700/50 transition-colors">
                      <Library size={12} className="text-accent-400" /> Insert from library
                    </button>
                    <button onClick={() => insertFileRef.current?.click()}
                      className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 text-surface-300 hover:bg-surface-700/50 transition-colors">
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
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-900/90 hover:bg-surface-800/90 border border-surface-700/80 hover:border-surface-600 rounded-lg text-[11px] font-medium text-surface-200 transition-all shadow-sm"
                >
                  <span className="flex size-3.5 shrink-0 items-center justify-center">
                    <ProviderLogo provider={getProviderForModel(currentModel)} size={13} />
                  </span>
                  <span className="font-medium text-surface-100">{cleanModelName(currentModel.name) || (models.length === 0 ? 'Sin proveedor' : 'Seleccionar Modelo')}</span>
                  <ChevronDown size={11} className={`text-surface-400 transition-transform duration-150 ${showModels ? 'rotate-180 text-surface-200' : ''}`} />
                </button>
                  {showModels && (() => {
                    const q = modelSearchQuery.toLowerCase().trim()
                    const filtered = q
                    ? models.filter(m => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) || (m.provider && m.provider.toLowerCase().includes(q)))
                    : models

                    const groups = PROVIDER_DEFS.map((p) => ({
                      id: p.id,
                      label: p.label,
                      provider: p.id,
                      items: filtered.filter((m) => (m.provider || 'kie') === p.id),
                    })).filter((g) => g.items.length > 0)

                    return (
                    <div className="astryx-selector-popup absolute bottom-full left-0 mb-1.5 bg-surface-900/95 backdrop-blur-xl border border-surface-700/90 rounded-xl p-1 min-w-[280px] w-max max-w-[360px] shadow-2xl max-h-[340px] flex flex-col overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                      {/* Astryx Search */}
                      <div className="p-1.5 border-b border-surface-800 bg-surface-950/50 flex-shrink-0">
                        <div className="relative flex items-center">
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
                      </div>

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
                                    className="px-2.5 py-1 bg-accent-600 hover:bg-accent-500 text-white rounded text-[11px] font-medium transition-colors"
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
                              <div className="px-2.5 pt-1.5 pb-1 text-[10px] uppercase tracking-wider text-surface-500 font-semibold flex items-center justify-between">
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
                                      size="sm"
                                      onClick={() => {
                                        setModelName(m.name)
                                        setShowModels(false)
                                        if (m.prices[0]) setResolution(m.prices[0].resolution)
                                        if (!m.t2vId?.startsWith('pixverse-v6/') && !m.i2vId?.startsWith('pixverse-v6/')) {
                                          setShowRefsModal(false)
                                          setImageRefEntries([])
                                        }
                                      }}
                                      endContent={
                                        costDisplay ? (
                                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/25 text-amber-300 shrink-0 shadow-xs">
                                            {costDisplay}
                                          </span>
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

              {/* Camera control */}
              {mode !== 'audio' && (
                <CameraControl
                  enabled={cameraEnabled}
                  onToggleEnabled={setCameraEnabled}
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
              {mode === 'audio' && currentModel.kind === 'music' && (
                <StreamDuration
                  value={duration}
                  options={currentModel.durationOptions}
                  min={3}
                  max={currentModel.durationMax || 600}
                  onChange={handleDurationChange}
                />
              )}

              {/* Toggles: FF, Multi-shot, Image Refs, Sound */}
              {((currentModel.fflfId || isKling || mode === 'video') && !isHiggsfield) && (
                <button
                  type="button"
                  onClick={() => {
                    if (isFFLF) {
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
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${isFFLF ? 'bg-accent-600 text-white' : 'bg-surface-800/80 text-surface-500 hover:text-surface-300'}`}
                >
                  FF
                </button>
              )}
              {isPixverseV6 && (
                <button onClick={() => {
                    if (imageRefEntries.length === 0) setImageRefEntries([{ name: '', type: 'subject' }])
                    setShowRefsModal(true)
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${imageRefEntries.some(e => e.base64) ? 'bg-accent-600/80 text-white' : 'bg-surface-800/80 text-surface-500 hover:text-surface-300'}`}>
                  Refs {imageRefEntries.some(e => e.base64) ? <span className="text-[10px]">({imageRefEntries.filter(e => e.base64).length})</span> : null}
                </button>
              )}
              {isKling30 && (
                <button onClick={() => { setMultiShots(!multiShots); if (!multiShots && multiPrompt.length === 0) setMultiPrompt([{ prompt: '', duration: 5 }]) }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${multiShots ? 'bg-accent-600 text-white' : 'bg-surface-800/80 text-surface-500 hover:text-surface-300'}`}>
                  Multi-shot
                </button>
              )}
              {(isKling || isSeedance || isPixverseV6 || isWan3 || isHiggsfield) && mode === 'video' && (
                <button onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${soundEnabled ? 'bg-accent-600 text-white' : 'bg-surface-800/80 text-surface-500 hover:text-surface-300'}`}>
                  <Music size={11} />
                </button>
              )}

              {/* Selects */}

              {!embedded && mode === 'image' && (
                <>
                  <div className="relative" ref={ratiosRef}>
                    <button onClick={() => setShowRatios(!showRatios)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-surface-800/80 hover:bg-surface-700/80 rounded-lg text-[11px] font-medium text-surface-300 transition-colors">
                      {aspectRatio} <ChevronDown size={11} />
                    </button>
                    {showRatios && (
                      <div className="absolute bottom-full left-0 mb-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[100px] shadow-xl z-50">
                        {(currentModel.aspectRatios || (isFal && currentModel.falAspectRatios ? currentModel.falAspectRatios : ASPECT_RATIOS)).map((r) => (
                          <button key={r} onClick={() => { setAspectRatio(r); setShowRatios(false) }}
                            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${aspectRatio === r ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/50'}`}>{r}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {currentModel.prices.length > 1 && (
                    <div className="flex items-center gap-0.5 bg-surface-800/60 rounded-lg p-0.5">
                      {currentModel.prices.map((p) => (
                        <button key={p.resolution} onClick={() => setResolution(p.resolution)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${resolution === p.resolution ? 'bg-surface-700 text-surface-200' : 'text-surface-500 hover:text-surface-300'}`}>
                          {p.resolution}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {mode === 'video' && currentModel.t2vId !== 'omnihuman-1-5' && (!isReplicate || isPVideo) && !(multiShots && isKling30) && (
                <StreamDuration
                  value={duration}
                  options={currentModel.durationOptions}
                  min={isPVideo ? 1 : 4}
                  max={currentModel.durationMax || 15}
                  onChange={handleDurationChange}
                />
              )}
              {!embedded && currentModel.resolutions && (
                <div className="relative" ref={resRef}>
                  <button onClick={() => setShowRes(!showRes)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-surface-800/80 hover:bg-surface-700/80 rounded-lg text-[11px] font-medium text-surface-300 transition-colors">
                    {resolution} <ChevronDown size={11} />
                  </button>
                  {showRes && (
                    <div className="absolute bottom-full left-0 mb-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[80px] shadow-xl z-50">
                      {currentModel.resolutions.map((r) => (
                        <button key={r} onClick={() => { setResolution(r); setShowRes(false) }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${resolution === r ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/50'}`}>{r}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {isReplicateAvatar && (
                <>
                  <select value={replicateVoice}
                    onChange={(e) => setReplicateVoice(e.target.value)}
                    disabled={hasReplicateAudio}
                    title={hasReplicateAudio ? 'Voice is driven by the attached audio' : 'Voice'}
                    className={`bg-surface-800/80 border border-surface-700 rounded-lg px-2 py-1 text-[11px] outline-none max-w-[140px] ${hasReplicateAudio ? 'text-surface-600 cursor-not-allowed' : 'text-surface-300'}`}>
                    {currentModel.replicateVoices?.map((v) => <option key={v} value={v}>{v.replace(' (Female)', ' ?').replace(' (Male)', ' ?')}</option>)}
                  </select>
                  <select value={replicateLanguage}
                    onChange={(e) => setReplicateLanguage(e.target.value)}
                    disabled={hasReplicateAudio}
                    title={hasReplicateAudio ? 'Language is driven by the attached audio' : 'Language'}
                    className={`bg-surface-800/80 border border-surface-700 rounded-lg px-2 py-1 text-[11px] outline-none max-w-[140px] ${hasReplicateAudio ? 'text-surface-600 cursor-not-allowed' : 'text-surface-300'}`}>
                    {currentModel.replicateLanguages?.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </>
              )}
              {isPVideo && (
                <>
                  <select value={pVideoFps} onChange={(e) => setPVideoFps(Number(e.target.value))}
                    title="FPS"
                    className="bg-surface-800/80 border border-surface-700 rounded-lg px-1.5 py-1 text-[11px] text-surface-300 outline-none">
                    <option value={24}>24 fps</option><option value={48}>48 fps</option>
                  </select>
                  <button onClick={() => setPVideoDraft(!pVideoDraft)}
                    title="Draft mode: 4x faster, lower-quality preview"
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${pVideoDraft ? 'bg-accent-600 text-white' : 'bg-surface-800/80 text-surface-500 hover:text-surface-300'}`}>
                    Draft
                  </button>
                </>
              )}
              {!embedded && (isMachgen || isHiggsfield || isWan3 || currentModel.t2vId?.includes('gemini-omni') || currentModel.t2vId?.startsWith('bytedance/') || currentModel.t2vId?.startsWith('pixverse-v6/') || currentModel.i2vId?.startsWith('pixverse-v6/') || currentModel.t2vId?.startsWith('grok-imagine/') || currentModel.i2vId?.startsWith('grok-imagine/') || isMinimaxH3 || isFal || isPVideo) && (
                <div className="relative" ref={ratiosRef}>
                  <button onClick={() => { if (!grokSingleI2v) setShowRatios(!showRatios) }}
                    disabled={grokSingleI2v}
                    title={grokSingleI2v ? 'Con una sola imagen, el aspecto del video sigue la imagen adjunta (Grok i2v). Usa 2+ imágenes o text-to-video para elegir el ratio.' : undefined}
                    className="flex items-center gap-1 px-2.5 py-1 bg-surface-800/80 hover:bg-surface-700/80 rounded-lg text-[11px] font-medium text-surface-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {aspectRatio} <ChevronDown size={11} />
                  </button>
                  {showRatios && (
                    <div className="absolute bottom-full left-0 mb-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[100px] shadow-xl z-50">
                      {(((isMachgen || isHiggsfield) && currentModel.aspectRatios) ? currentModel.aspectRatios : isWan3 ? ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16'] : isPVideo ? (currentModel.pvAspectRatios || ['16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '1:1']) : isFal ? (currentModel.falAspectRatios || ['adaptive', '16:9']) : currentModel.t2vId?.startsWith('bytedance/') ? ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', 'adaptive'] : currentModel.t2vId?.startsWith('pixverse-v6/') || currentModel.i2vId?.startsWith('pixverse-v6/') ? ['1:1', '16:9', '21:9', '2:3', '3:2', '3:4', '4:3', '9:16'] : currentModel.t2vId?.startsWith('grok-imagine/') || currentModel.i2vId?.startsWith('grok-imagine/') ? ['16:9', '9:16', '1:1', '2:3', '3:2'] : isMinimaxH3 ? ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] : ['16:9', '9:16']).map((r) => (
                        <button key={r} onClick={() => { setAspectRatio(r); setShowRatios(false) }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${aspectRatio === r ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/50'}`}>{r}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {mode === 'video' && isMachgen && (
                <>
                  <div className="flex items-center gap-1">
                    <select value={fps} onChange={(e) => setFps(Number(e.target.value))}
                      title="FPS (fotogramas por segundo)"
                      className="bg-surface-800/80 border border-surface-700 rounded-lg px-1.5 py-1 text-[11px] text-surface-300 outline-none">
                      {isMachgenWan ? (
                        <>
                          <option value={16}>16 fps</option>
                          <option value={24}>24 fps</option>
                        </>
                      ) : (
                        <>
                          <option value={24}>24 fps</option>
                          <option value={25}>25 fps</option>
                          <option value={30}>30 fps</option>
                        </>
                      )}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMachgenEnhancePrompt(!machgenEnhancePrompt)}
                    title="MachGen Prompt Enhancement: reescribe y optimiza el prompt automáticamente con IA"
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      machgenEnhancePrompt
                        ? 'bg-emerald-600 text-white'
                        : 'bg-surface-800/80 text-surface-500 hover:text-surface-300'
                    }`}
                  >
                    <Sparkles size={10} /> Enhance
                  </button>
                </>
              )}
              {mode === 'video' && !isReplicate && !isFal && !isMachgen && !isHiggsfield && !(isWan3 || currentModel.t2vId?.includes('gemini-omni') || currentModel.t2vId?.startsWith('bytedance/') || currentModel.t2vId?.startsWith('grok-imagine/') || isKling || isPixverseV6 || isMinimaxH3) && (
                <div className="flex items-center gap-1">
                  <select value={fps} onChange={(e) => setFps(Number(e.target.value))}
                    className="bg-surface-800/80 border border-surface-700 rounded-lg px-1.5 py-1 text-[11px] text-surface-300 outline-none">
                    <option value={24}>24</option><option value={30}>30</option><option value={60}>60</option>
                  </select>
                </div>
              )}

              <div className="flex-1" />
            </div>
              </div>

              {/* Right side: Generate button */}
              <div className="self-end shrink-0">
                <button onClick={handleGenerate} disabled={disabled || (mode === 'audio' ? !prompt.trim() : (showRefsModal ? !prompt.trim() || (!imageRefEntries.some(e => e.base64) && !imageBase64 && refs.length === 0) : (multiShots ? !multiPrompt.some(s => s.prompt.trim()) || multiPrompt.reduce((a, x) => a + x.duration, 0) > 15 : (isFFLF ? (!prompt.trim() && !firstFrameBase64 && !(isMachgen && lastFrameBase64)) : (isHiggsfield ? !prompt.trim() : (isReplicate ? (isPVideo ? !prompt.trim() : (!prompt.trim() && !imageBase64 && !refs.some(r => r.mime.startsWith('audio/')) && !refs.some(r => r.mime.startsWith('video/')))) : !prompt.trim() && !imageBase64 && !firstFrameBase64 && refs.length === 0))))))}
                  className={`flex-shrink-0 aspect-square flex flex-col items-center justify-center gap-0.5 ${iconOnlyGenerate ? 'w-10 h-10 p-0' : 'w-16 h-16 p-1'} bg-accent-600 hover:bg-accent-500 disabled:bg-accent-600/50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all active:scale-[0.97] cursor-pointer`}
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
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div
            className="relative bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl w-[420px] max-w-[94vw] max-h-[80vh] flex flex-col z-10"
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
                className="w-full py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-xl text-sm font-medium transition-colors"
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
  return (
    <span
      className="relative flex-shrink-0 flex items-center self-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <AlertTriangle size={14} className="text-amber-400 cursor-help" />
      {hover && (
        <span className="absolute left-0 bottom-full mb-2 z-50 w-[340px] bg-surface-800 border border-amber-500/30 rounded-lg p-2.5 shadow-xl text-[10px] text-surface-300 leading-relaxed">
          Duration must be less than 60 seconds (recommended 15 seconds or less; exceeding this will cause quality degradation). Accepted file types: audio/mpeg, audio/wav, audio/x-wav, audio/aac, audio/ogg, audio/mp4. Max file size: 10MB.
        </span>
      )}
    </span>
  )
}

function ChipRef({ mime, base64, url, onRemove, label }: { mime: string; base64?: string; url?: string; onRemove: () => void; label?: string }) {
  const [hover, setHover] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [curTime, setCurTime] = useState(0)
  const [dur, setDur] = useState(0)
  const displayLabel = label || (mime.startsWith('video/') ? 'Video' : mime.startsWith('audio/') ? 'Audio' : 'File')
  const src = url
    ? srcUrl(url)
    : (base64?.startsWith('data:') || base64?.startsWith('http') || base64?.startsWith('app-file:') || base64?.startsWith('blob:'))
      ? base64
      : (base64 ? `data:${mime};base64,${base64}` : '')
  const isAudio = mime.startsWith('audio/')

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
    <span className="relative flex-shrink-0" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {isAudio && (
        <audio
          ref={audioRef}
          src={src}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        />
      )}
      <span className="inline-flex items-center gap-1.5 bg-surface-800/80 border border-surface-700 rounded-full pr-1 p-0.5 text-[11px] text-surface-300">
        {mime.startsWith('image/') ? (
          <img src={src} className="size-5 rounded-full object-cover" alt="" />
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
      {hover && (
        <span className="absolute left-0 bottom-full mb-2 z-50 bg-surface-800 border border-surface-700 rounded-lg p-1.5 shadow-xl">
          {mime.startsWith('image/') ? (
            <img src={src} className="max-w-[400px] max-h-[420px] object-contain rounded" alt="" />
          ) : mime.startsWith('video/') ? (
            <video src={src} className="max-w-[420px] max-h-[320px] rounded bg-black" muted autoPlay loop playsInline />
          ) : (
            <div className="w-[280px] px-3 py-2.5 flex items-center gap-2 bg-surface-900/60 rounded">
              <Music size={14} className="text-surface-400 flex-shrink-0" />
              <div className="flex-1 h-1.5 bg-surface-700 rounded-full overflow-hidden">
                <div className="h-full bg-accent-500 rounded-full" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[10px] text-surface-500 font-mono flex-shrink-0">{fmt(curTime)} / {fmt(dur)}</span>
            </div>
          )}
        </span>
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
  return (
    <span className="relative flex-shrink-0" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span className="inline-flex items-center gap-1.5 bg-surface-800/80 border border-surface-700 rounded-full pr-1 p-0.5 text-[11px] text-surface-300">
        <img src={src} className="size-5 rounded-full object-cover" alt="" />
        <span>{label}</span>
        <button onClick={onRemove} className="text-surface-500 hover:text-red-400 cursor-pointer flex-shrink-0 ml-0.5">
          <X size={14} />
        </button>
      </span>
      {hover && (
        <span className="absolute left-0 bottom-full mb-2 z-50 bg-surface-800 border border-surface-700 rounded-lg p-1.5 shadow-xl">
          <img src={src} className="max-w-[400px] max-h-[420px] object-contain rounded" alt="" />
        </span>
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
