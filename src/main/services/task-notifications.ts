import { app, BrowserWindow, Notification, nativeImage, type NativeImage } from 'electron'
import { EventEmitter } from 'events'
import * as path from 'path'
import * as fs from 'fs'
import { getRawDb, MAX_GEN_TIME_MS } from '../db'

const attached = new WeakSet<EventEmitter>()

// Openfield logo for toasts. PNG over ICO: Windows toasts render ICO poorly. Loaded once,
// downscaled from the 2048px source. Dev reads from the app dir, packaged from extraResources.
let notificationIcon: NativeImage | null | undefined
function getNotificationIcon(): NativeImage | undefined {
  if (notificationIcon !== undefined) return notificationIcon || undefined
  notificationIcon = null
  const candidates = [
    path.join(app.getAppPath(), 'resources', 'icon.png'),
    path.join(process.resourcesPath, 'resources', 'icon.png'),
  ]
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) {
      notificationIcon = img.resize({ width: 256, height: 256, quality: 'best' })
      break
    }
  }
  return notificationIcon || undefined
}

function windowIsVisible(): boolean {
  const win = BrowserWindow.getAllWindows()[0]
  return !!win && win.isVisible() && win.isFocused()
}

function getAssetType(taskId: string): string | null {
  try {
    const row = getRawDb().prepare('SELECT type, model_used FROM assets WHERE task_id = ? LIMIT 1').get(taskId) as any
    return row?.type || null
  } catch {
    return null
  }
}

/**
 * Only some queues record how long a generation took (KIE, ElevenLabs). For the rest, stamp
 * the wall-clock time from the task's start to its completion on the task's assets, unless
 * the queue already stored one. Runs before the completion broadcast so the refresh sees it.
 */
function stampGenerationTime(taskId: string) {
  if (!taskId) return
  try {
    const raw = getRawDb()
    const task = raw.prepare('SELECT started_at, created_at, completed_at FROM tasks WHERE task_id = ?').get(taskId) as any
    if (!task) return
    const startedAt = Number(task.startedAt ?? task.started_at ?? task.createdAt ?? task.created_at) || 0
    const completedAt = Number(task.completedAt ?? task.completed_at) || Date.now()
    if (!startedAt || completedAt <= startedAt) return
    const ms = completedAt - startedAt
    if (ms > MAX_GEN_TIME_MS) return
    const seconds = Number((ms / 1000).toFixed(1))
    const assets = raw.prepare('SELECT id, parameters FROM assets WHERE task_id = ?').all(taskId) as any[]
    for (const asset of assets) {
      let params: any = {}
      try { params = JSON.parse(asset.parameters || '{}') || {} } catch {}
      if (params.generationTime || params.generationTimeSeconds || params.costTime) continue
      raw.prepare('UPDATE assets SET parameters = ? WHERE id = ?').run(
        JSON.stringify({ ...params, generationTimeSeconds: seconds, generationTimeMs: ms, generationTime: `${seconds}s` }),
        asset.id,
      )
    }
  } catch (err: any) {
    console.warn('[task-notifications] Could not stamp generation time:', err?.message)
  }
}

function typeLabel(type: string | null): string {
  if (type === 'video') return 'Tu video está listo'
  if (type === 'audio') return 'Tu audio está listo'
  return 'Tu imagen está lista'
}

function show(title: string, body: string) {
  if (windowIsVisible()) return
  if (!Notification.isSupported()) return
  const win = BrowserWindow.getAllWindows()[0]
  const notification = new Notification({ title, body, silent: false, icon: getNotificationIcon() })
  notification.on('click', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })
  notification.show()
}

const COMPLETED_CHANNEL: Record<string, string> = {
  Openfield: 'openfield:task:completed',
  Replicate: 'replicate:task:completed',
  'fal.ai': 'fal:task:completed',
  MachGen: 'machgen:task:completed',
  Higgsfield: 'higgsfield:task:completed',
}

const FAILED_CHANNEL: Record<string, string> = {
  Openfield: 'openfield:task:failed',
  Replicate: 'replicate:task:failed',
  'fal.ai': 'fal:task:failed',
  MachGen: 'machgen:task:failed',
  Higgsfield: 'higgsfield:task:failed',
}

// Broadcast task events to every open window so pages refresh their asset lists
// even when the task was created without a renderer origin (e.g. MCP bridge).
function broadcast(channel: string | undefined, payload: any) {
  if (!channel) return
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send(channel, payload) } catch {}
  }
}

export function attachTaskNotifications(queue: EventEmitter, source: string) {
  if (attached.has(queue)) return
  attached.add(queue)

  queue.on('task:completed', (payload: any) => {
    stampGenerationTime(payload?.taskId)
    broadcast(COMPLETED_CHANNEL[source], payload)
    if (source !== 'Openfield') {
      broadcast('openfield:task:completed', payload)
    }
    const type = getAssetType(payload?.taskId)
    show('Generación completada', `${typeLabel(type)} (${source})`)
  })

  queue.on('task:failed', (payload: any) => {
    broadcast(FAILED_CHANNEL[source], payload)
    if (source !== 'Openfield') {
      broadcast('openfield:task:failed', payload)
    }
    if (payload?.error === 'Canceled by user') return
    show('Generación fallida', `${payload?.error || 'La tarea falló'} (${source})`)
  })
}
