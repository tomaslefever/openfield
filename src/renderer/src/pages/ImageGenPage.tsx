import { useState, useCallback, useEffect, useRef } from 'react'
import { Download, Trash2, Send, Coins, Loader, AlertCircle, X, Copy, Check, ChevronLeft, ChevronRight, RefreshCw, Cloud, FolderOpen, RotateCcw, CheckSquare, Square } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { PromptComposer, type PromptComposerHandle } from '../components/PromptComposer'
import { fileUrl } from '../services/file-url'
import { AssetBadge } from '../components/ui/asset-badge'
import { TagEditor } from '../components/ui/TagEditor'
import { BulkActionBar } from '../components/ui/BulkActionBar'
import { ConfirmDeleteModal } from '../components/ui/ConfirmDeleteModal'
import { BulkTagModal } from '../components/ui/BulkTagModal'

const MODEL_NAMES: Record<string, string> = {
  'gpt-image-2-text-to-image': 'GPT Image 2',
  'gpt-image-2-image-to-image': 'GPT Image 2 I2I',
  'nano-banana-2': 'Nano Banana 2',
  'seedream-5-pro-text-to-image': 'Seedream 5 Pro',
  'flux2-pro-text-to-image': 'Flux 2 Pro',
  'grok-imagine/text-to-image': 'Grok Imagine',
  'imagen4-fast': 'Imagen 4 Fast',
}

