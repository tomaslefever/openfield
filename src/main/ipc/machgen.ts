import type { IpcContext } from './context'
import { readSetting } from './helpers'
import { getMachgenQueue, updateDraftAssetParams } from '../services/machgen-queue'
import { MACHGEN_MODELS, MachgenApiClient, getMachgenModel } from '../services/machgen'

export function requireMachgenKey(): string {
  const key = readSetting('machgenApiKey')
  if (!key) throw new Error('MachGen API key not configured. Add it in Settings → Providers.')
  return key
}

export function registerMachgenHandlers({ raw, handle }: IpcContext) {
  const enqueueGeneration = async (event: any, params: any) => {
    const apiKey = requireMachgenKey()
    const queue = getMachgenQueue(apiKey)
    if (!params?.model || typeof params.model !== 'string' || !params.model.trim()) {
      throw new Error('No se especificó un modelo para la generación con MachGen.')
    }
    const model = getMachgenModel(params?.model)
    const isAudio =
      params?.type === 'audio' ||
      params?.mode === 'audio' ||
      params?.kind === 'music' ||
      params?.kind === 'voice' ||
      params?.kind === 'sfx' ||
      model?.supportedTasks.some(t => ['T2S', 'T2D', 'T2SFX', 'T2M'].includes(t)) ||
      params?.model?.includes('Eleven-') ||
      params?.model?.includes('speech') ||
      params?.model?.includes('audio')
    const isImage =
      params?.type === 'image' ||
      params?.mode === 'image' ||
      model?.supportedTasks.some(t => ['T2I', 'I2I'].includes(t)) ||
      (model && !model.supportedTasks.some(t => ['T2V', 'I2V', 'R2V'].includes(t)) && !isAudio)
    const type = params?.type || (params?.mode === 'image' ? 'image' : params?.mode === 'audio' ? 'audio' : isAudio ? 'audio' : isImage ? 'image' : 'video')
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
  }

  handle('machgen:generate', (event, params) => enqueueGeneration(event, params))

  // Rebuild each draft's final flags from its finals, oldest first so the latest one wins:
  // completed → linked, failed/cancelled → released (retryable), in progress → locked. Idempotent;
  // also fixes drafts finalized before finals were tracked.
  try {
    const finals = raw.prepare(`SELECT task_id, status, result_asset_id, error_message, payload FROM tasks WHERE provider = 'machgen' AND payload LIKE '%"draftSourceTaskId":"%' ORDER BY created_at ASC`).all() as any[]
    for (const f of finals) {
      let src: string | undefined
      try { src = JSON.parse(f.payload || '{}').draftSourceTaskId } catch {}
      if (!src) continue
      if (f.status === 'completed' && f.resultAssetId) {
        updateDraftAssetParams(src, { draftFinalTaskId: f.taskId, draftFinalAssetId: f.resultAssetId, draftFinalError: null })
      } else if (f.status === 'failed' || f.status === 'cancelled') {
        updateDraftAssetParams(src, { draftFinalTaskId: null, draftFinalAssetId: null, draftFinalError: f.errorMessage || 'Final failed' })
      } else {
        updateDraftAssetParams(src, { draftFinalTaskId: f.taskId, draftFinalAssetId: null })
      }
    }
  } catch {}

  // Seedance 2.5 draft → 1080p final. A new task (and a new asset) that points at the sample's
  // MachGen task id; the server takes prompt, references, duration, aspect ratio, seed and audio
  // from the sample. A draft gets one final, tracked by flags on the draft asset itself
  // (draftFinalTaskId / draftFinalAssetId); the queue clears them if the final fails.
  handle('machgen:finalizeDraft', async (event, assetId: string) => {
    const draftAsset = raw.prepare('SELECT parameters FROM assets WHERE id = ?').get(assetId) as any
    let flags: any = {}
    try { flags = JSON.parse(draftAsset?.parameters || '{}') } catch {}
    if (flags.draftFinalAssetId) throw new Error('Este draft ya tiene su final 1080p.')
    if (flags.draftFinalTaskId) {
      const running = raw.prepare('SELECT status FROM tasks WHERE task_id = ?').get(flags.draftFinalTaskId) as any
      if (running && running.status !== 'failed' && running.status !== 'cancelled') {
        throw new Error('El final 1080p de este draft ya está en proceso.')
      }
    }
    const asset = raw.prepare('SELECT task_id FROM assets WHERE id = ?').get(assetId) as any
    const task = asset?.taskId ? raw.prepare('SELECT * FROM tasks WHERE task_id = ?').get(asset.taskId) as any : null
    if (!task || task.provider !== 'machgen') throw new Error('No se encontró la tarea MachGen de este draft.')
    if (task.status !== 'completed') throw new Error('El draft todavía no está completado.')
    const sourceTaskId = task.requestId || task.externalId
    let payload: any = {}
    try { payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : (task.payload || {}) } catch {}
    if (!payload.draft || !sourceTaskId || !String(payload.model || '').includes('Seedance-2.5')) {
      throw new Error('Este asset no es un draft de Seedance 2.5.')
    }
    const finalParams = { ...payload, draft: false, draftSourceTaskId: sourceTaskId, resolution: '1080p' }
    const finalTaskId = await enqueueGeneration(event, finalParams)
    updateDraftAssetParams(sourceTaskId, { draftFinalTaskId: finalTaskId, draftFinalAssetId: null, draftFinalError: null })
    return finalTaskId
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
