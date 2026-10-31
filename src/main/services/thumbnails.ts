/**
 * Grid thumbnails for asset://: images downscaled by the render scale chosen in Settings (never
 * below a minimum short side, so small generations stay sharp) and poster frames for videos.
 * Nothing here blocks the main thread's hot path: images go through
 * the OS thumbnailer (nativeImage.createThumbnailFromPath runs on a worker thread) or an
 * ffmpeg child process, videos always through ffmpeg, and every result is cached on disk
 * (userData/thumbs) plus a byte-bounded in-memory LRU, so a file is rendered once.
 */
import { nativeImage } from 'electron'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'
import { spawn } from 'child_process'
import { getUserDataDir } from '../db'
import { getFFmpeg } from './ffmpeg'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.m4v'])

const MEMORY_BUDGET_BYTES = 64 * 1024 * 1024
const MAX_PARALLEL_JOBS = 3
const JPEG_QUALITY = 82
// Floor for the downscale: a small generation (1K image, 480p video) scaled by 0.25 would come
// out a few hundred pixels wide and look pixelated in the grid, so the short side never drops
// below this (nor is it ever upscaled past the source)
const MIN_SHORT_SIDE = 720
const CACHE_VERSION = 'v2'

export type ThumbKind = 'image' | 'video'

export function isThumbImage(ext: string) { return IMAGE_EXTS.has(ext) }
export function isThumbVideo(ext: string) { return VIDEO_EXTS.has(ext) }

// In-memory LRU (bounded by bytes; Map insertion order doubles as recency)
const memory = new Map<string, Buffer>()
let memoryBytes = 0

function rememberThumb(key: string, buf: Buffer) {
  const prev = memory.get(key)
  if (prev) { memoryBytes -= prev.length; memory.delete(key) }
  memory.set(key, buf)
  memoryBytes += buf.length
  while (memoryBytes > MEMORY_BUDGET_BYTES && memory.size > 0) {
    const oldest = memory.keys().next().value as string
    memoryBytes -= memory.get(oldest)!.length
    memory.delete(oldest)
  }
}

function recallThumb(key: string): Buffer | undefined {
  const buf = memory.get(key)
  if (buf) { memory.delete(key); memory.set(key, buf) }
  return buf
}

// Disk cache
let thumbsDir: string | null = null
function getThumbsDir(): string {
  if (!thumbsDir) {
    thumbsDir = path.join(getUserDataDir(), 'thumbs')
    try { fs.mkdirSync(thumbsDir, { recursive: true }) } catch {}
    // A write interrupted by a quit leaves a .tmp behind; sweep them in the background
    const dir = thumbsDir
    void fsp.readdir(dir).then((names) => {
      for (const name of names) if (name.endsWith('.tmp')) fsp.unlink(path.join(dir, name)).catch(() => {})
    }).catch(() => {})
  }
  return thumbsDir
}

function cacheKey(filePath: string, stat: fs.Stats, scale: number, kind: ThumbKind) {
  return crypto.createHash('sha1')
    .update(`${CACHE_VERSION}|${kind}|${filePath}|${stat.size}|${stat.mtimeMs}|${scale}`)
    .digest('hex')
}

async function readDisk(key: string): Promise<Buffer | null> {
  try {
    const buf = await fsp.readFile(path.join(getThumbsDir(), `${key}.jpg`))
    return buf.length > 0 ? buf : null
  } catch {
    return null
  }
}

async function writeDisk(key: string, buf: Buffer) {
  const final = path.join(getThumbsDir(), `${key}.jpg`)
  const tmp = `${final}.${process.pid}.${Date.now()}.tmp`
  try {
    await fsp.writeFile(tmp, buf)
    await fsp.rename(tmp, final)
  } catch {
    try { await fsp.unlink(tmp) } catch {}
  }
}

// Concurrency: a scroll burst must not fan out into dozens of decoders at once
let running = 0
const waiting: Array<() => void> = []
async function withSlot<T>(job: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL_JOBS) await new Promise<void>((resolve) => waiting.push(resolve))
  running++
  try {
    return await job()
  } finally {
    running--
    waiting.shift()?.()
  }
}

const inFlight = new Map<string, Promise<Buffer | null>>()

/**
 * JPEG thumbnail of an image (downscaled by `scale`) or poster frame of a video (scaled by
 * `scale`, 1 = source size). Null when the file cannot be rendered.
 */
export async function getThumbnail(filePath: string, stat: fs.Stats, scale: number, kind: ThumbKind): Promise<Buffer | null> {
  const key = cacheKey(filePath, stat, scale, kind)
  const cached = recallThumb(key)
  if (cached) return cached

  const pending = inFlight.get(key)
  if (pending) return pending

  const job = (async () => {
    const fromDisk = await readDisk(key)
    if (fromDisk) {
      rememberThumb(key, fromDisk)
      return fromDisk
    }
    const rendered = await withSlot(() => (kind === 'video' ? renderVideoPoster(filePath, scale) : renderImage(filePath, scale)))
    if (rendered) {
      rememberThumb(key, rendered)
      void writeDisk(key, rendered)
    }
    return rendered
  })().finally(() => { inFlight.delete(key) })
  inFlight.set(key, job)
  return job
}

