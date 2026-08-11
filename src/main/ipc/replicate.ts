import type { IpcContext } from './context'
import { readSetting } from './helpers'
import { getReplicateQueue } from '../services/replicate-queue'
import { ReplicateApiClient, REPLICATE_MODELS } from '../services/replicate'

export function requireReplicateKey(): string {
  const key = readSetting('replicateApiKey')
  if (!key) throw new Error('Replicate API key not configured. Add it in Settings.')
  return key
}

export function registerReplicateHandlers({ raw, handle }: IpcContext) {
  handle('replicate:generate', async (event, params) => {
    const apiKey = requireReplicateKey()
    const queue = getReplicateQueue(apiKey)
    const taskId = await queue.enqueue('video', params)
    const sender = event.sender

    const cleanup = () => {
      queue.off('task:progress', onProgress)
      queue.off('task:completed', onComplete)
      queue.off('task:failed', onFailed)
    }

    const onProgress = (p: any) => { if (p.taskId === taskId) sender.send('replicate:task:progress', p) }
    const onComplete = (p: any) => { if (p.taskId === taskId) { sender.send('replicate:task:completed', p); cleanup() } }
    const onFailed = (p: any) => { if (p.taskId === taskId) { sender.send('replicate:task:failed', p); cleanup() } }

    queue.on('task:progress', onProgress)
    queue.on('task:completed', onComplete)
    queue.on('task:failed', onFailed)

    return taskId
  })

  handle('replicate:task:status', (_e, taskId: string) => {
    return raw.prepare('SELECT * FROM replicate_tasks WHERE task_id = ?').get(taskId)
  })

  handle('replicate:task:cancel', (_e, taskId: string) => {
    const apiKey = requireReplicateKey()
    return getReplicateQueue(apiKey).cancelTask(taskId)
  })

  handle('replicate:models:list', () => REPLICATE_MODELS)

  handle('replicate:account', async () => {
    try {
      const apiKey = requireReplicateKey()
      return await new ReplicateApiClient(apiKey).getAccount()
    } catch { return null }
  })
}
