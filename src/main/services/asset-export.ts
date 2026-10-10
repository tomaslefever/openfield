import * as fs from 'fs/promises'
import * as syncFs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import { getRawDb } from '../db'
import { runFfmpeg, prepareUploadFile } from './asset-file'

/**
 * Exported files get the extension of what they actually contain:
 *  - images → the format chosen in Settings (PNG / WebP / JPEG, with quality for WebP/JPEG)
 *  - videos → always MP4 (other containers are transcoded)
 *  - audio  → its real binary type
 */

export type ImageExportFormat = 'png' | 'webp' | 'jpeg'

export interface ExportSettings {
  imageFormat: ImageExportFormat
  /** 1-100, used by WebP and JPEG */
  imageQuality: number
}

const IMAGE_EXT: Record<ImageExportFormat, string> = { png: '.png', webp: '.webp', jpeg: '.jpg' }

const MIME_EXT: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'video/matroska': '.mkv', 'video/x-matroska': '.mkv',
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/ogg': '.ogg',
  'audio/flac': '.flac', 'audio/aac': '.aac', 'audio/mp4': '.m4a', 'audio/webm': '.webm',
}

function readSetting(key: string): any {
  try {
    const row = getRawDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
    if (!row?.value) return null
    try { return JSON.parse(row.value) } catch { return row.value }
  } catch { return null }
}

export function readExportSettings(): ExportSettings {
  const fmt = readSetting('exportImageFormat')
  const q = Number(readSetting('exportImageQuality'))
  return {
    imageFormat: fmt === 'webp' || fmt === 'jpeg' || fmt === 'png' ? fmt : 'png',
    imageQuality: Number.isFinite(q) && q >= 1 && q <= 100 ? Math.round(q) : 90,
  }
}

type Kind = 'image' | 'video' | 'audio' | 'other'

function kindOf(mime: string | null | undefined, type?: string | null, filePath?: string): Kind {
  const m = (mime || '').toLowerCase()
  if (m.startsWith('image/') || type === 'image') return 'image'
  if (m.startsWith('video/') || type === 'video') return 'video'
  if (m.startsWith('audio/') || type === 'audio') return 'audio'
  const ext = path.extname(filePath || '').toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return 'image'
  if (['.mp4', '.mov', '.webm', '.mkv', '.matroska'].includes(ext)) return 'video'
  if (['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'].includes(ext)) return 'audio'
  return 'other'
}

function imageFormatOfFile(filePath: string, mime?: string | null): ImageExportFormat | null {
  const m = (mime || '').toLowerCase()
  if (m === 'image/png') return 'png'
  if (m === 'image/webp') return 'webp'
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpeg'
  const ext = path.extname(filePath).toLowerCase()
  return ext === '.png' ? 'png' : ext === '.webp' ? 'webp' : ext === '.jpg' || ext === '.jpeg' ? 'jpeg' : null
}

/** Image export format implied by a file name the user typed, if any. */
export function imageFormatFromName(fileName: string): ImageExportFormat | null {
  const ext = path.extname(fileName).toLowerCase()
  return ext === '.png' ? 'png' : ext === '.webp' ? 'webp' : ext === '.jpg' || ext === '.jpeg' ? 'jpeg' : null
}

/** Extension an asset will be exported with. */
export function exportExtension(sourcePath: string, mime: string | null | undefined, type: string | null | undefined, settings: ExportSettings): string {
  const kind = kindOf(mime, type, sourcePath)
  if (kind === 'image') return IMAGE_EXT[settings.imageFormat]
  if (kind === 'video') return '.mp4'
  return MIME_EXT[(mime || '').toLowerCase()] || path.extname(sourcePath) || '.bin'
}

/** Save-dialog filter matching the export extension, so the OS appends it if the user drops it. */
export function exportDialogFilter(ext: string): { name: string; extensions: string[] } {
  const e = ext.replace(/^\./, '')
  const names: Record<string, string> = { png: 'PNG image', webp: 'WebP image', jpg: 'JPEG image', mp4: 'MP4 video' }
  return { name: names[e] || `${e.toUpperCase()} file`, extensions: e === 'jpg' ? ['jpg', 'jpeg'] : [e] }
}

export interface PreparedExport {
  /** File to copy/stream into the destination */
  path: string
  ext: string
  /** Temp file to delete once copied */
  temp: boolean
}

function tempPath(ext: string): string {
  return path.join(os.tmpdir(), 'openfield-export', `${crypto.randomUUID()}${ext}`)
}

async function convertImage(src: string, format: ImageExportFormat, quality: number): Promise<string> {
  const out = tempPath(IMAGE_EXT[format])
  await fs.mkdir(path.dirname(out), { recursive: true })
  if (format === 'png') {
    await runFfmpeg(['-y', '-i', src, '-frames:v', '1', out])
  } else if (format === 'webp') {
    await runFfmpeg(['-y', '-i', src, '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(quality), out])
  } else {
    // JPEG has no alpha: flatten transparent areas onto white instead of black.
    // mjpeg -q:v runs 2 (best) .. 31 (worst); map quality 100..1 onto it.
    const qv = Math.round(2 + ((100 - quality) * 29) / 99)
    await runFfmpeg([
      '-y', '-i', src,
      '-filter_complex', '[0:v]format=rgba[fg];color=white[bg];[bg][fg]scale2ref[bg2][fg2];[bg2][fg2]overlay=format=auto:shortest=1,format=yuvj444p',
      '-frames:v', '1', '-q:v', String(qv), out,
    ])
  }
  return out
}

/**
 * The file to export for an asset, converted if needed. `formatOverride` lets a save dialog
 * honour an image extension the user typed (e.g. saving as .jpg while Settings says PNG).
 */
export async function prepareExportFile(
  sourcePath: string,
  mime: string | null | undefined,
  type: string | null | undefined,
  settings: ExportSettings,
  formatOverride?: ImageExportFormat | null,
): Promise<PreparedExport> {
  const kind = kindOf(mime, type, sourcePath)

  if (kind === 'image') {
    const format = formatOverride || settings.imageFormat
    const ext = IMAGE_EXT[format]
    // Already in the target format: copy untouched (re-encoding lossy images only loses quality)
    if (imageFormatOfFile(sourcePath, mime) === format) return { path: sourcePath, ext, temp: false }
    return { path: await convertImage(sourcePath, format, settings.imageQuality), ext, temp: true }
  }

  if (kind === 'video') {
    const prepared = await prepareUploadFile(sourcePath, mime) // MP4 as is; mkv/webm/mov → cached MP4
    return { path: prepared.path, ext: '.mp4', temp: false }
  }

  return { path: sourcePath, ext: exportExtension(sourcePath, mime, type, settings), temp: false }
}

/** Downloads a remote-only asset to a temp file so it can go through prepareExportFile. */
export async function downloadToTemp(url: string, mime?: string | null): Promise<string> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const guessed = MIME_EXT[(mime || '').toLowerCase()] || path.extname(new URL(url).pathname) || '.bin'
  const out = tempPath(guessed)
  await fs.mkdir(path.dirname(out), { recursive: true })
  await fs.writeFile(out, Buffer.from(await resp.arrayBuffer()))
  return out
}

export async function removeTemp(filePath: string) {
  if (filePath.startsWith(path.join(os.tmpdir(), 'openfield-export')) && syncFs.existsSync(filePath)) {
    await fs.unlink(filePath).catch(() => {})
  }
}
