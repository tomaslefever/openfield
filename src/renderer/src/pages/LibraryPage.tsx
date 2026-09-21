import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Search, Download, Trash2, Star, Cloud, CheckSquare, Square, Loader, AlertCircle, X, ChevronLeft, ChevronRight, Copy, Check, RotateCcw, FolderOpen, Clock, Tag, RefreshCw, Inbox, Upload, AudioLines, Play, Pause, Image as ImageIcon, Video, Eraser, Clapperboard, Box, Archive } from 'lucide-react'
import { toast } from 'sonner'
import { srcUrl, thumbUrl } from '../services/file-url'
import { usePagedAssets } from '../hooks/usePagedAssets'
import { useGridFlip } from '../hooks/useGridFlip'
import { useAppStore } from '../stores/app-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { PromptComposer, type PromptComposerHandle } from '../components/PromptComposer'
import { TagEditor } from '../components/ui/TagEditor'
import { AutoPlayVideo } from '../components/ui/AutoPlayVideo'
import { BulkActionBar } from '../components/ui/BulkActionBar'
import { ConfirmDeleteModal } from '../components/ui/ConfirmDeleteModal'
import { BulkTagModal } from '../components/ui/BulkTagModal'
import { ImageGeneration } from '../components/agents/image-generation'
import { ElementWizard } from '../components/ElementWizard'
import { copyText, copyImage } from '../lib/clipboard'
import { downscaleImage } from '../lib/image'
import { getAudioKind } from '../lib/audio'

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
  'openai/gpt-image-2': 'GPT Image 2 (Fal)',
  'openai/gpt-image-2/edit': 'GPT Image 2 Edit (Fal)',
  'fal-ai/nano-banana-pro': 'Nano Banana Pro',
  'fal-ai/nano-banana-pro/edit': 'Nano Banana Pro Edit',
  'fal-ai/recraft/v4/text-to-image': 'Recraft V4',
  'fal-ai/recraft/v4/pro/text-to-image': 'Recraft V4 Pro',
  'fal-ai/recraft/v3/text-to-image': 'Recraft V3',
  'imagineart/imagineart-2.0-preview/text-to-image': 'ImagineArt 2.0',
  'fal-ai/flux-pro/kontext': 'FLUX.1 Kontext [pro]',
  'fal-ai/flux-krea-lora/stream': 'FLUX Krea LoRA stream',
  'bria/fibo/generate': 'Bria FIBO',
  'kling-3.0/video': 'Kling 3.0',
  'kling/v25-turbo-text-to-video-pro': 'Kling 2.5 Turbo',
  'kling/v25-turbo-image-to-video-pro': 'Kling 2.5 Turbo',
  'grok-imagine/text-to-video': 'Grok Imagine',
  'grok-imagine/image-to-video': 'Grok Imagine',
  'bytedance/seedance-2': 'Seedance 2',
  'bytedance/seedance-2-5': 'Seedance 2.5',
  'bytedance/seedance-2-fast': 'Seedance 2 Fast',
  'bytedance/seedance-2-mini': 'Seedance 2 Mini',
  'bytedance/seedance-2.0/text-to-video': 'Seedance 2.0 (Higgsfield)',
  'bytedance/seedance-2.5/text-to-video': 'Seedance 2.5 (Higgsfield)',
  'kling-video/v3.0/std/text-to-video': 'Kling 3.0 Standard (Higgsfield)',
  'wan-2-7-text-to-video': 'Wan 2.7',
  'wan-2-7-image-to-video': 'Wan 2.7',
  'wan/3-0-video': 'Wan 3.0',
  'wan-3-0-video': 'Wan 3.0',
  'hailuo/02-text-to-video-pro': 'Hailuo 2 Pro',
  'google/gemini-omni-flash-1-1': 'Gemini Omni 1.1 Flash',
  'gemini-omni-video': 'Gemini Omni 1.1 Flash',
  'prunaai/p-video-avatar': 'P-Video Avatar',
  'prunaai/p-video': 'P-Video',
  'minimax-h3/text-to-video': 'MiniMax H3',
  'minimax-h3/image-to-video': 'MiniMax H3',
  'minimax-h3/reference-to-video': 'MiniMax H3',
  'minimax/h3/reference-to-video': 'MiniMax H3 (Fal)',
  'minimax/h3-max-turbo/text-to-video': 'MiniMax H3 Max Turbo (Fal)',
  'minimax/h3-max/text-to-video': 'MiniMax H3 Max (Fal)',
  'minimax/h3-max/reference-to-video': 'MiniMax H3 Max Ref (Fal)',
  'machgen/MiniMax-H3/t2v': 'MiniMax H3 (MachGen)',
  'machgen/MiniMax-H3-Turbo/t2v': 'MiniMax H3 Turbo (MachGen)',
  'machgen/MiniMax-H3': 'MiniMax H3 (MachGen)',
  'machgen/MiniMax-H3-Turbo': 'MiniMax H3 Turbo (MachGen)',
  'MiniMax-H3-Turbo': 'MiniMax H3 Turbo (MachGen)',
  'MiniMax-H3': 'MiniMax H3 (MachGen)',
  'gpt-tts-1': 'GPT TTS',
  'minimax-text-to-speech': 'MiniMax TTS',
  'openaudio-text-to-music': 'OpenAudio Music',
  'mucat-text-to-music': 'MuCat Music',
  'elevenlabs:sfx': 'ElevenLabs Music',
}

