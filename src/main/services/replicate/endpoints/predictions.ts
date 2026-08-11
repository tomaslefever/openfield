import type { ReplicateApiClient } from '../client'
import type { Prediction, CreatePredictionParams } from '../types'

/**
 * POST /predictions
 * Creates a prediction for a model version.
 */
export async function createPrediction(
  client: ReplicateApiClient,
  params: CreatePredictionParams
): Promise<Prediction> {
  return client.request<Prediction>('/predictions', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/**
 * GET /predictions/{id}
 * Returns the current state of a prediction.
 */
export async function getPrediction(client: ReplicateApiClient, predictionId: string): Promise<Prediction> {
  return client.request<Prediction>(`/predictions/${predictionId}`)
}

/**
 * POST /predictions/{id}/cancel
 * Cancels an in-flight prediction.
 */
export async function cancelPrediction(client: ReplicateApiClient, predictionId: string): Promise<Prediction> {
  return client.request<Prediction>(`/predictions/${predictionId}/cancel`, { method: 'POST' })
}
