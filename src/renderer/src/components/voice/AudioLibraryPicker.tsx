import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Loader, X, Search, AudioLines, Download } from 'lucide-react'
import { usePagedAssets } from '../../hooks/usePagedAssets'
import { srcUrl } from '../../services/file-url'

interface AudioLibraryPickerProps {
  onClose: () => void
  onSelect: (audio: { base64: string; mime: string; fileName: string; duration?: number }) => void
}

function modelLabel(model: string | undefined): string {
  if (!model) return '—'
  if (model.startsWith('piper:')) return `Piper · ${model.slice(6)}`
  if (model.startsWith('kokoro:')) return `Kokoro · ${model.slice(7)}`
  if (model.startsWith('elevenlabs:vc:')) return `ElevenLabs VC · ${model.slice(13)}`
  if (model.startsWith('elevenlabs:')) return `ElevenLabs · ${model.slice(11)}`
  const names: Record<string, string> = {
    'gpt-tts-1': 'GPT TTS',
    'minimax-text-to-speech': 'MiniMax TTS',
    'openaudio-text-to-music': 'OpenAudio Music',
    'mucat-text-to-music': 'MuCat Music',
    'elevenlabs:sfx': 'ElevenLabs SFX',
    upload: 'Upload',
  }
  return names[model] || model
}

export function AudioLibraryPicker({ onClose, onSelect }: AudioLibraryPickerProps) {
  const [search, setSearch] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [usingId, setUsingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map())

  const { assets, initialLoading, loadingMore, sentinelRef, reset } = usePagedAssets({ type: 'audio', search, pageSize: 20 })

  useEffect(() => { reset() }, [search, reset])

  const togglePlay = (asset: any) => {
    const el = audioRefs.current.get(asset.id)
    if (!el) return
    if (playingId === asset.id) {
      el.pause()
      setPlayingId(null)
      return
    }
    audioRefs.current.forEach((a, id) => { if (id !== asset.id) a.pause() })
    el.play().then(() => setPlayingId(asset.id)).catch(() => {})
  }

  const handleUse = async (asset: any) => {
    setUsingId(asset.id)
    setError('')
    try {
      const res = await (window as any).electronAPI?.assets.readBase64([asset.id])
      const entry = Array.isArray(res) ? res.find((r: any) => r.id === asset.id) : null
      if (!entry?.base64) throw new Error('No se pudo leer el audio')
      onSelect({
        base64: entry.base64,
        mime: entry.mime || 'audio/mpeg',
        fileName: asset.fileName || asset.file_path?.split(/[\\/]/).pop() || `audio-${asset.id}.mp3`,
        duration: asset.duration ?? undefined,
      })
    } catch (err: any) {
      setError(err?.message || 'No se pudo cargar el audio de la librería')
      setUsingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="bg-surface-950 border border-surface-800 rounded-2xl w-[560px] max-w-[94vw] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-800">
          <AudioLines size={15} className="text-accent-400" />
          <p className="text-sm font-semibold text-surface-100 flex-1">Insert audio from library</p>
          <div className="relative w-52">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search audio..."
              className="input-field pl-7 text-xs w-full"
            />
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-surface-500 hover:text-white hover:bg-surface-800 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-2">
          {initialLoading && assets.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-14 text-surface-500">
              <Loader size={16} className="animate-spin text-accent-400" /> Loading...
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-surface-600">
              <AudioLines size={26} className="opacity-40" />
              <p className="text-xs">No audio assets found. Generate or import some audio first.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {assets.map((asset: any) => {
                const src = asset.localPath || asset.filePath
                const isPlaying = playingId === asset.id
                return (
                  <div key={asset.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-800/50 transition-colors">
                    <button
                      onClick={() => togglePlay(asset)}
                      className="w-8 h-8 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center flex-shrink-0 hover:bg-accent-500/20 hover:border-accent-500/30 transition-colors"
                    >
                      {isPlaying ? <Pause size={12} className="text-accent-400" /> : <Play size={12} className="text-surface-300 ml-0.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-surface-200 truncate">{asset.prompt || asset.fileName || asset.file_path?.split(/[\\/]/).pop() || '—'}</p>
                      <p className="text-[10px] text-surface-500">{modelLabel(asset.modelUsed)}{asset.fileSize ? ` · ${(asset.fileSize / 1024).toFixed(0)} KB` : ''}</p>
                    </div>
                    <button
                      onClick={() => handleUse(asset)}
                      disabled={usingId === asset.id}
                      className="px-2.5 py-1 rounded-lg bg-accent-600/90 hover:bg-accent-500 text-white text-[10px] font-medium transition-colors flex items-center gap-1 flex-shrink-0 disabled:opacity-60"
                    >
                      {usingId === asset.id ? <Loader size={10} className="animate-spin" /> : <Download size={10} />}
                      Use
                    </button>
                    {src && (
                      <audio
                        ref={(el) => { if (el) audioRefs.current.set(asset.id, el); else audioRefs.current.delete(asset.id) }}
                        src={srcUrl(src)}
                        className="hidden"
                        onEnded={() => setPlayingId(null)}
                        onPause={() => setPlayingId(null)}
                      />
                    )}
                  </div>
                )
              })}
              {loadingMore && (
                <div className="flex items-center justify-center py-3 text-surface-500">
                  <Loader size={14} className="animate-spin" />
                </div>
              )}
              <div ref={sentinelRef} className="h-1" />
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-2 border-t border-surface-800">
            <p className="text-[11px] text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
