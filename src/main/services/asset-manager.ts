import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'
import { getRawDb, getAssetsDir } from '../db'
import { getActiveWorkspaceId, workspaceAssetSubDir, workspaceAssetsDir, ensureWorkspaceDirs, listWorkspaces } from './workspace-service'

function stripForStorage(payload: any): any {
  if (!payload || typeof payload !== 'object') return payload
  if (Array.isArray(payload)) return payload.map(stripForStorage)
  const cleaned: any = {}
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'imageBase64' || k === 'firstFrameBase64' || k === 'lastFrameBase64') {
      cleaned[k] = ''
    } else if (k === 'imageRefs' && Array.isArray(v)) {
      cleaned[k] = (v as any[]).map((r: any) => {
        const s: any = { name: r.name, refType: r.refType, mime: r.mime }
        if (r.assetId) s.assetId = r.assetId
        if (!r.assetId && r.base64) s.base64 = r.base64
        return s
      })
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      cleaned[k] = stripForStorage(v)
    } else {
      cleaned[k] = v
    }
  }
  return cleaned
}

type AssetType = 'image' | 'video' | 'audio'

export interface AssetQuery {
  type?: AssetType
  types?: AssetType[]
  search?: string
  tags?: string[]
  modelUsed?: string
  isFavorite?: boolean
  isArchived?: boolean
  aspectRatio?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
  excludeUploads?: boolean
  workspaceId?: string
}

export class AssetManager {
  private assetsDir: string

  constructor() {
    this.assetsDir = getAssetsDir()
  }

  getAssetsDir() { return this.assetsDir }

  getSubDir(type: AssetType, workspaceId?: string) {
    return workspaceAssetSubDir(type, workspaceId)
  }

  async ensureDirectories(workspaceId?: string) {
    await ensureWorkspaceDirs(workspaceId)
  }

  getAsset(id: string) {
    return getRawDb().prepare('SELECT * FROM assets WHERE id = ?').get(id) || null
  }

