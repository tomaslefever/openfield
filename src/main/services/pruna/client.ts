import type { PrunaFile, PrunaPrediction, PrunaStatusResponse } from './types'

/** Official Pruna P-API client: `apikey` header auth, model chosen by the `Model` header. */
export class PrunaApiClient {
  private apiKey: string
  readonly baseUrl = 'https://api.pruna.ai'

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim()
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey.trim()
  }

  private async request<T>(endpointPath: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpointPath}`, {
      ...options,
      headers: {
        apikey: this.apiKey,
        Accept: 'application/json',
        ...((options.headers as Record<string, string>) || {}),
      },
    })

    const text = await res.text()
    let body: any = null
    try { body = text ? JSON.parse(text) : null } catch {}

    if (!res.ok) {
      // Documented shape: { error: { code, message, details } }; tolerate plain strings too
      const err = body?.error
      const detail = (typeof err === 'string' ? err : err?.message) || body?.message || body?.detail || text.slice(0, 200) || res.statusText
      const code = typeof err === 'object' && err?.code ? ` ${err.code}` : ''
      throw new Error(`Pruna API error (${res.status}${code}): ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
    }
    return body as T
  }

  /** POST /v1/predictions — async: returns the prediction id to poll */
  async createPrediction(model: string, input: Record<string, any>): Promise<PrunaPrediction> {
    return this.request<PrunaPrediction>('/v1/predictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Model: model },
      body: JSON.stringify({ input }),
    })
  }

  /** GET /v1/predictions/status/{id} */
  async getStatus(predictionId: string): Promise<PrunaStatusResponse> {
    return this.request<PrunaStatusResponse>(`/v1/predictions/status/${encodeURIComponent(predictionId)}`)
  }

  /** POST /v1/files — returns the URL to pass in prediction inputs (valid 30 min) */
  async uploadFile(data: Buffer, mime: string, fileName: string): Promise<string> {
    const form = new FormData()
    form.append('content', new Blob([new Uint8Array(data)], { type: mime }), fileName)
    const file = await this.request<PrunaFile>('/v1/files', { method: 'POST', body: form })
    const url = file?.urls?.get
    if (!url) throw new Error(`Pruna file upload returned no URL: ${JSON.stringify(file)}`)
    return url
  }

  /** Downloads a delivery URL (absolute, or a /v1/... path); it needs the API key */
  async download(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    const absolute = /^https?:\/\//.test(url) ? url : `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`
    const res = await fetch(absolute, { headers: { apikey: this.apiKey } })
    if (!res.ok) throw new Error(`Pruna download failed (${res.status}): ${res.statusText}`)
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type')?.split(';')[0]?.trim() || '',
    }
  }
}
