import { app, BrowserWindow, shell, protocol, net, Menu, nativeImage } from 'electron'
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
import { getMcpBridge } from './services/mcp'
import { isBridgeEnabled } from './services/storyboard-service'
import { initUpdater, checkForUpdates } from './services/updater'

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev')
let mainWindow: BrowserWindow | null = null

function getAppIconPath() {
  const isWin = process.platform === 'win32'
  const preferredFile = isWin ? 'icon.ico' : 'icon.png'

  const candidates = [
    path.join(app.getAppPath(), 'resources', preferredFile),
    path.join(process.resourcesPath, 'resources', preferredFile),
    path.join(app.getAppPath(), 'resources', 'icon.ico'),
    path.join(app.getAppPath(), 'resources', 'icon.png'),
    path.join(process.resourcesPath, 'resources', 'icon.ico'),
    path.join(process.resourcesPath, 'resources', 'icon.png'),
  ]

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return undefined
}

// Must run before app is ready: registers asset:// as a privileged scheme so
// Chromium allows <video>/<audio> elements to stream from it (otherwise media
// is rejected with "Media load rejected by URL safety check").
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
])

async function createWindow() {
  const iconPath = getAppIconPath()
  const appIcon = iconPath ? nativeImage.createFromPath(iconPath) : undefined
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Openfield',
    backgroundColor: '#0f0f0f',
    show: false,
    icon: appIcon && !appIcon.isEmpty() ? appIcon : iconPath,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (appIcon && !appIcon.isEmpty()) {
    mainWindow.setIcon(appIcon)
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    await mainWindow.loadURL('http://127.0.0.1:5173')
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
  // Windows: register AUMID so window icon and notifications group correctly
  if (process.platform === 'win32') {
    app.setAppUserModelId(app.isPackaged ? 'com.openfield.desktop' : process.execPath)
  }
  // Cache for file reads served over asset:// (thumbnails/grids re-request the same
  // files often). Keyed by path, invalidated via size+mtime so edits are picked up.
  const assetCache = new Map<string, { size: number; mtimeMs: number; buffer: Buffer }>()
  const thumbCache = new Map<string, { size: number; mtimeMs: number; buffer: Buffer }>()
  const ASSET_CACHE_MAX = 500

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
      const stat = fs.statSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.webp': 'image/webp', '.gif': 'image/gif',
        '.mp4': 'video/mp4', '.webm': 'video/webm',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
        '.opus': 'audio/opus',
      }
      const mime = mimeTypes[ext] || 'application/octet-stream'
      const isMedia = ext === '.mp4' || ext === '.webm' || ext === '.mp3' || ext === '.wav' || ext === '.ogg' || ext === '.m4a' || ext === '.aac' || ext === '.flac' || ext === '.opus'
      const isImage = ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp'

      // Downscaled rendering for grid thumbnails
      if (isThumb && isImage && scale < 1.0) {
        const thumbKey = `${filePath}:${scale}`
        const cachedThumb = thumbCache.get(thumbKey)
        if (cachedThumb && cachedThumb.mtimeMs === stat.mtimeMs) {
          return new Response(cachedThumb.buffer as unknown as BodyInit, {
            headers: {
              'Content-Type': 'image/jpeg',
              'Content-Length': String(cachedThumb.buffer.length),
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }

        try {
          const img = nativeImage.createFromPath(filePath)
          if (!img.isEmpty()) {
            const origSize = img.getSize()
            const targetW = Math.max(64, Math.round(origSize.width * scale))
            const targetH = Math.max(64, Math.round(origSize.height * scale))
            const resized = img.resize({ width: targetW, height: targetH, quality: 'good' })
            const thumbBuffer = resized.toJPEG(82)

            thumbCache.set(thumbKey, {
              size: thumbBuffer.length,
              mtimeMs: stat.mtimeMs,
              buffer: thumbBuffer,
            })
            if (thumbCache.size > ASSET_CACHE_MAX) {
              const oldestKey = thumbCache.keys().next().value
              if (oldestKey) thumbCache.delete(oldestKey)
            }

            return new Response(thumbBuffer as unknown as BodyInit, {
              headers: {
                'Content-Type': 'image/jpeg',
                'Content-Length': String(thumbBuffer.length),
                'Cache-Control': 'public, max-age=86400',
              },
            })
          }
        } catch (thumbErr) {
          console.warn('[asset:thumb] Downscale fallback:', thumbErr)
        }
      }

      const rangeHeader = request.headers.get('Range') || request.headers.get('range')
      if (rangeHeader && isMedia) {
        const fileSize = stat.size
        const parts = rangeHeader.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
        const chunkSize = Math.max(0, end - start + 1)

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

      const cached = !isMedia ? assetCache.get(filePath) : undefined
      let data: Buffer
      if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
        data = cached.buffer
      } else {
        data = await fs.promises.readFile(filePath)
        if (!isMedia) {
          assetCache.set(filePath, { size: stat.size, mtimeMs: stat.mtimeMs, buffer: data })
          if (assetCache.size > ASSET_CACHE_MAX) {
            const oldestKey = assetCache.keys().next().value
            if (oldestKey) assetCache.delete(oldestKey)
          }
        }
      }
      const headers: Record<string, string> = {
        'Content-Type': mime,
        'Content-Length': String(stat.size),
      }
      if (isMedia) headers['Accept-Ranges'] = 'bytes'
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
  try { getMcpBridge().stop() } catch {}
  try { getRawDb().saveSync() } catch {}
})
