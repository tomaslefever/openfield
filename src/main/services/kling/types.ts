// Kling AI official API (https://kling.ai/document-api) — "new API" shape shared by
// Kling 4.0, 4.0 Flash, 3.0, 3.0 Omni and 3.0 Turbo: POST /{text|image}-to-video/{model},
// POST /omni-video/{model} (Omni reference generation), GET /tasks.

export type KlingTaskStatus = 'submitted' | 'processing' | 'succeeded' | 'failed'

export interface KlingVideoSettings {
  resolution?: '720p' | '1080p' | '4k'
  aspect_ratio?: string
  duration?: number
  /** 'original' (Omni only) keeps the audio of the base/feature video */
  audio?: 'native' | 'off' | 'original'
  multi_shot?: boolean
}

export interface KlingOptions {
  callback_url?: string
  external_task_id?: string
  watermark_info?: { enabled: boolean }
}

export interface KlingTextToVideoRequest {
  prompt: string
  settings?: KlingVideoSettings
  options?: KlingOptions
}

export type KlingContent =
  | { type: 'prompt'; text: string }
  /** `url` takes a public URL or raw base64; `id` lets the prompt cite it as @id */
  | { type: 'first_frame' | 'middle_frame' | 'last_frame' | 'refer_image'; url: string; id?: string }
  /** Omni only, public URL only (no base64): feature reference video or video to edit */
  | { type: 'feature_video' | 'base_video'; url: string; id?: string }
  | { type: 'element'; element_id: string; id: string }

export interface KlingImageToVideoRequest {
  contents: KlingContent[]
  settings?: KlingVideoSettings
  options?: KlingOptions
}

/** POST /omni-video/{model}: same body shape as image-to-video, more content types */
export type KlingOmniVideoRequest = KlingImageToVideoRequest

export interface KlingTaskSummary {
  id: string
  status: KlingTaskStatus | string
  create_time?: number
  update_time?: number
  external_id?: string
}

export interface KlingOutput {
  type: 'video' | 'image' | 'audio' | string
  id?: string
  url?: string
  watermark_url?: string
  duration?: string
}

export interface KlingTask extends KlingTaskSummary {
  message?: string
  outputs?: KlingOutput[]
  billing?: Array<{ charge_type?: string; amount?: string; currency?: string }>
}

export interface KlingResponse<T> {
  code: number
  message?: string
  request_id?: string
  data: T
}

export interface KlingModelDef {
  /** Path segment of the endpoint, e.g. 'kling-3.0' → /text-to-video/kling-3.0 */
  id: string
  name: string
  category: string
  type: 'video'
  supportsTextToVideo: boolean
  supportsFirstFrame: boolean
  supportsLastFrame: boolean
  /** The model takes an audio on/off setting; Turbo always generates native audio */
  audioSetting: boolean
  /** Multi-shot prompts ("shot n, m, words;") are understood */
  multiShot: boolean
  /** The model takes the settings.multi_shot switch (Turbo infers it from the prompt) */
  multiShotSetting: boolean
  /** Keyframes allowed between the first and last frame (Kling 4.0); omitted = none */
  middleFrames?: number
  /** Omni reference generation (POST /omni-video/{id}) and its input limits; omitted = none */
  omni?: {
    /** Images, first frame included */
    maxImages: number
    /** feature_video references */
    maxVideos: number
    /** Images + videos + Elements (+ voices) */
    maxTotal: number
    /** Each reference video and their total must last 3 s up to this many seconds */
    maxVideoSeconds: number
    aspectRatios: string[]
  }
  durationOptions: number[]
  resolutions: Array<'720p' | '1080p' | '4k'>
  aspectRatios: string[]
  /**
   * USD per second, keyed by resolution (and `<res>-audio` when audio is billed apart).
   * `costWithVideoInput`: rate when a reference video is sent, billed on
   * max(output × 2, input + output) seconds (Kling 4.0 / 4.0 Flash).
   */
  pricing: Array<{ resolution: string; cost: number; costWithVideoInput?: number }>
  unit: 's'
}
