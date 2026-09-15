import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, FolderKanban, Video, Music, Check, Search, Image as ImageIcon, Star } from 'lucide-react'
import { srcUrl, thumbUrl } from '../services/file-url'
import { useWorkspaceStore } from '../stores/workspace-store'

interface ImageLibraryPickerProps {
  onSelect: (asset: any | any[]) => void
  onClose: () => void
  allowVideo?: boolean
  allowAudio?: boolean
  multiple?: boolean
}

const PAGE_SIZE = 10

// Isolated component so the library fetch/render never re-renders the parent composer.
// Loads on mount and excludes internal ref/upload assets to avoid duplicate entries.
// Supports filtering by project (workspace), type (image/video), favorites, and prompt search term.
// Supports multi-select by default with a floating insertion button.
export const ImageLibraryPicker = memo(function ImageLibraryPicker({
  onSelect,
  onClose,
  allowVideo = true,
  allowAudio = false,
  multiple = true
}: ImageLibraryPickerProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeId)
  const [assets, setAssets] = useState<any[]>([])
  const [selectedMap, setSelectedMap] = useState<Map<string, any>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [workspaceFilter, setWorkspaceFilter] = useState<string>(() => activeWorkspaceId || 'all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video' | 'audio'>('all')
  const [onlyFavorites, setOnlyFavorites] = useState(false)

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const busyRef = useRef(false)
  const pageRef = useRef(0)
  const reqRef = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchPage = useCallback(async (pageNum: number, append: boolean) => {
    if (busyRef.current) return
    const reqId = ++reqRef.current
    busyRef.current = true
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const api = (window as any).electronAPI
      const types: string[] = []
      if (typeFilter === 'all') {
        types.push('image')
        if (allowVideo) types.push('video')
        if (allowAudio) types.push('audio')
      } else if (typeFilter === 'image') {
        types.push('image')
      } else if (typeFilter === 'video') {
        types.push('video')
      } else if (typeFilter === 'audio') {
        types.push('audio')
      }

      const list = await api?.assets.list({
        types,
        limit: PAGE_SIZE,
        offset: pageNum * PAGE_SIZE,
        excludeUploads: true,
        workspaceId: workspaceFilter === 'all' ? 'all' : (workspaceFilter || undefined),
        search: debouncedSearch.trim() || undefined,
        isFavorite: onlyFavorites ? true : undefined,
      })
      if (reqRef.current !== reqId) return
      const items = Array.isArray(list?.assets) ? list.assets : []
      const count = list?.total || 0
      setAssets(prev => append ? [...prev, ...items] : items)
      setHasMore((pageNum + 1) * PAGE_SIZE < count)
    } catch {
      if (reqRef.current !== reqId) return
      if (!append) setHasMore(false)
    } finally {
      if (reqRef.current === reqId) {
        busyRef.current = false
        if (append) setLoadingMore(false)
        else setLoading(false)
      }
    }
  }, [workspaceFilter, typeFilter, debouncedSearch, onlyFavorites, allowVideo, allowAudio])

  useEffect(() => {
    reqRef.current++
    busyRef.current = false
    pageRef.current = 0
    setAssets([])
    setHasMore(false)
    fetchPage(0, false)
  }, [fetchPage])

  const loadMore = useCallback(() => {
    if (busyRef.current) return
    const next = pageRef.current + 1
    pageRef.current = next
    fetchPage(next, true)
  }, [fetchPage])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some(e => e.isIntersecting)) loadMore()
      },
      { rootMargin: '600px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore, hasMore, assets.length])

  const handleItemClick = (asset: any) => {
    if (!multiple) {
      onSelect(asset)
      onClose()
      return
    }
    setSelectedMap(prev => {
      const next = new Map(prev)
      if (next.has(asset.id)) {
        next.delete(asset.id)
      } else {
        next.set(asset.id, asset)
      }
      return next
    })
  }

  const handleItemDoubleClick = (asset: any) => {
    if (multiple) {
      onSelect([asset])
    } else {
      onSelect(asset)
    }
    onClose()
  }

  const handleConfirmInsert = () => {
    const selectedList = Array.from(selectedMap.values())
    if (selectedList.length === 0) return
    onSelect(selectedList)
    onClose()
  }

  const isMedia = allowVideo || allowAudio
  const selectedCount = selectedMap.size

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden relative shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Top Header Row */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800 gap-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <h3 className="text-sm font-semibold text-surface-100">{isMedia ? 'Library' : 'Image Library'}</h3>
            {multiple && selectedCount > 0 && (
              <button
                onClick={() => setSelectedMap(new Map())}
                className="text-[11px] text-surface-400 hover:text-surface-200 ml-1 px-1.5 py-0.5 rounded bg-surface-800 hover:bg-surface-700 transition-colors"
              >
                Limpiar ({selectedCount})
              </button>
            )}
          </div>
          <div className="relative flex items-center gap-2 flex-1 min-w-0 max-w-xs ml-auto">
            <FolderKanban size={13} className="text-surface-500 flex-shrink-0" />
            <select
              value={workspaceFilter}
              onChange={(e) => setWorkspaceFilter(e.target.value)}
              className="input-field text-xs flex-1 min-w-0 py-1"
            >
              <option value="all">Todos los proyectos</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-200 flex-shrink-0 p-1 rounded-lg hover:bg-surface-800 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-950/40 border-b border-surface-800/60">
          {/* Prompt term search */}
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en prompts..."
              className="input-field pl-8 pr-7 text-xs w-full py-1.5 bg-surface-800/80 border-surface-700/60 placeholder:text-surface-500 focus:border-accent-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 p-0.5"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Favorite Toggle Button */}
          <button
            type="button"
            onClick={() => setOnlyFavorites(prev => !prev)}
            title={onlyFavorites ? 'Mostrar todos los assets' : 'Filtrar solo favoritos'}
            className={`p-1.5 rounded-lg border transition-all flex-shrink-0 flex items-center justify-center ${
              onlyFavorites
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-sm'
                : 'border-surface-700/60 bg-surface-800/80 text-surface-400 hover:text-amber-400 hover:border-amber-500/30'
            }`}
          >
            <Star size={14} fill={onlyFavorites ? 'currentColor' : 'none'} />
          </button>

          {/* Type toggles (Image / Video / All) */}
          {allowVideo && (
            <div className="flex items-center gap-0.5 bg-surface-800/80 p-0.5 rounded-lg border border-surface-700/60 flex-shrink-0">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  typeFilter === 'all'
                    ? 'bg-surface-700 text-surface-100 shadow-sm'
                    : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/40'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('image')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  typeFilter === 'image'
                    ? 'bg-surface-700 text-surface-100 shadow-sm'
                    : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/40'
                }`}
              >
                <ImageIcon size={12} />
                <span>Imágenes</span>
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('video')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  typeFilter === 'video'
                    ? 'bg-surface-700 text-surface-100 shadow-sm'
                    : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/40'
                }`}
              >
                <Video size={12} />
                <span>Videos</span>
              </button>
              {allowAudio && (
                <button
                  type="button"
                  onClick={() => setTypeFilter('audio')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    typeFilter === 'audio'
                      ? 'bg-surface-700 text-surface-100 shadow-sm'
                      : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/40'
                  }`}
                >
                  <Music size={12} />
                  <span>Audio</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Assets Grid */}
        <div className={`flex-1 overflow-y-auto p-4 ${multiple && selectedCount > 0 ? 'pb-20' : ''}`}>
          {loading && assets.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-xs text-surface-500">Loading...</div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                {assets.map((asset: any) => {
                  const isVideo = asset.type === 'video' || asset.mimeType?.startsWith('video/')
                  const isAudio = asset.type === 'audio' || asset.mimeType?.startsWith('audio/')
                  const rawPath = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : '')
                  const src = isVideo || isAudio ? srcUrl(rawPath) : thumbUrl(rawPath)
                  const isSelected = selectedMap.has(asset.id)

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      title={asset.prompt || asset.fileName || asset.file_name || ''}
                      onClick={() => handleItemClick(asset)}
                      onDoubleClick={() => handleItemDoubleClick(asset)}
                      className={`aspect-square bg-surface-800 rounded-lg overflow-hidden transition-all relative group cursor-pointer ${
                        isSelected
                          ? 'ring-2 ring-accent-500 bg-accent-500/10 scale-[0.98]'
                          : 'hover:ring-2 hover:ring-surface-600'
                      }`}
                    >
                      {isVideo ? (
                        <>
                          <video src={src} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                          <span className="absolute bottom-1 left-1 bg-black/60 rounded p-0.5 flex items-center gap-0.5">
                            <Video size={10} className="text-white" />
                          </span>
                        </>
                      ) : isAudio ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music size={20} className="text-surface-500" />
                        </div>
                      ) : (
                        <img
                          src={src}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      )}

                      {/* Selection indicator badge */}
                      {multiple && (
                        <div
                          className={`absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-accent-500 text-white shadow-md scale-100'
                              : 'bg-black/60 text-transparent border border-white/40 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'
                          }`}
                        >
                          <Check size={11} className="stroke-[3]" />
                        </div>
                      )}

                      {/* Selection overlay */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-accent-500/15 pointer-events-none" />
                      )}
                    </button>
                  )
                })}
              </div>
              {hasMore && (
                <div ref={sentinelRef} className="flex items-center justify-center py-4">
                  {loadingMore && <span className="text-[10px] text-surface-500 animate-pulse">Loading more...</span>}
                </div>
              )}
              {assets.length === 0 && !loading && (
                <p className="text-xs text-surface-500 text-center py-8">
                  {debouncedSearch
                    ? 'No se encontraron resultados para la búsqueda'
                    : onlyFavorites
                    ? 'No tienes assets marcados como favoritos'
                    : 'No assets in library'}
                </p>
              )}
            </>
          )}
        </div>

        {/* Floating action button for multi-insert */}
        {multiple && selectedCount > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
            <button
              onClick={handleConfirmInsert}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent-600 hover:bg-accent-500 text-white font-medium text-xs shadow-2xl shadow-accent-950/60 border border-accent-400/30 transition-all transform hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
            >
              <Check size={14} className="stroke-[2.5]" />
              <span>
                {selectedCount === 1 ? 'Insertar 1 referencia' : `Insertar ${selectedCount} referencias`}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent
})

