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
    return queue.enqueue('image', ensureKieModel(params))
  })

  handle('openfield:generate:video', async (event, params) => {
    const apiKey = requireApiKey()
    const queue = getTaskQueue(apiKey)
    return queue.enqueue('video', ensureKieModel(params))
  })

  handle('openfield:generate:audio', async (event, params) => {
    const apiKey = requireApiKey()
    const queue = getTaskQueue(apiKey)
    return queue.enqueue('audio', params)
  })

  // Grok Upscale: re-runs a completed KIE video task through grok-imagine/upscale.
  // The KIE task id (openfield_task_id) of the source asset is passed to the API.
  handle('openfield:upscale:video', async (event, assetId: string, resolution?: string) => {
    const asset = raw.prepare('SELECT * FROM assets WHERE id = ?').get(assetId) as any
    if (!asset) throw new Error('Asset not found')
    if (asset.type !== 'video') throw new Error('Only video assets can be upscaled')
    if (!asset.taskId) throw new Error('Source video has no generation task')
    const sourceTask = raw.prepare('SELECT * FROM openfield_tasks WHERE task_id = ?').get(asset.taskId) as any
    let kieTaskId: string | null = sourceTask?.openfieldTaskId || sourceTask?.kieTaskId || null
    if (!kieTaskId && sourceTask?.payload) {
      try {
        const p = JSON.parse(sourceTask.payload)
        kieTaskId = p?.kieTaskId || null
      } catch {}
    }
    // Fallback: recover the KIE task id from run_logs for assets generated before openfield_task_id existed
    if (!kieTaskId) {
      const logRow = raw.prepare(
        "SELECT message FROM run_logs WHERE task_id = ? AND message LIKE 'Task created:%' ORDER BY created_at ASC LIMIT 1"
      ).get(asset.taskId) as any
      const match = logRow?.message?.match(/Task created:\s*(.+)$/)
      if (match) kieTaskId = match[1]
    }
    if (!kieTaskId) throw new Error('Source video was not generated via KIE.ai')
    if (sourceTask?.status !== 'completed') throw new Error('Source video task is not completed yet')
    // grok-imagine/upscale only accepts videos generated with grok-imagine models
    let sourceModel = ''
    try {
      const p = typeof sourceTask.payload === 'string' ? JSON.parse(sourceTask.payload) : (sourceTask.payload || {})
      sourceModel = p.model || ''
    } catch {}
    if (!sourceModel.startsWith('grok-imagine')) {
      throw new Error('Upscale only works on videos generated with Grok Imagine')
    }

    const apiKey = requireApiKey()
    const queue = getTaskQueue(apiKey)
    return queue.enqueue('video', {
      model: 'grok-imagine/upscale',
      taskId: kieTaskId,
      resolution: resolution === '720p' ? '720p' : '1080p',
      prompt: asset.prompt ? `Upscale: ${asset.prompt}` : 'Video upscale',
      upscaleSourceAssetId: assetId,
    })
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
