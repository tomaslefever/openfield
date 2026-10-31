import type { FalApiClient } from '../client'
import type { FalQueueStatusResponse, FalSubmitResponse, FalRequestUrls, MiniMaxH3Input, FalImageResult, FalVideoResult } from '../types'

export type FalResult = FalVideoResult | FalImageResult

const QUEUE_ORIGIN = 'https://queue.fal.run/'

/**
 * fal serves a request's status, result and cancel under the app id (`owner/app`), without the
 * endpoint subpath: `minimax/h3-max/reference-to-video` -> `/minimax/h3-max/requests/{id}/status`.
 * Polling the full endpoint path answers HTTP 405.
 */
function appPath(modelId: string): string {
  return modelId.split('/').filter(Boolean).slice(0, 2).join('/')
}

/** A URL fal returned, only if it points at the fal queue (the API key is sent with it) */
function queueUrl(url?: string): string | undefined {
  return typeof url === 'string' && url.startsWith(QUEUE_ORIGIN) ? url : undefined
}

/**
 * POST /{modelId}
 * Submits a request to the model queue and returns the request id and its polling URLs.
 */
export async function submitRequest(
  client: FalApiClient,
  modelId: string,
  input: Record<string, any>
): Promise<FalSubmitResponse> {
  // The queue REST API takes the model input as the body itself (`{ input }` is only the JS client's shape)
  return client.request<FalSubmitResponse>(`/${modelId}`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * GET {status_url}, or /{owner}/{app}/requests/{requestId}/status
 * Returns the queue status of a request.
 */
export async function getRequestStatus(
  client: FalApiClient,
  modelId: string,
  requestId: string,
  urls: FalRequestUrls = {}
): Promise<FalQueueStatusResponse> {
  return client.request<FalQueueStatusResponse>(queueUrl(urls.statusUrl) || `/${appPath(modelId)}/requests/${requestId}/status`)
}

/**
 * GET {response_url}, or /{owner}/{app}/requests/{requestId}
 * Returns the final result of a completed request.
 */
export async function getRequestResult(
  client: FalApiClient,
  modelId: string,
  requestId: string,
  urls: FalRequestUrls = {}
): Promise<FalResult> {
  return client.request<FalResult>(queueUrl(urls.responseUrl) || `/${appPath(modelId)}/requests/${requestId}`)
}

/**
 * {cancel_url}, or /{owner}/{app}/requests/{requestId}/cancel
 * Cancels an in-flight request.
 */
export async function cancelRequest(
  client: FalApiClient,
  modelId: string,
  requestId: string,
  urls: FalRequestUrls = {}
): Promise<void> {
  try {
    await client.request(queueUrl(urls.cancelUrl) || `/${appPath(modelId)}/requests/${requestId}/cancel`, { method: 'DELETE' })
  } catch {}
}

export type { MiniMaxH3Input }
