import { FalApiClient as BaseClient } from './client'
import { submitRequest, getRequestStatus, getRequestResult, cancelRequest } from './endpoints/queue'
import type { FalQueueStatusResponse, FalSubmitResponse, FalRequestUrls } from './types'
import type { FalResult } from './endpoints/queue'

/**
 * Public fal.ai client: composes every endpoint from `endpoints/`.
 */
export class FalApiClient extends BaseClient {
  submitRequest(modelId: string, input: Record<string, any>): Promise<FalSubmitResponse> {
    return submitRequest(this, modelId, input)
  }

  getRequestStatus(modelId: string, requestId: string, urls?: FalRequestUrls): Promise<FalQueueStatusResponse> {
    return getRequestStatus(this, modelId, requestId, urls)
  }

  getRequestResult(modelId: string, requestId: string, urls?: FalRequestUrls): Promise<FalResult> {
    return getRequestResult(this, modelId, requestId, urls)
  }

  cancelRequest(modelId: string, requestId: string, urls?: FalRequestUrls): Promise<void> {
    return cancelRequest(this, modelId, requestId, urls)
  }

  async getBalance(): Promise<number | null> {
    try {
      const response = await fetch('https://rest.alpha.fal.ai/billing/user_balance', {
        headers: {
          'Authorization': `Key ${this.apiKey}`,
        },
      })
      if (!response.ok) return null
      const text = await response.text()
      const val = parseFloat(text)
      return isFinite(val) ? val : null
    } catch {
      return null
    }
  }
}

export * from './types'
export * from './catalog'
