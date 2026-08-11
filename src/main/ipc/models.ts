import type { IpcContext } from './context'
import { getModelRegistry } from '../services/local-models/model-registry'
import { getModelDownloader } from '../services/local-models/model-downloader'

export function registerModelsHandlers({ handle }: IpcContext) {
  // ─── Model Registry ────────────────────────────────
  handle('models:list', (_e, filters?: { pipelineTag?: string }) => {
    const typed = filters ? { ...filters, pipelineTag: filters.pipelineTag as any } : undefined
    return getModelRegistry().list(typed)
  })

  handle('models:listByPipeline', () => {
    return getModelRegistry().listByPipeline()
  })

  handle('models:get', (_e, id: string) => {
    return getModelRegistry().get(id)
  })

  handle('models:uninstall', async (_e, id: string) => {
    getModelRegistry().uninstall(id)
    return true
  })

  handle('models:isInstalled', (_e, id: string) => {
    return getModelRegistry().isInstalled(id)
  })

  handle('models:reset', (_e, id: string) => {
    getModelRegistry().reset(id)
    return true
  })

  handle('models:getTotalSize', () => {
    return getModelRegistry().getTotalSize()
  })

  // ─── Model Download ────────────────────────────────
  handle('models:download', async (event, modelId: string, options?: any) => {
    const downloader = getModelDownloader()
    const sender = event.sender

    const resultPath = await downloader.download(modelId, {
      ...options,
      onProgress: (job) => sender.send('models:download:progress', job),
      onComplete: (id: string, p: string) => sender.send('models:download:completed', { modelId: id, path: p }),
      onError: (id: string, error: string) => sender.send('models:download:error', { modelId: id, error }),
    })
    return resultPath
  })

  handle('models:cancelDownload', (_e, modelId: string) => {
    getModelDownloader().cancel(modelId)
    return true
  })

  handle('models:getActiveDownloads', () => {
    return getModelDownloader().getActive()
  })
}
