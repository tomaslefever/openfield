import { useCallback, useEffect, useRef, useState } from 'react'

export interface PagedAssetsOptions {
  type?: 'image' | 'video' | 'audio'
  search?: string
  isFavorite?: boolean
  pageSize?: number
  excludeUploads?: boolean
}

// Paginated + lazily loaded asset list. Attach `sentinelRef` to a div rendered after
// the grid; a new page (pageSize items) is fetched when it becomes visible.
export function usePagedAssets({ type, search, isFavorite, pageSize = 20, excludeUploads = false }: PagedAssetsOptions) {
  const [assets, setAssets] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const busyRef = useRef(false)
  const pageRef = useRef(0)
  const reqRef = useRef(0)

  const fetchPage = useCallback(async (pageNum: number, append: boolean) => {
    if (busyRef.current) return
    const reqId = ++reqRef.current
    busyRef.current = true
    if (append) setLoadingMore(true)
    else setInitialLoading(true)
    try {
      const api = (window as any).electronAPI
      const res = await api?.assets.list({
        type,
        search: search || undefined,
        ...(isFavorite ? { isFavorite: true } : {}),
        limit: pageSize,
        offset: pageNum * pageSize,
        excludeUploads,
      })
      if (reqRef.current !== reqId) return
      const items = Array.isArray(res?.assets) ? res.assets : []
      const count = res?.total || 0
      setAssets(prev => append ? [...prev, ...items] : items)
      setTotal(count)
      setHasMore((pageNum + 1) * pageSize < count)
    } catch (err) {
      console.error('[usePagedAssets] Failed to load assets:', err)
      if (reqRef.current !== reqId) return
      if (!append) setHasMore(false)
    } finally {
      if (reqRef.current === reqId) {
        busyRef.current = false
        if (append) setLoadingMore(false)
        else setInitialLoading(false)
      }
    }
  }, [type, search, isFavorite, pageSize, excludeUploads])

  const reset = useCallback(() => {
    reqRef.current++
    busyRef.current = false
    pageRef.current = 0
    setAssets([])
    setTotal(0)
    setHasMore(true)
    fetchPage(0, false)
  }, [fetchPage])

  const loadMore = useCallback(() => {
    if (busyRef.current) return
    const next = pageRef.current + 1
    pageRef.current = next
    fetchPage(next, true)
  }, [fetchPage])

  // Patch a single asset in place without refetching the list. When the favorites
  // filter is active and the asset stops being a favorite, it is removed instead.
  const updateAsset = useCallback((updated: any) => {
    if (!updated?.id) return
    if (isFavorite && !updated.isFavorite) setTotal(t => Math.max(0, t - 1))
    setAssets(prev => {
      const idx = prev.findIndex(a => a.id === updated.id)
      if (idx < 0) return prev
      const next = prev.slice()
      if (isFavorite && !updated.isFavorite) next.splice(idx, 1)
      else next[idx] = updated
      return next
    })
  }, [isFavorite])

  useEffect(() => {
    reset()
  }, [reset])

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

  return { assets, total, hasMore, initialLoading, loadingMore, sentinelRef, reset, loadMore, updateAsset }
}
