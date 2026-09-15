import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Volume2,
  Play,
  Square,
  Search,
  Check,
  ChevronDown,
  RefreshCw,
  Sparkles,
  Mic,
  Sliders,
} from 'lucide-react'

export interface VoiceOption {
  id: string
  name: string
  gender?: string
  accent?: string
  language?: string
  category?: string
  previewUrl?: string
  provider?: 'elevenlabs' | 'kie' | 'system'
}

const FALLBACK_PRESET_VOICES: VoiceOption[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'Femenino', accent: 'American', category: 'Narrativo / Cálido', provider: 'elevenlabs' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'Femenino', accent: 'American', category: 'Fuerte / Expresivo', provider: 'elevenlabs' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', gender: 'Femenino', accent: 'American', category: 'Suave / Emocional', provider: 'elevenlabs' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'Masculino', accent: 'American', category: 'Claro / Convincente', provider: 'elevenlabs' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'Masculino', accent: 'American', category: 'Profundo / Narrativo', provider: 'elevenlabs' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', gender: 'Masculino', accent: 'American', category: 'Dramático', provider: 'elevenlabs' },
  { id: 'male-qn-qingse', name: 'Joven Dramático (KIE)', gender: 'Masculino', category: 'Dramático', provider: 'kie' },
  { id: 'male-qn-jingying', name: 'Hombre Maduro / Narrador (KIE)', gender: 'Masculino', category: 'Narrador', provider: 'kie' },
  { id: 'female-shaonv', name: 'Joven Emocional (KIE)', gender: 'Femenino', category: 'Emocional', provider: 'kie' },
  { id: 'female-yujie', name: 'Mujer Madura / Autoritaria (KIE)', gender: 'Femenino', category: 'Autoritaria', provider: 'kie' },
  { id: 'presenter_male', name: 'Locutor / Enigmático (KIE)', gender: 'Masculino', category: 'Enigmático', provider: 'kie' },
  { id: 'presenter_female', name: 'Locutora / Suspenso (KIE)', gender: 'Femenino', category: 'Suspenso', provider: 'kie' },
]

// Global cache for ElevenLabs voices across components
let cachedElevenLabsVoices: VoiceOption[] | null = null
let isFetchingVoices = false
const voiceListeners: Array<(voices: VoiceOption[]) => void> = []

interface Props {
  value?: string
  onChange: (voiceId: string, voiceName?: string) => void
  disabled?: boolean
  className?: string
  dropUp?: boolean
  placeholder?: string
  compact?: boolean
}

