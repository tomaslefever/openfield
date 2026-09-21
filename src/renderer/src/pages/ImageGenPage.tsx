import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react'
import { Trash2, Coins, Loader, AlertCircle, Copy, Check, Cloud, FolderOpen, RotateCcw, CheckSquare, Square, Search, X, Star, Box, Clapperboard, Eraser, ImageIcon, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '../stores/app-store'
import { PromptComposer, type PromptComposerHandle } from '../components/PromptComposer'
import { usePagedAssets } from '../hooks/usePagedAssets'
import { useGridFlip } from '../hooks/useGridFlip'
import { fileUrl, srcUrl, thumbUrl } from '../services/file-url'
import { AssetBadge } from '../components/ui/asset-badge'
import { TagEditor } from '../components/ui/TagEditor'
import { BulkActionBar } from '../components/ui/BulkActionBar'
import { ConfirmDeleteModal } from '../components/ui/ConfirmDeleteModal'
import { BulkTagModal } from '../components/ui/BulkTagModal'
import { ImagePreviewModal } from '../components/ui/ImagePreviewModal'
import { ImageGeneration } from '../components/agents/image-generation'
import { ElementWizard } from '../components/ElementWizard'
import { copyText, copyImage } from '../lib/clipboard'
import { downscaleImage } from '../lib/image'
import { cleanModelName } from '../lib/models'

const MODEL_NAMES: Record<string, string> = {
  'gpt-image-2-text-to-image': 'GPT Image 2',
  'gpt-image-2-image-to-image': 'GPT Image 2 I2I',
  'gpt-image-2-5-flare-text-to-image': 'GPT Image 2.5 Flare',
  'gpt-image-2-5-flare-image-to-image': 'GPT Image 2.5 Flare I2I',
  'gpt-image-2-5-sunburst-text-to-image': 'GPT Image 2.5 Sunburst',
  'gpt-image-2-5-sunburst-image-to-image': 'GPT Image 2.5 Sunburst I2I',
  'recraft/remove-background': 'Remove Background',
  'nano-banana-2': 'Nano Banana 2',
  'seedream/5-pro-text-to-image': 'Seedream 5 Pro',
  'seedream/5-pro-image-to-image': 'Seedream 5 Pro I2I',
  'seedream-5-pro-text-to-image': 'Seedream 5 Pro',
  'seedream-5-pro-image-to-image': 'Seedream 5 Pro I2I',
  'flux2-pro-text-to-image': 'Flux 2 Pro',
  'grok-imagine/text-to-image': 'Grok Imagine',
  'imagen4-fast': 'Imagen 4 Fast',
  'openai/gpt-image-2': 'GPT Image 2',
  'openai/gpt-image-2/edit': 'GPT Image 2 Edit',
  'fal-ai/nano-banana-pro': 'Nano Banana Pro',
  'fal-ai/nano-banana-pro/edit': 'Nano Banana Pro Edit',
  'fal-ai/recraft/v4/text-to-image': 'Recraft V4',
  'fal-ai/recraft/v4/pro/text-to-image': 'Recraft V4 Pro',
  'fal-ai/recraft/v3/text-to-image': 'Recraft V3',
  'imagineart/imagineart-2.0-preview/text-to-image': 'ImagineArt 2.0',
  'fal-ai/flux-pro/kontext': 'FLUX.1 Kontext [pro]',
  'fal-ai/flux-krea-lora/stream': 'FLUX Krea LoRA stream',
  'bria/fibo/generate': 'Bria FIBO',
}

const MODAL_ACTION_BTN = 'text-[11px] w-full justify-center flex items-center gap-1.5 px-4 py-2 rounded-xl border border-surface-700 bg-surface-800/60 text-surface-300 hover:bg-surface-700 hover:text-surface-100 hover:border-surface-600 transition-colors'

const AssetCard = memo(function AssetCard({
  asset,
  isSelected,
  onSelect,
  onToggleSelect,
  onToggleFavorite,
  onCopyImage,
  copied,
}: {
  asset: any
  isSelected: boolean
  onSelect: (asset: any, shift: boolean) => void
  onToggleSelect: (id: string, shift: boolean) => void
  onToggleFavorite: (id: string) => void
  onCopyImage: (asset: any) => void
  copied: boolean
}) {
  const params = (() => { try { return JSON.parse(asset.parameters || '{}') } catch { return {} } })()
  const src = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : null)
  const isError = asset.filePath?.startsWith('__error__')
  const isLoading = !asset.localPath && asset.modelUsed && asset.modelUsed !== 'import' && !isError
  const isCloud = !asset.localPath && asset.filePath?.startsWith('http')

  return (
    <div
      data-asset-card={asset.id}
      className="card group relative overflow-hidden p-0 cursor-pointer"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 250px' }}
      onClick={(e) => onSelect(asset, e.shiftKey)}
    >
      <div className="aspect-square bg-surface-800 flex items-center justify-center overflow-hidden">
        {src ? (
          <img src={thumbUrl(src)} className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-1.5 text-red-400 p-3 text-center w-full h-full">
            <AlertCircle size={20} className="flex-shrink-0" />
            <span className="text-[10px] text-red-400/80 line-clamp-3 leading-tight">{asset.filePath.replace('__error__:', '')}</span>
          </div>
        ) : isLoading ? (
          <ImageGeneration
            status="generating"
            size="fill"
            showStatus={false}
            prompt={undefined}
            resolution={undefined}
            className="w-full h-full"
          />
        ) : (
          <div className="text-surface-600 text-sm">No preview</div>
        )}
      </div>
      {!isLoading && (
        <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
          {isCloud && (
            <div className="bg-black/60 rounded-md p-1">
              <Cloud size={12} className="text-blue-400" />
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onCopyImage(asset) }}
            title="Copiar imagen"
            className={`p-1 rounded-md transition-colors ${copied ? 'text-green-400 bg-black/60' : 'text-white/80 bg-black/60 opacity-0 group-hover:opacity-100 hover:text-white'}`}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(asset.id) }}
            title={asset.isFavorite ? 'Remove favorite' : 'Add to favorites'}
            className={`p-1 rounded-md transition-colors ${asset.isFavorite ? 'text-amber-400 bg-black/60' : 'text-white/80 bg-black/60 opacity-0 group-hover:opacity-100 hover:text-amber-400'}`}
          >
            <Star size={12} fill={asset.isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect(asset.id, e.shiftKey) }}
        className={`absolute top-2 left-2 z-10 p-0.5 rounded transition-all ${isSelected ? 'opacity-100 bg-accent-500 text-white' : 'opacity-0 group-hover:opacity-100 bg-black/50 text-white hover:bg-black/70'}`}
      >
        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
      </button>
      {!isLoading && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          {(params.aspectRatio || params.aspect_ratio) && <AssetBadge value={params.aspectRatio || params.aspect_ratio} />}
          {(params.generationTime || params.generationTimeSeconds || params.costTime) && (
            <AssetBadge
              value={params.generationTime || (params.generationTimeSeconds ? `${params.generationTimeSeconds}s` : `${params.costTime}s`)}
              icon={<Clock size={10} className="text-surface-300" />}
            />
          )}
          {asset.creditsUsed > 0 && <AssetBadge value={String(Math.round(asset.creditsUsed))} icon={<Coins size={10} className="text-amber-400" />} />}
        </div>
      )}
    </div>
  )
})

