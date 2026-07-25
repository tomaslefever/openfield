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

export const IMAGE_MODELS = [
  { id: 'gpt-image-2-text-to-image', name: 'GPT Image 2', cost: 0.03, unit: 'img', category: 'OpenAI' },
  { id: 'gpt-image-2-image-to-image', name: 'GPT Image 2 I2I', cost: 0.03, unit: 'img', category: 'OpenAI' },
  { id: 'nano-banana-2', name: 'Nano Banana 2', cost: 0.04, unit: 'img', category: 'Google' },
  { id: 'nano-banana-edit', name: 'Nano Banana Edit', cost: 0.04, unit: 'img', category: 'Google' },
  { id: 'seedream-5-pro-text-to-image', name: 'Seedream 5 Pro', cost: 0.06, unit: 'img', category: 'Seedream' },
  { id: 'seedream-5-pro-image-to-image', name: 'Seedream 5 Pro I2I', cost: 0.06, unit: 'img', category: 'Seedream' },
  { id: 'flux2-pro-text-to-image', name: 'Flux 2 Pro', cost: 0.05, unit: 'img', category: 'Flux' },
  { id: 'grok-imagine/text-to-image', name: 'Grok Imagine', cost: 0.02, unit: 'img', category: 'Grok' },
  { id: 'imagen4-fast', name: 'Imagen 4 Fast', cost: 0.04, unit: 'img', category: 'Google' },
]

export const VIDEO_MODELS = [
  { id: 'kling-3.0/video', name: 'Kling 3.0', cost: 0.10, unit: 's', category: 'Kling' },
  { id: 'kling/v25-turbo-text-to-video-pro', name: 'Kling 2.5 Turbo', cost: 0.05, unit: 's', category: 'Kling' },
  { id: 'grok-imagine/text-to-video', name: 'Grok Imagine', cost: 0.015, unit: 's', category: 'Grok' },
  { id: 'bytedance/seedance-2', name: 'Seedance 2', cost: 0.205, unit: 's', category: 'ByteDance' },
  { id: 'bytedance/seedance-2-fast', name: 'Seedance 2 Fast', cost: 0.165, unit: 's', category: 'ByteDance' },
  { id: 'wan-2-7-text-to-video', name: 'Wan 2.7', cost: 0.04, unit: 's', category: 'Wan' },
  { id: 'hailuo/02-text-to-video-pro', name: 'Hailuo 2 Pro', cost: 0.06, unit: 's', category: 'Hailuo' },
] as const

export class KieApiClient {
  private apiKey: string
  private baseUrl: string
  private timeout: number

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.baseUrl = 'https://api.kie.ai'
    this.timeout = 300000
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      const body = await response.json()

      if (!response.ok || (body.msg && body.msg !== 'success')) {
        const errMsg = body.msg || `KIE API Error (${response.status})`
        console.error('[KIE] API error:', response.status, endpoint, body)
        throw new Error(errMsg)
      }

