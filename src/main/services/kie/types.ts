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
    /** Parsed resultJson, present on success */
    response?: any
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
  /** Seedance 2.5: render a 480p draft (bytedance/seedance-2-5 with draft: true) */
  draft?: boolean
  /** Seedance 2.5: KIE task id of a draft to upgrade to 1080p (bytedance/seedance-2-5-draft) */
  draftSourceTaskId?: string
  /** Gemini Omni: voice ids from createOmniAudio (max 3) */
  omniAudioIds?: string[]
  /** Gemini Omni: character ids from createOmniCharacter (max 3) */
  omniCharacterIds?: string[]
}

/** POST /api/v1/omni/audio/create — registers a Gemini Omni voice preset (free, synchronous) */
export interface OmniAudioCreateParams {
  /** Preset voice, one of GEMINI_OMNI_VOICES */
  audioId: string
  /** Voice name, max 210 characters */
  name: string
  /** Timbre, style, rate and emotion, max 20000 characters */
  voiceDescription?: string
  /** Sample line such as "Hello, I am Adam", max 120 characters */
  exampleDialogue?: string
}

export interface OmniAudioCreateResult {
  audioId: string
  name: string
}

/** POST /api/v1/omni/character/create — creates a Gemini Omni character (free, synchronous) */
export interface OmniCharacterCreateParams {
  /** Appearance, identity, style, clothing or personality */
  descriptions: string
  /** 1–2 images: index 0 portrait, index 1 optional full body (each up to 20MB) */
  images: { base64?: string; mime?: string; url?: string }[]
  /** Voice ids from createOmniAudio */
  audioIds?: string[]
  characterName?: string
}

export interface OmniCharacterCreateResult {
  characterId: string
  characterName: string
  imageUrl: string
  bodyImageUrl?: string
}

export interface GenerateAudioParams {
  prompt: string
  model: string
  duration?: number | string
  text?: string
  voice?: string
  voiceId?: string
  voice_id?: string
  speed?: number | string
  stability?: number | string
  similarityBoost?: number | string
  style?: number | string
  instrumental?: boolean
}

export interface GeminiOmniVideoClip {
  url: string
  start: number
  ends: number
}

/** gemini-omni-video: no first/last frame; images + videos × 2 + characters ≤ 7 slots */
export interface GeminiOmniVideoInput {
  prompt: string
  duration: '4' | '6' | '8' | '10'
  resolution?: '720p' | '1080p' | '4k'
  aspect_ratio?: '16:9' | '9:16'
  image_urls?: string[]
  video_list?: GeminiOmniVideoClip[]
  audio_ids?: string[]
  character_ids?: string[]
  seed?: number
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



