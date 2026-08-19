import { useState, useRef, useCallback, useEffect } from 'react'
import { Play, Pause, Scissors, Crop, ZoomIn, Volume2, Film, Plus, Download } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkspaceStore } from '../stores/workspace-store'

export function EditorPage() {
  const queryClient = useQueryClient()
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [zoom, setZoom] = useState(1)
  const videoRef = useRef<HTMLVideoElement>(null)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeId)

  const { data: projects } = useQuery({
    queryKey: ['projects', activeWorkspaceId],
    queryFn: () => (window as any).electronAPI?.projects.list() ?? [],
  })

  const createProject = useMutation({
    mutationFn: (name: string) => (window as any).electronAPI?.projects.create(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })

  const timelineWidth = (zoom * 10000)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-surface-800">
        <h1 className="text-lg font-semibold text-surface-100">Video Editor</h1>
        <div className="flex items-center gap-2">
          <button className="btn-ghost flex items-center gap-1.5"><Plus size={14} /> New Project</button>
          <button className="btn-primary flex items-center gap-1.5"><Download size={14} /> Export</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex-1 bg-surface-950 flex items-center justify-center border-b border-surface-800">
          <div className="bg-surface-900 rounded-xl overflow-hidden w-full max-w-4xl aspect-video mx-6 flex items-center justify-center">
            <div className="text-center text-surface-600">
              <Film size={48} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm mb-2">No timeline content</p>
              <p className="text-xs text-surface-700">Generate or import assets to begin editing</p>
            </div>
          </div>
        </div>

        <div className="h-64 bg-surface-950 border-t border-surface-800">
          <div className="flex items-center gap-1 px-4 py-2 border-b border-surface-800 bg-surface-900/50">
            {['Video', 'Audio', 'Subtitles'].map((track) => (
              <button key={track} className="px-3 py-1 rounded text-xs font-medium text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors">{track}</button>
            ))}
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} className="p-1 text-surface-500 hover:text-surface-100"><ZoomIn size={14} /></button>
              <span className="text-xs text-surface-500 w-8 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(Math.min(4, zoom + 0.25))} className="p-1 text-surface-500 hover:text-surface-100"><ZoomIn size={14} /></button>
            </div>
          </div>

          <div className="flex h-[calc(100%-36px)]">
            <div className="w-24 flex-shrink-0 border-r border-surface-800 bg-surface-900/30">
              {['V1', 'A1', 'S1'].map((label, i) => (
                <div key={label} className="h-16 flex items-center justify-center border-b border-surface-800 text-xs text-surface-500 font-medium">{label}</div>
              ))}
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-hidden" style={{ width: timelineWidth }}>
              <div className="relative h-full" style={{ minWidth: timelineWidth }}>
                <div className="absolute top-0 left-0 right-0 h-8 border-b border-surface-800 bg-surface-900/20 flex">
                  {Array.from({ length: Math.ceil(timelineWidth / 100) }).map((_, i) => (
                    <div key={i} className="flex-shrink-0 w-[100px] border-r border-surface-800/50 flex items-center justify-start px-2">
                      <span className="text-[10px] text-surface-600">{formatTime(i * 5)}</span>
                    </div>
                  ))}
                </div>

                <div className="absolute top-0 bottom-0 w-px bg-accent-500 z-10 pointer-events-none" style={{ left: `${(currentTime / 5) * 100}px` }} />

                <div className="mt-8">
                  {[1, 2, 3].map((track) => (
                    <div key={track} className="h-16 border-b border-surface-800/50 relative">
                      <div className="absolute inset-0 flex items-center px-2">
                        <div className="w-full text-center">
                          <p className="text-xs text-surface-700">Drop clips here</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="absolute left-0 bottom-0 right-0 h-8 border-t border-surface-800 bg-surface-900/20" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-surface-900 border-t border-surface-800">
        <button onClick={() => setIsPlaying(!isPlaying)} className="btn-ghost p-2">
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className="text-xs text-surface-400 font-mono">{formatTime(currentTime)}</span>
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}
