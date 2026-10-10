import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  Mic, Play, Pause, Loader, X, AlertCircle, Check, Sparkles,
  ChevronDown, RefreshCw, Search, Star, RotateCcw,
  Upload, Library, AudioLines, SlidersHorizontal, Type, Wand2,
} from 'lucide-react'
import { RecorderModal } from './RecorderModal'
import { AudioLibraryPicker } from './AudioLibraryPicker'
import { AudioTrimEditor } from './AudioTrimEditor'
import { VoiceHistorySidebar } from './VoiceHistorySidebar'
import { VoiceAvatar } from './VoiceAvatar'
import {
  PRESET_VOICES_BY_MODEL, VOICE_LANGUAGES, VOICE_ACCENTS_BY_LANG, VOICE_GENDERS, ELEVENLABS_MODELS,
  parseAssetParams, voiceIdOf, findPresetVoice, prettifyElevenModelId,
} from './voice-constants'
import { decodeBase64Audio, sliceAudioBuffer, audioBufferToBase64, formatTime } from '../../lib/wav'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SelectorOption } from '../ui/SelectorOption'

import { ProviderLogo } from '../icons/ProviderLogos'
import { useProvidersStore } from '../../stores/providers-store'
import { AUDIO_MODELS } from '../../lib/models'
import { getAudioProvider } from '../../lib/audio'

const ANY = '__any__'

interface VoiceFilters { search: string; language: string; accent: string; gender: string }
const NO_VOICE_FILTERS: VoiceFilters = { search: '', language: '', accent: '', gender: '' }

// Same chip / popup language as the Playground PromptComposer
const CHIP = 'flex items-center gap-1.5 h-7 px-2.5 py-1 bg-surface-900/90 hover:bg-surface-800/90 border border-surface-700/80 hover:border-surface-600 rounded-lg text-[11px] font-medium text-surface-200 transition-all shadow-sm data-[state=open]:bg-surface-800 data-[state=open]:border-surface-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface-900/90 disabled:hover:border-surface-700/80'
const POPUP = 'astryx-selector-popup popover-surface rounded-2xl p-1 text-surface-200'
const POPUP_TITLE = 'px-2.5 pt-1.5 pb-1 eyebrow'

