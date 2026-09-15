import { RectangleHorizontal, Smartphone, Square } from 'lucide-react'

export interface AspectRatioOption {
  value: string
  label: string
  icon: typeof Smartphone
  desc: string
}

export const COMMON_ASPECT_RATIOS: AspectRatioOption[] = [
  { value: '9:16', label: '9:16', icon: Smartphone, desc: 'Vertical (TikTok / Shorts / Reels / Drama)' },
  { value: '16:9', label: '16:9', icon: RectangleHorizontal, desc: 'Horizontal (Cinema / YouTube)' },
  { value: '1:1', label: '1:1', icon: Square, desc: 'Cuadrado (Instagram Feed)' },
]

interface Props {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  compact?: boolean
}

export function AspectRatioSelector({
  value,
  onChange,
  disabled = false,
  className = '',
  compact = false,
}: Props) {
  return (
    <div className={`flex items-center gap-1 bg-surface-900/90 border border-surface-800 rounded-lg p-0.5 ${className}`}>
      {COMMON_ASPECT_RATIOS.map(item => {
        const isSelected = value === item.value
        const Icon = item.icon
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            disabled={disabled}
            title={item.desc}
            className={`flex items-center gap-1.5 rounded-md transition-all ${
              compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-xs'
            } ${
              isSelected
                ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30 font-medium'
                : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/60'
            } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <Icon size={compact ? 11 : 13} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