export function VoiceSelectorDropdown({
  value,
  onChange,
  disabled = false,
  className = '',
  dropUp = false,
  placeholder = 'Seleccionar voz...',
  compact = false,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [voices, setVoices] = useState<VoiceOption[]>(cachedElevenLabsVoices || FALLBACK_PRESET_VOICES)
  const [isLoading, setIsLoading] = useState(false)
  const [isSearchingApi, setIsSearchingApi] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Fetch ElevenLabs voices via API
  const fetchVoices = async (force = false) => {
    if (cachedElevenLabsVoices && !force) {
      setVoices(cachedElevenLabsVoices)
      return
    }

    if (isFetchingVoices) {
      voiceListeners.push(setVoices)
      return
    }

    const api = (window as any).electronAPI
    if (!api?.elevenlabs?.voices) return

    isFetchingVoices = true
    setIsLoading(true)

    try {
      const res = await api.elevenlabs.voices({ pageSize: 100 })
      if (res?.voices && Array.isArray(res.voices) && res.voices.length > 0) {
        const mapped: VoiceOption[] = res.voices.map((v: any) => ({
          id: v.id,
          name: v.label || v.name || v.id,
          gender: v.gender,
          accent: v.accent,
          language: v.language,
          category: v.category || v.detail,
          previewUrl: v.previewUrl || v.preview_url,
          provider: 'elevenlabs',
        }))

        // Merge with KIE presets
        const combined = [
          ...mapped,
          ...FALLBACK_PRESET_VOICES.filter((p) => p.provider === 'kie'),
        ]

        cachedElevenLabsVoices = combined
        setVoices(combined)
        voiceListeners.forEach((fn) => fn(combined))
        voiceListeners.length = 0
      }
    } catch (err) {
      console.warn('[VoiceSelector] Could not fetch ElevenLabs voices:', err)
      // Keep fallbacks
      setVoices(FALLBACK_PRESET_VOICES)
    } finally {
      setIsLoading(false)
      isFetchingVoices = false
    }
  }

  useEffect(() => {
    fetchVoices()
  }, [])

  // Debounced search directly against ElevenLabs API
  useEffect(() => {
    const trimmed = search.trim()
    if (!trimmed || trimmed.length < 2) return

    const timer = setTimeout(async () => {
      const api = (window as any).electronAPI
      if (!api?.elevenlabs?.voices) return

      setIsSearchingApi(true)
      try {
        const res = await api.elevenlabs.voices({ search: trimmed, pageSize: 50, searchLibrary: true })
        if (res?.voices && Array.isArray(res.voices) && res.voices.length > 0) {
          const mapped: VoiceOption[] = res.voices.map((v: any) => ({
            id: v.id,
            name: v.label || v.name || v.id,
            gender: v.gender,
            accent: v.accent,
            language: v.language,
            category: v.category || v.detail,
            previewUrl: v.previewUrl || v.preview_url,
            provider: 'elevenlabs',
          }))

          setVoices((prev) => {
            const seen = new Set(prev.map((x) => x.id))
            const newOnes = mapped.filter((m) => !seen.has(m.id))
            if (newOnes.length === 0) return prev
            const next = [...prev, ...newOnes]
            cachedElevenLabsVoices = next
            return next
          })
        }
      } catch (err) {
        console.warn('[VoiceSelector] ElevenLabs API search notice:', err)
      } finally {
        setIsSearchingApi(false)
      }
    }, 350)

    return () => clearTimeout(timer)
  }, [search])

  // Close on click outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        stopAudio()
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside)
    }
  }, [isOpen])

  // Stop audio when unmounting
  useEffect(() => {
    return () => {
      stopAudio()
    }
  }, [])

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setPlayingId(null)
  }

  const handlePlayPreview = (e: React.MouseEvent, voice: VoiceOption) => {
    e.stopPropagation()
    if (!voice.previewUrl) return

    if (playingId === voice.id) {
      stopAudio()
      return
    }

    stopAudio()
    const audio = new Audio(voice.previewUrl)
    audioRef.current = audio
    setPlayingId(voice.id)

    audio.play().catch((err) => {
      console.warn('[VoiceSelector] Audio preview failed:', err)
      setPlayingId(null)
    })

    audio.onended = () => {
      setPlayingId(null)
    }
    audio.onerror = () => {
      setPlayingId(null)
    }
  }

  // Selected voice object
  const selectedVoice = useMemo(() => {
    if (!value) return null
    return voices.find((v) => v.id === value) || {
      id: value,
      name: value,
      provider: value.length > 15 ? 'elevenlabs' : 'kie',
    } as VoiceOption
  }, [voices, value])

  // Filtered voice list by search
  const filteredVoices = useMemo(() => {
    if (!search.trim()) return voices
    const q = search.toLowerCase().trim()
    return voices.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.gender && v.gender.toLowerCase().includes(q)) ||
        (v.accent && v.accent.toLowerCase().includes(q)) ||
        (v.category && v.category.toLowerCase().includes(q)) ||
        (v.language && v.language.toLowerCase().includes(q)) ||
        (v.provider && v.provider.toLowerCase().includes(q))
    )
  }, [voices, search])

  // Group by provider
  const elevenlabsList = useMemo(() => filteredVoices.filter((v) => v.provider === 'elevenlabs'), [filteredVoices])
  const kieList = useMemo(() => filteredVoices.filter((v) => v.provider === 'kie'), [filteredVoices])

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-2 rounded-lg bg-surface-900 border border-surface-700/80 hover:border-surface-600 focus:border-accent-500/60 transition-colors shadow-sm text-left ${
          compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} text-surface-200 w-full`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Mic size={compact ? 12 : 13} className="text-accent-400 flex-shrink-0" />
          <span className="truncate font-medium text-surface-100">
            {selectedVoice ? selectedVoice.name : placeholder}
          </span>
          {selectedVoice?.gender && (
            <span className="text-[9px] text-surface-400 bg-surface-800 px-1.5 py-0.2 rounded border border-surface-700/60 hidden sm:inline flex-shrink-0">
              {selectedVoice.gender}
            </span>
          )}
          {selectedVoice?.provider === 'elevenlabs' && (
            <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20 hidden md:inline flex-shrink-0">
              11Labs
            </span>
          )}
        </div>

        <ChevronDown
          size={12}
          className={`text-surface-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute z-50 w-72 md:w-80 bg-surface-900 border border-surface-700 rounded-xl shadow-2xl overflow-hidden flex flex-col ${
            dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } right-0`}
          style={{ maxHeight: '340px' }}
        >
          {/* Header & Search */}
          <div className="p-2 border-b border-surface-800 bg-surface-950/60 flex items-center gap-2">
            <div className="relative flex-1">
              {isSearchingApi ? (
                <RefreshCw size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent-400 animate-spin" />
              ) : (
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
              )}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar local o en ElevenLabs API..."
                className="w-full bg-surface-900 border border-surface-700 rounded-lg pl-8 pr-2.5 py-1 text-xs text-surface-200 placeholder-surface-500 focus:outline-none focus:border-accent-500/50"
                autoFocus
              />
            </div>

            <button
              type="button"
              onClick={() => fetchVoices(true)}
              disabled={isLoading || isSearchingApi}
              title="Recargar voces desde ElevenLabs"
              className="p-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
            >
              <RefreshCw size={12} className={isLoading ? 'animate-spin text-accent-400' : ''} />
            </button>
          </div>

          {/* Voices List */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-2 max-h-64">
            {isSearchingApi && (
              <div className="px-2 py-1 text-[10px] text-accent-400 bg-accent-500/10 border border-accent-500/20 rounded flex items-center gap-1.5 animate-pulse">
                <RefreshCw size={10} className="animate-spin flex-shrink-0" />
                <span>Buscando coincidencias en ElevenLabs API...</span>
              </div>
            )}
            {/* ElevenLabs Group */}
            {elevenlabsList.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Voces ElevenLabs ({elevenlabsList.length})</span>
                  <span className="text-[9px] text-surface-500 font-normal">HD TTS</span>
                </div>

                <div className="space-y-0.5 mt-0.5">
                  {elevenlabsList.map((voice) => {
                    const isSelected = voice.id === value
                    const isPlaying = playingId === voice.id

                    return (
                      <div
                        key={voice.id}
                        onClick={() => {
                          onChange(voice.id, voice.name)
                          setIsOpen(false)
                          stopAudio()
                        }}
                        className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors group ${
                          isSelected
                            ? 'bg-accent-500/20 text-accent-200 border border-accent-500/30'
                            : 'hover:bg-surface-800/80 text-surface-300 hover:text-surface-100'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-surface-100 truncate">{voice.name}</span>
                            {isSelected && <Check size={12} className="text-accent-400 flex-shrink-0" />}
                          </div>

                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-[10px] text-surface-500">
                            {voice.gender && <span>{voice.gender}</span>}
                            {voice.accent && <span>· {voice.accent}</span>}
                            {voice.category && <span className="truncate">· {voice.category}</span>}
                          </div>
                        </div>

                        {/* Audio Preview Button */}
                        {voice.previewUrl && (
                          <button
                            type="button"
                            onClick={(e) => handlePlayPreview(e, voice)}
                            title={isPlaying ? 'Pausar audio de muestra' : 'Escuchar muestra de voz'}
                            className={`p-1.5 rounded-full flex-shrink-0 transition-colors ${
                              isPlaying
                                ? 'bg-accent-500 text-white'
                                : 'bg-surface-800 hover:bg-accent-600/30 text-surface-400 hover:text-accent-300'
                            }`}
                          >
                            {isPlaying ? <Square size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* KIE / Standard Presets Group */}
            {kieList.length > 0 && (
              <div className="pt-1 border-t border-surface-800/80">
                <div className="px-2 py-1 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">
                  Voces Predefinidas KIE ({kieList.length})
                </div>

                <div className="space-y-0.5 mt-0.5">
                  {kieList.map((voice) => {
                    const isSelected = voice.id === value
                    return (
                      <div
                        key={voice.id}
                        onClick={() => {
                          onChange(voice.id, voice.name)
                          setIsOpen(false)
                          stopAudio()
                        }}
                        className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-accent-500/20 text-accent-200 border border-accent-500/30'
                            : 'hover:bg-surface-800/80 text-surface-300 hover:text-surface-100'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-surface-100">{voice.name}</span>
                            {isSelected && <Check size={12} className="text-accent-400" />}
                          </div>
                          {voice.category && (
                            <span className="text-[10px] text-surface-500 block">{voice.category}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {filteredVoices.length === 0 && (
              <div className="p-4 text-center text-xs text-surface-500">
                {isSearchingApi
                  ? 'Buscando voces en ElevenLabs API...'
                  : `No se encontraron voces que coincidan con "${search}"`}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
