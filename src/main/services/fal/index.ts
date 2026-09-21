import { FalApiClient as BaseClient } from './client'
import { submitRequest, getRequestStatus, getRequestResult, cancelRequest } from './endpoints/queue'
import type { FalQueueStatusResponse } from './types'
import type { FalResult } from './endpoints/queue'

/**
 * Public fal.ai client: composes every endpoint from `endpoints/`.
 */
export class FalApiClient extends BaseClient {
  submitRequest(modelId: string, input: Record<string, any>): Promise<{ request_id: string }> {
    return submitRequest(this, modelId, input)
  }

  getRequestStatus(modelId: string, requestId: string): Promise<FalQueueStatusResponse> {
    return getRequestStatus(this, modelId, requestId)
  }

  getRequestResult(modelId: string, requestId: string): Promise<FalResult> {
    return getRequestResult(this, modelId, requestId)
  }

  cancelRequest(modelId: string, requestId: string): Promise<void> {
    return cancelRequest(this, modelId, requestId)
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
