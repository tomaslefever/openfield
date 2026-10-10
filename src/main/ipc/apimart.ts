import type { IpcContext } from './context'
import { readSetting } from './helpers'
import { getApimartQueue } from '../services/apimart-queue'
import { APIMART_MODELS, ApimartApiClient, getApimartModel } from '../services/apimart'

export function requireApimartKey(): string {
  const key = readSetting('apimartApiKey')
  if (!key) throw new Error('APIMart API key not configured. Add it in Settings → Providers.')
  return key
}

export function registerApimartHandlers({ raw, handle }: IpcContext) {
  handle('apimart:generate', async (event, params) => {
    const apiKey = requireApimartKey()
    const queue = getApimartQueue(apiKey)
    if (!params?.model || typeof params.model !== 'string' || !params.model.trim()) {
      throw new Error('No se especificó un modelo para la generación con APIMart.')
    }
    const model = getApimartModel(params?.model)
    const isImage =
      params?.type === 'image' ||
      params?.mode === 'image' ||
      model?.type === 'image' ||
      model?.supportedTasks.some((t) => ['T2I', 'I2I'].includes(t))

    const type = params?.type || (params?.mode === 'image' ? 'image' : isImage ? 'image' : 'video')
    const taskId = await queue.enqueue(type, params)
    const sender = event.sender

    const cleanup = () => {
      queue.off('task:progress', onProgress)
      queue.off('task:completed', onComplete)
      queue.off('task:failed', onFailed)
    }

    const onProgress = (p: any) => {
      if (p.taskId === taskId) sender.send('apimart:task:progress', p)
    }
    const onComplete = (p: any) => {
      if (p.taskId === taskId) {
        sender.send('apimart:task:completed', p)
        cleanup()
      }
    }
    const onFailed = (p: any) => {
      if (p.taskId === taskId) {
        sender.send('apimart:task:failed', p)
        cleanup()
      }
    }

    queue.on('task:progress', onProgress)
    queue.on('task:completed', onComplete)
    queue.on('task:failed', onFailed)

    return taskId
  })

  handle('apimart:task:status', (_e, taskId: string) => {
    return raw.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId)
  })

  handle('apimart:task:cancel', (_e, taskId: string) => {
    const apiKey = requireApimartKey()
    return getApimartQueue(apiKey).cancelTask(taskId)
  })

  handle('apimart:models:list', () => APIMART_MODELS)

  handle('apimart:account', async () => {
    const apiKey = requireApimartKey()
    return new ApimartApiClient(apiKey).getBalance()
  })
}
