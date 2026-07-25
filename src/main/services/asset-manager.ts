import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'
import { app } from 'electron'
import { getRawDb, DbWrapper, getAssetSubDir } from '../db'

type AssetType = 'image' | 'video' | 'audio'

export interface AssetQuery {
  type?: AssetType
  search?: string
  modelUsed?: string
  isFavorite?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export class AssetManager {
  private assetsDir: string

  constructor() {
    const userDataPath = app.getPath('userData')
    this.assetsDir = path.join(userDataPath, 'kie-studio', 'assets').replace(/\\/g, '/')
  }

  getAssetsDir() { return this.assetsDir }

  getSubDir(type: AssetType) {
    const subDirs = { image: 'images', video: 'videos', audio: 'audio' }
    return `${this.assetsDir}/${subDirs[type]}`
  }

  async ensureDirectories() {
    for (const dir of ['images', 'videos', 'audio']) {
      const fullPath = path.join(this.assetsDir, dir)
      await fs.mkdir(fullPath, { recursive: true }).catch(() => {})
    }
  }

  getAsset(id: string) {
    return getRawDb().prepare('SELECT * FROM assets WHERE id = ?').get(id) || null
  }

  queryAssets(query: AssetQuery = {}) {
    const raw = getRawDb()
    const parts: string[] = ['1=1']
    const params: any[] = []

    if (query.type) { parts.push('type = ?'); params.push(query.type) }
    if (query.isFavorite !== undefined) { parts.push('is_favorite = ?'); params.push(query.isFavorite ? 1 : 0) }
    if (query.modelUsed) { parts.push('model_used = ?'); params.push(query.modelUsed) }
    if (query.search) {
      parts.push('(prompt LIKE ? OR file_name LIKE ? OR model_used LIKE ?)')
      const s = `%${query.search}%`
      params.push(s, s, s)
    }

    const where = parts.join(' AND ')
    const order = query.sortOrder === 'asc' ? 'ASC' : 'DESC'
    const orderCol = query.sortBy === 'name' ? 'file_name' : query.sortBy === 'modelUsed' ? 'model_used' : query.sortBy === 'fileSize' ? 'file_size' : 'created_at'
    const limit = query.limit || 50
    const offset = query.offset || 0

    const items = raw.prepare(`SELECT * FROM assets WHERE ${where} ORDER BY ${orderCol} ${order} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset)

    const total = raw.prepare(`SELECT count(*) as count FROM assets WHERE ${where}`).get(...params)?.count || 0

    return { assets: items, total }
  }

  getRecentAssets(limit = 20) {
    return getRawDb().prepare('SELECT * FROM assets ORDER BY created_at DESC LIMIT ?').all(limit)
  }

  async importFile(filePath: string, type: AssetType) {
    await this.ensureDirectories()
    const id = crypto.randomUUID()
    const ext = path.extname(filePath)
    const fileName = `${id}${ext}`
    const destPath = `${this.getSubDir(type)}/${fileName}`
    const stat = await fs.stat(filePath)
    const buffer = await fs.readFile(filePath)
    await fs.writeFile(destPath, buffer)

    const mimeTypes: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.webp': 'image/webp', '.gif': 'image/gif',
      '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    }

    const raw = getRawDb()
    raw.prepare(
      'INSERT INTO assets (id, type, file_path, file_name, mime_type, model_used, file_size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, type, destPath, fileName, mimeTypes[ext] || 'application/octet-stream', 'import', stat.size, Date.now(), Date.now())

    return { id, type, filePath: destPath, fileName, fileSize: stat.size }
  }

  deleteAsset(id: string) {
    const raw = getRawDb()
    const asset = this.getAsset(id)
    if (!asset) return false
    const localPath = (asset as any).localPath || asset.filePath
    if (localPath && !localPath.startsWith('http') && !localPath.startsWith('__error__')) {
      try { fs.unlink(localPath).catch(() => {}) } catch {}
    }
    raw.prepare('DELETE FROM assets WHERE id = ?').run(id)
    return true
  }

  toggleFavorite(id: string) {
    const raw = getRawDb()
    const asset = this.getAsset(id)
    if (!asset) return null
    const newVal = asset.isFavorite ? 0 : 1
    raw.prepare('UPDATE assets SET is_favorite = ?, updated_at = ? WHERE id = ?').run(newVal, Date.now(), id)
    return this.getAsset(id)
  }

  getStorageStats() {
    const raw = getRawDb()
    const all = raw.prepare('SELECT * FROM assets').all()
    const stats = { totalFiles: all.length, totalSize: 0, images: 0, videos: 0, audio: 0, imageSize: 0, videoSize: 0, audioSize: 0 }
    for (const a of all) {
      const s = (a.fileSize || 0) as number
      stats.totalSize += s
      if (a.type === 'image') { stats.images++; stats.imageSize += s }
      else if (a.type === 'video') { stats.videos++; stats.videoSize += s }
      else if (a.type === 'audio') { stats.audio++; stats.audioSize += s }
    }
    return stats
  }

  async refreshAsset(id: string) {
    const raw = getRawDb()
    const asset = this.getAsset(id) as any
    if (!asset) return null

    // Try to re-download from the original task
    const task = raw.prepare('SELECT * FROM kie_tasks WHERE task_id = ?').get(asset.taskId) as any
    if (!task) {
      console.error(`[refreshAsset] No kie_task found for task_id: ${asset.taskId}`)
      if (!asset.filePath?.startsWith('__error__')) {
        raw.prepare('UPDATE assets SET file_path = ?, updated_at = ? WHERE id = ?')
          .run('__error__:File missing and no task found to recover', Date.now(), id)
      }
      return this.getAsset(id)
    }

    const taskPayload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {})
    let kieTaskId: string | null = task.kieTaskId || taskPayload?.kieTaskId || null

    // Fallback: try to find kieTaskId from run_logs
    if (!kieTaskId) {
      const logRow = raw.prepare(
        "SELECT message FROM run_logs WHERE task_id = ? AND message LIKE 'KIE task created:%' ORDER BY created_at ASC LIMIT 1"
      ).get(asset.taskId) as any
      if (logRow?.message) {
        const match = logRow.message.match(/KIE task created:\s*(.+)$/)
        if (match) {
          kieTaskId = match[1]
          console.log(`[refreshAsset] Recovered kieTaskId from logs: ${kieTaskId}`)
          raw.prepare('UPDATE kie_tasks SET kie_task_id = ? WHERE task_id = ?').run(kieTaskId, asset.taskId)
        }
      }
    }

    if (!kieTaskId) {
      console.error(`[refreshAsset] No kieTaskId for task: ${asset.taskId}. Status: ${task.status}`)
      raw.prepare('UPDATE assets SET file_path = ?, updated_at = ? WHERE id = ?')
        .run(`__error__:Task never submitted to KIE (status: ${task.status})`, Date.now(), id)
      return this.getAsset(id)
    }

    try {
      const { KieApiClient } = require('./kie-api')
      const apiKey = raw.prepare("SELECT value FROM settings WHERE key = 'kieApiKey'").get() as any
      if (!apiKey?.value) throw new Error('No API key configured')
      const key = JSON.parse(apiKey.value)
      const api = new KieApiClient(key)

      let detail = await api.getTaskDetail(kieTaskId!)
      if (detail.state !== 'success' && detail.state !== 'fail') {
        detail = await api.waitForCompletion(kieTaskId!)
      }

      if (detail.state !== 'success') {
        console.error(`[refreshAsset] KIE task state is ${detail.state} for ${kieTaskId}`)
        raw.prepare('UPDATE assets SET file_path = ?, updated_at = ? WHERE id = ?')
          .run(`__error__:Task state is ${detail.state}`, Date.now(), id)
        return this.getAsset(id)
      }

      console.log(`[refreshAsset] KIE task OK, model=${detail.model}, credits=${detail.creditsConsumed}`)

      const { extractUrls } = require('./task-queue')
      const resultUrls = extractUrls(detail.resultJson)

      if (resultUrls.length === 0) {
        console.error(`[refreshAsset] No URLs found in resultJson: ${JSON.stringify(detail.resultJson).substring(0, 300)}`)
        raw.prepare('UPDATE assets SET file_path = ?, updated_at = ? WHERE id = ?')
          .run(`__error__:No result URLs in task`, Date.now(), id)
        return this.getAsset(id)
      }

      const url = resultUrls[0]
      console.log(`[refreshAsset] Download URL: ${url}`)

      const type = asset.type as 'image' | 'video'
      const ext = type === 'video' ? '.mp4' : '.png'
      const mime = type === 'image' ? 'image/png' : 'video/mp4'
      const subDir = getAssetSubDir(type)
      const fileName = `${id}${ext}`
      const localPath = `${subDir}/${fileName}`

      await fs.mkdir(subDir, { recursive: true })

      // Only download if local file doesn't exist
      let buffer: Buffer = Buffer.alloc(0)
      let fileExists = false
      if (asset.localPath && !asset.localPath.startsWith('http') && !asset.localPath.startsWith('__error__')) {
        try {
          await fs.access(asset.localPath)
          fileExists = true
          buffer = await fs.readFile(asset.localPath)
        } catch {}
      }

      if (!fileExists) {
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        buffer = Buffer.from(await resp.arrayBuffer())
        await fs.writeFile(localPath, buffer)
      } else if (asset.localPath !== localPath) {
        await fs.writeFile(localPath, buffer)
      }

      // Re-encode video for browser compatibility
      let fileSize = buffer.length
      if (type === 'video') {
        try {
          const result = await ensurePlayableVideo(localPath)
          fileSize = result.size
        } catch {}
      }

      raw.prepare(
        `UPDATE assets SET file_path = ?, local_path = ?, file_name = ?, mime_type = ?, model_used = ?, prompt = ?, parameters = ?, file_size = ?, credits_used = ?, updated_at = ? WHERE id = ?`
      ).run(
        url, localPath, fileName, mime,
        detail.model || taskPayload?.model || '',
        taskPayload?.prompt || '',
        JSON.stringify(taskPayload),
        fileSize,
        detail.creditsConsumed || 0,
        Date.now(), id
      )

      raw.save()

      console.log(`[refreshAsset] Updated asset ${id}`)
      return this.getAsset(id)
    } catch (err: any) {
      console.error(`[refreshAsset] Error: ${err.message}`, err.stack)
      raw.prepare('UPDATE assets SET file_path = ?, updated_at = ? WHERE id = ?')
        .run(`__error__:${err.message}`, Date.now(), id)
      return this.getAsset(id)
    }
  }

  async downloadToLocal(id: string) {
    const raw = getRawDb()
    const asset = this.getAsset(id) as any
    if (!asset) return null

    const url = asset.filePath
    if (!url || !url.startsWith('http')) return null

    const type = asset.type as 'image' | 'video'
    const ext = type === 'video' ? '.mp4' : '.png'
    const subDir = getAssetSubDir(type)
    const fileName = `${id}${ext}`
    const localPath = `${subDir}/${fileName}`

    await fs.mkdir(subDir, { recursive: true })

    // If local file already exists, re-download only if it's a video (to fix encoding)
    let needsDownload = true
    if (asset.localPath) {
      try {
        await fs.access(asset.localPath)
        if (type !== 'video') return asset
        // For videos, re-encode from existing file instead of re-downloading
        const result = await ensurePlayableVideo(asset.localPath)
        raw.prepare('UPDATE assets SET file_size = ?, updated_at = ? WHERE id = ?')
          .run(result.size, Date.now(), id)
        raw.save()
        return this.getAsset(id)
      } catch {}
    }

    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const buffer = Buffer.from(await resp.arrayBuffer())
    await fs.writeFile(localPath, buffer)

    let fileSize = buffer.length
    if (type === 'video') {
      try {
        const result = await ensurePlayableVideo(localPath)
        fileSize = result.size
      } catch {}
    }

    raw.prepare('UPDATE assets SET local_path = ?, file_size = ?, updated_at = ? WHERE id = ?')
      .run(localPath, fileSize, Date.now(), id)

    raw.save()

    return this.getAsset(id)
  }
}

let assetManagerInstance: AssetManager | null = null

export async function ensurePlayableVideo(inputPath: string): Promise<{ path: string; size: number }> {
  try {
    const ffmpegStatic = require('ffmpeg-static')
    const ffmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : (ffmpegStatic?.path || 'ffmpeg')
    const os = require('os')
    const pathMod = require('path')
    const tmpPath = pathMod.join(os.tmpdir(), `kie-transcode-${Date.now()}.mp4`)
    console.log('[ensurePlayableVideo] Re-encoding to', tmpPath)

    await new Promise<void>((resolve, reject) => {
      const { spawn } = require('child_process')
      const buildArgs = (withAudio: boolean) => [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-profile:v', 'baseline',
        '-level', '3.0',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-vf', 'format=yuv420p',
        ...(withAudio ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']),
        '-movflags', '+faststart',
        '-y', tmpPath,
      ]

      const run = (withAudio: boolean, cb: (err?: Error) => void) => {
        const args = buildArgs(withAudio)
        console.log('[ensurePlayableVideo] ffmpeg', ffmpegPath, args.join(' '))
        const proc = spawn(ffmpegPath, args)
        let stderr = ''
        let stdout = ''
        proc.stdout.on('data', (d: any) => { stdout += d.toString() })
        proc.stderr.on('data', (d: any) => { stderr += d.toString() })
        proc.on('error', (err: any) => {
          console.error('[ensurePlayableVideo] spawn error:', err.message)
          cb(err)
        })
        proc.on('close', (code: number) => {
          console.error('[ensurePlayableVideo] exit code:', code)
          if (stderr) console.error('[ensurePlayableVideo] stderr:', stderr.slice(0, 500))
          if (code === 0) cb()
          else cb(new Error(`ffmpeg exit ${code}`))
        })
      }

      run(true, (err) => {
        if (!err) return resolve()
        console.error('[ensurePlayableVideo] Audio encode failed, retrying without audio')
        run(false, (err2) => {
          if (!err2) return resolve()
          reject(err2)
        })
      })
    })

    const stat = await fs.stat(tmpPath)
    await fs.unlink(inputPath)
    await fs.rename(tmpPath, inputPath)
    console.log(`[ensurePlayableVideo] Done: ${(stat.size / (1024 * 1024)).toFixed(1)} MB`)
    return { path: inputPath, size: stat.size }
  } catch (err: any) {
    console.error('[ensurePlayableVideo] FAILED:', err.message)
    try { const s = await fs.stat(inputPath); return { path: inputPath, size: s.size } } catch { return { path: inputPath, size: 0 } }
  }
}

export function getAssetManager(): AssetManager {
  if (!assetManagerInstance) assetManagerInstance = new AssetManager()
  return assetManagerInstance
}
