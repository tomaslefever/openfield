import { useState, useCallback, useEffect, useRef } from 'react'
import { Coins, Loader, AlertCircle, X, Clock, Cloud, CheckSquare, Square, Search, Star, RefreshCw, Video } from 'lucide-react'
import { toast } from 'sonner'
import { PromptComposer, type PromptComposerHandle } from '../components/PromptComposer'
import { usePagedAssets } from '../hooks/usePagedAssets'
import { useGridFlip } from '../hooks/useGridFlip'
import { useAppStore } from '../stores/app-store'
import { fileUrl, srcUrl } from '../services/file-url'
import { AssetBadge } from '../components/ui/asset-badge'
import { BulkActionBar } from '../components/ui/BulkActionBar'
import { ConfirmDeleteModal } from '../components/ui/ConfirmDeleteModal'
import { BulkTagModal } from '../components/ui/BulkTagModal'
import { ImageGeneration } from '../components/agents/image-generation'
import { cleanModelName, getAssetProvider } from '../lib/models'
import { RetryGenerationButton } from '../components/ui/RetryGenerationButton'
import { AssetDetailModal } from '../components/assets/AssetDetailModal'

const MODEL_NAMES: Record<string, string> = {
  'kling-3.0/video': 'Kling 3.0',
  'kling/v25-turbo-text-to-video-pro': 'Kling 2.5 Turbo',
  'kling/v25-turbo-image-to-video-pro': 'Kling 2.5 Turbo',
  'grok-imagine/text-to-video': 'Grok Imagine',
  'grok-imagine/image-to-video': 'Grok Imagine',
  'grok-imagine/extend': 'Grok Imagine',
  'grok-imagine/upscale': 'Grok Upscale',
  'bytedance/seedance-2': 'Seedance 2',
  'bytedance/seedance-2-5': 'Seedance 2.5',
  'bytedance/seedance-2-fast': 'Seedance 2 Fast',
  'bytedance/seedance-2.0/text-to-video': 'Seedance 2.0',
  'bytedance/seedance-2.5/text-to-video': 'Seedance 2.5',
  'kling-video/v3.0/std/text-to-video': 'Kling 3.0 Standard',
  'wan-2-7-text-to-video': 'Wan 2.7',
  'wan-2-7-image-to-video': 'Wan 2.7',
  'wan/3-0-video': 'Wan 3.0',
  'wan-3-0-video': 'Wan 3.0',
  'hailuo/02-text-to-video-pro': 'Hailuo 2 Pro',
  'google/gemini-omni-flash-1-1': 'Gemini Omni 1.1 Flash',
  'gemini-omni-video': 'Gemini Omni 1.1 Flash',
  'prunaai/p-video-avatar': 'P-Video Avatar',
  'prunaai/p-video': 'P-Video',
  'philz1337x/crystal-video-upscaler': 'Crystal Upscaler',
  'minimax-h3/text-to-video': 'MiniMax H3',
  'minimax-h3/image-to-video': 'MiniMax H3',
  'minimax-h3/reference-to-video': 'MiniMax H3',
  'minimax/h3/reference-to-video': 'MiniMax H3',
  'minimax/h3-max-turbo/text-to-video': 'MiniMax H3 Max Turbo',
  'minimax/h3-max/text-to-video': 'MiniMax H3 Max',
  'minimax/h3-max/reference-to-video': 'MiniMax H3 Max Ref',
  'machgen/MiniMax-H3/t2v': 'MiniMax H3',
  'machgen/MiniMax-H3/i2v': 'MiniMax H3',
  'machgen/MiniMax-H3/fflf': 'MiniMax H3',
  'machgen/MiniMax-H3/ref': 'MiniMax H3',
  'machgen/MiniMax-H3': 'MiniMax H3',
  'machgen/MiniMax-H3-Turbo/t2v': 'MiniMax H3 Turbo',
  'machgen/MiniMax-H3-Turbo': 'MiniMax H3 Turbo',
  'MiniMax-H3-Turbo': 'MiniMax H3 Turbo',
  'MiniMax-H3': 'MiniMax H3',
  'machgen/Wan2.2-A14B/t2v': 'Wan2.2-A14B',
  'machgen/Wan2.2-A14B/i2v': 'Wan2.2-A14B',
  'machgen/Wan2.2-A14B': 'Wan2.2-A14B',
  'machgen/LTX-2.3-Pro/t2v': 'LTX-2.3-Pro',
  'machgen/LTX-2.3-Pro/i2v': 'LTX-2.3-Pro',
  'machgen/LTX-2.3-Pro/fflf': 'LTX-2.3-Pro',
  'machgen/LTX-2.3-Pro': 'LTX-2.3-Pro',
  'machgen/Vidu-Q3-Turbo/t2v': 'Vidu-Q3-Turbo',
  'machgen/Vidu-Q3-Turbo/i2v': 'Vidu-Q3-Turbo',
  'machgen/Vidu-Q3-Turbo/fflf': 'Vidu-Q3-Turbo',
  'machgen/Vidu-Q3-Turbo/ref': 'Vidu-Q3-Turbo',
  'machgen/Vidu-Q3-Turbo': 'Vidu-Q3-Turbo',
  'machgen/Vidu-Q3-Pro/t2v': 'Vidu-Q3-Pro',
  'machgen/Vidu-Q3-Pro/i2v': 'Vidu-Q3-Pro',
  'machgen/Vidu-Q3-Pro/fflf': 'Vidu-Q3-Pro',
  'machgen/Vidu-Q3-Pro/ref': 'Vidu-Q3-Pro',
  'machgen/Vidu-Q3-Pro': 'Vidu-Q3-Pro',
  'machgen/Seedance-2.5/t2v': 'Seedance 2.5',
  'machgen/Seedance-2.5/i2v': 'Seedance 2.5',
  'machgen/Seedance-2.5/fflf': 'Seedance 2.5',
  'machgen/Seedance-2.5/ref': 'Seedance 2.5',
  'machgen/Seedance-2.5': 'Seedance 2.5',
  'machgen/Seedance-2.0/t2v': 'Seedance 2.0',
  'machgen/Seedance-2.0/i2v': 'Seedance 2.0',
  'machgen/Seedance-2.0/fflf': 'Seedance 2.0',
  'machgen/Seedance-2.0/ref': 'Seedance 2.0',
  'machgen/Seedance-2.0': 'Seedance 2.0',
  'machgen/Seedance-2.0-Fast/t2v': 'Seedance 2.0 Fast',
  'machgen/Seedance-2.0-Fast/i2v': 'Seedance 2.0 Fast',
  'machgen/Seedance-2.0-Fast/fflf': 'Seedance 2.0 Fast',
  'machgen/Seedance-2.0-Fast/ref': 'Seedance 2.0 Fast',
  'machgen/Seedance-2.0-Fast': 'Seedance 2.0 Fast',
  'machgen/Seedance-2.0-Mini/t2v': 'Seedance 2.0 Mini',
  'machgen/Seedance-2.0-Mini/i2v': 'Seedance 2.0 Mini',
  'machgen/Seedance-2.0-Mini/fflf': 'Seedance 2.0 Mini',
  'machgen/Seedance-2.0-Mini/ref': 'Seedance 2.0 Mini',
  'machgen/Seedance-2.0-Mini': 'Seedance 2.0 Mini',
  'machgen/Kling-v3/t2v': 'Kling-v3',
  'machgen/Kling-v3/i2v': 'Kling-v3',
  'machgen/Kling-v3/fflf': 'Kling-v3',
  'machgen/Kling-v3': 'Kling-v3',
  'machgen/Kling-o3/t2v': 'Kling-o3',
  'machgen/Kling-o3/ref': 'Kling-o3',
  'machgen/Kling-o3': 'Kling-o3',
  'machgen/Vidu-Q3/ref': 'Vidu-Q3',
  'machgen/Vidu-Q3': 'Vidu-Q3',
  'machgen/Vidu-Q3-Pro-Fast/i2v': 'Vidu-Q3-Pro-Fast',
  'machgen/Vidu-Q3-Pro-Fast': 'Vidu-Q3-Pro-Fast',
  'machgen/Alibaba-Wan-3.0/t2v': 'Alibaba-Wan-3.0',
  'machgen/Alibaba-Wan-3.0/i2v': 'Alibaba-Wan-3.0',
  'machgen/Alibaba-Wan-3.0/fflf': 'Alibaba-Wan-3.0',
  'machgen/Alibaba-Wan-3.0/ref': 'Alibaba-Wan-3.0',
  'machgen/Alibaba-Wan-3.0': 'Alibaba-Wan-3.0',
  'machgen/Veo-3.1/t2v': 'Veo-3.1',
  'machgen/Veo-3.1': 'Veo-3.1',
  'machgen/Veo-3.1-Fast/t2v': 'Veo-3.1-Fast',
  'machgen/Veo-3.1-Fast': 'Veo-3.1-Fast',
  'machgen/Pixverse-V6/t2v': 'Pixverse-V6',
  'machgen/Pixverse-V6/i2v': 'Pixverse-V6',
  'machgen/Pixverse-V6/ref': 'Pixverse-V6',
  'machgen/Pixverse-V6': 'Pixverse-V6',
  'machgen/Pixverse-C1/t2v': 'Pixverse-C1',
  'machgen/Pixverse-C1/i2v': 'Pixverse-C1',
  'machgen/Pixverse-C1/ref': 'Pixverse-C1',
  'machgen/Pixverse-C1': 'Pixverse-C1',
  'machgen/HappyHorse-1.1/t2v': 'HappyHorse-1.1',
  'machgen/HappyHorse-1.1/i2v': 'HappyHorse-1.1',
  'machgen/HappyHorse-1.1/ref': 'HappyHorse-1.1',
  'machgen/HappyHorse-1.1': 'HappyHorse-1.1',
  'machgen/HappyHorse-1.0/t2v': 'HappyHorse-1.0',
  'machgen/HappyHorse-1.0/i2v': 'HappyHorse-1.0',
  'machgen/HappyHorse-1.0/ref': 'HappyHorse-1.0',
  'machgen/HappyHorse-1.0': 'HappyHorse-1.0',
  'machgen/Grok-Imagine-Video/t2v': 'Grok-Imagine-Video',
  'machgen/Grok-Imagine-Video': 'Grok-Imagine-Video',
  'machgen/Grok-Imagine-Video-1.5/i2v': 'Grok-Imagine-Video-1.5',
  'machgen/Grok-Imagine-Video-1.5': 'Grok-Imagine-Video-1.5',
  'machgen/Topaz-Video-Precision/upscale': 'Topaz-Video-Precision',
  'machgen/Topaz-Video-Precision': 'Topaz-Video-Precision',
  'machgen/Topaz-Video-Precision-Animation/upscale': 'Topaz-Video-Precision-Animation',
  'machgen/Topaz-Video-Precision-Animation': 'Topaz-Video-Precision-Animation',
  'machgen/Topaz-Video-Generative/upscale': 'Topaz-Video-Generative',
  'machgen/Topaz-Video-Generative': 'Topaz-Video-Generative',
  'machgen/Topaz-Video-Generative-Fast/upscale': 'Topaz-Video-Generative-Fast',
  'machgen/Topaz-Video-Generative-Fast': 'Topaz-Video-Generative-Fast',
}

