import { useState, useCallback, useEffect, useRef, memo, useMemo } from 'react'
import { Trash2, Coins, Loader, AlertCircle, X, Copy, Check, ChevronLeft, ChevronRight, RotateCcw, Cloud, FolderOpen, CheckSquare, Square, Search, Star, Mic, AudioLines, Play, Pause, Clock, Download } from 'lucide-react'
import { PromptComposer, type PromptComposerHandle } from '../components/PromptComposer'
import { VoiceGenView } from '../components/voice/VoiceGenView'
import { usePagedAssets } from '../hooks/usePagedAssets'
import { copyText } from '../lib/clipboard'
import { useAppStore } from '../stores/app-store'
import { srcUrl } from '../services/file-url'
import { TagEditor } from '../components/ui/TagEditor'
import { BulkActionBar } from '../components/ui/BulkActionBar'
import { ConfirmDeleteModal } from '../components/ui/ConfirmDeleteModal'
import { BulkTagModal } from '../components/ui/BulkTagModal'
import { Tabs } from '../components/ui/tabs'

const MODEL_NAMES: Record<string, string> = {
  'gpt-tts-1': 'GPT TTS',
  'minimax-text-to-speech': 'MiniMax TTS',
  'openaudio-text-to-music': 'OpenAudio Music',
  'mucat-text-to-music': 'MuCat Music',
}

const KIND_ICON: Record<string, typeof Mic> = {
  voice: Mic,
  music: AudioLines,
}

function getAudioKind(asset: any): 'voice' | 'music' | null {
  const model = asset.modelUsed || ''
  if (model.startsWith('piper:') || model.startsWith('kokoro:') || model === 'gpt-tts-1' || model === 'minimax-text-to-speech') return 'voice'
  if (model === 'openaudio-text-to-music' || model === 'mucat-text-to-music') return 'music'
  try {
    const p = JSON.parse(asset.parameters || '{}')
    if (p.kind === 'voice') return 'voice'
    if (p.kind === 'music') return 'music'
  } catch {}
  return null
}

function Waveform({ playing }: { playing: boolean }) {
  const bars = [4, 6, 5, 9, 6, 11, 7, 12, 6, 9, 5, 7]
  return (
    <div className="flex items-end gap-[3px] h-8">
      {bars.map((h, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full transition-all duration-300 ${playing ? 'bg-accent-400 animate-pulse' : 'bg-surface-600'}`}
          style={{ height: `${h * 3}px` }}
        />
      ))}
    </div>
  )
}

const AssetCard = memo(function AssetCard({
  asset,
  isSelected,
  isPlaying,
  onSelect,
  onToggleSelect,
  onTogglePlay,
  onToggleFavorite,
}: {
  asset: any
  isSelected: boolean
  isPlaying: boolean
  onSelect: (asset: any) => void
  onToggleSelect: (id: string) => void
  onTogglePlay: (asset: any) => void
  onToggleFavorite: (id: string) => void
}) {
  const params = (() => { try { return JSON.parse(asset.parameters || '{}') } catch { return {} } })()
  const src = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : null)
  const isError = asset.filePath?.startsWith('__error__')
  const isLoading = !asset.localPath && asset.modelUsed && asset.modelUsed !== 'import' && !isError
  const kind = getAudioKind(asset)
  const Icon = kind ? KIND_ICON[kind] : AudioLines

  return (
    <div
      className="card group relative overflow-hidden p-0 cursor-pointer"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 250px' }}
      onClick={() => onSelect(asset)}
    >
      <div className="aspect-square bg-surface-800 flex items-center justify-center overflow-hidden">
        {src ? (
          <div className="flex flex-col items-center justify-center gap-3 w-full h-full">
            <div className="relative flex items-center justify-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${isPlaying ? 'bg-accent-500/20 text-accent-400' : 'bg-surface-700/80 text-surface-400 group-hover:text-surface-200'}`}>
                <Icon size={26} />
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onTogglePlay(asset) }}
                className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-accent-600 hover:bg-accent-500 text-white flex items-center justify-center shadow-lg shadow-black/40 transition-all opacity-0 group-hover:opacity-100"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
              </button>
            </div>
            <Waveform playing={isPlaying} />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-1.5 text-red-400 px-2">
            <AlertCircle size={20} />
            <span className="text-[10px] text-center text-red-400/80 line-clamp-3">{asset.filePath.replace('__error__:', '')}</span>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center gap-2 text-accent-400">
            <Loader size={24} className="animate-spin" />
            <span className="text-xs text-surface-500 px-2 text-center line-clamp-2">{asset.prompt}</span>
          </div>
        ) : (
          <div className="text-surface-600 text-sm">No preview</div>
        )}
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
        {asset.filePath?.startsWith('http') && (
          <div className="bg-black/60 rounded-md p-1">
            <Cloud size={12} className="text-blue-400" />
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(asset.id) }}
          title={asset.isFavorite ? 'Remove favorite' : 'Add to favorites'}
          className={`p-1 rounded-md transition-colors ${asset.isFavorite ? 'text-amber-400 bg-black/60' : 'text-white/80 bg-black/60 opacity-0 group-hover:opacity-100 hover:text-amber-400'}`}
        >
          <Star size={12} fill={asset.isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect(asset.id) }}
        className={`absolute top-2 left-2 z-10 p-0.5 rounded transition-all ${isSelected ? 'opacity-100 bg-accent-500 text-white' : 'opacity-0 group-hover:opacity-100 bg-black/50 text-white hover:bg-black/70'}`}
      >
        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
      </button>
      <div className="absolute bottom-2 right-2 flex items-center gap-1">
        {kind && <span className="px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-surface-300 font-medium uppercase tracking-wide">{kind}</span>}
        {asset.creditsUsed > 0 && <AssetBadgeCompat credits={asset.creditsUsed} />}
      </div>
    </div>
  )
})

