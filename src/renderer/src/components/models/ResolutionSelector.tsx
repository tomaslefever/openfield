import { ChevronDown } from 'lucide-react'
import { ModelPricing } from '../../lib/models'

interface Props {
  model?: ModelPricing
  value: string
  onChange: (res: string) => void
  disabled?: boolean
  className?: string
  compact?: boolean
}

export function ResolutionSelector({
  model,
  value,
  onChange,
  disabled = false,
  className = '',
  compact = false,
}: Props) {
  const options = model?.resolutions || model?.prices?.map(p => p.resolution) || ['720p', '1080p']

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <div
        className={`flex items-center gap-1 bg-surface-900/90 border border-surface-700/80 hover:border-surface-600 rounded-lg text-surface-300 font-mono transition-colors ${
          compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
        } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <span>{value || options[0] || 'Res'}</span>
        <ChevronDown size={11} className="text-surface-500 ml-0.5" />
      </div>

      <select
        value={value || options[0]}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
      >
        {options.map(opt => (
          <option key={opt} value={opt} className="bg-surface-900 text-surface-100">
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}
