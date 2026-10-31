import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import type { ViewerImage } from '../../lib/prompt-references'

/**
 * Full-size view of a prompt's visual references, with credit, license and a link to the
 * source. Arrow keys / buttons move between references; Escape or a click outside closes.
 */
export function PromptReferenceViewer({ title, images, startIndex = 0, onClose }: {
  title: string
  images: ViewerImage[]
  startIndex?: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, images.length - 1)))
  const [failed, setFailed] = useState(false)
  const current = images[index]
  const many = images.length > 1

  useEffect(() => { setFailed(false) }, [index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && many) setIndex(i => (i + 1) % images.length)
      else if (e.key === 'ArrowLeft' && many) setIndex(i => (i - 1 + images.length) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [images.length, many, onClose])

  if (!current) return null

  return (
    <div className="modal-scrim z-50 flex items-center justify-center" onClick={onClose}>
      <div className="modal-surface w-full max-w-5xl max-h-[92vh] flex flex-col m-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3 border-b border-surface-800 flex-shrink-0">
          <p className="text-sm font-semibold text-surface-100 truncate">{title}</p>
          {many && <span className="text-[10px] text-surface-500 whitespace-nowrap">{index + 1} / {images.length}</span>}
          <button onClick={onClose} className="ml-auto text-surface-500 hover:text-surface-200" title="Cerrar (Esc)"><X size={16} /></button>
        </div>

        <div className="relative flex-1 min-h-0 flex items-center justify-center bg-black/40 p-3">
          {failed ? (
            <div className="text-xs text-surface-500 text-center py-20">
              No se pudo cargar la referencia.
              {current.sourceUrl && <> Ábrela en <a href={current.sourceUrl} target="_blank" rel="noreferrer" className="text-accent-400 hover:text-accent-300">su fuente</a>.</>}
            </div>
          ) : current.type === 'video' ? (
            <video key={current.src} src={current.src} controls autoPlay loop className="max-w-full max-h-[72vh] rounded-lg" onError={() => setFailed(true)} />
          ) : (
            <img key={current.src} src={current.src} alt={current.caption || title} referrerPolicy="no-referrer"
              className="max-w-full max-h-[72vh] object-contain rounded-lg" onError={() => setFailed(true)} />
          )}
          {many && (
            <>
              <button onClick={() => setIndex(i => (i - 1 + images.length) % images.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white/80 hover:text-white" title="Anterior (←)">
                <ChevronLeft size={18} />
              </button>
              <button onClick={() => setIndex(i => (i + 1) % images.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white/80 hover:text-white" title="Siguiente (→)">
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>

        {(current.caption || current.credit || current.license || current.sourceUrl || current.date) && (
          <div className="px-5 py-3 border-t border-surface-800 flex-shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            {current.caption && <span className="text-surface-300">{current.caption}</span>}
            {current.credit && <span className="text-surface-500">Crédito: {current.credit}</span>}
            {current.license && <span className="text-surface-500">Licencia: {current.license}</span>}
            {current.date && <span className="text-surface-500">Publicada: {current.date}</span>}
            {current.sourceUrl && (
              <a href={current.sourceUrl} target="_blank" rel="noreferrer" className="text-accent-400 hover:text-accent-300 flex items-center gap-1 ml-auto">
                <ExternalLink size={11} /> Ver fuente
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
