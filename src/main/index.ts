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
import { applyNativeTheme, normalizeTheme, windowBackground } from './services/theme'
import { readSetting } from './ipc/helpers'
import { registerAssetProtocol } from './services/asset-protocol'

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
    // corsEnabled: crossOrigin media (the Timeline keys video frames in WebGL) must pass CORS
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true },
  },
])

async function createWindow() {
  const iconPath = getAppIconPath()
  const appIcon = iconPath ? nativeImage.createFromPath(iconPath) : undefined
  try { applyNativeTheme(normalizeTheme(readSetting('theme'))) } catch {}
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Openfield',
    backgroundColor: windowBackground(),
    show: false,
    // Custom title bar (renderer TitleBar.tsx): hides the native caption and, on Windows/Linux,
    // its min/max/close buttons. macOS keeps the traffic lights, centered in the 36px bar.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 12 } } : {}),
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

  const sendMaximized = () => mainWindow?.webContents.send('window:maximized', mainWindow.isMaximized())
  mainWindow.on('maximize', sendMaximized)
  mainWindow.on('unmaximize', sendMaximized)

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
  registerAssetProtocol()

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
