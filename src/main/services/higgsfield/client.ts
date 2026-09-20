import type { Seedance20Input, Seedance25Input, Kling30StdInput, HiggsfieldStatusResponse } from './types'

export class HiggsfieldApiClient {
  private apiKey: string
  private baseUrl = 'https://api.higgsfield.ai'

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim()
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey.trim()
  }

  private getAuthHeader(): string {
    return `Key ${this.apiKey}`
  }

  private async request<T>(urlOrPath: string, options: RequestInit = {}): Promise<T> {
    const url = urlOrPath.startsWith('http')
      ? urlOrPath
      : `${this.baseUrl}${urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`}`

    const headers: Record<string, string> = {
      'Authorization': this.getAuthHeader(),
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
      throw new Error(`Higgsfield API error (${res.status}): ${errDetail}`)
    }

    return res.json() as Promise<T>
  }

  async generateSeedance20(input: Seedance20Input): Promise<HiggsfieldStatusResponse> {
    return this.request<HiggsfieldStatusResponse>('/bytedance/seedance-2.0/text-to-video', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async generateSeedance25(input: Seedance25Input): Promise<HiggsfieldStatusResponse> {
    return this.request<HiggsfieldStatusResponse>('/bytedance/seedance-2.5/text-to-video', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async generateKling30Std(input: Kling30StdInput): Promise<HiggsfieldStatusResponse> {
    return this.request<HiggsfieldStatusResponse>('/kling-video/v3.0/std/text-to-video', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async generate(endpoint: string, input: any): Promise<HiggsfieldStatusResponse> {
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
    const res = await fetch(url, {
      headers: {
        'Authorization': this.getAuthHeader(),
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to download asset (${res.status}): ${res.statusText}`)
    }

    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}
