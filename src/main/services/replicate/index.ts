import { ReplicateApiClient as BaseClient } from './client'
import { createPrediction, getPrediction, cancelPrediction } from './endpoints/predictions'
import { getAccount } from './endpoints/account'
import type { Prediction, Account, CreatePredictionParams } from './types'

/**
 * Public Replicate client: composes every endpoint from `endpoints/`.
 */
export class ReplicateApiClient extends BaseClient {
  createPrediction(params: CreatePredictionParams): Promise<Prediction> {
    return createPrediction(this, params)
  }

  getPrediction(predictionId: string): Promise<Prediction> {
    return getPrediction(this, predictionId)
  }

  cancelPrediction(predictionId: string): Promise<Prediction> {
    return cancelPrediction(this, predictionId)
  }

  getAccount(): Promise<Account> {
    return getAccount(this)
  }
}

export * from './types'
export * from './catalog'