export function ImageGenPage() {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<any>(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkTag, setShowBulkTag] = useState(false)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [creatingFromAsset, setCreatingFromAsset] = useState<{ base64: string; prompt: string } | null>(null)
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [search, setSearch] = useState('')
  const [showFavorites, setShowFavorites] = useState(false)
  const [recreateMsg, setRecreateMsg] = useState<string | null>(null)
  const composerRef = useRef<PromptComposerHandle>(null)
  const composerPayload = useAppStore(s => s.composerPayload)
  const setComposerPayload = useAppStore(s => s.setComposerPayload)
  const setPage = useAppStore(s => s.setPage)

  // Load prompt from Prompt Library regenerate
  useEffect(() => {
    if (composerPayload && composerPayload.mode !== 'video' && composerPayload.mode !== 'audio') {
      setTimeout(() => {
        composerRef.current?.loadFromParams(composerPayload)
        setComposerPayload(null)
      }, 100)
    }
  }, [composerPayload, setComposerPayload])

  const { assets, total, hasMore, initialLoading, loadingMore, sentinelRef, reset, loadMore, updateAsset, removeAssets } = usePagedAssets({ type: 'image', search, isFavorite: showFavorites, pageSize: 20, excludeUploads: true })
  const { gridRef, capture, fadeOut, animate } = useGridFlip()
  const pendingNextRef = useRef(false)

  const handleAssetsMoved = (ids: string[]) => {
    fadeOut(ids)
    setTimeout(() => {
      capture()
      removeAssets(ids)
      requestAnimationFrame(() => requestAnimationFrame(animate))
    }, 180)
  }

  useEffect(() => {
    if (selectedAsset && assets.length > 0) {
      const updated = assets.find((a: any) => a.id === selectedAsset.id)
      if (updated) setSelectedAsset(updated)
    }
  }, [assets, selectedAsset?.id])

  useEffect(() => {
    setPromptExpanded(false)
  }, [selectedAsset?.id])

  // Preload next batch when near the end of loaded assets
  useEffect(() => {
    if (!selectedAsset) return
    const idx = assets.findIndex((a: any) => a.id === selectedAsset.id)
    if (idx >= 0 && idx >= assets.length - 2 && hasMore) {
      loadMore()
    }
  }, [selectedAsset?.id, assets.length, hasMore, loadMore])

  // Advance to next asset if pending from hitting next at the end of the previous batch
  useEffect(() => {
    if (pendingNextRef.current && selectedAsset) {
      const idx = assets.findIndex((a: any) => a.id === selectedAsset.id)
      if (idx >= 0 && idx < assets.length - 1) {
        setSelectedAsset(assets[idx + 1])
        pendingNextRef.current = false
      }
    }
  }, [assets, selectedAsset])

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api) return
    const unsubComplete = api.on('openfield:task:completed', () => reset())
    const unsubFailed = api.on('openfield:task:failed', () => reset())
    const unsubFalComplete = api.on('fal:task:completed', () => reset())
    const unsubFalFailed = api.on('fal:task:failed', () => reset())
    const unsubHfComplete = api.on('higgsfield:task:completed', () => reset())
    const unsubHfFailed = api.on('higgsfield:task:failed', () => reset())
    const unsubMgComplete = api.on('machgen:task:completed', () => reset())
    const unsubMgFailed = api.on('machgen:task:failed', () => reset())
    const unsubRepComplete = api.on('replicate:task:completed', () => reset())
    const unsubRepFailed = api.on('replicate:task:failed', () => reset())
    return () => {
      unsubComplete?.()
      unsubFailed?.()
      unsubFalComplete?.()
      unsubFalFailed?.()
      unsubHfComplete?.()
      unsubHfFailed?.()
      unsubMgComplete?.()
      unsubMgFailed?.()
      unsubRepComplete?.()
      unsubRepFailed?.()
    }
  }, [reset])

  const handleDelete = useCallback(async (assetId: string) => {
    await (window as any).electronAPI?.assets.delete(assetId)
    reset()
    if (selectedAsset?.id === assetId) setSelectedAsset(null)
  }, [reset, selectedAsset])

  const handleToggleFavorite = useCallback(async (id: string) => {
    const updated = await (window as any).electronAPI?.assets.toggleFavorite(id)
    if (updated) {
      updateAsset(updated)
      setSelectedAsset((prev: any) => prev?.id === updated.id ? updated : prev)
    }
  }, [updateAsset])

  const handleCopyImage = useCallback(async (asset: any) => {
    try {
      const api = (window as any).electronAPI
      const results = await api?.assets.readBase64([asset.id])
      const b64 = results?.[0]?.base64 || ''
      const mime = results?.[0]?.mime || 'image/png'
      const ok = await copyImage(b64, mime)
      if (ok) {
        setCopiedAssetId(asset.id)
        setTimeout(() => setCopiedAssetId(null), 1500)
      } else {
        setRecreateMsg('No se pudo copiar la imagen al portapapeles')
        setTimeout(() => setRecreateMsg(null), 3000)
      }
    } catch (err) {
      console.error('Copy image failed:', err)
      setRecreateMsg('No se pudo copiar la imagen al portapapeles')
      setTimeout(() => setRecreateMsg(null), 3000)
    }
  }, [])

  const handleRecreate = useCallback(async () => {
    if (!selectedAsset) return
    try {
      const p = JSON.parse(selectedAsset.parameters || '{}')
      const api = (window as any).electronAPI
      let imageBase64: string | undefined
      if (p.imageAssetId) {
        const results = await api?.assets.readBase64([p.imageAssetId])
        imageBase64 = results?.[0]?.base64 || undefined
      } else if (typeof p.imageBase64 === 'string' && p.imageBase64.length > 50) {
        imageBase64 = p.imageBase64
      }
      let imageRefs: any[] | undefined
      if (Array.isArray(p.imageRefs) && p.imageRefs.length > 0) {
        const ids = p.imageRefs.map((r: any) => r.assetId).filter(Boolean)
        if (ids.length > 0) {
          const results = await api?.assets.readBase64(ids)
          const map = new Map((results || []).map((r: any) => [r.id, r.base64]))
          imageRefs = p.imageRefs.map((r: any) => ({
            ...r,
            base64: r.assetId ? (map.get(r.assetId) || '') : (r.base64 || ''),
          })).filter((r: any) => r.base64?.length > 20)
        } else {
          imageRefs = p.imageRefs.filter((r: any) => r.base64?.length > 50)
        }
      }
      let firstFrameBase64: string | undefined
      let lastFrameBase64: string | undefined
      if (p.firstFrameAssetId) {
        const results = await api?.assets.readBase64([p.firstFrameAssetId])
        firstFrameBase64 = results?.[0]?.base64 || undefined
      } else if (typeof p.firstFrameBase64 === 'string' && p.firstFrameBase64.length > 50) {
        firstFrameBase64 = p.firstFrameBase64
      }
      if (p.lastFrameAssetId) {
        const results = await api?.assets.readBase64([p.lastFrameAssetId])
        lastFrameBase64 = results?.[0]?.base64 || undefined
      } else if (typeof p.lastFrameBase64 === 'string' && p.lastFrameBase64.length > 50) {
        lastFrameBase64 = p.lastFrameBase64
      }
      if (!imageBase64 && (!imageRefs || imageRefs.length === 0) && !firstFrameBase64 && !lastFrameBase64) {
        setRecreateMsg('Esta imagen no tiene referencias guardadas para adjuntar.')
      }
      composerRef.current?.loadFromParams({
        prompt: selectedAsset.prompt || '',
        model: selectedAsset.modelUsed || '',
        aspectRatio: p.aspectRatio || p.aspect_ratio || 'auto',
        resolution: p.resolution || '1K',
        imageBase64,
        imageMime: p.imageMime || 'image/png',
        imageRefs: imageRefs?.length ? imageRefs : undefined,
        firstFrameBase64,
        lastFrameBase64,
      })
    } catch (err: any) {
      console.error('Recreate failed:', err)
      setRecreateMsg(`Error al recrear: ${err?.message || String(err)}`)
    }
    setSelectedAsset(null)
  }, [selectedAsset])

  const handleGenerate = useCallback(async (params: any) => {
    try {
      const api = (window as any).electronAPI
      const isFalModel = params?.provider === 'fal' || params?.model?.startsWith('fal-ai/') || params?.model?.startsWith('imagineart/')
      const isHiggsfieldModel = params?.provider === 'higgsfield' || params?.model?.startsWith('higgsfield/')
      const isMachgenModel = params?.provider === 'machgen' || params?.model?.startsWith('machgen/')
      const isReplicateModel = params?.provider === 'replicate' || params?.model?.startsWith('black-forest-labs/') || params?.model?.startsWith('ideogram-ai/')
      if (isHiggsfieldModel) {
        await api?.higgsfield.generate(params)
      } else if (isFalModel) {
        await api?.fal.generate(params)
      } else if (isMachgenModel) {
        await api?.machgen.generate(params)
      } else if (isReplicateModel) {
        await api?.replicate.generate(params)
      } else if (params.local && params.modelId) {
        await api?.local.imageGenerate({
          modelId: params.modelId,
          prompt: params.prompt,
          width: params.resolution === '2K' ? 2048 : params.resolution === '4K' ? 4096 : 1024,
          height: params.resolution === '2K' ? 2048 : params.resolution === '4K' ? 4096 : 1024,
          steps: 4,
          guidance: 0,
          seed: -1,
        })
      } else {
        await api?.openfield.generateImage(params)
      }
      reset()
    } catch (err) { console.error('Generation failed:', err) }
  }, [reset])

  const lastSelectedRef = useRef<string | null>(null)

  const toggleSelect = useCallback((id: string, shift = false) => {
    setSelectedIds(prev => {
      if (shift && lastSelectedRef.current && lastSelectedRef.current !== id) {
        const idxs = assets.map(a => a.id)
        const start = idxs.indexOf(lastSelectedRef.current)
        const end = idxs.indexOf(id)
        if (start >= 0 && end >= 0) {
          const [lo, hi] = start < end ? [start, end] : [end, start]
          const next = new Set(prev)
          for (let i = lo; i <= hi; i++) next.add(idxs[i])
          return next
        }
      }
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      lastSelectedRef.current = id
      return next
    })
  }, [assets])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleBulkDelete = useCallback(async () => {
    const api = (window as any).electronAPI
    await api?.assets.deleteMultiple(Array.from(selectedIds))
    setShowBulkDelete(false)
    clearSelection()
    reset()
  }, [selectedIds, clearSelection, reset])

  const handleBulkArchive = useCallback(async () => {
    const api = (window as any).electronAPI
    const count = selectedIds.size
    if (count === 0) return
    try {
      await api?.assets.archiveMultiple(Array.from(selectedIds), true)
      toast.success(`${count} ${count === 1 ? 'imagen archivada' : 'imágenes archivadas'}`)
      clearSelection()
      reset()
    } catch (err) {
      console.error('[ImageGenPage] Bulk archive failed:', err)
      toast.error('Error al archivar imágenes')
    }
  }, [selectedIds, clearSelection, reset])

  const handleBulkAddTags = useCallback(async (tags: string[]) => {
    const api = (window as any).electronAPI
    await api?.assets.addTagsMultiple(Array.from(selectedIds), tags)
    setShowBulkTag(false)
    reset()
  }, [selectedIds, reset])

  const handleBulkAddToComposer = useCallback(async () => {
    const api = (window as any).electronAPI
    const files = await api?.assets.readBase64(Array.from(selectedIds))
    if (files && files.length > 0) {
      composerRef.current?.addRefs(files.map((f: any) => ({ base64: f.base64, mime: f.mime })))
    }
    clearSelection()
  }, [selectedIds, clearSelection])

  const params = useMemo(() => selectedAsset ? (() => { try { return JSON.parse(selectedAsset.parameters || '{}') } catch { return {} } })() : {}, [selectedAsset])

  return (
    <div className="flex flex-col h-full relative">
      {recreateMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-surface-800 border border-surface-700 rounded-lg px-4 py-2 shadow-xl text-xs text-surface-200 flex items-center gap-2">
          <span>{recreateMsg}</span>
          <button onClick={() => setRecreateMsg(null)} className="text-surface-500 hover:text-surface-300">
            <X size={12} />
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 pb-64">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-surface-600">{total} images</span>
            <div className="relative flex-1 max-w-xs ml-auto">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by tag or prompt..."
                className="input-field pl-8 text-xs w-full"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFavorites(v => !v)}
              title={showFavorites ? 'Show all images' : 'Show favorites only'}
              className={`flex-shrink-0 p-1.5 rounded-lg border transition-colors ${showFavorites ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'border-surface-800 text-surface-500 hover:text-amber-400 hover:border-amber-500/30'}`}
            >
              <Star size={14} fill={showFavorites ? 'currentColor' : 'none'} />
            </button>
          </div>
          <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {assets.map((asset: any) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                isSelected={selectedIds.has(asset.id)}
                onSelect={(asset, shift) => { if (shift) toggleSelect(asset.id, true); else setSelectedAsset(asset) }}
                onToggleSelect={toggleSelect}
                onToggleFavorite={handleToggleFavorite}
                onCopyImage={handleCopyImage}
                copied={copiedAssetId === asset.id}
              />            ))}
          </div>

          {initialLoading && assets.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-16 text-surface-500">
              <Loader size={20} className="animate-spin text-accent-400" />
              <span className="text-xs">Loading...</span>
            </div>
          )}

          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center py-6">
              {loadingMore && <Loader size={16} className="animate-spin text-surface-500" />}
            </div>
          )}

          {assets.length === 0 && !initialLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-surface-600">
              <svg xmlns="http://www.w3.org/2000/svg" width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <p className="text-sm">No images yet. Generate using the composer below.</p>
            </div>
          )}
        </div>
      </div>

      <PromptComposer
        ref={composerRef}
        onGenerate={handleGenerate}
        mode="image"
        onModeChange={(m) => {
          if (m === 'video') setPage('video')
        }}
        floating
      />

      <BulkActionBar
        selectedCount={selectedIds.size}
        selectedIds={Array.from(selectedIds)}
        onAddTags={() => setShowBulkTag(true)}
        onDelete={() => setShowBulkDelete(true)}
        onArchive={handleBulkArchive}
        onAddToComposer={handleBulkAddToComposer}
        onClearSelection={clearSelection}
        onAssetsMoved={handleAssetsMoved}
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
        <ImagePreviewModal
          src={fileUrl(selectedAsset.localPath || (selectedAsset.filePath && !selectedAsset.filePath.startsWith('__error__') ? selectedAsset.filePath : ''))}
          status={selectedAsset.filePath?.startsWith('__error__') ? 'error' : (!selectedAsset.localPath && selectedAsset.modelUsed && selectedAsset.modelUsed !== 'import' ? 'generating' : undefined)}
          prompt={selectedAsset.prompt || params.prompt}
          resolution={params.resolution || params.size}
          aspectRatio={params.aspectRatio || '1 / 1'}
          statusText={selectedAsset.filePath?.startsWith('__error__') ? selectedAsset.filePath.replace('__error__:', '') : 'Generando imagen...'}
          onRetry={handleRecreate}
          onClose={() => setSelectedAsset(null)}
          isFavorite={!!selectedAsset.isFavorite}
          onToggleFavorite={() => handleToggleFavorite(selectedAsset.id)}
          onCopyImage={() => handleCopyImage(selectedAsset)}
          copiedImage={copiedAssetId === selectedAsset.id}
          onPrev={assets.findIndex((a: any) => a.id === selectedAsset.id) > 0 ? () => {
            const idx = assets.findIndex((a: any) => a.id === selectedAsset.id)
            setSelectedAsset(assets[idx - 1])
          } : undefined}
          onNext={(() => {
            const idx = assets.findIndex((a: any) => a.id === selectedAsset.id)
            if (idx < 0) return undefined
            if (idx < assets.length - 1) {
              return () => {
                setSelectedAsset(assets[idx + 1])
                if (idx + 1 >= assets.length - 2 && hasMore) {
                  loadMore()
                }
              }
            }
            if (hasMore) {
              return () => {
                pendingNextRef.current = true
                loadMore()
              }
            }
            return undefined
          })()}
        >
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Prompt</p>
            <div className="flex items-start gap-1">
              <p
                onClick={() => setPromptExpanded(!promptExpanded)}
                className={`text-sm text-surface-200 leading-relaxed flex-1 cursor-pointer select-none ${promptExpanded ? '' : 'line-clamp-3'}`}
                title={promptExpanded ? 'Click para contraer' : 'Click para expandir'}
              >
                {selectedAsset.prompt || params.prompt || '—'}
              </p>
              <button onClick={() => { copyText(selectedAsset.prompt || params.prompt || ''); setCopiedPrompt(true); setTimeout(() => setCopiedPrompt(false), 1500) }}
                className="p-1 text-surface-500 hover:text-surface-100 flex-shrink-0 mt-0.5">
                {copiedPrompt ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider">Model</p>
              <p className="text-xs text-surface-200 truncate">{cleanModelName(MODEL_NAMES[selectedAsset.modelUsed] || selectedAsset.modelUsed) || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider">Credits</p>
              <p className="text-xs text-amber-400">{selectedAsset.creditsUsed > 0 ? Math.round(selectedAsset.creditsUsed).toLocaleString() : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider">Resolution</p>
              <p className="text-xs text-surface-200">{params.resolution || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider">Dimensions</p>
              <p className="text-xs text-surface-200">{selectedAsset.width && selectedAsset.height ? `${selectedAsset.width}×${selectedAsset.height}` : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider">Aspect Ratio</p>
              <p className="text-xs text-surface-200">{params.aspectRatio || params.aspect_ratio || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider">File Size</p>
              <p className="text-xs text-surface-200">{selectedAsset.fileSize ? `${(selectedAsset.fileSize / 1024).toFixed(0)} KB` : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider">Gen Time</p>
              <p className="text-xs text-surface-200">
                {params.generationTime || (params.generationTimeSeconds ? `${params.generationTimeSeconds}s` : (params.costTime ? `${params.costTime}s` : '—'))}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider">Created</p>
              <p className="text-xs text-surface-200">{selectedAsset.createdAt ? new Date(selectedAsset.createdAt).toLocaleString() : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider">Task ID</p>
              <p className="text-[10px] font-mono text-surface-400 truncate">{selectedAsset.taskId || '—'}</p>
            </div>
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
          <div className="pt-2 border-t border-surface-800 grid grid-cols-2 gap-1.5">
            <button onClick={handleRecreate} className={MODAL_ACTION_BTN}>
              <RotateCcw size={12} /> Recreate
            </button>
            <button onClick={async () => {
              try {
                const api = (window as any).electronAPI
                const results = await api?.assets.readBase64([selectedAsset.id])
                const b64 = results?.[0]?.base64 || ''
                const mime = results?.[0]?.mime || 'image/png'
                composerRef.current?.addRefs([{ base64: b64, mime }])
                setSelectedAsset(null)
              } catch (err) { console.error('Reference failed:', err) }
            }} className={MODAL_ACTION_BTN}>
              <ImageIcon size={12} /> Reference
            </button>
            <button onClick={async () => {
              try {
                const api = (window as any).electronAPI
                const results = await api?.assets.readBase64([selectedAsset.id])
                let b64 = results?.[0]?.base64 || ''
                const mime = results?.[0]?.mime || 'image/png'
                if (b64.length > 6990508) b64 = await downscaleImage(b64, mime)
                setComposerPayload({
                  mode: 'image',
                  prompt: 'Remove background',
                  model: 'recraft/remove-background',
                  imageBase64: b64,
                  imageMime: 'image/jpeg',
                })
              } catch (err) { console.error('Remove background failed:', err) }
              setSelectedAsset(null)
            }} className={MODAL_ACTION_BTN}>
              <Eraser size={12} /> Quitar fondo
            </button>
            <button onClick={async () => {
              try {
                const api = (window as any).electronAPI
                const results = await api?.assets.readBase64([selectedAsset.id])
                const b64 = results?.[0]?.base64 || ''
                const mime = results?.[0]?.mime || 'image/png'
                setComposerPayload({
                  mode: 'video',
                  prompt: selectedAsset.prompt || '',
                  imageBase64: b64,
                  imageMime: mime,
                })
                setPage('video')
              } catch (err) { console.error('Animate failed:', err) }
              setSelectedAsset(null)
            }} className={MODAL_ACTION_BTN}>
              <Clapperboard size={12} /> Animar
            </button>
            {(selectedAsset.localPath || (selectedAsset.filePath && !selectedAsset.filePath.startsWith('__error__') && !selectedAsset.filePath.startsWith('http'))) && (
              <button onClick={() => (window as any).electronAPI?.assets.showInFolder(selectedAsset.id)}
                className={MODAL_ACTION_BTN}>
                <FolderOpen size={12} /> Show in folder
              </button>
            )}
            <button onClick={async () => {
              try {
                const api = (window as any).electronAPI
                const results = await api?.assets.readBase64([selectedAsset.id])
                const b64 = results?.[0]?.base64 || ''
                setSelectedAsset(null)
                setTimeout(() => {
                  setCreatingFromAsset({ base64: b64, prompt: selectedAsset.prompt || '' })
                }, 100)
              } catch (err) { console.error('Failed to create element:', err) }
            }} className={MODAL_ACTION_BTN}>
              <Box size={12} /> Crear elemento
            </button>
            {confirmDelete === selectedAsset.id ? (
              <div className="flex items-center gap-2 justify-center col-span-2">
                <span className="text-[11px] text-surface-400">Confirm delete?</span>
                <button onClick={() => { handleDelete(selectedAsset.id); setConfirmDelete(null) }}
                  className="px-3 py-1.5 rounded-xl border border-surface-700 bg-surface-800/60 text-surface-300 text-[10px] font-medium hover:bg-surface-700 hover:text-surface-100 transition-colors">Yes</button>
                <button onClick={() => setConfirmDelete(null)}
                  className="px-3 py-1.5 rounded-xl border border-surface-700 bg-surface-800/60 text-surface-300 text-[10px] font-medium hover:bg-surface-700 hover:text-surface-100 transition-colors">No</button>
              </div>
            ) : (
              <button className={MODAL_ACTION_BTN} onClick={() => setConfirmDelete(selectedAsset.id)}>
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
        </ImagePreviewModal>
      )}

      {creatingFromAsset && (
        <ElementWizard
          initialData={{
            imageBase64: creatingFromAsset.base64,
            prompt: creatingFromAsset.prompt,
          }}
          onClose={() => setCreatingFromAsset(null)}
        />
      )}
    </div>
  )
}
