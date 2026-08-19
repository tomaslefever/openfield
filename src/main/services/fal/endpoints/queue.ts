import type { FalApiClient } from '../client'
import type { FalQueueStatusResponse, MiniMaxH3Input, FalImageResult, FalVideoResult } from '../types'

export type FalResult = FalVideoResult | FalImageResult

/**
 * POST /{modelId}
 * Submits a request to the model queue and returns the request id.
 */
export async function submitRequest(
  client: FalApiClient,
  modelId: string,
  input: Record<string, any>
): Promise<{ request_id: string }> {
  return client.request<{ request_id: string }>(`/${modelId}`, {
    method: 'POST',
    body: JSON.stringify({ input }),
  })
}

/**
 * GET /{modelId}/requests/{requestId}/status
 * Returns the queue status of a request.
 */
export async function getRequestStatus(
  client: FalApiClient,
  modelId: string,
  requestId: string
): Promise<FalQueueStatusResponse> {
  return client.request<FalQueueStatusResponse>(`/${modelId}/requests/${requestId}/status`)
}

/**
 * GET /{modelId}/requests/{requestId}
 * Returns the final result of a completed request.
 */
export async function getRequestResult(
  client: FalApiClient,
  modelId: string,
  requestId: string
): Promise<FalResult> {
  return client.request<FalResult>(`/${modelId}/requests/${requestId}`)
}

/**
 * DELETE /{modelId}/requests/{requestId}/cancel
 * Cancels an in-flight request.
 */
export async function cancelRequest(
  client: FalApiClient,
  modelId: string,
  requestId: string
): Promise<void> {
  try {
    await client.request(`/${modelId}/requests/${requestId}/cancel`, { method: 'DELETE' })
  } catch {}
}

export type { MiniMaxH3Input }
