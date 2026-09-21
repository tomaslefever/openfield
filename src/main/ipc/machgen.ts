import type { IpcContext } from './context'
import { readSetting } from './helpers'
import { getMachgenQueue } from '../services/machgen-queue'
import { MACHGEN_MODELS, MachgenApiClient, getMachgenModel } from '../services/machgen'

export function requireMachgenKey(): string {
  const key = readSetting('machgenApiKey')
  if (!key) throw new Error('MachGen API key not configured. Add it in Settings → Providers.')
  return key
}

export function registerMachgenHandlers({ raw, handle }: IpcContext) {
  handle('machgen:generate', async (event, params) => {
    const apiKey = requireMachgenKey()
    const queue = getMachgenQueue(apiKey)
    const model = getMachgenModel(params?.model)
    const isAudio =
      params?.type === 'audio' ||
      params?.kind === 'music' ||
      params?.kind === 'voice' ||
      params?.kind === 'sfx' ||
      model?.supportedTasks.some(t => ['T2S', 'T2D', 'T2SFX', 'T2M'].includes(t)) ||
      params?.model?.includes('Eleven-') ||
      params?.model?.includes('speech') ||
      params?.model?.includes('audio')
    const isImage =
      params?.type === 'image' ||
      model?.supportedTasks.some(t => ['T2I', 'I2I'].includes(t)) ||
      (model && !model.supportedTasks.some(t => ['T2V', 'I2V', 'R2V'].includes(t)) && !isAudio)
    const type = params?.type || (isAudio ? 'audio' : isImage ? 'image' : 'video')
    const taskId = await queue.enqueue(type, params)
    const sender = event.sender

    const cleanup = () => {
      queue.off('task:progress', onProgress)
      queue.off('task:completed', onComplete)
      queue.off('task:failed', onFailed)
    }

    const onProgress = (p: any) => { if (p.taskId === taskId) sender.send('machgen:task:progress', p) }
    const onComplete = (p: any) => { if (p.taskId === taskId) { sender.send('machgen:task:completed', p); cleanup() } }
    const onFailed = (p: any) => { if (p.taskId === taskId) { sender.send('machgen:task:failed', p); cleanup() } }

    queue.on('task:progress', onProgress)
    queue.on('task:completed', onComplete)
    queue.on('task:failed', onFailed)

    return taskId
  })

  handle('machgen:task:status', (_e, taskId: string) => {
    return raw.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) || raw.prepare('SELECT * FROM machgen_tasks WHERE task_id = ?').get(taskId)
  })

  handle('machgen:task:cancel', (_e, taskId: string) => {
    const apiKey = requireMachgenKey()
    return getMachgenQueue(apiKey).cancelTask(taskId)
  })

  handle('machgen:models:list', () => MACHGEN_MODELS)

  handle('machgen:account', async () => {
    const apiKey = requireMachgenKey()
    return new MachgenApiClient(apiKey).getAccount()
  })
}
