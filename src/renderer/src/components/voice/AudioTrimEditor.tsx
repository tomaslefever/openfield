import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Scissors } from 'lucide-react'
import { audioBufferToBase64, formatTime, sliceAudioBuffer } from '../../lib/wav'

interface AudioTrimEditorProps {
  buffer: AudioBuffer
  onChange: (start: number, end: number) => void
}

const MIN_REGION = 0.2

export function AudioTrimEditor({ buffer, onChange }: AudioTrimEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(buffer.duration)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [hoverHandle, setHoverHandle] = useState<'start' | 'end' | null>(null)
  const rafRef = useRef<number>(0)
  const dragRef = useRef<'start' | 'end' | null>(null)
  const peaksRef = useRef<number[]>([])

  const url = useMemo(() => {
    const { base64, mime } = audioBufferToBase64(buffer)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return URL.createObjectURL(new Blob([bytes], { type: mime }))
  }, [buffer])

  // Compute waveform peaks once
  useEffect(() => {
    const channel = buffer.numberOfChannels > 0 ? buffer.getChannelData(0) : new Float32Array(0)
    const cols = 400
    const peaks: number[] = []
    const block = Math.max(1, Math.floor(channel.length / cols))
    for (let i = 0; i < cols; i++) {
      const from = i * block
      const to = Math.min(channel.length, from + block)
      let max = 0
      for (let j = from; j < to; j++) {
        const v = Math.abs(channel[j])
        if (v > max) max = v
      }
      peaks.push(max)
    }
    peaksRef.current = peaks
  }, [buffer])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const dpr = window.devicePixelRatio || 1
    const w = container.clientWidth
    const h = 96
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#121215'
    ctx.fillRect(0, 0, w, h)

    const dur = Math.max(0.001, buffer.duration)
    const toX = (t: number) => (t / dur) * w
    const startX = toX(start)
    const endX = toX(end)

    // Selected region
    ctx.fillStyle = 'rgba(99, 102, 241, 0.16)'
    ctx.fillRect(startX, 0, endX - startX, h)

    // Waveform
    const peaks = peaksRef.current
    const mid = h / 2
    ctx.fillStyle = '#3f3f46'
    for (let i = 0; i < peaks.length; i++) {
      const x = (i / peaks.length) * w
      const amp = Math.max(1, peaks[i] * (h / 2))
      const inRegion = x >= startX && x <= endX
      if (inRegion) ctx.fillStyle = '#818cf8'
      else ctx.fillStyle = '#3f3f46'
      ctx.fillRect(x, mid - amp / 2, Math.max(1, w / peaks.length), amp)
    }

    // Playhead
    if (playing || currentTime > 0) {
      const px = toX(currentTime)
      ctx.fillStyle = '#f4f4f5'
      ctx.fillRect(px - 0.5, 0, 1, h)
    }

    // Markers
    const drawMarker = (x: number, color: string) => {
      ctx.fillStyle = color
      ctx.fillRect(x - 1.5, 0, 3, h)
      ctx.beginPath()
      ctx.moveTo(x - 7, 0)
      ctx.lineTo(x + 7, 0)
      ctx.lineTo(x, 10)
      ctx.closePath()
      ctx.fill()
    }
    drawMarker(startX, '#22d3ee')
    drawMarker(endX, '#f472b6')
  }, [buffer, start, end, playing, currentTime])

  useEffect(() => {
    draw()
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [draw])

  // Playhead animation
  useEffect(() => {
    if (!playing) return
    const tick = () => {
      const el = audioRef.current
      if (el) setCurrentTime(el.currentTime)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing])

  const clamp = (sec: number) => Math.max(0, Math.min(buffer.duration, sec))

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const dur = buffer.duration
    const sec = (x / rect.width) * dur
    const startX = (start / dur) * rect.width
    const endX = (end / dur) * rect.width
    if (Math.abs(x - startX) <= 8) {
      dragRef.current = 'start'
      setHoverHandle('start')
    } else if (Math.abs(x - endX) <= 8) {
      dragRef.current = 'end'
      setHoverHandle('end')
    } else {
      // Click: seek
      const el = audioRef.current
      if (el) {
        el.currentTime = clamp(sec)
        setCurrentTime(clamp(sec))
        if (!playing) play()
      }
      return
    }
    canvas.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const dur = buffer.duration
    const startX = (start / dur) * rect.width
    const endX = (end / dur) * rect.width

    if (dragRef.current) {
      const sec = clamp(((e.clientX - rect.left) / rect.width) * buffer.duration)
      if (dragRef.current === 'start') {
        const next = Math.min(sec, end - MIN_REGION)
        setStart(next)
      } else {
        const next = Math.max(sec, start + MIN_REGION)
        setEnd(next)
      }
      return
    }

    // Cursor feedback: resize cursor over the markers, crosshair elsewhere
    if (Math.abs(x - startX) <= 8) setHoverHandle('start')
    else if (Math.abs(x - endX) <= 8) setHoverHandle('end')
    else setHoverHandle(null)
  }

  const handlePointerUp = () => {
    dragRef.current = null
  }

  const handlePointerLeave = () => {
    if (!dragRef.current) setHoverHandle(null)
  }

  const play = () => {
    const el = audioRef.current
    if (!el) return
    el.currentTime = start
    el.play().then(() => setPlaying(true)).catch(() => {})
  }

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      setPlaying(false)
      return
    }
    if (currentTime >= end || currentTime < start) el.currentTime = start
    play()
  }

  const applyTrim = () => {
    onChange(start, end)
  }

  useEffect(() => {
    onChange(start, end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end])

  return (
    <div>
      <div ref={containerRef} className="relative select-none touch-none">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          className="w-full h-24 rounded-lg block"
          style={{ cursor: hoverHandle || dragRef.current ? 'ew-resize' : 'crosshair' }}
        />
        {/* Time labels under markers */}
        <div className="absolute -bottom-4 left-0 text-[9px] font-mono text-cyan-400 pointer-events-none">{formatTime(start)}</div>
        <div className="absolute -bottom-4 right-0 text-[9px] font-mono text-pink-400 pointer-events-none">{formatTime(end)}</div>
      </div>

      <div className="flex items-center justify-between mt-5">
        <div className="flex items-center gap-2">
          <button
            onClick={togglePlay}
            className="w-8 h-8 rounded-full bg-accent-600 hover:bg-accent-500 text-white flex items-center justify-center transition-colors"
            title={playing ? 'Pause' : 'Play selection'}
          >
            {playing ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
          </button>
          <span className="text-[10px] text-surface-500 font-mono">
            {formatTime(Math.max(0, end - start))} selected
          </span>
        </div>
        <button
          onClick={applyTrim}
          className="px-3 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-300 text-[11px] font-medium transition-colors flex items-center gap-1.5"
          title="Trim the file to the selected region"
        >
          <Scissors size={11} /> Trim to selection
        </button>
      </div>

      <audio
        ref={audioRef}
        src={url}
        className="hidden"
        onEnded={() => { setPlaying(false); setCurrentTime(end) }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => {
          const el = audioRef.current
          if (el && el.currentTime >= end) {
            el.pause()
            setCurrentTime(end)
          }
        }}
      />
    </div>
  )
}
