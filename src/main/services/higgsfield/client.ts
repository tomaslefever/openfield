import * as fs from 'fs'
import * as path from 'path'
import type {
  Seedance20Input,
  Seedance25Input,
  Kling30StdInput,
  Wan30Input,
  Wan30PrimeInput,
  MiniMaxHailuoInput,
  HiggsfieldStatusResponse,
  HiggsfieldUploadUrlResponse,
  HiggsfieldModelInput,
  MarketingStudioImageInput,
  MarketingStudioPresetsResponse,
  AiInfluencerOptionsResponse,
} from './types'

export const HIGGSFIELD_ENDPOINT_MAP: Record<string, string> = {
  // Seedance 2.0
  'bytedance/seedance-2.0/text-to-video': '/bytedance/seedance-2.0/text-to-video',
  'bytedance/seedance-2.0/image-to-video': '/bytedance/seedance-2.0/image-to-video',
  'bytedance/seedance-2.0/reference-to-video': '/bytedance/seedance-2.0/reference-to-video',
  'higgsfield/seedance-2.0': '/bytedance/seedance-2.0/text-to-video',

  // Seedance 2.5
  'bytedance/seedance-2.5/text-to-video': '/bytedance/seedance-2.5/text-to-video',
  'bytedance/seedance-2.5/image-to-video': '/bytedance/seedance-2.5/image-to-video',
  'bytedance/seedance-2.5/reference-to-video': '/bytedance/seedance-2.5/reference-to-video',
  'bytedance/seedance-2.5/video-edit': '/bytedance/seedance-2.5/video-edit',
  'bytedance/seedance-2.5/video-extend': '/bytedance/seedance-2.5/video-extend',
  'higgsfield/seedance-2.5': '/bytedance/seedance-2.5/text-to-video',

  // Kling 3.0
  'kling-video/v3.0/std/text-to-video': '/kling-video/v3.0/std/text-to-video',
  'kling-video/v3.0/std/image-to-video': '/kling-video/v3.0/std/image-to-video',
  'kling-video/v3.0/pro/text-to-video': '/kling-video/v3.0/pro/text-to-video',
  'kling-video/v3.0/pro/image-to-video': '/kling-video/v3.0/pro/image-to-video',
  'kling-video/v3.0-turbo/text-to-video': '/kling-video/v3.0-turbo/text-to-video',
  'kling-video/v3.0-turbo/image-to-video': '/kling-video/v3.0-turbo/image-to-video',

  // Wan 3.0
  'alibaba/wan-3.0/text-to-video': '/alibaba/wan-3.0/text-to-video',
  'alibaba/wan-3.0/image-to-video': '/alibaba/wan-3.0/image-to-video',
  'alibaba/wan-3.0/reference-to-video': '/alibaba/wan-3.0/reference-to-video',
  'higgsfield/wan-3-0/text-to-video': '/alibaba/wan-3.0/text-to-video',
  'higgsfield/wan-3-0/image-to-video': '/alibaba/wan-3.0/image-to-video',
  'higgsfield/wan-3.0': '/alibaba/wan-3.0/text-to-video',

  // Wan 3.0 Prime
  'alibaba/wan-3.0-prime/text-to-video': '/alibaba/wan-3.0-prime/text-to-video',
  'alibaba/wan-3.0-prime/image-to-video': '/alibaba/wan-3.0-prime/image-to-video',
  'alibaba/wan-3.0-prime/reference-to-video': '/alibaba/wan-3.0-prime/reference-to-video',
  'higgsfield/wan-3-0-prime/text-to-video': '/alibaba/wan-3.0-prime/text-to-video',
  'higgsfield/wan-3-0-prime/image-to-video': '/alibaba/wan-3.0-prime/image-to-video',
  'higgsfield/wan-3-0-prime/reference-to-video': '/alibaba/wan-3.0-prime/reference-to-video',
  'higgsfield/wan-3.0-prime': '/alibaba/wan-3.0-prime/text-to-video',

  // MiniMax
  'minimax/h3/text-to-video': '/minimax/h3/text-to-video',
  'minimax/h3/image-to-video': '/minimax/h3/image-to-video',
  'minimax/h3/reference-to-video': '/minimax/h3/reference-to-video',
  'minimax/hailuo-2.3/standard/text-to-video': '/minimax/hailuo-2.3/standard/text-to-video',
  'minimax/hailuo-2.3/standard/image-to-video': '/minimax/hailuo-2.3/standard/image-to-video',
  'higgsfield/minimax-h3/text-to-video': '/minimax/h3/text-to-video',
  'higgsfield/minimax-h3/image-to-video': '/minimax/h3/image-to-video',
  'higgsfield/minimax-h3/reference-to-video': '/minimax/h3/reference-to-video',
  'higgsfield/minimax-h3': '/minimax/h3/text-to-video',

  // Image Models
  'higgsfield-ai/soul/v2/standard': '/higgsfield-ai/soul/v2/standard',
  'higgsfield/soul-image-2': '/higgsfield-ai/soul/v2/standard',
  'higgsfield-ai/soul/cinema': '/higgsfield-ai/soul/standard',
  'higgsfield/soul-2-0/text-to-video': '/higgsfield/cinema-studio/4.0',
  'higgsfield-ai/soul/standard': '/higgsfield-ai/soul/standard',
  'flux-pro/kontext/max/text-to-image': '/flux-pro/kontext/max/text-to-image',
  'higgsfield/flux-pro': '/flux-pro/kontext/max/text-to-image',
  'xai/grok-imagine-image-2.0': '/xai/grok-imagine-image-2.0',
  'higgsfield/grok-imagine-image-2': '/xai/grok-imagine-image-2.0',
  'grok-imagine-image-2': '/xai/grok-imagine-image-2.0',
  'ideogram/v4.0': '/ideogram/v4.0',
  'higgsfield/ideogram-2': '/ideogram/v4.0',
  'higgsfield/ideogram-4': '/ideogram/v4.0',
  'recraft/v4.1/text-to-image': '/recraft/v4.1/text-to-image',
  'recraft/v4.1': '/recraft/v4.1/text-to-image',
  'alibaba/qwen-image-3/text-to-image': '/alibaba/qwen-image-3/text-to-image',
  'alibaba/qwen-image-3': '/alibaba/qwen-image-3/text-to-image',
  'z-image/turbo': '/z-image/turbo',

  // Marketing Studio
  'marketing-studio/image': '/marketing-studio/image',
  'marketing-studio/image/presets': '/marketing-studio/image/presets',
  'marketing-studio/image/graphic-ads': '/marketing-studio/image',
  'marketing-studio/image/marketplace': '/marketing-studio/image',
  'higgsfield/marketing-studio/image': '/marketing-studio/image',
  'higgsfield/marketing-studio': '/marketing-studio/image',
  'higgsfield/marketplace-design': '/marketing-studio/image',
  'higgsfield/graphic-ads': '/marketing-studio/image',

  // AI Influencer (character sheet) and Genjutsu Motion Transfer: the model id is the path
  'higgsfield/ai-influencer': '/higgsfield/ai-influencer',
  'higgsfield/genjutsu/motion-transfer/v1.0': '/higgsfield/genjutsu/motion-transfer/v1.0',
}

