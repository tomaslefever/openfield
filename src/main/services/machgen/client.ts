import * as fs from 'fs/promises'
import * as syncFs from 'fs'
import * as path from 'path'
import type { MachgenTaskInput, MachgenSubmitResponse, MachgenTaskStatusResponse, MachgenAccountResponse, MachgenUploadResponse } from './types'

export class MachgenApiClient {
  private apiKey: string
  private baseUrl = 'https://api.machgen.ai'

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim()
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey.trim()
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
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
        if (body?.detail) {
          errDetail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
        } else if (body?.error_msg) {
          errDetail = body.error_msg
        } else if (body?.error) {
          errDetail = typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
        }
      } catch {
        try {
          const text = await res.text()
          if (text) errDetail = text.substring(0, 300)
        } catch {}
      }
      throw new Error(`MachGen API error (${res.status}): ${errDetail}`)
    }

    return res.json() as Promise<T>
  }

  async generate(input: MachgenTaskInput): Promise<MachgenSubmitResponse> {
    return this.request<MachgenSubmitResponse>('/api/v0/generate', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async getTaskStatus(taskId: string): Promise<MachgenTaskStatusResponse> {
    return this.request<MachgenTaskStatusResponse>(`/api/v0/tasks/${taskId}`)
  }

  async uploadSource(source: Buffer | Uint8Array | string, defaultMime = 'image/png'): Promise<string> {
    if (!source) throw new Error('MachGen uploadSource: no source provided')

    // If already a remote URL or @input reference, return as is
    if (typeof source === 'string') {
      const trimmed = source.trim()
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('@input/')) {
        return trimmed
      }
    }

    let buffer: Buffer
    let filename = 'upload'
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
        // Raw base64
        buffer = Buffer.from(trimmed, 'base64')
      }
    } else {
      throw new Error('MachGen uploadSource: unsupported source type')
    }

    if (filename === 'upload') {
      const ext = mimeType.includes('png') ? '.png'
        : mimeType.includes('jpeg') || mimeType.includes('jpg') ? '.jpg'
        : mimeType.includes('webp') ? '.webp'
        : mimeType.includes('mp4') ? '.mp4'
        : mimeType.includes('mpeg') || mimeType.includes('mp3') ? '.mp3'
        : '.bin'
      filename = `source_${Date.now()}${ext}`
    }

    const formData = new FormData()
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType })
    formData.append('file', blob, filename)

    const res = await this.request<MachgenUploadResponse>('/api/v0/upload', {
      method: 'POST',
      body: formData,
    })

    if (!res?.artifact_path) {
      throw new Error('MachGen upload succeeded but returned no artifact_path')
    }

    return `@input/${res.artifact_path}`
  }

  async getAccount(): Promise<MachgenAccountResponse> {
    return this.request<MachgenAccountResponse>('/api/v0/billing/account')
  }

  async downloadAsset(urlOrTaskId: string): Promise<Buffer> {
    const url = urlOrTaskId.startsWith('http')
      ? urlOrTaskId
      : `${this.baseUrl}/api/v0/assets/${urlOrTaskId}`

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to download asset (${res.status}): ${res.statusText}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}
