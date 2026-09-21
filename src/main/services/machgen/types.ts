export type MachgenTaskType =
  | 'T2V' | 'I2V' | 'R2V' | 'UPSCALE'
  | 'T2I' | 'I2I'
  | 'T2S' | 'T2D' | 'T2SFX' | 'T2M'

export interface MachgenVideoConfig {
  duration_secs: number
  height: number
  width?: number | null
  aspect_ratio?: string | null
  fps?: number | null
  infer_steps?: number | null
  guidance_scale?: number[] | null
  audio?: boolean | null
  bitrate_mode?: 'standard' | 'high' | null
  negative_prompt?: string | null
  shot_type?: string | null
  multi_prompt?: string[] | null
  shot_durations?: number[] | null
  element_ids?: number[] | null
  element_handles?: string[] | null
}

export interface MachgenUpscaleConfig {
  factor?: number | null
}

export interface MachgenReferenceOrderItem {
  kind: 'image' | 'video' | 'audio'
  index: number
}

export interface MachgenTaskInput {
  model: string
  task_type: MachgenTaskType
  prompt: string
  enhance_prompt?: boolean | null
  prompt_enhancer?: 'default' | 'native' | null
  seed?: number | null
  optimization_level?: 'STANDARD' | 'FAST' | 'EXPRESS' | null
  adapter?: string | null
  src_image_urls?: string[] | null
  keyframe_indices?: (0 | -1)[] | null
  src_video_urls?: string[] | null
  src_audio_urls?: string[] | null
  src_task_ids?: string[] | null
  src_file_urls?: string[] | null
  src_webpage_urls?: string[] | null
  reference_video_operation?: 'reference' | 'edit' | 'extend' | null
  reference_video_start_secs?: number[] | null
  subject_to_image_ids?: Record<string, number[]> | null
  subject_to_video_ids?: Record<string, number[]> | null
  subject_to_audio_ids?: Record<string, number[]> | null
  reference_order?: MachgenReferenceOrderItem[] | null
  moderate?: boolean
  video_config?: MachgenVideoConfig | null
  upscale_config?: MachgenUpscaleConfig | null
}

export type MachgenTaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'

export interface MachgenTaskOutput {
  video?: string
  image?: string
  audio?: string
  [key: string]: string | undefined
}

export interface MachgenTaskMetadata {
  prompt?: string
  height?: number
  width?: number
  fps?: number
  duration_secs?: number
  [key: string]: any
}

export interface MachgenTaskStatusResponse {
  task_id: string
  status: MachgenTaskStatus
  metadata?: MachgenTaskMetadata
  task_output?: MachgenTaskOutput | null
  error_msg?: string | null
  generation_time_secs?: number | null
  active_generation_time_secs?: number | null
  upload_time_secs?: number | null
  queue_time_secs?: number | null
}

export interface MachgenSubmitResponse {
  task_id: string
  [key: string]: any
}

export interface MachgenAccountResponse {
  account_id: string
  balance_micros: number
  autoreload_enabled: boolean
  pending_tasks: number
  running_tasks: number
}

export interface MachgenModelDef {
  id: string
  name: string
  category: string
  hosting: 'MachGen' | 'Partner'
  supportedTasks: MachgenTaskType[]
  supportsT2V?: boolean
  supportsI2V?: boolean
  supportsEndFrame?: boolean
  supportsR2V?: boolean
  supportsUpscale?: boolean
  supportsT2I?: boolean
  supportsI2I?: boolean
  supportsT2S?: boolean
  supportsT2D?: boolean
  supportsT2SFX?: boolean
  supportsT2M?: boolean
  supportsVideoRef?: boolean
  supportsAudioRef?: boolean
  allowedHeights?: number[]
  allowedAspectRatios?: string[]
  allowedDurations?: number[]
  defaultFps?: number
  defaultInferSteps?: number
  prices?: { resolution: string; height?: number; costPerSec?: number; cost?: number }[]
}
