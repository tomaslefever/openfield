import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Wand2 } from 'lucide-react'
import { srcUrl } from '../../../services/file-url'
import { useMediaDrop, type PickedAsset } from './media'

// ───────────────────── Layout ─────────────────────

/** Scroll container + centered column shared by every stage */
export function StageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">{children}</div>
    </div>
  )
}

export function StageHeader({
  stage,
  title,
  description,
  children,
}: {
  stage: number
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow">Etapa {stage} de 4</p>
        <h2 className="text-title-lg text-ink mt-1">{title}</h2>
        {description && <p className="text-meta text-ink-subtle mt-1 max-w-2xl">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{children}</div>}
    </div>
  )
}

/** Row of labelled controls (models, resolution, ratio…) */
export function ControlBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 py-3 border-y border-hairline">{children}</div>
  )
}

export function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="eyebrow">{label}</span>
      {children}
    </div>
  )
}

export function StageFooter({
  back,
  next,
}: {
  back?: { label: string; onClick: () => void }
  next?: { label: string; onClick: () => void; disabled?: boolean }
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-6 border-t border-hairline">
      {back ? (
        <button onClick={back.onClick} className="btn-ghost flex items-center gap-1.5 text-meta">
          <ArrowLeft size={13} /> {back.label}
        </button>
      ) : <span />}
      {next && (
        <button onClick={next.onClick} disabled={next.disabled} className="btn-primary flex items-center gap-1.5">
          {next.label} <ArrowRight size={14} />
        </button>
      )}
    </div>
  )
}

export function SectionHeader({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3 min-h-7">
      <div className="flex items-baseline gap-2">
        <h3 className="eyebrow">{title}</h3>
        {count != null && <span className="font-mono text-eyebrow text-ink-subtle">{count}</span>}
      </div>
      {children && <div className="flex items-center gap-1">{children}</div>}
    </div>
  )
}

/** Circular icon action (card corners, rows) */
export function IconAction({
  icon: Icon,
  title,
  onClick,
  danger,
  overlay,
  disabled,
}: {
  icon: typeof ArrowLeft
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

/** Pill-shaped single choice (view switches, input modes) */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = '',
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string; icon?: typeof ArrowLeft; title?: string }>
  className?: string
}) {
  return (
    <div role="radiogroup" className={`inline-flex items-center gap-0.5 p-0.5 rounded-pill border border-hairline bg-surface-soft ${className}`}>
      {options.map((o) => {
        const active = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 h-7 px-3 rounded-pill text-meta whitespace-nowrap transition-colors ${
              active ? 'bg-accent-600 text-on-accent font-emphasis' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {Icon && <Icon size={12} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Uppercase status line under a card title */
export function Meta({ children }: { children: React.ReactNode }) {
  return <p className="text-meta text-ink-subtle truncate">{children}</p>
}

// ───────────────────── Prompt field ─────────────────────

/** Textarea with an optional "rewrite with AI" action in its label row */
export function PromptField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  onRewrite,
  rewriting,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  onRewrite?: () => void
  rewriting?: boolean
  disabled?: boolean
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-meta text-ink-subtle">{label}</span>
        {onRewrite && (
          <button
            type="button"
            onClick={onRewrite}
            disabled={rewriting || disabled}
            className="inline-flex items-center gap-1 text-meta text-ink-muted hover:text-ink disabled:opacity-40 transition-colors"
            title="Reescribir con IA"
          >
            {rewriting ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
            {rewriting ? 'Reescribiendo…' : 'Reescribir'}
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="input-field resize-none text-meta leading-relaxed"
      />
    </div>
  )
}

// ───────────────────── Media ─────────────────────

/** Image slot: preview, generating state and drop target */
export function MediaTile({
  src,
  aspect,
  generating,
  placeholder,
  emptyLabel = 'Arrastra una imagen o genera',
  onOpen,
  onAsset,
  className = 'rounded-xl',
  children,
}: {
  src?: string
  aspect: React.CSSProperties
  generating?: boolean
  placeholder: React.ReactNode
  emptyLabel?: string
  onOpen?: () => void
  onAsset?: (asset: PickedAsset) => void
  className?: string
  /** Overlays (corner actions, badges) */
  children?: React.ReactNode
}) {
  const { over, handlers } = useMediaDrop((a) => onAsset?.(a), !!onAsset && !generating)
  const url = srcUrl(src)
  return (
    <div
      {...handlers}
      style={aspect}
      className={`group/tile relative overflow-hidden bg-surface-950 border transition-colors ${
        over ? 'border-ink' : url ? 'border-hairline' : 'border-dashed border-surface-700'
      } ${className}`}
    >
      {url ? (
        <button type="button" onClick={onOpen} className="block w-full h-full cursor-zoom-in" aria-label="Ver en grande">
          <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
        </button>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-ink-subtle">
          {placeholder}
          <span className="text-meta">{emptyLabel}</span>
        </div>
      )}
      {generating && (
        <div className="absolute inset-0 bg-canvas/75 backdrop-blur-sm flex flex-col items-center justify-center gap-1.5">
          <Loader2 size={16} className="animate-spin text-ink" />
          <span className="text-meta text-ink-muted">Generando…</span>
        </div>
      )}
      {over && (
        <div className="absolute inset-0 bg-canvas/60 flex items-center justify-center pointer-events-none">
          <span className="px-3 py-1 rounded-pill bg-accent-600 text-on-accent text-meta font-emphasis flex items-center gap-1">
            <ImagePlus size={12} /> Soltar para usar
          </span>
        </div>
      )}
      {children}
    </div>
  )
}

// ───────────────────── Confirm dialog ─────────────────────

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string
  description?: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="modal-scrim z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="modal-surface w-full max-w-sm mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        <h2 className="text-title text-ink">{title}</h2>
        {description && <p className="text-body text-ink-muted mt-2">{description}</p>}
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn-ghost" autoFocus>Cancelar</button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className={danger
              ? 'px-4 py-2 rounded-pill text-sm font-emphasis bg-red-600 hover:bg-red-500 text-white transition-colors'
              : 'btn-primary'}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