      return body
    } catch (err: any) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') throw new Error('Request timed out')
      throw err
    }
  }

  async uploadFileBase64(base64: string, mimeType: string): Promise<string> {
    const ext = mimeType.split('/')[1] || 'png'
    console.log('[KIE] uploadFile start, length:', base64?.length)

    // Decode base64 to binary buffer
    const binary = Buffer.from(base64, 'base64')
    const blob = new Blob([binary], { type: mimeType })

    const formData = new FormData()
    formData.append('file', blob, `img-${Date.now()}.${ext}`)
    formData.append('uploadPath', 'kie-studio')

    try {
      const response = await fetch(`https://kieai.redpandaai.co/api/file-stream-upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        body: formData,
      })
      const res = await response.json()
      console.log('[KIE] uploadFile result:', res)
      return res.data?.downloadUrl || ''
    } catch (err: any) {
      console.error('[KIE] uploadFile error:', err.message)
      return ''
    }
  }

  async createTask(model: string, input: Record<string, any>, callBackUrl?: string): Promise<string> {
    const body: Record<string, any> = { model, input }
    if (callBackUrl) body.callBackUrl = callBackUrl

    const res = await this.request<KieTaskResponse>('/api/v1/jobs/createTask', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return res.data.taskId
  }

  async getTaskDetail(taskId: string): Promise<KieTaskDetailResponse['data']> {
    const res = await this.request<KieTaskDetailResponse>(`/api/v1/jobs/recordInfo?taskId=${taskId}`)
    return res.data
  }

  async getAccountCredits(): Promise<number> {
    const res = await this.request<KieAccountResponse>('/api/v1/chat/credit')
    return res.data
  }

  async generateImage(params: {
    prompt: string
    model: string
    aspectRatio?: string
    resolution?: string
    imageBase64?: string
    imageMime?: string
    imageRefs?: { base64: string; mime: string }[]
  }): Promise<string> {
    console.log('[KIE] generateImage:', { model: params.model, prompt: params.prompt?.substring(0, 50), hasImage: !!(params.imageBase64 || params.imageRefs?.length) })

    const input: Record<string, any> = {
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio || 'auto',
      resolution: params.resolution || '1K',
    }

    if (params.imageRefs && params.imageRefs.length > 0) {
      console.log('[KIE] Uploading', params.imageRefs.length, 'reference images')
      const urls: string[] = []
      for (const ref of params.imageRefs) {
        const url = await this.uploadFileBase64(ref.base64, ref.mime)
        if (url) urls.push(url)
      }
      if (urls.length > 0) input.image_input = urls
    } else if (params.imageBase64) {
      console.log('[KIE] Uploading image, length:', params.imageBase64.length)
      const imageUrl = await this.uploadFileBase64(params.imageBase64, params.imageMime || 'image/png')
      console.log('[KIE] Uploaded, url:', imageUrl)
      if (imageUrl) input.image_input = [imageUrl]
    }

    console.log('[KIE] createTask:', params.model, JSON.stringify(input).substring(0, 200))
    return this.createTask(params.model, input)
  }

  async generateVideo(params: {
    prompt: string
    model: string
    imageBase64?: string
    imageMime?: string
    imageRefs?: { base64: string; mime: string }[]
    videoRefs?: { base64: string; mime: string }[]
    audioRefs?: { base64: string; mime: string }[]
    firstFrameBase64?: string
    lastFrameBase64?: string
    duration?: number | string
    aspectRatio?: string
    resolution?: string
    sound?: boolean
    multiShots?: boolean
    multiPrompt?: { prompt: string; duration: number }[]
  }): Promise<string> {
    const input: Record<string, any> = { prompt: params.prompt }

    const isKling = params.model.startsWith('kling')
    if (isKling) {
      if (params.duration !== undefined) input.duration = String(params.duration)
    } else if (params.duration !== undefined) {
      input.duration = typeof params.duration === 'string' ? parseInt(params.duration) : params.duration
    }
    if (params.aspectRatio) input.aspect_ratio = params.aspectRatio
    if (isKling) {
      const res = params.resolution || 'std'
      input.mode = res.replace('-audio', '')
      if (params.sound) input.sound = true

      // Multi-shot support
      if (params.multiShots && params.multiPrompt?.length) {
        input.multi_shots = true
        input.multi_prompt = params.multiPrompt.map(s => ({ prompt: s.prompt, duration: s.duration }))
      }

      // Kling i2v: use image_urls for reference/start image
      if (params.imageBase64 || params.imageRefs?.length) {
        const urls: string[] = []
        if (params.imageRefs && params.imageRefs.length > 0) {
          for (const ref of params.imageRefs) {
            const url = await this.uploadFileBase64(ref.base64, ref.mime)
            if (url) urls.push(url)
          }
        } else if (params.imageBase64) {
          const url = await this.uploadFileBase64(params.imageBase64, params.imageMime || 'image/png')
          if (url) urls.push(url)
        }
        if (urls.length > 0) input.image_urls = urls
      }

      // Kling FF/LF frames
      if (params.firstFrameBase64) {
        const ffUrl = await this.uploadFileBase64(params.firstFrameBase64, 'image/png')
        if (ffUrl) input.first_frame_url = ffUrl
      }
      if (params.lastFrameBase64) {
        const lfUrl = await this.uploadFileBase64(params.lastFrameBase64, 'image/png')
        if (lfUrl) input.last_frame_url = lfUrl
      }
    } else if (params.resolution) {
      input.resolution = params.resolution
    }

    const isSeedance = params.model.startsWith('bytedance/')

    // Upload and set first/last frame URLs (FF/LF mode) — skip for Kling (handled above)
    if (!isKling) {
      if (params.firstFrameBase64) {
        const ffUrl = await this.uploadFileBase64(params.firstFrameBase64, 'image/png')
        if (ffUrl) input.first_frame_url = ffUrl
      }
      if (params.lastFrameBase64) {
        const lfUrl = await this.uploadFileBase64(params.lastFrameBase64, 'image/png')
        if (lfUrl) input.last_frame_url = lfUrl
      }
    }

    // Upload and set reference image URLs
    if (isSeedance) {
      const refImageUrls: string[] = []
      if (params.imageRefs && params.imageRefs.length > 0) {
        for (const ref of params.imageRefs) {
          const url = await this.uploadFileBase64(ref.base64, ref.mime)
          if (url) refImageUrls.push(url)
        }
      } else if (params.imageBase64) {
        const url = await this.uploadFileBase64(params.imageBase64, params.imageMime || 'image/png')
        if (url) refImageUrls.push(url)
      }
      if (refImageUrls.length > 0) input.reference_image_urls = refImageUrls

      // Upload and set reference video URLs
      if (params.videoRefs && params.videoRefs.length > 0) {
        const refVideoUrls: string[] = []
        for (const ref of params.videoRefs) {
          const url = await this.uploadFileBase64(ref.base64, ref.mime)
          if (url) refVideoUrls.push(url)
        }
        if (refVideoUrls.length > 0) input.reference_video_urls = refVideoUrls
      }

      // Upload and set reference audio URLs
      if (params.audioRefs && params.audioRefs.length > 0) {
        const refAudioUrls: string[] = []
        for (const ref of params.audioRefs) {
          const url = await this.uploadFileBase64(ref.base64, ref.mime)
          if (url) refAudioUrls.push(url)
        }
        if (refAudioUrls.length > 0) input.reference_audio_urls = refAudioUrls
      }

      if (params.sound) input.sound = true
    } else if (!isKling && !isSeedance) {
      // Non-Seedance, non-Kling models use image_urls
      if (params.imageBase64) {
        const imageUrl = await this.uploadFileBase64(params.imageBase64, params.imageMime || 'image/png')
        if (imageUrl) input.image_urls = [imageUrl]
      }
    }

    return this.createTask(params.model, input)
  }

  async waitForCompletion(
    taskId: string,
    onProgress?: (state: string, progress?: number) => void
  ): Promise<KieTaskDetailResponse['data']> {
    while (true) {
      const detail = await this.getTaskDetail(taskId)
      onProgress?.(detail.state, detail.progress)

      if (detail.state === 'success') return detail
      if (detail.state === 'fail') throw new Error(detail.failMsg || 'Generation failed')

      await new Promise(r => setTimeout(r, 3000))
    }
  }

  getEstimatedCost(modelId: string, duration?: number): number {
    const allModels = [...IMAGE_MODELS, ...VIDEO_MODELS] as any[]
    const model = allModels.find(m => m.id === modelId)
    if (!model) return 0
    if (model.unit === 's' && duration) return (model.cost || 0) * duration
    return model.cost || 0
  }
}
