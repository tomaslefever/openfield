import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Square, Play, Pause, Loader, X, Check, RotateCcw, Scissors, AlertCircle } from 'lucide-react'
import { audioBufferToBase64, formatTime } from '../../lib/wav'

interface RecorderModalProps {
  onClose: () => void
  onConfirm: (audio: { base64: string; mime: string; fileName: string; duration?: number }) => void
}

export function RecorderModal({ onClose, onConfirm }: RecorderModalProps) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'processing' | 'review'>('idle')
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const previewRef = useRef<HTMLAudioElement | null>(null)

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }

  const cleanup = () => {
    stopTimer()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
    if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null }
  }

  useEffect(() => () => { cleanup() }, [])

  const startRecording = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        setPhase('processing')
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
          const arrayBuffer = await blob.arrayBuffer()
          const audioCtx = audioCtxRef.current || new AudioContext({ sampleRate: 44100 })
          audioCtxRef.current = audioCtx
          const decoded = await audioCtx.decodeAudioData(arrayBuffer)
          bufferRef.current = decoded
          setDuration(decoded.duration)
          setTrimStart(0)
          setTrimEnd(decoded.duration)
          setPhase('review')
        } catch {
          setError('No se pudo procesar la grabación. Intentá de nuevo.')
          setPhase('idle')
        }
      }
      recorder.start()
      setPhase('recording')
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    } catch {
      setError('No se pudo acceder al micrófono. Revisá los permisos del sistema.')
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    stopTimer()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const refreshPreviewUrl = useCallback((buffer: AudioBuffer) => {
    const { base64, mime } = audioBufferToBase64(buffer)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: mime })
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(blob)
    previewUrlRef.current = url
    return url
  }, [])

  const playPreview = () => {
    const el = previewRef.current
    if (!el) return
    el.currentTime = trimStart
    el.play().then(() => setPlaying(true)).catch(() => {})
  }

  const pausePreview = () => { previewRef.current?.pause(); setPlaying(false) }

  const togglePreview = () => { playing ? pausePreview() : playPreview() }

  const applyTrim = () => {
    const buf = bufferRef.current
    if (!buf) return
    const startSample = Math.floor(Math.min(trimStart, trimEnd) * buf.sampleRate)
    const endSample = Math.floor(Math.max(trimStart, trimEnd) * buf.sampleRate)
    if (endSample - startSample < 0.1 * buf.sampleRate) {
      setError('El recorte debe tener al menos 0.1s.')
      return
    }
    const channels = Array.from({ length: buf.numberOfChannels }, (_, ch) =>
      buf.getChannelData(ch).slice(startSample, endSample)
    )
    const trimmed = new AudioBuffer({
      numberOfChannels: buf.numberOfChannels,
      length: channels[0].length,
      sampleRate: buf.sampleRate,
    })
    channels.forEach((data, ch) => trimmed.copyToChannel(data, ch))
    bufferRef.current = trimmed
    setDuration(trimmed.duration)
    setTrimStart(0)
    setTrimEnd(trimmed.duration)
    refreshPreviewUrl(trimmed)
  }

  const resetRecording = () => {
    pausePreview()
    bufferRef.current = null
    setDuration(0)
    setTrimStart(0)
    setTrimEnd(0)
    setPhase('idle')
  }

  const confirm = () => {
    const buf = bufferRef.current
    if (!buf) return
    const { base64, mime } = audioBufferToBase64(buf)
    onConfirm({ base64, mime, fileName: `recording-${Date.now()}.wav`, duration: buf.duration })
  }

  const trimPct = trimEnd > trimStart && duration > 0 ? Math.round(((trimEnd - trimStart) / duration) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="bg-surface-950 border border-surface-800 rounded-2xl w-[420px] max-w-[92vw] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-surface-100 flex items-center gap-2">
            <Mic size={15} className="text-accent-400" /> Record audio
          </p>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-surface-500 hover:text-white hover:bg-surface-800 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Timer / status */}
        <div className="flex flex-col items-center gap-3 py-4">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center border-2 transition-colors ${phase === 'recording' ? 'border-red-500 text-red-400 animate-pulse' : 'border-surface-700 text-surface-400'}`}>
            {phase === 'recording' ? <Square size={22} className="fill-current" /> : <Mic size={26} />}
          </div>
          <p className="text-2xl font-mono text-surface-200 tabular-nums">
            {phase === 'recording' ? formatTime(elapsed) : phase === 'review' ? formatTime(duration) : '0:00'}
          </p>
          <p className="text-[11px] text-surface-500">
            {phase === 'recording' ? 'Recording... click Stop to finish' :
             phase === 'processing' ? 'Processing...' :
             phase === 'review' ? 'Review, trim and confirm' :
             'Click Record to start'}
          </p>
          {error && <p className="text-[11px] text-red-400 flex items-center gap-1"><AlertCircle size={11} /> {error}</p>}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-2 mb-3">
          {phase === 'idle' && (
            <button onClick={startRecording} className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5">
              <Mic size={13} /> Record
            </button>
          )}
          {phase === 'recording' && (
            <button onClick={stopRecording} className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5">
              <Square size={12} className="fill-current" /> Stop
            </button>
          )}
          {phase === 'processing' && (
            <span className="flex items-center gap-2 text-xs text-surface-400">
              <Loader size={14} className="animate-spin text-accent-400" /> Procesando...
            </span>
          )}
          {phase === 'review' && (
            <>
              <button onClick={togglePreview} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5">
                {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : 'Play'}
              </button>
              <button onClick={resetRecording} title="Record again" className="px-3 py-2 bg-surface-800 hover:bg-surface-700 text-surface-300 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5">
                <RotateCcw size={12} /> Record again
              </button>
            </>
          )}
        </div>

        {/* Trim */}
        {phase === 'review' && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-surface-500 uppercase tracking-wider flex items-center gap-1"><Scissors size={10} /> Trim</p>
              <div className="flex items-center gap-1 text-[10px] text-surface-500 font-mono">
                <span>{formatTime(trimStart)}</span> – <span>{formatTime(trimEnd)}</span>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, duration)}
              step={0.01}
              value={trimStart}
              onChange={(e) => setTrimStart(Math.min(Number(e.target.value), trimEnd - 0.1))}
              className="w-full h-1.5 bg-surface-700 rounded-full appearance-none cursor-pointer accent-accent-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-500"
            />
            <input
              type="range"
              min={0}
              max={Math.max(0.1, duration)}
              step={0.01}
              value={trimEnd}
              onChange={(e) => setTrimEnd(Math.max(Number(e.target.value), trimStart + 0.1))}
              className="w-full h-1.5 bg-surface-700 rounded-full appearance-none cursor-pointer accent-accent-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-500 mt-1.5"
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] text-surface-600">{Math.round(trimPct)}% kept</span>
              <button onClick={applyTrim} className="text-[10px] text-accent-400 hover:text-accent-300 flex items-center gap-1">
                <Scissors size={10} /> Apply trim
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        {phase === 'review' && (
          <div className="flex items-center gap-2 justify-end border-t border-surface-800 pt-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs text-surface-400 hover:text-surface-200 transition-colors">Cancel</button>
            <button onClick={confirm} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5">
              <Check size={12} /> Use this audio
            </button>
          </div>
        )}

        <audio
          ref={previewRef}
          className="hidden"
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={() => setCurrentTime(previewRef.current?.currentTime || 0)}
          onLoadedMetadata={() => { if (previewRef.current) previewRef.current.currentTime = trimStart }}
        />
      </div>
    </div>
  )
}
