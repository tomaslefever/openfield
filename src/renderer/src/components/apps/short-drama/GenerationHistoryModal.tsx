import React from 'react'
import {
  X,
  History,
  CheckCircle2,
  RotateCcw,
  Clock,
  Cpu,
  Film,
  Sparkles,
  Play,
} from 'lucide-react'
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

  const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp)

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-4xl max-h-[85vh] bg-[#0c0d14] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center text-accent-400">
              <History size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">{title}</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-accent-500/20 text-accent-300 border border-accent-500/30">
                  {sortedHistory.length} {sortedHistory.length === 1 ? 'versión' : 'versiones'}
                </span>
              </div>
              <p className="text-xs text-surface-400">
                {subtitle || 'Selecciona cualquier versión generada previamente para restaurarla en tu proyecto.'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Versions Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {sortedHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-surface-500 gap-2">
              <History size={36} className="opacity-40" />
              <p className="text-xs">No hay versiones registradas en el historial aún.</p>
              <p className="text-[11px] text-surface-600">
                Cada vez que generes o regeneres este elemento, sus versiones anteriores se guardarán aquí automáticamente.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedHistory.map((item, idx) => {
                const isCurrent =
                  (item.url && item.url === activeUrl) ||
                  (item.assetId && item.assetId === activeAssetId) ||
                  (idx === 0 && !activeUrl && !activeAssetId)

                return (
                  <div
                    key={item.id || idx}
                    className={`bg-surface-950/80 rounded-xl border transition-all overflow-hidden flex flex-col justify-between ${
                      isCurrent
                        ? 'border-accent-500/60 shadow-lg shadow-accent-500/10 ring-1 ring-accent-500/40'
                        : 'border-white/5 hover:border-white/20'
                    }`}
                  >
                    {/* Media Preview */}
                    <div className="relative aspect-video bg-black/60 overflow-hidden flex items-center justify-center group">
                      {kind === 'video' ? (
                        <video
                          src={srcUrl(item.localPath || item.url)}
                          controls
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <img
                          src={srcUrl(item.url)}
                          alt={item.prompt || `Versión ${sortedHistory.length - idx}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      )}

                      {/* Version Number Badge */}
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-[10px] font-bold text-white border border-white/10">
                        v{sortedHistory.length - idx}
                      </div>

                      {/* Active Status Badge */}
                      {isCurrent && (
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-emerald-500/90 text-black font-bold text-[10px] flex items-center gap-1 shadow-md">
                          <CheckCircle2 size={11} /> Activo
                        </div>
                      )}

                      {/* Video Input Mode Badge if applicable */}
                      {item.inputMode && (
                        <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md text-[9px] font-mono text-accent-300 border border-accent-500/30">
                          {item.inputMode.toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Metadata Details */}
                    <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-surface-400">
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {formatTimestamp(item.timestamp)}
                          </span>
                          {item.model && (
                            <span className="flex items-center gap-1 text-surface-300 font-medium truncate max-w-[120px]">
                              <Cpu size={10} className="text-accent-400" />
                              {item.model}
                            </span>
                          )}
                        </div>

                        {item.prompt && (
                          <p
                            className="text-[11px] text-surface-300 line-clamp-2 leading-relaxed italic bg-white/[0.02] p-1.5 rounded border border-white/5"
                            title={item.prompt}
                          >
                            "{item.prompt}"
                          </p>
                        )}
                      </div>

                      {/* Action Button */}
                      <div className="pt-2 mt-2 border-t border-white/5">
                        {isCurrent ? (
                          <button
                            disabled
                            className="w-full py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center gap-1.5 cursor-default"
                          >
                            <CheckCircle2 size={12} /> Versión Activa
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              onRestore(item)
                              onClose()
                            }}
                            className="w-full py-1.5 rounded-lg text-xs font-semibold bg-accent-600/20 hover:bg-accent-600 text-accent-300 hover:text-white border border-accent-500/40 hover:border-accent-500 transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                          >
                            <RotateCcw size={12} /> Restaurar esta versión
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-white/[0.01] flex items-center justify-between text-xs text-surface-500">
          <span>Las versiones quedan almacenadas en el proyecto SQLite.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-200 text-xs font-medium transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
