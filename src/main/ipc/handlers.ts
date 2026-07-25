import { ipcMain, BrowserWindow, shell } from 'electron'
import { getRawDb } from '../db'
import { getAssetManager } from '../services/asset-manager'
import { KieApiClient, IMAGE_MODELS, VIDEO_MODELS } from '../services/kie-api'
import { getTaskQueue } from '../services/task-queue'
import { getFFmpeg } from '../services/ffmpeg'
import * as crypto from 'crypto'
import * as path from 'path'

function readSetting(key: string): any {
  const row = getRawDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
  if (!row || !row.value) return null
  try { return JSON.parse(row.value) } catch { return row.value }
}

function requireApiKey(): string {
  const key = readSetting('kieApiKey')
  if (!key) throw new Error('KIE.ai API key not configured.')
  return key
}

export function registerIpcHandlers() {
  const raw = getRawDb()

  ipcMain.handle('settings:get', (_e, key: string) => readSetting(key))

  ipcMain.handle('settings:set', (_e, key: string, value: any) => {
    raw.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .run(key, JSON.stringify(value), Date.now())
    raw.saveSync()
    return true
  })

  ipcMain.handle('settings:getAll', () => {
    const rows = raw.prepare('SELECT key, value FROM settings').all() as any[]
    const result: Record<string, any> = {}
    for (const row of rows) {
      try { result[row.key] = JSON.parse(row.value) } catch { result[row.key] = row.value }
    }
    return result
  })

  ipcMain.handle('assets:list', (_e, query?: any) => getAssetManager().queryAssets(query || {}))

  ipcMain.handle('assets:get', (_e, id: string) => getAssetManager().getAsset(id))

  ipcMain.handle('assets:delete', (_e, id: string) => getAssetManager().deleteAsset(id))

  ipcMain.handle('assets:toggleFavorite', (_e, id: string) => getAssetManager().toggleFavorite(id))

  ipcMain.handle('assets:updateTags', (_e, id: string, tags: string[]) => getAssetManager().updateTags(id, tags))

  ipcMain.handle('assets:deleteMultiple', (_e, ids: string[]) => getAssetManager().deleteAssets(ids))

  ipcMain.handle('assets:addTagsMultiple', (_e, ids: string[], tags: string[]) => getAssetManager().addTagsMultiple(ids, tags))

  ipcMain.handle('assets:readBase64', async (_e, ids: string[]) => getAssetManager().readAssetsBase64(ids))

  ipcMain.handle('assets:refresh', (_e, id: string) => getAssetManager().refreshAsset(id))

  ipcMain.handle('assets:downloadToLocal', (_e, id: string) => getAssetManager().downloadToLocal(id))

  ipcMain.handle('assets:showInFolder', (_e, id: string) => {
    const asset = getAssetManager().getAsset(id) as any
    if (!asset) return false
    const raw = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') && !asset.filePath.startsWith('http') ? asset.filePath : null)
    if (!raw) return false
    const decoded = raw.includes('%') ? decodeURIComponent(raw) : raw
    const filePath = path.normalize(decoded)
    try {
      shell.showItemInFolder(filePath)
    } catch {
      // Fallback: open parent directory if file doesn't exist
      const dir = path.dirname(filePath)
      shell.openPath(dir)
    }
    return true
  })

  ipcMain.handle('assets:recent', (_e, limit?: number) => getAssetManager().getRecentAssets(limit || 20))

  ipcMain.handle('assets:stats', () => getAssetManager().getStorageStats())

  ipcMain.handle('assets:import', async (_e, filePaths: string[]) => {
    const manager = getAssetManager()
    const results = []
    for (const fp of filePaths) {
      const ext = fp.toLowerCase().split('.').pop() || ''
      const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv']
      const audioExts = ['mp3', 'wav', 'ogg', 'flac']
      let type: 'image' | 'video' | 'audio' = 'image'
      if (videoExts.includes(ext)) type = 'video'
      else if (audioExts.includes(ext)) type = 'audio'
      try { results.push(await manager.importFile(fp, type)) } catch {}
    }
    return results
  })

  ipcMain.handle('kie:generate:image', async (event, params) => {
    const apiKey = requireApiKey()
    const queue = getTaskQueue(apiKey)
    const taskId = await queue.enqueue('image', params)
    const sender = event.sender

    const onProgress = (p: any) => { if (p.taskId === taskId) sender.send('kie:task:progress', p) }
    const onComplete = (p: any) => { if (p.taskId === taskId) sender.send('kie:task:completed', p) }
    const onFailed = (p: any) => { if (p.taskId === taskId) sender.send('kie:task:failed', p) }

    queue.on('task:progress', onProgress)
    queue.on('task:completed', onComplete)
    queue.on('task:failed', onFailed)

    return taskId
  })

  ipcMain.handle('kie:generate:video', async (event, params) => {
    const apiKey = requireApiKey()
    const queue = getTaskQueue(apiKey)
    const taskId = await queue.enqueue('video', params)
    const sender = event.sender

    const onProgress = (p: any) => { if (p.taskId === taskId) sender.send('kie:task:progress', p) }
    const onComplete = (p: any) => { if (p.taskId === taskId) sender.send('kie:task:completed', p) }
    const onFailed = (p: any) => { if (p.taskId === taskId) sender.send('kie:task:failed', p) }

    queue.on('task:progress', onProgress)
    queue.on('task:completed', onComplete)
    queue.on('task:failed', onFailed)

    return taskId
  })

  ipcMain.handle('kie:task:status', async (_e, taskId: string) => {
    return raw.prepare('SELECT * FROM kie_tasks WHERE task_id = ?').get(taskId)
  })

  ipcMain.handle('kie:task:cancel', (_e, taskId: string) => {
    const apiKey = requireApiKey()
    return getTaskQueue(apiKey).cancelTask(taskId)
  })

  ipcMain.handle('kie:task:retry', (_e, taskId: string) => {
    const apiKey = requireApiKey()
    return getTaskQueue(apiKey).retryTask(taskId)
  })

  ipcMain.handle('kie:models:list', () => ({ image: IMAGE_MODELS, video: VIDEO_MODELS }))

  ipcMain.handle('kie:account:info', async () => {
    try {
      const apiKey = requireApiKey()
      const api = new KieApiClient(apiKey)
      return { credits: await api.getAccountCredits() }
    } catch { return { credits: -1 } }
  })

  ipcMain.handle('kie:credit:balance', async () => {
    try {
      const apiKey = requireApiKey()
      return await new KieApiClient(apiKey).getAccountCredits()
    } catch { return -1 }
  })

  ipcMain.handle('kie:cost:estimate', (_e, modelId: string, duration?: number) => {
    try {
      const apiKey = requireApiKey()
      return new KieApiClient(apiKey).getEstimatedCost(modelId, duration)
    } catch { return 0 }
  })

  ipcMain.handle('projects:list', () => {
    return raw.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all()
  })

  ipcMain.handle('projects:get', (_e, id: string) => {
    return raw.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  })

  ipcMain.handle('projects:create', (_e, name: string) => {
    const id = crypto.randomUUID()
    const now = Date.now()
    const timelineData = JSON.stringify({
      tracks: [
        { id: 'track-video-1', type: 'video', clips: [], locked: false, visible: true, muted: false },
        { id: 'track-audio-1', type: 'audio', clips: [], locked: false, visible: true, muted: false },
      ],
      duration: 0, fps: 30, width: 1920, height: 1080,
    })
    raw.prepare('INSERT INTO projects (id, name, timeline_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, name, timelineData, now, now)
    return raw.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  })

  ipcMain.handle('projects:update', (_e, id: string, data: any) => {
    const now = Date.now()
    raw.prepare('UPDATE projects SET name = COALESCE(?, name), timeline_data = COALESCE(?, timeline_data), updated_at = ? WHERE id = ?')
      .run(data.name || null, data.timelineData ? JSON.stringify(data.timelineData) : null, now, id)
    return raw.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  })

  ipcMain.handle('projects:delete', (_e, id: string) => {
    raw.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('ffmpeg:probe', async (_e, filePath: string) => {
    return getFFmpeg().probe(filePath)
  })

  ipcMain.handle('ffmpeg:thumbnail', async (_e, filePath: string, time?: number) => {
    const ffmpeg = getFFmpeg()
    const thumbPath = await ffmpeg.generateThumbnail(filePath, { time })
    const buffer = await require('fs/promises').readFile(thumbPath)
    await ffmpeg.cleanupTemp(thumbPath)
    return buffer.toString('base64')
  })

  ipcMain.handle('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) win.unmaximize(); else win?.maximize()
  })
  ipcMain.handle('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close())
  ipcMain.handle('window:isMaximized', (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() || false)

  ipcMain.handle('tasks:list', () => {
    return raw.prepare('SELECT * FROM kie_tasks ORDER BY created_at DESC').all()
  })

  ipcMain.handle('workflows:list', () => {
    return raw.prepare('SELECT * FROM workflows ORDER BY updated_at DESC').all()
  })

  ipcMain.handle('workflows:create', (_e, data: any) => {
    const id = crypto.randomUUID()
    const now = Date.now()
    raw.prepare('INSERT INTO workflows (id, name, description, nodes, edges, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, data.name, data.description || '', JSON.stringify(data.nodes || []), JSON.stringify(data.edges || []), now, now)
    return raw.prepare('SELECT * FROM workflows WHERE id = ?').get(id)
  })

  ipcMain.handle('workflows:update', (_e, id: string, data: any) => {
    const now = Date.now()
    raw.prepare('UPDATE workflows SET name = COALESCE(?, name), nodes = COALESCE(?, nodes), edges = COALESCE(?, edges), updated_at = ? WHERE id = ?')
      .run(data.name || null, data.nodes ? JSON.stringify(data.nodes) : null, data.edges ? JSON.stringify(data.edges) : null, now, id)
    return raw.prepare('SELECT * FROM workflows WHERE id = ?').get(id)
  })

  ipcMain.handle('workflows:delete', (_e, id: string) => {
    raw.prepare('DELETE FROM workflows WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('logs:list', (_e, taskId?: string) => {
    if (taskId) {
      return raw.prepare('SELECT * FROM run_logs WHERE task_id = ? ORDER BY created_at ASC').all(taskId)
    }
    return raw.prepare('SELECT * FROM run_logs ORDER BY created_at DESC LIMIT 100').all()
  })

  ipcMain.handle('logs:clear', () => {
    raw.prepare('DELETE FROM run_logs').run()
    return true
  })

  ipcMain.handle('app:isDev', () => process.env.NODE_ENV === 'development' || process.argv.includes('--dev'))
}
