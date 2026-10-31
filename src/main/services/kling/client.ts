import * as fs from 'fs/promises'
import * as syncFs from 'fs'
import type {
  KlingImageToVideoRequest,
  KlingResponse,
  KlingTask,
  KlingTaskSummary,
  KlingTextToVideoRequest,
} from './types'

export class KlingApiClient {
  private apiKey: string
  // Endpoint for servers outside mainland China (api.klingai.com was retired)
  private baseUrl = 'https://api-singapore.klingai.com'

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim()
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey.trim()
  }

  private async request<T>(endpointPath: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...((options.headers as Record<string, string>) || {}),
      },
    })

    let body: KlingResponse<T> | null = null
    try {
      body = await res.json()
    } catch {}

    // Kling reports errors both as HTTP status and as a non-zero `code` in a 200 body
    if (!res.ok || !body || body.code !== 0) {
      const detail = body?.message || `HTTP ${res.status} ${res.statusText}`
      const code = body?.code != null ? ` code ${body.code}` : ''
      throw new Error(`Kling API error (${res.status}${code}): ${detail}`)
    }
    return body.data
  }

  async textToVideo(model: string, params: KlingTextToVideoRequest): Promise<KlingTaskSummary> {
    return this.request<KlingTaskSummary>(`/text-to-video/${encodeURIComponent(model)}`, {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  async imageToVideo(model: string, params: KlingImageToVideoRequest): Promise<KlingTaskSummary> {
    return this.request<KlingTaskSummary>(`/image-to-video/${encodeURIComponent(model)}`, {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  async getTask(taskId: string): Promise<KlingTask> {
    const tasks = await this.request<KlingTask[]>(`/tasks?task_ids=${encodeURIComponent(taskId)}`)
    const task = Array.isArray(tasks) ? tasks.find((t) => t.id === taskId) || tasks[0] : null
    if (!task) throw new Error(`Kling task ${taskId} not found`)
    return task
  }

  /**
   * Image input as Kling accepts it: a public URL as is, anything else as raw base64
   * (no data: prefix). Accepts URLs, data URIs, raw base64 and local file paths.
   */
  async toImageInput(source: string): Promise<string> {
    const trimmed = source.trim()
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
    if (trimmed.startsWith('data:')) return trimmed.replace(/^data:[^;]+;base64,/s, '')
    const filePath = trimmed.startsWith('file://')
      ? decodeURIComponent(trimmed.replace(/^file:\/\/\/?/, '')).replace(/^\/([a-zA-Z]:)/, '$1')
      : trimmed
    if (filePath.length < 1024 && syncFs.existsSync(filePath) && syncFs.statSync(filePath).isFile()) {
      return (await fs.readFile(filePath)).toString('base64')
    }
    return trimmed
  }

  async downloadAsset(url: string): Promise<Buffer> {
    // Output URLs are signed CDN links: no auth header
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to download asset (${res.status}): ${res.statusText}`)
    return Buffer.from(await res.arrayBuffer())
  }
}