function modelLabel(model: string | undefined): string {
  if (!model) return '—'
  if (model.startsWith('piper:')) return `Piper · ${model.slice(6)}`
  if (model.startsWith('kokoro:')) return `Kokoro · ${model.slice(7)}`
  if (model.startsWith('elevenlabs:vc:')) return `ElevenLabs VC · ${model.slice(13)}`
  if (model.startsWith('elevenlabs:') && model !== 'elevenlabs:sfx') return `ElevenLabs · ${model.slice(11)}`
  return MODEL_NAMES[model] || model
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
  const setPage = useAppStore((s) => s.setPage)
  const composerPayload = useAppStore((s) => s.composerPayload)
  const setComposerPayload = useAppStore((s) => s.setComposerPayload)
  const composerRef = useRef<PromptComposerHandle>(null)

  const assetSearch = useAppStore((s) => s.assetSearch)
  const setAssetSearch = useAppStore((s) => s.setAssetSearch)
  const search = assetSearch.query
  const showFavorites = assetSearch.featured

  const activeTypes = useMemo(
    () => (['image', 'video', 'audio'] as const).filter((t) => assetSearch.types[t]),
    [assetSearch.types.image, assetSearch.types.video, assetSearch.types.audio]
  )
  const typeFilter: 'all' | 'image' | 'video' | 'audio' =
    activeTypes.length === 1 ? activeTypes[0] : 'all'
  const [composerMode, setComposerMode] = useState<'image' | 'video' | 'audio'>('image')
  const [selectedAsset, setSelectedAsset] = useState<any>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkTag, setShowBulkTag] = useState(false)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [allTags, setAllTags] = useState<string[]>([])
  const [tagMenuOpen, setTagMenuOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeId)
  const [orphans, setOrphans] = useState<any[]>([])
  const [organizing, setOrganizing] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [importingFiles, setImportingFiles] = useState(false)
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map())
  const { gridRef, capture, fadeOut, animate } = useGridFlip()

  useEffect(() => { setPlayingAudioId(null) }, [activeWorkspaceId])

  const registerDuration = useCallback((id: string, d: number) => {
    if (!isFinite(d) || d <= 0) return
    setDurations(prev => {
      const cur = prev[id]
      if (cur != null && Math.abs(cur - d) < 0.5) return prev
      return { ...prev, [id]: d }
    })
  }, [])

  const toggleAudioPlay = (id: string) => {
    const el = audioRefs.current.get(id)
    if (!el) return
    if (el.paused) {
      audioRefs.current.forEach((a, aid) => { if (aid !== id && !a.paused) a.pause() })
      el.currentTime = 0
      el.play().catch(() => {})
      setPlayingAudioId(id)
    } else {
      el.pause()
      setPlayingAudioId(null)
    }
  }

  const formatDuration = (secs: number) => {
    if (!isFinite(secs) || secs <= 0) return ''
    const s = Math.round(secs)
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  const refreshOrphans = useCallback(async () => {
    try {
      const api = (window as any).electronAPI
      const result = await api?.assets.scanOrphans()
      setOrphans(Array.isArray(result) ? result : [])
    } catch { setOrphans([]) }
  }, [])

  useEffect(() => {
    refreshOrphans()
  }, [refreshOrphans, activeWorkspaceId])

  const activeOrphans = orphans.find((o: any) => o.workspaceId === activeWorkspaceId)

  const handleOrganize = async () => {
    if (organizing) return
    setOrganizing(true)
    try {
      const api = (window as any).electronAPI
      await api?.assets.adoptOrphans(activeWorkspaceId || undefined)
      reset()
      await refreshOrphans()
    } finally {
      setOrganizing(false)
    }
  }

  const handleDropFiles = async (files: FileList | File[]) => {
    if (importingFiles || files.length === 0) return
    setImportingFiles(true)
    try {
      const api = (window as any).electronAPI
      for (const file of Array.from(files)) {
        if (file.size === 0) continue
        const base64 = await new Promise<string | null>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result as string
            resolve(result?.split(',')[1] || null)
          }
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(file)
        })
        if (!base64) continue
        await api?.assets.importBase64(base64, file.type || 'application/octet-stream', file.name, undefined, 'import')
      }
      reset()
      await refreshOrphans()
    } catch (err) {
      console.error('[Library] File import failed:', err)
    } finally {
      setImportingFiles(false)
    }
  }

  const pagedTypes = useMemo(
    () => (activeTypes.length === 3 ? undefined : activeTypes),
    [activeTypes]
  )

  const { assets, total, hasMore, initialLoading, loadingMore, sentinelRef, reset, loadMore, updateAsset, removeAssets } = usePagedAssets({
    types: pagedTypes,
    search,
    isFavorite: showFavorites,
    isArchived: showArchived ? true : undefined,
    aspectRatio: assetSearch.aspectRatio,
    pageSize: 20,
    excludeUploads: true,
  })

  const pendingNextRef = useRef(false)

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

  const handleAssetsMoved = (ids: string[]) => {
    fadeOut(ids)
    setTimeout(() => {
      capture()
      removeAssets(ids)
      requestAnimationFrame(() => requestAnimationFrame(animate))
    }, 180)
  }


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

  const resetRef = useRef(reset)
  resetRef.current = reset

  const refreshTags = useCallback(async () => {
    try {
      const tags = await (window as any).electronAPI?.assets?.tags?.()
      if (Array.isArray(tags)) setAllTags(tags)
    } catch {}
  }, [])

  useEffect(() => {
    refreshTags()
  }, [refreshTags, activeWorkspaceId])

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api) return
    const onDone = () => {
      resetRef.current()
      refreshTags()
    }
    const unsubComplete = api.on('openfield:task:completed', onDone)
    const unsubFailed = api.on('openfield:task:failed', onDone)
    const unsubRpComplete = api.on('replicate:task:completed', onDone)
    const unsubRpFailed = api.on('replicate:task:failed', onDone)
    const unsubFalComplete = api.on('fal:task:completed', onDone)
    const unsubFalFailed = api.on('fal:task:failed', onDone)
    const unsubMgComplete = api.on('machgen:task:completed', onDone)
    const unsubMgFailed = api.on('machgen:task:failed', onDone)
    const unsubHfComplete = api.on('higgsfield:task:completed', onDone)
    const unsubHfFailed = api.on('higgsfield:task:failed', onDone)
    return () => {
      unsubComplete?.()
      unsubFailed?.()
      unsubRpComplete?.()
      unsubRpFailed?.()
      unsubFalComplete?.()
      unsubFalFailed?.()
      unsubMgComplete?.()
      unsubMgFailed?.()
      unsubHfComplete?.()
      unsubHfFailed?.()
    }
  }, [refreshTags])

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

  useEffect(() => {
    if (composerPayload) {
      setTimeout(() => {
        composerRef.current?.loadFromParams(composerPayload)
        setComposerPayload(null)
      }, 100)
    }
  }, [composerPayload, setComposerPayload])

  useEffect(() => {
    setSelectedAsset((prev: any) => {
      if (!prev || assets.length === 0) return prev
      const updated = assets.find((a: any) => a.id === prev.id)
      if (!updated) return prev
      if (updated.localPath === prev.localPath && updated.filePath === prev.filePath && updated.status === prev.status) return prev
      return updated
    })
  }, [assets])

  const handleGenerate = useCallback(async (params: any) => {
    try {
      const api = (window as any).electronAPI
      const isVideo = params?.mode === 'video' || params?.duration !== undefined || params?.fps !== undefined || params?.firstFrameBase64 !== undefined || params?.videoRefs?.length > 0 || params?.model?.includes('video') || params?.model?.startsWith('wan') || params?.model?.startsWith('kling') || params?.model?.startsWith('bytedance/') || params?.model?.startsWith('hailuo/') || params?.model?.startsWith('minimax') || params?.model?.startsWith('prunaai/') || params?.model?.startsWith('pixverse-v6/') || params?.model === 'omnihuman-1-5' || params?.model === 'google/gemini-omni-flash-1-1' || params?.model === 'philz1337x/crystal-video-upscaler'
      const isMachgenModel = params?.provider === 'machgen' || params?.model?.startsWith('machgen/')
      const isHiggsfieldModel = params?.provider === 'higgsfield' || params?.model?.startsWith('bytedance/seedance-2.0') || params?.model?.startsWith('bytedance/seedance-2.5') || params?.model?.startsWith('kling-video/') || params?.model?.startsWith('higgsfield/')
      const isReplicateModel = params?.provider === 'replicate' || params?.model?.startsWith('prunaai/') || params?.model?.startsWith('philz1337x/') || params?.model?.startsWith('black-forest-labs/') || params?.model?.startsWith('ideogram-ai/')
      const isFalModel = params?.provider === 'fal' || params?.model?.startsWith('minimax/') || params?.model?.startsWith('fal-ai/') || params?.model?.startsWith('imagineart/') || params?.model?.startsWith('bria/')

      if (isVideo) {
        if (!assetSearch.types.video) {
          setAssetSearch({ types: { ...assetSearch.types, video: true } })
        }
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
      } else {
        if (!assetSearch.types.image) {
          setAssetSearch({ types: { ...assetSearch.types, image: true } })
        }
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
      }
      reset()
    } catch (err) {
      console.error('Generation failed:', err)
    }
  }, [reset, assetSearch.types, setAssetSearch])

  const handleBulkAddToComposer = useCallback(async () => {
    const api = (window as any).electronAPI
    const files = await api?.assets.readBase64(Array.from(selectedIds))
    if (files && files.length > 0) {
      composerRef.current?.addRefs(files.map((f: any) => ({ base64: f.base64, mime: f.mime })))
    }
    clearSelection()
  }, [selectedIds, clearSelection])

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
    const shouldArchive = !showArchived
    try {
      await api?.assets.archiveMultiple(Array.from(selectedIds), shouldArchive)
      toast.success(
        shouldArchive
          ? `${count} ${count === 1 ? 'asset archivado' : 'assets archivados'}`
          : `${count} ${count === 1 ? 'asset desarchivado' : 'assets desarchivados'}`
      )
      clearSelection()
      reset()
    } catch (err) {
      console.error('[LibraryPage] Bulk archive failed:', err)
      toast.error(shouldArchive ? 'Error al archivar assets' : 'Error al desarchivar assets')
    }
  }, [selectedIds, showArchived, clearSelection, reset])

  const handleBulkAddTags = useCallback(async (tags: string[]) => {
    const api = (window as any).electronAPI
    await api?.assets.addTagsMultiple(Array.from(selectedIds), tags)
    setShowBulkTag(false)
    reset()
    refreshTags()
  }, [selectedIds, reset, refreshTags])

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
        if (getAudioKind(selectedAsset) === 'music') {
          setComposerPayload({ ...base, mode: 'audio', duration: p.duration ?? undefined })
          setPage('music')
        } else {
          setPage('voice')
        }
      } else if (selectedAsset.type === 'image') {
        composerRef.current?.loadFromParams({
          ...base,
          mode: 'image',
          imageBase64: await loadImg('imageBase64'),
          imageMime: p.imageMime || 'image/png',
          imageRefs: await loadRefs(p.imageRefs),
          firstFrameBase64: await loadImg('firstFrameBase64'),
          lastFrameBase64: await loadImg('lastFrameBase64'),
        })
      } else {
        composerRef.current?.loadFromParams({
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
      }
    } catch (err) { console.error('Recreate failed:', err) }
    setSelectedAsset(null)
  }

  const [creatingFromAsset, setCreatingFromAsset] = useState<{ base64: string; prompt: string } | null>(null)
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null)

  const handleCopyImage = useCallback(async (asset: any) => {
    if (!asset) return
    try {
      const api = (window as any).electronAPI
      const results = await api?.assets.readBase64([asset.id])
      const b64 = results?.[0]?.base64 || ''
      const mime = results?.[0]?.mime || 'image/png'
      const ok = await copyImage(b64, mime)
      if (ok) {
        setCopiedAssetId(asset.id)
        setTimeout(() => setCopiedAssetId(null), 1500)
      }
    } catch (err) {
      console.error('Copy image failed:', err)
    }
  }, [])

  const handleAddImageReference = useCallback(async (asset: any) => {
    if (!asset) return
    try {
      const api = (window as any).electronAPI
      const results = await api?.assets.readBase64([asset.id])
      const b64 = results?.[0]?.base64 || ''
      const mime = results?.[0]?.mime || 'image/png'
      if (!b64) return
      composerRef.current?.addRefs([{ base64: b64, mime }])
      setSelectedAsset(null)
    } catch (err) {
      console.error('Image reference failed:', err)
    }
  }, [])

  const handleAddVideoReference = useCallback(async (asset: any) => {
    if (!asset) return
    try {
      const api = (window as any).electronAPI
      const results = await api?.assets.readBase64([asset.id])
      const b64 = results?.[0]?.base64 || ''
      const mime = results?.[0]?.mime || 'video/mp4'
      if (!b64) return
      composerRef.current?.addRefs([{ base64: b64, mime }])
      setSelectedAsset(null)
    } catch (err) {
      console.error('Video reference failed:', err)
    }
  }, [])

  const handleRemoveBackground = useCallback(async (asset: any) => {
    if (!asset) return
    try {
      const api = (window as any).electronAPI
      const results = await api?.assets.readBase64([asset.id])
      let b64 = results?.[0]?.base64 || ''
      const mime = results?.[0]?.mime || 'image/png'
      if (b64.length > 6990508) b64 = await downscaleImage(b64, mime)
      setComposerMode('image')
      setComposerPayload({
        mode: 'image',
        prompt: 'Remove background',
        model: 'recraft/remove-background',
        imageBase64: b64,
        imageMime: 'image/jpeg',
      })
    } catch (err) {
      console.error('Remove background failed:', err)
    }
    setSelectedAsset(null)
  }, [setComposerPayload])

  const handleAnimate = useCallback(async (asset: any) => {
    if (!asset) return
    try {
      const api = (window as any).electronAPI
      const results = await api?.assets.readBase64([asset.id])
      const b64 = results?.[0]?.base64 || ''
      const mime = results?.[0]?.mime || 'image/png'
      setComposerMode('video')
      setComposerPayload({
        mode: 'video',
        prompt: asset.prompt || '',
        imageBase64: b64,
        imageMime: mime,
      })
    } catch (err) {
      console.error('Animate failed:', err)
    }
    setSelectedAsset(null)
  }, [setComposerPayload])

  const handleCreateElement = useCallback(async (asset: any) => {
    if (!asset) return
    try {
      const api = (window as any).electronAPI
      const results = await api?.assets.readBase64([asset.id])
      const b64 = results?.[0]?.base64 || ''
      setSelectedAsset(null)
      setTimeout(() => {
        setCreatingFromAsset({ base64: b64, prompt: asset.prompt || '' })
      }, 100)
    } catch (err) {
      console.error('Failed to create element:', err)
    }
  }, [])

  const filteredTags = allTags.filter(t => t.toLowerCase().includes(search.trim().toLowerCase()))

  const modalSrc = selectedAsset && (selectedAsset.localPath || (selectedAsset.filePath && !selectedAsset.filePath.startsWith('__error__') ? selectedAsset.filePath : ''))

  return (
    <div
      className="flex flex-col h-full relative"
      data-library-dropzone
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault()
          setDropActive(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false)
      }}
      onDrop={(e) => {
        if (!e.dataTransfer?.types?.includes('Files')) return
        e.preventDefault()
        e.stopPropagation()
        setDropActive(false)
        handleDropFiles(e.dataTransfer.files)
      }}
    >
      <div className="flex-1 overflow-y-auto p-4 pb-28">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-surface-200">Playground</span>
              <span className="text-[10px] text-surface-500">({total})</span>
            </div>
            <div className="relative flex-1 max-w-xs ml-auto" ref={searchRef}>
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
              <input
                value={search}
                onChange={(e) => { setAssetSearch({ query: e.target.value }); setTagMenuOpen(true) }}
                onFocus={() => setTagMenuOpen(true)}
                placeholder="Search by tag, prompt, model..."
                className="input-field pl-8 text-xs w-full"
              />
              {search && (
                <button onClick={() => { setAssetSearch({ query: '' }); setTagMenuOpen(true) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                  <X size={12} />
                </button>
              )}
              {tagMenuOpen && filteredTags.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-surface-800 border border-surface-700 rounded-xl py-1 shadow-xl z-50 max-h-[240px] overflow-y-auto">
                  {filteredTags.map((t) => (
                    <button
                      key={t}
                      onClick={() => { setAssetSearch({ query: t }); setTagMenuOpen(false) }}
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
              onClick={() => reset()}
              title="Reload assets"
              className="flex-shrink-0 p-1.5 rounded-lg border border-surface-800 text-surface-500 hover:text-surface-100 hover:border-surface-600 transition-colors"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => setAssetSearch({ featured: !assetSearch.featured })}
              title={showFavorites ? 'Show all assets' : 'Show favorites only'}
              className={`flex-shrink-0 p-1.5 rounded-lg border transition-colors ${showFavorites ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'border-surface-800 text-surface-500 hover:text-amber-400 hover:border-amber-500/30'}`}
            >
              <Star size={14} fill={showFavorites ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => setShowArchived(v => !v)}
              title={showArchived ? 'Ver activos' : 'Ver archivados'}
              className={`flex-shrink-0 p-1.5 rounded-lg border transition-colors ${showArchived ? 'bg-purple-500/15 border-purple-500/40 text-purple-400' : 'border-surface-800 text-surface-500 hover:text-purple-400 hover:border-purple-500/30'}`}
            >
              <Archive size={14} />
            </button>
            <div className="flex gap-1 bg-surface-900/40 rounded-lg p-1 border border-surface-800/60">
              <button
                onClick={() => {
                  setAssetSearch({
                    types: { image: true, video: true, audio: true },
                  })
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${typeFilter === 'all' ? 'bg-surface-800 text-surface-100' : 'text-surface-500 hover:text-surface-100'}`}
              >
                Todos
              </button>
              <button
                onClick={() => {
                  setAssetSearch({
                    types: { image: true, video: false, audio: false },
                  })
                  setComposerMode('image')
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${typeFilter === 'image' ? 'bg-surface-800 text-surface-100' : 'text-surface-500 hover:text-surface-100'}`}
              >
                <ImageIcon size={13} />
                <span>Imágenes</span>
              </button>
              <button
                onClick={() => {
                  setAssetSearch({
                    types: { image: false, video: true, audio: false },
                  })
                  setComposerMode('video')
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${typeFilter === 'video' ? 'bg-surface-800 text-surface-100' : 'text-surface-500 hover:text-surface-100'}`}
              >
                <Video size={13} />
                <span>Videos</span>
              </button>
            </div>
          </div>

          {activeOrphans && activeOrphans.count > 0 && (
            <div className="mb-3 flex items-center gap-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <Inbox size={14} className="text-amber-400 flex-shrink-0" />
              <p className="text-xs text-amber-300 flex-1">
                {activeOrphans.count} files on disk are not registered in this project
              </p>
              <button
                onClick={handleOrganize}
                disabled={organizing}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 disabled:opacity-50 text-[11px] font-medium flex items-center gap-1.5 transition-colors"
              >
                {organizing ? <Loader size={11} className="animate-spin" /> : <FolderOpen size={11} />}
                {organizing ? 'Organizing...' : 'Organize'}
              </button>
            </div>
          )}

          <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {assets.map((asset: any) => {
              const isSel = selectedIds.has(asset.id)
              const src = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : null)
              const isError = asset.filePath?.startsWith('__error__')
              const isLoading = !asset.localPath && asset.modelUsed && asset.modelUsed !== 'import' && !isError
              const durParam = (() => { try { return JSON.parse(asset.parameters || '{}')?.duration ?? null } catch { return null } })()
              const dur = durations[asset.id] ?? durParam
              return (
                <div key={asset.id} data-asset-card={asset.id} className="card group relative overflow-hidden p-0 cursor-pointer aspect-square"
                  onClick={(e) => { if (e.shiftKey) { toggleSelect(asset.id, true) } else { setSelectedAsset(asset) } }}
                  onMouseEnter={asset.type === 'video' ? () => handleMouseEnter(asset.id) : undefined}
                  onMouseLeave={asset.type === 'video' ? () => handleMouseLeave(asset.id) : undefined}
                >
                  <div className="w-full h-full bg-surface-800 flex items-center justify-center overflow-hidden">
                    {src ? (
                      asset.type === 'video' ? (
                        <video
                          ref={(el) => { if (el) { videoRefs.current.set(asset.id, el); el.muted = true } else videoRefs.current.delete(asset.id) }}
                          data-video-id={asset.id}
                          src={srcUrl(src)}
                          className="w-full h-full object-cover"
                          preload="auto"
                          loop
                          playsInline
                          onLoadedMetadata={(e) => registerDuration(asset.id, (e.target as HTMLVideoElement).duration)}
                        />
                      ) : asset.type === 'audio' ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-2 bg-gradient-to-br from-surface-800/50 to-surface-900/50">
                          <AudioLines size={26} className={playingAudioId === asset.id ? 'text-accent-400' : 'text-surface-500'} />
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleAudioPlay(asset.id) }}
                            className="w-9 h-9 rounded-full bg-accent-500/20 text-accent-300 hover:bg-accent-500/35 flex items-center justify-center transition-colors"
                            title={playingAudioId === asset.id ? 'Pause' : 'Play'}
                          >
                            {playingAudioId === asset.id ? <Pause size={15} /> : <Play size={15} />}
                          </button>
                          <audio
                            ref={(el) => { if (el) audioRefs.current.set(asset.id, el); else audioRefs.current.delete(asset.id) }}
                            src={srcUrl(src)}
                            preload="metadata"
                            onLoadedMetadata={(e) => registerDuration(asset.id, (e.target as HTMLAudioElement).duration)}
                            onEnded={() => { if (playingAudioId === asset.id) setPlayingAudioId(null) }}
                            className="hidden"
                          />
                        </div>
                      ) : (
                        <img src={thumbUrl(src)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      )
                    ) : isError ? (
                      <div className="flex flex-col items-center justify-center gap-1.5 text-red-400 p-3 text-center w-full h-full">
                        <AlertCircle size={20} className="flex-shrink-0" />
                        <span className="text-[10px] text-red-400/80 line-clamp-3 leading-tight">{asset.filePath?.replace('__error__:', '')}</span>
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
                  {!isLoading && (asset.type === 'video' || asset.type === 'audio') && dur != null && (
                    <div className="absolute bottom-2 left-2 bg-black/60 rounded px-1.5 py-0.5 text-[9px] text-white/90 font-medium z-10 flex items-center gap-1">
                      <Clock size={9} /> {formatDuration(dur)}
                    </div>
                  )}
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

      <PromptComposer
        ref={composerRef}
        onGenerate={handleGenerate}
        mode={composerMode}
        onModeChange={(newMode) => {
          setComposerMode(newMode)
          if (newMode === 'video' && !assetSearch.types.video) {
            setAssetSearch({ types: { ...assetSearch.types, video: true } })
          } else if (newMode === 'image' && !assetSearch.types.image) {
            setAssetSearch({ types: { ...assetSearch.types, image: true } })
          }
        }}
        floating
      />

      <BulkActionBar
        selectedCount={selectedIds.size}
        selectedIds={Array.from(selectedIds)}
        onAddTags={() => setShowBulkTag(true)}
        onDelete={() => setShowBulkDelete(true)}
        onArchive={handleBulkArchive}
        archiveTitle={showArchived ? 'Desarchivar' : 'Archivar'}
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

      {/* Unified detail modal (same as ImageGen/VideoGen) */}
      {selectedAsset && (
        <LibraryAssetModal
          asset={selectedAsset}
          src={modalSrc || ''}
          params={params}
          onClose={() => setSelectedAsset(null)}
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
          onAssetChange={(updated) => setSelectedAsset(updated)}
          onToggleFavorite={() => handleToggleFavorite(selectedAsset.id)}
          onDelete={() => handleDelete(selectedAsset.id)}
          onRecreate={handleRecreate}
          onCopyImage={() => handleCopyImage(selectedAsset)}
          copiedImage={copiedAssetId === selectedAsset.id}
          onAddReference={() => selectedAsset.type === 'video' ? handleAddVideoReference(selectedAsset) : handleAddImageReference(selectedAsset)}
          onRemoveBackground={() => handleRemoveBackground(selectedAsset)}
          onAnimate={() => handleAnimate(selectedAsset)}
          onCreateElement={() => handleCreateElement(selectedAsset)}
        />
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

      {dropActive && (
        <div className="absolute inset-0 z-40 bg-surface-950/80 backdrop-blur-sm flex items-center justify-center pointer-events-none border-2 border-dashed border-accent-400 rounded-xl m-2">
          <div className="flex flex-col items-center gap-2 text-accent-300">
            {importingFiles ? <Loader size={28} className="animate-spin" /> : <Upload size={28} />}
            <p className="text-sm font-medium">{importingFiles ? 'Importing files...' : 'Drop files to import to this project'}</p>
            <p className="text-[11px] text-surface-500">Images, videos and audio will be added to the Library</p>
          </div>
        </div>
      )}
    </div>
  )
}

function LibraryAssetModal({
  asset, src, params, onClose, onPrev, onNext, onAssetChange, onToggleFavorite, onDelete, onRecreate,
  onCopyImage, copiedImage, onAddReference, onRemoveBackground, onAnimate, onCreateElement,
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
  onCopyImage?: () => void
  copiedImage?: boolean
  onAddReference?: () => void
  onRemoveBackground?: () => void
  onAnimate?: () => void
  onCreateElement?: () => void
}) {
  const [copiedPrompt, setCopiedPrompt] = useState(false)
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

  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); setPromptExpanded(false) }, [asset.id, src])

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
  const isVideo = asset.type === 'video'
  const isError = asset.filePath?.startsWith('__error__')
  const isLoading = !asset.localPath && asset.modelUsed && asset.modelUsed !== 'import' && !isError
  const isGeneratingOrError = !src || isError || isLoading

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="bg-surface-950 border border-surface-800 rounded-2xl max-w-[95vw] w-full mx-2 max-h-[95vh] flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Media */}
        <div
          ref={containerRef}
          className="flex-1 bg-black flex items-center justify-center min-h-[400px] relative overflow-hidden"
          onWheel={isImage && !isGeneratingOrError ? handleWheel : undefined}
          onMouseDown={isImage && !isGeneratingOrError ? handleMouseDown : undefined}
          onMouseMove={isImage && !isGeneratingOrError ? handleMouseMove : undefined}
          onMouseUp={isImage && !isGeneratingOrError ? handleMouseUp : undefined}
          onMouseLeave={isImage && !isGeneratingOrError ? handleMouseUp : undefined}
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
          {isError ? (
            <div className="flex flex-col items-center justify-center gap-3 text-red-400 p-8 text-center max-w-lg">
              <AlertCircle size={36} className="flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-red-400">Error en la generación</p>
                <p className="text-xs text-red-400/90 leading-relaxed font-mono bg-red-950/30 border border-red-900/40 rounded-lg p-3 max-w-md">
                  {asset.filePath?.replace('__error__:', '') || 'No se pudo completar la generación'}
                </p>
              </div>
              <button
                type="button"
                onClick={onRecreate}
                className="mt-2 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-surface-200 bg-surface-800 hover:bg-surface-700 border border-surface-700 transition-colors"
              >
                <RotateCcw size={14} className="text-accent-400" />
                Reintentar generación
              </button>
            </div>
          ) : isLoading ? (
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
          ) : isImage ? (
            <img
              ref={imgRef}
              src={srcUrl(src)}
              alt=""
              className="max-w-full max-h-[90vh] object-contain select-none"
              draggable={false}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
              }}
            />
          ) : asset.type === 'video' ? (
            <AutoPlayVideo key={asset.id} src={srcUrl(src)} className="max-w-full max-h-[90vh] object-contain" />
          ) : (
            <audio controls src={srcUrl(src)} className="max-w-full px-4" autoPlay />
          )}
          {!isGeneratingOrError && isImage && onCopyImage && (
            <button
              onClick={(e) => { e.stopPropagation(); onCopyImage() }}
              title="Copiar imagen"
              className={`absolute top-3 right-12 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center z-10 transition-colors ${copiedImage ? 'text-green-400' : 'text-white/60 hover:text-white'}`}
            >
              {copiedImage ? <Check size={14} /> : <Copy size={14} />}
            </button>
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
        <div className="w-96 min-w-[380px] flex-shrink-0 bg-surface-900/80 border-l border-surface-800 flex flex-col">
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
              <p
                onClick={() => setPromptExpanded(!promptExpanded)}
                className={`text-sm text-surface-200 leading-relaxed flex-1 cursor-pointer select-none ${promptExpanded ? '' : 'line-clamp-4'}`}
                title={promptExpanded ? 'Click para contraer' : 'Click para expandir'}
              >
                {asset.prompt || params.prompt || '—'}
              </p>
              <button onClick={() => { copyText(asset.prompt || params.prompt || ''); setCopiedPrompt(true); setTimeout(() => setCopiedPrompt(false), 1500) }}
                className="p-1 text-surface-500 hover:text-surface-100 flex-shrink-0 mt-0.5">
                {copiedPrompt ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Model</p>
            <p className="text-sm text-surface-200">{modelLabel(asset.modelUsed)}</p>
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
          <div className="pt-2 border-t border-surface-800 grid grid-cols-2 gap-1.5">
            <button onClick={onRecreate} className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5 text-accent-400 hover:text-accent-300">
              <RotateCcw size={12} /> Recreate
            </button>
            <button onClick={handleSaveAs} disabled={saveState === 'saving'} className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5">
              {saveState === 'done' ? <Check size={12} className="text-green-400" /> : saveState === 'saving' ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
              {saveState === 'done' ? 'Saved' : 'Save as'}
            </button>
            {isImage && onAddReference && (
              <button onClick={onAddReference} className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5">
                <ImageIcon size={12} /> Reference
              </button>
            )}
            {isImage && onRemoveBackground && (
              <button onClick={onRemoveBackground} className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5">
                <Eraser size={12} /> Quitar fondo
              </button>
            )}
            {isImage && onAnimate && (
              <button onClick={onAnimate} className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5">
                <Clapperboard size={12} /> Animar
              </button>
            )}
            {isImage && onCreateElement && (
              <button onClick={onCreateElement} className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5">
                <Box size={12} /> Crear elemento
              </button>
            )}
            {isVideo && onAddReference && (
              <button onClick={onAddReference} className="btn-ghost text-xs w-full col-span-2 justify-center flex items-center gap-1.5 text-accent-400 hover:text-accent-300">
                <Video size={12} /> Reference
              </button>
            )}
            {(asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') && !asset.filePath.startsWith('http'))) && (
              <button onClick={() => (window as any).electronAPI?.assets.showInFolder(asset.id)}
                className={`btn-ghost text-xs w-full justify-center flex items-center gap-1.5 ${isImage ? '' : 'col-span-2'}`}>
                <FolderOpen size={12} /> Show in folder
              </button>
            )}
            {confirmDelete ? (
              <div className="flex items-center gap-2 justify-center col-span-2">
                <span className="text-[11px] text-surface-400">Confirm delete?</span>
                <button onClick={() => { onDelete(); setConfirmDelete(false) }}
                  className="px-2 py-1 rounded bg-red-500/80 text-white text-[10px] font-medium">Yes</button>
                <button onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 rounded bg-white/10 text-white text-[10px]">No</button>
              </div>
            ) : (
              <button className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5 text-red-400 col-span-2" onClick={() => setConfirmDelete(true)}>
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
