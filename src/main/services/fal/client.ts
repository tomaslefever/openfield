/**
 * Base fal.ai client: holds credentials and the low-level HTTP layer for the
 * queue REST API. Endpoint implementations live in `endpoints/` and are
 * composed into the public `FalApiClient` class in `index.ts`.
 */
export class FalApiClient {
  readonly apiKey: string
  readonly baseUrl: string
  readonly timeout: number

  constructor(apiKey: string, options?: { baseUrl?: string; timeout?: number }) {
    this.apiKey = apiKey
    this.baseUrl = options?.baseUrl || 'https://queue.fal.run'
    this.timeout = options?.timeout || 600000
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Key ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      })

      let body: any = null
      const text = await response.text()
      try { body = text ? JSON.parse(text) : null } catch { body = null }

      if (!response.ok) {
        const detail = body?.detail || body?.error || `HTTP ${response.status}`
        console.error('[FAL] API error:', response.status, endpoint, body)
        throw new Error(`fal.ai API error (${response.status}): ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
      }

      return body as T
    } catch (err: any) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') throw new Error('fal.ai request timed out')
      throw err
    }
  }
}
