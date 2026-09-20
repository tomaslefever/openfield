import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import * as path from 'path'

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

let initialized = false
let downloadedUpdate = false
let updateStatus: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' = 'idle'
let updateVersion: string | null = null
let updateError: string | null = null

function emit(channel: string, payload?: any) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

export function initUpdater() {
  if (initialized || !app.isPackaged) return
  initialized = true

  autoUpdater.logger = {
    info: (m?: any) => console.log('[updater]', m),
    warn: (m?: any) => console.warn('[updater]', m),
    error: (m?: any) => console.error('[updater]', m),
    debug: (m?: any) => console.log('[updater]', m),
  }

  autoUpdater.on('checking-for-update', () => {
    updateStatus = 'checking'
    emit('update:status', { state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    updateStatus = 'available'
    updateVersion = info.version
    emit('update:status', { state: 'available', version: info.version })
    autoUpdater.downloadUpdate().catch((err: any) => {
      updateStatus = 'error'
      updateError = err?.message || String(err)
      emit('update:status', { state: 'error', message: err?.message || String(err) })
    })
  })

  autoUpdater.on('update-not-available', () => {
    updateStatus = 'idle'
    emit('update:status', { state: 'not-available' })
  })

  autoUpdater.on('error', (err) => {
    updateStatus = 'error'
    updateError = err?.message || String(err)
    emit('update:status', { state: 'error', message: err?.message || String(err) })
  })

  autoUpdater.on('download-progress', (p) => {
    updateStatus = 'downloading'
    emit('update:progress', { percent: p.percent, transferred: p.transferred, total: p.total, bytesPerSecond: p.bytesPerSecond })
  })

  autoUpdater.on('update-downloaded', (info) => {
    downloadedUpdate = true
    updateStatus = 'downloaded'
    updateVersion = info.version
    emit('update:status', { state: 'downloaded', version: info.version })
  })
}

export async function checkForUpdates(): Promise<{ state: string; version?: string; message?: string }> {
  if (!app.isPackaged) {
    return { state: 'error', message: 'Updates are only available in the packaged app.' }
  }
  if (!initialized) {
    initUpdater()
  }
  if (downloadedUpdate) {
    return { state: 'downloaded', version: updateVersion || autoUpdater.currentVersion?.version }
  }
  try {
    updateStatus = 'checking'
    emit('update:status', { state: 'checking' })
    await autoUpdater.checkForUpdates()
    return { state: 'checking', version: updateVersion || undefined }
  } catch (err: any) {
    updateStatus = 'error'
    updateError = err?.message || String(err)
    return { state: 'error', message: err?.message || String(err) }
  }
}

export function downloadUpdate() {
  if (downloadedUpdate) return
  autoUpdater.downloadUpdate().catch((err: any) => {
    updateStatus = 'error'
    updateError = err?.message || String(err)
    emit('update:status', { state: 'error', message: err?.message || String(err) })
  })
}

export function quitAndInstall() {
  if (!app.isPackaged) {
    console.log('[updater] Dev mode: relaunching application...')
    app.relaunch()
    app.exit(0)
    return
  }
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
}

export function getUpdateState() {
  return {
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    updateAvailable: downloadedUpdate || updateStatus === 'available' || updateStatus === 'downloading' || updateStatus === 'downloaded',
    downloadedUpdate,
    status: updateStatus,
    version: updateVersion,
    error: updateError,
    feedUrl: app.isPackaged ? autoUpdater.getFeedURL() : null,
    exePath: process.platform === 'win32' && app.isPackaged ? path.join(process.resourcesPath, '..') : null,
  }
}
