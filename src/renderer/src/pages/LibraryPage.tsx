import { useState, useCallback, useEffect, useRef } from 'react'
import { Search, Download, Trash2, Star, Cloud, CheckSquare, Square, Loader, AlertCircle, X, ChevronLeft, ChevronRight, Copy, Check, RotateCcw, FolderOpen, Clock, Tag } from 'lucide-react'
import { srcUrl } from '../services/file-url'
import { usePagedAssets } from '../hooks/usePagedAssets'
import { useAppStore } from '../stores/app-store'
import { TagEditor } from '../components/ui/TagEditor'
import { AutoPlayVideo } from '../components/ui/AutoPlayVideo'
import { BulkActionBar } from '../components/ui/BulkActionBar'
import { ConfirmDeleteModal } from '../components/ui/ConfirmDeleteModal'
import { BulkTagModal } from '../components/ui/BulkTagModal'
import { copyText } from '../lib/clipboard'

const MODEL_NAMES: Record<string, string> = {
  'gpt-image-2-text-to-image': 'GPT Image 2',
  'gpt-image-2-image-to-image': 'GPT Image 2 I2I',
  'recraft/remove-background': 'Remove Background',
  'nano-banana-2': 'Nano Banana 2',
  'seedream-5-pro-text-to-image': 'Seedream 5 Pro',
  'flux2-pro-text-to-image': 'Flux 2 Pro',
  'grok-imagine/text-to-image': 'Grok Imagine',
  'imagen4-fast': 'Imagen 4 Fast',
  'kling-3.0/video': 'Kling 3.0',
  'kling/v25-turbo-text-to-video-pro': 'Kling 2.5 Turbo',
  'kling/v25-turbo-image-to-video-pro': 'Kling 2.5 Turbo',
  'grok-imagine/text-to-video': 'Grok Imagine',
  'grok-imagine/image-to-video': 'Grok Imagine',
  'bytedance/seedance-2': 'Seedance 2',
  'bytedance/seedance-2-5': 'Seedance 2.5',
  'bytedance/seedance-2-fast': 'Seedance 2 Fast',
  'bytedance/seedance-2-mini': 'Seedance 2 Mini',
  'wan-2-7-text-to-video': 'Wan 2.7',
  'wan-2-7-image-to-video': 'Wan 2.7',
  'hailuo/02-text-to-video-pro': 'Hailuo 2 Pro',
  'gemini-omni-video': 'Gemini Omni',
  'prunaai/p-video-avatar': 'P-Video Avatar',
  'minimax/h3/reference-to-video': 'MiniMax H3',
  'gpt-tts-1': 'GPT TTS',
  'minimax-text-to-speech': 'MiniMax TTS',
  'openaudio-text-to-music': 'OpenAudio Music',
  'mucat-text-to-music': 'MuCat Music',
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

export function LibraryPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video' | 'audio'>('all')
  const [showFavorites, setShowFavorites] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<any>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkTag, setShowBulkTag] = useState(false)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [allTags, setAllTags] = useState<string[]>([])
  const [tagMenuOpen, setTagMenuOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const { assets, total, hasMore, initialLoading, loadingMore, sentinelRef, reset, updateAsset } = usePagedAssets({ type: typeFilter === 'all' ? undefined : typeFilter, search, isFavorite: showFavorites, pageSize: 20, excludeUploads: true })

  const setComposerPayload = useAppStore(s => s.setComposerPayload)
  const setPage = useAppStore(s => s.setPage)

  // Hover-play for videos (same behavior as VideoGen)
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())
  const getVideoEl = (id: string) => videoRefs.current.get(id) || document.querySelector(`[data-video-id="${id}"]`) as HTMLVideoElement | null
  const playTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const playAttemptsRef = useRef<Map<string, number>>(new Map())

  const handleMouseEnter = (id: string) => {
    const el = getVideoEl(id)
    if (!el) return
    el.currentTime = 0
    el.muted = true
    el.play().catch(() => {})
    playAttemptsRef.current.set(id, 0)
    const interval = setInterval(() => {
      const attempts = playAttemptsRef.current.get(id) || 0
      if (attempts >= 25) { clearInterval(interval); playTimerRef.current.delete(id); playAttemptsRef.current.delete(id); return }
      playAttemptsRef.current.set(id, attempts + 1)
      if (el.paused && el.readyState >= 2) { el.play().catch(() => {}) }
    }, 500)
    playTimerRef.current.set(id, interval)
  }
  const handleMouseLeave = (id: string) => {
    const el = getVideoEl(id)
    if (el) { el.pause(); el.currentTime = 0 }
    const timer = playTimerRef.current.get(id)
    if (timer) { clearInterval(timer); playTimerRef.current.delete(id) }
    playAttemptsRef.current.delete(id)
  }

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api) return
    const unsubComplete = api.on('openfield:task:completed', () => reset())
    const unsubFailed = api.on('openfield:task:failed', () => reset())
    const unsubRpComplete = api.on('replicate:task:completed', () => reset())
    const unsubRpFailed = api.on('replicate:task:failed', () => reset())
    const unsubFalComplete = api.on('fal:task:completed', () => reset())
    const unsubFalFailed = api.on('fal:task:failed', () => reset())
    return () => { unsubComplete?.(); unsubFailed?.(); unsubRpComplete?.(); unsubRpFailed?.(); unsubFalComplete?.(); unsubFalFailed?.() }
  }, [reset])

  useEffect(() => {
    (window as any).electronAPI?.assets?.tags?.().then(setAllTags).catch(() => {})
  }, [reset])

  useEffect(() => {
    if (!selectedAsset) return
    const handler = (e: KeyboardEvent) => {
      const idx = assets.findIndex((a: any) => a.id === selectedAsset.id)
      if (e.key === 'ArrowLeft' && idx > 0) setSelectedAsset(assets[idx - 1])
      if (e.key === 'ArrowRight' && idx < assets.length - 1) setSelectedAsset(assets[idx + 1])
      if (e.key === 'Escape') setSelectedAsset(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedAsset, assets])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setTagMenuOpen(false)
    }
    window.addEventListener('mousedown', onDocClick)
    return () => window.removeEventListener('mousedown', onDocClick)
  }, [])

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

  const handleBulkAddToComposer = useCallback(async () => {
    const api = (window as any).electronAPI
    const files = await api?.assets.readBase64(Array.from(selectedIds))
    if (files && files.length > 0) {
      setComposerPayload({
        mode: 'video',
        prompt: '',
        imageBase64: files[0].base64,
        imageMime: files[0].mime,
        imageRefs: files.map((f: any) => ({ base64: f.base64, mime: f.mime })),
      })
      setPage('video')
    }
    clearSelection()
  }, [selectedIds, clearSelection, setComposerPayload, setPage])

  const handleBulkDelete = useCallback(async () => {
    const api = (window as any).electronAPI
    await api?.assets.deleteMultiple(Array.from(selectedIds))
    setShowBulkDelete(false)
    clearSelection()
    reset()
  }, [selectedIds, clearSelection, reset])

  const handleBulkAddTags = useCallback(async (tags: string[]) => {
    const api = (window as any).electronAPI
    await api?.assets.addTagsMultiple(Array.from(selectedIds), tags)
    setShowBulkTag(false)
    reset()
  }, [selectedIds, reset])

  const params = selectedAsset ? (() => { try { return JSON.parse(selectedAsset.parameters || '{}') } catch { return {} } })() : {}

  const handleRecreate = async () => {
    if (!selectedAsset) return
    try {
      const api = (window as any).electronAPI
      const p = JSON.parse(selectedAsset.parameters || '{}')
      const loadRefs = async (refs: any[]) => {
        if (!refs?.length) return undefined
        const ids = refs.map(r => r.assetId).filter(Boolean)
        if (ids.length > 0) {
          const results = await api?.assets.readBase64(ids)
          const map = new Map((results || []).map((r: any) => [r.id, r.base64]))
          return refs.map(r => ({ ...r, base64: r.assetId ? (map.get(r.assetId) || '') : (r.base64 || '') })).filter((r: any) => r.base64?.length > 20)
        }
        return refs.filter((r: any) => r.base64?.length > 50)
      }
      const loadImg = async (key: string) => {
        const assetKey = key === 'imageBase64' ? 'imageAssetId' : key === 'firstFrameBase64' ? 'firstFrameAssetId' : key === 'lastFrameBase64' ? 'lastFrameAssetId' : (key + 'AssetId')
        const assetId = p[assetKey] || p[key + 'AssetId']
        if (assetId) { const r = await api?.assets.readBase64([assetId]); return r?.[0]?.base64 || undefined }
        if (typeof p[key] === 'string' && p[key].length > 50) return p[key]
        return undefined
      }

      const base = {
        prompt: selectedAsset.prompt || '',
        model: selectedAsset.modelUsed || '',
        aspectRatio: p.aspectRatio || p.aspect_ratio || undefined,
        resolution: p.resolution || undefined,
      }

      if (selectedAsset.type === 'audio') {
        setComposerPayload({ ...base, mode: 'audio', duration: p.duration ?? undefined })
        setPage('audio')
      } else if (selectedAsset.type === 'image') {
        setComposerPayload({
          ...base,
          mode: 'image',
          imageBase64: await loadImg('imageBase64'),
          imageMime: p.imageMime || 'image/png',
          imageRefs: await loadRefs(p.imageRefs),
          firstFrameBase64: await loadImg('firstFrameBase64'),
          lastFrameBase64: await loadImg('lastFrameBase64'),
        })
        setPage('image')
      } else {
        setComposerPayload({
          ...base,
          mode: 'video',
          duration: p.duration ?? undefined,
          fps: p.fps ?? undefined,
          sound: p.sound ?? undefined,
          imageBase64: await loadImg('imageBase64'),
          imageMime: p.imageMime || 'image/png',
          imageRefs: await loadRefs(p.imageRefs),
          videoRefs: await loadRefs(p.videoRefs),
          audioRefs: await loadRefs(p.audioRefs),
          firstFrameBase64: await loadImg('firstFrameBase64'),
          lastFrameBase64: await loadImg('lastFrameBase64'),
          multiShots: p.multiShots,
          multiPrompt: p.multiPrompt,
          voice: p.voice,
          voiceLanguage: p.voiceLanguage,
          provider: p.provider,
        })
        setPage('video')
      }
    } catch (err) { console.error('Recreate failed:', err) }
    setSelectedAsset(null)
  }

  const filteredTags = allTags.filter(t => t.toLowerCase().includes(search.trim().toLowerCase()))

  const modalSrc = selectedAsset && (selectedAsset.localPath || (selectedAsset.filePath && !selectedAsset.filePath.startsWith('__error__') ? selectedAsset.filePath : ''))

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-surface-600">{total} assets</span>
            <div className="relative flex-1 max-w-xs ml-auto" ref={searchRef}>
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setTagMenuOpen(true) }}
                onFocus={() => setTagMenuOpen(true)}
                placeholder="Search by tag, prompt, model..."
                className="input-field pl-8 text-xs w-full"
              />
              {search && (
                <button onClick={() => { setSearch(''); setTagMenuOpen(true) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                  <X size={12} />
                </button>
              )}
              {tagMenuOpen && filteredTags.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-surface-800 border border-surface-700 rounded-xl py-1 shadow-xl z-50 max-h-[240px] overflow-y-auto">
                  {filteredTags.map((t) => (
                    <button
                      key={t}
                      onClick={() => { setSearch(t); setTagMenuOpen(false) }}
                      className="w-full text-left px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-700/60 hover:text-surface-100 flex items-center gap-2"
                    >
                      <Tag size={11} className="text-surface-500" />
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowFavorites(v => !v)}
              title={showFavorites ? 'Show all assets' : 'Show favorites only'}
              className={`flex-shrink-0 p-1.5 rounded-lg border transition-colors ${showFavorites ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'border-surface-800 text-surface-500 hover:text-amber-400 hover:border-amber-500/30'}`}
            >
              <Star size={14} fill={showFavorites ? 'currentColor' : 'none'} />
            </button>
            <div className="flex gap-1 bg-surface-900 rounded-lg p-1 border border-surface-800">
              {(['all', 'image', 'video', 'audio'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${typeFilter === t ? 'bg-surface-800 text-surface-100' : 'text-surface-500 hover:text-surface-100'}`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {assets.map((asset: any) => {
              const isSel = selectedIds.has(asset.id)
              const src = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : null)
              const isError = asset.filePath?.startsWith('__error__')
              const isLoading = !asset.localPath && asset.modelUsed && asset.modelUsed !== 'import' && !isError
              return (
                <div key={asset.id} className="card group relative overflow-hidden p-0 cursor-pointer aspect-square"
                  onClick={(e) => { if (e.shiftKey) { toggleSelect(asset.id, true) } else { setSelectedAsset(asset) } }}
                  onMouseEnter={asset.type === 'video' ? () => handleMouseEnter(asset.id) : undefined}
                  onMouseLeave={asset.type === 'video' ? () => handleMouseLeave(asset.id) : undefined}
                >
                  <div className="w-full h-full bg-surface-800 flex items-center justify-center overflow-hidden">
                    {src ? (
                      asset.type === 'video' ? (
                        <video ref={(el) => { if (el) { videoRefs.current.set(asset.id, el); el.muted = true } else videoRefs.current.delete(asset.id) }} data-video-id={asset.id} src={srcUrl(src)} className="w-full h-full object-cover" preload="auto" loop playsInline />
                      ) : (
                        <img src={srcUrl(src)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      )
                    ) : isError ? (
                      <div className="flex flex-col items-center gap-1.5 text-red-400 px-2">
                        <AlertCircle size={20} />
                        <span className="text-[10px] text-center text-red-400/80 line-clamp-3">{asset.filePath.replace('__error__:', '')}</span>
                      </div>
                    ) : isLoading ? (
                      <div className="flex items-center justify-center text-accent-400">
                        <Loader size={24} className="animate-spin" />
                      </div>
                    ) : (
                      <div className="text-surface-600 text-sm">No preview</div>
                    )}
                  </div>
                  <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                    {!asset.localPath && asset.filePath?.startsWith('http') && (
                      <div className="bg-black/60 rounded-md p-1">
                        <Cloud size={12} className="text-blue-400" />
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleFavorite(asset.id) }}
                      title={asset.isFavorite ? 'Remove favorite' : 'Add to favorites'}
                      className={`p-1 rounded-md transition-colors ${asset.isFavorite ? 'text-amber-400 bg-black/60' : 'text-white/80 bg-black/60 opacity-0 group-hover:opacity-100 hover:text-amber-400'}`}
                    >
                      <Star size={12} fill={asset.isFavorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(asset.id, e.shiftKey) }}
                    className={`absolute top-2 left-2 z-10 p-0.5 rounded transition-all ${isSel ? 'opacity-100 bg-accent-500 text-white' : 'opacity-0 group-hover:opacity-100 bg-black/50 text-white hover:bg-black/70'}`}
                  >
                    {isSel ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                  <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(asset.id) }} className="p-1.5 rounded-lg bg-black/50 text-white hover:text-red-400 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
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
              <p className="text-sm">No assets found. Generate images/videos or import files.</p>
            </div>
          )}
        </div>
      </div>

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

      {/* Unified detail modal (same as ImageGen/VideoGen) */}
      {selectedAsset && modalSrc && (
        <LibraryAssetModal
          asset={selectedAsset}
          src={modalSrc}
          params={params}
          onClose={() => setSelectedAsset(null)}
          onPrev={assets.findIndex((a: any) => a.id === selectedAsset.id) > 0 ? () => {
            const idx = assets.findIndex((a: any) => a.id === selectedAsset.id)
            setSelectedAsset(assets[idx - 1])
          } : undefined}
          onNext={assets.findIndex((a: any) => a.id === selectedAsset.id) < assets.length - 1 ? () => {
            const idx = assets.findIndex((a: any) => a.id === selectedAsset.id)
            setSelectedAsset(assets[idx + 1])
          } : undefined}
          onAssetChange={(updated) => setSelectedAsset(updated)}
          onToggleFavorite={() => handleToggleFavorite(selectedAsset.id)}
          onDelete={() => handleDelete(selectedAsset.id)}
          onRecreate={handleRecreate}
        />
      )}
    </div>
  )
}

function LibraryAssetModal({
  asset, src, params, onClose, onPrev, onNext, onAssetChange, onToggleFavorite, onDelete, onRecreate,
}: {
  asset: any
  src: string
  params: any
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  onAssetChange: (asset: any) => void
  onToggleFavorite: () => void
  onDelete: () => void
  onRecreate: () => void
}) {
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'done'>('idle')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 })
  const zoomRef = useRef(1)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [asset.id, src])

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

  const isImage = asset.type === 'image'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface-950 border border-surface-800 rounded-2xl max-w-5xl w-full mx-4 max-h-[90vh] flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Media */}
        <div
          ref={containerRef}
          className="flex-1 bg-black flex items-center justify-center min-h-[400px] relative overflow-hidden"
          onWheel={isImage ? handleWheel : undefined}
          onMouseDown={isImage ? handleMouseDown : undefined}
          onMouseMove={isImage ? handleMouseMove : undefined}
          onMouseUp={isImage ? handleMouseUp : undefined}
          onMouseLeave={isImage ? handleMouseUp : undefined}
        >
          {onPrev && (
            <button onClick={(e) => { e.stopPropagation(); onPrev() }}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors z-10">
              <ChevronLeft size={20} />
            </button>
          )}
          {onNext && (
            <button onClick={(e) => { e.stopPropagation(); onNext() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors z-10">
              <ChevronRight size={20} />
            </button>
          )}
          {isImage ? (
            <img
              ref={imgRef}
              src={src}
              alt=""
              className="max-w-full max-h-[80vh] object-contain select-none"
              draggable={false}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
              }}
            />
          ) : asset.type === 'video' ? (
            <AutoPlayVideo key={asset.id} src={srcUrl(src)} className="max-w-full max-h-[80vh] object-contain" />
          ) : (
            <audio controls src={srcUrl(src)} className="max-w-full px-4" autoPlay />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
            title={asset.isFavorite ? 'Remove favorite' : 'Add to favorites'}
            className={`absolute top-3 right-3 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center z-10 transition-colors ${asset.isFavorite ? 'text-amber-400' : 'text-white/60 hover:text-amber-400'}`}
          >
            <Star size={14} fill={asset.isFavorite ? 'currentColor' : 'none'} />
          </button>
          {zoom > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5 z-10">
              <span className="text-white/80 text-xs font-medium">{Math.round(zoom * 100)}%</span>
              <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} className="text-white/60 hover:text-white text-xs">Reset</button>
            </div>
          )}
        </div>
        {/* Details */}
        <div className="w-72 bg-surface-900/80 border-l border-surface-800 flex flex-col">
          <div className="flex items-center justify-end px-3 py-2 border-b border-surface-800 flex-shrink-0">
            <button onClick={onClose} title="Close"
              className="w-7 h-7 rounded-full flex items-center justify-center text-surface-500 hover:text-white hover:bg-surface-800 transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Prompt</p>
            <div className="flex items-start gap-1">
              <p className="text-sm text-surface-200 leading-relaxed flex-1 line-clamp-4">{asset.prompt || params.prompt || '—'}</p>
              <button onClick={() => { copyText(asset.prompt || params.prompt || ''); setCopiedPrompt(true); setTimeout(() => setCopiedPrompt(false), 1500) }}
                className="p-1 text-surface-500 hover:text-surface-100 flex-shrink-0 mt-0.5">
                {copiedPrompt ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Model</p>
            <p className="text-sm text-surface-200">{MODEL_NAMES[asset.modelUsed] || asset.modelUsed || '—'}</p>
          </div>
          {params.duration != null && (
            <div>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Duration</p>
              <p className="text-sm text-surface-200 flex items-center gap-1"><Clock size={12} /> {params.duration}s</p>
            </div>
          )}
          {params.resolution && (
            <div>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Resolution</p>
              <p className="text-sm text-surface-200">{params.resolution}</p>
            </div>
          )}
          {params.aspectRatio && (
            <div>
              <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Aspect Ratio</p>
              <p className="text-sm text-surface-200">{params.aspectRatio}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Dimensions</p>
            <p className="text-sm text-surface-200">{asset.width && asset.height ? `${asset.width}×${asset.height}` : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">File Size</p>
            <p className="text-sm text-surface-200">{asset.fileSize ? `${(asset.fileSize / 1024).toFixed(0)} KB` : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Created</p>
            <p className="text-sm text-surface-200">{asset.createdAt ? new Date(asset.createdAt).toLocaleString() : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Task ID</p>
            <p className="text-[11px] font-mono text-surface-400 break-all">{asset.taskId || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Tags</p>
            <TagEditor
              tags={(asset.tags ? asset.tags.split(',').filter(Boolean) : []).map((t: string) => t.trim())}
              onChange={async (newTags) => {
                const api = (window as any).electronAPI
                if (!api?.assets?.updateTags) return
                const updated = await api.assets.updateTags(asset.id, newTags)
                if (updated) onAssetChange(updated)
              }}
            />
          </div>
          <div className="pt-2 border-t border-surface-800 space-y-1.5">
            <button onClick={onRecreate} className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5 text-accent-400 hover:text-accent-300">
              <RotateCcw size={12} /> Recreate
            </button>
            <button onClick={handleSaveAs} disabled={saveState === 'saving'} className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5">
              {saveState === 'done' ? <Check size={12} className="text-green-400" /> : saveState === 'saving' ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
              {saveState === 'done' ? 'Saved' : 'Save as'}
            </button>
            {(asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') && !asset.filePath.startsWith('http'))) && (
              <button onClick={() => (window as any).electronAPI?.assets.showInFolder(asset.id)}
                className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5">
                <FolderOpen size={12} /> Show in folder
              </button>
            )}
            {confirmDelete ? (
              <div className="flex items-center gap-2 justify-center">
                <span className="text-[11px] text-surface-400">Confirm delete?</span>
                <button onClick={() => { onDelete(); setConfirmDelete(false) }}
                  className="px-2 py-1 rounded bg-red-500/80 text-white text-[10px] font-medium">Yes</button>
                <button onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 rounded bg-white/10 text-white text-[10px]">No</button>
              </div>
            ) : (
              <button className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5 text-red-400" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
