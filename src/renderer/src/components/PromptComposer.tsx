import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Sparkles, Settings2, X, Wand2, ChevronDown, ChevronUp, Coins, Upload, Video, Plus, Music, AlertCircle, AlertTriangle, ArrowLeftRight, Cpu, UserCircle, User, Mountain, Box, Check, Library } from 'lucide-react'
import { StreamDuration } from './StreamDuration'
import { useElementsStore, type ElementKind, KIND_CONFIG } from '../stores/elements-store'
import { RichPromptInput, type RichPromptInputHandle } from './RichPromptInput'
import { useWorkspaceStore } from '../stores/workspace-store'
import { AspectRatio, ASPECT_RATIOS } from './aspect-ratios'
import { ImageLibraryPicker } from './ImageLibraryPicker'

export interface PromptComposerHandle {
  loadFromParams(params: {
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
    provider?: 'kie' | 'replicate' | 'fal'
    voice?: string
    voiceLanguage?: string
  }): void
  addRefs(newRefs: { base64: string; mime: string; name?: string; refType?: string }[]): void
}

interface PromptComposerProps {
  onGenerate: (params: {
    prompt: string
    model: string
    aspectRatio?: string
    resolution?: string
    batchSize?: number
    duration?: number
    fps?: number
    sound?: boolean
    imageBase64?: string
    imageMime?: string
    imageRefs?: { base64: string; mime: string; name?: string; refType?: string }[]
    videoRefs?: { base64: string; mime: string }[]
    audioRefs?: { base64: string; mime: string }[]
    firstFrameBase64?: string
    lastFrameBase64?: string
    multiShots?: boolean
    multiPrompt?: { prompt: string; duration: number }[]
    local?: boolean
    modelId?: string
    voiceId?: string
    engine?: string
    provider?: 'kie' | 'replicate' | 'fal'
    voice?: string
    voiceLanguage?: string
  }) => void
  mode?: 'image' | 'video' | 'audio'
  subMode?: 'voice' | 'music'
  disabled?: boolean
  floating?: boolean
}

interface ModelPricing {
  name: string
  category: string
  unit: 'img' | 's' | 'video'
  prices: { resolution: string; cost: number }[]
  durationMax?: number
  durationOptions?: string[]
  resolutions?: string[]
  supportsVideoRef?: boolean
  supportsAudioRef?: boolean
  t2iId?: string
  i2iId?: string
  editId?: string
  t2vId?: string
  i2vId?: string
  fflfId?: string
  refId?: string
  extendId?: string
  t2aId?: string
  kind?: 'voice' | 'music'
  voiceId?: string
  local?: boolean
  modelId?: string
  engine?: string
  provider?: 'kie' | 'replicate' | 'fal' | 'fal'
  replicateVoices?: string[]
  replicateLanguages?: string[]
  falAspectRatios?: string[]
}