export function ImageGenPage() {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<any>(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkTag, setShowBulkTag] = useState(false)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const composerRef = useRef<PromptComposerHandle>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 })
  const zoomRef = useRef(1)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const { data: recentAssets, refetch } = useQuery({
    queryKey: ['assets', 'recent', 'image'],
    queryFn: () => (window as any).electronAPI?.assets.list({ type: 'image', limit: 50 }) ?? { assets: [] },
    refetchInterval: 3000,
  })

  const assets = Array.isArray(recentAssets?.assets) ? recentAssets.assets : []

  useEffect(() => {
    if (selectedAsset && assets.length > 0) {
      const updated = assets.find((a: any) => a.id === selectedAsset.id)
      if (updated) setSelectedAsset(updated)
    }
  }, [assets, selectedAsset?.id])

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [selectedAsset?.id])

  useEffect(() => { zoomRef.current = zoom }, [zoom])

  const clampPan = (px: number, py: number, z: number) => {
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

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api) return
    const unsubComplete = api.on('kie:task:completed', () => refetch())
    const unsubFailed = api.on('kie:task:failed', () => refetch())
    return () => { unsubComplete?.(); unsubFailed?.() }
  }, [refetch])

  useEffect(() => {
    if (!selectedAsset) return
    const handler = (e: KeyboardEvent) => {
      const idx = assets.findIndex((a: any) => a.id === selectedAsset.id)
      if (e.key === 'ArrowLeft' && idx > 0) setSelectedAsset(assets[idx - 1])
      if (e.key === 'ArrowRight' && idx < assets.length - 1) setSelectedAsset(assets[idx + 1])
      if (e.key === 'Escape') {
        if (zoom > 1) { setZoom(1); setPan({ x: 0, y: 0 }); return }
        setSelectedAsset(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedAsset, assets, zoom])

  const handleDelete = useCallback(async (assetId: string) => {
    await (window as any).electronAPI?.assets.delete(assetId)
    refetch()
    if (selectedAsset?.id === assetId) setSelectedAsset(null)
  }, [refetch, selectedAsset])

  const handleGenerate = useCallback(async (params: any) => {
    try {
      await (window as any).electronAPI?.kie.generateImage(params)
      refetch()
    } catch (err) { console.error('Generation failed:', err) }
  }, [refetch])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleBulkDelete = useCallback(async () => {
    const api = (window as any).electronAPI
    await api?.assets.deleteMultiple(Array.from(selectedIds))
    setShowBulkDelete(false)
    clearSelection()
    refetch()
  }, [selectedIds, clearSelection, refetch])

  const handleBulkAddTags = useCallback(async (tags: string[]) => {
    const api = (window as any).electronAPI
    await api?.assets.addTagsMultiple(Array.from(selectedIds), tags)
    setShowBulkTag(false)
    refetch()
  }, [selectedIds, refetch])

  const handleBulkAddToComposer = useCallback(async () => {
    const api = (window as any).electronAPI
    const files = await api?.assets.readBase64(Array.from(selectedIds))
    if (files && files.length > 0) {
      composerRef.current?.addRefs(files.map((f: any) => ({ base64: f.base64, mime: f.mime })))
    }
    clearSelection()
  }, [selectedIds, clearSelection])

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
        return clampPan(relX * (1 - scale) + prevPan.x * scale, relY * (1 - scale) + prevPan.y * scale, newZoom)
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
    setPan(prev => clampPan(prev.x + dx, prev.y + dy, zoomRef.current))
  }, [])

  const handleMouseUp = useCallback(() => {
    dragRef.current.active = false
    setIsDragging(false)
  }, [])

  const params = selectedAsset ? (() => { try { return JSON.parse(selectedAsset.parameters || '{}') } catch { return {} } })() : {}

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 pb-32">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-lg font-semibold text-surface-100">Image Generation</h1>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {assets.map((asset: any) => {
              const isSel = selectedIds.has(asset.id)
              return (
              <div key={asset.id} className="card group relative overflow-hidden p-0 cursor-pointer" onClick={() => setSelectedAsset(asset)}>
                <div className="aspect-square bg-surface-800 flex items-center justify-center overflow-hidden">
                  {(() => {
                    const src = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : null)
                    if (src) return <img src={fileUrl(src)} className="w-full h-full object-cover" />
                    if (asset.filePath?.startsWith('__error__')) return (
                      <div className="flex flex-col items-center gap-1.5 text-red-400 px-2">
                        <AlertCircle size={20} />
                        <span className="text-[10px] text-center text-red-400/80 line-clamp-3">{asset.filePath.replace('__error__:', '')}</span>
                      </div>
                    )
                    if (asset.modelUsed && asset.modelUsed !== 'import') return (
                      <div className="flex flex-col items-center gap-2 text-accent-400">
                        <Loader size={24} className="animate-spin" />
                        <span className="text-xs text-surface-500 px-2 text-center line-clamp-2">{asset.prompt}</span>
                      </div>
                    )
                    return <div className="text-surface-600 text-sm">No preview</div>
                  })()}
                </div>
                {!asset.localPath && asset.filePath?.startsWith('http') && (
                  <div className="absolute top-2 right-2 bg-black/60 rounded-md p-1 z-10">
                    <Cloud size={12} className="text-blue-400" />
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSelect(asset.id) }}
                  className={`absolute top-2 left-2 z-10 p-0.5 rounded transition-all ${isSel ? 'opacity-100 bg-accent-500 text-white' : 'opacity-0 group-hover:opacity-100 bg-black/50 text-white hover:bg-black/70'}`}
                >
                  {isSel ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                  {(() => { try { const p = JSON.parse(asset.parameters || '{}'); const ar = p.aspectRatio || p.aspect_ratio; if (ar) return <AssetBadge value={ar} /> } catch {} return null })()}
                  {asset.creditsUsed > 0 && <AssetBadge value={String(asset.creditsUsed)} icon={<Coins size={10} className="text-amber-400" />} />}
                </div>
              </div>
            )})}
          </div>

          {assets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-surface-600">
              <svg xmlns="http://www.w3.org/2000/svg" width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <p className="text-sm">No images yet. Generate using the composer below.</p>
            </div>
          )}
        </div>
      </div>

      <PromptComposer ref={composerRef} onGenerate={handleGenerate} mode="image" />

      <BulkActionBar
        selectedCount={selectedIds.size}
        onAddTags={() => setShowBulkTag(true)}
        onDelete={() => setShowBulkDelete(true)}
        onAddToComposer={handleBulkAddToComposer}
        onClearSelection={clearSelection}
      />

      {showBulkTag && (
        <BulkTagModal
          count={selectedIds.size}
          onApply={handleBulkAddTags}
          onClose={() => setShowBulkTag(false)}
        />
      )}

      {showBulkDelete && (
        <ConfirmDeleteModal
          count={selectedIds.size}
          onConfirm={handleBulkDelete}
          onClose={() => setShowBulkDelete(false)}
        />
      )}

      {/* Detail modal */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedAsset(null)}>
          <div className="bg-surface-950 border border-surface-800 rounded-2xl max-w-5xl w-full mx-4 max-h-[90vh] flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Image */}
            <div
              ref={containerRef}
              className="flex-1 bg-black flex items-center justify-center min-h-[400px] relative overflow-hidden"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {assets.findIndex((a: any) => a.id === selectedAsset.id) > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); const idx = assets.findIndex((a: any) => a.id === selectedAsset.id); setSelectedAsset(assets[idx - 1]) }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors z-10">
                  <ChevronLeft size={20} />
                </button>
              )}
              {assets.findIndex((a: any) => a.id === selectedAsset.id) < assets.length - 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); const idx = assets.findIndex((a: any) => a.id === selectedAsset.id); setSelectedAsset(assets[idx + 1]) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors z-10">
                  <ChevronRight size={20} />
                </button>
              )}
              {(selectedAsset.localPath || (selectedAsset.filePath && !selectedAsset.filePath.startsWith('__error__'))) ? (
                <img
                  ref={imgRef}
                  src={fileUrl(selectedAsset.localPath || selectedAsset.filePath)}
                  className="max-w-full max-h-[80vh] object-contain select-none"
                  draggable={false}
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'center center',
                    cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                  }}
                />
              ) : (
                <div className="text-surface-600">No preview</div>
              )}
              <button onClick={() => setSelectedAsset(null)} className="absolute top-3 right-3 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white/60 hover:text-white z-10">
                <X size={16} />
              </button>
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
            {/* Details */}
            <div className="w-72 bg-surface-900/80 p-5 overflow-y-auto space-y-4 border-l border-surface-800">
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Prompt</p>
                <div className="flex items-start gap-1">
                  <p className="text-sm text-surface-200 leading-relaxed flex-1">{selectedAsset.prompt || '—'}</p>
                  <button onClick={() => { navigator.clipboard.writeText(selectedAsset.prompt); setCopiedPrompt(true); setTimeout(() => setCopiedPrompt(false), 1500) }}
                    className="p-1 text-surface-500 hover:text-surface-100 flex-shrink-0 mt-0.5">
                    {copiedPrompt ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Model</p>
                <p className="text-sm text-surface-200">{MODEL_NAMES[selectedAsset.modelUsed] || selectedAsset.modelUsed || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Task ID</p>
                <p className="text-[11px] font-mono text-surface-400 break-all">{selectedAsset.taskId || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Resolution</p>
                <p className="text-sm text-surface-200">{params.resolution || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Aspect Ratio</p>
                <p className="text-sm text-surface-200">{params.aspectRatio || params.aspect_ratio || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Dimensions</p>
                <p className="text-sm text-surface-200">{selectedAsset.width && selectedAsset.height ? `${selectedAsset.width}×${selectedAsset.height}` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">File Size</p>
                <p className="text-sm text-surface-200">{selectedAsset.fileSize ? `${(selectedAsset.fileSize / 1024).toFixed(0)} KB` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Credits Used</p>
                <p className="text-sm text-amber-400">{selectedAsset.creditsUsed > 0 ? selectedAsset.creditsUsed.toLocaleString() : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Created</p>
                <p className="text-sm text-surface-200">{selectedAsset.createdAt ? new Date(selectedAsset.createdAt).toLocaleString() : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Tags</p>
                <TagEditor
                  tags={(selectedAsset.tags ? selectedAsset.tags.split(',').filter(Boolean) : []).map((t: string) => t.trim())}
                  onChange={async (newTags) => {
                    const api = (window as any).electronAPI
                    if (!api?.assets?.updateTags) return
                    const updated = await api.assets.updateTags(selectedAsset.id, newTags)
                    if (updated) setSelectedAsset(updated)
                  }}
                />
              </div>
              <div className="pt-2 border-t border-surface-800 space-y-1.5">
                <button onClick={() => {
                  try {
                    const p = JSON.parse(selectedAsset.parameters || '{}')
                    composerRef.current?.loadFromParams({
                      prompt: selectedAsset.prompt || '',
                      model: selectedAsset.modelUsed || '',
                      aspectRatio: p.aspectRatio || p.aspect_ratio || 'auto',
                      resolution: p.resolution || '1K',
                      imageBase64: p.imageBase64,
                      imageMime: p.imageMime || 'image/png',
                      imageRefs: p.imageRefs,
                    })
                  } catch {}
                  setSelectedAsset(null)
                }} className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5 text-accent-400 hover:text-accent-300">
                  <RotateCcw size={12} /> Recreate
                </button>
                <button onClick={async () => {
                  setRefreshing(true)
                  try {
                    const api = (window as any).electronAPI
                    if (api?.assets?.refresh) {
                      const updated = await api.assets.refresh(selectedAsset.id)
                      if (updated) setSelectedAsset(updated)
                    } else {
                      const result = await api?.assets.list({ limit: 200 })
                      if (result?.assets) {
                        const updated = result.assets.find((a: any) => a.id === selectedAsset.id)
                        if (updated) setSelectedAsset(updated)
                      }
                    }
                  } catch (err) { console.error('Refresh failed:', err) }
                  refetch()
                  setRefreshing(false)
                }} disabled={refreshing} className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5">
                  <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
                </button>
<button onClick={async () => {
                    const api = (window as any).electronAPI
                    try {
                      const updated = await api.assets.downloadToLocal(selectedAsset.id)
                      refetch()
                      if (updated) setSelectedAsset(updated)
                    } catch (err) { console.error('Download failed:', err) }
                  }} className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5">
<Download size={12} /> Download
                  </button>
                  {(selectedAsset.localPath || (selectedAsset.filePath && !selectedAsset.filePath.startsWith('__error__') && !selectedAsset.filePath.startsWith('http'))) && (
                    <button onClick={() => (window as any).electronAPI?.assets.showInFolder(selectedAsset.id)}
                      className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5">
                      <FolderOpen size={12} /> Show in folder
                    </button>
                  )}
                  <button className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5">
                  <Send size={12} /> Send to Video
                </button>
                {confirmDelete === selectedAsset.id ? (
                  <div className="flex items-center gap-2 justify-center">
                    <span className="text-[11px] text-surface-400">Confirm delete?</span>
                    <button onClick={() => { handleDelete(selectedAsset.id); setConfirmDelete(null) }}
                      className="px-2 py-1 rounded bg-red-500/80 text-white text-[10px] font-medium">Yes</button>
                    <button onClick={() => setConfirmDelete(null)}
                      className="px-2 py-1 rounded bg-white/10 text-white text-[10px]">No</button>
                  </div>
                ) : (
                  <button className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5 text-red-400" onClick={() => setConfirmDelete(selectedAsset.id)}>
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
