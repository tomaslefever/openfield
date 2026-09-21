export type PredictionStatus = 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'

export interface Prediction {
  id: string
  model: string
  version: string
  status: PredictionStatus
  input: Record<string, any> | null
  output: string | string[] | null
  error: string | null
  logs: string | null
  metrics: { predict_time?: number; total_time?: number } | null
  urls: { cancel?: string; get?: string; stream?: string } | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface Account {
  type: 'user' | 'organization'
  username: string
  name?: string
  github_url?: string | null
}

export interface CreatePredictionParams {
  version?: string
  model?: string
  input: Record<string, any>
}

export interface PVideoAvatarInput {
  image: string
  audio?: string
  voice?: string
  voice_script?: string
  voice_language?: string
  resolution?: '720p' | '1080p'
  video_prompt?: string
  voice_prompt?: string
  negative_prompt?: string
  strength_negative_prompt?: number
  seed?: number
  disable_safety_filter?: boolean
  disable_prompt_upsampling?: boolean
}

export interface PVideoInput {
  prompt?: string
  image?: string
  audio?: string
  last_frame_image?: string
  duration?: number
  aspect_ratio?: '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3' | '1:1'
  resolution?: '720p' | '1080p'
  fps?: 24 | 48
  draft?: boolean
  prompt_upsampling?: boolean
  save_audio?: boolean
  seed?: number
  disable_safety_filter?: boolean
}
