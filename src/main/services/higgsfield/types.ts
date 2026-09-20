export type SeedanceResolution = '480p' | '720p' | '1080p' | '4k'
export type SeedanceAspectRatio = '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9'

export interface Seedance20Input {
  prompt: string
  duration?: number
  resolution?: SeedanceResolution
  aspect_ratio?: SeedanceAspectRatio
  generate_audio?: boolean
}

export interface Seedance25Input {
  prompt: string
  duration?: number
  resolution?: '480p' | '720p'
  aspect_ratio?: SeedanceAspectRatio
  bitrate_mode?: 'standard' | 'high'
  output_format?: 'mp4' | 'mov'
  generate_audio?: boolean
}

export interface Kling30StdInput {
  prompt?: string
  sound?: 'on' | 'off'
  duration?: number
  elements?: string[]
  cfg_scale?: number
  multi_shots?: boolean
  aspect_ratio?: '16:9' | '9:16' | '1:1'
  multi_prompt?: Array<{
    prompt: string
    duration: number
  }>
}

export type SeedanceInput = Seedance20Input | Seedance25Input
export type HiggsfieldVideoInput = SeedanceInput | Kling30StdInput

export type HiggsfieldTaskStatus =
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'nsfw'
  | 'canceled'

export interface HiggsfieldPendingStatus {
  request_id: string
  status_url: string
  cancel_url: string
  status: 'queued' | 'in_progress' | 'nsfw' | 'canceled'
}

export interface HiggsfieldFailedStatus {
  request_id: string
  status_url: string
  cancel_url: string
  status: 'failed'
  error: string
}

export interface HiggsfieldCompletedStatus {
  request_id: string
  status_url: string
  cancel_url: string
  status: 'completed'
  video: {
    url: string
  }
  zip?: { url: string }
  mov?: { url: string }
  jsx?: { url: string }
  fbx?: { url: string }
  ply?: { url: string }
}

export type HiggsfieldStatusResponse =
  | HiggsfieldPendingStatus
  | HiggsfieldFailedStatus
  | HiggsfieldCompletedStatus