function AssetBadgeCompat({ credits }: { credits: number }) {
  return (
    <div className="p-1 bg-black/60 rounded-md flex items-center gap-1 leading-none">
      <Coins size={10} className="text-amber-400" />
      <span className="text-[10px] text-surface-300 font-medium">{Math.round(credits)}</span>
    </div>
  )
}

export function AudioGenPage() {
  const [activeTab, setActiveTab] = useState<'voice' | 'music'>('voice')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<any>(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkTag, setShowBulkTag] = useState(false)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [search, setSearch] = useState('')
  const [showFavorites, setShowFavorites] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [audioVersion, setAudioVersion] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'done'>('idle')
  const [audioStatus, setAudioStatus] = useState<{ status: string; message: string; pct: number } | null>(null)
  const [audioError, setAudioError] = useState('')
  const composerRef = useRef<PromptComposerHandle>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const composerPayload = useAppStore(s => s.composerPayload)
  const setComposerPayload = useAppStore(s => s.setComposerPayload)

  useEffect(() => {
    if (composerPayload && composerPayload.mode === 'audio') {
      setTimeout(() => {
        composerRef.current?.loadFromParams(composerPayload)
        setComposerPayload(null)
      }, 100)
    }
  }, [composerPayload, setComposerPayload])

  const { assets, total, hasMore, initialLoading, loadingMore, sentinelRef, reset, updateAsset } = usePagedAssets({ type: 'audio', search, isFavorite: showFavorites, pageSize: 20, excludeUploads: true })

  // Split assets by kind
  const voiceAssets = useMemo(() => assets.filter((a: any) => getAudioKind(a) === 'voice'), [assets])
  const musicAssets = useMemo(() => assets.filter((a: any) => getAudioKind(a) === 'music'), [assets])

  const tabCounts = useMemo(() => ({
    voice: voiceAssets.length,
    music: musicAssets.length,
  }), [voiceAssets, musicAssets])

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
    const api = (window as any).electronAPI
    if (!api) return
    const unsubComplete = api.on('openfield:task:completed', () => reset())
    const unsubFailed = api.on('openfield:task:failed', () => reset())
    const unsubProgress = api.on('local:audio:progress', (p: any) => {
      if (p?.status === 'completed') {
        setAudioStatus(null)
        reset()
      } else if (p) {
        setAudioStatus({ status: p.status, message: p.message || '', pct: p.pct || 0 })
      }
    })
    const unsubError = api.on('local:audio:error', (e: any) => {
      setAudioStatus(null)
      setAudioError(e?.message || 'Error generando audio')
    })
    return () => { unsubComplete?.(); unsubFailed?.(); unsubProgress?.(); unsubError?.() }
  }, [reset])

  useEffect(() => {
    if (!selectedAsset) return
    const currentAssets = activeTab === 'voice' ? voiceAssets : musicAssets
    const handler = (e: KeyboardEvent) => {
      const idx = currentAssets.findIndex((a: any) => a.id === selectedAsset.id)
      if (e.key === 'ArrowLeft' && idx > 0) setSelectedAsset(currentAssets[idx - 1])
      if (e.key === 'ArrowRight' && idx < currentAssets.length - 1) setSelectedAsset(currentAssets[idx + 1])
      if (e.key === 'Escape') setSelectedAsset(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedAsset, voiceAssets, musicAssets, activeTab])

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

  const handleGenerate = useCallback(async (params: any) => {
    try {
      const api = (window as any).electronAPI
      setAudioError('')
      if (params.local && params.voiceId) {
        setAudioStatus({ status: 'starting', message: 'Iniciando...', pct: 0 })
        await api?.local.audioGenerate({ voiceId: params.voiceId, prompt: params.prompt, engine: params.engine, speed: params.speed })
      } else {
        await api?.openfield.generateAudio(params)
      }
      setAudioStatus(null)
      reset()
    } catch (err: any) {
      console.error('Audio generation failed:', err)
      setAudioStatus(null)
      setAudioError(err?.message || 'Error generando audio. Revisa la consola.')
    }
  }, [reset])

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
    reset()
  }, [selectedIds, clearSelection, reset])

  const handleBulkAddTags = useCallback(async (tags: string[]) => {
    const api = (window as any).electronAPI
    await api?.assets.addTagsMultiple(Array.from(selectedIds), tags)
    setShowBulkTag(false)
    reset()
  }, [selectedIds, reset])

  const togglePlay = useCallback((asset: any) => {
    const el = audioRef.current
    if (!el) return
    const src = srcUrl(asset.localPath || asset.filePath)
    if (!src) return
    if (playingId === asset.id) {
      el.pause()
      setPlayingId(null)
      return
    }
    if (el.getAttribute('data-src') !== src) {
      el.src = src
      el.setAttribute('data-src', src)
      setAudioVersion(v => v + 1)
    }
    el.play().then(() => setPlayingId(asset.id)).catch(() => {})
  }, [playingId])

  useEffect(() => {
    const visibleIds = new Set(musicAssets.map((a: any) => a.id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      let changed = false
      for (const id of prev) {
        if (!visibleIds.has(id)) { next.delete(id); changed = true }
      }
      return changed ? next : prev
    })
  }, [activeTab])

  const params = selectedAsset ? (() => { try { return JSON.parse(selectedAsset.parameters || '{}') } catch { return {} } })() : {}
  const modelUsed = selectedAsset?.modelUsed || ''
  const isPiper = modelUsed.startsWith('piper:')
  const isKokoro = modelUsed.startsWith('kokoro:')
  const isLocalVoice = isPiper || isKokoro

  function localVoiceLabel(modelUsedRaw: string): string {
    if (modelUsedRaw.startsWith('piper:')) return `Piper · ${modelUsedRaw.slice(6)}`
    if (modelUsedRaw.startsWith('kokoro:')) return `Kokoro · ${modelUsedRaw.slice(7)}`
    return modelUsedRaw
  }

  // === Voice Tab Layout ===
  if (activeTab === 'voice') {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Tab bar */}
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          <Tabs
            tabs={[
              { id: 'voice', label: 'Voice', icon: Mic, count: tabCounts.voice },
              { id: 'music', label: 'Music', icon: AudioLines, count: tabCounts.music },
            ]}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as 'voice' | 'music')}
          />
        </div>

        <VoiceGenView
          onGenerate={handleGenerate}
          voiceAssets={voiceAssets}
          isGenerating={!!audioStatus}
          statusMessage={audioStatus?.message || ''}
          statusPct={audioStatus?.pct || 0}
          errorMessage={audioError}
          onClearError={() => setAudioError('')}
        />

        {/* Hidden audio element for playback */}
        <audio
          ref={audioRef}
          className="hidden"
          onEnded={() => setPlayingId(null)}
          onPause={() => setPlayingId(null)}
        />
      </div>
    )
  }

  // === Music Tab Layout ===
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Tabs
              tabs={[
                { id: 'voice', label: 'Voice', icon: Mic, count: tabCounts.voice },
                { id: 'music', label: 'Music', icon: AudioLines, count: tabCounts.music },
              ]}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as 'voice' | 'music')}
            />
            <span className="text-[10px] text-surface-600 ml-auto flex-shrink-0">{musicAssets.length} audios</span>
            <div className="relative w-48 flex-shrink-0">
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
              title={showFavorites ? 'Show all audios' : 'Show favorites only'}
              className={`flex-shrink-0 p-1.5 rounded-lg border transition-colors ${showFavorites ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'border-surface-800 text-surface-500 hover:text-amber-400 hover:border-amber-500/30'}`}
            >
              <Star size={14} fill={showFavorites ? 'currentColor' : 'none'} />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {musicAssets.map((asset: any) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                isSelected={selectedIds.has(asset.id)}
                isPlaying={playingId === asset.id}
                onSelect={setSelectedAsset}
                onToggleSelect={toggleSelect}
                onTogglePlay={togglePlay}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
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

          {musicAssets.length === 0 && !initialLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-surface-600">
              <svg xmlns="http://www.w3.org/2000/svg" width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              <p className="text-sm">No music generations yet. Type a prompt below to get started.</p>
            </div>
          )}
        </div>
      </div>

      <audio
        ref={audioRef}
        className="hidden"
        onEnded={() => setPlayingId(null)}
        onPause={() => setPlayingId(null)}
      />

      {audioError && (
        <div className="px-4 pb-2">
          <div className="flex items-start gap-2 bg-red-900/30 border border-red-800/40 rounded-lg px-3 py-2">
            <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-300 flex-1 leading-relaxed">{audioError}</p>
            <button onClick={() => setAudioError('')} className="text-red-400/70 hover:text-red-300 flex-shrink-0">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {audioStatus && (
        <div className="px-4 pb-2">
          <div className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              <Loader size={14} className="animate-spin text-accent-400 flex-shrink-0" />
              <span className="text-xs text-surface-200 truncate">{audioStatus.message || audioStatus.status}</span>
              {audioStatus.pct > 0 && <span className="text-xs text-surface-500 ml-auto">{audioStatus.pct.toFixed(0)}%</span>}
            </div>
            <div className="w-full h-1.5 bg-surface-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(Math.max(audioStatus.pct || 5, 2), 100)}%` }}
              />
            </div>
            {audioStatus.status === 'installing_deps' && (
              <p className="text-[10px] text-surface-500 mt-1.5">
                Instalando dependencias de Kokoro (torch + misaki). Solo la primera vez, puede tardar varios minutos.
              </p>
            )}
          </div>
        </div>
      )}

      <PromptComposer ref={composerRef} onGenerate={handleGenerate} mode="audio" subMode={activeTab} />

      <BulkActionBar
        selectedCount={selectedIds.size}
        onAddTags={() => setShowBulkTag(true)}
        onDelete={() => setShowBulkDelete(true)}
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
            <div className="flex-1 bg-surface-900/40 flex items-center justify-center min-h-[400px] relative p-6">
              {musicAssets.findIndex((a: any) => a.id === selectedAsset.id) > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); const idx = musicAssets.findIndex((a: any) => a.id === selectedAsset.id); setSelectedAsset(musicAssets[idx - 1]) }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors z-10">
                  <ChevronLeft size={20} />
                </button>
              )}
              {musicAssets.findIndex((a: any) => a.id === selectedAsset.id) < musicAssets.length - 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); const idx = musicAssets.findIndex((a: any) => a.id === selectedAsset.id); setSelectedAsset(musicAssets[idx + 1]) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors z-10">
                  <ChevronRight size={20} />
                </button>
              )}
              {(selectedAsset.localPath || (selectedAsset.filePath && !selectedAsset.filePath.startsWith('__error__'))) ? (
                <div className="w-full max-w-lg">
                  <div className="flex flex-col items-center gap-6">
                    <div className="w-24 h-24 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center">
                      {(() => {
                        const k = getAudioKind(selectedAsset)
                        const Icon = k === 'voice' || isPiper || isKokoro ? Mic : AudioLines
                        return <Icon size={40} className="text-accent-400" />
                      })()}
                    </div>
                    <Waveform playing={false} />
                    <audio
                      key={`${selectedAsset.id}-${audioVersion}`}
                      src={srcUrl(selectedAsset.localPath || selectedAsset.filePath, audioVersion)}
                      className="w-full"
                      controls
                      preload="auto"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-surface-600">No preview</div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleToggleFavorite(selectedAsset.id) }}
                title={selectedAsset.isFavorite ? 'Remove favorite' : 'Add to favorites'}
                className={`absolute top-3 right-3 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center z-10 transition-colors ${selectedAsset.isFavorite ? 'text-amber-400' : 'text-white/60 hover:text-amber-400'}`}
              >
                <Star size={14} fill={selectedAsset.isFavorite ? 'currentColor' : 'none'} />
              </button>
            </div>
            <div className="w-72 bg-surface-900/80 border-l border-surface-800 flex flex-col">
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
                  <p className="text-sm text-surface-200 leading-relaxed flex-1">{selectedAsset.prompt || params.prompt || '—'}</p>
                  <button onClick={() => { copyText(selectedAsset.prompt || params.prompt || ''); setCopiedPrompt(true); setTimeout(() => setCopiedPrompt(false), 1500) }}
                    className="p-1 text-surface-500 hover:text-surface-100 flex-shrink-0 mt-0.5">
                    {copiedPrompt ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Model</p>
                <p className="text-sm text-surface-200">{isLocalVoice ? localVoiceLabel(modelUsed) : (MODEL_NAMES[modelUsed] || modelUsed || '—')}</p>
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Kind</p>
                <p className="text-sm text-surface-200 flex items-center gap-1">
                  {(params.kind === 'voice' || isPiper || isKokoro) ? <Mic size={12} /> : params.kind === 'music' ? <AudioLines size={12} /> : null}
                  {params.kind === 'voice' ? 'Voice' : params.kind === 'music' ? 'Music' : isLocalVoice ? 'Voice (local)' : '—'}
                </p>
              </div>
              {params.duration != null && (
                <div>
                  <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Duration</p>
                  <p className="text-sm text-surface-200 flex items-center gap-1"><Clock size={12} /> {params.duration}s</p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">File Size</p>
                <p className="text-sm text-surface-200">{selectedAsset.fileSize ? `${(selectedAsset.fileSize / 1024).toFixed(0)} KB` : '—'}</p>
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
                <p className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Task ID</p>
                <p className="text-[11px] font-mono text-surface-400 break-all">{selectedAsset.taskId || '—'}</p>
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
                <button onClick={async () => {
                  try {
                    const p = JSON.parse(selectedAsset.parameters || '{}')
                    const model = isLocalVoice ? (modelUsed.replace(/^(piper|kokoro):/, '')) : (modelUsed || '')
                    composerRef.current?.loadFromParams({
                      prompt: selectedAsset.prompt || '',
                      model,
                      duration: p.duration ?? undefined,
                    })
                  } catch (err) { console.error('Recreate failed:', err) }
                  setSelectedAsset(null)
                }} className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5 text-accent-400 hover:text-accent-300">
                  <RotateCcw size={12} /> Recreate
                </button>
                <button onClick={handleSaveAs} disabled={saveState === 'saving'} className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5">
                  {saveState === 'done' ? <Check size={12} className="text-green-400" /> : saveState === 'saving' ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
                  {saveState === 'done' ? 'Saved' : 'Save as'}
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
        </div>
      )}
    </div>
  )
}
