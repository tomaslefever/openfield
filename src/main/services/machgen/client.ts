import type { MachgenTaskInput, MachgenSubmitResponse, MachgenTaskStatusResponse, MachgenAccountResponse } from './types'

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
