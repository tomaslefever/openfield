import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Mic, Play, Pause, Loader, X,
  Download, AlertCircle, Check, Sparkles, Cpu, Cloud,
  Gauge, History, PanelRightClose, PanelRightOpen,
  ChevronDown, RefreshCw,
} from 'lucide-react'
import { srcUrl } from '../../services/file-url'

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

export function VoiceGenView({ onGenerate, voiceAssets, isGenerating, statusMessage, statusPct, errorMessage, onClearError }: VoiceGenViewProps) {
  const [selectedEngine, setSelectedEngine] = useState('gpt-tts')
  const [selectedVoice, setSelectedVoice] = useState('')
  const [speed, setSpeed] = useState(1.0)
  const [text, setText] = useState('')
  const [historyOpen, setHistoryOpen] = useState(true)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [engineOpen, setEngineOpen] = useState(false)
  const engineRef = useRef<HTMLDivElement>(null)
  const [piperInstalled, setPiperInstalled] = useState(false)
  const [kokoroInstalled, setKokoroInstalled] = useState(false)
  const [piperVoices, setPiperVoices] = useState<any[]>([])
  const [kokoroVoices, setKokoroVoices] = useState<any[]>([])
  const [installing, setInstalling] = useState(false)
  const [loadingVoices, setLoadingVoices] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const voiceRetryRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [audioVersion, setAudioVersion] = useState(0)

  // Load engine status on mount
  useEffect(() => {
    const api = (window as any).electronAPI
    api?.local?.piperIsInstalled?.().then(setPiperInstalled).catch(() => {})
    api?.local?.kokoroIsInstalled?.().then(setKokoroInstalled).catch(() => {})
  }, [])

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
  }, [selectedEngine, piperInstalled, kokoroInstalled])

  // Reset voice selection when engine changes
  useEffect(() => {
    setSelectedVoice('')
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

  const handleGenerate = () => {
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
    } else if (selectedEngine === 'gpt-tts') {
      params.model = 'gpt-tts-1'
    } else if (selectedEngine === 'minimax-tts') {
      params.model = 'minimax-text-to-speech'
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

  const engines: { id: string; name: string; provider: string; local: boolean }[] = [
    { id: 'gpt-tts', name: 'GPT TTS', provider: 'OpenAI', local: false },
    { id: 'minimax-tts', name: 'MiniMax TTS', provider: 'MiniMax', local: false },
    { id: 'piper', name: 'Piper', provider: 'Local', local: true },
    { id: 'kokoro', name: 'Kokoro', provider: 'Local', local: true },
  ]

  const needsInstall = (selectedEngine === 'piper' && !piperInstalled) || (selectedEngine === 'kokoro' && !kokoroInstalled)

  const charCount = text.length
  const canGenerate = text.trim().length > 0 && !isGenerating && (!needsInstall) && (selectedEngine === 'gpt-tts' || selectedEngine === 'minimax-tts' || !!selectedVoice)

  const voiceList: any[] = selectedEngine === 'piper' ? piperVoices : selectedEngine === 'kokoro' ? kokoroVoices : []

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Left panel - Engine + Voice selection */}
      <div className="w-72 border-r border-surface-800 flex flex-col min-h-0 bg-surface-950/80">
        <div className="p-4 border-b border-surface-800">
          <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-3">Engine</p>

          {/* XL Dropdown Selector */}
          <div ref={engineRef} className="relative">
            <button
              onClick={() => setEngineOpen(!engineOpen)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-left border ${
                engineOpen
                  ? 'bg-surface-800 border-accent-500/40 ring-1 ring-accent-500/20'
                  : 'bg-surface-900/60 border-surface-700 hover:border-surface-600'
              }`}
            >
              {(() => {
                const eng = engines.find(e => e.id === selectedEngine)!
                return (
                  <>
                    <div className="w-11 h-11 rounded-xl bg-surface-800 flex items-center justify-center flex-shrink-0">
                      {eng.local
                        ? <Cpu size={22} className="text-accent-400" />
                        : <Cloud size={22} className="text-accent-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{eng.name}</div>
                      <div className="text-[11px] text-surface-500">{eng.provider}{eng.local ? ' · Local' : ' · Cloud'}</div>
                    </div>
                    <ChevronDown size={18} className={`text-surface-500 transition-transform duration-200 ${engineOpen ? 'rotate-180' : ''}`} />
                  </>
                )
              })()}
            </button>

            {engineOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-surface-900 border border-surface-700 rounded-xl shadow-xl shadow-black/50 z-20 overflow-hidden">
                {engines.map((eng) => {
                  const isActive = eng.id === selectedEngine
                  return (
                    <button
                      key={eng.id}
                      onClick={() => { setSelectedEngine(eng.id); setEngineOpen(false) }}
                      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
                        isActive
                          ? 'bg-accent-500/10 text-accent-400'
                          : 'text-surface-300 hover:bg-surface-800'
                      } ${eng !== engines[engines.length - 1] ? 'border-b border-surface-800' : ''}`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isActive ? 'bg-accent-500/20' : 'bg-surface-800'
                      }`}>
                        {eng.local
                          ? <Cpu size={18} className={isActive ? 'text-accent-400' : 'text-surface-500'} />
                          : <Cloud size={18} className={isActive ? 'text-accent-400' : 'text-surface-500'} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{eng.name}</div>
                        <div className="text-[11px] text-surface-500">{eng.provider}{eng.local ? ' · Local' : ' · Cloud'}</div>
                      </div>
                      {isActive && <Check size={16} className="flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

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

        {/* Speed control for local engines */}
        {(selectedEngine === 'piper' || selectedEngine === 'kokoro') && !needsInstall && (
          <div className="p-4 border-t border-surface-800">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-surface-500 uppercase tracking-wider flex items-center gap-1.5">
                <Gauge size={12} /> Speed
              </p>
              <span className="text-xs text-surface-400 font-mono">{speed.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={speed}
              onChange={e => setSpeed(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-surface-700 rounded-full appearance-none cursor-pointer accent-accent-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-500"
            />
          </div>
        )}
      </div>

      {/* Center - Text area + Generate */}
      <div className="flex-1 flex flex-col min-h-0 p-4">
        <div className="flex-1 flex flex-col min-h-0">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={
              selectedEngine === 'piper' && !selectedVoice ? 'Select a voice first...' :
              selectedEngine === 'kokoro' && !selectedVoice ? 'Select a voice first...' :
              'Type the text you want to convert to speech...\n\nYou can paste long texts, scripts, articles — the AI will generate natural-sounding speech from your text.'
            }
            disabled={isGenerating || (selectedEngine === 'piper' && !piperInstalled) || (selectedEngine === 'kokoro' && !kokoroInstalled)}
            className="flex-1 w-full bg-surface-900/60 border border-surface-700/60 rounded-xl p-5 text-sm text-surface-100 placeholder-surface-500 resize-none focus:outline-none focus:border-accent-500/40 focus:ring-1 focus:ring-accent-500/20 transition-all min-h-0 disabled:opacity-50"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-[11px] text-surface-500">{charCount.toLocaleString()} characters</span>
            {errorMessage && (
              <div className="flex items-center gap-1.5 text-red-400">
                <AlertCircle size={12} />
                <span className="text-[11px]">{errorMessage}</span>
                <button onClick={onClearError} className="text-red-400/60 hover:text-red-300">
                  <X size={12} />
                </button>
              </div>
            )}
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
                             asset.modelUsed === 'gpt-tts-1' ? 'GPT TTS' :
                             asset.modelUsed === 'minimax-text-to-speech' ? 'MiniMax TTS' :
                             asset.modelUsed || '—'}
                          </span>
                        </div>
                      </div>
                      <WaveformBars playing={playingId === asset.id} />
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
    </div>
  )
}
