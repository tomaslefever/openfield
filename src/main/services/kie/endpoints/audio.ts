import type { OpenfieldApiClient } from '../client'
import type { GenerateAudioParams } from '../types'
import { createTask } from './create-task'
import { buildKieTtsInput, isKieTtsModel } from '../tts'
import { buildKieSunoInput, isKieSunoModel, KIE_SUNO_TASK_MODEL } from '../music'

/**
 * Audio generation (TTS / music): builds the input payload and creates the task.
 */
export async function generateAudio(client: OpenfieldApiClient, params: GenerateAudioParams): Promise<string> {
  console.log('[OF] generateAudio:', { model: params.model, prompt: params.prompt?.substring(0, 50), duration: params.duration })

  if (isKieTtsModel(params.model)) {
    return createTask(client, params.model, buildKieTtsInput(params))
  }
  if (isKieSunoModel(params.model)) {
    return createTask(client, KIE_SUNO_TASK_MODEL, buildKieSunoInput(params))
  }

  const input: Record<string, any> = { prompt: params.prompt }
  if (params.duration !== undefined) {
    input.duration = typeof params.duration === 'string' ? parseInt(params.duration) : params.duration
  }

  return createTask(client, params.model, input)
}
