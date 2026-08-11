import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import * as path from 'path'

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

let initialized = false
let downloadedUpdate = false

function emit(channel: string, payload?: any) {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload)
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

  autoUpdater.on('checking-for-update', () => emit('update:status', { state: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    emit('update:status', { state: 'available', version: info.version })
    autoUpdater.downloadUpdate().catch((err: any) => {
      emit('update:status', { state: 'error', message: err?.message || String(err) })
    })
  })
  autoUpdater.on('update-not-available', () => emit('update:status', { state: 'not-available' }))
  autoUpdater.on('error', (err) => emit('update:status', { state: 'error', message: err?.message || String(err) }))
  autoUpdater.on('download-progress', (p) => emit('update:progress', { percent: p.percent, transferred: p.transferred, total: p.total, bytesPerSecond: p.bytesPerSecond }))
  autoUpdater.on('update-downloaded', (info) => {
    downloadedUpdate = true
    emit('update:status', { state: 'downloaded', version: info.version })
  })
}

export async function checkForUpdates(): Promise<{ state: string; version?: string; message?: string }> {
  if (!app.isPackaged) {
    return { state: 'error', message: 'Updates are only available in the packaged app.' }
  }
  if (downloadedUpdate) {
    return { state: 'downloaded', version: autoUpdater.currentVersion?.version }
  }
  try {
    await autoUpdater.checkForUpdates()
    return { state: 'checking' }
  } catch (err: any) {
    return { state: 'error', message: err?.message || String(err) }
  }
}

export function downloadUpdate() {
  if (downloadedUpdate) return
  autoUpdater.downloadUpdate().catch((err: any) => {
    emit('update:status', { state: 'error', message: err?.message || String(err) })
  })
}

export function quitAndInstall() {
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
}

export function getUpdateState() {
  return {
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    updateAvailable: downloadedUpdate,
    feedUrl: app.isPackaged ? autoUpdater.getFeedURL() : null,
    exePath: process.platform === 'win32' && app.isPackaged ? path.join(process.resourcesPath, '..') : null,
  }
}
