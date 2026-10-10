import type { LucideIcon } from 'lucide-react'

/** Compact pill action used in media toolbars (ghost by default, ink-filled when `solid`) */
export function ToolButton({
  icon: Icon,
  children,
  onClick,
  disabled,
  title,
  solid,
  spin,
}: {
  icon: LucideIcon
  children?: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  solid?: boolean
  /** Spins the icon (busy state) */
  spin?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 h-7 ${children ? 'px-3' : 'w-7 justify-center'} rounded-pill text-meta font-emphasis whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        solid
          ? 'bg-accent-600 text-on-accent hover:bg-accent-500'
          : 'text-ink-muted hover:text-ink hover:bg-surface-800'
      }`}
    >
      <Icon size={12} className={spin ? 'animate-spin' : undefined} />
      {children}
    </button>
  )
}
