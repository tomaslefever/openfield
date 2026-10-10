import { X, Check, RotateCcw, History } from 'lucide-react'
import { srcUrl } from '../../../services/file-url'
import type { GenerationHistoryItem } from '../../../stores/short-drama-store'

interface Props {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  kind: 'image' | 'video'
  activeUrl?: string
  activeAssetId?: string
  history: GenerationHistoryItem[]
  onRestore: (item: GenerationHistoryItem) => void
}

export function GenerationHistoryModal({
  isOpen,
  onClose,
  title,
  subtitle,
  kind,
  activeUrl,
  activeAssetId,
  history,
  onRestore,
}: Props) {
  if (!isOpen) return null

  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp)
  const formatTimestamp = (ts: number) =>
    new Date(ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="modal-scrim z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="modal-surface w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      >
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div>
            <p className="eyebrow">Versiones · {sorted.length}</p>
            <h3 className="text-title-lg text-ink mt-1">{title}</h3>
            <p className="text-meta text-ink-subtle mt-1">{subtitle || 'Restaura cualquier versión generada antes.'}</p>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2 text-ink-subtle">
              <History size={20} strokeWidth={1.5} />
              <p className="text-body text-ink">Sin versiones todavía</p>
              <p className="text-meta">Cada generación nueva se guarda aquí.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((item, idx) => {
                const isCurrent =
                  (!!item.url && item.url === activeUrl) ||
                  (!!item.assetId && item.assetId === activeAssetId) ||
                  (idx === 0 && !activeUrl && !activeAssetId)
                return (
                  <div key={item.id || idx} className="group">
                    <div
                      className={`relative aspect-video rounded-xl overflow-hidden bg-surface-950 border ${isCurrent ? 'border-ink' : 'border-hairline'}`}
                    >
                      {kind === 'video' ? (
                        <video src={srcUrl(item.localPath || item.url)} controls playsInline className="w-full h-full object-cover" />
                      ) : (
                        <img src={srcUrl(item.url)} alt="" className="w-full h-full object-cover" loading="lazy" />
                      )}
                      <span className="absolute top-2 left-2 inline-flex items-center h-6 px-2 rounded-pill bg-canvas/90 font-mono text-eyebrow text-ink">
                        v{sorted.length - idx}{item.inputMode ? ` · ${item.inputMode.toUpperCase()}` : ''}
                      </span>
                      {isCurrent && (
                        <span className="absolute top-2 right-2 inline-flex items-center gap-1 h-6 px-2 rounded-pill bg-accent-600 text-on-accent text-meta font-emphasis">
                          <Check size={11} /> Activa
                        </span>
                      )}
                    </div>
                    <div className="mt-2 px-0.5 space-y-1">
                      <p className="text-meta text-ink-subtle truncate">
                        {formatTimestamp(item.timestamp)}{item.model ? ` · ${item.model}` : ''}
                      </p>
                      {item.prompt && <p className="text-meta text-ink-muted line-clamp-2" title={item.prompt}>{item.prompt}</p>}
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => { onRestore(item); onClose() }}
                          className="inline-flex items-center gap-1.5 h-7 px-3 -ml-1 rounded-pill text-meta font-emphasis text-ink-muted hover:text-ink hover:bg-surface-800 transition-colors"
                        >
                          <RotateCcw size={12} /> Restaurar
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
