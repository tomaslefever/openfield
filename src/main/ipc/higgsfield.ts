import type { IpcContext } from './context'
import { readSetting } from './helpers'
import { getHiggsfieldQueue } from '../services/higgsfield-queue'

export function requireHiggsfieldKey(): string {
  const key = readSetting('higgsfieldApiKey')
  if (!key) throw new Error('Higgsfield API key not configured. Add it in Settings → Providers.')
  return key
}

export function registerHiggsfieldHandlers({ raw, handle }: IpcContext) {
  handle('higgsfield:generate', async (event, params) => {
    const apiKey = requireHiggsfieldKey()
    const queue = getHiggsfieldQueue(apiKey)
    const type = params?.mode === 'image' ? 'image' : 'video'
    const taskId = await queue.enqueue(type, params)
    const sender = event.sender

    const cleanup = () => {
      queue.off('task:progress', onProgress)
      queue.off('task:completed', onComplete)
      queue.off('task:failed', onFailed)
    }

    const onProgress = (p: any) => { if (p.taskId === taskId) sender.send('higgsfield:task:progress', p) }
    const onComplete = (p: any) => { if (p.taskId === taskId) { sender.send('higgsfield:task:completed', p); cleanup() } }
    const onFailed = (p: any) => { if (p.taskId === taskId) { sender.send('higgsfield:task:failed', p); cleanup() } }

    queue.on('task:progress', onProgress)
    queue.on('task:completed', onComplete)
    queue.on('task:failed', onFailed)

    return taskId
  })

  handle('higgsfield:task:status', (_e, taskId: string) => {
    return raw.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) || raw.prepare('SELECT * FROM higgsfield_tasks WHERE task_id = ?').get(taskId)
  })

  handle('higgsfield:task:cancel', (_e, taskId: string) => {
    const apiKey = requireHiggsfieldKey()
    return getHiggsfieldQueue(apiKey).cancelTask(taskId)
  })
}
