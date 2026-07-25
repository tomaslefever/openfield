import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Sparkles, Settings2, X, Wand2, ChevronDown, ChevronUp, Coins, Upload, Video, Plus, Music, AlertCircle, ArrowLeftRight } from 'lucide-react'
import { StreamDuration } from './StreamDuration'

export interface PromptComposerHandle {
  loadFromParams(params: {
    prompt?: string
    model?: string
    aspectRatio?: string
    resolution?: string
    imageBase64?: string
    imageMime?: string
    imageRefs?: { base64: string; mime: string }[]
  }): void
  addRefs(refs: { base64: string; mime: string }[]): void
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
    imageRefs?: { base64: string; mime: string }[]
    videoRefs?: { base64: string; mime: string }[]
    audioRefs?: { base64: string; mime: string }[]
    firstFrameBase64?: string
    lastFrameBase64?: string
    multiShots?: boolean
    multiPrompt?: { prompt: string; duration: number }[]
  }) => void
  mode?: 'image' | 'video'
  disabled?: boolean
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
]

const VIDEO_MODELS: ModelPricing[] = [
  { name: 'Kling 3.0', category: 'Kling', unit: 's', t2vId: 'kling-3.0/video', i2vId: 'kling-3.0/video',
    prices: [{ resolution: 'std', cost: 0.07 }, { resolution: 'std-audio', cost: 0.10 }, { resolution: 'pro', cost: 0.09 }, { resolution: 'pro-audio', cost: 0.135 }, { resolution: '4k', cost: 0.335 }],
    durationMax: 15, resolutions: ['std', 'pro', '4k'] },
  { name: 'Kling 2.5 Turbo', category: 'Kling', unit: 's', t2vId: 'kling/v25-turbo-text-to-video-pro', i2vId: 'kling/v25-turbo-image-to-video-pro',
    prices: [{ resolution: 's', cost: 0.05 }], durationMax: 10 },
  { name: 'Grok Imagine', category: 'Grok', unit: 's', t2vId: 'grok-imagine/text-to-video', i2vId: 'grok-imagine/image-to-video',
    prices: [{ resolution: 's', cost: 0.015 }], durationMax: 30 },
  { name: 'Seedance 2', category: 'ByteDance', unit: 's', t2vId: 'bytedance/seedance-2', i2vId: 'bytedance/seedance-2', fflfId: 'bytedance/seedance-2',
    prices: [{ resolution: '480p', cost: 0.095 }, { resolution: '720p', cost: 0.205 }, { resolution: '1080p', cost: 0.51 }, { resolution: '4k', cost: 1.04 }], durationMax: 15,
    durationOptions: ['4', '5', '6', '8', '10', '12', '15'], resolutions: ['480p', '720p', '1080p', '4k'], supportsVideoRef: true, supportsAudioRef: true },
  { name: 'Seedance 2 Fast', category: 'ByteDance', unit: 's', t2vId: 'bytedance/seedance-2-fast', i2vId: 'bytedance/seedance-2-fast', fflfId: 'bytedance/seedance-2-fast',
    prices: [{ resolution: '480p', cost: 0.0775 }, { resolution: '720p', cost: 0.165 }], durationMax: 15,
    durationOptions: ['4', '5', '6', '8', '10', '12', '15'], resolutions: ['480p', '720p'], supportsVideoRef: true, supportsAudioRef: true },
  { name: 'Wan 2.7', category: 'Wan', unit: 's', t2vId: 'wan-2-7-text-to-video', i2vId: 'wan-2-7-image-to-video',
    prices: [{ resolution: 's', cost: 0.04 }], durationMax: 10 },
  { name: 'Hailuo 2 Pro', category: 'Hailuo', unit: 's', t2vId: 'hailuo/02-text-to-video-pro',
    prices: [{ resolution: 's', cost: 0.06 }], durationMax: 10 },
  { name: 'Gemini Omni', category: 'Google', unit: 'video', t2vId: 'gemini-omni-video', i2vId: 'gemini-omni-video',
    prices: [{ resolution: '720p', cost: 0.30 }, { resolution: '1080p', cost: 0.50 }, { resolution: '4k', cost: 0.80 }],
    durationOptions: ['4', '6', '8', '10'], resolutions: ['720p', '1080p', '4k'] },
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

export const PromptComposer = forwardRef<PromptComposerHandle, PromptComposerProps>(function PromptComposer({ onGenerate, mode = 'image', disabled }, ref) {
  const [prompt, setPrompt] = useState('')
  const [modelName, setModelName] = useState(() => {
    const storageKey = `kie-model-${mode}`
    const def = mode === 'video' ? 'Kling 3.0' : 'GPT Image 2'
    try { return localStorage.getItem(storageKey) || def } catch { return def }
  })
  useEffect(() => {
    try { localStorage.setItem(`kie-model-${mode}`, modelName) } catch {}
  }, [modelName, mode])
  const [aspectRatio, setAspectRatio] = useState(mode === 'image' ? 'auto' : '16:9')
  const defaultModel = (mode === 'video' ? VIDEO_MODELS : IMAGE_MODELS).find(m => {
    const def = mode === 'video' ? 'Kling 3.0' : 'GPT Image 2'
    return m.name === def
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
  const [seedanceMode, setSeedanceMode] = useState<'fflf' | 'ref'>('ref')
  const [dragOver, setDragOver] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showModels, setShowModels] = useState(false)
  const [showRatios, setShowRatios] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [showRes, setShowRes] = useState(false)
  const [showCostInfo, setShowCostInfo] = useState(false)
  const [showRefPopover, setShowRefPopover] = useState(false)
  const [playingIndex, setPlayingIndex] = useState<number | null>(null)
  const [multiShots, setMultiShots] = useState(false)
  const [multiPrompt, setMultiPrompt] = useState<{ prompt: string; duration: number }[]>([])
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modelsRef = useRef<HTMLDivElement>(null)
  const ratiosRef = useRef<HTMLDivElement>(null)
  const resRef = useRef<HTMLDivElement>(null)
  const attachRef = useRef<HTMLDivElement>(null)
  const costRef = useRef<HTMLDivElement>(null)
  const refPopoverRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const playingMediaRef = useRef<HTMLMediaElement | null>(null)
  const mediaElements = useRef<Map<number, HTMLMediaElement>>(new Map())
  const dragCounterRef = useRef(0)
  const processDropRef = useRef<(file: File) => Promise<void>>(async () => {})

  const stopPlaying = () => {
    if (playingMediaRef.current) {
      playingMediaRef.current.pause()
      playingMediaRef.current = null
    }
    setPlayingIndex(null)
  }

  useEffect(() => {
    if (!showRefPopover) stopPlaying()
  }, [showRefPopover])

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
    if (refPopoverRef.current && !refPopoverRef.current.contains(e.target as Node)) setShowRefPopover(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault()
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
      dragCounterRef.current = 0
      setDragOver(false)
      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return
      for (let i = 0; i < files.length; i++) {
        await processDropRef.current(files[i])
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

  const models = mode === 'video' ? VIDEO_MODELS : IMAGE_MODELS
  const currentModel = models.find(m => m.name === modelName) || models[0]

  const hasImageRef = refs.some(r => r.mime.startsWith('image/'))

  function getActiveModelId(): string {
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

  const hasImageSupport = !!(currentModel.i2iId || currentModel.editId || currentModel.i2vId || currentModel.fflfId)
  const isKling = !!(currentModel.t2vId?.startsWith('kling') || currentModel.i2vId?.startsWith('kling'))
  const isSeedance = !!(currentModel.t2vId?.startsWith('bytedance/') || currentModel.i2vId?.startsWith('bytedance/'))
  const isFFLF = (!!(currentModel.fflfId) && seedanceMode === 'fflf') || isKling
  const isFFLFRef = useRef(isFFLF)
  isFFLFRef.current = isFFLF
  const isRefMode = !!(currentModel.fflfId) && seedanceMode === 'ref'
  const effectiveResolution = (soundEnabled && isKling && resolution !== '4k') ? resolution + '-audio' : resolution
  const { perUnitCredits, totalCredits, perUnitDollars, totalDollars } = calcCost(currentModel, effectiveResolution, duration, batchSize)

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
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url)
        resolve(video.duration)
      }
      video.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(0)
      }
      video.src = url
    })
  }

  const handleVideoRef = async (file: File) => {
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
    const { base64, mime } = await readFileAsBase64(file)
    if (file.type.startsWith('image/')) {
      if (isFFLF) {
        if (!firstFrameBase64) setFirstFrameBase64(base64)
        else if (!lastFrameBase64) setLastFrameBase64(base64)
      } else if (isRefMode || mode === 'image') {
        setRefs(prev => [...prev, { base64, mime }])
      } else if (hasImageSupport) {
        setImageBase64(base64); setImageMime(mime)
      } else {
        showError(`Cannot read "${file.name}" (this model does not support image input)`)
      }
    } else if (file.type.startsWith('video/') && currentModel.supportsVideoRef) {
      await handleVideoRef(file)
    } else if (file.type.startsWith('audio/') && currentModel.supportsAudioRef) {
      setRefs(prev => [...prev, { base64, mime }])
    } else {
      showError(`Cannot read "${file.name}" (this model does not support this file type)`)
    }
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>, slot: 'main' | 'first' | 'last') => {
    const file = e.target.files?.[0]
    if (!file) return
    const { base64, mime } = await readFileAsBase64(file)
    if (slot === 'main') { setRefs(prev => [...prev, { base64, mime }]) }
    else if (slot === 'first') setFirstFrameBase64(base64)
    else if (slot === 'last') setLastFrameBase64(base64)
    e.target.value = ''
  }

  const removeImage = (slot: 'main' | 'first' | 'last') => {
    if (slot === 'main') setImageBase64(null)
    else if (slot === 'first') setFirstFrameBase64(null)
    else setLastFrameBase64(null)
  }

  const handleMediaPlay = (el: HTMLMediaElement, index: number) => {
    if (playingMediaRef.current && playingMediaRef.current !== el) {
      playingMediaRef.current.pause()
    }
    if (el.paused) {
      el.play()
      playingMediaRef.current = el
      setPlayingIndex(index)
      el.onended = () => { playingMediaRef.current = null; setPlayingIndex(null) }
    } else {
      el.pause()
      playingMediaRef.current = null
      setPlayingIndex(null)
    }
  }

  const adjustTextarea = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  const hasMedia = !!(imageBase64 || firstFrameBase64 || lastFrameBase64 || refs.length > 0)

  useImperativeHandle(ref, () => ({
    loadFromParams(params) {
      if (params.prompt) {
        setPrompt(params.prompt)
        setTimeout(adjustTextarea, 0)
      }
      if (params.model) {
        const models = mode === 'video' ? VIDEO_MODELS : IMAGE_MODELS
        for (const m of models) {
          if (m.t2iId === params.model || m.i2iId === params.model || m.editId === params.model ||
              m.t2vId === params.model || m.i2vId === params.model || m.fflfId === params.model) {
            setModelName(m.name)
            break
          }
        }
      }
      if (params.aspectRatio) setAspectRatio(params.aspectRatio)
      if (params.resolution) setResolution(params.resolution)
      const newRefs: { base64: string; mime: string }[] = []
      if (params.imageBase64) {
        newRefs.push({ base64: params.imageBase64, mime: params.imageMime || 'image/png' })
      }
      if (params.imageRefs) {
        for (const ir of params.imageRefs) {
          newRefs.push({ base64: ir.base64, mime: ir.mime || 'image/png' })
        }
      }
      if (newRefs.length > 0) setRefs(newRefs)
    },
    addRefs(newRefs) {
      const imageRefs = newRefs.filter(r => r.mime.startsWith('image/'))
      const otherRefs = newRefs.filter(r => !r.mime.startsWith('image/'))
      if (isFFLFRef.current && imageRefs.length > 0) {
        let ffAssigned = false
        let lfAssigned = false
        const remaining: { base64: string; mime: string }[] = []
        for (const ref of imageRefs) {
          if (!ffAssigned) { setFirstFrameBase64(ref.base64); ffAssigned = true }
          else if (!lfAssigned) { setLastFrameBase64(ref.base64); lfAssigned = true }
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
    if (!prompt.trim() && !imageBase64 && !firstFrameBase64 && !lastFrameBase64 && refs.length === 0) return
    const activeId = getActiveModelId()
    const imageRefItems = refs.filter(r => r.mime.startsWith('image/'))
    const videoRefItems = refs.filter(r => r.mime.startsWith('video/'))
    const audioRefItems = refs.filter(r => r.mime.startsWith('audio/'))
    onGenerate({
      prompt: prompt.trim(),
      model: activeId,
      aspectRatio: aspectRatio,
      resolution: resolution,
      batchSize,
      duration: mode === 'video' ? duration : undefined,
      fps: mode === 'video' ? fps : undefined,
      sound: mode === 'video' ? soundEnabled || undefined : undefined,
      imageBase64: (imageRefItems.length > 0) ? imageRefItems[0].base64 : ((activeId !== currentModel.t2iId && activeId !== currentModel.t2vId) ? (imageBase64 || undefined) : undefined),
      imageMime: imageRefItems[0]?.mime || imageMime,
      imageRefs: imageRefItems.length > 1 ? imageRefItems : undefined,
      videoRefs: videoRefItems.length > 0 ? videoRefItems : undefined,
      audioRefs: audioRefItems.length > 0 ? audioRefItems : undefined,
      firstFrameBase64: isFFLF ? (firstFrameBase64 || undefined) : undefined,
      lastFrameBase64: isFFLF ? (lastFrameBase64 || undefined) : undefined,
      multiShots: multiShots || undefined,
      multiPrompt: multiShots && multiPrompt.length > 0 ? multiPrompt : undefined,
    })
    setPrompt('')
    setImageBase64(null)
    setRefs([])
    setFirstFrameBase64(null)
    setLastFrameBase64(null)
    setMultiShots(false)
    setMultiPrompt([])
    setSoundEnabled(false)
  }, [prompt, aspectRatio, resolution, batchSize, duration, fps, imageBase64, imageMime, refs, firstFrameBase64, lastFrameBase64, currentModel, onGenerate, mode, isFFLF, multiShots, multiPrompt, soundEnabled])

  return (
    <>
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-accent-500/10 border-2 border-dashed border-accent-500/60 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-accent-400">
            <Upload size={24} />
            <span className="text-xs font-medium">Drop image or video</span>
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
      <div className="sticky bottom-0 z-40 px-4 pb-4 pt-2 pointer-events-none">
        <div className="max-w-5xl mx-auto pointer-events-auto">
          <div
            ref={cardRef}
            className="relative bg-transparent border border-surface-700/60 rounded-2xl shadow-2xl shadow-black/40 transition-all duration-200"
          >
            {/* Image chips at top */}
            {hasMedia && !isFFLF && (
              <div className="flex gap-2 px-3 pt-2.5">
                {!currentModel.fflfId && (
                  <>
                    {refs.map((ref, i) => {
                      const imgIdx = refs.filter((r, j) => r.mime.startsWith('image/') && j <= i).length
                      const vidIdx = refs.filter((r, j) => r.mime.startsWith('video/') && j <= i).length
                      const audIdx = refs.filter((r, j) => r.mime.startsWith('audio/') && j <= i).length
                      const chipLabel = ref.mime.startsWith('image/') ? `Image ${imgIdx}` : ref.mime.startsWith('video/') ? `Video ${vidIdx}` : ref.mime.startsWith('audio/') ? `Audio ${audIdx}` : 'File'
                      return <ChipRef key={i} mime={ref.mime} base64={ref.base64} label={chipLabel} onRemove={() => setRefs(prev => prev.filter((_, j) => j !== i))} />
                    })}
                    {imageBase64 && refs.length === 0 && <ChipImage src={`data:image/png;base64,${imageBase64}`} label="Image 1" onRemove={() => removeImage('main')} />}
                  </>
                )}
              </div>
            )}

            {/* Main row */}
            <div className="flex items-end gap-2 p-2">
              {/* Dropzones next to textarea */}
              {(currentModel.fflfId || isKling) && (
                isFFLF ? (
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
                    {firstFrameBase64 && lastFrameBase64 && (
                      <button
                        onClick={(e) => {
                          e.preventDefault(); e.stopPropagation()
                          setFirstFrameBase64(lastFrameBase64)
                          setLastFrameBase64(firstFrameBase64)
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded-full bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors flex-shrink-0"
                        title="Swap FF/LF"
                      >
                        <ArrowLeftRight size={12} />
                      </button>
                    )}
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
                    <input id="file-last" type="file" accept="image/*" className="hidden" onChange={(e) => handleImageSelect(e, 'last')} />
                  </div>
                ) : (
                  <div className="relative flex-shrink-0" ref={refPopoverRef}>
                    {refs.length > 0 ? (
                      <div className="relative group">
                        <button onClick={(e) => {
                            e.preventDefault(); e.stopPropagation()
                            if (refs.length === 1) {
                              const mime = refs[0].mime
                              if (mime.startsWith('video/') || mime.startsWith('audio/')) {
                                const el = mediaElements.current.get(refs.length - 1)
                                if (el) handleMediaPlay(el, refs.length - 1)
                              }
                            } else {
                              setShowRefPopover(!showRefPopover)
                            }
                          }}
                          className="aspect-square h-[52px] border border-dashed border-surface-700 hover:border-accent-500/50 rounded-lg overflow-hidden relative">
                          <RefThumb mime={refs[refs.length - 1].mime} base64={refs[refs.length - 1].base64} isPlaying={playingIndex === refs.length - 1} onPlay={(el) => handleMediaPlay(el, refs.length - 1)} index={refs.length - 1} onRegister={(i, el) => { if (el) mediaElements.current.set(i, el); else mediaElements.current.delete(i) }} />
                          {refs.length > 1 && (
                            <span className="absolute top-0.5 right-0.5 bg-accent-600 text-white text-[9px] font-medium rounded-full w-4 h-4 flex items-center justify-center">
                              {refs.length}
                            </span>
                          )}
                        </button>
                        {refs.length === 1 && (
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRefs([]); stopPlaying() }}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-surface-950 border border-surface-700 rounded-full flex items-center justify-center text-surface-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <X size={10} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <label htmlFor="file-all" className="aspect-square h-[52px] border border-dashed border-surface-700 hover:border-accent-500/50 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors flex-shrink-0">
                        <Upload size={12} className="text-surface-500" />
                      </label>
                    )}
                    {showRefPopover && refs.length > 0 && (
                      <div className="absolute bottom-full left-0 mb-2 bg-surface-800 border border-surface-700 rounded-xl p-2 shadow-xl z-50">
                        <div className="flex items-center gap-2">
                          {refs.map((ref, i) => (
                            <div key={i} className="relative group flex-shrink-0">
                              <div className="w-14 h-14 rounded-lg border border-surface-700 overflow-hidden">
                                <RefThumb mime={ref.mime} base64={ref.base64} isPlaying={playingIndex === i} onPlay={(el) => handleMediaPlay(el, i)} index={i} onRegister={(idx, el) => { if (el) mediaElements.current.set(idx, el); else mediaElements.current.delete(idx) }} />
                              </div>
                              <button onClick={() => setRefs(prev => prev.filter((_, j) => j !== i))}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-surface-950 border border-surface-700 rounded-full flex items-center justify-center text-surface-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                          <label htmlFor="file-all" className="w-14 h-14 border border-dashed border-surface-700 hover:border-accent-500/50 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors flex-shrink-0 gap-0.5">
                            <Plus size={12} className="text-surface-500" />
                            <span className="text-[8px] text-surface-500">Add</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}

              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => { setPrompt(e.target.value); adjustTextarea() }}
                  placeholder={mode === 'image' ? 'Describe what you want to generate...' : 'Describe the video you want to create...'}
                  className="w-full bg-transparent text-sm text-surface-100 placeholder-surface-500 resize-none outline-none px-3 py-2.5 min-h-[42px] max-h-[120px] leading-relaxed"
                  rows={1}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate() } }}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text')
                    try {
                      const parsed = JSON.parse(text.trim())
                      if (typeof parsed === 'object' && parsed !== null && (parsed.prompt || parsed.model)) {
                        e.preventDefault()
                        if (parsed.prompt) setPrompt(parsed.prompt)
                        if (parsed.aspect_ratio) setAspectRatio(parsed.aspect_ratio)
                        if (parsed.resolution) setResolution(parsed.resolution)
                        if (parsed.model) {
                          const match = (mode === 'video' ? VIDEO_MODELS : IMAGE_MODELS).find(m =>
                            m.t2iId === parsed.model || m.i2iId === parsed.model || m.editId === parsed.model ||
                            m.t2vId === parsed.model || m.i2vId === parsed.model || m.fflfId === parsed.model
                          )
                          if (match) setModelName(match.name)
                        }
                        adjustTextarea()
                      }
                    } catch {}
                  }}
                />
                {prompt && (
                  <button onClick={() => setPrompt('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors">
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button onClick={handleGenerate} disabled={disabled || (multiShots ? !multiPrompt.some(s => s.prompt.trim()) || multiPrompt.reduce((a, x) => a + x.duration, 0) > 15 : (isFFLF ? !prompt.trim() && !firstFrameBase64 : !prompt.trim() && !imageBase64 && !firstFrameBase64 && refs.length === 0))}
                  className="flex items-center gap-1.5 px-4 h-[42px] bg-accent-600 hover:bg-accent-500 disabled:bg-accent-600/50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all active:scale-[0.97]">
                  <Sparkles size={16} />
                  <span>{totalCredits}</span>
                </button>
              </div>
            </div>

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
            <div className="flex items-center gap-1.5 px-3 pb-2.5">
              {/* Model */}
              <div className="relative" ref={modelsRef}>
                <button onClick={() => setShowModels(!showModels)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-surface-800/80 hover:bg-surface-700/80 rounded-lg text-[11px] font-medium text-surface-300 transition-colors">
                  <Wand2 size={11} /> {currentModel.name} <ChevronDown size={11} />
                </button>
                {showModels && (
                  <div className="absolute bottom-full left-0 mb-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[220px] shadow-xl max-h-[280px] overflow-y-auto z-50">
                    {models.map((m) => (
                      <button key={m.name}
                        onClick={() => { setModelName(m.name); setShowModels(false); if (m.prices[0]) setResolution(m.prices[0].resolution) }}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${modelName === m.name ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/50'}`}>
                        <div><span>{m.name}</span><span className="text-[10px] text-surface-600 ml-2">{m.category}</span></div>
                        <span className="text-amber-400/80 text-[10px]">{Math.round(m.prices[0]?.cost * 200)} cr</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Toggles: FF, Multi-shot, Sound */}
              {currentModel.fflfId && (
                <button onClick={() => {
                    if (isFFLF) { setSeedanceMode('ref'); setFirstFrameBase64(null); setLastFrameBase64(null) }
                    else { setSeedanceMode('fflf'); setRefs([]) }
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${isFFLF ? 'bg-accent-600 text-white' : 'bg-surface-800/80 text-surface-500 hover:text-surface-300'}`}>
                  FF
                </button>
              )}
              {isKling && (
                <button onClick={() => { setMultiShots(!multiShots); if (!multiShots && multiPrompt.length === 0) setMultiPrompt([{ prompt: '', duration: 5 }]) }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${multiShots ? 'bg-accent-600 text-white' : 'bg-surface-800/80 text-surface-500 hover:text-surface-300'}`}>
                  Multi-shot
                </button>
              )}
              {(isKling || isSeedance) && mode === 'video' && (
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
                        {['auto', '1:1', '16:9', '9:16', '4:3', '3:2', '2:1', '21:9'].map((r) => (
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

              {mode === 'video' && (
                <>
                  <StreamDuration
                    value={duration}
                    options={currentModel.durationOptions}
                    min={4}
                    max={currentModel.durationMax || 15}
                    onChange={setDuration}
                  />
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
                  {(currentModel.t2vId?.startsWith('gemini-omni') || currentModel.t2vId?.startsWith('bytedance/')) && (
                    <div className="relative" ref={ratiosRef}>
                      <button onClick={() => setShowRatios(!showRatios)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-surface-800/80 hover:bg-surface-700/80 rounded-lg text-[11px] font-medium text-surface-300 transition-colors">
                        {aspectRatio} <ChevronDown size={11} />
                      </button>
                      {showRatios && (
                        <div className="absolute bottom-full left-0 mb-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[100px] shadow-xl z-50">
                          {(currentModel.t2vId?.startsWith('bytedance/') ? ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', 'adaptive'] : ['16:9', '9:16']).map((r) => (
                            <button key={r} onClick={() => { setAspectRatio(r); setShowRatios(false) }}
                              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${aspectRatio === r ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/50'}`}>{r}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {!(currentModel.t2vId?.startsWith('gemini-omni') || currentModel.t2vId?.startsWith('bytedance/') || isKling) && (
                    <div className="flex items-center gap-1">
                      <select value={fps} onChange={(e) => setFps(Number(e.target.value))}
                        className="bg-surface-800/80 border border-surface-700 rounded-lg px-1.5 py-1 text-[11px] text-surface-300 outline-none">
                        <option value={24}>24</option><option value={30}>30</option><option value={60}>60</option>
                      </select>
                    </div>
                  )}
                </>
              )}

              <div className="flex-1" />
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
          for (let i = 0; i < files.length; i++) {
            const file = files[i]
            const { base64, mime } = await readFileAsBase64(file)
            if (mime.startsWith('audio/') && !currentModel.supportsAudioRef) { showError(`Cannot read "${file.name}" (this model does not support audio input)`); continue }
            if (mime.startsWith('video/') && !currentModel.supportsVideoRef) { showError(`Cannot read "${file.name}" (this model does not support video input)`); continue }
            if (mime.startsWith('image/') && mode !== 'image' && !hasImageSupport) { showError(`Cannot read "${file.name}" (this model does not support image input)`); continue }
            if (mime.startsWith('image/') && isFFLF) {
              if (!firstFrameBase64) setFirstFrameBase64(base64)
              else if (!lastFrameBase64) setLastFrameBase64(base64)
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
          const { base64, mime } = await readFileAsBase64(file)
          setRefs(prev => [...prev, { base64, mime }])
          e.target.value = ''
        }} />
      </div>  
    </>
  )
})

function RefThumb({ mime, base64, isPlaying, onPlay, index, onRegister }: {
  mime: string; base64: string
  isPlaying?: boolean
  onPlay?: (el: HTMLMediaElement) => void
  index?: number
  onRegister?: (index: number, el: HTMLMediaElement | null) => void
}) {
  const mediaRef = useRef<HTMLMediaElement>(null)
  const isMedia = mime.startsWith('video/') || mime.startsWith('audio/')

  useEffect(() => {
    if (index !== undefined && onRegister && isMedia) {
      onRegister(index, mediaRef.current)
      return () => onRegister(index, null)
    }
  }, [index, onRegister, isMedia])

  if (mime.startsWith('image/')) {
    return <img src={`data:${mime};base64,${base64}`} className="w-full h-full object-cover" alt="" />
  }
  if (isMedia) {
    const Tag = mime.startsWith('video/') ? 'video' : 'audio'
    return (
      <div className="w-full h-full relative group bg-surface-800">
        {(Tag as any) === 'video' ? (
          <video ref={mediaRef as any} src={`data:${mime};base64,${base64}`} className="w-full h-full object-cover" preload="metadata" muted playsInline />
        ) : (
          <>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Music size={16} className="text-surface-500" />
            </div>
            <audio ref={mediaRef as any} src={`data:${mime};base64,${base64}`} preload="metadata" />
          </>
        )}
        {onPlay && (
          <button
            onClick={(e) => { e.stopPropagation(); if (mediaRef.current) onPlay(mediaRef.current) }}
            className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
            {isPlaying ? (
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21" /></svg>
              </div>
            )}
          </button>
        )}
    </div>
  )
  }
  return <div className="w-full h-full bg-surface-800" />
}

function ChipRef({ mime, base64, onRemove, label }: { mime: string; base64: string; onRemove: () => void; label?: string }) {
  const [hover, setHover] = useState(false)
  const displayLabel = label || (mime.startsWith('video/') ? 'Video' : mime.startsWith('audio/') ? 'Audio' : 'File')
  const src = `data:${mime};base64,${base64}`
  return (
    <span className="relative flex-shrink-0" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span className="inline-flex items-center gap-1.5 bg-surface-800/80 border border-surface-700 rounded-full pr-1 p-0.5 text-[11px] text-surface-300">
        {mime.startsWith('image/') ? (
          <img src={src} className="size-5 rounded-full object-cover" alt="" />
        ) : mime.startsWith('video/') ? (
          <span className="size-8 rounded-full bg-surface-700 flex items-center justify-center flex-shrink-0">
            <Video size={12} className="text-surface-400" />
          </span>
        ) : (
          <span className="size-8 rounded-full bg-surface-700 flex items-center justify-center flex-shrink-0">
            <Music size={12} className="text-surface-400" />
          </span>
        )}
        <span>{displayLabel}</span>
        <button onClick={onRemove} className="text-surface-500 hover:text-red-400 cursor-pointer flex-shrink-0 ml-0.5">
          <X size={14} />
        </button>
      </span>
      {hover && mime.startsWith('image/') && (
        <span className="absolute left-0 bottom-full mb-2 z-50 bg-surface-800 border border-surface-700 rounded-lg p-1.5 shadow-xl">
          <img src={src} className="max-w-[300px] max-h-[400px] object-contain rounded" alt="" />
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
      <span className="inline-flex items-center gap-1.5 bg-surface-800/80 border border-surface-700 rounded-full pl-1 pr-2 h-10 text-[11px] text-surface-300">
        <img src={src} className="size-8 rounded-full object-cover" alt="" />
        <span>{label}</span>
        <button onClick={onRemove} className="text-surface-500 hover:text-red-400 cursor-pointer flex-shrink-0 ml-0.5">
          <X size={14} />
        </button>
      </span>
      {hover && (
        <span className="absolute left-0 bottom-full mb-2 z-50 bg-surface-800 border border-surface-700 rounded-lg p-1.5 shadow-xl">
          <img src={src} className="max-w-[300px] max-h-[400px] object-contain rounded" alt="" />
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