// Render scale once the MIN_SHORT_SIDE floor is applied, never above the source size
function effectiveScale(width: number, height: number, scale: number) {
  const short = Math.min(width, height)
  if (!(short > 0)) return scale
  return Math.min(1, Math.max(scale, MIN_SHORT_SIDE / short))
}

// Images
async function renderImage(filePath: string, scale: number): Promise<Buffer | null> {
  const dims = await readImageDimensions(filePath)
  if (dims) {
    const s = effectiveScale(dims.width, dims.height, scale)
    const width = Math.max(1, Math.round(dims.width * s))
    const height = Math.max(1, Math.round(dims.height * s))
    const native = await nativeThumbnail(filePath, width, height)
    if (native) return native
  }
  const viaFfmpeg = await runFfmpeg(imageArgs(filePath, scale))
  if (viaFfmpeg) return viaFfmpeg
  return syncFallback(filePath, scale)
}

// OS thumbnailer (Windows shell / macOS QuickLook): decodes and resizes off the JS thread
async function nativeThumbnail(filePath: string, width: number, height: number): Promise<Buffer | null> {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return null
  try {
    const img = await nativeImage.createThumbnailFromPath(filePath, { width, height })
    if (img.isEmpty()) return null
    // The shell may answer with a smaller cached thumbnail than asked for; that would blur the
    // grid below the scale the user chose, so let ffmpeg render it instead
    const size = img.getSize()
    if (size.width < width * 0.9 && size.height < height * 0.9) return null
    return img.toJPEG(JPEG_QUALITY)
  } catch {
    return null
  }
}

// Last resort, synchronous (the previous behaviour): only reached when both async paths fail
function syncFallback(filePath: string, scale: number): Buffer | null {
  try {
    const img = nativeImage.createFromPath(filePath)
    if (img.isEmpty()) return null
    const { width, height } = img.getSize()
    const s = effectiveScale(width, height, scale)
    const resized = img.resize({
      width: Math.max(1, Math.round(width * s)),
      height: Math.max(1, Math.round(height * s)),
      quality: 'good',
    })
    return resized.toJPEG(JPEG_QUALITY)
  } catch {
    return null
  }
}

// Videos
async function renderVideoPoster(filePath: string, scale: number): Promise<Buffer | null> {
  // A frame slightly in avoids the black first frame many encoders produce; very short clips
  // fall back to frame zero
  return (await runFfmpeg(videoArgs(filePath, scale, 0.3))) || (await runFfmpeg(videoArgs(filePath, scale, 0)))
}

// ffmpeg (child process; the JPEG comes back on stdout)
function scaleFilter(scale: number) {
  const s = Math.min(1, Math.max(0.05, scale))
  // even dimensions (mjpeg needs them); the short side keeps MIN_SHORT_SIDE, capped at the source
  return `scale=w='max(2,trunc(min(iw,max(iw*${s},iw*${MIN_SHORT_SIDE}/min(iw,ih)))/2)*2)':h=-2`
}

function imageArgs(filePath: string, scale: number) {
  return ['-v', 'error', '-i', filePath, '-frames:v', '1', '-vf', scaleFilter(scale), '-pix_fmt', 'yuvj420p', '-q:v', '4', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1']
}

function videoArgs(filePath: string, scale: number, seek: number) {
  return ['-v', 'error', '-ss', String(seek), '-i', filePath, '-frames:v', '1', '-vf', scaleFilter(scale), '-pix_fmt', 'yuvj420p', '-q:v', '4', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1']
}

function runFfmpeg(args: string[]): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let proc: ReturnType<typeof spawn>
    try {
      proc = spawn(getFFmpeg().getBinaryPath(), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch {
      resolve(null)
      return
    }
    const chunks: Buffer[] = []
    proc.stdout?.on('data', (c: Buffer) => chunks.push(c))
    proc.stderr?.on('data', () => {})
    proc.on('error', () => resolve(null))
    proc.on('close', (code) => {
      const out = chunks.length ? Buffer.concat(chunks) : null
      resolve(code === 0 && out && out.length > 0 ? out : null)
    })
  })
}

// Image dimensions from the file header, so the native path is asked for the exact size
async function readImageDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
  let handle: fsp.FileHandle | null = null
  try {
    handle = await fsp.open(filePath, 'r')
    const buf = Buffer.alloc(64 * 1024)
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0)
    return parseDimensions(buf.subarray(0, bytesRead))
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => {})
  }
}

function parseDimensions(b: Buffer): { width: number; height: number } | null {
  // PNG: IHDR right after the 8-byte signature
  if (b.length >= 24 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  }
  // WebP: RIFF container, the first chunk tells the flavour
  if (b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16)
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }
    return null
  }
  // JPEG: walk the markers to the first SOF
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const marker = b[i + 1]
      if (marker === 0xff) { i++; continue }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
      const len = b.readUInt16BE(i + 2)
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isSof) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }
      i += 2 + len
    }
    return null
  }
  return null
}
