import { memo, useEffect, useState } from 'react'
import { X, FolderKanban } from 'lucide-react'
import { srcUrl } from '../services/file-url'
import { useWorkspaceStore } from '../stores/workspace-store'

interface ImageLibraryPickerProps {
  onSelect: (asset: any) => void
  onClose: () => void
}

// Isolated component so the library fetch/render never re-renders the parent composer.
// Loads on mount and excludes internal ref/upload assets to avoid duplicate entries.
// Supports filtering by project (workspace).
export const ImageLibraryPicker = memo(function ImageLibraryPicker({ onSelect, onClose }: ImageLibraryPickerProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeId)
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [workspaceFilter, setWorkspaceFilter] = useState<string>(() => activeWorkspaceId || 'all')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const api = (window as any).electronAPI
        const list = await api?.assets.list({
          type: 'image',
          limit: 60,
          excludeUploads: true,
          workspaceId: workspaceFilter === 'all' ? 'all' : (workspaceFilter || undefined),
        })
        if (!cancelled) setAssets(list?.assets || [])
      } catch {
        if (!cancelled) setAssets([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [workspaceFilter])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800 gap-3">
          <h3 className="text-sm font-semibold text-surface-100 flex-shrink-0">Image Library</h3>
          <div className="relative flex items-center gap-2 flex-1 min-w-0">
            <FolderKanban size={13} className="text-surface-500 flex-shrink-0" />
            <select
              value={workspaceFilter}
              onChange={(e) => setWorkspaceFilter(e.target.value)}
              className="input-field text-xs flex-1 min-w-0"
            >
              <option value="all">All projects</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-200 flex-shrink-0"><X size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-xs text-surface-500">Loading...</div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                {assets.map((asset: any) => (
                  <button key={asset.id} onClick={() => onSelect(asset)} className="aspect-square bg-surface-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-accent-500 transition-all">
                    <img
                      src={srcUrl(asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : ''))}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                ))}
              </div>
              {assets.length === 0 && (
                <p className="text-xs text-surface-500 text-center py-8">No images in library</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
})
