/**
 * Base Replicate client: holds credentials and the low-level HTTP layer.
 * Endpoint implementations live in `endpoints/` and are composed into the
 * public `ReplicateApiClient` class in `index.ts`.
 */
export class ReplicateApiClient {
  readonly apiKey: string
  readonly baseUrl: string
  readonly timeout: number

  constructor(apiKey: string, options?: { baseUrl?: string; timeout?: number }) {
    this.apiKey = apiKey
    this.baseUrl = options?.baseUrl || 'https://api.replicate.com/v1'
    this.timeout = options?.timeout || 600000
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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

      let body: any = null
      const text = await response.text()
      try { body = text ? JSON.parse(text) : null } catch { body = null }

      if (!response.ok) {
        const detail = body?.detail || body?.error || `HTTP ${response.status}`
        console.error('[Replicate] API error:', response.status, endpoint, body)
        throw new Error(`Replicate API error (${response.status}): ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
      }

      return body as T
    } catch (err: any) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') throw new Error('Replicate request timed out')
      throw err
    }
  }
}
