import { app, BrowserWindow, shell, protocol, net } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { initDatabase, runMigrations, getRawDb } from './db'
import { getAssetManager } from './services/asset-manager'
import { registerIpcHandlers } from './ipc/handlers'
import { initTaskQueue } from './services/task-queue'

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev')
let mainWindow: BrowserWindow | null = null

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0f0f0f',
    show: false,
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

  // Recover interrupted tasks
  try {
    const raw = getRawDb()
    const row = raw.prepare("SELECT value FROM settings WHERE key = 'kieApiKey'").get() as any
    if (row?.value) {
      const apiKey = JSON.parse(row.value)
      if (apiKey && apiKey.length > 0) {
        const queue = initTaskQueue(apiKey)
        await queue.recoverPendingTasks()
      }
    }
  } catch {}
}

app.whenReady().then(async () => {
  protocol.handle('asset', (request) => {
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

      const data = fs.readFileSync(filePath)
      const headers: Record<string, string> = {
        'Content-Type': mime,
        'Content-Length': String(stat.size),
      }
      if (isVideo) headers['Accept-Ranges'] = 'bytes'
      return new Response(data, { headers })
    } catch (err: any) {
      console.error('[asset] 404:', filePath, err.message)
      return new Response(null, { status: 404 })
    }
  })

  await initialize()
  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  try { getRawDb().save() } catch {}
})
