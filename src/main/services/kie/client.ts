// Documented response codes from the API (see createTask response schema)
export const ERROR_CODE_MESSAGES: Record<number, string> = {
  401: 'Unauthorized - check your API key',
  402: 'Insufficient credits',
  404: 'Not found',
  422: 'Validation error',
  429: 'Rate limited - try again later',
  433: 'Request limit exceeded',
  455: 'Service unavailable (maintenance)',
  500: 'Server error',
  501: 'Generation failed',
  505: 'Feature disabled',
}

/**
 * Base KIE.ai client: holds credentials and the low-level HTTP layer.
 * Endpoint implementations live in `endpoints/` and are composed
 * into the public `OpenfieldApiClient` class in `index.ts`.
 */
export class OpenfieldApiClient {
  readonly apiKey: string
  readonly baseUrl: string
  readonly timeout: number

  constructor(apiKey: string, options?: { baseUrl?: string; timeout?: number }) {
    this.apiKey = apiKey
    this.baseUrl = options?.baseUrl || 'https://api.kie.ai'
    this.timeout = options?.timeout || 300000
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
      clearTimeout(timeoutId)

      const body = await response.json()

      const isError = !response.ok
        || (typeof body.code === 'number' && body.code !== 200)
        || (body.msg && body.msg !== 'success')
      if (isError) {
        const codeMsg = typeof body.code === 'number' ? ERROR_CODE_MESSAGES[body.code] : null
        const detail = body.msg && body.msg !== 'success' ? body.msg : ''
        const errMsg = codeMsg ? `${codeMsg}${detail ? `: ${detail}` : ''}` : (detail || `Openfield API Error (${response.status})`)
        console.error('[OF] API error:', response.status, endpoint, body)
        throw new Error(errMsg)
      }

      return body
    } catch (err: any) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') throw new Error('Request timed out')
      throw err
    }
  }
}
