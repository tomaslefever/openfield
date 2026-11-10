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
