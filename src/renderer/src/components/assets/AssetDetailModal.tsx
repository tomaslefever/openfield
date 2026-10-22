import { useState, useCallback, useEffect, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { X, ChevronLeft, ChevronRight, Star, Copy, Check, AlertCircle, RotateCcw, Download, FolderOpen, Trash2, Loader } from 'lucide-react'
import { srcUrl } from '../../services/file-url'
import { copyText, copyImage, copyImageFromUrl } from '../../lib/clipboard'
import { getAssetProvider } from '../../lib/models'
import { Button } from '../ui/button'
import { TagEditor } from '../ui/TagEditor'
import { AutoPlayVideo } from '../ui/AutoPlayVideo'
import { RetryGenerationButton } from '../ui/RetryGenerationButton'
import { ImageGeneration } from '../agents/image-generation'
import { ProviderLogo } from '../icons/ProviderLogos'
import { DraftFinalizeButton, isSeedanceDraft } from '../models/DraftFinalizeButton'
import { UpscaleVideoButton } from './UpscaleVideoButton'
import { AssetReferences, type ResolvedRef } from './AssetReferences'

export interface AssetDetailAction {
  icon: LucideIcon
  label: string
  onClick: () => void
}

const TYPE_LABEL: Record<string, string> = { image: 'Imagen', video: 'Video', audio: 'Audio' }

function clampPan(containerRef: React.RefObject<HTMLDivElement | null>, imgRef: React.RefObject<HTMLImageElement | null>, px: number, py: number, z: number) {
  const c = containerRef.current
  const img = imgRef.current
  if (!c || !img) return { x: px, y: py }
  const sw = img.offsetWidth * z
  const sh = img.offsetHeight * z
  let cx = px, cy = py
  if (sw > c.clientWidth) {
    const lim = (sw - c.clientWidth) / 2
    cx = Math.max(-lim, Math.min(lim, px))
  }
  if (sh > c.clientHeight) {
    const lim = (sh - c.clientHeight) / 2
    cy = Math.max(-lim, Math.min(lim, py))
  }
  return { x: cx, y: cy }
}

/** xs circular copy button with a short check confirmation */
export function CopyButton({ value, title = 'Copiar' }: { value: string; title?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      title={copied ? 'Copiado' : title}
      aria-label={title}
      disabled={!value}
      onClick={async (e) => {
        e.stopPropagation()
        if (await copyText(value)) {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }
      }}
      className="shrink-0 text-ink-subtle hover:text-ink"
    >
      {copied ? <Check className="size-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="size-3" />}
    </Button>
  )
}

function formatSize(bytes?: number) {
  if (!bytes) return null
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-body text-ink truncate">{value}</dd>
    </div>
  )
}

/** Overlay control on the black media stage (keeps white-on-black, per DESIGN.md media rule) */
const STAGE_BTN = 'size-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/75 hover:text-white hover:bg-black/70 transition-colors z-10'

/**
 * Detail view for a generated asset (image / video / audio): media stage with zoom & pan on the left,
 * metadata + actions on the right. Shared by Library, Image and Video pages.
 */
export function AssetDetailModal({
  asset, src, params, modelLabel, onClose, onPrev, onNext, onAssetChange, onToggleFavorite, onDelete,
  onRecreate, onCopyImage, copiedImage, actions = [], onDraftFinalQueued, onUpscaleQueued,
}: {
  asset: any
  /** Local path or URL of the media (not yet an asset:// URL) */
  src: string
  params: any
  modelLabel: string
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  onAssetChange: (asset: any) => void
  onToggleFavorite: () => void
  onDelete: () => void
  onRecreate: () => void
  onCopyImage?: () => void
  copiedImage?: boolean
  /** Page-specific actions (Reference, Animar…) shown between the primary row and Delete */
  actions?: AssetDetailAction[]
  /** A draft's 1080p final was queued */
  onDraftFinalQueued?: () => void
  /** A video upscale was confirmed and queued; the modal closes right after (shows the Upscale dropdown on ready videos) */
  onUpscaleQueued?: () => void
}) {
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'done'>('idle')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 })
  const zoomRef = useRef(1)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [refPreview, setRefPreview] = useState<ResolvedRef | null>(null)
  const refPreviewRef = useRef<ResolvedRef | null>(null)
  const [copiedRef, setCopiedRef] = useState(false)
  const provider = getAssetProvider(asset)

  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { refPreviewRef.current = refPreview }, [refPreview])
  useEffect(() => {
    setZoom(1); setPan({ x: 0, y: 0 }); setPromptExpanded(false); setConfirmDelete(false); setRefPreview(null)
  }, [asset.id, src])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft' && onPrev) onPrev()
      if (e.key === 'ArrowRight' && onNext) onNext()
      if (e.key === 'Escape') {
        if (zoomRef.current > 1) { setZoom(1); setPan({ x: 0, y: 0 }); return }
        if (refPreviewRef.current) { setRefPreview(null); return }
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onPrev, onNext, onClose])

  const handleSaveAs = async () => {
    setSaveState('saving')
    try {
      const res = await (window as any).electronAPI?.assets.saveAs(asset.id)
      if (res?.ok) {
        setSaveState('done')
        setTimeout(() => setSaveState('idle'), 1500)
      } else {
        setSaveState('idle')
      }
    } catch (err) {
      console.error('Save as failed:', err)
      setSaveState('idle')
    }
  }

  const handleCopyRef = async () => {
    const ref = refPreview
    if (!ref?.src) return
    let ok = false
    // Library-backed refs go through IPC like "Copiar imagen" (asset:// fetches are cross-origin)
    if (ref.assetId) {
      try {
        const results = await (window as any).electronAPI?.assets.readBase64([ref.assetId])
        if (results?.[0]?.base64) ok = await copyImage(results[0].base64, results[0].mime || 'image/png')
      } catch (err) {
        console.warn('Copy reference via asset failed:', err)
      }
    }
    if (!ok) ok = await copyImageFromUrl(srcUrl(ref.src) || '')
    if (ok) {
      setCopiedRef(true)
      setTimeout(() => setCopiedRef(false), 1500)
    }
  }

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const c = containerRef.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    const relX = e.clientX - rect.left - rect.width / 2
    const relY = e.clientY - rect.top - rect.height / 2
    const delta = e.deltaY < 0 ? 0.1 : -0.1
    setZoom(prev => {
      const next = Math.min(4, Math.max(1, prev * (1 + delta)))
      if (next === prev) return prev
      if (next === 1) { setPan({ x: 0, y: 0 }); return next }
      const scale = next / prev
      setPan(p => clampPan(containerRef, imgRef, relX * (1 - scale) + p.x * scale, relY * (1 - scale) + p.y * scale, next))
      return next
    })
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoomRef.current <= 1) return
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY }
    setIsDragging(true)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
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

  const isImage = asset.type === 'image'
  const isVideo = asset.type === 'video'
  const isError = !!asset.filePath?.startsWith('__error__')
  const isLoading = !isError && (!src || (!asset.localPath && asset.modelUsed && asset.modelUsed !== 'import'))
  const isReady = !isError && !isLoading
  const canZoom = isImage && isReady && !refPreview
  const hasLocalFile = !!(asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') && !asset.filePath.startsWith('http')))
  const prompt = asset.prompt || params.prompt || ''

  const genTime = params.generationTime || (params.generationTimeSeconds ? `${params.generationTimeSeconds}s` : (params.costTime ? `${params.costTime}s` : null))
  const specs: [string, React.ReactNode][] = ([
    ['Resolución', params.resolution || params.size],
    ['Aspect ratio', params.aspectRatio || params.aspect_ratio],
    ['Dimensiones', asset.width && asset.height ? `${asset.width}×${asset.height}` : null],
    ['Duración', params.duration != null ? `${params.duration}s` : null],
    ['FPS', params.fps],
    ['Tamaño', formatSize(asset.fileSize)],
    ['Tiempo gen.', genTime],
    ['Créditos', asset.creditsUsed > 0 ? Math.round(asset.creditsUsed).toLocaleString() : null],
  ] as [string, React.ReactNode][]).filter(([, v]) => v != null && v !== '')

  return (
    <div className="modal-scrim z-50 flex items-center justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${TYPE_LABEL[asset.type]?.toLowerCase() || 'asset'}`}
        className="modal-surface max-w-[95vw] w-full mx-2 h-[92vh] flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Media stage */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0 bg-black flex items-center justify-center relative overflow-hidden"
          onWheel={canZoom ? handleWheel : undefined}
          onMouseDown={canZoom ? handleMouseDown : undefined}
          onMouseMove={canZoom ? handleMouseMove : undefined}
          onMouseUp={canZoom ? handleMouseUp : undefined}
          onMouseLeave={canZoom ? handleMouseUp : undefined}
        >
          {onPrev && (
            <button onClick={(e) => { e.stopPropagation(); onPrev() }} title="Anterior (←)" aria-label="Anterior"
              className={`${STAGE_BTN} absolute left-4 top-1/2 -translate-y-1/2`}>
              <ChevronLeft size={18} />
            </button>
          )}
          {onNext && (
            <button onClick={(e) => { e.stopPropagation(); onNext() }} title="Siguiente (→)" aria-label="Siguiente"
              className={`${STAGE_BTN} absolute right-4 top-1/2 -translate-y-1/2`}>
              <ChevronRight size={18} />
            </button>
          )}

          {refPreview?.src ? (
            refPreview.kind === 'image' ? (
              <img src={srcUrl(refPreview.src)} alt={refPreview.label} className="max-w-full max-h-full object-contain select-none" draggable={false} />
            ) : refPreview.kind === 'video' ? (
              <AutoPlayVideo key={refPreview.key} src={srcUrl(refPreview.src)} className="max-w-full max-h-full object-contain" />
            ) : (
              <audio key={refPreview.key} controls src={srcUrl(refPreview.src)} className="w-full max-w-md px-4" autoPlay />
            )
          ) : isError ? (
            <div className="flex flex-col items-center gap-4 p-8 text-center max-w-lg">
              <span className="size-12 rounded-full bg-red-500/15 flex items-center justify-center text-red-400">
                <AlertCircle size={22} />
              </span>
              <div className="space-y-2">
                <p className="text-title text-white">Error en la generación</p>
                <p className="text-meta text-red-300/90 leading-relaxed font-mono bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 max-w-md">
                  {asset.filePath.replace('__error__:', '') || 'No se pudo completar la generación'}
                </p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <RetryGenerationButton assetId={asset.id} variant="full" onRetried={onClose} />
                <button type="button" onClick={onRecreate}
                  className="text-meta text-white/60 hover:text-white underline-offset-2 hover:underline">
                  Editar y recrear en el composer
                </button>
              </div>
            </div>
          ) : isLoading ? (
            <div className="absolute inset-0">
              <ImageGeneration status="generating" size="fill" showStatus={false} className="w-full h-full" />
            </div>
          ) : isImage ? (
            <img
              ref={imgRef}
              src={srcUrl(src)}
              alt={prompt}
              className="max-w-full max-h-full object-contain select-none"
              draggable={false}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
              }}
            />
          ) : isVideo ? (
            <AutoPlayVideo key={asset.id} src={srcUrl(src)} className="max-w-full max-h-full object-contain" />
          ) : (
            <audio controls src={srcUrl(src)} className="w-full max-w-md px-4" autoPlay />
          )}

          {refPreview && (
            <div className="absolute top-4 left-4 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-pill pl-3 pr-1 py-1 z-10">
              <span className="text-meta font-emphasis text-white/80">Referencia · {refPreview.label}</span>
              <button onClick={(e) => { e.stopPropagation(); setRefPreview(null) }}
                className="text-meta text-white/70 hover:text-white hover:bg-white/10 rounded-pill px-2 py-0.5 transition-colors">
                Volver al resultado
              </button>
            </div>
          )}

          {/* Stage toolbar */}
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            {refPreview?.src && refPreview.kind === 'image' && (
              <button onClick={(e) => { e.stopPropagation(); handleCopyRef() }} title="Copiar referencia" aria-label="Copiar referencia"
                className={`${STAGE_BTN} ${copiedRef ? '!text-emerald-400' : ''}`}>
                {copiedRef ? <Check size={15} /> : <Copy size={15} />}
              </button>
            )}
            {!refPreview && isReady && isImage && onCopyImage && (
              <button onClick={(e) => { e.stopPropagation(); onCopyImage() }} title="Copiar imagen" aria-label="Copiar imagen"
                className={`${STAGE_BTN} ${copiedImage ? '!text-emerald-400' : ''}`}>
                {copiedImage ? <Check size={15} /> : <Copy size={15} />}
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
              title={asset.isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              aria-label={asset.isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              aria-pressed={!!asset.isFavorite}
              className={`${STAGE_BTN} ${asset.isFavorite ? '!text-amber-400' : 'hover:!text-amber-400'}`}>
              <Star size={15} fill={asset.isFavorite ? 'currentColor' : 'none'} />
            </button>
          </div>

          {zoom > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-pill pl-3 pr-1 py-1 z-10">
              <span className="text-meta font-emphasis text-white/80 tabular-nums">{Math.round(zoom * 100)}%</span>
              <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
                className="text-meta text-white/70 hover:text-white hover:bg-white/10 rounded-pill px-2 py-0.5 transition-colors">
                Reset
              </button>
            </div>
          )}
        </div>

        {/* Details */}
        <aside className="w-[380px] flex-shrink-0 bg-canvas border-l border-hairline flex flex-col min-h-0">
          {/* Header: type, model, ID */}
          <header className="px-5 pt-4 pb-4 border-b border-hairline flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow">{TYPE_LABEL[asset.type] || 'Asset'}</p>
              <button onClick={onClose} title="Cerrar (Esc)" aria-label="Cerrar" className="btn-icon -mr-1.5">
                <X size={15} />
              </button>
            </div>
            <h2 className="mt-1 text-title text-ink flex items-center gap-2 min-w-0">
              {provider && <span title={provider} className="shrink-0"><ProviderLogo provider={provider} size={16} /></span>}
              <span className="truncate">{modelLabel || '—'}</span>
            </h2>
            <div className="mt-2.5 flex items-center gap-1 min-w-0">
              <span className="eyebrow shrink-0">ID</span>
              <span className="font-mono text-meta text-ink-muted truncate select-all" title={asset.id}>{asset.id}</span>
              <CopyButton value={asset.id} title="Copiar ID del asset" />
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Prompt */}
            <section>
              <div className="flex items-center justify-between mb-1.5">
                <p className="eyebrow">Prompt</p>
                {prompt && <CopyButton value={prompt} title="Copiar prompt" />}
              </div>
              <p
                onClick={() => prompt && setPromptExpanded(v => !v)}
                className={`text-body text-ink font-book leading-relaxed whitespace-pre-wrap break-words rounded-lg bg-surface-soft border border-hairline px-3 py-2.5 ${prompt ? 'cursor-pointer' : ''} ${promptExpanded ? '' : 'line-clamp-5'}`}
                title={prompt ? (promptExpanded ? 'Click para contraer' : 'Click para expandir') : undefined}
              >
                {prompt || '—'}
              </p>
            </section>

            {/* Specs */}
            {specs.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {specs.map(([label, value]) => <Spec key={label} label={label} value={value} />)}
              </dl>
            )}

            <dl className="space-y-3 pt-4 border-t border-hairline-soft">
              <Spec label="Creado" value={asset.createdAt ? new Date(asset.createdAt).toLocaleString() : '—'} />
              <div className="min-w-0">
                <dt className="eyebrow">Task ID</dt>
                <dd className="mt-0.5 flex items-center gap-1 min-w-0">
                  <span className="font-mono text-meta text-ink-muted truncate select-all" title={asset.taskId || undefined}>{asset.taskId || '—'}</span>
                  {asset.taskId && <CopyButton value={asset.taskId} title="Copiar Task ID" />}
                </dd>
              </div>
            </dl>

            <AssetReferences
              params={params}
              assetId={asset.id}
              activeKey={refPreview?.key}
              onSelect={(ref) => { setZoom(1); setPan({ x: 0, y: 0 }); setRefPreview(prev => prev?.key === ref.key ? null : ref) }}
            />

            {/* Tags */}
            <section className="pt-4 border-t border-hairline-soft">
              <p className="eyebrow mb-1.5">Tags</p>
              <TagEditor
                tags={(asset.tags ? asset.tags.split(',').filter(Boolean) : []).map((t: string) => t.trim())}
                onChange={async (newTags) => {
                  const api = (window as any).electronAPI
                  if (!api?.assets?.updateTags) return
                  const updated = await api.assets.updateTags(asset.id, newTags)
                  if (updated) onAssetChange(updated)
                }}
              />
            </section>

            {isSeedanceDraft(asset, params) && (
              <section className="pt-4 border-t border-hairline-soft">
                <p className="text-meta text-ink-muted mb-2">Draft 480p — revisa escena y movimiento, luego genera el final.</p>
                <DraftFinalizeButton
                  key={asset.id}
                  asset={asset}
                  onOpenFinal={async (id) => { const a = await (window as any).electronAPI?.assets.get(id); if (a) onAssetChange(a) }}
                  onQueued={onDraftFinalQueued}
                />
              </section>
            )}
          </div>

          {/* Actions */}
          <footer className="px-5 py-4 border-t border-hairline flex-shrink-0 space-y-2">
            <div className="flex gap-2">
              <button onClick={onRecreate} className="btn-primary flex-1 inline-flex items-center justify-center gap-1.5 text-xs">
                <RotateCcw size={13} /> Recrear
              </button>
              <button onClick={handleSaveAs} disabled={saveState === 'saving' || !isReady} className="btn-secondary flex-1 inline-flex items-center justify-center gap-1.5 text-xs">
                {saveState === 'done' ? <Check size={13} className="text-emerald-600 dark:text-emerald-400" /> : saveState === 'saving' ? <Loader size={13} className="animate-spin" /> : <Download size={13} />}
                {saveState === 'done' ? 'Guardado' : 'Guardar como'}
              </button>
            </div>
            {isVideo && isReady && onUpscaleQueued && (
              <UpscaleVideoButton asset={asset} src={src} params={params} onQueued={() => { onUpscaleQueued(); onClose() }} />
            )}
            {(actions.length > 0 || hasLocalFile) && (
              <div className="grid grid-cols-2 gap-1">
                {actions.map(({ icon: Icon, label, onClick }) => (
                  <button key={label} onClick={onClick} className="btn-ghost text-xs inline-flex items-center justify-start gap-2">
                    <Icon size={13} className="shrink-0" /> <span className="truncate">{label}</span>
                  </button>
                ))}
                {hasLocalFile && (
                  <button onClick={() => (window as any).electronAPI?.assets.showInFolder(asset.id)}
                    className="btn-ghost text-xs inline-flex items-center justify-start gap-2">
                    <FolderOpen size={13} className="shrink-0" /> <span className="truncate">Mostrar en carpeta</span>
                  </button>
                )}
              </div>
            )}
            <div className="pt-2 border-t border-hairline-soft">
              {confirmDelete ? (
                <div className="flex items-center justify-between gap-2 h-8">
                  <span className="text-meta text-ink-muted pl-3">¿Eliminar este asset?</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setConfirmDelete(false)} className="btn-ghost text-xs">Cancelar</button>
                    <button onClick={() => { onDelete(); setConfirmDelete(false) }}
                      className="px-3 py-1.5 rounded-pill bg-red-600 hover:bg-red-500 text-white text-xs font-emphasis transition-colors">
                      Eliminar
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)}
                  className="btn-ghost text-xs w-full inline-flex items-center justify-center gap-2 text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-600/10">
                  <Trash2 size={13} /> Eliminar
                </button>
              )}
            </div>
          </footer>
        </aside>
      </div>
    </div>
  )
}
