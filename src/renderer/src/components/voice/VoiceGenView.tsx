import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  Mic, Play, Pause, Loader, X,
  Download, AlertCircle, Check, Sparkles, Cpu, Cloud,
  Gauge, History, PanelRightClose, PanelRightOpen,
  ChevronDown, RefreshCw, Search, Star, Settings, RotateCcw,
  Upload, Library, AudioLines, Trash2,
} from 'lucide-react'
import { RecorderModal } from './RecorderModal'
import { AudioLibraryPicker } from './AudioLibraryPicker'
import { AudioTrimEditor } from './AudioTrimEditor'
import { decodeBase64Audio, sliceAudioBuffer, audioBufferToBase64, formatTime } from '../../lib/wav'
import { srcUrl } from '../../services/file-url'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// Languages supported by the ElevenLabs multilingual models (ISO 639-1 codes,
// per the API's verified_languages.language / voice_verification.language schema)
const VOICE_LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'it', name: 'Italian' },
  { code: 'hi', name: 'Hindi' },
  { code: 'pl', name: 'Polish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ko', name: 'Korean' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ro', name: 'Romanian' },
  { code: 'sv', name: 'Swedish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'id', name: 'Indonesian' },
  { code: 'tr', name: 'Turkish' },
  { code: 'el', name: 'Greek' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'he', name: 'Hebrew' },
  { code: 'no', name: 'Norwegian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'hr', name: 'Croatian' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'ms', name: 'Malay' },
  { code: 'sk', name: 'Slovak' },
]

const VOICE_ACCENTS_BY_LANG: Record<string, string[]> = {
  en: ['American', 'British', 'Australian', 'Canadian', 'Indian', 'Irish', 'Scottish', 'Nigerian', 'South African', 'Singaporean', 'New Zealand', 'Filipino', 'Welsh', 'London', 'Cockney', 'New York', 'Texan', 'Southern American', 'Bostonian', 'Jamaican', 'Kenyan', 'Ghanaian', 'Zimbabwean'],
  es: ['Spanish', 'Mexican', 'Colombian', 'Argentinian', 'Chilean', 'Peruvian', 'Venezuelan', 'Latin American'],
  fr: ['French', 'Canadian French', 'Belgian', 'Swiss'],
  pt: ['Portuguese', 'Brazilian'],
  de: ['German', 'Austrian', 'Swiss'],
  it: ['Italian'],
  nl: ['Dutch', 'Belgian'],
  ru: ['Russian'],
  ja: ['Japanese'],
  ko: ['Korean'],
  zh: ['Chinese', 'Mandarin', 'Cantonese'],
  ar: ['Arabic', 'Egyptian', 'Levantine'],
  tr: ['Turkish'],
  pl: ['Polish'],
  sv: ['Swedish'],
  uk: ['Ukrainian'],
  vi: ['Vietnamese'],
  hi: ['Hindi'],
}

const VOICE_GENDERS = ['male', 'female', 'neutral']

const ELEVENLABS_MODELS = [
  { value: 'eleven_v3', label: 'V3 (flagship)' },
  { value: 'eleven_v3_flash', label: 'V3 Flash (fastest)' },
  { value: 'eleven_multilingual_v3', label: 'Multilingual v3' },
  { value: 'eleven_multilingual_v3_flash', label: 'Multilingual v3 Flash' },
  { value: 'eleven_multilingual_v2', label: 'Multilingual v2' },
  { value: 'eleven_turbo_v2_5', label: 'Turbo v2.5' },
  { value: 'eleven_flash_v2_5', label: 'Flash v2.5' },
  { value: 'eleven_turbo_v2', label: 'Turbo v2' },
  { value: 'eleven_flash_v2', label: 'Flash v2' },
  { value: 'eleven_monolingual_v1', label: 'Monolingual v1 (English)' },
  { value: 'eleven_multilingual_v1', label: 'Multilingual v1' },
]

const ANY = '__any__'

function SearchableSelect({ value, onChange, options, placeholder, disabled }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = options.find(o => o.value === value)
  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()) || o.value.toLowerCase().includes(query.toLowerCase()))
    : options

  const handleOpenChange = (o: boolean) => {
    setOpen(o)
    if (!o) setQuery('')
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          title={selected?.label || placeholder}
          className={`flex items-center justify-between gap-1 h-6 rounded-md px-1.5 text-[10px] w-full transition-colors border ${
            open ? 'border-accent-500/40 text-surface-300' : 'border-surface-700 text-surface-300'
          } bg-surface-800 disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <span className="truncate text-surface-300">{selected?.label || placeholder}</span>
          <ChevronDown size={10} className="opacity-50 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={4} className="p-0 w-56 bg-surface-900 border-surface-700 text-surface-200" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-center gap-1.5 border-b border-surface-800 px-2">
          <Search size={11} className="text-surface-500 flex-shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="h-7 bg-transparent text-xs text-surface-200 outline-none placeholder:text-surface-600 w-full"
          />
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          <button
            onClick={() => { onChange(''); handleOpenChange(false) }}
            className={`w-full text-left px-2 py-1 text-[11px] rounded flex items-center justify-between ${!value ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:bg-surface-800'}`}
          >
            <span>Any</span>
            {!value && <Check size={11} className="flex-shrink-0" />}
          </button>
          {filtered.length === 0 ? (
            <p className="px-2 py-2 text-[10px] text-surface-500">No options</p>
          ) : filtered.map((o) => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); handleOpenChange(false) }}
              className={`w-full text-left px-2 py-1 text-[11px] rounded flex items-center justify-between ${o.value === value ? 'text-accent-400 bg-accent-500/10' : 'text-surface-300 hover:bg-surface-800'}`}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check size={11} className="flex-shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface VoiceEntry {
  id: string
  label: string
  detail?: string
  downloaded?: boolean
}

interface Engine {
  id: string
  name: string
  local: boolean
  provider: string
  keyName?: string
  voiceList?: VoiceEntry[]
  installFn?: () => Promise<void>
  checkInstalled?: () => Promise<boolean>
}

interface VoiceGenViewProps {
  onGenerate: (params: any) => void
  voiceAssets: any[]
  isGenerating: boolean
  statusMessage: string
  statusPct: number
  errorMessage: string
  onClearError: () => void
}

function WaveformBars({ playing }: { playing: boolean }) {
  const bars = [3, 5, 4, 7, 5, 8, 4, 6]
  return (
    <div className="flex items-end gap-[2px] h-5">
      {bars.map((h, i) => (
        <span
          key={i}
          className={`w-[2px] rounded-full transition-all duration-300 ${playing ? 'bg-accent-400' : 'bg-surface-600'}`}
          style={{ height: `${Math.max(h * 2, 4)}px` }}
        />
      ))}
    </div>
  )
}

function SliderSetting({ label, value, onChange, min, max, step, fmt }: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  fmt?: (v: number) => string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-surface-400">{label}</span>
        <span className="text-[11px] text-surface-500 font-mono">{fmt ? fmt(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-surface-700 rounded-full appearance-none cursor-pointer accent-accent-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-500"
      />
    </div>
  )
}

export function VoiceGenView({ onGenerate, voiceAssets, isGenerating, statusMessage, statusPct, errorMessage, onClearError }: VoiceGenViewProps) {
  const [selectedEngine, setSelectedEngine] = useState('elevenlabs')
  const [selectedVoice, setSelectedVoice] = useState('')
  const [speed, setSpeed] = useState(1.0)
  const [ttsModel, setTtsModel] = useState('eleven_multilingual_v3')
  const [stability, setStability] = useState(0.5)
  const [similarityBoost, setSimilarityBoost] = useState(0.75)
  const [style, setStyle] = useState(0)
  const [useSpeakerBoost, setUseSpeakerBoost] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [historyOpen, setHistoryOpen] = useState(true)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [engineOpen, setEngineOpen] = useState(false)
  const engineRef = useRef<HTMLDivElement>(null)
  const [piperInstalled, setPiperInstalled] = useState(false)
  const [kokoroInstalled, setKokoroInstalled] = useState(false)
  const [piperVoices, setPiperVoices] = useState<any[]>([])
  const [kokoroVoices, setKokoroVoices] = useState<any[]>([])
  const [elevenlabsVoices, setElevenLabsVoices] = useState<any[]>([])
  const [elevenlabsModels, setElevenLabsModels] = useState<{ id: string; name: string }[]>([])
  const [elevenlabsConfigured, setElevenLabsConfigured] = useState(false)
  const [elevenlabsLoading, setElevenLabsLoading] = useState(false)
  const [elevenlabsHasMore, setElevenLabsHasMore] = useState(false)
  const [elevenlabsNextToken, setElevenLabsNextToken] = useState<string | undefined>(undefined)
  const [loadingMore, setLoadingMore] = useState(false)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const voicesScrollRef = useRef<HTMLDivElement>(null)
  const [installing, setInstalling] = useState(false)
  const [loadingVoices, setLoadingVoices] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [activatedKeys, setActivatedKeys] = useState<Record<string, boolean>>({})
  const voiceRetryRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [audioVersion, setAudioVersion] = useState(0)
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [voiceSearch, setVoiceSearch] = useState('')
  const [voiceLang, setVoiceLang] = useState('')
  const [voiceAccent, setVoiceAccent] = useState('')
  const [voiceGender, setVoiceGender] = useState('')
  const [genMode, setGenMode] = useState<'tts' | 'vc'>('tts')
  const [vcAudio, setVcAudio] = useState<{ base64: string; mime: string; fileName: string; duration?: number } | null>(null)
  const [vcBuffer, setVcBuffer] = useState<AudioBuffer | null>(null)
  const [vcDecoding, setVcDecoding] = useState(false)
  const [vcTrim, setVcTrim] = useState<{ start: number; end: number } | null>(null)
  const [showAudioPicker, setShowAudioPicker] = useState(false)
  const [showRecorder, setShowRecorder] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const vcAudioRef = useRef<HTMLAudioElement | null>(null)
  const [vcPlaying, setVcPlaying] = useState(false)
  const uploadAudioRef = useRef<HTMLInputElement>(null)

  // Decode the selected audio for the trim editor (waveform + start/end markers)
  useEffect(() => {
    if (!vcAudio) {
      setVcBuffer(null)
      setVcTrim(null)
      return
    }
    let cancelled = false
    setVcDecoding(true)
    decodeBase64Audio(vcAudio.base64)
      .then((buf) => {
        if (cancelled) return
        setVcBuffer(buf)
        setVcTrim({ start: 0, end: buf.duration })
      })
      .catch(() => { if (!cancelled) setVcBuffer(null) })
      .finally(() => { if (!cancelled) setVcDecoding(false) })
    return () => { cancelled = true }
  }, [vcAudio])

  const vcAudioUrl = useMemo(() => {
    if (!vcAudio) return null
    const binary = atob(vcAudio.base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return URL.createObjectURL(new Blob([bytes], { type: vcAudio.mime }))
  }, [vcAudio])

  const toggleVcPlay = () => {
    const el = vcAudioRef.current
    if (!el) return
    if (vcPlaying) {
      el.pause()
      setVcPlaying(false)
      return
    }
    el.play().then(() => setVcPlaying(true)).catch(() => {})
  }

  // Load engine status on mount
  useEffect(() => {
    const api = (window as any).electronAPI
    api?.local?.piperIsInstalled?.().then(setPiperInstalled).catch(() => {})
    api?.local?.kokoroIsInstalled?.().then(setKokoroInstalled).catch(() => {})
    api?.settings?.getAll?.().then((settings: any) => {
      const keys: Record<string, boolean> = {}
      if (settings?.openfieldApiKey) keys.openfieldApiKey = true
      if (settings?.elevenlabsApiKey) keys.elevenlabsApiKey = true
      if (settings?.enableLocalModels === true || settings?.enableLocalModels === 'true') keys.enableLocalModels = true
      setActivatedKeys(keys)
    }).catch(() => {})
    try {
      const raw = localStorage.getItem('openfield-elevenlabs-favorites')
      setFavorites(new Set(raw ? JSON.parse(raw) : []))
    } catch {}
  }, [])

  const loadElevenLabsPage = useCallback(async (token?: string) => {
    const api = (window as any).electronAPI
    setLoadingMore(true)
    setVoiceError('')
    try {
      const page = await api?.elevenlabs?.voices?.(token ? { nextPageToken: token, pageSize: 50 } : { pageSize: 50 })
      setElevenLabsVoices(prev => {
        const seen = new Set(prev.map((v: any) => v.id))
        return [...prev, ...(page?.voices || []).filter((v: any) => !seen.has(v.id))]
      })
      setElevenLabsNextToken(page?.nextPageToken)
      setElevenLabsHasMore(!!page?.hasMore)
      setElevenLabsConfigured(true)
    } catch (err: any) {
      setVoiceError(err?.message?.includes('Unauthorized') || err?.message?.includes('not configured')
        ? 'ElevenLabs no configurado. Agregá tu API key en Settings → Providers.'
        : err?.message || 'No se pudieron cargar las voces de ElevenLabs.')
      setElevenLabsConfigured(false)
    } finally {
      setLoadingMore(false)
    }
  }, [])

  const toggleVoiceFavorite = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      try { localStorage.setItem('openfield-elevenlabs-favorites', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  const handleVoicesScroll = () => {
    const el = voicesScrollRef.current
    if (!el || !elevenlabsHasMore || loadingMore || elevenlabsLoading) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      loadElevenLabsPage(elevenlabsNextToken)
    }
  }

  // Load voices when local engine selected
  useEffect(() => {
    const api = (window as any).electronAPI
    if (selectedEngine === 'piper' && piperInstalled) {
      api?.local?.piperGetVoices?.().then(async (voices: any[]) => {
        const enriched = await Promise.all(voices.map(async (v: any) => ({
          ...v,
          downloaded: await api?.local?.piperIsVoiceDownloaded?.(v.id).catch(() => false)
        })))
        setPiperVoices(enriched)
      }).catch(() => setPiperVoices([]))
    }
    if (selectedEngine === 'kokoro' && kokoroInstalled) {
      let cancelled = false
      let attempts = 0
      const maxAttempts = 10

      const tryLoad = async () => {
        if (cancelled) return
        setLoadingVoices(true)
        setVoiceError('')
        try {
          const voices = await api?.local?.kokoroGetVoices?.()
          if (!cancelled) {
            setKokoroVoices(voices || [])
            setLoadingVoices(false)
          }
        } catch (err: any) {
          if (cancelled) return
          attempts++
          if (attempts < maxAttempts) {
            setVoiceError(`Conectando con el servidor (intento ${attempts}/${maxAttempts})...`)
            setTimeout(tryLoad, 3000)
          } else {
            setVoiceError('No se pudo conectar con el servidor local. Revisá los logs.')
            setLoadingVoices(false)
          }
        }
      }
      tryLoad()
      return () => { cancelled = true }
    }
    if (selectedEngine === 'elevenlabs') {
      let cancelled = false
      setElevenLabsVoices([])
      setElevenLabsNextToken(undefined)
      setElevenLabsHasMore(false)
      setElevenLabsLoading(true)
      setVoiceError('')
      api?.elevenlabs?.models?.().then((models: { id: string; name: string }[]) => {
        if (cancelled) return
        setElevenLabsModels(models || [])
        setTtsModel(prev => {
          const list = models || []
          if (list.some((m) => m.id === prev)) return prev
          return list.find((m) => m.id === 'eleven_multilingual_v3')?.id || list.find((m) => m.id.includes('v3'))?.id || list[0]?.id || 'eleven_multilingual_v3'
        })
      }).catch(() => {})
      loadElevenLabsPage().finally(() => { if (!cancelled) setElevenLabsLoading(false) })
      return () => { cancelled = true }
    }
  }, [selectedEngine, piperInstalled, kokoroInstalled])

  // Reset voice selection when engine changes
  useEffect(() => {
    setSelectedVoice('')
    setVoiceSearch('')
    setVoiceLang('')
    setVoiceAccent('')
    setVoiceGender('')
    setVcAudio(null)
    previewAudioRef.current?.pause()
    setPreviewingId(null)
    if (selectedEngine === 'elevenlabs') setSpeed(s => Math.max(0.7, Math.min(1.2, s)))
  }, [selectedEngine])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (engineRef.current && !engineRef.current.contains(e.target as Node)) {
        setEngineOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleInstall = async (engine: string) => {
    const api = (window as any).electronAPI
    setInstalling(true)
    try {
      if (engine === 'piper') {
        await api?.local?.piperInstall?.()
        setPiperInstalled(true)
      } else if (engine === 'kokoro') {
        await api?.local?.kokoroInstall?.()
        setKokoroInstalled(true)
      }
    } catch (e) { console.error('Install failed:', e) }
    setInstalling(false)
  }

  const handleDownloadVoice = async (voiceId: string) => {
    const api = (window as any).electronAPI
    await api?.local?.piperDownloadVoice?.(voiceId)
    const downloaded = await api?.local?.piperIsVoiceDownloaded?.(voiceId).catch(() => false)
    setPiperVoices(prev => prev.map(v => v.id === voiceId ? { ...v, downloaded } : v))
  }

  const readAudioFile = (file: File) => {
    setVoiceError('')
    if (!file.type.startsWith('audio/')) {
      setVoiceError('Solo se aceptan archivos de audio (wav, mp3, ogg, m4a...)')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setVoiceError('El audio supera el límite de 25MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setVcAudio({ base64, mime: file.type, fileName: file.name })
    }
    reader.onerror = () => setVoiceError('No se pudo leer el archivo de audio')
    reader.readAsDataURL(file)
  }

  const handleGenerate = () => {
    if (genMode === 'vc') {
      if (!vcAudio || !selectedVoice) return
      let audio = vcAudio
      if (vcBuffer && vcTrim && (vcTrim.start > 0 || vcTrim.end < vcBuffer.duration)) {
        const trimmed = sliceAudioBuffer(vcBuffer, vcTrim.start, vcTrim.end)
        const { base64, mime } = audioBufferToBase64(trimmed)
        audio = { ...vcAudio, base64, mime, fileName: vcAudio.fileName.replace(/\.[^.]+$/, '.wav') }
      }
      onGenerate({
        engine: 'elevenlabs',
        mode: 'voicechanger',
        voiceId: selectedVoice,
        audioBase64: audio.base64,
        audioMime: audio.mime,
        fileName: audio.fileName,
      })
      return
    }
    if (!text.trim()) return
    const params: any = { prompt: text.trim() }

    if (selectedEngine === 'piper' && selectedVoice) {
      params.local = true
      params.voiceId = selectedVoice
      params.engine = 'piper'
      params.model = selectedVoice
      if (speed !== 1.0) params.speed = speed
    } else if (selectedEngine === 'kokoro' && selectedVoice) {
      params.local = true
      params.voiceId = selectedVoice
      params.engine = 'kokoro'
      params.model = selectedVoice
      if (speed !== 1.0) params.speed = speed
    } else if (selectedEngine === 'elevenlabs' && selectedVoice) {
      params.engine = 'elevenlabs'
      params.voiceId = selectedVoice
      params.model = ttsModel
      params.speed = speed
      params.stability = stability
      params.similarityBoost = similarityBoost
      params.style = style
      params.useSpeakerBoost = useSpeakerBoost
    }

    onGenerate(params)
  }

  const togglePlay = (asset: any) => {
    const el = audioRef.current
    if (!el) return
    const src = srcUrl(asset.localPath || asset.filePath)
    if (!src) return
    if (playingId === asset.id) {
      el.pause()
      setPlayingId(null)
      return
    }
    if (el.getAttribute('data-src') !== src) {
      el.src = src
      el.setAttribute('data-src', src)
      setAudioVersion(v => v + 1)
    }
    el.play().then(() => setPlayingId(asset.id)).catch(() => {})
  }

  const togglePreview = (voice: any) => {
    const el = previewAudioRef.current
    if (!el || !voice.previewUrl) return
    if (previewingId === voice.id) {
      el.pause()
      setPreviewingId(null)
      return
    }
    el.src = voice.previewUrl
    el.play().then(() => setPreviewingId(voice.id)).catch(() => setPreviewingId(null))
  }

  const handleRecreate = (asset: any) => {
    let p: any = {}
    try { p = JSON.parse(asset.parameters || '{}') } catch {}
    const modelUsed = asset.modelUsed || ''
    let engine = p.engine
    let voiceId = p.voiceId || ''
    if (!engine) {
      if (modelUsed.startsWith('elevenlabs:')) { engine = 'elevenlabs'; voiceId = modelUsed.slice(11) }
      else if (modelUsed.startsWith('piper:')) { engine = 'piper'; voiceId = modelUsed.slice(6) }
      else if (modelUsed.startsWith('kokoro:')) { engine = 'kokoro'; voiceId = modelUsed.slice(7) }
    }
    setText(asset.prompt || '')
    if (engine) {
      setSelectedEngine(engine)
      if (voiceId) setSelectedVoice(voiceId)
    }
    if (p.speed != null) setSpeed(p.speed)
    if (p.model) setTtsModel(p.model)
    if (p.stability != null) setStability(p.stability)
    if (p.similarityBoost != null) setSimilarityBoost(p.similarityBoost)
    if (p.style != null) setStyle(p.style)
    if (p.useSpeakerBoost != null) setUseSpeakerBoost(p.useSpeakerBoost)
  }

  const handleSaveAs = async (asset: any) => {
    if (!asset?.id || savingId) return
    setSavingId(asset.id)
    try {
      await (window as any).electronAPI?.assets.saveAs(asset.id)
    } catch (err) {
      console.error('Save as failed:', err)
    } finally {
      setSavingId(null)
    }
  }

  const handleToggleFavoriteAsset = async (asset: any) => {
    try {
      await (window as any).electronAPI?.assets.toggleFavorite(asset.id)
    } catch (err) {
      console.error('Toggle favorite failed:', err)
    }
  }

  const handleDeleteAsset = async (asset: any) => {
    setConfirmDeleteId(null)
    try {
      await (window as any).electronAPI?.assets.delete(asset.id)
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const ALL_ENGINES: Engine[] = [
    { id: 'elevenlabs', name: 'ElevenLabs', provider: 'ElevenLabs', local: false, keyName: 'elevenlabsApiKey' },
    { id: 'piper', name: 'Piper', provider: 'Local', local: true, keyName: 'enableLocalModels' },
    { id: 'kokoro', name: 'Kokoro', provider: 'Local', local: true, keyName: 'enableLocalModels' },
  ]

  const engines = ALL_ENGINES.filter(e => activatedKeys[e.keyName || '__never__'])

  useEffect(() => {
    if (!engines.find(e => e.id === selectedEngine)) {
      setSelectedEngine(engines[0]?.id || '')
    }
  }, [selectedEngine, engines])

  const needsInstall = (selectedEngine === 'piper' && !piperInstalled) || (selectedEngine === 'kokoro' && !kokoroInstalled)

  const charCount = text.length
  const canGenerate = genMode === 'vc'
    ? !isGenerating && selectedEngine === 'elevenlabs' && !!vcAudio && !!selectedVoice && elevenlabsConfigured
    : text.trim().length > 0 && !isGenerating && (!needsInstall) && (
        selectedEngine === 'gpt-tts' || selectedEngine === 'minimax-tts' ||
        (selectedEngine === 'elevenlabs' ? (!!selectedVoice && elevenlabsConfigured) : !!selectedVoice)
      )

  const voiceList: any[] = selectedEngine === 'piper' ? piperVoices : selectedEngine === 'kokoro' ? kokoroVoices : selectedEngine === 'elevenlabs' ? elevenlabsVoices : []

  const modelOptions = useMemo(() => {
    const apiOptions = elevenlabsModels.map((m) => ({ value: m.id, label: m.name }))
    return [...apiOptions, ...ELEVENLABS_MODELS.filter((s) => !elevenlabsModels.some((m) => m.id === s.value))]
  }, [elevenlabsModels])

  const languageOptions = useMemo(() => {
    const map = new Map(VOICE_LANGUAGES.map(l => [l.code, l.name]))
    for (const v of elevenlabsVoices) if (v.language && !map.has(v.language)) map.set(v.language, v.language)
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, name]) => ({ value: code, label: `${name} (${code})` }))
  }, [elevenlabsVoices])

  const accentOptions = useMemo(() => {
    const set = new Set<string>(voiceLang ? (VOICE_ACCENTS_BY_LANG[voiceLang] || []) : [])
    for (const v of elevenlabsVoices) {
      if (v.accent && (!voiceLang || (v.language || '').toLowerCase() === voiceLang.toLowerCase())) set.add(v.accent)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [elevenlabsVoices, voiceLang])

  useEffect(() => {
    setVoiceAccent('')
  }, [voiceLang])

  const genderOptions = useMemo(() => {
    const set = new Set<string>(VOICE_GENDERS)
    for (const v of elevenlabsVoices) if (v.gender) set.add(v.gender)
    return [...set].sort()
  }, [elevenlabsVoices])

  const filteredElevenLabsVoices = elevenlabsVoices.filter((v: any) => {
    const q = voiceSearch.trim().toLowerCase()
    if (q && !(v.label || '').toLowerCase().includes(q)) return false
    if (voiceLang && (v.language || '').toLowerCase() !== voiceLang.toLowerCase()) return false
    if (voiceAccent && (v.accent || '').toLowerCase() !== voiceAccent.toLowerCase()) return false
    if (voiceGender && (v.gender || '').toLowerCase() !== voiceGender.toLowerCase()) return false
    if (showFavoritesOnly && !favorites.has(v.id)) return false
    return true
  })
  const hasVoiceFilters = !!(voiceSearch || voiceLang || voiceAccent || voiceGender)

  // Lazy load fix: with a filter active the visible list can be too short to ever
  // reach the scroll trigger, so keep fetching pages until we have enough matches.
  useEffect(() => {
    if (!hasVoiceFilters || !elevenlabsHasMore || loadingMore || elevenlabsLoading) return
    if (filteredElevenLabsVoices.length < 60) {
      loadElevenLabsPage(elevenlabsNextToken)
    }
  }, [hasVoiceFilters, filteredElevenLabsVoices.length, elevenlabsHasMore, loadingMore, elevenlabsLoading, elevenlabsNextToken, loadElevenLabsPage])

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Left panel - Engine + Voice selection */}
      <div className="w-72 border-r border-surface-800 flex flex-col min-h-0 bg-surface-950/80">
        {/* Voice list for local engines */}
        {/* ElevenLabs: filters + voice list */}
        {selectedEngine === 'elevenlabs' && (
          <>
            <div className="p-3 border-b border-surface-800 flex-shrink-0 space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
                  <input
                    value={voiceSearch}
                    onChange={(e) => setVoiceSearch(e.target.value)}
                    placeholder="Search voices..."
                    className="input-field pl-7 text-xs w-full"
                  />
                </div>
                <button
                  onClick={() => setShowFavoritesOnly(v => !v)}
                  title={showFavoritesOnly ? 'Show all voices' : 'Show favorites only'}
                  className={`flex-shrink-0 p-1.5 rounded-lg border transition-colors ${showFavoritesOnly ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'border-surface-800 text-surface-500 hover:text-amber-400 hover:border-amber-500/30'}`}
                >
                  <Star size={13} fill={showFavoritesOnly ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <SearchableSelect
                  value={voiceLang}
                  onChange={setVoiceLang}
                  options={languageOptions}
                  placeholder="Lang"
                />
                <SearchableSelect
                  value={voiceAccent}
                  onChange={setVoiceAccent}
                  options={accentOptions.map((a) => ({ value: a, label: a }))}
                  placeholder="Accent"
                  disabled={!voiceLang}
                />
                <Select value={voiceGender || ANY} onValueChange={(v) => setVoiceGender(v === ANY ? '' : v)}>
                  <SelectTrigger className="h-6 rounded-md px-1.5 text-[10px] gap-1 bg-surface-800 border-surface-700 text-surface-300 [&>svg]:size-3" title="Gender">
                    <SelectValue placeholder="Gender" />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-900 border-surface-700 text-surface-200 max-h-56">
                    <SelectItem value={ANY} className="text-xs py-1">Any</SelectItem>
                    {genderOptions.map((g) => (
                      <SelectItem key={g} value={g} className="text-xs py-1">{g.charAt(0).toUpperCase() + g.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasVoiceFilters && (
                <button onClick={() => { setVoiceSearch(''); setVoiceLang(''); setVoiceAccent(''); setVoiceGender('') }} className="text-[10px] text-accent-400 hover:text-accent-300 flex items-center gap-1">
                  <X size={10} /> Clear filters
                </button>
              )}
            </div>
            <div
              ref={voicesScrollRef}
              onScroll={handleVoicesScroll}
              className="flex-1 overflow-y-auto p-4 min-h-0"
            >
              {elevenlabsLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8">
                  <Loader size={18} className="animate-spin text-accent-400" />
                  <p className="text-[11px] text-surface-500">Cargando voces de ElevenLabs...</p>
                </div>
              ) : !elevenlabsConfigured ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <AlertCircle size={18} className="text-red-400" />
                  <p className="text-[11px] text-surface-500 text-center">
                    {voiceError || 'ElevenLabs no configurado. Agregá tu API key en Settings → Providers.'}
                  </p>
                  <button
                    onClick={async () => {
                      const api = (window as any).electronAPI
                      const k = await api?.settings?.get?.('elevenlabsApiKey').catch(() => '')
                      setElevenLabsConfigured(!!k)
                      setVoiceError('')
                      if (k) {
                        setElevenLabsLoading(true)
                        try {
                          await loadElevenLabsPage()
                        } finally {
                          setElevenLabsLoading(false)
                        }
                      }
                    }}
                    className="btn-ghost text-xs flex items-center gap-1"
                  >
                    <RefreshCw size={11} /> Reintentar
                  </button>
                </div>
              ) : voiceError && elevenlabsVoices.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <AlertCircle size={18} className="text-red-400" />
                  <p className="text-[11px] text-surface-500 text-center">{voiceError}</p>
                  <button
                    onClick={() => {
                      setVoiceError('')
                      setElevenLabsLoading(true)
                      loadElevenLabsPage().finally(() => setElevenLabsLoading(false))
                    }}
                    className="btn-ghost text-xs flex items-center gap-1"
                  >
                    <RefreshCw size={11} /> Reintentar
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[10px] text-surface-500 uppercase tracking-wider">Voices</p>
                    <span className="text-[10px] text-surface-600">{filteredElevenLabsVoices.length}</span>
                  </div>
                  {filteredElevenLabsVoices.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-surface-600">
                      {showFavoritesOnly && !favorites.size ? (
                        <Star size={16} className="opacity-40" />
                      ) : (
                        <Search size={16} className="opacity-40" />
                      )}
                      <p className="text-[11px] text-center px-4">
                        {showFavoritesOnly ? 'No favorite voices yet. Tap the star on a voice to add it.' : 'No voices match your filters.'}
                      </p>
                    </div>
                  ) : (
                  <>
                  <div className="space-y-1">
                    {filteredElevenLabsVoices.map((voice: any) => (
                      <div key={voice.id} className="group">
                        <div
                          onClick={() => setSelectedVoice(voice.id)}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all text-left cursor-pointer ${
                            selectedVoice === voice.id
                              ? 'bg-accent-500/10 text-accent-400 border border-accent-500/20'
                              : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50 border border-transparent'
                          }`}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePreview(voice) }}
                            title={voice.previewUrl ? (previewingId === voice.id ? 'Stop preview' : `Preview: ${voice.label}`) : 'No preview available'}
                            disabled={!voice.previewUrl}
                            className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                              previewingId === voice.id
                                ? 'bg-accent-500/20 text-accent-400'
                                : 'bg-surface-800 text-surface-400 hover:text-surface-200'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                          >
                            {previewingId === voice.id ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                          </button>
                          <span className="truncate flex-1">
                            <span className="block truncate">{voice.label}</span>
                            {voice.detail && <span className="block text-[10px] text-surface-600 truncate">{voice.detail}</span>}
                          </span>
                          {selectedVoice === voice.id && <Check size={14} className="flex-shrink-0" />}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleVoiceFavorite(voice.id) }}
                            title={favorites.has(voice.id) ? 'Remove favorite' : 'Add to favorites'}
                            className={`w-6 h-6 flex items-center justify-center flex-shrink-0 transition-colors ${
                              favorites.has(voice.id)
                                ? 'text-amber-400'
                                : 'text-surface-600 hover:text-amber-400'
                            }`}
                          >
                            <Star size={12} fill={favorites.has(voice.id) ? 'currentColor' : 'none'} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {loadingMore && (
                    <div className="flex items-center justify-center gap-2 py-4 text-surface-500">
                      <Loader size={14} className="animate-spin text-accent-400" />
                      <span className="text-[10px]">Loading more voices...</span>
                    </div>
                  )}
                  </>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Voice list for local engines */}
        {(selectedEngine === 'piper' || selectedEngine === 'kokoro') && (
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            {needsInstall ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <p className="text-[11px] text-surface-500 text-center">
                  {selectedEngine === 'piper' ? 'Piper engine is not installed.' : 'Kokoro engine is not installed.'}
                </p>
                <button
                  onClick={() => handleInstall(selectedEngine)}
                  disabled={installing}
                  className="btn-primary text-xs flex items-center gap-1.5"
                >
                  {installing ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
                  Install {selectedEngine === 'piper' ? 'Piper' : 'Kokoro'}
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[10px] text-surface-500 uppercase tracking-wider">Voices</p>
                  <span className="text-[10px] text-surface-600">{voiceList.length}</span>
                </div>
                <div className="space-y-1">
                  {voiceList.map((voice: any) => {
                    const isDownloaded = selectedEngine === 'kokoro' ? true : voice.downloaded
                    const vId = voice.id
                    const label = selectedEngine === 'kokoro'
                      ? `${voice.id} (${voice.language})`
                      : `${voice.id}`
                    return (
                      <div key={vId} className="group">
                        {isDownloaded ? (
                          <button
                            onClick={() => setSelectedVoice(vId)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left ${
                              selectedVoice === vId
                                ? 'bg-accent-500/10 text-accent-400 border border-accent-500/20'
                                : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50 border border-transparent'
                            }`}
                          >
                            <Mic size={14} className="flex-shrink-0" />
                            <span className="truncate">{label}</span>
                            {selectedVoice === vId && <Check size={14} className="ml-auto flex-shrink-0" />}
                          </button>
            ) : selectedEngine === 'kokoro' && loadingVoices ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8">
                <Loader size={18} className="animate-spin text-accent-400" />
                <p className="text-[11px] text-surface-500">{voiceError || 'Conectando con el servidor...'}</p>
              </div>
            ) : selectedEngine === 'kokoro' && voiceError && !loadingVoices ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <AlertCircle size={18} className="text-red-400" />
                <p className="text-[11px] text-surface-500 text-center">{voiceError}</p>
                <button onClick={() => {
                  setVoiceError('')
                  setLoadingVoices(true)
                  const api = (window as any).electronAPI
                  api?.local?.kokoroGetVoices?.().then((v: any[]) => {
                    setKokoroVoices(v || [])
                    setLoadingVoices(false)
                  }).catch(() => {
                    setVoiceError('No se pudo conectar. Intentá de nuevo.')
                    setLoadingVoices(false)
                  })
                }} className="btn-ghost text-xs flex items-center gap-1">
                  <RefreshCw size={11} /> Reintentar
                </button>
              </div>
            ) : (
                          <div className="flex items-center gap-2.5 px-3 py-2">
                            <Mic size={14} className="text-surface-600 flex-shrink-0" />
                            <span className="text-sm text-surface-500 truncate flex-1">{label}</span>
                            <button
                              onClick={() => handleDownloadVoice(vId)}
                              className="text-[11px] text-accent-400 hover:text-accent-300 flex-shrink-0 flex items-center gap-1"
                            >
                              <Download size={12} /> Get
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Empty state for engines without a voice list */}
        {selectedEngine !== 'piper' && selectedEngine !== 'kokoro' && selectedEngine !== 'elevenlabs' && (
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <div className="flex flex-col items-center gap-2 py-8 text-surface-600">
              <Cloud size={18} className="opacity-40" />
              <p className="text-[11px] text-center px-4">
                {engines.length === 0
                  ? 'No providers activated. Add an API key in Settings → Providers to enable voice engines.'
                  : 'This engine uses default voices. Select a voice-enabled engine to choose one.'}
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Center - Text area + Generate */}
      <div className="flex-1 flex flex-col min-h-0 p-4">
        <div className="flex-1 flex flex-col min-h-0">
          {/* Mode switcher */}
          {selectedEngine === 'elevenlabs' && (
            <div className="flex-shrink-0 mb-3">
              <div className="inline-flex bg-surface-800/80 border border-surface-700 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setGenMode('tts')}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${genMode === 'tts' ? 'bg-accent-600 text-white' : 'text-surface-400 hover:text-surface-200'}`}
                >
                  Text to speech
                </button>
                <button
                  onClick={() => setGenMode('vc')}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${genMode === 'vc' ? 'bg-accent-600 text-white' : 'text-surface-400 hover:text-surface-200'}`}
                >
                  Voice changer
                </button>
              </div>
            </div>
          )}

          {genMode === 'tts' || selectedEngine !== 'elevenlabs' ? (
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={
                (selectedEngine === 'piper' || selectedEngine === 'kokoro') && !selectedVoice ? 'Select a voice first...' :
                selectedEngine === 'elevenlabs' && !selectedVoice ? 'Select a voice first...' :
                'Type the text you want to convert to speech...\n\nYou can paste long texts, scripts, articles — the AI will generate natural-sounding speech from your text.'
              }
              disabled={isGenerating || (selectedEngine === 'piper' && !piperInstalled) || (selectedEngine === 'kokoro' && !kokoroInstalled)}
              className="flex-1 w-full bg-surface-900/60 border border-surface-700/60 rounded-xl p-5 text-sm text-surface-100 placeholder-surface-500 resize-none focus:outline-none focus:border-accent-500/40 focus:ring-1 focus:ring-accent-500/20 transition-all min-h-0 disabled:opacity-50"
            />
          ) : (
            /* Voice changer: audio source */
            <div className="flex-1 flex flex-col min-h-0">
              {vcAudio ? (
                <div className="flex-1 flex flex-col min-h-0 overflow-y-auto gap-4 border border-dashed border-surface-700 rounded-xl p-5">
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center flex-shrink-0">
                      <AudioLines size={20} className="text-accent-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-surface-200 truncate">{vcAudio.fileName}</p>
                      <p className="text-[10px] text-surface-500">
                        {vcBuffer ? `${formatTime(vcBuffer.duration)} · ${vcAudio.mime}` : (vcAudio.duration ? `${vcAudio.duration.toFixed(1)}s` : vcAudio.mime)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={toggleVcPlay}
                        title={vcPlaying ? 'Pause' : 'Play full audio'}
                        className="w-8 h-8 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center text-surface-300 hover:text-accent-300 hover:border-accent-500/40 transition-colors"
                      >
                        {vcPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                      </button>
                      <button onClick={() => setVcAudio(null)} title="Replace with another audio" className="w-8 h-8 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center text-surface-400 hover:text-surface-200 hover:border-accent-500/40 transition-colors">
                        <RotateCcw size={12} />
                      </button>
                      <button onClick={() => setVcAudio(null)} title="Remove audio" className="w-8 h-8 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center text-surface-400 hover:text-red-300 hover:border-red-500/40 transition-colors">
                        <X size={12} />
                      </button>
                    </div>
                  </div>

                  {vcDecoding ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-surface-500">
                      <Loader size={16} className="animate-spin text-accent-400" />
                      <p className="text-[11px]">Procesando audio...</p>
                    </div>
                  ) : vcBuffer ? (
                    <div className="flex-shrink-0">
                      <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-2">Select the part to use</p>
                      <AudioTrimEditor buffer={vcBuffer} onChange={(s, e) => setVcTrim({ start: s, end: e })} />
                      <p className="text-[10px] text-surface-600 mt-1.5">
                        Drag the cyan (start) and pink (end) markers, click to seek. Only the selected region is sent to ElevenLabs.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-6 text-red-400">
                      <AlertCircle size={16} />
                      <p className="text-[11px]">No se pudo decodificar el audio. Probá con otro archivo.</p>
                    </div>
                  )}

                  <p className="text-[10px] text-surface-600 text-center mt-auto">
                    {selectedVoice ? 'Select a voice: ready to convert.' : 'Select a target voice on the left before generating.'}
                  </p>
                </div>
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    const file = e.dataTransfer.files?.[0]
                    if (file) readAudioFile(file)
                  }}
                  className={`flex-1 flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-5 transition-colors ${dragOver ? 'border-accent-500/60 bg-accent-500/5' : 'border-surface-700'}`}
                >
                  <AudioLines size={30} className="text-surface-600" />
                  <p className="text-xs text-surface-500 text-center">Drop an audio file here, or choose a source:</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowAudioPicker(true)} className="px-3 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 text-[11px] font-medium transition-colors flex items-center gap-1.5">
                      <Library size={12} /> Library
                    </button>
                    <button onClick={() => uploadAudioRef.current?.click()} className="px-3 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 text-[11px] font-medium transition-colors flex items-center gap-1.5">
                      <Upload size={12} /> Upload
                    </button>
                    <button onClick={() => setShowRecorder(true)} className="px-3 py-1.5 rounded-lg bg-accent-600/90 hover:bg-accent-500 text-white text-[11px] font-medium transition-colors flex items-center gap-1.5">
                      <Mic size={12} /> Record
                    </button>
                  </div>
                  <p className="text-[10px] text-surface-600 text-center max-w-[280px]">
                    {selectedVoice ? 'Select a voice: ready to convert.' : 'Select a target voice on the left before generating.'}
                  </p>
                </div>
              )}
              <input
                ref={uploadAudioRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) readAudioFile(file)
                  e.target.value = ''
                }}
              />
            </div>
          )}
          <div className="flex items-center justify-between mt-3 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {genMode === 'vc' && selectedEngine === 'elevenlabs' ? (
                <span className="text-[11px] text-surface-500 flex-shrink-0 truncate">
                  {vcAudio ? vcAudio.fileName : 'No audio selected'}
                </span>
              ) : (
                <span className="text-[11px] text-surface-500 flex-shrink-0">{charCount.toLocaleString()} characters</span>
              )}
              {errorMessage && (
                <div className="flex items-center gap-1.5 text-red-400 min-w-0">
                  <AlertCircle size={12} className="flex-shrink-0" />
                  <span className="text-[11px] truncate">{errorMessage}</span>
                  <button onClick={onClearError} className="text-red-400/60 hover:text-red-300 flex-shrink-0">
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Engine select */}
              {engines.length > 0 && (
              <div className="relative" ref={engineRef}>
                <button
                  onClick={() => setEngineOpen(!engineOpen)}
                  className={`flex items-center gap-1.5 px-2.5 h-9 bg-surface-800/80 hover:bg-surface-700/80 rounded-lg text-[11px] font-medium text-surface-300 transition-colors border ${engineOpen ? 'border-accent-500/40' : 'border-transparent'}`}
                  title="Engine"
                >
                  {(() => { const eng = engines.find(e => e.id === selectedEngine) || engines[0]; return (
                    <>
                      {eng.local
                        ? <Cpu size={12} className="text-green-500/80" />
                        : <Cloud size={12} className="text-accent-400" />
                      }
                      {eng.name}
                      {eng.local
                        ? <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/20 text-green-500/80 font-semibold">LOCAL</span>
                        : <span className="text-[9px] px-1 py-0.5 rounded bg-accent-500/20 text-accent-400 font-semibold">{eng.provider}</span>
                      }
                    </>
                  ) })()}
                  <ChevronDown size={11} className={`text-surface-500 transition-transform duration-200 ${engineOpen ? 'rotate-180' : ''}`} />
                </button>

                {engineOpen && (
                  <div className="absolute bottom-full left-0 mb-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[200px] shadow-xl z-50">
                    {engines.map((eng) => {
                      const isActive = eng.id === selectedEngine
                      return (
                        <button
                          key={eng.id}
                          onClick={() => { setSelectedEngine(eng.id); setEngineOpen(false) }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${isActive ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/50'}`}
                        >
                          {eng.local
                            ? <Cpu size={11} className={isActive ? 'text-green-500/80' : 'text-surface-500'} />
                            : <Cloud size={11} className={isActive ? 'text-accent-400' : 'text-surface-500'} />
                          }
                          <span className="flex-1">{eng.name}</span>
                          <span className={`text-[10px] ${eng.local ? 'text-green-500/70' : 'text-surface-600'}`}>{eng.provider}</span>
                          {isActive && <Check size={12} className="flex-shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              )}
              <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                <PopoverTrigger asChild>
                  <button
                    title="Advanced settings"
                    className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors border ${settingsOpen ? 'bg-surface-700 text-surface-200 border-accent-500/40' : 'bg-surface-800/80 text-surface-400 hover:text-surface-200 hover:bg-surface-700/80 border-transparent'}`}
                  >
                    <Settings size={14} />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" side="top" sideOffset={6} className="w-64 p-3 bg-surface-900 border-surface-700 text-surface-200">
                  <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-3">Advanced settings</p>
                  {selectedEngine === 'elevenlabs' && (
                    <div className="space-y-3 mb-3">
                      <div>
                        <p className="text-[11px] text-surface-400 mb-1">Model</p>
                        <Select value={ttsModel} onValueChange={setTtsModel}>
                          <SelectTrigger className="h-7 w-full rounded-md px-2 text-[11px] gap-1 bg-surface-800 border-surface-700 text-surface-200 [&>svg]:size-3">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-surface-900 border-surface-700 text-surface-200 max-h-56">
                            {modelOptions.map(m => (
                              <SelectItem key={m.value} value={m.value} className="text-xs py-1">{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <SliderSetting label="Stability" value={stability} onChange={setStability} min={0} max={1} step={0.05} />
                      <SliderSetting label="Similarity" value={similarityBoost} onChange={setSimilarityBoost} min={0} max={1} step={0.05} />
                      <SliderSetting label="Style" value={style} onChange={setStyle} min={0} max={1} step={0.05} />
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-surface-400">Speaker boost</span>
                        <button
                          onClick={() => setUseSpeakerBoost(v => !v)}
                          className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${useSpeakerBoost ? 'bg-accent-500' : 'bg-surface-700'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${useSpeakerBoost ? 'left-[18px]' : 'left-0.5'}`} />
                        </button>
                      </div>
                    </div>
                  )}
                  <SliderSetting
                    label="Speed"
                    value={speed}
                    onChange={setSpeed}
                    min={selectedEngine === 'elevenlabs' ? 0.7 : 0.5}
                    max={selectedEngine === 'elevenlabs' ? 1.2 : 2.0}
                    step={0.1}
                    fmt={(v) => `${v.toFixed(1)}x`}
                  />
                </PopoverContent>
              </Popover>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="px-6 py-2.5 bg-accent-600 hover:bg-accent-500 disabled:bg-surface-700 disabled:text-surface-500 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2 disabled:cursor-not-allowed shadow-lg shadow-accent-600/20"
              >
                {isGenerating ? (
                  <>
                    <Loader size={14} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Generate Speech
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Progress bar */}
          {isGenerating && (
            <div className="mt-2">
              <div className="w-full h-1.5 bg-surface-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(Math.max(statusPct || 5, 2), 100)}%` }}
                />
              </div>
              {statusMessage && (
                <p className="text-[10px] text-surface-500 mt-1 truncate">{statusMessage}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right panel - History */}
      <div className={`border-l border-surface-800 bg-surface-950/80 flex flex-col min-h-0 transition-all duration-200 ${historyOpen ? 'w-72' : 'w-10'}`}>
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          className="flex items-center gap-1.5 p-2.5 text-[11px] text-surface-500 hover:text-surface-200 border-b border-surface-800 transition-colors"
        >
          {historyOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          {historyOpen && <span className="font-medium uppercase tracking-wider">History</span>}
        </button>

        {historyOpen && (
          <div className="flex-1 overflow-y-auto min-h-0">
            {voiceAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-surface-600">
                <History size={24} className="opacity-40" />
                <p className="text-[11px] text-center px-4">No voice generations yet. Your history will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-surface-800/60">
                {voiceAssets.map((asset: any) => (
                  <div key={asset.id} className="p-2.5 hover:bg-surface-800/40 transition-colors group">
                    <div className="flex items-start gap-2">
                      <button
                        onClick={() => togglePlay(asset)}
                        className="w-8 h-8 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center flex-shrink-0 hover:bg-accent-500/20 hover:border-accent-500/30 transition-colors mt-0.5"
                      >
                        {playingId === asset.id ? <Pause size={13} className="text-accent-400" /> : <Play size={13} className="text-surface-300 ml-0.5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-surface-200 line-clamp-2 leading-snug">{asset.prompt || '—'}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-surface-500">
                            {asset.modelUsed?.startsWith('piper:') ? `Piper · ${asset.modelUsed.slice(6)}` :
                             asset.modelUsed?.startsWith('kokoro:') ? `Kokoro · ${asset.modelUsed.slice(7)}` :
                             asset.modelUsed?.startsWith('elevenlabs:vc:') ? `ElevenLabs VC · ${asset.modelUsed.slice(13)}` :
                             asset.modelUsed?.startsWith('elevenlabs:') ? `ElevenLabs · ${asset.modelUsed.slice(11)}` :
                             asset.modelUsed === 'gpt-tts-1' ? 'GPT TTS' :
                             asset.modelUsed === 'minimax-text-to-speech' ? 'MiniMax TTS' :
                             asset.modelUsed || '—'}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <WaveformBars playing={playingId === asset.id} />
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleSaveAs(asset)}
                            title="Save as"
                            className="w-7 h-7 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center text-surface-400 hover:text-accent-300 hover:border-accent-500/40 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            {savingId === asset.id ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
                          </button>
                          <button
                            onClick={() => handleRecreate(asset)}
                            title="Recreate"
                            className="w-7 h-7 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center text-surface-400 hover:text-accent-300 hover:border-accent-500/40 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <RotateCcw size={12} />
                          </button>
                          <button
                            onClick={() => handleToggleFavoriteAsset(asset)}
                            title={asset.isFavorite ? 'Remove favorite' : 'Add to favorites'}
                            className={`w-7 h-7 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 ${asset.isFavorite ? 'text-amber-400 border-amber-500/40' : 'text-surface-400 hover:text-amber-400 hover:border-amber-500/40'}`}
                          >
                            <Star size={12} fill={asset.isFavorite ? 'currentColor' : 'none'} />
                          </button>
                          {confirmDeleteId === asset.id ? (
                            <div className="flex items-center gap-1 pl-1">
                              <span className="text-[9px] text-surface-500">Sure?</span>
                              <button
                                onClick={() => handleDeleteAsset(asset)}
                                className="w-7 h-7 rounded-lg bg-red-500/90 hover:bg-red-500 text-white flex items-center justify-center transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="w-7 h-7 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center text-surface-400 hover:text-surface-200 transition-colors"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(asset.id)}
                              title="Delete"
                              className="w-7 h-7 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center text-surface-400 hover:text-red-400 hover:border-red-500/40 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <audio
        ref={audioRef}
        className="hidden"
        onEnded={() => setPlayingId(null)}
        onPause={() => setPlayingId(null)}
      />

      <audio
        ref={previewAudioRef}
        className="hidden"
        onEnded={() => setPreviewingId(null)}
        onPause={() => setPreviewingId(null)}
      />

      {vcAudioUrl && (
        <audio
          ref={vcAudioRef}
          src={vcAudioUrl}
          className="hidden"
          onEnded={() => setVcPlaying(false)}
          onPause={() => setVcPlaying(false)}
        />
      )}

      {showAudioPicker && (
        <AudioLibraryPicker
          onClose={() => setShowAudioPicker(false)}
          onSelect={(audio) => {
            setVcAudio(audio)
            setShowAudioPicker(false)
          }}
        />
      )}

      {showRecorder && (
        <RecorderModal
          onClose={() => setShowRecorder(false)}
          onConfirm={(audio) => {
            setVcAudio(audio)
            setShowRecorder(false)
          }}
        />
      )}
    </div>
  )
}
