import { useState, useCallback, useEffect, useRef } from 'react'
import { Download, Trash2, Coins, Loader, AlertCircle, X, Copy, Check, ChevronLeft, ChevronRight, RotateCcw, Clock, Cloud, FolderOpen, CheckSquare, Square, Search, Star, RefreshCw, Video } from 'lucide-react'
import { toast } from 'sonner'
import { PromptComposer, type PromptComposerHandle } from '../components/PromptComposer'
import { usePagedAssets } from '../hooks/usePagedAssets'
import { useGridFlip } from '../hooks/useGridFlip'
import { copyText } from '../lib/clipboard'
import { useAppStore } from '../stores/app-store'
import { fileUrl, srcUrl } from '../services/file-url'
import { AssetBadge } from '../components/ui/asset-badge'
import { AutoPlayVideo } from '../components/ui/AutoPlayVideo'
import { TagEditor } from '../components/ui/TagEditor'
import { BulkActionBar } from '../components/ui/BulkActionBar'
import { ConfirmDeleteModal } from '../components/ui/ConfirmDeleteModal'
import { BulkTagModal } from '../components/ui/BulkTagModal'
import { ImageGeneration } from '../components/agents/image-generation'
import { cleanModelName } from '../lib/models'

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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<any>(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'done'>('idle')
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
    const unsubRpComplete = api.on('replicate:task:completed', () => reset())
    const unsubRpFailed = api.on('replicate:task:failed', () => reset())
    const unsubFalComplete = api.on('fal:task:completed', () => reset())
    const unsubFalFailed = api.on('fal:task:failed', () => reset())
    const unsubMgComplete = api.on('machgen:task:completed', () => reset())
    const unsubMgFailed = api.on('machgen:task:failed', () => reset())
    const unsubHfComplete = api.on('higgsfield:task:completed', () => reset())
    const unsubHfFailed = api.on('higgsfield:task:failed', () => reset())
    return () => { unsubComplete?.(); unsubFailed?.(); unsubRpComplete?.(); unsubRpFailed?.(); unsubFalComplete?.(); unsubFalFailed?.(); unsubMgComplete?.(); unsubMgFailed?.(); unsubHfComplete?.(); unsubHfFailed?.() }
  }, [reset])

  useEffect(() => {
    if (!selectedAsset) return
    const handler = (e: KeyboardEvent) => {
      const idx = assets.findIndex((a: any) => a.id === selectedAsset.id)
      if (e.key === 'ArrowLeft' && idx > 0) setSelectedAsset(assets[idx - 1])
      if (e.key === 'ArrowRight') {
        if (idx >= 0 && idx < assets.length - 1) {
          setSelectedAsset(assets[idx + 1])
          if (idx + 1 >= assets.length - 2 && hasMore) loadMore()
        } else if (hasMore) {
          pendingNextRef.current = true
          loadMore()
        }
      }
      if (e.key === 'Escape') setSelectedAsset(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedAsset, assets, hasMore, loadMore])

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

  const handleSaveAs = async () => {
    if (!selectedAsset) return
    setSaveState('saving')
    try {
      const res = await (window as any).electronAPI?.assets.saveAs(selectedAsset.id)
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
      const isHiggsfieldModel = params?.provider === 'higgsfield' || params?.model?.startsWith('bytedance/seedance-2.0') || params?.model?.startsWith('bytedance/seedance-2.5') || params?.model?.startsWith('kling-video/')
      const isMachgenModel = params?.provider === 'machgen' || params?.model?.startsWith('machgen/')
      const isReplicateModel = params?.provider === 'replicate' || params?.model?.startsWith('prunaai/') || params?.model?.startsWith('philz1337x/')
      const isFalModel = params?.provider === 'fal' || params?.model?.startsWith('minimax/')
      if (isHiggsfieldModel) {
        await api?.higgsfield.generate(params)
      } else if (isMachgenModel) {
        await api?.machgen.generate(params)
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
              className="flex-shrink-0 p-1.5 rounded-lg border border-surface-800 text-surface-500 hover:text-surface-100 hover:border-surface-600 transition-colors"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => setShowFavorites(v => !v)}
              title={showFavorites ? 'Show all videos' : 'Show favorites only'}
              className={`flex-shrink-0 p-1.5 rounded-lg border transition-colors ${showFavorites ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'border-surface-800 text-surface-500 hover:text-amber-400 hover:border-amber-500/30'}`}
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
              <div key={asset.id} data-asset-card={asset.id} className="card group relative overflow-hidden p-0 cursor-pointer" onClick={(e) => { if (e.shiftKey) { toggleSelect(asset.id, true) } else { setSelectedAsset(asset) } }} onMouseEnter={() => handleMouseEnter(asset.id)} onMouseLeave={() => handleMouseLeave(asset.id)}>
                <div className="aspect-square bg-surface-800 flex items-center justify-center overflow-hidden">
                  {(() => {
                    const src = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : null)
                    if (src) return <video ref={(el) => { if (el) { videoRefs.current.set(asset.id, el); el.muted = true } else videoRefs.current.delete(asset.id) }} data-video-id={asset.id} src={srcUrl(src)} className="w-full h-full object-cover" preload="auto" loop playsInline />
                    if (isError) return (
                      <div className="flex flex-col items-center justify-center gap-1.5 text-red-400 p-3 text-center w-full h-full">
                        <AlertCircle size={20} className="flex-shrink-0" />
                        <span className="text-[10px] text-red-400/80 line-clamp-3 leading-tight">{asset.filePath.replace('__error__:', '')}</span>
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
                  className={`absolute top-2 left-2 z-10 p-0.5 rounded transition-all ${isSel ? 'opacity-100 bg-accent-500 text-white' : 'opacity-0 group-hover:opacity-100 bg-black/50 text-white hover:bg-black/70'}`}
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
                            {(p.generationTime || p.generationTimeSeconds || p.costTime) && (
                              <AssetBadge
                                value={p.generationTime || (p.generationTimeSeconds ? `${p.generationTimeSeconds}s` : `${p.costTime}s`)}
                                icon={<Clock size={10} className="text-surface-300" />}
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

      {/* Detail modal */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setSelectedAsset(null)}>
          <div className="bg-surface-950 border border-surface-800 rounded-2xl max-w-[95vw] w-full mx-2 max-h-[95vh] flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Video */}
            <div className="flex-1 bg-black flex items-center justify-center min-h-[400px] relative overflow-hidden">
              {assets.findIndex((a: any) => a.id === selectedAsset.id) > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); const idx = assets.findIndex((a: any) => a.id === selectedAsset.id); setSelectedAsset(assets[idx - 1]) }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors z-10">
                  <ChevronLeft size={20} />
                </button>
              )}
              {(assets.findIndex((a: any) => a.id === selectedAsset.id) < assets.length - 1 || hasMore) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    const idx = assets.findIndex((a: any) => a.id === selectedAsset.id)
                    if (idx >= 0 && idx < assets.length - 1) {
                      setSelectedAsset(assets[idx + 1])
                      if (idx + 1 >= assets.length - 2 && hasMore) loadMore()
                    } else if (hasMore) {
                      pendingNextRef.current = true
                      loadMore()
                    }
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors z-10">
                  <ChevronRight size={20} />
                </button>
              )}
              {(selectedAsset.localPath || (selectedAsset.filePath && !selectedAsset.filePath.startsWith('__error__'))) ? (
                <AutoPlayVideo key={selectedAsset.id} src={srcUrl(selectedAsset.localPath || selectedAsset.filePath)} className="max-w-full max-h-[90vh] object-contain" />
              ) : selectedAsset.filePath?.startsWith('__error__') ? (
                <div className="flex flex-col items-center justify-center gap-3 text-red-400 p-8 text-center max-w-lg">
                  <AlertCircle size={36} className="flex-shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-red-400">Error en la generación</p>
                    <p className="text-xs text-red-400/90 leading-relaxed font-mono bg-red-950/30 border border-red-900/40 rounded-lg p-3 max-w-md">
                      {selectedAsset.filePath.replace('__error__:', '')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRecreate}
                    className="mt-2 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-surface-200 bg-surface-800 hover:bg-surface-700 border border-surface-700 transition-colors"
                  >
                    <RotateCcw size={14} className="text-accent-400" />
                    Reintentar generación
                  </button>
                </div>
              ) : (
                <div className="absolute inset-0 w-full h-full">
                  <ImageGeneration
                    status="generating"
                    size="fill"
                    showStatus={false}
                    prompt={undefined}
                    resolution={undefined}
                    className="w-full h-full"
                  />
                </div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleToggleFavorite(selectedAsset.id) }}
                title={selectedAsset.isFavorite ? 'Remove favorite' : 'Add to favorites'}
                className={`absolute top-3 right-3 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center z-10 transition-colors ${selectedAsset.isFavorite ? 'text-amber-400' : 'text-white/60 hover:text-amber-400'}`}
              >
                <Star size={14} fill={selectedAsset.isFavorite ? 'currentColor' : 'none'} />
              </button>
            </div>
            {/* Details */}
            <div className="w-96 min-w-[380px] flex-shrink-0 bg-surface-900/80 border-l border-surface-800 flex flex-col">
              <div className="flex items-center justify-end px-3 py-2 border-b border-surface-800 flex-shrink-0">
                <button onClick={() => setSelectedAsset(null)} title="Close"
                  className="w-7 h-7 rounded-full flex items-center justify-center text-surface-500 hover:text-white hover:bg-surface-800 transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
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
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Model</p>
                <p className="text-sm text-surface-200">{cleanModelName(MODEL_NAMES[selectedAsset.modelUsed] || selectedAsset.modelUsed) || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Task ID</p>
                <p className="text-[11px] font-mono text-surface-400 break-all">{selectedAsset.taskId || '—'}</p>
              </div>
              {params.duration != null && (
                <div>
                  <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Duration</p>
                  <p className="text-sm text-surface-200 flex items-center gap-1"><Clock size={12} /> {params.duration}s</p>
                </div>
              )}
              {params.fps != null && (
                <div>
                  <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">FPS</p>
                  <p className="text-sm text-surface-200">{params.fps}</p>
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
                <p className="text-sm text-surface-200">{selectedAsset.width && selectedAsset.height ? `${selectedAsset.width}×${selectedAsset.height}` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">File Size</p>
                <p className="text-sm text-surface-200">{selectedAsset.fileSize ? `${(selectedAsset.fileSize / 1024).toFixed(0)} KB` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Gen Time</p>
                <p className="text-sm text-surface-200">
                  {params.generationTime || (params.generationTimeSeconds ? `${params.generationTimeSeconds}s` : (params.costTime ? `${params.costTime}s` : '—'))}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Credits Used</p>
                <p className="text-sm text-amber-400">{selectedAsset.creditsUsed > 0 ? Math.round(selectedAsset.creditsUsed).toLocaleString() : '—'}</p>
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
              <div className="pt-2 border-t border-surface-800 grid grid-cols-2 gap-1.5">
                <button onClick={handleRecreate} className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5 text-accent-400 hover:text-accent-300">
                  <RotateCcw size={12} /> Recreate
                </button>
                <button onClick={handleSaveAs} disabled={saveState === 'saving'} className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5">
                  {saveState === 'done' ? <Check size={12} className="text-green-400" /> : saveState === 'saving' ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
                  {saveState === 'done' ? 'Saved' : 'Save as'}
                </button>
                <button onClick={handleAddReference} className="btn-ghost text-xs w-full col-span-2 justify-center flex items-center gap-1.5 text-accent-400 hover:text-accent-300">
                  <Video size={12} /> Reference
                </button>
                  {(selectedAsset.localPath || (selectedAsset.filePath && !selectedAsset.filePath.startsWith('__error__') && !selectedAsset.filePath.startsWith('http'))) && (
                    <button onClick={() => (window as any).electronAPI?.assets.showInFolder(selectedAsset.id)}
                      className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5">
                      <FolderOpen size={12} /> Show in folder
                    </button>
                  )}
                {confirmDelete === selectedAsset.id ? (
                  <div className="col-span-2 flex items-center gap-2 justify-center">
                    <span className="text-[11px] text-surface-400">Confirm delete?</span>
                    <button onClick={() => { handleDelete(selectedAsset.id); setConfirmDelete(null) }}
                      className="px-2 py-1 rounded bg-red-500/80 text-white text-[10px] font-medium">Yes</button>
                    <button onClick={() => setConfirmDelete(null)}
                      className="px-2 py-1 rounded bg-white/10 text-white text-[10px]">No</button>
                  </div>
                ) : (
                  <button className="btn-ghost text-xs w-full col-span-2 justify-center flex items-center gap-1.5 text-red-400" onClick={() => setConfirmDelete(selectedAsset.id)}>
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
