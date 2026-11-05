export interface ApimartImageRequest {
  model: string
  prompt: string
  size?: string
  resolution?: string
  n?: number
  image_urls?: string[] | { url: string }[]
  google_search?: boolean
  google_image_search?: boolean
  nsfw_check?: boolean
  [key: string]: any
}

export interface ApimartVideoRequest {
  model: string
  prompt: string
  mode?: string
  duration?: number
  aspect_ratio?: string
  image_urls?: string[]
  audio?: boolean
  negative_prompt?: string
  watermark?: boolean
  multi_shot?: boolean
  shot_type?: string
  multi_prompt?: Array<{ index: number; prompt: string; duration: number }>
  element_list?: Array<{ name: string; description: string; element_input_urls: string[] }>
  [key: string]: any
}

export interface ApimartSubmitResponse {
  code?: number
  data?: Array<{
    status?: string
    task_id?: string
    id?: string
  }>
  id?: string
  task_id?: string
  error?: {
    code?: number
    message?: string
    type?: string
  }
}

export interface ApimartTaskResultItem {
  url?: string | string[]
  expires_at?: number
  [key: string]: any
}

export interface ApimartTaskStatusData {
  id?: string
  task_id?: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | string
  cost?: number
  credits_cost?: number
  progress?: number
  result?: {
    images?: Array<ApimartTaskResultItem | string>
    videos?: Array<ApimartTaskResultItem | string>
    [key: string]: any
  }
  created?: number
  completed?: number
  estimated_time?: number
  actual_time?: number
  error?: {
    code?: number
    message?: string
    type?: string
  }
  fail_reason?: string
}

export interface ApimartTaskStatusResponse {
  code?: number
  data?: ApimartTaskStatusData
  status?: string
  result?: any
  error?: {
    code?: number
    message?: string
    type?: string
  }
}

export interface ApimartBalanceResponse {
  success: boolean
  message?: string
  remain_balance?: number
  remain_credits?: number
  used_balance?: number
  used_credits?: number
}

export interface ApimartUploadResponse {
  url: string
  filename?: string
  content_type?: string
  bytes?: number
  created_at?: number
  error?: {
    message?: string
    type?: string
  }
}

/**
 * Per-model request builder used by apimart-queue. Models without a builder use
 * the legacy generic payload (model/prompt/mode/duration/aspect_ratio/audio/image_urls).
 */
export type ApimartRequestBuilder =
  | 'kling-v4'
  | 'vidu-q4'
  | 'veo-official'
  | 'minimax-h3-max'
  | 'flux-3'
  | 'nano-banana-2.1'
  | 'flowmusic'

export interface ApimartModelDef {
  id: string
  name: string
  category: string
  type: 'image' | 'video' | 'audio'
  supportedTasks: Array<'T2I' | 'I2I' | 'T2V' | 'I2V' | 'R2V' | 'FFLF' | 'EXTEND' | 'EDIT' | 'T2M'>
  resolutions?: string[]
  aspectRatios?: string[]
  durationOptions?: string[]
  durationMax?: number
  supportsAudio?: boolean
  supportsAudioRef?: boolean
  supportsVideoRef?: boolean
  pricing?: {
    resolution: string
    cost: number
    /** Per-second rate charged for input video seconds (edit / reference with video). */
    costWithVideoInput?: number
    /** Per-second rate when native audio is generated, if it differs from `cost`. */
    costWithAudio?: number
  }[]
  unit: 'img' | 's' | 'video'
  /** Model id sent to the API when it differs from `id` (e.g. Flow Music: id 'flowmusic-lyria-3.5', api 'flowmusic'). */
  apiModel?: string
  /** Flow Music `version` field. */
  apiVersion?: string
  builder?: ApimartRequestBuilder
}

export interface ApimartMusicRequest {
  model: string
  version?: string
  sound_prompt?: string
  lyrics?: string
  title?: string
  bpm?: string
  length?: number
  seed?: string
  [key: string]: any
}

export interface ApimartMusicTaskData {
  id?: string
  task_id?: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | string
  progress?: number
  result?: {
    music?: Array<{ audio_url?: string; wav_url?: string; title?: string; duration?: number; [key: string]: any }>
    [key: string]: any
  }
  error?: { code?: number; message?: string; type?: string }
  fail_reason?: string
  [key: string]: any
}

export interface ApimartMusicTaskResponse {
  code?: number
  data?: ApimartMusicTaskData
  error?: { code?: number; message?: string; type?: string }
}
