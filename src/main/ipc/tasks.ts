import type { IpcContext } from './context'
import { getActiveWorkspaceId } from '../services/workspace-service'
import { reconcileAllProviders, getProviderQueue } from '../services/task-recovery'
import { updateDraftAssetParams } from '../services/machgen-queue'
import { notifyAssetsChanged } from './assets'

export function registerTasksHandlers({ raw, handle }: IpcContext) {
  handle('tasks:list', () => {
    const wsId = getActiveWorkspaceId()
    return raw.prepare('SELECT * FROM tasks WHERE workspace_id = ? ORDER BY created_at DESC').all(wsId)
  })

  // Re-checks generations stuck in "processing" against every registered provider
  handle('tasks:reconcile', () => reconcileAllProviders())

  // Manual retry of a failed generation (queues never resubmit on their own): a fresh submission
  // with the stored payload, as a new request that replaces the failed card.
  handle('tasks:retry', async (_e, assetId: string) => {
    const asset = raw.prepare('SELECT id, task_id FROM assets WHERE id = ?').get(assetId) as any
    const task = asset?.taskId ? raw.prepare('SELECT * FROM tasks WHERE task_id = ?').get(asset.taskId) as any : null
    if (!task) throw new Error('No se encontró la tarea de esta generación.')
    if (task.status !== 'failed' && task.status !== 'cancelled') throw new Error('Solo se pueden reintentar generaciones fallidas.')
    const queue = getProviderQueue(task.provider)
    if (!queue) throw new Error('El proveedor de esta generación no está configurado.')

    let payload: any = {}
    try { payload = JSON.parse(task.payload || '{}') } catch {}
    // Ids of the failed job would make the queue resume it instead of submitting again
    delete payload.kieTaskId
    delete payload.requestId
    delete payload.predictionId

    const newTaskId = await queue.enqueue(task.type, payload)
    // Retrying a draft's 1080p final: the draft now points at the new attempt
    if (task.provider === 'machgen' && payload.draftSourceTaskId) {
      updateDraftAssetParams(String(payload.draftSourceTaskId), { draftFinalTaskId: newTaskId, draftFinalAssetId: null, draftFinalError: null })
    }
    raw.prepare('DELETE FROM assets WHERE id = ?').run(assetId)
    notifyAssetsChanged()
    return { taskId: newTaskId }
  })
}