const IMAGE_MODELS: ModelPricing[] = [
  { name: 'GPT Image 2', category: 'OpenAI', unit: 'img', t2iId: 'gpt-image-2-text-to-image', i2iId: 'gpt-image-2-image-to-image',
    prices: [{ resolution: '1K', cost: 0.03 }, { resolution: '2K', cost: 0.05 }, { resolution: '4K', cost: 0.08 }] },
  { name: 'Nano Banana 2', category: 'Google', unit: 'img', t2iId: 'nano-banana-2',
    prices: [{ resolution: '1K', cost: 0.04 }, { resolution: '2K', cost: 0.06 }, { resolution: '4K', cost: 0.09 }] },
  { name: 'Nano Banana 2 Lite', category: 'Google', unit: 'img', t2iId: 'nano-banana-2-lite',
    prices: [{ resolution: '1K', cost: 0.02 }] },
  { name: 'Seedream 5 Pro', category: 'Seedream', unit: 'img', t2iId: 'seedream-5-pro-text-to-image', i2iId: 'seedream-5-pro-image-to-image', editId: 'seedream-v4-edit',
    prices: [{ resolution: '1K', cost: 0.06 }, { resolution: '2K', cost: 0.09 }, { resolution: '4K', cost: 0.15 }] },
  { name: 'Flux 2 Pro', category: 'Flux', unit: 'img', t2iId: 'flux2-pro-text-to-image', i2iId: 'flux2-pro-image-to-image',
    prices: [{ resolution: '1K', cost: 0.05 }, { resolution: '2K', cost: 0.08 }] },
  { name: 'Grok Imagine', category: 'Grok', unit: 'img', t2iId: 'grok-imagine/text-to-image', i2iId: 'grok-imagine/image-to-image',
    prices: [{ resolution: '1K', cost: 0.02 }, { resolution: '2K', cost: 0.03 }] },
  { name: 'Imagen 4 Fast', category: 'Google', unit: 'img', t2iId: 'imagen4-fast',
    prices: [{ resolution: '1K', cost: 0.04 }, { resolution: '2K', cost: 0.06 }] },
  { name: 'Remove Background', category: 'Recraft', unit: 'img', t2iId: 'recraft/remove-background',
    prices: [{ resolution: '1K', cost: 0.02 }] },
  // fal.ai image models (https://fal.ai/explore/best-image-models)
  { name: 'GPT Image 2 (Fal)', category: 'OpenAI', unit: 'img', provider: 'fal',
    t2iId: 'openai/gpt-image-2', i2iId: 'openai/gpt-image-2/edit',
    prices: [{ resolution: '1K', cost: 0.03 }, { resolution: '2K', cost: 0.10 }, { resolution: '4K', cost: 0.30 }],
    falAspectRatios: ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'] },
  { name: 'Nano Banana Pro', category: 'Google', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/nano-banana-pro', editId: 'fal-ai/nano-banana-pro/edit',
    prices: [{ resolution: '1K', cost: 0.15 }, { resolution: '2K', cost: 0.15 }, { resolution: '4K', cost: 0.30 }],
    falAspectRatios: ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'] },
  { name: 'Recraft V4', category: 'Recraft', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/recraft/v4/text-to-image',
    prices: [{ resolution: '1K', cost: 0.04 }, { resolution: '2K', cost: 0.08 }],
    falAspectRatios: ['1:1', '16:9', '4:3', '3:4', '9:16'] },
  { name: 'Recraft V4 Pro', category: 'Recraft', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/recraft/v4/pro/text-to-image',
    prices: [{ resolution: '1K', cost: 0.25 }, { resolution: '2K', cost: 0.30 }],
    falAspectRatios: ['1:1', '16:9', '4:3', '3:4', '9:16'] },
  { name: 'Recraft V3', category: 'Recraft', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/recraft/v3/text-to-image',
    prices: [{ resolution: '1K', cost: 0.04 }, { resolution: '2K', cost: 0.08 }],
    falAspectRatios: ['1:1', '16:9', '4:3', '3:4', '9:16'] },
  { name: 'ImagineArt 2.0', category: 'ImagineArt', unit: 'img', provider: 'fal',
    t2iId: 'imagineart/imagineart-2.0-preview/text-to-image',
    prices: [{ resolution: '1K', cost: 0.04 }, { resolution: '2K', cost: 0.08 }],
    falAspectRatios: ['1:1', '16:9', '4:3', '3:4', '9:16'] },
  { name: 'FLUX.1 Kontext [pro]', category: 'Flux', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/flux-pro/kontext', editId: 'fal-ai/flux-pro/kontext',
    prices: [{ resolution: '1K', cost: 0.04 }, { resolution: '2K', cost: 0.08 }],
    falAspectRatios: ['1:1', '16:9', '3:2', '4:3', '3:4', '2:3', '9:16'] },
  { name: 'FLUX Krea LoRA stream', category: 'Flux', unit: 'img', provider: 'fal',
    t2iId: 'fal-ai/flux-krea-lora/stream',
    prices: [{ resolution: '1K', cost: 0.035 }, { resolution: '2K', cost: 0.07 }],
    falAspectRatios: ['1:1', '16:9', '3:2', '4:3', '3:4', '2:3', '9:16'] },
  { name: 'Bria FIBO', category: 'Bria', unit: 'img', provider: 'fal',
    t2iId: 'bria/fibo/generate',
    prices: [{ resolution: '1K', cost: 0.04 }, { resolution: '2K', cost: 0.08 }],
    falAspectRatios: ['1:1', '16:9', '4:3', '3:4', '9:16'] },
]

// PixVerse V6 routes to a single model; the price table depends on the routed mode
const PIXVERSE_T2V_PRICES = [
  { resolution: '360p', cost: 0.020 }, { resolution: '360p-audio', cost: 0.028 },
  { resolution: '540p', cost: 0.028 }, { resolution: '540p-audio', cost: 0.036 },
  { resolution: '720p', cost: 0.036 }, { resolution: '720p-audio', cost: 0.048 },
  { resolution: '1080p', cost: 0.072 }, { resolution: '1080p-audio', cost: 0.092 },
]
const PIXVERSE_REF_PRICES = [
  { resolution: '360p', cost: 0.0225 }, { resolution: '360p-audio', cost: 0.0315 },
  { resolution: '540p', cost: 0.0315 }, { resolution: '540p-audio', cost: 0.0405 },
  { resolution: '720p', cost: 0.0405 }, { resolution: '720p-audio', cost: 0.054 },
  { resolution: '1080p', cost: 0.081 }, { resolution: '1080p-audio', cost: 0.1035 },
]

const VIDEO_MODELS: ModelPricing[] = [
  { name: 'Kling 3.0', category: 'Kling', unit: 's', t2vId: 'kling-3.0/video', i2vId: 'kling-3.0/video',
    prices: [{ resolution: 'std', cost: 0.07 }, { resolution: 'std-audio', cost: 0.10 }, { resolution: 'pro', cost: 0.09 }, { resolution: 'pro-audio', cost: 0.135 }, { resolution: '4k', cost: 0.335 }],
    durationMax: 15, resolutions: ['std', 'pro', '4k'] },
  { name: 'Kling 2.5 Turbo', category: 'Kling', unit: 's', t2vId: 'kling/v25-turbo-text-to-video-pro', i2vId: 'kling/v25-turbo-image-to-video-pro',
    prices: [{ resolution: 's', cost: 0.05 }], durationMax: 10 },
  { name: 'Grok Imagine', category: 'Grok', unit: 's',
    t2vId: 'grok-imagine/text-to-video', i2vId: 'grok-imagine/image-to-video', extendId: 'grok-imagine/extend',
    prices: [{ resolution: '480p', cost: 0.012 }, { resolution: '720p', cost: 0.0225 }, { resolution: '1080p', cost: 0.04 }],
    durationMax: 30, resolutions: ['480p', '720p', '1080p'], supportsVideoRef: true },
  { name: 'Seedance 2', category: 'ByteDance', unit: 's', t2vId: 'bytedance/seedance-2', i2vId: 'bytedance/seedance-2', fflfId: 'bytedance/seedance-2',
    prices: [{ resolution: '480p', cost: 0.095 }, { resolution: '720p', cost: 0.205 }, { resolution: '1080p', cost: 0.51 }, { resolution: '4k', cost: 1.04 }], durationMax: 15,
    durationOptions: ['4', '5', '6', '8', '10', '12', '15'], resolutions: ['480p', '720p', '1080p', '4k'], supportsVideoRef: true, supportsAudioRef: true },
  { name: 'Seedance 2.5', category: 'ByteDance', unit: 's', t2vId: 'bytedance/seedance-2-5', i2vId: 'bytedance/seedance-2-5', fflfId: 'bytedance/seedance-2-5',
    prices: [{ resolution: '480p', cost: 0.14 }, { resolution: '720p', cost: 0.315 }], durationMax: 30,
    durationOptions: ['4', '5', '6', '8', '10', '12', '15', '20', '30'], resolutions: ['480p', '720p'], supportsVideoRef: true, supportsAudioRef: true },
  { name: 'Seedance 2 Fast', category: 'ByteDance', unit: 's', t2vId: 'bytedance/seedance-2-fast', i2vId: 'bytedance/seedance-2-fast', fflfId: 'bytedance/seedance-2-fast',
    prices: [{ resolution: '480p', cost: 0.059 }, { resolution: '720p', cost: 0.124 }], durationMax: 15,
    durationOptions: ['4', '5', '6', '8', '10', '12', '15'], resolutions: ['480p', '720p'], supportsVideoRef: true, supportsAudioRef: true },
  { name: 'Seedance 2 Mini', category: 'ByteDance', unit: 's', t2vId: 'bytedance/seedance-2-mini', i2vId: 'bytedance/seedance-2-mini', fflfId: 'bytedance/seedance-2-mini',
    prices: [{ resolution: '480p', cost: 0.019 }, { resolution: '720p', cost: 0.041 }], durationMax: 15,
    durationOptions: ['4', '5', '6', '8', '10', '12', '15'], resolutions: ['480p', '720p'], supportsVideoRef: true, supportsAudioRef: true },
  { name: 'Wan 2.7', category: 'Wan', unit: 's', t2vId: 'wan-2-7-text-to-video', i2vId: 'wan-2-7-image-to-video',
    prices: [{ resolution: 's', cost: 0.04 }], durationMax: 10 },
  { name: 'Hailuo 2 Pro', category: 'Hailuo', unit: 's', t2vId: 'hailuo/02-text-to-video-pro',
    prices: [{ resolution: 's', cost: 0.06 }], durationMax: 10 },
  { name: 'Gemini Omni', category: 'Google', unit: 'video', t2vId: 'gemini-omni-video', i2vId: 'gemini-omni-video',
    prices: [{ resolution: '720p', cost: 0.30 }, { resolution: '1080p', cost: 0.50 }, { resolution: '4k', cost: 0.80 }],
    durationOptions: ['4', '6', '8', '10'], resolutions: ['720p', '1080p', '4k'] },
  { name: 'PixVerse V6', category: 'PixVerse', unit: 's',
    t2vId: 'pixverse-v6/text-to-video', i2vId: 'pixverse-v6/image-to-video', fflfId: 'pixverse-v6/image-to-video', refId: 'pixverse-v6/reference-to-video',
    prices: PIXVERSE_T2V_PRICES,
    durationMax: 15, resolutions: ['360p', '540p', '720p', '1080p'] },
  { name: 'OmniHuman 1.5', category: 'OmniHuman', unit: 's', t2vId: 'omnihuman-1-5',
    prices: [{ resolution: '1080', cost: 0.135 }],
    durationMax: 15, durationOptions: ['4', '5', '6', '8', '10', '12', '15'], resolutions: ['1080', '720'],
    supportsAudioRef: true },
  { name: 'P-Video Avatar', category: 'Replicate', unit: 's', provider: 'replicate',
    t2vId: 'prunaai/p-video-avatar', i2vId: 'prunaai/p-video-avatar',
    prices: [{ resolution: '720p', cost: 0.025 }, { resolution: '1080p', cost: 0.045 }],
    durationMax: 15, resolutions: ['720p', '1080p'], supportsAudioRef: true,
    replicateVoices: [
      'Zephyr (Female)', 'Puck (Male)', 'Charon (Male)', 'Kore (Female)', 'Fenrir (Male)',
      'Leda (Female)', 'Orus (Male)', 'Aoede (Female)', 'Callirrhoe (Female)', 'Autonoe (Female)',
      'Enceladus (Male)', 'Iapetus (Male)', 'Umbriel (Male)', 'Algenib (Male)', 'Despina (Female)',
      'Erinome (Female)', 'Laomedeia (Female)', 'Achernar (Female)', 'Algieba (Male)', 'Schedar (Male)',
      'Gacrux (Female)', 'Pulcherrima (Female)', 'Achird (Male)', 'Zubenelgenubi (Male)',
      'Vindemiatrix (Female)', 'Sadachbia (Male)', 'Sadaltager (Male)', 'Sulafat (Female)',
      'Alnilam (Male)', 'Rasalgethi (Male)',
    ],
    replicateLanguages: [
      'English (US)', 'English (UK)', 'Spanish', 'French', 'German', 'Italian',
      'Portuguese (Brazil)', 'Japanese', 'Korean', 'Hindi',
    ] },
  { name: 'MiniMax H3', category: 'MiniMax', unit: 's',
    t2vId: 'minimax-h3/text-to-video', i2vId: 'minimax-h3/image-to-video', fflfId: 'minimax-h3/image-to-video', refId: 'minimax-h3/reference-to-video',
    prices: [{ resolution: '768P', cost: 0.08 }, { resolution: '2K', cost: 0.13 }],
    durationMax: 15, durationOptions: ['4', '5', '6', '8', '10', '12', '15'], resolutions: ['768P', '2K'],
    supportsVideoRef: true, supportsAudioRef: true },
  { name: 'MiniMax H3 (Fal)', category: 'MiniMax', unit: 's', provider: 'fal',
    t2vId: 'minimax/h3/reference-to-video', i2vId: 'minimax/h3/reference-to-video',
    prices: [{ resolution: '768P', cost: 0.08 }, { resolution: '2K', cost: 0.13 }, { resolution: '4K', cost: 0.16 }],
    durationMax: 15, durationOptions: ['5', '6', '8', '10', '12', '15'], resolutions: ['768P', '2K', '4K'],
    supportsVideoRef: true, supportsAudioRef: true,
    falAspectRatios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] },
]

const AUDIO_MODELS: ModelPricing[] = [
  { name: 'GPT TTS', category: 'OpenAI', unit: 'img', t2aId: 'gpt-tts-1', kind: 'voice',
    prices: [{ resolution: 'clip', cost: 0.004 }] },
  { name: 'MiniMax TTS', category: 'MiniMax', unit: 'img', t2aId: 'minimax-text-to-speech', kind: 'voice',
    prices: [{ resolution: 'clip', cost: 0.003 }] },
  { name: 'OpenAudio Music', category: 'OpenAudio', unit: 's', t2aId: 'openaudio-text-to-music', kind: 'music',
    prices: [{ resolution: 'std', cost: 0.004 }],
    durationMax: 30, durationOptions: ['10', '15', '20', '30'] },
  { name: 'MuCat Music', category: 'MuCat', unit: 's', t2aId: 'mucat-text-to-music', kind: 'music',
    prices: [{ resolution: 'std', cost: 0.006 }],
    durationMax: 30, durationOptions: ['10', '15', '20', '30'] },
]

function calcCost(model: ModelPricing, resolution?: string, duration?: number, batchSize = 1) {
  let perUnit = model.prices[0]?.cost || 0
  if (resolution) {
    const entry = model.prices.find(p => p.resolution === resolution)
    if (entry) perUnit = entry.cost
  }
  if (model.unit === 's' && duration) perUnit *= duration
  const totalDollars = perUnit * batchSize
  return { perUnitCredits: Math.round(perUnit * 200), totalCredits: Math.round(totalDollars * 200), perUnitDollars: perUnit, totalDollars }
}

export const PromptComposer = forwardRef<PromptComposerHandle, PromptComposerProps>(function PromptComposer({ onGenerate, mode = 'image', subMode, disabled, floating }, ref) {
  const elements = useElementsStore((s) => s.elements)
  const loadElements = useElementsStore((s) => s.loadElements)
  useEffect(() => { loadElements() }, [loadElements])
  const [prompt, setPrompt] = useState('')
  const [modelName, setModelName] = useState(() => {
    const storageKey = `openfield-model-${mode}`
    const def = mode === 'video' ? 'Kling 3.0' : mode === 'audio' ? 'GPT TTS' : 'GPT Image 2'
    try { return localStorage.getItem(storageKey) || def } catch { return def }
  })
  useEffect(() => {
    try { localStorage.setItem(`openfield-model-${mode}`, modelName) } catch {}
  }, [modelName, mode])

  useEffect(() => {
    if (mode === 'audio' && subMode) {
      const filtered = AUDIO_MODELS.filter(m => m.kind === subMode)
      if (filtered.length > 0 && !filtered.find(m => m.name === modelName)) {
        setModelName(filtered[0].name)
      }
    }
  }, [subMode, mode, modelName])
  const [aspectRatio, setAspectRatio] = useState(mode === 'image' ? '1:1' : '16:9')

  // Apply the active workspace's remembered environment (model / aspect ratio / resolution)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeId)
  useEffect(() => {
    const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === activeWorkspaceId)
    const cfg = ws?.config || {}
    const models = mode === 'video' ? VIDEO_MODELS : mode === 'audio' ? AUDIO_MODELS : IMAGE_MODELS
    const savedModel = cfg[`${mode}:model`]
    const savedAr = cfg[`${mode}:aspectRatio`]
    const savedRes = cfg[`${mode}:resolution`]
    if (savedModel && models.some((m) => m.name === savedModel)) setModelName(savedModel)
    if (savedAr) setAspectRatio(savedAr)
    if (savedRes) setResolution(savedRes)
  }, [activeWorkspaceId, mode])
  const defaultModel = (mode === 'video' ? VIDEO_MODELS : mode === 'audio' ? AUDIO_MODELS : IMAGE_MODELS).find(m => {
    const def = mode === 'video' ? 'Kling 3.0' : mode === 'audio' ? 'GPT TTS' : 'GPT Image 2'
    return m.name === (modelName || def)
  })
  const [resolution, setResolution] = useState(defaultModel?.prices[0]?.resolution || '1K')
  const [duration, setDuration] = useState(5)
  const [fps, setFps] = useState(30)
  const [batchSize, setBatchSize] = useState(1)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageMime, setImageMime] = useState<string>('image/png')
  const [refs, setRefs] = useState<{ base64: string; mime: string; duration?: number }[]>([])
  const [firstFrameBase64, setFirstFrameBase64] = useState<string | null>(null)
  const [lastFrameBase64, setLastFrameBase64] = useState<string | null>(null)
  const firstFrameRef = useRef<string | null>(null)
  const lastFrameRef = useRef<string | null>(null)
  const [seedanceMode, setSeedanceMode] = useState<'fflf' | 'ref'>(() => {
    try { return (localStorage.getItem('openfield-seedance-mode') as 'fflf' | 'ref') || 'ref' } catch { return 'ref' }
  })
  const [dragOver, setDragOver] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showModels, setShowModels] = useState(false)
  const [showRatios, setShowRatios] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [showRes, setShowRes] = useState(false)
  const [showCostInfo, setShowCostInfo] = useState(false)
  const [multiShots, setMultiShots] = useState(false)
  const [multiPrompt, setMultiPrompt] = useState<{ prompt: string; duration: number }[]>([])
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [imageRefEntries, setImageRefEntries] = useState<{ name: string; type: 'subject' | 'background'; base64?: string; mime?: string }[]>([])
  const [replicateVoice, setReplicateVoice] = useState('Zephyr (Female)')
  const [replicateLanguage, setReplicateLanguage] = useState('English (US)')
  const [showRefsModal, setShowRefsModal] = useState(false)
  const [showAtMenu, setShowAtMenu] = useState(false)
  const [atMenuFilter, setAtMenuFilter] = useState('')
  const [atMenuIndex, setAtMenuIndex] = useState(0)
  const [showInsertMenu, setShowInsertMenu] = useState(false)
  const [showInsertLibrary, setShowInsertLibrary] = useState(false)
  const insertRef = useRef<HTMLDivElement>(null)
  const insertFileRef = useRef<HTMLInputElement>(null)
  const [badgePopover, setBadgePopover] = useState<{ elementName: string; rect: DOMRect } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [localModels, setLocalModels] = useState<ModelPricing[]>([])
  const localModelsRef = useRef(localModels)
  localModelsRef.current = localModels
  const [serverStatus, setServerStatus] = useState<string>('stopped')
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    const wanted: { base64: string; name: string; refType: string }[] = []
    for (const tag of tags) {
      const elName = tag.replace('@element:', '').replace('\u200B', '').trim()
      const el = elements.find(e => e.name === elName)
      if (!el) continue
      if (el.imageBase64 && !removedElementRefs.current.has(el.imageBase64)) {
        wanted.push({ base64: el.imageBase64, name: el.name, refType: 'Primary' })
      }
      if (el.poseRef && !removedElementRefs.current.has(el.poseRef)) {
        wanted.push({ base64: el.poseRef, name: el.name, refType: 'Pose' })
      }
    }

    // Clean up removedElementRefs for elements no longer in prompt
    const activeBase64s = new Set(wanted.map(w => w.base64))
    for (const b64 of removedElementRefs.current) {
      if (!activeBase64s.has(b64)) removedElementRefs.current.delete(b64)
    }

    setRefs(prev => {
      const nonElement = prev.filter(r => !(r as any).elementName)
      const existing = prev.filter(r => (r as any).elementName)
      const existingBase64s = new Set(existing.map(r => r.base64))

      for (const w of wanted) {
        if (!existingBase64s.has(w.base64)) {
          nonElement.push({ base64: w.base64, mime: 'image/png', elementName: w.name, refType: w.refType } as any)
        }
      }
      // Keep existing element refs that are still wanted
      for (const e of existing) {
        if (activeBase64s.has(e.base64) && !nonElement.some(r => r.base64 === e.base64)) {
          nonElement.push(e)
        }
      }
      return nonElement
    })
  }, [prompt, elements])
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

  // Load local models
  const loadLocalModels = useCallback(() => {
    const api = (window as any).electronAPI
    if (mode === 'audio') {
      // Piper TTS voices (local)
      api?.local?.piperGetVoices?.().then(async (voices: any[]) => {
        if (!voices || voices.length === 0) { setLocalModels([]); return }
        const installed = await api?.local?.piperIsInstalled?.().catch(() => false)
        if (!installed) { setLocalModels([]); return }
        const downloaded: any[] = []
        for (const v of voices) {
          const ok = await api?.local?.piperIsVoiceDownloaded?.(v.id).catch(() => false)
          if (ok) downloaded.push(v)
        }
        const mapped: ModelPricing[] = downloaded.map((v: any) => ({
          name: `Piper · ${v.id}`,
          category: 'Local',
          unit: 'img' as const,
          prices: [{ resolution: 'clip', cost: 0 }],
          local: true,
          kind: 'voice' as const,
          modelId: v.id,
          voiceId: v.id,
          t2aId: v.id,
        }))
        setLocalModels(mapped)
      }).catch(() => setLocalModels([]))

      // Kokoro TTS voices (local, from marketplace download)
      api?.local?.kokoroIsInstalled?.().then(async (installed: boolean) => {
        if (!installed) return
        const voices = await api?.local?.kokoroGetVoices?.() || []
        if (!voices || voices.length === 0) return
        const mapped: ModelPricing[] = voices.map((v: any) => ({
          name: `Kokoro · ${v.id}`,
          category: 'Local',
          unit: 'img' as const,
          prices: [{ resolution: 'clip', cost: 0 }],
          local: true,
          kind: 'voice' as const,
          modelId: v.id,
          voiceId: v.id,
          t2aId: v.id,
          engine: 'kokoro',
        }))
        setLocalModels(prev => [...prev, ...mapped])
      }).catch(() => {})
      return
    }
    const tag = mode === 'video' ? 'text-to-video' : 'text-to-image'
    console.log('[PromptComposer] loadLocalModels tag:', tag)
    api?.models?.listByPipeline?.().then((byPipeline: any) => {
      console.log('[PromptComposer] byPipeline:', byPipeline)
      const list = byPipeline?.[tag] || []
      console.log('[PromptComposer] local models list:', list.length, list)
      const mapped: ModelPricing[] = list.map((m: any) => ({
        name: m.displayName,
        category: 'Local',
        unit: 'img' as const,
        prices: [{ resolution: mode === 'image' ? '1K' : '720p', cost: 0 }],
        local: true,
        modelId: m.id,
        t2iId: m.id,
        i2iId: m.id,
      }))
      console.log('[PromptComposer] mapped models:', mapped)
      setLocalModels(mapped)
    }).catch((err: any) => {
      console.error('[PromptComposer] loadLocalModels failed:', err)
      setLocalModels([])
    })
  }, [mode])

  useEffect(() => {
    loadLocalModels()

    const api = (window as any).electronAPI
    api?.local?.serverStatus?.().then((s: any) => setServerStatus(s?.status || 'stopped'))
    const int = setInterval(() => {
      api?.local?.serverStatus?.().then((s: any) => setServerStatus(s?.status || 'stopped'))
    }, 5000)

    // Refresh local models when a download completes
    const cleanup = api?.on?.('models:download:completed', () => {
      loadLocalModels()
    })

    return () => {
      clearInterval(int)
      cleanup?.()
    }
  }, [loadLocalModels])

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

  const models = [...(mode === 'video' ? VIDEO_MODELS : mode === 'audio' ? AUDIO_MODELS : IMAGE_MODELS), ...localModels]
    .filter(m => mode === 'audio' && subMode ? m.kind === subMode : true)
  const currentModel = models.find(m => m.name === modelName) || models[0]

  const hasImageRef = refs.some(r => r.mime.startsWith('image/'))
  const hasVideoRef = refs.some(r => r.mime.startsWith('video/'))
  const hasImageSupport = !!(currentModel.i2iId || currentModel.editId || currentModel.i2vId || currentModel.fflfId)
  const isKling = !!(currentModel.t2vId?.startsWith('kling') || currentModel.i2vId?.startsWith('kling'))
  const isSeedance = !!(currentModel.t2vId?.startsWith('bytedance/') || currentModel.i2vId?.startsWith('bytedance/'))
  const isPixverseV6 = !!(currentModel.t2vId?.startsWith('pixverse-v6/') || currentModel.i2vId?.startsWith('pixverse-v6/') || currentModel.fflfId?.startsWith('pixverse-v6/'))
  const isGrok = !!(currentModel.t2vId?.startsWith('grok-imagine/') || currentModel.i2vId?.startsWith('grok-imagine/') || currentModel.extendId?.startsWith('grok-imagine/'))
  const isMinimaxH3 = !!(currentModel.t2vId?.startsWith('minimax-h3/') || currentModel.i2vId?.startsWith('minimax-h3/'))

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
  const isFFLF = (!!(currentModel.fflfId) && seedanceMode === 'fflf') || isKling
  const isFFLFRef = useRef(isFFLF)
  isFFLFRef.current = isFFLF
  const isRefMode = (!!(currentModel.fflfId) && seedanceMode === 'ref') || currentModel.provider === 'fal'
  const isOmniHuman = currentModel.t2vId === 'omnihuman-1-5'
  const isReplicate = currentModel.provider === 'replicate'
  const hasReplicateAudio = isReplicate && refs.some(r => r.mime.startsWith('audio/'))
  const isFal = currentModel.provider === 'fal'

  // Reset Replicate voice/language when switching to a Replicate model
  useEffect(() => {
    if (isReplicate && currentModel.replicateVoices?.length && !currentModel.replicateVoices.includes(replicateVoice)) {
      setReplicateVoice(currentModel.replicateVoices[0])
    }
    if (isReplicate && currentModel.replicateLanguages?.length && !currentModel.replicateLanguages.includes(replicateLanguage)) {
      setReplicateLanguage(currentModel.replicateLanguages[0])
    }
  }, [currentModel?.name, replicateVoice, replicateLanguage])

  // Persist seedanceMode to localStorage so FFLF toggle survives remounts
  useEffect(() => {
    try { localStorage.setItem('openfield-seedance-mode', seedanceMode) } catch {}
  }, [seedanceMode])

  useEffect(() => { lastFrameRef.current = lastFrameBase64 }, [lastFrameBase64])
  const effectiveResolution = (soundEnabled && isKling && resolution !== '4k') ? resolution + '-audio' : (soundEnabled && isPixverseV6) ? resolution + '-audio' : resolution
  // OmniHuman: the audio determines the generation length, so the cost is based on it
  const omnihumanAudio = isOmniHuman ? refs.find(r => r.mime.startsWith('audio/')) : undefined
  // Replicate (P-Video Avatar): billed per second of output. The output length is driven by the
  // attached audio; without audio, estimate speech length from the script (~2.5 words/sec).
  const replicateAudio = isReplicate ? refs.find(r => r.mime.startsWith('audio/')) : undefined
  const replicateAudioDuration = replicateAudio?.duration || 0
  const replicateEstDuration = replicateAudioDuration > 0
    ? replicateAudioDuration
    : Math.max(1, Math.round((prompt.trim().split(/\s+/).filter(Boolean).length / 2.5) * 10) / 10)
  const costDuration = isOmniHuman ? (omnihumanAudio?.duration || 0) : isReplicate ? replicateEstDuration : duration
  // PixVerse V6 routes to a single model: use the price table of the routed mode
  const activeModelId = getActiveModelId()
  const activePixversePrices = isPixverseV6 ? (activeModelId === 'pixverse-v6/reference-to-video' ? PIXVERSE_REF_PRICES : PIXVERSE_T2V_PRICES) : undefined
  const costModel = activePixversePrices ? { ...currentModel, prices: activePixversePrices } : currentModel
  const { perUnitCredits, totalCredits, perUnitDollars, totalDollars: baseDollars } = calcCost(costModel, effectiveResolution, costDuration, batchSize)
  // fal.ai (MiniMax H3): first 5 reference images free, +$0.08 per extra image
  const falRefSurcharge = isFal && currentModel.t2vId ? Math.max(0, refs.filter(r => r.mime.startsWith('image/')).length - 5) * 0.08 : 0
  // KIE MiniMax H3: video input billed at the selected resolution rate; first 5 images free, +$0.04 per extra image
  const h3InputVideoSeconds = isMinimaxH3 ? refs.filter(r => r.mime.startsWith('video/')).reduce((s, r) => s + (r.duration || 0), 0) : 0
  const kieH3ImageSurcharge = isMinimaxH3 ? Math.max(0, refs.filter(r => r.mime.startsWith('image/')).length - 5) * 0.04 : 0
  const totalDollars = baseDollars + falRefSurcharge + kieH3ImageSurcharge + (isMinimaxH3 ? h3InputVideoSeconds * perUnitDollars : 0)

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

  const handleVideoRef = async (file: File) => {
    const MAX_VIDEO_SIZE = 50 * 1024 * 1024
    if (file.size > MAX_VIDEO_SIZE) { showError(`Video "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(0)}MB). Max 50MB.`); return }
    const videoRefs = refs.filter(r => r.mime.startsWith('video/'))
    const isSeedanceModel = currentModel.t2vId?.startsWith('bytedance/') || currentModel.i2vId?.startsWith('bytedance/')
    if (isSeedanceModel && videoRefs.length >= 3) return
    const { base64, mime } = await readFileAsBase64(file)
    const duration = await getVideoDuration(file)
    if (isSeedanceModel) {
      const totalDur = videoRefs.reduce((s, r) => s + (r.duration || 0), 0)
      if (duration > 0 && totalDur + duration > 15) return
    }
    setRefs(prev => [...prev, { base64, mime, duration }])
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
    else if (slot === 'first') { setFirstFrameBase64(base64); firstFrameRef.current = base64 }
    else if (slot === 'last') { setLastFrameBase64(base64); lastFrameRef.current = base64 }
    e.target.value = ''
  }

  const removeImage = (slot: 'main' | 'first' | 'last') => {
    if (slot === 'main') setImageBase64(null)
    else if (slot === 'first') { setFirstFrameBase64(null); firstFrameRef.current = null }
    else { setLastFrameBase64(null); lastFrameRef.current = null }
  }

  const insertImage = (base64: string, mime: string) => {
    if (isFFLF) {
      if (!firstFrameRef.current) { setFirstFrameBase64(base64); firstFrameRef.current = base64 }
      else if (!lastFrameRef.current) { setLastFrameBase64(base64); lastFrameRef.current = base64 }
    } else {
      setRefs(prev => [...prev, { base64, mime }])
    }
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

  const handleInsertLibrarySelect = async (asset: any) => {
    try {
      const api = (window as any).electronAPI
      const results = await api?.assets.readBase64([asset.id])
      const b64 = results?.[0]?.base64
      const mime = results?.[0]?.mime || 'image/png'
      if (b64) insertImage(b64, mime)
    } catch (err: any) {
      showError(`Cannot load "${asset.fileName || asset.file_name || 'asset'}": ${err?.message || err}`)
    }
    setShowInsertLibrary(false)
  }

  useImperativeHandle(ref, () => ({
    loadFromParams(params) {
      if (params.prompt) {
        setPrompt(params.prompt)
      }
      if (params.model) {
  const cloudModels = mode === 'video' ? VIDEO_MODELS : mode === 'audio' ? AUDIO_MODELS : IMAGE_MODELS
  const models = [...cloudModels, ...localModelsRef.current]
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
      if (params.fps != null) setFps(params.fps)
      if (params.sound != null) setSoundEnabled(params.sound)
      if (params.voice) setReplicateVoice(params.voice)
      if (params.voiceLanguage) setReplicateLanguage(params.voiceLanguage)
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
      const imageRefs = newRefs.filter(r => r.mime.startsWith('image/'))
      const otherRefs = newRefs.filter(r => !r.mime.startsWith('image/'))
      if (isFFLFRef.current && imageRefs.length > 0) {
        let ffAssigned = !!firstFrameRef.current
        let lfAssigned = !!lastFrameRef.current
        const remaining: { base64: string; mime: string }[] = []
        for (const ref of imageRefs) {
          if (!ffAssigned) { setFirstFrameBase64(ref.base64); firstFrameRef.current = ref.base64; ffAssigned = true }
          else if (!lfAssigned) { setLastFrameBase64(ref.base64); lastFrameRef.current = ref.base64; lfAssigned = true }
          else { remaining.push(ref) }
        }
        if (remaining.length > 0 || otherRefs.length > 0) {
          setRefs(prev => [...prev, ...remaining, ...otherRefs])
        }
      } else {
        setRefs(prev => [...prev, ...newRefs])
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
        local: currentModel.local,
        modelId: currentModel.modelId,
        voiceId: currentModel.voiceId,
        engine: currentModel.engine,
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
    const elementImages: { base64: string; mime: string; name?: string; refType?: string }[] = []
    for (const tag of elementTags) {
      const elName = tag.replace('@element:', '').replace('\u200B', '').trim()
      const el = elements.find(e => e.name === elName)
      if (!el) continue
      if (el.imageBase64) elementImages.push({ base64: el.imageBase64, mime: 'image/png', name: el.name, refType: 'element_primary' })
      if (el.poseRef) elementImages.push({ base64: el.poseRef, mime: 'image/png', name: el.name, refType: 'element_pose' })
      for (const refImg of (el.referenceImages || [])) {
        elementImages.push({ base64: refImg, mime: 'image/png', name: el.name, refType: 'element_ref' })
      }
    }

    // Build final imageRefs: named refs first, then element images, then dropped refs
    let finalImageRefs = showRefsModal && imageRefEntries.length > 0
      ? imageRefEntries.filter(e => e.base64).map(e => ({ base64: e.base64!, mime: e.mime || 'image/png', name: e.name, refType: e.type }))
      : imageRefItems.map(r => ({ base64: r.base64, mime: r.mime }))

    if (elementImages.length > 0) {
      finalImageRefs = [...finalImageRefs, ...elementImages]
    }

    // Deduplicate by base64 (element images may already be in refs from the UI sync)
    const seen = new Set<string>()
    finalImageRefs = finalImageRefs.filter(r => {
      if (seen.has(r.base64)) return false
      seen.add(r.base64)
      return true
    })

    // Grok i2v at 1080p only supports a single image; multi-image + aspect ratio need 480p/720p
    if (isGrok && activeId === 'grok-imagine/image-to-video' && resolution === '1080p' && finalImageRefs.length > 1) {
      showError('1080p solo soporta una imagen. Usa 720p o 480p para múltiples referencias.')
      return
    }

    persistEnv()

    onGenerate({
      prompt: prompt.trim(),
      model: activeId,
      provider: isReplicate ? 'replicate' : isFal ? 'fal' : undefined,
      voice: isReplicate ? replicateVoice : undefined,
      voiceLanguage: isReplicate ? replicateLanguage : undefined,
      aspectRatio: aspectRatio,
      resolution: resolution,
      batchSize,
      // OmniHuman is audio-driven: the audio determines the length, no duration/FPS
      duration: mode === 'video' && activeId !== 'omnihuman-1-5' && !isReplicate ? duration : undefined,
      fps: mode === 'video' && activeId !== 'omnihuman-1-5' && !isReplicate ? fps : undefined,
      sound: mode === 'video' && !isReplicate ? soundEnabled : undefined,
      // In image mode imageBase64 duplicates imageRefs[0] (same image by construction) and the
      // API only uses refs when present, so skip it to keep stored parameters clean.
      // Video models that ignore imageRefs still need imageBase64.
      imageBase64: isReplicate ? (imageBase64 || finalImageRefs[0]?.base64 || undefined) : (mode === 'image' && finalImageRefs.length > 0) ? undefined : (namedRefItems.length > 0 ? namedRefItems[0].base64 : (imageRefItems.length > 0) ? imageRefItems[0].base64 : ((activeId !== currentModel.t2iId && activeId !== currentModel.t2vId) ? (imageBase64 || undefined) : undefined)),
      imageMime: isReplicate ? (imageMime || finalImageRefs[0]?.mime || 'image/png') : (namedRefItems[0]?.mime || imageRefItems[0]?.mime || imageMime),
      imageRefs: isReplicate ? undefined : (finalImageRefs.length > 0 ? finalImageRefs : undefined),
      videoRefs: videoRefItems.length > 0 ? videoRefItems : undefined,
      audioRefs: audioRefItems.length > 0 ? audioRefItems : undefined,
      firstFrameBase64: isFFLF ? (firstFrameBase64 || undefined) : undefined,
      lastFrameBase64: isFFLF ? (lastFrameBase64 || undefined) : undefined,
      multiShots: !isReplicate && multiShots ? multiShots : undefined,
      multiPrompt: !isReplicate && multiShots && multiPrompt.length > 0 ? multiPrompt : undefined,
      local: currentModel.local,
      modelId: currentModel.modelId,
    })
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
  }, [prompt, aspectRatio, resolution, batchSize, duration, fps, imageBase64, imageMime, refs, firstFrameBase64, lastFrameBase64, currentModel, onGenerate, mode, isFFLF, multiShots, multiPrompt, soundEnabled, showRefsModal, imageRefEntries, elements, isReplicate, replicateVoice, replicateLanguage])
  const hasMedia = refs.length > 0 || !!imageBase64 || !!firstFrameBase64 || !!lastFrameBase64

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
      <div ref={composerRootRef} className={`${floating ? 'absolute inset-x-0 bottom-0' : 'sticky bottom-0'} z-40 px-4 pb-4 pt-2 pointer-events-none`}>
        <div className="max-w-5xl mx-auto pointer-events-auto">
          <div
            ref={cardRef}
            className="relative bg-sidebar/90 border border-white/20 rounded-2xl shadow-2xl shadow-black/40 backdrop-blur-xl backdrop-saturate-150 transition-all duration-200"
          >
            {/* Image chips at top (default for all references). In FF/LF mode image refs live in the FF/LF dropzones, so only video/audio refs are shown */}
            {hasMedia && (!isFFLF || refs.some(r => !r.mime.startsWith('image/'))) && (
              <div className="flex gap-2 px-3 pt-2.5">
                {refs.map((ref, i) => {
                  if (isFFLF && ref.mime.startsWith('image/')) return null
                  const elRef = ref as any
                  const isElementRef = !!elRef.elementName
                  const imgIdx = refs.filter((r, j) => r.mime.startsWith('image/') && j <= i).length
                  const vidIdx = refs.filter((r, j) => r.mime.startsWith('video/') && j <= i).length
                  const audIdx = refs.filter((r, j) => r.mime.startsWith('audio/') && j <= i).length
                  let chipLabel: string
                  if (isElementRef) {
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
                    if (isElementRef) {
                      removedElementRefs.current.add(ref.base64)
                    }
                    setRefs(prev => prev.filter((_, j) => j !== i))
                  }
                  return <ChipRef key={i} mime={ref.mime} base64={ref.base64} label={chipLabel} onRemove={handleRemove} />
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
                      <label htmlFor="file-first" className="aspect-square h-[52px] border border-dashed border-surface-700 hover:border-accent-500/50 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors gap-0.5 overflow-hidden">
                        {firstFrameBase64 ? (
                          <img src={`data:image/png;base64,${firstFrameBase64}`} className="w-full h-full object-cover" alt="FF" />
                        ) : (
                          <>
                            <Upload size={10} className="text-surface-500" />
                            <span className="text-[8px] text-surface-500">FF</span>
                          </>
                        )}
                      </label>
                      {firstFrameBase64 && (
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeImage('first') }}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-surface-950 border border-surface-700 rounded-full flex items-center justify-center text-surface-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <X size={10} />
                        </button>
                      )}
                    </div>
                    <input id="file-first" type="file" accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, 'first')} />
                    {firstFrameBase64 && lastFrameBase64 && !(multiShots && isKling) && (
                      <button
                        onClick={(e) => {
                          e.preventDefault(); e.stopPropagation()
                          const ff = lastFrameBase64
                          const lf = firstFrameBase64
                          setFirstFrameBase64(ff)
                          setLastFrameBase64(lf)
                          firstFrameRef.current = ff
                          lastFrameRef.current = lf
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded-full bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors flex-shrink-0"
                        title="Swap FF/LF"
                      >
                        <ArrowLeftRight size={12} />
                      </button>
                    )}
                    {!(multiShots && isKling) && (
                      <div className="relative group">
                        <label htmlFor="file-last" className="aspect-square h-[52px] border border-dashed border-surface-700 hover:border-accent-500/50 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors gap-0.5 overflow-hidden">
                          {lastFrameBase64 ? (
                            <img src={`data:image/png;base64,${lastFrameBase64}`} className="w-full h-full object-cover" alt="LF" />
                          ) : (
                            <>
                              <Upload size={10} className="text-surface-500" />
                              <span className="text-[8px] text-surface-500">LF</span>
                            </>
                          )}
                        </label>
                        {lastFrameBase64 && (
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeImage('last') }}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-surface-950 border border-surface-700 rounded-full flex items-center justify-center text-surface-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <X size={10} />
                          </button>
                        )}
                      </div>
                    )}
                    {!(multiShots && isKling) && <input id="file-last" type="file" accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, 'last')} />}
                  </div>
              )}

              <div className="flex-1 relative">
                <RichPromptInput
                  ref={richInputRef}
                  value={prompt}
                  onChange={(text) => { setPrompt(text) }}
                  onAtState={(active, query) => {
                    if (active) {
                      setAtMenuFilter(query)
                      setAtMenuIndex(0)
                      setShowAtMenu(true)
                    } else {
                      setShowAtMenu(false)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (showAtMenu) {
                      const refEntries = (showRefsModal ? imageRefEntries.filter(re => re.name && re.name.toLowerCase().startsWith(atMenuFilter.toLowerCase())) : [])
                      const elMatches = elements.filter(el =>
                        el.name.toLowerCase().includes(atMenuFilter.toLowerCase()) ||
                        el.tags.some(t => t.toLowerCase().includes(atMenuFilter.toLowerCase()))
                      ).slice(0, 5)
                      const totalItems = refEntries.length + elMatches.length
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setAtMenuIndex(prev => Math.min(prev + 1, totalItems - 1))
                        return
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setAtMenuIndex(prev => Math.max(prev - 1, 0))
                        return
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (atMenuIndex < refEntries.length) {
                          const re = refEntries[atMenuIndex]
                          setPrompt(prev => (prev + ' @' + re.name).trim() + ' ')
                        } else {
                          const el = elMatches[atMenuIndex - refEntries.length]
                          if (el) richInputRef.current?.insertBadge(el)
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
                  elements={elements}
                  onBadgeClick={(name, rect) => setBadgePopover({ elementName: name, rect })}
                  placeholder={mode === 'image' ? 'Describe what you want to generate...' : mode === 'audio' ? 'Describe the voice line or music track...' : isReplicate ? 'Type what the avatar should say...' : 'Describe the video you want to create...'}
                />
                {/* @ autocomplete dropdown */}
                {showAtMenu && (() => {
                  const refEntries = (showRefsModal ? imageRefEntries.filter(re => re.name && re.name.toLowerCase().startsWith(atMenuFilter.toLowerCase())) : [])
                  const elMatches = elements.filter(el =>
                    el.name.toLowerCase().includes(atMenuFilter.toLowerCase()) ||
                    el.tags.some(t => t.toLowerCase().includes(atMenuFilter.toLowerCase()))
                  ).slice(0, 5)
                  const KIND_ICON_MAP: Record<ElementKind, typeof User> = {
                    avatar: UserCircle,
                    character: User,
                    environment: Mountain,
                    object: Box,
                  }
                  return (
                    <div ref={atMenuRef} className="absolute left-3 bottom-full mb-1 bg-surface-800 border border-surface-700 rounded-lg py-1 min-w-[180px] shadow-xl z-50 max-h-48 overflow-y-auto">
                      {refEntries.length === 0 && elMatches.length === 0 && (
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
                      {elMatches.map((el, idx) => {
                        const i = refEntries.length + idx
                        const Icon = KIND_ICON_MAP[el.kind]
                        const cfg = KIND_CONFIG[el.kind]
                        return (
                          <button
                            key={'el-' + el.id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              richInputRef.current?.insertBadge(el)
                              setShowAtMenu(false)
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${atMenuIndex === i ? 'bg-surface-700/60 text-surface-100' : 'text-surface-300 hover:bg-surface-700/50 hover:text-surface-100'}`}
                          >
                            {el.imageBase64 ? (
                              <img src={`data:image/png;base64,${el.imageBase64}`} className="w-5 h-5 rounded object-cover" alt="" />
                            ) : (
                              <div className={`w-5 h-5 rounded ${cfg.color === 'text-violet-400' ? 'bg-violet-500/20' : cfg.color === 'text-blue-400' ? 'bg-blue-500/20' : cfg.color === 'text-emerald-400' ? 'bg-emerald-500/20' : 'bg-amber-500/20'} flex items-center justify-center`}>
                                <Icon size={11} className={cfg.color} />
                              </div>
                            )}
                            <span className={cfg.color}>@{el.name}</span>
                            <span className="text-[10px] text-surface-500 ml-auto">{cfg.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })()}
                {prompt && (
                  <button onClick={() => { setPrompt(''); richInputRef.current?.setText('') }} className="absolute right-2 top-2 text-surface-500 hover:text-surface-300 transition-colors">
                    <X size={14} />
                  </button>
                )}
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
            {multiShots && isKling && (() => {
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
              <div className="relative" ref={modelsRef}>
                <button onClick={() => setShowModels(!showModels)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-surface-800/80 hover:bg-surface-700/80 rounded-lg text-[11px] font-medium text-surface-300 transition-colors">
                  <Wand2 size={11} /> {currentModel.name}
                  {currentModel.provider === 'replicate' ? <span className="text-[9px] px-1 py-0.5 rounded bg-violet-500/20 text-violet-400 font-semibold">REPLICATE</span>
                    : currentModel.provider === 'fal' ? <span className="text-[9px] px-1 py-0.5 rounded bg-sky-500/20 text-sky-400 font-semibold">FAL</span>
                    : currentModel.local ? <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/20 text-green-500/80 font-semibold flex items-center gap-0.5"><Cpu size={9} />LOCAL</span>
                    : <span className="text-[9px] px-1 py-0.5 rounded bg-accent-500/20 text-accent-400 font-semibold">KIE</span>}
                  <ChevronDown size={11} />
                </button>
                  {showModels && (() => {
                    const groups: { label: string; items: ModelPricing[] }[] = [
                      { label: 'KIE.ai', items: models.filter(m => !m.local && m.provider !== 'replicate' && m.provider !== 'fal') },
                      { label: 'Replicate', items: models.filter(m => m.provider === 'replicate') },
                      { label: 'fal.ai', items: models.filter(m => m.provider === 'fal') },
                      { label: 'Local', items: models.filter(m => m.local) },
                    ].filter(g => g.items.length > 0)
                    return (
                    <div className="absolute bottom-full left-0 mb-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[220px] shadow-xl max-h-[280px] overflow-y-auto z-50">
                      {groups.map((g, gi) => (
                        <div key={g.label}>
                          {gi > 0 && <div className="h-px bg-surface-700/60 my-1" />}
                          <div className="px-3 pt-1.5 pb-0.5 text-[9px] uppercase tracking-wider text-surface-600">{g.label}</div>
                          {g.items.map((m) => (
                            <button key={`${g.label}-${m.name}`}
                              onClick={() => { setModelName(m.name); setShowModels(false); if (m.prices[0]) setResolution(m.prices[0].resolution); if (!m.t2vId?.startsWith('pixverse-v6/') && !m.i2vId?.startsWith('pixverse-v6/')) { setShowRefsModal(false); setImageRefEntries([]) } }}
                              className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${modelName === m.name ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/50'}`}>
                              <div>
                                <span>{m.name}</span>
                                <span className={`text-[10px] ml-2 ${m.local ? 'text-green-500/70' : 'text-surface-600'}`}>
                                  {m.local ? <><Cpu size={10} className="inline mr-0.5" />Local</> : m.category}
                                </span>
                              </div>
                              <span className="text-amber-400/80 text-[10px]">{m.local ? (serverStatus === 'running' ? 'Ready' : 'Offline') : (m.provider === 'replicate' || m.provider === 'fal' ? `$${(m.prices[0]?.cost || 0).toFixed(3)}/${m.unit === 's' ? 's' : 'img'}` : `${Math.round(m.prices[0]?.cost * 200)} cr`)}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                    )
                  })()}
              </div>

              {/* Audio duration for music models */}
              {mode === 'audio' && currentModel.kind === 'music' && (
                <StreamDuration
                  value={duration}
                  options={currentModel.durationOptions}
                  min={10}
                  max={currentModel.durationMax || 30}
                  onChange={setDuration}
                />
              )}

              {/* Toggles: FF, Multi-shot, Image Refs, Sound */}
              {currentModel.fflfId && (
                <button onClick={() => {
                    if (isFFLF) { setSeedanceMode('ref'); setFirstFrameBase64(null); setLastFrameBase64(null); firstFrameRef.current = null; lastFrameRef.current = null }
                    else {
                      setSeedanceMode('fflf')
                      // Redistribute user image refs into FF/LF: 1 ref ? FF, 2 refs ? FF + LF
                      const userImageRefs = refs.filter(r => r.mime.startsWith('image/') && !(r as any).elementName)
                      const others = refs.filter(r => !userImageRefs.includes(r))
                      if (userImageRefs[0]) { setFirstFrameBase64(userImageRefs[0].base64); firstFrameRef.current = userImageRefs[0].base64 }
                      if (userImageRefs[1]) { setLastFrameBase64(userImageRefs[1].base64); lastFrameRef.current = userImageRefs[1].base64 }
                      setRefs([...userImageRefs.slice(2), ...others])
                    }
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${isFFLF ? 'bg-accent-600 text-white' : 'bg-surface-800/80 text-surface-500 hover:text-surface-300'}`}>
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
              {isKling && (
                <button onClick={() => { setMultiShots(!multiShots); if (!multiShots && multiPrompt.length === 0) setMultiPrompt([{ prompt: '', duration: 5 }]) }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${multiShots ? 'bg-accent-600 text-white' : 'bg-surface-800/80 text-surface-500 hover:text-surface-300'}`}>
                  Multi-shot
                </button>
              )}
              {(isKling || isSeedance || isPixverseV6) && mode === 'video' && (
                <button onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${soundEnabled ? 'bg-accent-600 text-white' : 'bg-surface-800/80 text-surface-500 hover:text-surface-300'}`}>
                  <Music size={11} />
                </button>
              )}

              {/* Selects */}

              {mode === 'image' && (
                <>
                  <div className="relative" ref={ratiosRef}>
                    <button onClick={() => setShowRatios(!showRatios)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-surface-800/80 hover:bg-surface-700/80 rounded-lg text-[11px] font-medium text-surface-300 transition-colors">
                      {aspectRatio} <ChevronDown size={11} />
                    </button>
                    {showRatios && (
                      <div className="absolute bottom-full left-0 mb-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[100px] shadow-xl z-50">
                        {(isFal && currentModel.falAspectRatios ? currentModel.falAspectRatios : ASPECT_RATIOS).map((r) => (
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

              {mode === 'video' && currentModel.t2vId !== 'omnihuman-1-5' && !isReplicate && (
                <StreamDuration
                  value={duration}
                  options={currentModel.durationOptions}
                  min={4}
                  max={currentModel.durationMax || 15}
                  onChange={setDuration}
                />
              )}
              {currentModel.resolutions && (
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
              {isReplicate && (
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
              {(currentModel.t2vId?.startsWith('gemini-omni') || currentModel.t2vId?.startsWith('bytedance/') || currentModel.t2vId?.startsWith('pixverse-v6/') || currentModel.i2vId?.startsWith('pixverse-v6/') || currentModel.t2vId?.startsWith('grok-imagine/') || currentModel.i2vId?.startsWith('grok-imagine/') || isMinimaxH3 || isFal) && (
                <div className="relative" ref={ratiosRef}>
                  <button onClick={() => { if (!grokSingleI2v) setShowRatios(!showRatios) }}
                    disabled={grokSingleI2v}
                    title={grokSingleI2v ? 'Con una sola imagen, el aspecto del video sigue la imagen adjunta (Grok i2v). Usa 2+ imágenes o text-to-video para elegir el ratio.' : undefined}
                    className="flex items-center gap-1 px-2.5 py-1 bg-surface-800/80 hover:bg-surface-700/80 rounded-lg text-[11px] font-medium text-surface-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {aspectRatio} <ChevronDown size={11} />
                  </button>
                  {showRatios && (
                    <div className="absolute bottom-full left-0 mb-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[100px] shadow-xl z-50">
                      {(isFal ? (currentModel.falAspectRatios || ['adaptive', '16:9']) : currentModel.t2vId?.startsWith('bytedance/') ? ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', 'adaptive'] : currentModel.t2vId?.startsWith('pixverse-v6/') || currentModel.i2vId?.startsWith('pixverse-v6/') ? ['1:1', '16:9', '21:9', '2:3', '3:2', '3:4', '4:3', '9:16'] : currentModel.t2vId?.startsWith('grok-imagine/') || currentModel.i2vId?.startsWith('grok-imagine/') ? ['16:9', '9:16', '1:1', '2:3', '3:2'] : isMinimaxH3 ? ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] : ['16:9', '9:16']).map((r) => (
                        <button key={r} onClick={() => { setAspectRatio(r); setShowRatios(false) }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${aspectRatio === r ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/50'}`}>{r}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {mode === 'video' && !isReplicate && !isFal && !(currentModel.t2vId?.startsWith('gemini-omni') || currentModel.t2vId?.startsWith('bytedance/') || currentModel.t2vId?.startsWith('grok-imagine/') || isKling || isPixverseV6 || isMinimaxH3) && (
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
              <button onClick={handleGenerate} disabled={disabled || (mode === 'audio' ? !prompt.trim() : (showRefsModal ? !prompt.trim() || (!imageRefEntries.some(e => e.base64) && !imageBase64 && refs.length === 0) : (multiShots ? !multiPrompt.some(s => s.prompt.trim()) || multiPrompt.reduce((a, x) => a + x.duration, 0) > 15 : (isFFLF ? !prompt.trim() && !firstFrameBase64 : (isReplicate ? !prompt.trim() && !imageBase64 && !refs.some(r => r.mime.startsWith('audio/')) : !prompt.trim() && !imageBase64 && !firstFrameBase64 && refs.length === 0)))))}
                className="flex-shrink-0 flex flex-col items-center justify-center gap-1.5 px-4 min-w-[56px] bg-accent-600 hover:bg-accent-500 disabled:bg-accent-600/50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all active:scale-[0.97]">
                <span className="flex items-center gap-1">
                  <Sparkles size={12} />
                  <span className="text-xs font-medium leading-none">Generar</span>
                </span>
                <span className="flex flex-col items-center leading-none">
                  {currentModel.local ? <Cpu size={16} /> : (isReplicate || isFal) ? (
                    <span>${totalDollars.toFixed(2)}</span>
                  ) : (
                    <>
                      <span>{totalCredits}</span>
                      <span className="text-[9px] opacity-70 mt-0.5">${totalDollars.toFixed(2)}</span>
                    </>
                  )}
                </span>
              </button>
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
        <input id="file-video" type="file" accept="video/*" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          await handleVideoRef(file)
          e.target.value = ''
        }} />
        <input id="file-audio" type="file" accept="audio/*" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          if (file.size > 20 * 1024 * 1024) { showError(`Audio "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(0)}MB)`); return }
          const { base64, mime } = await readFileAsBase64(file)
          setRefs(prev => [...prev, { base64, mime }])
          e.target.value = ''
        }} />
        <input id="file-first" type="file" accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, 'first')} />
        <input id="file-last" type="file" accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, 'last')} />
        <input id="file-video" type="file" accept="video/*" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          await handleVideoRef(file)
          e.target.value = ''
        }} />
        <input id="file-audio" type="file" accept="audio/*" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          if (file.size > 20 * 1024 * 1024) { showError(`Audio "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(0)}MB)`); return }
          const { base64, mime } = await readFileAsBase64(file)
          setRefs(prev => [...prev, { base64, mime }])
          e.target.value = ''
        }} />
      </div>
      {/* Image References Modal */}
      {showRefsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowRefsModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl w-[420px] max-h-[80vh] flex flex-col z-10"
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
        </div>
      )}

      {/* Insert image from library modal */}
      {showInsertLibrary && (
        <ImageLibraryPicker onSelect={handleInsertLibrarySelect} onClose={() => setShowInsertLibrary(false)} />
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

function ChipRef({ mime, base64, onRemove, label }: { mime: string; base64: string; onRemove: () => void; label?: string }) {
  const [hover, setHover] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [curTime, setCurTime] = useState(0)
  const [dur, setDur] = useState(0)
  const displayLabel = label || (mime.startsWith('video/') ? 'Video' : mime.startsWith('audio/') ? 'Audio' : 'File')
  const src = `data:${mime};base64,${base64}`
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
