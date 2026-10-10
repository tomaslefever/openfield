import * as fs from 'fs/promises'
import * as syncFs from 'fs'
import * as path from 'path'
import type {
  ApimartImageRequest,
  ApimartVideoRequest,
  ApimartSubmitResponse,
  ApimartTaskStatusResponse,
  ApimartBalanceResponse,
  ApimartUploadResponse,
} from './types'

export class ApimartApiClient {
  private apiKey: string
  private baseUrl = 'https://api.apimart.ai'

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim()
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey.trim()
  }

  private async request<T>(endpointPath: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    }

    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }

    const res = await fetch(url, { ...options, headers })

    if (!res.ok) {
      let errDetail = `HTTP ${res.status} ${res.statusText}`
      try {
        const body = await res.json()
        if (body?.error?.message) {
          errDetail = body.error.message
        } else if (body?.message) {
          errDetail = body.message
        } else if (body?.detail) {
          errDetail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
        }
      } catch {
        try {
          const text = await res.text()
          if (text) errDetail = text.substring(0, 300)
        } catch {}
      }
      throw new Error(`APIMart API error (${res.status}): ${errDetail}`)
    }

    return res.json() as Promise<T>
  }

  async generateImage(params: ApimartImageRequest): Promise<ApimartSubmitResponse> {
    return this.request<ApimartSubmitResponse>('/v1/images/generations', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  async generateVideo(params: ApimartVideoRequest): Promise<ApimartSubmitResponse> {
    return this.request<ApimartSubmitResponse>('/v1/videos/generations', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  async getTaskStatus(taskId: string): Promise<ApimartTaskStatusResponse> {
    return this.request<ApimartTaskStatusResponse>(`/v1/tasks/${encodeURIComponent(taskId)}?language=es`)
  }

  async getBalance(): Promise<ApimartBalanceResponse> {
    return this.request<ApimartBalanceResponse>('/v1/user/balance')
  }

  async uploadImage(source: Buffer | Uint8Array | string, defaultMime = 'image/png'): Promise<string> {
    if (!source) throw new Error('APIMart uploadImage: no source provided')

    // If already a remote URL, return as is
    if (typeof source === 'string') {
      const trimmed = source.trim()
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed
      }
    }

    let buffer: Buffer
    let filename = 'upload.png'
    let mimeType = defaultMime

    if (Buffer.isBuffer(source)) {
      buffer = source
    } else if (source instanceof Uint8Array) {
      buffer = Buffer.from(source)
    } else if (typeof source === 'string') {
      const trimmed = source.trim()
      if (trimmed.startsWith('file://')) {
        const filePath = decodeURIComponent(trimmed.replace(/^file:\/\/\/?/, '')).replace(/^\/([a-zA-Z]:)/, '$1')
        buffer = await fs.readFile(filePath)
        filename = path.basename(filePath)
      } else if (syncFs.existsSync(trimmed) && syncFs.statSync(trimmed).isFile()) {
        buffer = await fs.readFile(trimmed)
        filename = path.basename(trimmed)
      } else if (trimmed.startsWith('data:')) {
        const match = trimmed.match(/^data:([^;]+);base64,(.+)$/s)
        if (match) {
          mimeType = match[1]
          buffer = Buffer.from(match[2], 'base64')
        } else {
          buffer = Buffer.from(trimmed, 'base64')
        }
      } else {
        buffer = Buffer.from(trimmed, 'base64')
      }
    } else {
      throw new Error('APIMart uploadImage: unsupported source type')
    }

    if (filename === 'upload.png' || !filename.includes('.')) {
      const ext = mimeType.includes('png')
        ? '.png'
        : mimeType.includes('jpeg') || mimeType.includes('jpg')
        ? '.jpg'
        : mimeType.includes('webp')
        ? '.webp'
        : mimeType.includes('gif')
        ? '.gif'
        : '.png'
      filename = `upload_${Date.now()}${ext}`
    }

    const formData = new FormData()
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType })
    formData.append('file', blob, filename)

    const res = await this.request<ApimartUploadResponse>('/v1/uploads/images', {
      method: 'POST',
      body: formData,
    })

    if (!res?.url) {
      throw new Error(`APIMart upload succeeded but returned no url: ${JSON.stringify(res)}`)
    }

    return res.url
  }

  async downloadAsset(url: string): Promise<Buffer> {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to download asset (${res.status}): ${res.statusText}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}
