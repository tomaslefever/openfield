import type { IpcContext } from './context'
import { requireApiKey } from './helpers'
import { OpenfieldApiClient, IMAGE_MODELS, VIDEO_MODELS, AUDIO_MODELS } from '../services/kie'
import { getTaskQueue } from '../services/task-queue'

export function registerOpenfieldHandlers({ raw, handle }: IpcContext) {
  const ensureKieModel = (params: any) => {
    if (params?.model?.startsWith('prunaai/')) {
      throw new Error('This model runs on Replicate, not KIE.ai. Use the Replicate queue.')
    }
    if (params?.model?.startsWith('minimax/')) {
      throw new Error('This model runs on fal.ai, not KIE.ai. Use the fal.ai queue.')
    }
    return params
  }

  handle('openfield:generate:image', async (event, params) => {
    const apiKey = requireApiKey()
    const queue = getTaskQueue(apiKey)
    const taskId = await queue.enqueue('image', ensureKieModel(params))
    const sender = event.sender

    const cleanup = () => {
      queue.off('task:progress', onProgress)
      queue.off('task:completed', onComplete)
      queue.off('task:failed', onFailed)
    }

    const onProgress = (p: any) => { if (p.taskId === taskId) sender.send('openfield:task:progress', p) }
    const onComplete = (p: any) => { if (p.taskId === taskId) { sender.send('openfield:task:completed', p); cleanup() } }
    const onFailed = (p: any) => { if (p.taskId === taskId) { sender.send('openfield:task:failed', p); cleanup() } }

    queue.on('task:progress', onProgress)
    queue.on('task:completed', onComplete)
    queue.on('task:failed', onFailed)

    return taskId
  })

  handle('openfield:generate:video', async (event, params) => {
    const apiKey = requireApiKey()
    const queue = getTaskQueue(apiKey)
    const taskId = await queue.enqueue('video', ensureKieModel(params))
    const sender = event.sender

    const cleanup = () => {
      queue.off('task:progress', onProgress)
      queue.off('task:completed', onComplete)
      queue.off('task:failed', onFailed)
    }

    const onProgress = (p: any) => { if (p.taskId === taskId) sender.send('openfield:task:progress', p) }
    const onComplete = (p: any) => { if (p.taskId === taskId) { sender.send('openfield:task:completed', p); cleanup() } }
    const onFailed = (p: any) => { if (p.taskId === taskId) { sender.send('openfield:task:failed', p); cleanup() } }

    queue.on('task:progress', onProgress)
    queue.on('task:completed', onComplete)
    queue.on('task:failed', onFailed)

    return taskId
  })

  handle('openfield:generate:audio', async (event, params) => {
    const apiKey = requireApiKey()
    const queue = getTaskQueue(apiKey)
    const taskId = await queue.enqueue('audio', params)
    const sender = event.sender

    const cleanup = () => {
      queue.off('task:progress', onProgress)
      queue.off('task:completed', onComplete)
      queue.off('task:failed', onFailed)
    }

    const onProgress = (p: any) => { if (p.taskId === taskId) sender.send('openfield:task:progress', p) }
    const onComplete = (p: any) => { if (p.taskId === taskId) { sender.send('openfield:task:completed', p); cleanup() } }
    const onFailed = (p: any) => { if (p.taskId === taskId) { sender.send('openfield:task:failed', p); cleanup() } }

    queue.on('task:progress', onProgress)
    queue.on('task:completed', onComplete)
    queue.on('task:failed', onFailed)

    return taskId
  })

  handle('openfield:task:status', async (_e, taskId: string) => {
    return raw.prepare('SELECT * FROM openfield_tasks WHERE task_id = ?').get(taskId)
  })

  handle('openfield:task:cancel', (_e, taskId: string) => {
    const apiKey = requireApiKey()
    return getTaskQueue(apiKey).cancelTask(taskId)
  })

  handle('openfield:task:retry', (_e, taskId: string) => {
    const apiKey = requireApiKey()
    return getTaskQueue(apiKey).retryTask(taskId)
  })

  handle('openfield:models:list', () => ({ image: IMAGE_MODELS, video: VIDEO_MODELS, audio: AUDIO_MODELS }))

  handle('openfield:account:info', async () => {
    try {
      const apiKey = requireApiKey()
      const api = new OpenfieldApiClient(apiKey)
      return { credits: await api.getAccountCredits() }
    } catch { return { credits: -1 } }
  })

  handle('openfield:credit:balance', async () => {
    try {
      const apiKey = requireApiKey()
      return await new OpenfieldApiClient(apiKey).getAccountCredits()
    } catch { return -1 }
  })

  handle('openfield:cost:estimate', (_e, modelId: string, duration?: number) => {
    try {
      const apiKey = requireApiKey()
      return new OpenfieldApiClient(apiKey).getEstimatedCost(modelId, duration)
    } catch { return 0 }
  })
}
