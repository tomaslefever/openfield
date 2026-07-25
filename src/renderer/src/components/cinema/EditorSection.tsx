import { useState, useRef, useMemo } from 'react'
import { useCinemaStore } from '../../stores/cinema-store'
import { Play, Pause, Plus, Trash2, Scissors, Music, Wand2, ZoomIn, Download, Film } from 'lucide-react'

const COMMON_ACTIONS = [
  { label: 'Clip generado', icon: Wand2, desc: 'Agregar clip del storyboard' },
  { label: 'Efecto', icon: Scissors, desc: 'Transición o efecto' },
  { label: 'Música', icon: Music, desc: 'Pista de audio' },
]

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

export function EditorSection({ projectId }: { projectId: string }) {
  const clips = useCinemaStore(s => s.editorClips[projectId] || [])
  const storyboard = useCinemaStore(s => s.storyboard[projectId] || [])
  const addEditorClip = useCinemaStore(s => s.addEditorClip)
  const removeEditorClip = useCinemaStore(s => s.removeEditorClip)
  const [isPlaying, setIsPlaying] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const totalDuration = useMemo(() => {
    if (clips.length === 0) return 10
    return Math.max(10, clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0))
  }, [clips])

  const timelineWidth = zoom * totalDuration * 100

  const handleAddStoryboardClip = (sb: typeof storyboard[number]) => {
    addEditorClip(projectId, {
      label: `Toma ${sb.id.slice(-6)}`,
      src: sb.generatedVideoPath || sb.generatedImageBase64 || '',
      type: sb.generatedVideoPath ? 'video' : 'image',
      startTime: clips.length > 0 ? clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0) : 0,
      duration: 5,
      track: 0,
    })
    setShowQuickAdd(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-800">
        <div className="flex items-center gap-2">
          <Film size={16} className="text-accent-400" />
          <h2 className="text-sm font-semibold text-surface-100">Editor</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setShowQuickAdd(!showQuickAdd)} className="btn-primary text-xs flex items-center gap-1.5">
              <Plus size={12} /> Agregar
            </button>
            {showQuickAdd && (
              <div className="absolute bottom-full right-0 mb-1.5 bg-surface-800 border border-surface-700 rounded-xl py-1 min-w-[200px] shadow-xl z-50">
                {storyboard.filter(s => s.generatedImageBase64 || s.generatedVideoPath).length > 0 && (
                  <div className="px-3 py-1 text-[10px] text-surface-500 uppercase tracking-wider">Desde Storyboard</div>
                )}
                {storyboard.filter(s => s.generatedImageBase64 || s.generatedVideoPath).map(sb => (
                  <button key={sb.id} onClick={() => handleAddStoryboardClip(sb)} className="w-full text-left px-3 py-1.5 text-xs text-surface-300 hover:text-surface-100 hover:bg-surface-700/50 transition-colors flex items-center gap-2">
                    <Wand2 size={11} className="text-accent-400" />
                    {sb.description.slice(0, 30) || 'Shot'}...
                  </button>
                ))}
                <div className="px-3 py-1 text-[10px] text-surface-500 uppercase tracking-wider mt-1">Rápido</div>
                {COMMON_ACTIONS.map(a => (
                  <button key={a.label} onClick={() => {
                    addEditorClip(projectId, {
                      label: a.label,
                      src: '',
                      type: 'video' as const,
                      startTime: clips.length > 0 ? clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0) : 0,
                      duration: 3,
                      track: 0,
                    })
                    setShowQuickAdd(false)
                  }} className="w-full text-left px-3 py-1.5 text-xs text-surface-300 hover:text-surface-100 hover:bg-surface-700/50 transition-colors flex items-center gap-2">
                    <a.icon size={11} className="text-surface-500" />
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn-ghost text-xs flex items-center gap-1.5">
            <Download size={12} /> Exportar
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-black border-b border-surface-800 flex items-center justify-center aspect-video max-h-[40vh]">
        {clips.length === 0 ? (
          <div className="text-center text-surface-600">
            <Film size={48} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm mb-2">Línea de tiempo vacía</p>
            <p className="text-xs text-surface-700">Agrega clips desde el Storyboard o genera contenido rápido</p>
          </div>
        ) : (
          <video ref={videoRef} className="max-w-full max-h-full object-contain" controls preload="auto" playsInline />
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 bg-surface-950 border-t border-surface-800 overflow-hidden flex flex-col">
        <div className="flex items-center gap-1 px-4 py-1.5 border-b border-surface-800 bg-surface-900/50">
          {['V1', 'A1'].map(track => (
            <button key={track} className="px-3 py-1 rounded text-xs font-medium text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors">
              {track}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setZoom(Math.max(0.25, zoom - 0.25))} className="p-1 text-surface-500 hover:text-surface-100">
              <ZoomIn size={14} style={{ transform: 'scaleX(-1)' }} />
            </button>
            <span className="text-xs text-surface-500 w-8 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(Math.min(4, zoom + 0.25))} className="p-1 text-surface-500 hover:text-surface-100">
              <ZoomIn size={14} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-20 flex-shrink-0 border-r border-surface-800 bg-surface-900/30">
            {['V1', 'A1'].map(label => (
              <div key={label} className="h-16 flex items-center justify-center border-b border-surface-800 text-[10px] text-surface-500 font-medium">
                {label}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-x-auto">
            <div className="relative" style={{ minWidth: `${Math.max(800, timelineWidth)}px`, height: '100%' }}>
              {/* Time ruler */}
              <div className="absolute top-0 left-0 right-0 h-6 border-b border-surface-800 bg-surface-900/20 flex">
                {Array.from({ length: Math.ceil(totalDuration) }).map((_, i) => (
                  <div key={i} className="flex-shrink-0 border-r border-surface-800/50 flex items-center px-1.5" style={{ width: `${zoom * 100}px` }}>
                    <span className="text-[9px] text-surface-600">{i}s</span>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                {[0, 1].map(track => (
                  <div key={track} className="h-16 border-b border-surface-800/50 relative">
                    {clips.filter(c => c.track === track).map(clip => (
                      <div
                        key={clip.id}
                        className="absolute top-2 bottom-2 rounded-lg bg-accent-500/20 border border-accent-500/30 px-2 flex items-center gap-1.5 group cursor-pointer hover:bg-accent-500/30 transition-colors"
                        style={{
                          left: `${clip.startTime * zoom * 100}px`,
                          width: `${clip.duration * zoom * 100}px`,
                        }}
                      >
                        <span className="text-[10px] text-accent-300 truncate flex-1">{clip.label}</span>
                        <span className="text-[9px] text-accent-400/70">{clip.duration}s</span>
                        <button
                          onClick={() => removeEditorClip(projectId, clip.id)}
                          className="opacity-0 group-hover:opacity-100 text-surface-400 hover:text-red-400 transition-all"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transport controls */}
      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-surface-900 border-t border-surface-800">
        <button onClick={() => setIsPlaying(!isPlaying)} className="btn-ghost p-2">
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className="text-xs text-surface-400 font-mono">{formatTime(0)} / {formatTime(totalDuration)}</span>
      </div>
    </div>
  )
}
