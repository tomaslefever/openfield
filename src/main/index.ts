import { app, BrowserWindow, shell, protocol, net, Menu } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { initDatabase, runMigrations, getRawDb } from './db'
import { getAssetManager } from './services/asset-manager'
import { registerIpcHandlers } from './ipc/handlers'
import { runElementsMigration } from './migrations/migrate-elements'
import { repairRecreateRefs } from './migrations/repair-recreate-refs'
import { cleanupRepairDamage } from './migrations/cleanup-repair-damage'
import { recoverRefsFromBackup } from './migrations/recover-refs-from-backup'
import { initTaskQueue } from './services/task-queue'
import { initReplicateQueue } from './services/replicate-queue'
import { initFalQueue } from './services/fal-queue'
import { getServerManager } from './services/local-models/server-manager'
import { getMcpBridge } from './services/mcp'
import { isBridgeEnabled } from './services/storyboard-service'
import { initUpdater, checkForUpdates } from './services/updater'

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev')
let mainWindow: BrowserWindow | null = null

async function createWindow() {
  const iconPath = isDev
    ? path.join(app.getAppPath(), 'resources', 'icon.png')
    : path.join(process.resourcesPath, 'resources', 'icon.png')
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0f0f0f',
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

async function initialize() {
  await initDatabase()
  runMigrations()
  await getAssetManager().ensureDirectories()
  registerIpcHandlers()

  // Migrate base64 elements to assets (one-time)
  try { await runElementsMigration() } catch (err) { console.warn('[Migration] Elements migration failed:', err) }

  // Clean up damage from the buggy repair run (if any), then re-run the corrected repair
  try {
    await cleanupRepairDamage()
  } catch (err) { console.warn('[Migration] Recreate-refs cleanup failed:', err) }
  try {
    const raw = getRawDb()
    const repaired = raw.prepare("SELECT value FROM settings WHERE key = 'repairRecreateRefsV2Done'").get() as any
    if (!repaired) {
      await repairRecreateRefs()
      raw.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('repairRecreateRefsV2Done', '1', ?)").run(Date.now())
      raw.save()
    }
  } catch (err) { console.warn('[Migration] Recreate-refs repair failed:', err) }

  // Recover refs for older assets from the on-disk backup (one-time)
  try {
    const raw = getRawDb()
    const recovered = raw.prepare("SELECT value FROM settings WHERE key = 'refsRecoveredFromBackup'").get() as any
    if (!recovered) {
      await recoverRefsFromBackup()
      raw.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('refsRecoveredFromBackup', '1', ?)").run(Date.now())
      raw.save()
    }
  } catch (err) { console.warn('[Migration] Backup refs recovery failed:', err) }

  // Start local model server if enabled
  try {
    const raw = getRawDb()
    const row = raw.prepare("SELECT value FROM settings WHERE key = 'enableLocalModels'").get() as any
    if (row?.value) {
      const enabled = JSON.parse(row.value)
      if (enabled === true || enabled === 'true') {
        getServerManager().start().catch(err => console.warn('[local-models] Server start failed:', err.message))
      }
    }
  } catch {}

  // Start MCP bridge (local HTTP bridge on port 19877 by default)
  try {
    if (isBridgeEnabled()) {
      getMcpBridge().start().catch(err => console.warn('[MCP Bridge] Start failed:', err.message))
    }
  } catch (err: any) {
    console.warn('[MCP Bridge] Start failed:', err?.message)
  }

  // Recover interrupted tasks
  try {
    const raw = getRawDb()
    const row = raw.prepare("SELECT value FROM settings WHERE key = 'openfieldApiKey' OR key = 'kieApiKey' ORDER BY CASE WHEN key = 'openfieldApiKey' THEN 0 ELSE 1 END LIMIT 1").get() as any
    if (row?.value) {
      const apiKey = JSON.parse(row.value)
      if (apiKey && apiKey.length > 0) {
        const queue = initTaskQueue(apiKey)
        await queue.recoverPendingTasks()
      }
    }
  } catch {}

  // Recover interrupted Replicate predictions
  try {
    const raw = getRawDb()
    const row = raw.prepare("SELECT value FROM settings WHERE key = 'replicateApiKey'").get() as any
    if (row?.value) {
      const apiKey = JSON.parse(row.value)
      if (apiKey && apiKey.length > 0) {
        const queue = initReplicateQueue(apiKey)
        await queue.recoverPendingTasks()
      }
    }
  } catch {}

  // Recover interrupted fal.ai requests
  try {
    const raw = getRawDb()
    const row = raw.prepare("SELECT value FROM settings WHERE key = 'falApiKey'").get() as any
    if (row?.value) {
      const apiKey = JSON.parse(row.value)
      if (apiKey && apiKey.length > 0) {
        const queue = initFalQueue(apiKey)
        await queue.recoverPendingTasks()
      }
    }
  } catch {}
}

app.whenReady().then(async () => {
  // Cache for file reads served over asset:// (thumbnails/grids re-request the same
  // files often). Keyed by path, invalidated via size+mtime so edits are picked up.
  const assetCache = new Map<string, { size: number; mtimeMs: number; buffer: Buffer }>()
  const ASSET_CACHE_MAX = 300

  protocol.handle('asset', async (request) => {
    const decodedUrl = decodeURI(request.url)
    const filePath = decodedUrl.replace(/^asset:\/\/localhost\//, '').replace(/[?#].*$/, '').replace(/\/+$/, '')
    try {
      const stat = fs.statSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.webp': 'image/webp', '.gif': 'image/gif',
        '.mp4': 'video/mp4', '.webm': 'video/webm',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
      }
      const mime = mimeTypes[ext] || 'application/octet-stream'
      const isVideo = ext === '.mp4' || ext === '.webm'

      const rangeHeader = request.headers.get('Range')
      if (rangeHeader && isVideo) {
        const fileSize = stat.size
        const parts = rangeHeader.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
        const chunkSize = end - start + 1

        const buffer = Buffer.alloc(chunkSize)
        const fd = fs.openSync(filePath, 'r')
        fs.readSync(fd, buffer, 0, chunkSize, start)
        fs.closeSync(fd)

        return new Response(buffer, {
          status: 206,
          headers: {
            'Content-Type': mime,
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': String(chunkSize),
            'Accept-Ranges': 'bytes',
          },
        })
      }

      const cached = assetCache.get(filePath)
      let data: Buffer
      if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
        data = cached.buffer
      } else {
        data = await fs.promises.readFile(filePath)
        assetCache.set(filePath, { size: stat.size, mtimeMs: stat.mtimeMs, buffer: data })
        if (assetCache.size > ASSET_CACHE_MAX) {
          const oldestKey = assetCache.keys().next().value
          if (oldestKey) assetCache.delete(oldestKey)
        }
      }
      const headers: Record<string, string> = {
        'Content-Type': mime,
        'Content-Length': String(stat.size),
      }
      if (isVideo) headers['Accept-Ranges'] = 'bytes'
      return new Response(data as unknown as BodyInit, { headers })
    } catch (err: any) {
      console.error('[asset] 404:', filePath, err.message)
      return new Response(null, { status: 404 })
    }
  })

  Menu.setApplicationMenu(null)

  await initialize()
  await createWindow()

  initUpdater()
  if (app.isPackaged) {
    setTimeout(() => { checkForUpdates().catch(() => {}) }, 10000)
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  try { getServerManager().stop() } catch {}
  try { getMcpBridge().stop() } catch {}
  try { getRawDb().saveSync() } catch {}
})
