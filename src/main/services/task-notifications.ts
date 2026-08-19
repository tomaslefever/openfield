import { BrowserWindow, Notification } from 'electron'
import { EventEmitter } from 'events'
import { getRawDb } from '../db'

const attached = new WeakSet<EventEmitter>()

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

function typeLabel(type: string | null): string {
  if (type === 'video') return 'Tu video está listo'
  if (type === 'audio') return 'Tu audio está listo'
  return 'Tu imagen está lista'
}

function show(title: string, body: string) {
  if (windowIsVisible()) return
  if (!Notification.isSupported()) return
  const win = BrowserWindow.getAllWindows()[0]
  const notification = new Notification({ title, body, silent: false })
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
}

const FAILED_CHANNEL: Record<string, string> = {
  Openfield: 'openfield:task:failed',
  Replicate: 'replicate:task:failed',
  'fal.ai': 'fal:task:failed',
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
    broadcast(COMPLETED_CHANNEL[source], payload)
    const type = getAssetType(payload?.taskId)
    show('Generación completada', `${typeLabel(type)} (${source})`)
  })

  queue.on('task:failed', (payload: any) => {
    broadcast(FAILED_CHANNEL[source], payload)
    if (payload?.error === 'Canceled by user') return
    show('Generación fallida', `${payload?.error || 'La tarea falló'} (${source})`)
  })
}