export function VideoGenPage() {
  const [selectedAsset, setSelectedAsset] = useState<any>(null)
  const [isDev, setIsDev] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkTag, setShowBulkTag] = useState(false)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [search, setSearch] = useState('')
  const [showFavorites, setShowFavorites] = useState(false)
  const composerRef = useRef<PromptComposerHandle>(null)
  const composerPayload = useAppStore(s => s.composerPayload)
  const setComposerPayload = useAppStore(s => s.setComposerPayload)
  const setPage = useAppStore(s => s.setPage)

  // Load prompt from Prompt Library regenerate
  useEffect(() => {
    if (composerPayload && composerPayload.mode === 'video') {
      setTimeout(() => {
        composerRef.current?.loadFromParams(composerPayload)
        setComposerPayload(null)
      }, 100)
    }
  }, [composerPayload, setComposerPayload])

  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())
  const dragStartedRef = useRef(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)

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

  const { assets, total, hasMore, initialLoading, loadingMore, sentinelRef, reset, loadMore, updateAsset, removeAssets } = usePagedAssets({ type: 'video', search, isFavorite: showFavorites, pageSize: 20, excludeUploads: true })
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
    try {
      (window as any).electronAPI?.isDev?.().then((dev: boolean) => setIsDev(!!dev)).catch(() => {})
    } catch {}
  }, [])

  useEffect(() => {
    setSelectedAsset((prev: any) => {
      if (!prev || assets.length === 0) return prev
      const updated = assets.find((a: any) => a.id === prev.id)
      if (!updated) return prev
      if (updated.localPath === prev.localPath && updated.filePath === prev.filePath && updated.status === prev.status) return prev
      return updated
    })
  }, [assets])

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
    const unsubRpComplete = api.on('replicate:task:completed', () => reset())
    const unsubRpFailed = api.on('replicate:task:failed', () => reset())
    const unsubFalComplete = api.on('fal:task:completed', () => reset())
    const unsubFalFailed = api.on('fal:task:failed', () => reset())
    const unsubMgComplete = api.on('machgen:task:completed', () => reset())
    const unsubMgFailed = api.on('machgen:task:failed', () => reset())
    const unsubHfComplete = api.on('higgsfield:task:completed', () => reset())
    const unsubHfFailed = api.on('higgsfield:task:failed', () => reset())
    const unsubKlComplete = api.on('kling:task:completed', () => reset())
    const unsubKlFailed = api.on('kling:task:failed', () => reset())
    return () => { unsubComplete?.(); unsubFailed?.(); unsubRpComplete?.(); unsubRpFailed?.(); unsubFalComplete?.(); unsubFalFailed?.(); unsubMgComplete?.(); unsubMgFailed?.(); unsubHfComplete?.(); unsubHfFailed?.(); unsubKlComplete?.(); unsubKlFailed?.() }
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

  const handleAddReference = async () => {
    if (!selectedAsset) return
    try {
      const api = (window as any).electronAPI
      const results = await api?.assets.readBase64([selectedAsset.id])
      const b64 = results?.[0]?.base64 || ''
      const mime = results?.[0]?.mime || 'video/mp4'
      if (!b64) return
      composerRef.current?.addRefs([{ base64: b64, mime }])
      setSelectedAsset(null)
    } catch (err) {
      console.error('Reference failed:', err)
    }
  }

  const handleGenerate = useCallback(async (params: any) => {
    try {
      const api = (window as any).electronAPI
      const isHiggsfieldModel = params?.provider === 'higgsfield' ||
        params?.model?.startsWith('higgsfield/') ||
        params?.model?.startsWith('bytedance/seedance-2.0') ||
        params?.model?.startsWith('bytedance/seedance-2.5') ||
        params?.model?.startsWith('kling-video/') ||
        params?.model?.startsWith('minimax/h3/') ||
        params?.model?.startsWith('alibaba/wan-3.0') ||
        params?.model?.startsWith('higgsfield-ai/')
      const isApimartModel = params?.provider === 'apimart' || params?.model?.startsWith('apimart/')
      const isKlingModel = params?.provider === 'klingai' || params?.model?.startsWith('klingai/')
      const isMachgenModel = params?.provider === 'machgen' || params?.model?.startsWith('machgen/') || params?.model?.includes('MachGen') || params?.model?.includes('MiniMax-H3') || params?.model?.includes('Wan2.2') || params?.model?.includes('LTX-2.3') || params?.model?.includes('Vidu-Q3') || params?.model?.includes('Topaz-')
      const isReplicateModel = params?.provider === 'replicate' || params?.model?.startsWith('prunaai/') || params?.model?.startsWith('philz1337x/')
      const isFalModel = params?.provider === 'fal' || params?.model?.startsWith('minimax/')
      if (isKlingModel) {
        await api?.kling.generate(params)
      } else if (isApimartModel) {
        await api?.apimart.generate(params)
      } else if (isMachgenModel) {
        await api?.machgen.generate(params)
      } else if (isHiggsfieldModel) {
        await api?.higgsfield.generate(params)
      } else if (isFalModel) {
        await api?.fal.generate(params)
      } else if (isReplicateModel) {
        await api?.replicate.generate(params)
      } else {
        await api?.openfield.generateVideo(params)
      }
      reset()
    } catch (err) { console.error('Video generation failed:', err) }
  }, [reset])

  const handleRecreate = useCallback(async () => {
    if (!selectedAsset) return
    try {
      const p = JSON.parse(selectedAsset.parameters || '{}')
      const api = (window as any).electronAPI
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
      composerRef.current?.loadFromParams({
        prompt: selectedAsset.prompt || '',
        model: selectedAsset.modelUsed || '',
        provider: getAssetProvider(selectedAsset) ?? undefined,
        aspectRatio: p.aspectRatio || p.aspect_ratio || undefined,
        resolution: p.resolution || undefined,
        duration: p.duration ?? undefined,
        fps: p.fps ?? undefined,
        sound: p.sound ?? undefined,
        draft: p.draft ?? undefined,
        imageBase64: await loadImg('imageBase64'),
        imageMime: p.imageMime || 'image/png',
        imageRefs: await loadRefs(p.imageRefs),
        videoRefs: await loadRefs(p.videoRefs),
        audioRefs: await loadRefs(p.audioRefs),
        firstFrameBase64: await loadImg('firstFrameBase64'),
        lastFrameBase64: await loadImg('lastFrameBase64'),
        multiShots: p.multiShots,
        upscaleEngine: p.upscaleEngine,
        multiPrompt: p.multiPrompt,
      })
    } catch (err) {
      console.error('Recreate failed:', err)
    }
    setSelectedAsset(null)
  }, [selectedAsset])

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
      toast.success(`${count} ${count === 1 ? 'video archivado' : 'videos archivados'}`)
      clearSelection()
      reset()
    } catch (err) {
      console.error('[VideoGenPage] Bulk archive failed:', err)
      toast.error('Error al archivar videos')
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
      composerRef.current?.addRefs(files.map((f: any) => ({ base64: f.base64, mime: f.mime, assetId: f.id })))
    }
    clearSelection()
  }, [selectedIds, clearSelection])

  const params = selectedAsset ? (() => { try { return JSON.parse(selectedAsset.parameters || '{}') } catch { return {} } })() : {}
  const closeModal = () => setSelectedAsset(null)
  const selectedIdx = selectedAsset ? assets.findIndex((a: any) => a.id === selectedAsset.id) : -1
  const modalPrev = selectedIdx > 0 ? () => setSelectedAsset(assets[selectedIdx - 1]) : undefined
  const modalNext = selectedIdx < 0 ? undefined
    : selectedIdx < assets.length - 1 ? () => {
      setSelectedAsset(assets[selectedIdx + 1])
      if (selectedIdx + 1 >= assets.length - 2 && hasMore) loadMore()
    }
    : hasMore ? () => { pendingNextRef.current = true; loadMore() }
    : undefined

  const handleReload = () => {
    reset()
  }

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex-1 overflow-y-auto p-4 pb-64">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-surface-600">{total} videos</span>
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
              onClick={handleReload}
              title="Reload videos"
              className="flex-shrink-0 p-1.5 rounded-full border border-surface-800 text-surface-500 hover:text-surface-100 hover:border-surface-600 transition-colors"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => setShowFavorites(v => !v)}
              title={showFavorites ? 'Show all videos' : 'Show favorites only'}
              className={`flex-shrink-0 p-1.5 rounded-full border transition-colors ${showFavorites ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400' : 'border-surface-800 text-surface-500 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/30'}`}
            >
              <Star size={14} fill={showFavorites ? 'currentColor' : 'none'} />
            </button>
          </div>
          <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {assets.map((asset: any) => {
              const isSel = selectedIds.has(asset.id)
              const isError = asset.filePath?.startsWith('__error__')
              const isLoading = asset.modelUsed && asset.modelUsed !== 'import' && !isError
              return (
              <div
                key={asset.id}
                data-asset-card={asset.id}
                className={`card group relative overflow-hidden p-0 cursor-pointer ${draggingId === asset.id ? 'opacity-40 scale-[0.98]' : ''}`}
                draggable={!isError && !!(asset.localPath || asset.filePath)}
                onDragStart={(e) => {
                  const draggedAssets = isSel && selectedIds.size > 1
                    ? assets.filter((a: any) => selectedIds.has(a.id))
                    : [asset]
                  e.dataTransfer.setData('application/x-openfield-assets', JSON.stringify(draggedAssets))
                  e.dataTransfer.setData('application/x-openfield-asset', JSON.stringify(asset))
                  e.dataTransfer.setData('text/plain', asset.id)
                  e.dataTransfer.effectAllowed = 'copy'
                  dragStartedRef.current = true
                  setDraggingId(asset.id)
                }}
                onDragEnd={() => {
                  setDraggingId(null)
                  setTimeout(() => { dragStartedRef.current = false }, 100)
                }}
                onClick={(e) => {
                  if (dragStartedRef.current) return
                  if (e.shiftKey) { toggleSelect(asset.id, true) } else { setSelectedAsset(asset) }
                }}
                onMouseEnter={() => handleMouseEnter(asset.id)}
                onMouseLeave={() => handleMouseLeave(asset.id)}
              >
                <div className="aspect-square bg-surface-800 flex items-center justify-center overflow-hidden">
                  {(() => {
                    const src = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : null)
                    if (src) return <video ref={(el) => { if (el) { videoRefs.current.set(asset.id, el); el.muted = true } else videoRefs.current.delete(asset.id) }} data-video-id={asset.id} src={srcUrl(src)} draggable={false} className="w-full h-full object-cover select-none" preload="auto" loop playsInline />
                    if (isError) return (
                      <div className="flex flex-col items-center justify-center gap-1.5 text-red-600 dark:text-red-400 p-3 text-center w-full h-full">
                        <AlertCircle size={20} className="flex-shrink-0" />
                        <span className="text-[10px] text-red-600/80 dark:text-red-400/80 line-clamp-3 leading-tight">{asset.filePath.replace('__error__:', '')}</span>
                        <RetryGenerationButton assetId={asset.id} />
                      </div>
                    )
                    if (isLoading) {
                      return (
                        <ImageGeneration
                          status="generating"
                          size="fill"
                          showStatus={false}
                          prompt={undefined}
                          resolution={undefined}
                          className="w-full h-full"
                        />
                      )
                    }
                    return <div className="text-surface-600 text-sm">No preview</div>
                  })()}
                </div>
                {!isLoading && (
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
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSelect(asset.id, e.shiftKey) }}
                  className={`absolute top-2 left-2 z-10 p-0.5 rounded transition-all ${isSel ? 'opacity-100 bg-accent-500 text-on-accent' : 'opacity-0 group-hover:opacity-100 bg-black/50 text-white hover:bg-black/70'}`}
                >
                  {isSel ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
                {!isLoading && (
                  <div className="absolute bottom-2 right-2 flex items-center gap-1">
                    {(() => {
                      try {
                        const p = JSON.parse(asset.parameters || '{}')
                        return (
                          <>
                            {p.aspectRatio && <AssetBadge value={p.aspectRatio} />}
                            {p.resolution && <AssetBadge value={String(p.resolution)} />}
                            {(p.generationTime || p.generationTimeSeconds || p.costTime) && (
                              <AssetBadge
                                value={p.generationTime || (p.generationTimeSeconds ? `${p.generationTimeSeconds}s` : `${p.costTime}s`)}
                                icon={<Clock size={10} className="text-white/80" />}
                              />
                            )}
                          </>
                        )
                      } catch {}
                      return null
                    })()}
                    {asset.creditsUsed > 0 && <AssetBadge value={String(Math.round(asset.creditsUsed))} icon={<Coins size={10} className="text-amber-400" />} />}
                  </div>
                )}
              </div>
            )})}
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
              <svg xmlns="http://www.w3.org/2000/svg" width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              <p className="text-sm">No videos yet. Generate using the composer below.</p>
            </div>
          )}
        </div>
      </div>

      <PromptComposer
        ref={composerRef}
        onGenerate={handleGenerate}
        mode="video"
        onModeChange={(m) => {
          if (m === 'image') setPage('image')
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

      {selectedAsset && (
        <AssetDetailModal
          asset={selectedAsset}
          src={selectedAsset.localPath || (selectedAsset.filePath && !selectedAsset.filePath.startsWith('__error__') ? selectedAsset.filePath : '')}
          params={params}
          modelLabel={cleanModelName(MODEL_NAMES[selectedAsset.modelUsed] || selectedAsset.modelUsed) || '—'}
          onClose={closeModal}
          onPrev={modalPrev}
          onNext={modalNext}
          onAssetChange={setSelectedAsset}
          onToggleFavorite={() => handleToggleFavorite(selectedAsset.id)}
          onDelete={() => handleDelete(selectedAsset.id)}
          onRecreate={handleRecreate}
          actions={[{ icon: Video, label: 'Referencia', onClick: handleAddReference }]}
          onDraftFinalQueued={() => reset()}
          onUpscaleQueued={() => reset()}
        />
      )}
    </div>
  )
}
