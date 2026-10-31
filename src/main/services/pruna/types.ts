/** Pruna P-API (https://docs.api.pruna.ai, OpenAPI v0.6.0) */

export type PrunaStatus = 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'

/** POST /v1/predictions (async): the job handle */
export interface PrunaPrediction {
  id: string
  model?: string
  input?: Record<string, any>
  get_url?: string
  /** Only when Try-Sync finished in time */
  status?: PrunaStatus
  generation_url?: string
}

/** GET /v1/predictions/status/{id} */
export interface PrunaStatusResponse {
  status: PrunaStatus
  message?: string
  error?: string
  /** Absolute delivery URL; needs the apikey header and expires 24 h after creation */
  generation_url?: string
  metadata?: Record<string, any>
}

/** POST /v1/files (multipart `content`); files expire 30 min after upload */
export interface PrunaFile {
  id: string
  name?: string
  content_type?: string
  size?: number
  expires_at?: string
  urls: { get: string }
}

export interface PrunaModelDef {
  /** Openfield id ('pruna/<model>'), unique across providers */
  id: string
  /** Value of the `Model` header */
  apiModel: string
  name: string
  category: string
  type: 'video' | 'image'
  resolutions: string[]
  /** Standard $/s by resolution (modes and drafts are priced in the renderer) */
  pricing: { resolution: string; cost: number }[]
  unit: 's' | 'img'
}
