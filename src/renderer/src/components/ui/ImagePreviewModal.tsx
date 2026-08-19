import { useState, useCallback, useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Star, Copy, Check } from 'lucide-react'

interface ImagePreviewModalProps {
  src: string
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  isFavorite?: boolean
  onToggleFavorite?: () => void
  onCopyImage?: () => void
  copiedImage?: boolean
  children?: React.ReactNode
}

function clampPan(containerRef: React.RefObject<HTMLDivElement | null>, imgRef: React.RefObject<HTMLImageElement | null>, px: number, py: number, z: number) {
 const c = containerRef.current
 const img = imgRef.current
 if (!c || !img) return { x: px, y: py }
 const cw = c.clientWidth
 const ch = c.clientHeight
 const iw = img.offsetWidth
 const ih = img.offsetHeight
 const sw = iw * z
 const sh = ih * z
 let cx = px, cy = py
 if (sw > cw) {
 const lim = (sw - cw) / 2
 cx = Math.max(-lim, Math.min(lim, px))
 }
 if (sh > ch) {
 const lim = (sh - ch) / 2
 cy = Math.max(-lim, Math.min(lim, py))
 }
 return { x: cx, y: cy }
}

export function ImagePreviewModal({ src, onClose, onPrev, onNext, isFavorite, onToggleFavorite, onCopyImage, copiedImage, children }: ImagePreviewModalProps) {
 const hasSidebar = !!children
 const containerRef = useRef<HTMLDivElement>(null)
 const imgRef = useRef<HTMLImageElement>(null)
 const dragRef = useRef({ active: false, lastX: 0, lastY: 0 })
 const zoomRef = useRef(1)
 const [zoom, setZoom] = useState(1)
 const [pan, setPan] = useState({ x: 0, y: 0 })
 const [isDragging, setIsDragging] = useState(false)

 useEffect(() => { zoomRef.current = zoom }, [zoom])

 useEffect(() => {
 setZoom(1)
 setPan({ x: 0, y: 0 })
 }, [src])

 useEffect(() => {
 const handler = (e: KeyboardEvent) => {
 if (e.key === 'ArrowLeft' && onPrev) onPrev()
 if (e.key === 'ArrowRight' && onNext) onNext()
 if (e.key === 'Escape') {
 if (zoom > 1) { setZoom(1); setPan({ x: 0, y: 0 }); return }
 onClose()
 }
 }
 window.addEventListener('keydown', handler)
 return () => window.removeEventListener('keydown', handler)
 }, [onPrev, onNext, onClose, zoom])

 const handleWheel = useCallback((e: any) => {
 e.preventDefault()
 const c = containerRef.current
 if (!c) return
 const rect = c.getBoundingClientRect()
 const mx = e.clientX - rect.left
 const my = e.clientY - rect.top
 const cw = rect.width
 const ch = rect.height
 const delta = e.deltaY < 0 ? 0.1 : -0.1
 setZoom(prev => {
 const newZoom = Math.min(4, Math.max(1, prev * (1 + delta)))
 if (newZoom === prev) return prev
 if (newZoom === 1) { setPan({ x: 0, y: 0 }); return newZoom }
 const scale = newZoom / prev
 setPan(prevPan => {
 const relX = mx - cw / 2
 const relY = my - ch / 2
 return clampPan(containerRef, imgRef, relX * (1 - scale) + prevPan.x * scale, relY * (1 - scale) + prevPan.y * scale, newZoom)
 })
 return newZoom
 })
 }, [])

 const handleMouseDown = useCallback((e: any) => {
 if (zoomRef.current <= 1) return
 dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY }
 setIsDragging(true)
 }, [])

 const handleMouseMove = useCallback((e: any) => {
 if (!dragRef.current.active) return
 const dx = e.clientX - dragRef.current.lastX
 const dy = e.clientY - dragRef.current.lastY
 dragRef.current.lastX = e.clientX
 dragRef.current.lastY = e.clientY
 if (dx === 0 && dy === 0) return
 setPan(prev => clampPan(containerRef, imgRef, prev.x + dx, prev.y + dy, zoomRef.current))
 }, [])

 const handleMouseUp = useCallback(() => {
 dragRef.current.active = false
 setIsDragging(false)
 }, [])

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
 <div className="bg-surface-950 border border-surface-800 rounded-2xl max-w-5xl w-full mx-4 max-h-[90vh] flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
 <div
 ref={containerRef}
 className="flex-1 bg-black flex items-center justify-center min-h-[400px] relative overflow-hidden"
 onWheel={handleWheel}
 onMouseDown={handleMouseDown}
 onMouseMove={handleMouseMove}
 onMouseUp={handleMouseUp}
 onMouseLeave={handleMouseUp}
 >
 {onPrev && (
 <button
 onClick={(e) => { e.stopPropagation(); onPrev() }}
 className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors z-10">
 <ChevronLeft size={20} />
 </button>
 )}
 {onNext && (
 <button
 onClick={(e) => { e.stopPropagation(); onNext() }}
 className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors z-10">
 <ChevronRight size={20} />
 </button>
 )}
 <img
 ref={imgRef}
 src={src}
 className="max-w-full max-h-[80vh] object-contain select-none"
 draggable={false}
 style={{
 transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
 transformOrigin: 'center center',
 cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
 }}
 />
  {onCopyImage && (
  <button
  onClick={(e) => { e.stopPropagation(); onCopyImage() }}
  title="Copiar imagen"
  className={`absolute top-3 right-12 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center z-10 transition-colors ${copiedImage ? 'text-green-400' : 'text-white/60 hover:text-white'}`}
  >
  {copiedImage ? <Check size={14} /> : <Copy size={14} />}
  </button>
  )}
  {onToggleFavorite && (
  <button
  onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
  title={isFavorite ? 'Remove favorite' : 'Add to favorites'}
  className={`absolute top-3 right-3 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center z-10 transition-colors ${isFavorite ? 'text-amber-400' : 'text-white/60 hover:text-amber-400'}`}
  >
  <Star size={14} fill={isFavorite ? 'currentColor' : 'none'} />
  </button>
  )}
  {!hasSidebar && (
  <button onClick={(e) => { e.stopPropagation(); onClose() }} className="absolute top-3 right-3 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white/60 hover:text-white z-10">
  <X size={16} />
  </button>
  )}
 {zoom > 1 && (
 <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5 z-10">
 <span className="text-white/80 text-xs font-medium">{Math.round(zoom * 100)}%</span>
 <button
 onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
 className="text-white/60 hover:text-white text-xs"
 >
 Reset
 </button>
 </div>
 )}
 </div>
 {hasSidebar && (
 <div className="w-72 bg-surface-900/80 border-l border-surface-800 flex flex-col">
 <div className="flex items-center justify-end px-3 py-2 border-b border-surface-800 flex-shrink-0">
 <button onClick={(e) => { e.stopPropagation(); onClose() }} title="Close"
 className="w-7 h-7 rounded-full flex items-center justify-center text-surface-500 hover:text-white hover:bg-surface-800 transition-colors">
 <X size={16} />
 </button>
 </div>
 <div className="flex-1 overflow-y-auto p-5 space-y-4">
 {children}
 </div>
 </div>
 )}
 </div>
 </div>
 )
}
