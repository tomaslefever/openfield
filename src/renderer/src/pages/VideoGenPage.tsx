import { useState, useCallback, useEffect, useRef } from 'react'
import { Download, Trash2, Coins, Loader, AlertCircle, X, Copy, Check, ChevronLeft, ChevronRight, RefreshCw, RotateCcw, Clock, Cloud, FolderOpen } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { PromptComposer } from '../components/PromptComposer'
import { fileUrl } from '../services/file-url'
import { AssetBadge } from '../components/ui/asset-badge'

const MODEL_NAMES: Record<string, string> = {
  'kling-3.0/video': 'Kling 3.0',
  'kling/v25-turbo-text-to-video-pro': 'Kling 2.5 Turbo',
  'kling/v25-turbo-image-to-video-pro': 'Kling 2.5 Turbo',
  'grok-imagine/text-to-video': 'Grok Imagine',
  'grok-imagine/image-to-video': 'Grok Imagine',
  'bytedance/seedance-2': 'Seedance 2',
  'bytedance/seedance-2-fast': 'Seedance 2 Fast',
  'wan-2-7-text-to-video': 'Wan 2.7',
  'wan-2-7-image-to-video': 'Wan 2.7',
  'hailuo/02-text-to-video-pro': 'Hailuo 2 Pro',
  'gemini-omni-video': 'Gemini Omni',
}

export function VideoGenPage() {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<any>(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [isDev, setIsDev] = useState(false)
  const [videoVersion, setVideoVersion] = useState(0)

  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())

  const getVideoEl = (id: string) => videoRefs.current.get(id) || document.querySelector(`[data-video-id="${id}"]`) as HTMLVideoElement | null

  const playTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const handleMouseEnter = (id: string) => {
    const el = getVideoEl(id)
    if (!el) return
    el.currentTime = 0
    el.muted = true
    el.play().catch(() => {})
    const interval = setInterval(() => {
      if (el.paused && el.readyState >= 2) { el.play().catch(() => {}) }
    }, 200)
    playTimerRef.current.set(id, interval)
  }
  const handleMouseLeave = (id: string) => {
    const el = getVideoEl(id)
    if (el) { el.pause(); el.currentTime = 0 }
    const timer = playTimerRef.current.get(id)
    if (timer) { clearInterval(timer); playTimerRef.current.delete(id) }
  }

  const { data: recentVideos, refetch } = useQuery({
    queryKey: ['assets', 'recent', 'video'],
    queryFn: () => (window as any).electronAPI?.assets.list({ type: 'video', limit: 50 }) ?? { assets: [] },
    refetchInterval: 3000,
  })

  const assets = Array.isArray(recentVideos?.assets) ? recentVideos.assets : []

  useEffect(() => {
    try {
      (window as any).electronAPI?.isDev?.().then((dev: boolean) => setIsDev(!!dev)).catch(() => {})
    } catch {}
  }, [])

  useEffect(() => {
    setSelectedAsset((prev) => {
      if (!prev || assets.length === 0) return prev
      const updated = assets.find((a: any) => a.id === prev.id)
      if (!updated) return prev
      if (updated.localPath === prev.localPath && updated.filePath === prev.filePath && updated.status === prev.status) return prev
      return updated
    })
  }, [assets])

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
      if (e.key === 'Escape') setSelectedAsset(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedAsset, assets])

  const handleDelete = useCallback(async (assetId: string) => {
    await (window as any).electronAPI?.assets.delete(assetId)
    refetch()
    if (selectedAsset?.id === assetId) setSelectedAsset(null)
  }, [refetch, selectedAsset])

  const handleGenerate = useCallback(async (params: any) => {
    try {
      await (window as any).electronAPI?.kie.generateVideo(params)
      refetch()
    } catch (err) { console.error('Video generation failed:', err) }
  }, [refetch])

  const params = selectedAsset ? (() => { try { return JSON.parse(selectedAsset.parameters || '{}') } catch { return {} } })() : {}

  const handleReload = () => {
    refetch()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 pb-32">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-lg font-semibold text-surface-100">Video Generation</h1>
            {isDev && (
              <button onClick={handleReload} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-[11px] font-medium text-amber-400 transition-colors">
                <RotateCcw size={12} /> Reload
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {assets.map((asset: any) => (
              <div key={asset.id} className="card group relative overflow-hidden p-0 cursor-pointer" onClick={() => setSelectedAsset(asset)} onMouseEnter={() => handleMouseEnter(asset.id)} onMouseLeave={() => handleMouseLeave(asset.id)}>
                <div className="aspect-square bg-surface-800 flex items-center justify-center overflow-hidden">
                  {(() => {
                    const src = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : null)
                    if (src) return <video ref={(el) => { if (el) { videoRefs.current.set(asset.id, el); el.muted = true } else videoRefs.current.delete(asset.id) }} data-video-id={asset.id} src={fileUrl(src)} className="w-full h-full object-cover" preload="auto" loop playsInline />
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
                  <div className="absolute top-2 right-2 bg-black/60 rounded-md p-1">
                    <Cloud size={12} className="text-blue-400" />
                  </div>
                )}
                {asset.creditsUsed > 0 && (
                  <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 bg-black/60 rounded-md">
                    <Coins size={10} className="text-amber-400" />
                    <span className="text-[10px] text-amber-400 font-medium">{asset.creditsUsed}</span>
                  </div>
                )}
                {(() => { try { const p = JSON.parse(asset.parameters || '{}'); if (p.aspectRatio) return <AssetBadge value={p.aspectRatio} /> } catch {} return null })()}
              </div>
            ))}
          </div>

          {assets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-surface-600">
              <svg xmlns="http://www.w3.org/2000/svg" width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              <p className="text-sm">No videos yet. Generate using the composer below.</p>
            </div>
          )}
        </div>
      </div>

      <PromptComposer onGenerate={handleGenerate} mode="video" />

      {/* Detail modal */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedAsset(null)}>
          <div className="bg-surface-950 border border-surface-800 rounded-2xl max-w-5xl w-full mx-4 max-h-[90vh] flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Video */}
            <div className="flex-1 bg-black flex items-center justify-center min-h-[400px] relative">
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
                <video key={selectedAsset.id} src={fileUrl(selectedAsset.localPath || selectedAsset.filePath, videoVersion)} className="max-w-full max-h-[80vh] object-contain" controls preload="auto" playsInline />
              ) : (
                <div className="text-surface-600">No preview</div>
              )}
              <button onClick={() => setSelectedAsset(null)} className="absolute top-3 right-3 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white/60 hover:text-white">
                <X size={16} />
              </button>
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
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Credits Used</p>
                <p className="text-sm text-amber-400">{selectedAsset.creditsUsed > 0 ? selectedAsset.creditsUsed.toLocaleString() : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Created</p>
                <p className="text-sm text-surface-200">{selectedAsset.createdAt ? new Date(selectedAsset.createdAt).toLocaleString() : '—'}</p>
              </div>
              <div className="pt-2 border-t border-surface-800 space-y-1.5">
                <button onClick={async () => {
                  setRefreshing(true)
                  try {
                    const api = (window as any).electronAPI
                    if (api?.assets?.refresh) {
                      const updated = await api.assets.refresh(selectedAsset.id)
                      if (updated) { setSelectedAsset(updated); setVideoVersion(v => v + 1) }
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
                      if (updated) { setSelectedAsset(updated); setVideoVersion(v => v + 1) }
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