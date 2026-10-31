/**
 * asset:// protocol: serves library files to the renderer. Grid thumbnails and video posters
 * come from services/thumbnails (rendered once, off the main thread, cached on disk); media is
 * streamed from disk with Range support; full-resolution images sit in a byte-bounded LRU.
 */
import { protocol } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import { getThumbnail, isThumbImage, isThumbVideo } from './thumbnails'

export function registerAssetProtocol() {
  // Full-resolution reads served over asset:// (modal previews, 1.0 render scale) stay in a
  // byte-bounded LRU; grid thumbnails and video posters live in services/thumbnails.
  const assetCache = new Map<string, { size: number; mtimeMs: number; buffer: Buffer }>()
  const ASSET_CACHE_BYTES = 128 * 1024 * 1024
  let assetCacheBytes = 0
  const cacheAsset = (key: string, entry: { size: number; mtimeMs: number; buffer: Buffer }) => {
    const prev = assetCache.get(key)
    if (prev) { assetCacheBytes -= prev.buffer.length; assetCache.delete(key) }
    assetCache.set(key, entry)
    assetCacheBytes += entry.buffer.length
    while (assetCacheBytes > ASSET_CACHE_BYTES && assetCache.size > 0) {
      const oldest = assetCache.keys().next().value as string
      assetCacheBytes -= assetCache.get(oldest)!.buffer.length
      assetCache.delete(oldest)
    }
  }
  const MIME_TYPES: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif',
    '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
    '.opus': 'audio/opus',
  }
  const MEDIA_EXTS = new Set(['.mp4', '.webm', '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.opus'])
  // Media is streamed from disk (never read whole into memory, never synchronously)
  const streamBody = (filePath: string, range?: { start: number; end: number }) =>
    Readable.toWeb(fs.createReadStream(filePath, range)) as unknown as BodyInit

  protocol.handle('asset', async (request) => {
    const decodedUrl = decodeURI(request.url)
    const filePath = decodedUrl.replace(/^asset:\/\/localhost\//, '').replace(/[?#].*$/, '').replace(/\/+$/, '')

    let isThumb = false
    let scale = 0.25
    try {
      const urlObj = new URL(request.url)
      isThumb = urlObj.searchParams.get('thumb') === '1'
      const s = parseFloat(urlObj.searchParams.get('scale') || '0.25')
      if (!isNaN(s)) scale = Math.min(1, Math.max(0.1, s))
    } catch {}

    try {
      const stat = await fs.promises.stat(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mime = MIME_TYPES[ext] || 'application/octet-stream'
      const isMedia = MEDIA_EXTS.has(ext)
      const isVideo = isThumbVideo(ext)

      // Grid: images come back downscaled by the render scale, videos as a poster frame (the
      // <video> element is only mounted on hover). Both are rendered once and cached.
      if (isThumb && (isVideo || (isThumbImage(ext) && scale < 1))) {
        const thumb = await getThumbnail(filePath, stat, scale, isVideo ? 'video' : 'image')
        if (thumb) {
          return new Response(thumb as unknown as BodyInit, {
            headers: {
              'Content-Type': 'image/jpeg',
              'Content-Length': String(thumb.length),
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }
        // A video that cannot be rendered never falls back to the whole file for an <img>
        if (isVideo) return new Response(null, { status: 404 })
      }

      const rangeHeader = request.headers.get('Range') || request.headers.get('range')
      if (rangeHeader && isMedia) {
        const fileSize = stat.size
        const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
        let start = m && m[1] ? parseInt(m[1], 10) : 0
        let end = m && m[2] ? parseInt(m[2], 10) : fileSize - 1
        if (m && !m[1] && m[2]) { start = Math.max(0, fileSize - parseInt(m[2], 10)); end = fileSize - 1 }
        end = Math.min(end, fileSize - 1)
        if (!Number.isFinite(start) || start < 0 || start > end || fileSize === 0) {
          return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } })
        }
        return new Response(streamBody(filePath, { start, end }), {
          status: 206,
          headers: {
            'Content-Type': mime,
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': String(end - start + 1),
            'Accept-Ranges': 'bytes',
            // CORS so the Timeline can key video frames in WebGL (crossOrigin media)
            'Access-Control-Allow-Origin': '*',
          },
        })
      }

      if (isMedia) {
        return new Response(streamBody(filePath), {
          headers: { 'Content-Type': mime, 'Content-Length': String(stat.size), 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' },
        })
      }

      const cached = assetCache.get(filePath)
      let data: Buffer
      if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
        data = cached.buffer
        cacheAsset(filePath, cached)
      } else {
        data = await fs.promises.readFile(filePath)
        cacheAsset(filePath, { size: stat.size, mtimeMs: stat.mtimeMs, buffer: data })
      }
      return new Response(data as unknown as BodyInit, {
        // CORS so the renderer can fetch() full-res images (e.g. copy to clipboard), not just <img> them
        headers: { 'Content-Type': mime, 'Content-Length': String(stat.size), 'Access-Control-Allow-Origin': '*' },
      })
    } catch (err: any) {
      console.error('[asset] 404:', filePath, err.message)
      return new Response(null, { status: 404 })
    }
  })
}
