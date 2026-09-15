import { OpenfieldApiClient as BaseClient } from './client'
import { createTask } from './endpoints/create-task'
import { getTaskDetail, waitForCompletion } from './endpoints/task-detail'
import { getAccountCredits } from './endpoints/account'
import { uploadFileBase64 } from './endpoints/upload'
import { generateImage } from './endpoints/image'
import { generateVideo } from './endpoints/video'
import { generateAudio } from './endpoints/audio'
import { getEstimatedCost, type CostEstimateOptions } from './models'
import type {
  GenerateImageParams,
  GenerateVideoParams,
  GenerateAudioParams,
  KieTaskDetailResponse,
} from './types'

/**
 * Public KIE.ai client: composes every endpoint from `endpoints/` into a
 * single class with the same API surface as the old `openfield-api.ts`.
 */
export class OpenfieldApiClient extends BaseClient {
  uploadFileBase64(base64: string, mimeType: string): Promise<string> {
    return uploadFileBase64(this, base64, mimeType)
  }

  createTask(model: string, input: Record<string, any>, callBackUrl?: string): Promise<string> {
    return createTask(this, model, input, callBackUrl)
  }

  getTaskDetail(taskId: string): Promise<KieTaskDetailResponse['data']> {
    return getTaskDetail(this, taskId)
  }

  getAccountCredits(): Promise<number> {
    return getAccountCredits(this)
  }

  generateImage(params: GenerateImageParams): Promise<string> {
    return generateImage(this, params)
  }

  generateVideo(params: GenerateVideoParams): Promise<string> {
    return generateVideo(this, params)
  }

  generateAudio(params: GenerateAudioParams): Promise<string> {
    return generateAudio(this, params)
  }

  waitForCompletion(
    taskId: string,
    onProgress?: (state: string, progress?: number) => void
  ): Promise<KieTaskDetailResponse['data']> {
    return waitForCompletion(this, taskId, onProgress)
  }

  getEstimatedCost(modelId: string, options?: CostEstimateOptions | number): number {
    return getEstimatedCost(modelId, options)
  }
}

export { IMAGE_MODELS, VIDEO_MODELS, AUDIO_MODELS, type CostEstimateOptions } from './models'
export * from './types'