// Voice names are not stored on the asset, so remember the ones we generate
// with: the history can then label voices that are not in the loaded page.
const VOICE_NAME_CACHE_KEY = 'openfield-voice-names'
function readVoiceNameCache(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(VOICE_NAME_CACHE_KEY) || '{}') || {} } catch { return {} }
}

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
            open ? 'border-accent-500/40 text-surface-300' : value ? 'border-accent-500/30 text-accent-300' : 'border-surface-700 text-surface-300'
          } bg-surface-800/80 disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <span className="truncate">{selected?.label || placeholder}</span>
          <ChevronDown size={10} className="opacity-50 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={4} className="p-0 w-56 text-surface-200" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-center gap-1.5 border-b border-surface-800 px-2">
          <Search size={11} className="text-surface-500 flex-shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="h-7 bg-transparent text-xs text-surface-200 outline-none placeholder:text-surface-600 w-full"
          />
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          <button
            onClick={() => { onChange(''); handleOpenChange(false) }}
            className={`w-full text-left px-2 py-1 text-[11px] rounded flex items-center justify-between ${!value ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400 hover:bg-surface-800'}`}
          >
            <span>Cualquiera</span>
            {!value && <Check size={11} className="flex-shrink-0" />}
          </button>
          {filtered.length === 0 ? (
            <p className="px-2 py-2 text-[10px] text-surface-500">Sin opciones</p>
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

interface Engine {
  id: string
  name: string
  local: boolean
  provider: string
  keyName?: string
}

interface VoiceGenViewProps {
  onGenerate: (params: any) => void
  voiceAssets: any[]
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
  sentinelRef: React.RefObject<HTMLDivElement | null>
  isGenerating: boolean
  statusMessage: string
  statusPct: number
  errorMessage: string
  onClearError: () => void
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

const ALL_ENGINES: Engine[] = [
  { id: 'elevenlabs', name: 'ElevenLabs', provider: 'ElevenLabs', local: false, keyName: 'elevenlabsApiKey' },
  { id: 'kie', name: 'KIE.ai', provider: 'KIE.ai', local: false, keyName: 'openfieldApiKey' },
  { id: 'fal', name: 'fal.ai', provider: 'fal.ai', local: false, keyName: 'falApiKey' },
  { id: 'replicate', name: 'Replicate', provider: 'Replicate', local: false, keyName: 'replicateApiKey' },
  { id: 'machgen', name: 'MachGen', provider: 'MachGen', local: false, keyName: 'machgenApiKey' },
]

export function VoiceGenView({
  onGenerate, voiceAssets, hasMore, loadingMore: historyLoadingMore, loadMore, sentinelRef,
  isGenerating, statusMessage, statusPct, errorMessage, onClearError,
}: VoiceGenViewProps) {
  const [selectedEngine, setSelectedEngine] = useState('elevenlabs')
  const [selectedVoice, setSelectedVoice] = useState('')
  const [speed, setSpeed] = useState(1.0)
  const [ttsModel, setTtsModel] = useState('eleven_multilingual_v3')
  const [stability, setStability] = useState(0.5)
  const [similarityBoost, setSimilarityBoost] = useState(0.75)
  const [style, setStyle] = useState(0)
  const [useSpeakerBoost, setUseSpeakerBoost] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [engineOpen, setEngineOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [text, setText] = useState('')
  const [elevenlabsVoices, setElevenLabsVoices] = useState<any[]>([])
  const [elevenlabsModels, setElevenLabsModels] = useState<{ id: string; name: string; detail?: string }[]>([])
  const [elevenlabsConfigured, setElevenLabsConfigured] = useState(false)
  const [elevenlabsLoading, setElevenLabsLoading] = useState(false)
  const [elevenlabsHasMore, setElevenLabsHasMore] = useState(false)
  const [elevenlabsNextToken, setElevenLabsNextToken] = useState<string | undefined>(undefined)
  const [loadingMore, setLoadingMore] = useState(false)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [voiceNameCache, setVoiceNameCache] = useState<Record<string, string>>(readVoiceNameCache)
  const voicesScrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingVoiceRef = useRef('')
  const [voiceError, setVoiceError] = useState('')
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [voiceSearch, setVoiceSearch] = useState('')
  const [debouncedVoiceSearch, setDebouncedVoiceSearch] = useState('')
  const [voiceDirectory, setVoiceDirectory] = useState<Record<string, { label?: string; detail?: string }>>({})
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

  const isVcMode = genMode === 'vc' && selectedEngine === 'elevenlabs'

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem('openfield-elevenlabs-favorites')
      setFavorites(new Set(raw ? JSON.parse(raw) : []))
    } catch {}
  }, [])

  // Filters are applied by the API (account voices + public Voice Library), so a
  // filter change refetches from page one; the ref carries them into pagination.
  const voiceFiltersRef = useRef<VoiceFilters>(NO_VOICE_FILTERS)
  // Each first-page load opens a new generation: responses from an older one are
  // dropped, and paging waits until the first page of the current one lands.
  const voiceGenRef = useRef(0)
  const firstPagePendingRef = useRef(false)

  const loadElevenLabsPage = useCallback(async (token?: string, filters: VoiceFilters = voiceFiltersRef.current) => {
    const api = (window as any).electronAPI
    const replace = !token
    if (!replace && firstPagePendingRef.current) return
    const gen = replace ? ++voiceGenRef.current : voiceGenRef.current
    if (replace) firstPagePendingRef.current = true
    setLoadingMore(true)
    setVoiceError('')
    try {
      const page = await api?.elevenlabs?.voices?.({
        pageSize: 50,
        ...(token ? { nextPageToken: token } : {}),
        ...(filters.search ? { search: filters.search } : {}),
        ...(filters.language ? { language: filters.language } : {}),
        ...(filters.accent ? { accent: filters.accent } : {}),
        ...(filters.gender ? { gender: filters.gender } : {}),
      })
      if (gen !== voiceGenRef.current) return
      const incoming: any[] = page?.voices || []
      setElevenLabsVoices(prev => {
        if (replace) return incoming
        const seen = new Set(prev.map((v: any) => v.id))
        return [...prev, ...incoming.filter((v: any) => !seen.has(v.id))]
      })
      setVoiceDirectory(prev => {
        const next = { ...prev }
        for (const v of incoming) if (v?.id) next[v.id] = { label: v.label, detail: v.detail }
        return next
      })
      setElevenLabsNextToken(page?.nextPageToken)
      setElevenLabsHasMore(!!page?.hasMore)
      setElevenLabsConfigured(true)
    } catch (err: any) {
      if (gen !== voiceGenRef.current) return
      setVoiceError(err?.message?.includes('Unauthorized') || err?.message?.includes('not configured')
        ? 'ElevenLabs no configurado. Agregá tu API key en Settings → Providers.'
        : err?.message || 'No se pudieron cargar las voces de ElevenLabs.')
      setElevenLabsConfigured(false)
    } finally {
      if (gen === voiceGenRef.current) {
        if (replace) firstPagePendingRef.current = false
        setLoadingMore(false)
      }
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

  // Load voices when ElevenLabs is selected
  useEffect(() => {
    const api = (window as any).electronAPI
    if (selectedEngine === 'elevenlabs') {
      let cancelled = false
      setElevenLabsVoices([])
      setElevenLabsNextToken(undefined)
      setElevenLabsHasMore(false)
      setElevenLabsLoading(true)
      setVoiceError('')
      api?.elevenlabs?.models?.().then((raw: { id: string; label?: string; name?: string; detail?: string }[]) => {
        if (cancelled) return
        // The API list carries `label`, the offline fallback carries `name`
        const models = (raw || []).filter((m) => m?.id).map((m) => ({
          id: m.id,
          name: m.label || m.name || prettifyElevenModelId(m.id),
          detail: m.detail,
        }))
        setElevenLabsModels(models)
        setTtsModel(prev => {
          const list = models || []
          if (list.some((m) => m.id === prev)) return prev
          return list.find((m) => m.id === 'eleven_multilingual_v3')?.id || list.find((m) => m.id.includes('v3'))?.id || list[0]?.id || 'eleven_multilingual_v3'
        })
      }).catch(() => {})
      voiceFiltersRef.current = NO_VOICE_FILTERS
      loadElevenLabsPage(undefined, NO_VOICE_FILTERS).finally(() => { if (!cancelled) setElevenLabsLoading(false) })
      return () => { cancelled = true }
    }
  }, [selectedEngine])

  // Reset voice selection when engine changes (a "reuse settings" can queue the voice to keep)
  useEffect(() => {
    setSelectedVoice(pendingVoiceRef.current)
    pendingVoiceRef.current = ''
    setVoiceSearch('')
    setVoiceLang('')
    setVoiceAccent('')
    setVoiceGender('')
    setVcAudio(null)
    previewAudioRef.current?.pause()
    setPreviewingId(null)
    if (selectedEngine === 'elevenlabs') setSpeed(s => Math.max(0.7, Math.min(1.2, s)))
  }, [selectedEngine])

  // Stop a voice preview when the picker closes
  useEffect(() => {
    if (!voiceOpen) previewAudioRef.current?.pause()
  }, [voiceOpen])

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

  const configuredProviders = useProvidersStore((s) => s.configuredProviders)
  const availableEngines = useMemo(() => {
    const list = ALL_ENGINES.filter(e => Boolean(configuredProviders[e.id]))
    return list.length > 0 ? list : ALL_ENGINES
  }, [configuredProviders])

  useEffect(() => {
    if (!availableEngines.find(e => e.id === selectedEngine)) {
      setSelectedEngine(availableEngines[0]?.id || 'elevenlabs')
    }
  }, [selectedEngine, availableEngines])

  const providerModels = useMemo(() => {
    if (selectedEngine === 'elevenlabs') return []
    return AUDIO_MODELS.filter(m => m.kind === 'voice' && m.provider === selectedEngine)
  }, [selectedEngine])

  useEffect(() => {
    if (selectedEngine !== 'elevenlabs') {
      const models = AUDIO_MODELS.filter(m => m.kind === 'voice' && m.provider === selectedEngine)
      if (models.length > 0 && !models.some(m => (m.t2aId || m.name) === ttsModel)) {
        setTtsModel(models[0].t2aId || models[0].name)
      }
    }
  }, [selectedEngine, ttsModel])

  const presetVoices = useMemo(() => {
    if (selectedEngine === 'elevenlabs') return []
    return PRESET_VOICES_BY_MODEL[ttsModel] || []
  }, [selectedEngine, ttsModel])

  const modelOptions = useMemo(() => {
    const apiOptions = elevenlabsModels.map((m) => ({ value: m.id, label: m.name, description: m.detail }))
    return [...apiOptions, ...ELEVENLABS_MODELS.filter((s) => !elevenlabsModels.some((m) => m.id === s.value)).map((s) => ({ ...s, description: undefined as string | undefined }))]
  }, [elevenlabsModels])

  const resolveModelLabel = useCallback((id: string): string => {
    if (!id) return ''
    return elevenlabsModels.find((m) => m.id === id)?.name
      || ELEVENLABS_MODELS.find((m) => m.value === id)?.label
      || AUDIO_MODELS.find((m) => m.t2aId === id || m.name === id)?.name
      || (id.startsWith('eleven_') ? prettifyElevenModelId(id) : id)
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
    for (const v of elevenlabsVoices) if (v.gender) set.add(String(v.gender).toLowerCase())
    return [...set].sort()
  }, [elevenlabsVoices])

  const filteredElevenLabsVoices = showFavoritesOnly
    ? elevenlabsVoices.filter((v: any) => favorites.has(v.id))
    : elevenlabsVoices
  const hasVoiceFilters = !!(voiceSearch || voiceLang || voiceAccent || voiceGender)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedVoiceSearch(voiceSearch.trim()), 350)
    return () => clearTimeout(t)
  }, [voiceSearch])

  // Refetch from the API whenever the filters change
  useEffect(() => {
    if (selectedEngine !== 'elevenlabs' || !elevenlabsConfigured) return
    const filters: VoiceFilters = { search: debouncedVoiceSearch, language: voiceLang, accent: voiceAccent, gender: voiceGender }
    const prev = voiceFiltersRef.current
    if (prev.search === filters.search && prev.language === filters.language && prev.accent === filters.accent && prev.gender === filters.gender) return
    voiceFiltersRef.current = filters
    setElevenLabsNextToken(undefined)
    setElevenLabsHasMore(false)
    voicesScrollRef.current?.scrollTo({ top: 0 })
    loadElevenLabsPage(undefined, filters)
  }, [debouncedVoiceSearch, voiceLang, voiceAccent, voiceGender, selectedEngine, elevenlabsConfigured, loadElevenLabsPage])

  const voicesRefreshing = loadingMore && !elevenlabsNextToken && !elevenlabsLoading
  const searchPending = voiceSearch.trim() !== debouncedVoiceSearch

  // A short result page cannot be scrolled, so pull the next one right away
  useEffect(() => {
    const el = voicesScrollRef.current
    if (!voiceOpen || !el || !elevenlabsHasMore || loadingMore || elevenlabsLoading) return
    if (el.scrollHeight <= el.clientHeight + 40) loadElevenLabsPage(elevenlabsNextToken)
  }, [voiceOpen, filteredElevenLabsVoices.length, elevenlabsHasMore, loadingMore, elevenlabsLoading, elevenlabsNextToken, loadElevenLabsPage])

  const filteredPresetVoices = presetVoices.filter((v) => {
    const q = voiceSearch.trim().toLowerCase()
    return !q || v.label.toLowerCase().includes(q) || (v.detail || '').toLowerCase().includes(q)
  })

  // Lazy load fix: with a filter active the visible list can be too short to ever
  // reach the scroll trigger, so keep fetching pages until we have enough matches.
  useEffect(() => {
    if (!hasVoiceFilters || !elevenlabsHasMore || loadingMore || elevenlabsLoading) return
    if (filteredElevenLabsVoices.length < 60) {
      loadElevenLabsPage(elevenlabsNextToken)
    }
  }, [hasVoiceFilters, filteredElevenLabsVoices.length, elevenlabsHasMore, loadingMore, elevenlabsLoading, elevenlabsNextToken, loadElevenLabsPage])

  // ── Voice naming (composer chip + history) ──
  const elevenlabsVoiceMap = useMemo(() => new Map(elevenlabsVoices.map((v: any) => [v.id, v])), [elevenlabsVoices])

  const voiceNameOf = useCallback((id: string): string | null => {
    if (!id) return null
    return elevenlabsVoiceMap.get(id)?.label || voiceDirectory[id]?.label || voiceNameCache[id] || findPresetVoice(id)?.label || null
  }, [elevenlabsVoiceMap, voiceDirectory, voiceNameCache])

  const resolveAssetVoiceName = useCallback((asset: any) => voiceNameOf(voiceIdOf(asset)), [voiceNameOf])

  const rememberVoiceName = (id: string) => {
    const name = voiceNameOf(id)
    if (!id || !name || voiceNameCache[id] === name) return
    const next = { ...voiceNameCache, [id]: name }
    setVoiceNameCache(next)
    try { localStorage.setItem(VOICE_NAME_CACHE_KEY, JSON.stringify(next)) } catch {}
  }

  const selectedVoiceName = voiceNameOf(selectedVoice)
  const selectedVoiceDetail = elevenlabsVoiceMap.get(selectedVoice)?.detail || voiceDirectory[selectedVoice]?.detail || presetVoices.find(v => v.id === selectedVoice)?.detail

  const currentEngine = availableEngines.find(e => e.id === selectedEngine) || availableEngines[0]
  const currentModelLabel = selectedEngine === 'elevenlabs'
    ? resolveModelLabel(ttsModel)
    : (providerModels.find(m => (m.t2aId || m.name) === ttsModel)?.name || ttsModel)

  // ── Generate ──
  const needsVoice = selectedEngine === 'elevenlabs'
  const charCount = text.length
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
  const estSeconds = wordCount ? (wordCount / 2.5) / (speed || 1) : 0

  const blocker: string | null = isGenerating ? null
    : needsVoice && !elevenlabsConfigured && !elevenlabsLoading ? 'Configurá ElevenLabs en Providers'
    : needsVoice && !selectedVoice ? 'Elegí una voz'
    : isVcMode && !vcAudio ? 'Agregá un audio de origen'
    : !isVcMode && !text.trim() ? 'Escribí un texto'
    : null
  const canGenerate = !isGenerating && !blocker

  const handleGenerate = () => {
    if (!canGenerate) return
    rememberVoiceName(selectedVoice)
    if (isVcMode) {
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
    const params: any = { prompt: text.trim(), kind: 'voice' }

    if (selectedEngine === 'elevenlabs') {
      params.engine = 'elevenlabs'
      params.provider = 'elevenlabs'
      params.voiceId = selectedVoice
      params.model = ttsModel
      params.speed = speed
      params.stability = stability
      params.similarityBoost = similarityBoost
      params.style = style
      params.useSpeakerBoost = useSpeakerBoost
    } else {
      params.engine = selectedEngine
      params.provider = selectedEngine
      params.model = ttsModel
      params.speed = speed
      if (selectedVoice) {
        params.voiceId = selectedVoice
        params.voice = selectedVoice
      }
    }

    onGenerate(params)
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
    const p = parseAssetParams(asset)
    const modelUsed: string = asset.modelUsed || ''
    const isVc = p.mode === 'voicechanger' || modelUsed.startsWith('elevenlabs:vc:')
    let engine: string = p.engine || p.provider || ''
    if (!engine || !availableEngines.some(e => e.id === engine)) engine = getAudioProvider(asset) || ''
    const voiceId = voiceIdOf(asset)

    if (engine && availableEngines.some(e => e.id === engine)) {
      if (engine !== selectedEngine) {
        pendingVoiceRef.current = voiceId
        setSelectedEngine(engine)
      } else if (voiceId) {
        setSelectedVoice(voiceId)
      }
    }
    if (isVc) {
      setGenMode('vc')
    } else {
      setGenMode('tts')
      setText(asset.prompt || '')
    }
    if (p.speed != null) setSpeed(p.speed)
    if (p.model) setTtsModel(p.model)
    if (p.stability != null) setStability(p.stability)
    if (p.similarityBoost != null) setSimilarityBoost(p.similarityBoost)
    if (p.style != null) setStyle(p.style)
    if (p.useSpeakerBoost != null) setUseSpeakerBoost(p.useSpeakerBoost)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const retryElevenLabs = async () => {
    const api = (window as any).electronAPI
    const k = await api?.settings?.get?.('elevenlabsApiKey').catch(() => '')
    setVoiceError('')
    if (!k) { setElevenLabsConfigured(false); return }
    setElevenLabsLoading(true)
    try {
      await loadElevenLabsPage()
    } finally {
      setElevenLabsLoading(false)
    }
  }

  // ── Voice picker rows ──
  const renderVoiceRow = (voice: { id: string; label: string; detail?: string; previewUrl?: string; gender?: string }, opts: { favorite?: boolean } = {}) => {
    const isSelected = selectedVoice === voice.id
    const previewing = previewingId === voice.id
    return (
      <div
        key={voice.id}
        role="option"
        aria-selected={isSelected}
        onClick={() => { setSelectedVoice(voice.id); setVoiceOpen(false) }}
        className={`group flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors border ${
          isSelected ? 'bg-accent-500/10 border-accent-500/25' : 'border-transparent hover:bg-surface-800/70'
        }`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); togglePreview(voice) }}
          disabled={!voice.previewUrl}
          title={voice.previewUrl ? (previewing ? 'Detener' : `Escuchar ${voice.label}`) : voice.label}
          className="relative flex-shrink-0 rounded-full disabled:cursor-default"
        >
          <VoiceAvatar seed={voice.id} name={voice.label} size={28} />
          {voice.previewUrl && (
            <span className={`absolute inset-0 rounded-full bg-black/50 flex items-center justify-center text-white transition-opacity ${previewing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
              {previewing ? <Pause size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" className="ml-px" />}
            </span>
          )}
        </button>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className={`text-xs font-medium truncate ${isSelected ? 'text-surface-100' : 'text-surface-200 group-hover:text-ink'}`}>{voice.label}</span>
            {voice.gender && (
              <span className="text-[9px] px-1 rounded bg-surface-800 text-surface-400 uppercase font-mono flex-shrink-0">{voice.gender}</span>
            )}
          </span>
          {voice.detail && <span className="block text-[10px] text-surface-500 truncate leading-tight mt-0.5">{voice.detail}</span>}
        </span>
        {opts.favorite !== undefined && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleVoiceFavorite(voice.id) }}
            title={opts.favorite ? 'Quitar de favoritas' : 'Añadir a favoritas'}
            className={`w-6 h-6 flex items-center justify-center flex-shrink-0 rounded-md transition-colors ${
              opts.favorite ? 'text-amber-500 dark:text-amber-400' : 'text-surface-600 opacity-0 group-hover:opacity-100 hover:text-amber-500 dark:hover:text-amber-400'
            }`}
          >
            <Star size={12} fill={opts.favorite ? 'currentColor' : 'none'} />
          </button>
        )}
        {isSelected && <Check size={13} className="text-accent-400 flex-shrink-0" />}
      </div>
    )
  }

  const voicePickerBody = () => {
    if (selectedEngine !== 'elevenlabs') {
      return (
        <div className="max-h-[320px] overflow-y-auto p-0.5 space-y-0.5">
          <SelectorOption
            label="Automática"
            description="Voz nativa del modelo"
            icon={Wand2}
            size="sm"
            selected={!selectedVoice}
            hideCheck
            onClick={() => { setSelectedVoice(''); setVoiceOpen(false) }}
          />
          {filteredPresetVoices.map((v) => renderVoiceRow(v))}
        </div>
      )
    }
    if (elevenlabsLoading) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 py-10">
          <Loader size={16} className="animate-spin text-accent-400" />
          <p className="text-[11px] text-surface-500">Cargando voces…</p>
        </div>
      )
    }
    if (!elevenlabsConfigured || (voiceError && elevenlabsVoices.length === 0)) {
      return (
        <div className="flex flex-col items-center gap-2.5 py-8 px-4">
          <AlertCircle size={16} className="text-red-600 dark:text-red-400" />
          <p className="text-[11px] text-surface-400 text-center">
            {voiceError || 'ElevenLabs no configurado. Agregá tu API key en Settings → Providers.'}
          </p>
          <button onClick={retryElevenLabs} className="text-[11px] text-accent-400 hover:text-accent-300 flex items-center gap-1">
            <RefreshCw size={11} /> Reintentar
          </button>
        </div>
      )
    }
    return (
      <div ref={voicesScrollRef} onScroll={handleVoicesScroll} className="relative max-h-[320px] overflow-y-auto p-0.5 space-y-0.5">
        {(voicesRefreshing || searchPending) && filteredElevenLabsVoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10">
            <Loader size={16} className="animate-spin text-accent-400" />
            <p className="text-[11px] text-surface-500">Buscando voces…</p>
          </div>
        ) : filteredElevenLabsVoices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-surface-500">
            {showFavoritesOnly && !favorites.size ? <Star size={16} className="opacity-40" /> : <Search size={16} className="opacity-40" />}
            <p className="text-[11px] text-center px-6">
              {showFavoritesOnly ? 'Todavía no hay voces favoritas. Tocá la estrella de una voz para guardarla.' : 'Ninguna voz coincide con los filtros.'}
            </p>
          </div>
        ) : (
          <div className={`space-y-0.5 transition-opacity ${voicesRefreshing || searchPending ? 'opacity-40 pointer-events-none' : ''}`}>
            {filteredElevenLabsVoices.map((v: any) => renderVoiceRow(v, { favorite: favorites.has(v.id) }))}
          </div>
        )}
        {loadingMore && !voicesRefreshing && (
          <div className="flex items-center justify-center gap-2 py-3 text-surface-500">
            <Loader size={12} className="animate-spin text-accent-400" />
            <span className="text-[10px]">Cargando más voces…</span>
          </div>
        )}
      </div>
    )
  }

  const hasVoiceChip = selectedEngine === 'elevenlabs' || presetVoices.length > 0

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* ── Composer ── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 px-4 pb-4">
        <div className="flex items-center gap-3 h-14 flex-shrink-0">
          <span className="text-sm font-semibold text-surface-200">Voz</span>
          {selectedEngine === 'elevenlabs' && (
            <div className="flex gap-1 bg-surface-900/40 rounded-pill p-1 border border-surface-800/60">
              <button
                onClick={() => setGenMode('tts')}
                className={`px-3 py-1.5 rounded-pill text-xs font-medium flex items-center gap-1.5 transition-colors ${genMode === 'tts' ? 'bg-surface-800 text-surface-100' : 'text-surface-500 hover:text-surface-100'}`}
              >
                <Type size={13} /> Texto a voz
              </button>
              <button
                onClick={() => setGenMode('vc')}
                className={`px-3 py-1.5 rounded-pill text-xs font-medium flex items-center gap-1.5 transition-colors ${genMode === 'vc' ? 'bg-surface-800 text-surface-100' : 'text-surface-500 hover:text-surface-100'}`}
              >
                <AudioLines size={13} /> Cambiar voz
              </button>
            </div>
          )}
          {!isVcMode && (
            <span className="ml-auto text-[10px] text-surface-600 hidden md:inline">
              <kbd className="px-1 py-0.5 rounded bg-surface-800/80 border border-surface-700/60 font-mono text-surface-400">Ctrl</kbd>
              {' + '}
              <kbd className="px-1 py-0.5 rounded bg-surface-800/80 border border-surface-700/60 font-mono text-surface-400">Enter</kbd>
              {' para generar'}
            </span>
          )}
        </div>

        <div
          className={`flex-1 min-h-0 flex flex-col relative overflow-hidden bg-sidebar/90 border rounded-2xl shadow-soft backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 ${
            dragOver ? 'border-accent-400/80 ring-2 ring-accent-400' : 'border-ink/20 focus-within:border-ink/30'
          }`}
          onDragOver={(e) => { if (isVcMode) { e.preventDefault(); setDragOver(true) } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
          onDrop={(e) => {
            if (!isVcMode) return
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) readAudioFile(file)
          }}
        >
          {/* Progress */}
          {isGenerating && (
            <div className="absolute top-0 inset-x-0 h-0.5 bg-surface-800/60 z-10">
              <div className="h-full bg-accent-500 transition-all duration-300" style={{ width: `${Math.min(Math.max(statusPct || 5, 2), 100)}%` }} />
            </div>
          )}

          {/* Body */}
          {!isVcMode ? (
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  handleGenerate()
                }
              }}
              placeholder={'Escribí o pegá el texto que querés convertir en voz…\n\nGuiones, artículos, diálogos: textos largos funcionan perfecto.'}
              className="flex-1 h-full w-full min-h-0 bg-transparent px-6 pt-6 pb-3 text-[15px] leading-7 text-surface-100 placeholder:text-surface-500 resize-none outline-none"
            />
          ) : vcAudio ? (
            <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-6 pb-3 flex flex-col gap-5">
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="w-11 h-11 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center flex-shrink-0">
                  <AudioLines size={18} className="text-accent-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-surface-100 truncate">{vcAudio.fileName}</p>
                  <p className="text-[11px] text-surface-500">
                    {vcBuffer ? `${formatTime(vcBuffer.duration)} · ${vcAudio.mime}` : (vcAudio.duration ? `${vcAudio.duration.toFixed(1)}s` : vcAudio.mime)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={toggleVcPlay} title={vcPlaying ? 'Pausar' : 'Escuchar completo'} className={`${CHIP} w-7 justify-center px-0`}>
                    {vcPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                  </button>
                  <button onClick={() => setVcAudio(null)} title="Reemplazar audio" className={`${CHIP} w-7 justify-center px-0`}>
                    <RotateCcw size={12} />
                  </button>
                  <button onClick={() => setVcAudio(null)} title="Quitar audio" className={`${CHIP} w-7 justify-center px-0 hover:!text-red-600 dark:hover:!text-red-300`}>
                    <X size={12} />
                  </button>
                </div>
              </div>

              {vcDecoding ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-surface-500">
                  <Loader size={16} className="animate-spin text-accent-400" />
                  <p className="text-[11px]">Procesando audio…</p>
                </div>
              ) : vcBuffer ? (
                <div className="flex-shrink-0">
                  <p className="eyebrow mb-2">Seleccioná el fragmento a convertir</p>
                  <AudioTrimEditor buffer={vcBuffer} onChange={(s, e) => setVcTrim({ start: s, end: e })} />
                  <p className="text-[10px] text-surface-600 mt-1.5">
                    Arrastrá los marcadores de inicio y fin; click para buscar. Solo la región elegida se envía a ElevenLabs.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-6 text-red-600 dark:text-red-400">
                  <AlertCircle size={16} />
                  <p className="text-[11px]">No se pudo decodificar el audio. Probá con otro archivo.</p>
                </div>
              )}
            </div>
          ) : (
            <div className={`flex-1 min-h-0 m-3 mb-1 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors ${dragOver ? 'border-accent-500/60 bg-accent-500/5' : 'border-surface-700/70'}`}>
              <div className="w-14 h-14 rounded-full bg-surface-800/80 border border-surface-700 flex items-center justify-center">
                <AudioLines size={24} className="text-surface-400" />
              </div>
              <div className="text-center">
                <p className="text-sm text-surface-200">Soltá un audio para cambiarle la voz</p>
                <p className="text-[11px] text-surface-500 mt-0.5">o elegí una fuente</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setShowAudioPicker(true)} className={CHIP}>
                  <Library size={12} className="text-accent-400" /> Biblioteca
                </button>
                <button onClick={() => uploadAudioRef.current?.click()} className={CHIP}>
                  <Upload size={12} className="text-blue-600 dark:text-blue-400" /> Subir
                </button>
                <button onClick={() => setShowRecorder(true)} className={`${CHIP} !bg-accent-600 hover:!bg-accent-500 !border-accent-500 !text-on-accent`}>
                  <Mic size={12} /> Grabar
                </button>
              </div>
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

          {/* Errors */}
          {(errorMessage || (voiceError && elevenlabsConfigured)) && (
            <div className="mx-3 mb-1.5 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-300">
              <AlertCircle size={12} className="flex-shrink-0" />
              <span className="text-[11px] truncate flex-1">{errorMessage || voiceError}</span>
              <button onClick={() => { onClearError(); setVoiceError('') }} className="text-red-600/60 hover:text-red-700 dark:text-red-300/60 dark:hover:text-red-200 flex-shrink-0">
                <X size={12} />
              </button>
            </div>
          )}

          {/* Bottom bar */}
          <div className="flex items-end gap-2 p-2 flex-shrink-0">
            <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 pl-1 pb-0.5">
              {/* Engine */}
              <Popover open={engineOpen} onOpenChange={setEngineOpen}>
                <PopoverTrigger asChild>
                  <button className={CHIP} title="Proveedor">
                    <span className="flex size-3.5 shrink-0 items-center justify-center">
                      <ProviderLogo provider={currentEngine?.id} size={13} />
                    </span>
                    <span className="text-surface-100">{currentEngine?.name}</span>
                    <ChevronDown size={11} className={`text-surface-400 transition-transform duration-150 ${engineOpen ? 'rotate-180 text-surface-200' : ''}`} />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" sideOffset={6} className={`${POPUP} w-56`}>
                  <div className={POPUP_TITLE}>Proveedor</div>
                  <div className="space-y-0.5">
                    {availableEngines.map((eng) => (
                      <SelectorOption
                        key={eng.id}
                        icon={<ProviderLogo provider={eng.id} size={15} />}
                        label={eng.name}
                        size="sm"
                        selected={eng.id === selectedEngine}
                        onClick={() => { setSelectedEngine(eng.id); setEngineOpen(false) }}
                      />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Model */}
              {!isVcMode && (selectedEngine === 'elevenlabs' ? modelOptions.length > 0 : providerModels.length > 0) && (
                <Popover open={modelOpen} onOpenChange={setModelOpen}>
                  <PopoverTrigger asChild>
                    <button className={`${CHIP} max-w-[200px]`} title="Modelo">
                      <span className="truncate">{currentModelLabel}</span>
                      <ChevronDown size={11} className={`text-surface-400 flex-shrink-0 transition-transform duration-150 ${modelOpen ? 'rotate-180 text-surface-200' : ''}`} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" sideOffset={6} className={`${POPUP} w-64`}>
                    <div className={POPUP_TITLE}>Modelo</div>
                    <div className="max-h-[300px] overflow-y-auto space-y-0.5">
                      {selectedEngine === 'elevenlabs'
                        ? modelOptions.map((m) => (
                          <SelectorOption
                            key={m.value}
                            icon={<ProviderLogo provider="elevenlabs" size={15} />}
                            label={m.label}
                            description={m.description}
                            size="sm"
                            selected={ttsModel === m.value}
                            onClick={() => { setTtsModel(m.value); setModelOpen(false) }}
                          />
                        ))
                        : providerModels.map((m) => {
                          const id = m.t2aId || m.name
                          return (
                            <SelectorOption
                              key={id}
                              icon={<ProviderLogo provider={selectedEngine} size={15} />}
                              label={m.name}
                              description={(PRESET_VOICES_BY_MODEL[id]?.length ? `${PRESET_VOICES_BY_MODEL[id].length} voces` : 'Voz nativa')}
                              size="sm"
                              selected={ttsModel === id}
                              onClick={() => { setTtsModel(id); setSelectedVoice(''); setModelOpen(false) }}
                            />
                          )
                        })}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Voice */}
              {hasVoiceChip ? (
                <Popover open={voiceOpen} onOpenChange={(o) => { setVoiceOpen(o); if (!o) setPreviewingId(null) }}>
                  <PopoverTrigger asChild>
                    <button
                      className={`${CHIP} max-w-[220px] ${needsVoice && !selectedVoice ? '!border-accent-500/50 !text-accent-200 shadow-[0_0_0_3px_rgb(var(--ink)/0.08)]' : ''}`}
                      title={selectedVoiceDetail || 'Voz'}
                    >
                      {selectedVoice ? (
                        <VoiceAvatar seed={selectedVoice} name={selectedVoiceName || selectedVoice} size={15} />
                      ) : (
                        <Mic size={12} className={needsVoice ? 'text-accent-300' : 'text-surface-400'} />
                      )}
                      <span className="truncate">
                        {selectedVoice ? (selectedVoiceName || `${selectedVoice.slice(0, 10)}…`) : needsVoice ? 'Elegir voz' : 'Voz automática'}
                      </span>
                      <ChevronDown size={11} className={`text-surface-400 flex-shrink-0 transition-transform duration-150 ${voiceOpen ? 'rotate-180 text-surface-200' : ''}`} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" sideOffset={6} className={`${POPUP} w-[340px] p-0 overflow-hidden`} onOpenAutoFocus={(e) => e.preventDefault()}>
                    <div className="p-1.5 border-b border-surface-800 bg-surface-950/50 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1 flex items-center">
                          <Search size={12} className="absolute left-2.5 text-surface-500" />
                          <input
                            value={voiceSearch}
                            onChange={(e) => setVoiceSearch(e.target.value)}
                            placeholder="Buscar voz..."
                            autoFocus
                            className="w-full bg-surface-800/90 text-xs text-surface-200 pl-7 pr-6 py-1.5 rounded-lg border border-surface-700/80 outline-none focus:border-accent-500 placeholder:text-surface-500 transition-colors"
                          />
                          {voiceSearch && (
                            <button onClick={() => setVoiceSearch('')} className="absolute right-2 text-surface-500 hover:text-surface-300">
                              <X size={12} />
                            </button>
                          )}
                        </div>
                        {selectedEngine === 'elevenlabs' && (
                          <button
                            onClick={() => setShowFavoritesOnly(v => !v)}
                            title={showFavoritesOnly ? 'Ver todas' : 'Solo favoritas'}
                            className={`flex-shrink-0 h-[30px] w-[30px] flex items-center justify-center rounded-lg border transition-colors ${showFavoritesOnly ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400' : 'border-surface-700/80 text-surface-500 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/30'}`}
                          >
                            <Star size={13} fill={showFavoritesOnly ? 'currentColor' : 'none'} />
                          </button>
                        )}
                      </div>
                      {selectedEngine === 'elevenlabs' && elevenlabsConfigured && (
                        <div className="grid grid-cols-3 gap-1.5">
                          <SearchableSelect value={voiceLang} onChange={setVoiceLang} options={languageOptions} placeholder="Idioma" />
                          <SearchableSelect
                            value={voiceAccent}
                            onChange={setVoiceAccent}
                            options={accentOptions.map((a) => ({ value: a, label: a }))}
                            placeholder="Acento"
                            disabled={!voiceLang}
                          />
                          <Select value={voiceGender || ANY} onValueChange={(v) => setVoiceGender(v === ANY ? '' : v)}>
                            <SelectTrigger className={`h-6 rounded-md px-1.5 text-[10px] gap-1 bg-surface-800/80 border-surface-700 [&>svg]:size-3 ${voiceGender ? 'border-accent-500/30 text-accent-300' : 'text-surface-300'}`} title="Género">
                              <SelectValue placeholder="Género" />
                            </SelectTrigger>
                            <SelectContent className="text-surface-200 max-h-56">
                              <SelectItem value={ANY} className="text-xs py-1">Cualquiera</SelectItem>
                              {genderOptions.map((g) => (
                                <SelectItem key={g} value={g} className="text-xs py-1">{g.charAt(0).toUpperCase() + g.slice(1)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {hasVoiceFilters && selectedEngine === 'elevenlabs' && (
                        <div className="flex items-center justify-between px-0.5">
                          <span className="text-[10px] text-surface-500 flex items-center gap-1.5">
                            {voicesRefreshing || searchPending
                              ? <><Loader size={10} className="animate-spin text-accent-400" /> Buscando en ElevenLabs…</>
                              : <>{filteredElevenLabsVoices.length}{elevenlabsHasMore ? '+' : ''} voces · incluye Voice Library</>}
                          </span>
                          <button onClick={() => { setVoiceSearch(''); setVoiceLang(''); setVoiceAccent(''); setVoiceGender('') }} className="text-[10px] text-accent-400 hover:text-accent-300 flex items-center gap-1">
                            <X size={10} /> Limpiar filtros
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="p-1">{voicePickerBody()}</div>
                  </PopoverContent>
                </Popover>
              ) : (
                <span className={`${CHIP} pointer-events-none text-surface-400`} title="Este modelo sintetiza con su voz nativa">
                  <Wand2 size={12} /> Voz nativa
                </span>
              )}

              {/* Settings */}
              {!isVcMode && (
                <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <PopoverTrigger asChild>
                    <button className={CHIP} title="Ajustes de voz">
                      <SlidersHorizontal size={12} className="text-surface-400" />
                      <span className="font-mono">{speed.toFixed(1)}x</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" sideOffset={6} className={`${POPUP} w-64 p-3`}>
                    <p className="eyebrow mb-3">Ajustes de voz</p>
                    <div className="space-y-3">
                      <SliderSetting
                        label="Velocidad"
                        value={speed}
                        onChange={setSpeed}
                        min={selectedEngine === 'elevenlabs' ? 0.7 : 0.5}
                        max={selectedEngine === 'elevenlabs' ? 1.2 : 2.0}
                        step={0.1}
                        fmt={(v) => `${v.toFixed(1)}x`}
                      />
                      {selectedEngine === 'elevenlabs' && (
                        <>
                          <SliderSetting label="Estabilidad" value={stability} onChange={setStability} min={0} max={1} step={0.05} />
                          <SliderSetting label="Similitud" value={similarityBoost} onChange={setSimilarityBoost} min={0} max={1} step={0.05} />
                          <SliderSetting label="Estilo" value={style} onChange={setStyle} min={0} max={1} step={0.05} />
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-surface-400">Speaker boost</span>
                            <button
                              onClick={() => setUseSpeakerBoost(v => !v)}
                              className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${useSpeakerBoost ? 'bg-accent-500' : 'bg-surface-700'}`}
                            >
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-canvas shadow-sm transition-all ${useSpeakerBoost ? 'left-[18px]' : 'left-0.5'}`} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              <div className="flex-1" />

              {/* Meta */}
              <span className="flex items-center gap-2 pr-1 text-[10px] text-surface-500 tabular-nums">
                {isGenerating && statusMessage ? (
                  <span className="text-accent-300 truncate max-w-[220px]">{statusMessage}</span>
                ) : blocker && blocker !== 'Escribí un texto' ? (
                  <span className="text-surface-400">{blocker}</span>
                ) : null}
                {!isVcMode && (
                  <span>
                    {charCount.toLocaleString()} car.{estSeconds > 0 && <> · ≈{formatTime(estSeconds)}</>}
                  </span>
                )}
              </span>
            </div>

            {/* Generate */}
            <div className="self-end shrink-0">
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                title={blocker || (isVcMode ? 'Cambiar voz' : 'Generar (Ctrl + Enter)')}
                className="flex-shrink-0 aspect-square w-16 h-16 p-1 flex flex-col items-center justify-center gap-1 bg-accent-600 hover:bg-accent-500 disabled:bg-accent-600/50 disabled:cursor-not-allowed text-on-accent rounded-xl font-medium transition-all active:scale-[0.97]"
              >
                {isGenerating ? <Loader size={16} className="animate-spin" /> : <Sparkles size={16} />}
                <span className="text-[10px] leading-none opacity-90">{isGenerating ? 'Generando' : 'Generar'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── History / playlist ── */}
      <VoiceHistorySidebar
        assets={voiceAssets}
        hasMore={hasMore}
        loadingMore={historyLoadingMore}
        loadMore={loadMore}
        sentinelRef={sentinelRef}
        resolveVoiceName={resolveAssetVoiceName}
        resolveModelLabel={resolveModelLabel}
        onRecreate={handleRecreate}
        isGenerating={isGenerating}
        statusMessage={statusMessage}
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
