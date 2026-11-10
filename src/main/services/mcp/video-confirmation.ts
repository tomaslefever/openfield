import { ToolInputError } from './types'

/**
 * Videos cost real money per second, so no agent picks the video model on its own: before any
 * video generation it offers the user 2 or 3 models with their estimated cost and waits for the
 * user's choice, which it passes back as user_model_confirmation.
 */

export const VIDEO_MODEL_RULE =
  'BEFORE ANY VIDEO (generate with type video, recreate_generation of a video, generate_scene_video, generate_transition): ' +
  'confirm the model with the user first. Offer 2 or 3 alternatives that fit the shot (references, duration, resolution, audio / lip-sync), ' +
  'each with its estimated cost = price per second from get_service_models × seconds × clips or variants, recommend one, and wait for the user\'s choice. ' +
  'Then call the tool with user_model_confirmation set to the user\'s words. One confirmation covers the batch of clips you priced; a new model, resolution or a bigger batch needs a new one.'

export const MODEL_CONFIRMATION_PROP = {
  type: 'string',
  description: 'Required for video: the user\'s own words choosing this video model after you offered 2–3 alternatives with their estimated cost',
}

export function requireVideoModelConfirmation(args: any, model: string | undefined, what: string) {
  const quote = typeof args?.user_model_confirmation === 'string' ? args.user_model_confirmation.trim() : ''
  if (quote) return
  throw new ToolInputError(
    `Not generated yet: ${what} needs the user to confirm the video model${model ? ` (${model})` : ''}. ` +
    'Offer the user 2 or 3 alternatives (this model and others that fit the shot), each with its estimated cost: price per second from get_service_models × seconds × clips or variants. ' +
    'Recommend one, wait for their answer and call again with user_model_confirmation set to their words.'
  )
}
