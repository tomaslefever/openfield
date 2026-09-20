import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectorOptionProps {
  /** Primary label text or element for the item */
  label: React.ReactNode
  /** Icon displayed before the label (Component or ReactNode) */
  icon?: React.ComponentType<{ className?: string; size?: number }> | React.ReactNode
  /** Secondary description text displayed below or inline */
  description?: React.ReactNode
  /** How the label and description sit together ('stacked' or 'inline') */
  layout?: 'stacked' | 'inline'
  /** Additional content rendered after label and description (badges, prices, tags) */
  endContent?: React.ReactNode
  /** Whether this option is currently selected */
  selected?: boolean
  /** Whether the option is disabled */
  disabled?: boolean
  /** Visual density size */
  size?: 'sm' | 'md' | 'lg'
  /** Additional classes */
  className?: string
  /** Click handler */
  onClick?: () => void
}

export const SelectorOption = React.forwardRef<HTMLDivElement, SelectorOptionProps>(
  (
    {
      label,
      icon,
      description,
      layout = 'stacked',
      endContent,
      selected = false,
      disabled = false,
      size = 'md',
      className,
      onClick,
    },
    ref
  ) => {
    const renderIcon = () => {
      if (!icon) return null
      if (React.isValidElement(icon)) return icon
      const IconComponent = icon as React.ComponentType<{ className?: string; size?: number }>
      return (
        <div
          className={cn(
            'flex items-center justify-center rounded-md flex-shrink-0 transition-colors',
            size === 'sm' ? 'w-5 h-5 text-xs' : size === 'lg' ? 'w-8 h-8 text-base' : 'w-6 h-6 text-sm',
            selected
              ? 'bg-accent-500/20 text-accent-400'
              : 'bg-surface-800 text-surface-400 group-hover:text-surface-200 group-hover:bg-surface-700'
          )}
        >
          <IconComponent
            size={size === 'sm' ? 12 : size === 'lg' ? 18 : 14}
            className="flex-shrink-0"
          />
        </div>
      )
    }

    const sizeClasses = {
      sm: 'py-1.5 px-2.5 text-xs rounded-md',
      md: 'py-2 px-3 text-xs rounded-lg',
      lg: 'py-2.5 px-3.5 text-sm rounded-xl',
    }

    return (
      <div
        ref={ref}
        role="option"
        aria-selected={selected}
        aria-disabled={disabled}
        onClick={!disabled ? onClick : undefined}
        className={cn(
          'astryx-selector-option group w-full text-left transition-all duration-150 flex items-center justify-between gap-2.5 select-none cursor-pointer',
          sizeClasses[size],
          selected
            ? 'bg-accent-500/10 text-accent-300 font-medium border border-accent-500/25 shadow-sm'
            : 'text-surface-300 hover:text-surface-100 hover:bg-surface-800/80 border border-transparent',
          disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
          className
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Check indicator or option icon */}
          {renderIcon()}

          {/* Label + Description container */}
          {layout === 'stacked' ? (
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={cn(
                    'truncate font-medium',
                    selected ? 'text-surface-100' : 'text-surface-200 group-hover:text-white'
                  )}
                >
                  {label}
                </span>
              </div>
              {description && (
                <span className="text-[11px] text-surface-400 group-hover:text-surface-300 truncate mt-0.5 leading-tight">
                  {description}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
              <span
                className={cn(
                  'truncate font-medium',
                  selected ? 'text-surface-100' : 'text-surface-200 group-hover:text-white'
                )}
              >
                {label}
              </span>
              {description && (
                <span className="text-[11px] text-surface-400 group-hover:text-surface-300 truncate">
                  {description}
                </span>
              )}
            </div>
          )}
        </div>

        {/* End content / Badges / Price / Checkmark */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          {endContent}
          {selected && (
            <Check
              size={size === 'sm' ? 12 : 14}
              className="text-accent-400 flex-shrink-0 animate-in fade-in zoom-in-75 duration-150"
            />
          )}
        </div>
      </div>
    )
  }
)

SelectorOption.displayName = 'SelectorOption'
