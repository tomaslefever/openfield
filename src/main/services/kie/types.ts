export interface KieTaskResponse {
  code: number
  msg: string
  data: { taskId: string }
}

export interface KieTaskDetailResponse {
  code: number
  msg: string
  data: {
    taskId: string
    model: string
    state: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'
    param: string
    resultJson: string
    failCode: string
    failMsg: string
    costTime: number
    completeTime: number
    createTime: number
    updateTime: number
    progress?: number
    creditsConsumed: number
  }
}

export interface KieAccountResponse {
  code: number
  msg: string
  data: number
}

export interface GenerateImageParams {
  prompt: string
  model: string
  aspectRatio?: string
  resolution?: string
  imageBase64?: string
  imageMime?: string
  imageRefs?: { base64: string; mime: string }[]
}

export interface GenerateVideoParams {
  prompt: string
  model: string
  taskId?: string
  imageBase64?: string
  imageMime?: string
  imageUrl?: string
  imageAssetId?: string
  imageRefs?: { base64?: string; mime?: string; name?: string; refType?: string; assetId?: string; url?: string }[]
  videoRefs?: { base64?: string; mime?: string; assetId?: string; url?: string }[]
  audioRefs?: { base64?: string; mime?: string; assetId?: string; audioUrl?: string; name?: string }[]
  firstFrameBase64?: string
  firstFrameAssetId?: string
  firstFrameUrl?: string
  lastFrameBase64?: string
  lastFrameAssetId?: string
  lastFrameUrl?: string
  duration?: number | string
  aspectRatio?: string
  resolution?: string
  sound?: boolean
  multiShots?: boolean
  multiPrompt?: { prompt: string; duration: number }[]
}

export interface GenerateAudioParams {
  prompt: string
  model: string
  duration?: number | string
}

export interface GeminiOmniVideoClip {
  url: string
  start: number
  ends: number
}

export interface GeminiOmniFlashInput {
  prompt: string
  duration?: '4' | '6' | '8' | '10'
  resolution?: '360p' | '720p' | '1080p' | '4k'
  aspect_ratio?: '16:9' | '9:16'
  first_frame_url?: string
  last_frame_url?: string
  image_urls?: string[]
  video_list?: GeminiOmniVideoClip[]
  audio_ids?: string[]
  character_ids?: string[]
  seed?: number
}

export interface Wan3VideoInput {
  prompt?: string
  resolution?: '480P' | '720P' | '1080P'
  aspect_ratio?: 'adaptive' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16'
  duration?: number
  audio?: boolean
  seed?: number
  first_frame_url?: string
  last_frame_url?: string
  reference_image_urls?: string[]
  reference_video_urls?: string[]
  reference_audio_urls?: string[]
  reference_file_urls?: string[]
  reference_link_urls?: string[]
  nsfw_checker?: boolean
}

export interface Seedream5ProInput {
  prompt: string
  image_urls?: string[]
  aspect_ratio?: '1:1' | '16:9' | '21:9' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16'
  quality?: 'basic' | 'high'
  output_format?: 'jpeg' | 'png'
  nsfw_checker?: boolean
}



