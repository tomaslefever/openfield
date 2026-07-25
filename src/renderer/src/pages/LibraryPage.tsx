import { useState, useCallback, useEffect, useRef } from 'react'
import { Search, Filter, Download, Trash2, Heart, Grid3X3, List, Eye, Cloud } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { fileUrl } from '../services/file-url'

export function LibraryPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video' | 'audio'>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedAsset, setSelectedAsset] = useState<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 })
  const zoomRef = useRef(1)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const { data, refetch } = useQuery({
    queryKey: ['assets', 'list', { search, type: typeFilter }],
    queryFn: () => (window as any).electronAPI?.assets.list({ search: search || undefined, type: typeFilter === 'all' ? undefined : typeFilter, limit: 100 }) ?? { assets: [], total: 0 },
  })

  const handleDelete = useCallback(async (id: string) => {
    await (window as any).electronAPI?.assets.delete(id)
    refetch()
  }, [refetch])

  const handleToggleFavorite = useCallback(async (id: string) => {
    await (window as any).electronAPI?.assets.toggleFavorite(id)
    refetch()
  }, [refetch])

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
        return clampPan(relX * (1 - scale) + prevPan.x * scale, relY * (1 - scale) + prevPan.y * scale, newZoom)
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
    setPan(prev => clampPan(prev.x + dx, prev.y + dy, zoomRef.current))
  }, [])

  const handleMouseUp = useCallback(() => {
    dragRef.current.active = false
    setIsDragging(false)
  }, [])

  const assets = data?.assets ?? []

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [selectedAsset?.id])

  useEffect(() => { zoomRef.current = zoom }, [zoom])

  const clampPan = (px: number, py: number, z: number) => {
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-lg font-semibold text-surface-100">Library</h1>
            <div className="flex items-center gap-2">
              <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'text-accent-400 bg-accent-500/10' : 'text-surface-500 hover:text-surface-100'}`}>
                <Grid3X3 size={16} />
              </button>
              <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'text-accent-400 bg-accent-500/10' : 'text-surface-500 hover:text-surface-100'}`}>
                <List size={16} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by prompt, model, or filename..."
                className="input-field pl-9"
              />
            </div>
            <div className="flex gap-1 bg-surface-900 rounded-lg p-1 border border-surface-800">
              {(['all', 'image', 'video', 'audio'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${typeFilter === t ? 'bg-surface-800 text-surface-100' : 'text-surface-500 hover:text-surface-100'}`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {assets.map((asset: any) => (
                <div key={asset.id} className="card group relative overflow-hidden p-0 cursor-pointer" onClick={() => setSelectedAsset(asset)}>
                  <div className={`bg-surface-800 flex items-center justify-center overflow-hidden ${asset.type === 'video' ? 'aspect-video' : 'aspect-square'}`}>
                    {(() => {
                    const src = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : null)
                    if (src) return asset.type === 'video'
                      ? <video src={fileUrl(src)} className="w-full h-full object-cover" preload="metadata" muted />
                      : <img src={fileUrl(src)} alt="" className="w-full h-full object-cover" />
                    return <div className="text-surface-600 text-xs">{asset.type}</div>
                  })()}
                  </div>
                  {!asset.localPath && asset.filePath?.startsWith('http') && (
                    <div className="absolute top-2 right-2 bg-black/60 rounded-md p-1 z-10">
                      <Cloud size={12} className="text-blue-400" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); handleToggleFavorite(asset.id) }} className={`p-1.5 rounded-lg ${asset.isFavorite ? 'text-red-400 bg-red-500/10' : 'bg-black/50 text-white hover:text-red-400'} transition-colors`}>
                      <Heart size={12} fill={asset.isFavorite ? 'currentColor' : 'none'} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(asset.id) }} className="p-1.5 rounded-lg bg-black/50 text-white hover:text-red-400 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-xs text-surface-400 truncate">{asset.prompt || asset.fileName}</p>
                    <p className="text-[10px] text-surface-600 mt-0.5">{asset.modelUsed} · {new Date(asset.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-800 text-left text-xs text-surface-500 uppercase tracking-wider">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 font-medium">Prompt</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {assets.map((asset: any) => (
                    <tr key={asset.id} className="hover:bg-surface-800/50 transition-colors cursor-pointer text-sm" onClick={() => setSelectedAsset(asset)}>
                      <td className="px-4 py-3 text-surface-100">{asset.fileName}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${asset.type === 'image' ? 'bg-blue-500/10 text-blue-400' : asset.type === 'video' ? 'bg-purple-500/10 text-purple-400' : 'bg-green-500/10 text-green-400'}`}>{asset.type}</span></td>
                      <td className="px-4 py-3 text-surface-400">{asset.modelUsed}</td>
                      <td className="px-4 py-3 text-surface-400 max-w-[200px] truncate">{asset.prompt || '-'}</td>
                      <td className="px-4 py-3 text-surface-500">{new Date(asset.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); handleToggleFavorite(asset.id) }} className="p-1 hover:text-red-400 transition-colors"><Heart size={14} fill={asset.isFavorite ? 'currentColor' : 'none'} /></button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(asset.id) }} className="p-1 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {assets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-surface-600">
              <Eye size={48} className="mb-4 opacity-50" />
              <p className="text-sm">No assets found. Generate images/videos or import files.</p>
            </div>
          )}
        </div>
      </div>

      {selectedAsset && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setSelectedAsset(null)}>
          <div className="bg-surface-900 border border-surface-800 rounded-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-lg font-semibold text-surface-100">Asset Details</h2>
                <button onClick={() => setSelectedAsset(null)} className="text-surface-500 hover:text-surface-100">&times;</button>
              </div>
              <div
                ref={containerRef}
                className="bg-surface-800 rounded-xl overflow-hidden mb-4 flex items-center justify-center min-h-[300px] relative"
                onWheel={selectedAsset.type === 'image' ? handleWheel : undefined}
                onMouseDown={selectedAsset.type === 'image' ? handleMouseDown : undefined}
                onMouseMove={selectedAsset.type === 'image' ? handleMouseMove : undefined}
                onMouseUp={selectedAsset.type === 'image' ? handleMouseUp : undefined}
                onMouseLeave={selectedAsset.type === 'image' ? handleMouseUp : undefined}
              >
                {(selectedAsset.localPath || (selectedAsset.filePath && !selectedAsset.filePath.startsWith('__error__'))) ? (
                  selectedAsset.type === 'video' ? (
                    <video src={fileUrl(selectedAsset.localPath || selectedAsset.filePath)} className="max-w-full max-h-[500px]" controls />
                  ) : (
                    <img
                      ref={imgRef}
                      src={fileUrl(selectedAsset.localPath || selectedAsset.filePath)}
                      alt=""
                      className="max-w-full max-h-[500px] object-contain select-none"
                      draggable={false}
                      style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: 'center center',
                        cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                      }}
                    />
                  )
                ) : (
                  <div className="text-surface-600 py-20">No preview available</div>
                )}
                {zoom > 1 && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5 z-10">
                    <span className="text-white/80 text-xs font-medium">{Math.round(zoom * 100)}%</span>
                    <button
                      onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
                      className="text-white/60 hover:text-white text-xs"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  ['Prompt', selectedAsset.prompt],
                  ['Model', selectedAsset.modelUsed],
                  ['Type', selectedAsset.type],
                  ['Dimensions', selectedAsset.width && selectedAsset.height ? `${selectedAsset.width}x${selectedAsset.height}` : '-'],
                  ['Duration', selectedAsset.duration ? `${selectedAsset.duration}s` : '-'],
                  ['File Size', selectedAsset.fileSize ? `${(selectedAsset.fileSize / 1024 / 1024).toFixed(2)} MB` : '-'],
                  ['Created', selectedAsset.createdAt ? new Date(selectedAsset.createdAt).toLocaleString() : '-'],
                  ['Seed', selectedAsset.parameters?.seed ?? '-'],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="text-surface-500 text-xs">{label}</p>
                    <p className="text-surface-100">{value || '-'}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-6 pt-4 border-t border-surface-800">
                <button onClick={async () => {
                    const api = (window as any).electronAPI
                    try {
                      const updated = await api.assets.downloadToLocal(selectedAsset.id)
                      refetch()
                      if (updated) setSelectedAsset(updated)
                    } catch (err) { console.error('Download failed:', err) }
                  }} className="btn-primary flex items-center gap-2"><Download size={14} /> Download</button>
                <button className="btn-ghost">Re-use Prompt</button>
                <button onClick={() => handleDelete(selectedAsset.id)} className="btn-danger flex items-center gap-2 ml-auto"><Trash2 size={14} /> Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
