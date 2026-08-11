export type FalQueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'

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
}

export interface FalVideoResult {
  video: FalFile
}

export interface MiniMaxH3Input {
  prompt: string
  duration?: number
  resolution?: '768P' | '2K' | '4K'
  aspect_ratio?: string
  reference_image_urls?: string[]
  reference_video_urls?: string[]
  reference_audio_urls?: string[]
}
