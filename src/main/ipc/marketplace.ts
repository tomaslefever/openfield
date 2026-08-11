import type { IpcContext } from './context'
import { getMarketplaceClient } from '../services/local-models/marketplace'

export function registerMarketplaceHandlers({ handle }: IpcContext) {
  handle('marketplace:search', async (_e, params) => {
    return getMarketplaceClient().search(params)
  })

  handle('marketplace:getModel', async (_e, modelId: string) => {
    return getMarketplaceClient().getModel(modelId)
  })

  handle('marketplace:getReadme', async (_e, modelId: string) => {
    try { return await getMarketplaceClient().getReadme(modelId) } catch { return '' }
  })

  handle('marketplace:getCurated', () => {
    return getMarketplaceClient().getCurated()
  })
}
