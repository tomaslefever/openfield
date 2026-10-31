export type FalQueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'

/** POST /{modelId}: fal returns where to poll; status and results live under the app id, not the endpoint path */
export interface FalSubmitResponse {
  request_id: string
  status_url?: string
  response_url?: string
  cancel_url?: string
}

/** Where to reach a submitted request (the URLs fal returned on submit, when known) */
export interface FalRequestUrls {
  statusUrl?: string
  responseUrl?: string
  cancelUrl?: string
}

export interface FalQueueStatusResponse {
  request_id: string
  status: FalQueueStatus
  queue_position?: number
  logs?: { message: string; timestamp?: number }[]
}

export interface FalFile {
  url: string
  content_type?: string
  file_name?: string
  file_size?: number
  width?: number
  height?: number
}

export interface FalVideoResult {
  video: FalFile
}

export interface FalImageResult {
  images: FalFile[]
}

export interface FalAudioResult {
  audio_url?: string | FalFile
  audio_file?: FalFile
  audio?: string | FalFile
}

export type FalResult = FalVideoResult | FalImageResult | FalAudioResult | Record<string, any>

export interface MiniMaxH3Input {
  prompt: string
  duration?: number
  resolution?: '480P' | '768P' | '1080P' | '2K' | '4K'
  aspect_ratio?: string
  prompt_expansion_mode?: 'balanced' | 'quality'
  enable_safety_checker?: boolean
  reference_image_urls?: string[]
  reference_video_urls?: string[]
  reference_audio_urls?: string[]
}
