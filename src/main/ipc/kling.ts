import type { IpcContext } from './context'
import { readSetting } from './helpers'
import { getKlingQueue } from '../services/kling-queue'
import { KLING_MODELS } from '../services/kling'

export function requireKlingKey(): string {
  const key = readSetting('klingApiKey')
  if (!key) throw new Error('Kling AI API key not configured. Add it in Settings → Providers.')
  return key
}

export function registerKlingHandlers({ raw, handle }: IpcContext) {
  handle('kling:generate', async (event, params) => {
    const queue = getKlingQueue(requireKlingKey())
    if (!params?.model || typeof params.model !== 'string' || !params.model.trim()) {
      throw new Error('No se especificó un modelo para la generación con Kling.')
    }
    const taskId = await queue.enqueue('video', params)
    const sender = event.sender

    const cleanup = () => {
      queue.off('task:progress', onProgress)
      queue.off('task:completed', onComplete)
      queue.off('task:failed', onFailed)
    }
    const onProgress = (p: any) => {
      if (p.taskId === taskId) sender.send('kling:task:progress', p)
    }
    const onComplete = (p: any) => {
      if (p.taskId === taskId) {
        sender.send('kling:task:completed', p)
        cleanup()
      }
    }
    const onFailed = (p: any) => {
      if (p.taskId === taskId) {
        sender.send('kling:task:failed', p)
        cleanup()
      }
    }

    queue.on('task:progress', onProgress)
    queue.on('task:completed', onComplete)
    queue.on('task:failed', onFailed)

    return taskId
  })

  handle('kling:task:status', (_e, taskId: string) => {
    return raw.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId)
  })

  handle('kling:task:cancel', (_e, taskId: string) => {
    return getKlingQueue(requireKlingKey()).cancelTask(taskId)
  })

  handle('kling:models:list', () => KLING_MODELS)
}
