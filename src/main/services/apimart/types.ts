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

export interface ApimartModelDef {
  id: string
  name: string
  category: string
  type: 'image' | 'video'
  supportedTasks: Array<'T2I' | 'I2I' | 'T2V' | 'I2V' | 'R2V' | 'FFLF' | 'EXTEND'>
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
  }[]
  unit: 'img' | 's' | 'video'
}
