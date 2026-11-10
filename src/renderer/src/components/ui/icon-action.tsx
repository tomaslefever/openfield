import type { LucideIcon } from 'lucide-react'

/** Circular icon action (card corners, rows) */
export function IconAction({
  icon: Icon,
  title,
  onClick,
  danger,
  overlay,
  disabled,
}: {
  icon: LucideIcon
  title: string
  onClick: () => void
  danger?: boolean
  /** Sits on top of media: solid ground so it reads on any image */
  overlay?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`size-7 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${
        overlay ? 'bg-canvas/90 text-ink shadow-soft' : 'text-ink-subtle hover:bg-surface-800'
      } ${danger ? 'hover:text-red-500' : 'hover:text-ink'}`}
    >
      <Icon size={13} />
    </button>
  )
}
