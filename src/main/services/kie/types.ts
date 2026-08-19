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
  imageRefs?: { base64: string; mime: string; name?: string; refType?: string }[]
  videoRefs?: { base64: string; mime: string; assetId?: string }[]
  audioRefs?: { base64: string; mime: string }[]
  firstFrameBase64?: string
  lastFrameBase64?: string
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
