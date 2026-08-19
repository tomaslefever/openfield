import type { IpcContext } from './context'
import { readSetting } from './helpers'
import { getFalQueue } from '../services/fal-queue'
import { FAL_MODELS, getFalModel } from '../services/fal'

export function requireFalKey(): string {
  const key = readSetting('falApiKey')
  if (!key) throw new Error('fal.ai API key not configured. Add it in Settings.')
  return key
}

export function registerFalHandlers({ raw, handle }: IpcContext) {
  handle('fal:generate', async (event, params) => {
    const apiKey = requireFalKey()
    const queue = getFalQueue(apiKey)
    const model = getFalModel(params?.model)
    const type = model?.type === 'image' ? 'image' : 'video'
    const taskId = await queue.enqueue(type, params)
    const sender = event.sender

    const cleanup = () => {
      queue.off('task:progress', onProgress)
      queue.off('task:completed', onComplete)
      queue.off('task:failed', onFailed)
    }

    const onProgress = (p: any) => { if (p.taskId === taskId) sender.send('fal:task:progress', p) }
    const onComplete = (p: any) => { if (p.taskId === taskId) { sender.send('fal:task:completed', p); cleanup() } }
    const onFailed = (p: any) => { if (p.taskId === taskId) { sender.send('fal:task:failed', p); cleanup() } }

    queue.on('task:progress', onProgress)
    queue.on('task:completed', onComplete)
    queue.on('task:failed', onFailed)

    return taskId
  })

  handle('fal:task:status', (_e, taskId: string) => {
    return raw.prepare('SELECT * FROM fal_tasks WHERE task_id = ?').get(taskId)
  })

  handle('fal:task:cancel', (_e, taskId: string) => {
    const apiKey = requireFalKey()
    return getFalQueue(apiKey).cancelTask(taskId)
  })

  handle('fal:models:list', () => FAL_MODELS)
}
