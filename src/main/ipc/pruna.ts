import type { IpcContext } from './context'
import { readSetting } from './helpers'
import { getPrunaQueue } from '../services/pruna-queue'
import { PRUNA_MODELS } from '../services/pruna'

export function requirePrunaKey(): string {
  const key = readSetting('prunaApiKey')
  if (!key) throw new Error('Pruna API key not configured. Add it in Settings → Providers.')
  return key
}

export function registerPrunaHandlers({ raw, handle }: IpcContext) {
  handle('pruna:generate', async (event, params) => {
    const queue = getPrunaQueue(requirePrunaKey())
    if (!params?.model || typeof params.model !== 'string' || !params.model.trim()) {
      throw new Error('No se especificó un modelo para la generación con Pruna.')
    }
    const taskId = await queue.enqueue(params.type || 'video', params)
    const sender = event.sender

    const cleanup = () => {
      queue.off('task:progress', onProgress)
      queue.off('task:completed', onComplete)
      queue.off('task:failed', onFailed)
    }
    const onProgress = (p: any) => {
      if (p.taskId === taskId) sender.send('pruna:task:progress', p)
    }
    const onComplete = (p: any) => {
      if (p.taskId === taskId) {
        sender.send('pruna:task:completed', p)
        cleanup()
      }
    }
    const onFailed = (p: any) => {
      if (p.taskId === taskId) {
        sender.send('pruna:task:failed', p)
        cleanup()
      }
    }

    queue.on('task:progress', onProgress)
    queue.on('task:completed', onComplete)
    queue.on('task:failed', onFailed)

    return taskId
  })

  handle('pruna:task:status', (_e, taskId: string) => {
    return raw.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId)
  })

  handle('pruna:task:cancel', (_e, taskId: string) => {
    return getPrunaQueue(requirePrunaKey()).cancelTask(taskId)
  })

  handle('pruna:models:list', () => PRUNA_MODELS)
}
