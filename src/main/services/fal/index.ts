import { FalApiClient as BaseClient } from './client'
import { submitRequest, getRequestStatus, getRequestResult, cancelRequest } from './endpoints/queue'
import type { FalQueueStatusResponse, FalVideoResult } from './types'

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

  getRequestResult(modelId: string, requestId: string): Promise<FalVideoResult> {
    return getRequestResult(this, modelId, requestId)
  }

  cancelRequest(modelId: string, requestId: string): Promise<void> {
    return cancelRequest(this, modelId, requestId)
  }
}

export * from './types'
export * from './catalog'
