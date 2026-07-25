import { useState, useRef, useCallback, useEffect } from 'react'
import { Minus, Plus } from 'lucide-react'

interface StreamDurationProps {
  value: number
  options?: string[]
  min?: number
  max?: number
  onChange: (value: number) => void
}

export function StreamDuration({ value, options, min = 4, max = 15, onChange }: StreamDurationProps) {
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startValue = useRef(0)

  const values = options ? options.map(Number) : Array.from({ length: max - min + 1 }, (_, i) => min + i)
  const currentIdx = values.indexOf(value)
  const canDecrease = currentIdx > 0
  const canIncrease = currentIdx < values.length - 1

  const step = (dir: number) => {
    const idx = values.indexOf(value)
    if (idx >= 0) {
      const next = values[idx + dir]
      if (next !== undefined) onChange(next)
    }
  }

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true)
    startX.current = e.clientX
    startValue.current = values.indexOf(value)
  }, [value, values])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging) return
    const delta = e.clientX - startX.current
    const stepCount = Math.round(delta / 30)
    const newIdx = Math.max(0, Math.min(values.length - 1, startValue.current + stepCount))
    if (values[newIdx] !== value) onChange(values[newIdx])
  }, [dragging, value, values, onChange])

  const handleMouseUp = useCallback(() => {
    setDragging(false)
  }, [])

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragging, handleMouseMove, handleMouseUp])

  return (
    <div className="flex items-center gap-0.5 bg-surface-800/80 rounded-lg p-0.5 select-none">
      <button
        onClick={() => step(-1)}
        disabled={!canDecrease}
        className="w-5 h-5 rounded flex items-center justify-center text-surface-500 hover:text-surface-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <Minus size={10} />
      </button>
      <span
        onMouseDown={handleMouseDown}
        className={`px-1.5 py-0.5 rounded text-[11px] font-medium min-w-[26px] text-center cursor-ew-resize transition-colors ${
          dragging ? 'text-accent-400 bg-surface-700' : 'text-surface-300'
        }`}
      >
        {value}s
      </span>
      <button
        onClick={() => step(1)}
        disabled={!canIncrease}
        className="w-5 h-5 rounded flex items-center justify-center text-surface-500 hover:text-surface-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <Plus size={10} />
      </button>
    </div>
  )
}