  queryAssets(query: AssetQuery = {}) {
    const raw = getRawDb()
    const parts: string[] = ['1=1']
    const params: any[] = []

    const workspaceId = query.workspaceId || getActiveWorkspaceId()
    if (workspaceId !== 'all') {
      parts.push('workspace_id = ?')
      params.push(workspaceId)
    }

    if (query.type) { parts.push('type = ?'); params.push(query.type) }
    if (query.types && query.types.length > 0) {
      parts.push(`type IN (${query.types.map(() => '?').join(', ')})`)
      query.types.forEach(t => params.push(t))
    }
    if (query.isFavorite !== undefined) { parts.push('is_favorite = ?'); params.push(query.isFavorite ? 1 : 0) }
    if (query.isArchived !== undefined) {
      parts.push('is_archived = ?')
      params.push(query.isArchived ? 1 : 0)
    } else {
      parts.push('(is_archived = 0 OR is_archived IS NULL)')
    }
    if (query.aspectRatio) { parts.push('aspect_ratio = ?'); params.push(query.aspectRatio) }
    if (query.tags && query.tags.length > 0) {
      const tagClauses = query.tags.map(() => `(',' || tags || ',' LIKE ?)`)
      parts.push(`(${tagClauses.join(' AND ')})`)
      query.tags.forEach(t => params.push(`%,${t},%`))
    }
    if (query.modelUsed) { parts.push('model_used = ?'); params.push(query.modelUsed) }
    if (query.excludeUploads) { parts.push("model_used != 'upload' AND model_used != 'ref'") }
    if (query.search) {
      parts.push('(prompt LIKE ? OR file_name LIKE ? OR model_used LIKE ? OR tags LIKE ?)')
      const s = `%${query.search}%`
      params.push(s, s, s, s)
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

  getRecentAssets(limit = 20, workspaceId?: string) {
    const ws = workspaceId || getActiveWorkspaceId()
    return getRawDb().prepare('SELECT * FROM assets WHERE workspace_id = ? AND (is_archived = 0 OR is_archived IS NULL) ORDER BY created_at DESC LIMIT ?').all(ws, limit)
  }

  getAllTags(workspaceId?: string): string[] {
    const ws = workspaceId || getActiveWorkspaceId()
    const rows = getRawDb().prepare('SELECT tags FROM assets WHERE workspace_id = ? AND tags IS NOT NULL AND tags != ?').all(ws, '') as any[]
    const counts = new Map<string, number>()
    for (const row of rows) {
      for (const t of String(row.tags || '').split(',')) {
        const tag = t.trim()
        if (tag) counts.set(tag, (counts.get(tag) || 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag)
  }

  async importFile(filePath: string, type: AssetType, workspaceId?: string) {
    const ws = workspaceId || getActiveWorkspaceId()
    await this.ensureDirectories(ws)
    const id = crypto.randomUUID()
    const ext = path.extname(filePath)
    const fileName = `${id}${ext}`
    const destPath = `${this.getSubDir(type, ws)}/${fileName}`
    const stat = await fs.stat(filePath)
    const buffer = await fs.readFile(filePath)
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex')
    await fs.writeFile(destPath, buffer)

    const mimeTypes: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.webp': 'image/webp', '.gif': 'image/gif',
      '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    }

    let savedPath = destPath
    let savedMime = mimeTypes[ext] || 'application/octet-stream'
    let savedSize = stat.size
    if (type === 'image') {
      const res = await ensureImageWebp(destPath, savedMime)
      savedPath = res.path
      savedMime = res.mime
      savedSize = res.size
    }

    const raw = getRawDb()
    raw.prepare(
      'INSERT INTO assets (id, type, file_path, file_name, mime_type, model_used, file_size, content_hash, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, type, savedPath, path.basename(savedPath), savedMime, 'import', savedSize, contentHash, ws, Date.now(), Date.now())

    return { id, type, filePath: savedPath, fileName: path.basename(savedPath), fileSize: savedSize }
  }

  async importBase64(base64: string, mimeType: string, fileName: string, options?: { modelUsed?: string; workspaceId?: string }) {
    const ws = options?.workspaceId || getActiveWorkspaceId()
    await this.ensureDirectories(ws)
    const buffer = Buffer.from(base64, 'base64')
    const hash = crypto.createHash('sha256').update(buffer).digest('hex')

    // Infer the mime type from the file extension when the browser didn't
    // provide one (common with .ogg/.m4a/.flac and some video containers).
    const MIME_BY_EXT: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
      '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
      '.flac': 'audio/flac', '.mpga': 'audio/mpeg',
    }
    let effectiveMime = mimeType
    const nameExt = path.extname(fileName || '').toLowerCase()
    if (!effectiveMime || effectiveMime === 'application/octet-stream' || effectiveMime === '') {
      if (MIME_BY_EXT[nameExt]) effectiveMime = MIME_BY_EXT[nameExt]
    }
    const type: AssetType = effectiveMime.startsWith('video/') ? 'video' : effectiveMime.startsWith('audio/') ? 'audio' : 'image'

    // Deduplicate by content within the same workspace: re-importing the same image
    // (e.g. the same dropped reference reused across tasks) reuses the existing asset
    // instead of piling up copies.
    const existing = getRawDb().prepare('SELECT * FROM assets WHERE content_hash = ? AND type = ? AND workspace_id = ? LIMIT 1').get(hash, type, ws) as any
    if (existing) {
      const existingPath = existing.localPath || (existing.filePath && !existing.filePath.startsWith('__error__') && !existing.filePath.startsWith('http') ? existing.filePath : null)
      if (existingPath) {
        try {
          await fs.access(existingPath)
          return { id: existing.id, type, filePath: existing.filePath, fileName: existing.fileName, fileSize: existing.fileSize || buffer.length }
        } catch {}
      }
    }

    const id = crypto.randomUUID()
    const ext = effectiveMime.split('/')[1] || 'bin'
    const destFileName = `${id}.${ext}`
    const destPath = `${this.getSubDir(type, ws)}/${destFileName}`
    await fs.writeFile(destPath, buffer)

    let savedPath = destPath
    let savedMime = effectiveMime
    let savedSize = buffer.length
    if (type === 'image') {
      const res = await ensureImageWebp(destPath, effectiveMime)
      savedPath = res.path
      savedMime = res.mime
      savedSize = res.size
    }

    const raw = getRawDb()
    raw.prepare(
      'INSERT INTO assets (id, type, file_path, file_name, mime_type, model_used, file_size, content_hash, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, type, savedPath, fileName || path.basename(savedPath), savedMime, options?.modelUsed || 'upload', savedSize, hash, ws, Date.now(), Date.now())

    return { id, type, filePath: savedPath, fileName: fileName || path.basename(savedPath), fileSize: savedSize }
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

  updateTags(id: string, tags: string[]) {
    const raw = getRawDb()
    const asset = this.getAsset(id)
    if (!asset) return null
    const tagsStr = tags.length > 0 ? tags.join(',') : null
    raw.prepare('UPDATE assets SET tags = ?, updated_at = ? WHERE id = ?').run(tagsStr, Date.now(), id)
    return this.getAsset(id)
  }

  deleteAssets(ids: string[]): number {
    const raw = getRawDb()
    let count = 0
    for (const id of ids) {
      const asset = this.getAsset(id) as any
      if (!asset) continue
      const localPath = asset.localPath || asset.filePath
      if (localPath && !localPath.startsWith('http') && !localPath.startsWith('__error__')) {
        try { fs.unlink(localPath).catch(() => {}) } catch {}
      }
      raw.prepare('DELETE FROM assets WHERE id = ?').run(id)
      count++
    }
    return count
  }

  archiveAssets(ids: string[], archive = true): number {
    const raw = getRawDb()
    let count = 0
    const now = Date.now()
    const val = archive ? 1 : 0
    for (const id of ids) {
      const res = raw.prepare('UPDATE assets SET is_archived = ?, updated_at = ? WHERE id = ?').run(val, now, id)
      if (res.changes > 0) count++
    }
    return count
  }

  archiveAsset(id: string, archive = true) {
    const raw = getRawDb()
    const val = archive ? 1 : 0
    raw.prepare('UPDATE assets SET is_archived = ?, updated_at = ? WHERE id = ?').run(val, Date.now(), id)
    return this.getAsset(id)
  }

  // Moves assets to another workspace: updates workspace_id and physically
  // relocates local files to the target workspace's asset folder.
  async moveAssetsToWorkspace(ids: string[], targetWorkspaceId: string): Promise<{ moved: number }> {
    const raw = getRawDb()
    let moved = 0
    for (const id of ids) {
      const asset = this.getAsset(id) as any
      if (!asset || !targetWorkspaceId) continue
      if ((asset.workspaceId || getActiveWorkspaceId()) === targetWorkspaceId) continue

      const targetSubDir = workspaceAssetSubDir(asset.type, targetWorkspaceId)
      let newLocalPath: string | null = null
      let newFilePath: string | null = null

      const localPath = asset.localPath || (asset.filePath && !String(asset.filePath).startsWith('http') && !String(asset.filePath).startsWith('__error__') ? asset.filePath : null)
      if (localPath) {
        try {
          await fs.access(localPath)
          const fileName = path.basename(localPath)
          const dest = `${targetSubDir}/${fileName}`
          await fs.mkdir(targetSubDir, { recursive: true })
          await fs.rename(localPath, dest)
          newLocalPath = dest
          // Keep file_path in sync when it was the local path itself
          if (asset.localPath && asset.filePath === asset.localPath) newFilePath = dest
          else if (asset.filePath && !String(asset.filePath).startsWith('http') && !String(asset.filePath).startsWith('__error__')) newFilePath = dest
        } catch (err: any) {
          console.warn('[AssetManager] move file failed, only updating metadata:', err?.message)
        }
      }

      raw.prepare(
        'UPDATE assets SET workspace_id = ?, local_path = COALESCE(?, local_path), file_path = COALESCE(?, file_path), updated_at = ? WHERE id = ?'
      ).run(targetWorkspaceId, newLocalPath, newFilePath, Date.now(), id)
      moved++
    }
    if (moved > 0) raw.save()
    return { moved }
  }

  addTagsMultiple(ids: string[], newTags: string[]): number {
    const raw = getRawDb()
    const cleanNew = newTags.map(t => t.trim().toLowerCase()).filter(Boolean)
    if (cleanNew.length === 0) return 0
    let count = 0
    const now = Date.now()
    for (const id of ids) {
      const asset = this.getAsset(id) as any
      if (!asset) continue
      const existing = asset.tags ? asset.tags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean) : []
      const merged = [...new Set([...existing, ...cleanNew])]
      const tagsStr = merged.length > 0 ? merged.join(',') : null
      raw.prepare('UPDATE assets SET tags = ?, updated_at = ? WHERE id = ?').run(tagsStr, now, id)
      count++
    }
    return count
  }

  async readAssetsBase64(ids: string[]): Promise<{ id: string; base64: string; mime: string }[]> {
    const results: { id: string; base64: string; mime: string }[] = []
    for (const id of ids) {
      const asset = this.getAsset(id) as any
      if (!asset) continue
      const filePath = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') && !asset.filePath.startsWith('http') ? asset.filePath : null)
      if (!filePath) continue
      try {
        const buffer = await fs.readFile(filePath)
        const base64 = buffer.toString('base64')
        results.push({ id, base64, mime: asset.mimeType })
      } catch { continue }
    }
    return results
  }

  // Finds physical files in asset folders that have no matching asset row.
  async scanOrphans(): Promise<{ workspaceId: string; name: string; count: number; files: string[] }[]> {
    const raw = getRawDb()
    const known = new Set<string>()
    const rows = raw.prepare('SELECT file_path, local_path FROM assets').all() as any[]
    for (const r of rows) {
      for (const p of [r.filePath, r.localPath]) {
        if (p && typeof p === 'string' && !p.startsWith('http') && !p.startsWith('__error__')) {
          known.add(path.normalize(p).replace(/\\/g, '/').toLowerCase())
        }
      }
    }
    const result: { workspaceId: string; name: string; count: number; files: string[] }[] = []
    for (const ws of listWorkspaces()) {
      const base = workspaceAssetsDir(ws.id)
      const files: string[] = []
      for (const sub of ['images', 'videos', 'audio']) {
        const dir = path.join(base, sub)
        let entries: string[] = []
        try { entries = await fs.readdir(dir) } catch { continue }
        for (const f of entries) {
          const full = path.join(dir, f)
          const key = full.replace(/\\/g, '/').toLowerCase()
          if (!known.has(key)) files.push(full)
        }
      }
      if (files.length > 0) result.push({ workspaceId: ws.id, name: ws.name, count: files.length, files })
    }
    return result
  }

  // Registers orphan files as assets in-place (no copy). Files are assigned to
  // the workspace that owns the folder they live in. Duplicate content is removed.
  async adoptOrphans(workspaceId?: string): Promise<{ imported: number; skipped: number }> {
    const raw = getRawDb()
    const scans = await this.scanOrphans()
    const list = workspaceId ? scans.filter(s => s.workspaceId === workspaceId) : scans
    const EXT_MIME: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
      '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    }
    const EXT_TYPE: Record<string, AssetType> = {
      '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image',
      '.mp4': 'video', '.webm': 'video', '.mov': 'video',
      '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio',
    }
    let imported = 0
    let skipped = 0
    for (const s of list) {
      for (const file of s.files) {
        const ext = path.extname(file).toLowerCase()
        const mime = EXT_MIME[ext]
        const type = EXT_TYPE[ext]
        if (!mime || !type) { skipped++; continue }
        let stat
        try { stat = await fs.stat(file) } catch { skipped++; continue }
        let hash = ''
        try {
          const buffer = await fs.readFile(file)
          hash = crypto.createHash('sha256').update(buffer).digest('hex')
        } catch {}

        if (hash) {
          const existing = raw.prepare('SELECT id FROM assets WHERE content_hash = ? AND type = ? AND workspace_id = ? LIMIT 1')
            .get(hash, type, s.workspaceId) as any
          if (existing) {
            await fs.unlink(file).catch(() => {})
            skipped++
            continue
          }
        }

        const id = crypto.randomUUID()
        const norm = file.replace(/\\/g, '/')
        const now = Date.now()
        raw.prepare(
          'INSERT INTO assets (id, type, file_path, local_path, file_name, mime_type, model_used, file_size, content_hash, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(id, type, norm, norm, path.basename(norm), mime, 'import', stat.size, hash || null, s.workspaceId, now, now)
        imported++
      }
    }
    if (imported > 0) raw.save()
    return { imported, skipped }
  }

  getStorageStats(workspaceId?: string) {
    const raw = getRawDb()
    const ws = workspaceId || getActiveWorkspaceId()
    const all = raw.prepare('SELECT * FROM assets WHERE workspace_id = ?').all(ws)
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
    const task = raw.prepare('SELECT * FROM openfield_tasks WHERE task_id = ?').get(asset.taskId) as any
    if (!task) {
      console.error(`[refreshAsset] No task found for task_id: ${asset.taskId}`)
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
        "SELECT message FROM run_logs WHERE task_id = ? AND message LIKE 'Task created:%' ORDER BY created_at ASC LIMIT 1"
      ).get(asset.taskId) as any
      if (logRow?.message) {
        const match = logRow.message.match(/Task created:\s*(.+)$/)
        if (match) {
          kieTaskId = match[1]
          console.log(`[refreshAsset] Recovered kieTaskId from logs: ${kieTaskId}`)
          raw.prepare('UPDATE openfield_tasks SET openfield_task_id = ? WHERE task_id = ?').run(kieTaskId, asset.taskId)
        }
      }
    }

    if (!kieTaskId) {
      console.error(`[refreshAsset] No kieTaskId for task: ${asset.taskId}. Status: ${task.status}`)
      raw.prepare('UPDATE assets SET file_path = ?, updated_at = ? WHERE id = ?')
        .run(`__error__:Task never submitted to API (status: ${task.status})`, Date.now(), id)
      return this.getAsset(id)
    }

    try {
      const { OpenfieldApiClient } = require('./kie')
      const apiKey = raw.prepare("SELECT value FROM settings WHERE key = 'openfieldApiKey' OR key = 'kieApiKey' ORDER BY CASE WHEN key = 'openfieldApiKey' THEN 0 ELSE 1 END LIMIT 1").get() as any
      if (!apiKey?.value) throw new Error('No API key configured')
      const key = JSON.parse(apiKey.value)
      const api = new OpenfieldApiClient(key)

      let detail = await api.getTaskDetail(kieTaskId!)
      if (detail.state !== 'success' && detail.state !== 'fail') {
        detail = await api.waitForCompletion(kieTaskId!)
      }

      if (detail.state !== 'success') {
        console.error(`[refreshAsset] Task state is ${detail.state} for ${kieTaskId}`)
        raw.prepare('UPDATE assets SET file_path = ?, updated_at = ? WHERE id = ?')
          .run(`__error__:Task state is ${detail.state}`, Date.now(), id)
        return this.getAsset(id)
      }

      console.log(`[refreshAsset] Task OK, model=${detail.model}, credits=${detail.creditsConsumed}`)

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
      let mime = type === 'image' ? 'image/png' : 'video/mp4'
      const assetWs = asset.workspaceId || getActiveWorkspaceId()
      const subDir = workspaceAssetSubDir(type, assetWs)
      let fileName = `${id}${ext}`
      let localPath = `${subDir}/${fileName}`

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

      // Re-encode video for browser compatibility / convert images to WebP
      let fileSize = buffer.length
      if (type === 'video') {
        try {
          const result = await ensurePlayableVideo(localPath)
          fileSize = result.size
        } catch {}
      } else {
        const res = await ensureImageWebp(localPath, mime)
        localPath = res.path
        mime = res.mime
        fileName = path.basename(res.path)
        fileSize = res.size
      }

      // Backfill assetIds saved at enqueue time (keep disk-backed refs for recreate)
      let storedParams = stripForStorage(taskPayload)
      try {
        if (asset.parameters) {
          const existing = JSON.parse(asset.parameters)
          for (const k of ['imageAssetId', 'firstFrameAssetId', 'lastFrameAssetId']) {
            if (existing[k] && !storedParams[k]) storedParams[k] = existing[k]
          }
          for (const rk of ['imageRefs', 'videoRefs']) {
            if (Array.isArray(existing[rk]) && Array.isArray(storedParams[rk])) {
              for (let i = 0; i < storedParams[rk].length && i < existing[rk].length; i++) {
                if (existing[rk][i]?.assetId && !storedParams[rk][i]?.assetId) storedParams[rk][i].assetId = existing[rk][i].assetId
              }
            }
          }
        }
      } catch {}

      raw.prepare(
        `UPDATE assets SET file_path = ?, local_path = ?, file_name = ?, mime_type = ?, model_used = ?, prompt = ?, parameters = ?, file_size = ?, credits_used = ?, updated_at = ? WHERE id = ?`
      ).run(
        url, localPath, fileName, mime,
        detail.model || taskPayload?.model || '',
        taskPayload?.prompt || '',
        JSON.stringify(storedParams),
        fileSize,
        Math.round(detail.creditsConsumed || 0),
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
    const assetWs = asset.workspaceId || getActiveWorkspaceId()
    const subDir = workspaceAssetSubDir(type, assetWs)
    let fileName = `${id}${ext}`
    let localPath = `${subDir}/${fileName}`

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
    let mime = type === 'image' ? 'image/png' : 'video/mp4'
    if (type === 'video') {
      try {
        const result = await ensurePlayableVideo(localPath)
        fileSize = result.size
      } catch {}
    } else {
      const res = await ensureImageWebp(localPath, mime)
      localPath = res.path
      mime = res.mime
      fileName = path.basename(res.path)
      fileSize = res.size
    }

    raw.prepare('UPDATE assets SET local_path = ?, file_name = ?, mime_type = ?, file_size = ?, updated_at = ? WHERE id = ?')
      .run(localPath, fileName, mime, fileSize, Date.now(), id)

    raw.save()

    return this.getAsset(id)
  }

  getWebpStats() {
    const raw = getRawDb()
    const total = raw.prepare("SELECT count(*) as c FROM assets WHERE type = 'image'").get()?.c || 0
    const pending = raw.prepare("SELECT count(*) as c FROM assets WHERE type = 'image' AND mime_type != 'image/webp'").get()?.c || 0
    return { total, pending }
  }

  async convertAllImagesToWebp(): Promise<{ converted: number; failed: number }> {
    const raw = getRawDb()
    const assets = raw.prepare(
      `SELECT * FROM assets WHERE type = 'image' AND mime_type != 'image/webp'
       AND (local_path IS NOT NULL OR (file_path NOT LIKE 'http%' AND file_path NOT LIKE '__error__%'))`
    ).all() as any[]

    let converted = 0
    let failed = 0
    for (const asset of assets) {
      const filePath = asset.localPath || (asset.filePath && !asset.filePath.startsWith('http') && !asset.filePath.startsWith('__error__') ? asset.filePath : null)
      if (!filePath) continue
      try {
        const res = await ensureImageWebp(filePath, asset.mimeType, true)
        if (res.path !== filePath) {
          const fileName = path.basename(res.path)
          if (asset.localPath) {
            raw.prepare('UPDATE assets SET local_path = ?, file_name = ?, mime_type = ?, file_size = ?, updated_at = ? WHERE id = ?')
              .run(res.path, fileName, res.mime, res.size, Date.now(), asset.id)
          } else {
            raw.prepare('UPDATE assets SET file_path = ?, file_name = ?, mime_type = ?, file_size = ?, updated_at = ? WHERE id = ?')
              .run(res.path, fileName, res.mime, res.size, Date.now(), asset.id)
          }
          converted++
        }
      } catch (err: any) {
        console.warn('[webp] convert-all failed for', asset.fileName, err?.message)
        failed++
      }
    }
    if (converted > 0) raw.save()
    return { converted, failed }
  }

  // Detects broken video assets (missing file, `__error__` marker, or a local file
  // that ffmpeg can't decode) and tries to recover them: transcode with ffmpeg when
  // a file exists, or re-download from the original task when it doesn't.
  async fixBrokenVideos(): Promise<{ checked: number; fixed: number; failed: number; skipped: number; details: string[] }> {
    const raw = getRawDb()
    const rows = raw.prepare("SELECT * FROM assets WHERE type = 'video'").all() as any[]
    const result = { checked: 0, fixed: 0, failed: 0, skipped: 0, details: [] as string[] }

    for (const asset of rows) {
      const isError = String(asset.filePath || '').startsWith('__error__')
      const label = asset.fileName || asset.id

      // Resolve an existing file on disk
      let filePath: string | null = null
      for (const p of [asset.localPath, asset.filePath]) {
        if (p && typeof p === 'string' && !p.startsWith('http') && !p.startsWith('__error__')) {
          try { await fs.access(p); filePath = p; break } catch {}
        }
      }

      if (!filePath) {
        if (asset.taskId) {
          result.checked++
          try {
            await this.refreshAsset(asset.id)
            const after = this.getAsset(asset.id) as any
            if (after?.localPath && !String(after.localPath).startsWith('http') && !String(after.filePath || '').startsWith('__error__')) {
              result.fixed++
              result.details.push(`Recovered from task: ${label}`)
            } else {
              result.failed++
              result.details.push(`No task/file to recover: ${label}`)
            }
          } catch {
            result.failed++
          }
        } else {
          result.skipped++
        }
        continue
      }

      result.checked++
      const playable = await isVideoPlayable(filePath)
      const codec = await getVideoCodec(filePath)
      // Chromium (Electron) only plays H.264 reliably: transcode anything else.
      const needsTranscode = !playable || (codec !== null && codec !== 'h264')
      if (!needsTranscode && !isError) continue

      try {
        let savedPath = filePath
        let savedSize = (await fs.stat(filePath)).size
        if (needsTranscode) {
          await ensurePlayableVideo(filePath)
          if (await isVideoPlayable(filePath)) {
            savedSize = (await fs.stat(filePath)).size
            result.details.push(`Transcoded: ${label}`)
          } else {
            result.failed++
            result.details.push(`Transcode produced unplayable file: ${label}`)
            continue
          }
        } else {
          result.details.push(`Restored: ${label}`)
        }
        raw.prepare(
          'UPDATE assets SET file_path = ?, local_path = ?, file_name = ?, mime_type = ?, file_size = ?, updated_at = ? WHERE id = ?'
        ).run(savedPath, savedPath, path.basename(savedPath), 'video/mp4', savedSize, Date.now(), asset.id)
        result.fixed++
      } catch (err: any) {
        result.failed++
        result.details.push(`Failed: ${label} — ${err?.message || String(err)}`)
      }
    }

    if (result.fixed > 0) raw.save()
    console.log(`[fixBrokenVideos] checked=${result.checked} fixed=${result.fixed} failed=${result.failed} skipped=${result.skipped}`)
    return result
  }

  getBrokenVideoStats() {
    const raw = getRawDb()
    const errored = raw.prepare("SELECT count(*) as c FROM assets WHERE type = 'video' AND file_path LIKE '__error__%'").get()?.c || 0
    const total = raw.prepare("SELECT count(*) as c FROM assets WHERE type = 'video'").get()?.c || 0
    return { errored, total }
  }
}

let assetManagerInstance: AssetManager | null = null

// Whether images should be converted to WebP on save (setting, default ON)
export function saveImagesAsWebp(): boolean {
  try {
    const row = getRawDb().prepare("SELECT value FROM settings WHERE key = 'saveImagesAsWebp'").get() as any
    return row?.value ? JSON.parse(row.value) !== false : true
  } catch { return true }
}

async function convertImageToWebp(inputPath: string): Promise<string | null> {
  try {
    const ffmpegStatic = require('ffmpeg-static')
    const ffmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : (ffmpegStatic?.path || 'ffmpeg')
    const outPath = inputPath.replace(/\.[^.]+$/, '') + '.webp'
    await new Promise<void>((resolve, reject) => {
      const { spawn } = require('child_process')
      const proc = spawn(ffmpegPath, ['-y', '-i', inputPath, '-c:v', 'libwebp', '-quality', '90', outPath])
      proc.on('error', reject)
      proc.on('close', (code: number) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))))
    })
    await fs.unlink(inputPath).catch(() => {})
    return outPath
  } catch (err: any) {
    console.warn('[webp] Conversion failed:', err?.message)
    return null
  }
}

// Converts an image file to WebP when the setting is enabled (or `force` is true) and the
// file isn't already WebP. Returns the (possibly new) path, mime and size.
export async function ensureImageWebp(filePath: string, mimeType: string, force = false): Promise<{ path: string; mime: string; size: number }> {
  if (mimeType?.startsWith('image/') && mimeType !== 'image/webp' && (force || saveImagesAsWebp())) {
    const webpPath = await convertImageToWebp(filePath)
    if (webpPath) {
      const st = await fs.stat(webpPath)
      return { path: webpPath, mime: 'image/webp', size: st.size }
    }
  }
  const st = await fs.stat(filePath)
  return { path: filePath, mime: mimeType, size: st.size }
}

export async function ensurePlayableVideo(inputPath: string): Promise<{ path: string; size: number }> {
  try {
    const ffmpegStatic = require('ffmpeg-static')
    const ffmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : (ffmpegStatic?.path || 'ffmpeg')
    const os = require('os')
    const pathMod = require('path')
    const tmpPath = pathMod.join(os.tmpdir(), `openfield-transcode-${crypto.randomUUID()}.mp4`)
    console.log('[ensurePlayableVideo] Re-encoding to', tmpPath)

    await new Promise<void>((resolve, reject) => {
      const { spawn } = require('child_process')
      const buildArgs = (withAudio: boolean) => [
        '-i', inputPath,
        '-c:v', 'libx264',
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

// Quick playability probe: decodes ~1s of the file with ffmpeg. Exit code 0 means
// the file is structurally decodable (corruption/truncation makes it fail).
async function isVideoPlayable(filePath: string): Promise<boolean> {
  try {
    const ffmpegStatic = require('ffmpeg-static')
    const ffmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : (ffmpegStatic?.path || 'ffmpeg')
    const { spawn } = require('child_process')
    return await new Promise<boolean>((resolve) => {
      let settled = false
      const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok) } }
      try {
        const proc = spawn(ffmpegPath, ['-v', 'error', '-i', filePath, '-t', '1', '-f', 'null', '-'], { windowsHide: true })
        proc.on('error', () => done(false))
        proc.on('close', (code: number) => done(code === 0))
        setTimeout(() => { try { proc.kill() } catch {} done(false) }, 45000)
      } catch { done(false) }
    })
  } catch { return false }
}

// Returns the video codec name (e.g. "h264", "hevc", "av1") or null if unknown.
async function getVideoCodec(filePath: string): Promise<string | null> {
  try {
    const ffmpegStatic = require('ffmpeg-static')
    const ffmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : (ffmpegStatic?.path || 'ffmpeg')
    const { spawnSync } = require('child_process')
    const res = spawnSync(ffmpegPath, ['-i', filePath], { encoding: 'utf8', timeout: 30000, windowsHide: true })
    const m = (res.stderr || '').match(/Video:\s*(\w+)/)
    return m ? m[1].toLowerCase() : null
  } catch { return null }
}

export function getAssetManager(): AssetManager {
  if (!assetManagerInstance) assetManagerInstance = new AssetManager()
  return assetManagerInstance
}
