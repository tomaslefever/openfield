import * as syncFs from 'fs'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import { spawn } from 'child_process'
import { getRawDb } from '../db'
import { ffmpegBinary } from './bundled-binaries'

/**
 * Local file of an asset on disk. Generated assets keep their downloaded copy in local_path,
 * but imported/reference assets (importBase64, importFile) only set file_path — resolvers that
 * read local_path alone silently drop those refs. Every "asset id → file" lookup goes through here.
 */
export function resolveAssetFile(assetId?: string | null): { path: string; mime: string | null } | null {
  if (!assetId) return null
  try {
    // The DB wrapper camelCases column names (local_path → localPath)
    const asset = getRawDb().prepare('SELECT local_path, file_path, mime_type FROM assets WHERE id = ?').get(assetId) as any
    for (const p of [asset?.localPath, asset?.filePath]) {
      if (typeof p === 'string' && p && !p.startsWith('http') && !p.startsWith('__error__') && syncFs.existsSync(p)) {
        return { path: p, mime: asset.mimeType || null }
      }
    }
  } catch {}
  return null
}

// ─── Upload preparation ─────────────────────────────────────────────────────
// Providers accept MP4 as the only video container (Higgsfield rejects anything else with a
// 422 on content_type; the rest fail later or silently). Videos in other containers (mkv,
// webm, mov, ...) are re-encoded to H.264/AAC MP4 before upload.

const NON_MP4_VIDEO_EXT = /\.(mkv|matroska|webm|mov|qt|avi|m4v|flv|wmv|mpg|mpeg|ts|3gp|ogv)$/i

function isNonMp4Video(filePath: string, mime?: string | null): boolean {
  const m = (mime || '').toLowerCase()
  if (m.startsWith('video/')) return m !== 'video/mp4'
  // audio/mpeg (MP3) assets can be stored as .mpeg; only the extension says "video" there
  if (m.startsWith('audio/') || m.startsWith('image/')) return false
  return NON_MP4_VIDEO_EXT.test(filePath)
}

export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBinary(), args)
    let stderr = ''
    proc.stderr.on('data', (d: any) => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('close', (code: number) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`)))
  })
}

/** Re-encodes any video to H.264/AAC MP4 (audio dropped if it cannot be encoded). */
async function transcodeToMp4(src: string, dest: string): Promise<void> {
  const tmp = `${dest}.${crypto.randomUUID()}.tmp.mp4`
  const args = (withAudio: boolean) => [
    '-i', src,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    ...(withAudio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']),
    '-movflags', '+faststart', '-y', tmp,
  ]
  try {
    try {
      await runFfmpeg(args(true))
    } catch {
      await runFfmpeg(args(false))
    }
    await fs.rename(tmp, dest)
  } catch (err) {
    await fs.unlink(tmp).catch(() => {})
    throw err
  }
}

const inflight = new Map<string, Promise<{ path: string; mime: string }>>()

function once(key: string, fn: () => Promise<{ path: string; mime: string }>) {
  const existing = inflight.get(key)
  if (existing) return existing
  const p = fn().finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

/**
 * A local file ready to upload to any provider: non-MP4 videos are converted to a cached MP4
 * copy in the temp dir (keyed by path, size and mtime); everything else is returned as is.
 */
export async function prepareUploadFile(filePath: string, mime?: string | null): Promise<{ path: string; mime: string }> {
  if (!isNonMp4Video(filePath, mime)) return { path: filePath, mime: mime || '' }
  const stat = await fs.stat(filePath)
  const key = crypto.createHash('sha1').update(`${filePath}|${stat.size}|${stat.mtimeMs}`).digest('hex')
  const dest = path.join(os.tmpdir(), 'openfield-upload', `${key}.mp4`)
  if (syncFs.existsSync(dest)) return { path: dest, mime: 'video/mp4' }
  return once(dest, async () => {
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await transcodeToMp4(filePath, dest)
    return { path: dest, mime: 'video/mp4' }
  })
}

/**
 * resolveAssetFile, guaranteeing an uploadable file. A non-MP4 video asset is converted once
 * to an MP4 next to the original and the asset row is repointed to it, so it is never
 * converted again (and plays in the app).
 */
export async function resolveAssetFileForUpload(assetId?: string | null): Promise<{ path: string; mime: string | null } | null> {
  const file = resolveAssetFile(assetId)
  if (!file || !assetId || !isNonMp4Video(file.path, file.mime)) return file
  return once(`asset:${assetId}`, async () => {
    const base = file.path.replace(/\.[^./\\]+$/, '')
    const dest = `${base}.mp4` === file.path ? `${base}-h264.mp4` : `${base}.mp4`
    await transcodeToMp4(file.path, dest)
    const size = (await fs.stat(dest)).size
    getRawDb().prepare(
      `UPDATE assets SET
         file_path = CASE WHEN file_path = ? THEN ? ELSE file_path END,
         local_path = CASE WHEN local_path = ? THEN ? ELSE local_path END,
         mime_type = 'video/mp4', file_size = ?, updated_at = ?
       WHERE id = ?`
    ).run(file.path, dest, file.path, dest, size, Date.now(), assetId)
    await fs.unlink(file.path).catch(() => {})
    return { path: dest, mime: 'video/mp4' }
  })
}

// ─── In-app audio previews ──────────────────────────────────────────────────

function localPathFrom(source?: string | null): string | null {
  if (!source || source.startsWith('http') || source.startsWith('data:') || source.startsWith('blob:')) return null
  let p = source
  if (p.startsWith('asset://localhost/')) p = p.slice('asset://localhost/'.length).replace(/[?#].*$/, '')
  else if (p.startsWith('file:///')) p = p.slice(8)
  else if (p.startsWith('file://')) p = p.slice(7)
  try { p = decodeURIComponent(p) } catch {}
  return syncFs.existsSync(p) ? p : null
}

/**
 * Chromium cannot decode every audio variant (e.g. 32-bit float PCM WAV fails with
 * DEMUXER_ERROR_NO_SUPPORTED_STREAMS). Returns a cached 16-bit PCM WAV copy for in-app
 * previews only — the original file is what gets uploaded to providers.
 */
export async function makePlayableAudio(src: { path?: string; base64?: string; mime?: string }): Promise<string | null> {
  const previewDir = path.join(os.tmpdir(), 'openfield-preview')
  let input = localPathFrom(src.path)
  let key: string

  if (input) {
    const stat = await fs.stat(input)
    key = crypto.createHash('sha1').update(`${input}|${stat.size}|${stat.mtimeMs}`).digest('hex')
  } else if (src.base64) {
    const b64 = src.base64.replace(/^data:[^,]*,/, '')
    key = crypto.createHash('sha1').update(b64).digest('hex')
    input = path.join(previewDir, `${key}.src`)
    if (!syncFs.existsSync(input)) {
      await fs.mkdir(previewDir, { recursive: true })
      await fs.writeFile(input, Buffer.from(b64, 'base64'))
    }
  } else {
    return null
  }

  const dest = path.join(previewDir, `${key}.wav`)
  if (syncFs.existsSync(dest)) return dest
  const source = input
  const result = await once(dest, async () => {
    await fs.mkdir(previewDir, { recursive: true })
    const tmp = `${dest}.${crypto.randomUUID()}.tmp.wav`
    try {
      await runFfmpeg(['-i', source, '-vn', '-c:a', 'pcm_s16le', '-y', tmp])
      await fs.rename(tmp, dest)
    } catch (err) {
      await fs.unlink(tmp).catch(() => {})
      throw err
    }
    return { path: dest, mime: 'audio/wav' }
  })
  return result.path
}