export function normalizeHiggsfieldEndpoint(endpoint: string): string {
  const clean = endpoint.trim().replace(/^\/+/, '')
  if (HIGGSFIELD_ENDPOINT_MAP[clean]) {
    return HIGGSFIELD_ENDPOINT_MAP[clean]
  }
  if (HIGGSFIELD_ENDPOINT_MAP[endpoint.trim()]) {
    return HIGGSFIELD_ENDPOINT_MAP[endpoint.trim()]
  }
  return endpoint.startsWith('/') ? endpoint : `/${endpoint}`
}

export class HiggsfieldApiClient {
  private apiKey: string
  private baseUrl = 'https://api.higgsfield.ai'

  constructor(apiKey: string) {
    this.apiKey = (apiKey || '').replace(/^["']+|["']+$/g, '').trim()
  }

  setApiKey(apiKey: string) {
    this.apiKey = (apiKey || '').replace(/^["']+|["']+$/g, '').trim()
  }

  public getParsedCredentials(): { keyId: string; keySecret?: string; authHeader: string } {
    const raw = (this.apiKey || '').replace(/^["']+|["']+$/g, '').trim()
    if (!raw) {
      throw new Error('Higgsfield API key no está configurada. Agrégala en Settings → Providers.')
    }
    const colonIdx = raw.indexOf(':')
    if (colonIdx !== -1) {
      const keyId = raw.substring(0, colonIdx).trim()
      const keySecret = raw.substring(colonIdx + 1).trim()
      return {
        keyId,
        keySecret,
        authHeader: `Key ${keyId}:${keySecret}`,
      }
    }
    return {
      keyId: raw,
      authHeader: `Key ${raw}`,
    }
  }

  private getAuthHeaders(): Record<string, string> {
    const creds = this.getParsedCredentials()
    return {
      'Authorization': creds.authHeader,
    }
  }


  async request<T>(urlOrPath: string, options: RequestInit = {}): Promise<T> {
    const normPath = urlOrPath.startsWith('http') ? urlOrPath : normalizeHiggsfieldEndpoint(urlOrPath)
    const url = normPath.startsWith('http')
      ? normPath
      : `${this.baseUrl}${normPath.startsWith('/') ? normPath : `/${normPath}`}`

    const authHeaders = this.getAuthHeaders()
    const headers: Record<string, string> = {
      ...authHeaders,
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    }

    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }

    const res = await fetch(url, { ...options, headers })

    if (!res.ok) {
      let errDetail = `HTTP ${res.status} ${res.statusText}`
      try {
        const body = await res.json()
        if (body?.error) {
          errDetail = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
        } else if (body?.detail) {
          errDetail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
        } else if (body?.message) {
          errDetail = body.message
        }
      } catch {
        try {
          const text = await res.text()
          if (text) errDetail = text.substring(0, 300)
        } catch {}
      }
      if (res.status === 401 && !this.apiKey.includes(':')) {
        errDetail += ' (Verifica si tu clave requiere formato KEY_ID:KEY_SECRET en console.higgsfield.ai)'
      }
      throw new Error(`Higgsfield API error (${res.status}): ${errDetail}`)
    }

    return res.json() as Promise<T>
  }

  /**
   * Uploads local image, video, audio, base64 or file buffer to Higgsfield via presigned URL
   * Returns a publicly accessible HTTPS URL.
   */
  async uploadSource(source: Buffer | Uint8Array | string, defaultMime = 'image/png'): Promise<string> {
    if (!source) throw new Error('Higgsfield uploadSource: no source provided')

    if (typeof source === 'string') {
      const trimmed = source.trim()
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed
      }
    }

    let buffer: Buffer
    let mime = defaultMime

    if (Buffer.isBuffer(source)) {
      buffer = source
    } else if (typeof source === 'string') {
      const trimmed = source.trim()
      if (trimmed.startsWith('data:')) {
        const match = trimmed.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          mime = match[1]
          buffer = Buffer.from(match[2], 'base64')
        } else {
          throw new Error('Higgsfield uploadSource: formato data URI inválido')
        }
      } else if (fs.existsSync(trimmed)) {
        buffer = await fs.promises.readFile(trimmed)
        const ext = path.extname(trimmed).toLowerCase()
        if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg'
        else if (ext === '.png') mime = 'image/png'
        else if (ext === '.webp') mime = 'image/webp'
        else if (ext === '.mp4') mime = 'video/mp4'
        else if (ext === '.mov') mime = 'video/quicktime'
        else if (ext === '.mp3') mime = 'audio/mpeg'
        else if (ext === '.wav') mime = 'audio/wav'
      } else {
        // Assume base64 string
        buffer = Buffer.from(trimmed, 'base64')
      }
    } else {
      buffer = Buffer.from(source)
    }

    // Step 1: Request presigned upload URL from Higgsfield
    const presigned = await this.request<HiggsfieldUploadUrlResponse>('/files/generate-upload-url', {
      method: 'POST',
      body: JSON.stringify({ content_type: mime }),
    })

    if (!presigned?.upload_url || !presigned?.public_url) {
      throw new Error('Higgsfield upload failed: no se recibió upload_url o public_url del servidor')
    }

    // Step 2: PUT buffer to presigned storage URL
    const uploadHeaders: Record<string, string> = {
      'Content-Type': mime,
      ...(presigned.upload_headers || {}),
    }

    const putRes = await fetch(presigned.upload_url, {
      method: 'PUT',
      headers: uploadHeaders,
      body: buffer as any,
    })

    if (!putRes.ok) {
      throw new Error(`Higgsfield storage upload failed (${putRes.status}): ${putRes.statusText}`)
    }

    return presigned.public_url
  }

  async generateSeedance20(input: Seedance20Input, endpoint = '/bytedance/seedance-2.0/text-to-video'): Promise<HiggsfieldStatusResponse> {
    return this.request<HiggsfieldStatusResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async generateSeedance25(input: Seedance25Input, endpoint = '/bytedance/seedance-2.5/text-to-video'): Promise<HiggsfieldStatusResponse> {
    return this.request<HiggsfieldStatusResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async generateKling30Std(input: Kling30StdInput, endpoint = '/kling-video/v3.0/std/text-to-video'): Promise<HiggsfieldStatusResponse> {
    return this.request<HiggsfieldStatusResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async generateWan30(input: Wan30Input, endpoint = '/alibaba/wan-3.0/text-to-video'): Promise<HiggsfieldStatusResponse> {
    return this.request<HiggsfieldStatusResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async generateWan30Prime(input: Wan30PrimeInput, endpoint = '/alibaba/wan-3.0-prime/text-to-video'): Promise<HiggsfieldStatusResponse> {
    return this.request<HiggsfieldStatusResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async generateMiniMax(input: MiniMaxHailuoInput, endpoint = '/minimax/h3/text-to-video'): Promise<HiggsfieldStatusResponse> {
    return this.request<HiggsfieldStatusResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async getMarketingStudioPresets(size = 50, cursor?: string): Promise<MarketingStudioPresetsResponse> {
    const params = new URLSearchParams()
    if (size) params.set('size', String(size))
    if (cursor) params.set('cursor', cursor)
    const qs = params.toString()
    const path = `/marketing-studio/image/presets${qs ? `?${qs}` : ''}`
    return this.request<MarketingStudioPresetsResponse>(path, {
      method: 'GET',
    })
  }

  async generateMarketingStudio(input: MarketingStudioImageInput, endpoint = '/marketing-studio/image'): Promise<HiggsfieldStatusResponse> {
    return this.request<HiggsfieldStatusResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  /** Trait catalog for AI Influencer (public while the model is visible; 404 when hidden) */
  async getAiInfluencerOptions(): Promise<AiInfluencerOptionsResponse> {
    const res = await fetch(`${this.baseUrl}/models/higgsfield/ai-influencer/options`, {
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`Higgsfield AI Influencer options (${res.status}): ${res.statusText}`)
    }
    return res.json() as Promise<AiInfluencerOptionsResponse>
  }

  async generate(endpoint: string, input: HiggsfieldModelInput): Promise<HiggsfieldStatusResponse> {
    return this.request<HiggsfieldStatusResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async getStatus(statusUrl: string): Promise<HiggsfieldStatusResponse> {
    return this.request<HiggsfieldStatusResponse>(statusUrl)
  }

  async cancel(cancelUrl: string): Promise<any> {
    try {
      return await this.request(cancelUrl, { method: 'POST' })
    } catch {
      return await this.request(cancelUrl, { method: 'DELETE' }).catch(() => null)
    }
  }

  async downloadAsset(url: string): Promise<Buffer> {
    // Only pass auth headers when requesting directly from Higgsfield API host,
    // avoiding breaking S3/GCS/R2 presigned signature validation.
    const isHiggsfieldApi = url.startsWith(this.baseUrl)
    const headers = isHiggsfieldApi ? this.getAuthHeaders() : {}
    const res = await fetch(url, { headers })

    if (!res.ok) {
      throw new Error(`Failed to download asset (${res.status}): ${res.statusText}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}

