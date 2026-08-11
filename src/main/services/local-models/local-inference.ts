import { getServerManager } from './server-manager'
import { getModelRegistry } from './model-registry'
import { getRawDb, getAssetSubDir } from '../../db'
import { getAssetManager } from '../asset-manager'
import * as path from 'path'
import * as fs from 'fs'

export class LocalInferenceClient {
  private get baseUrl(): string {
    const mgr = getServerManager()
    const state = mgr.getState()
    if (state.status !== 'running' || !state.port) {
      throw new Error('Local model server is not running')
    }
    return `http://localhost:${state.port}`
  }

  async ensureServer(): Promise<void> {
    const mgr = getServerManager()
    if (mgr.getState().status !== 'running') {
      await mgr.start()
    }
  }

  async loadModel(modelId: string, device?: string): Promise<void> {
    await this.ensureServer()
    const res = await fetch(`${this.baseUrl}/v1/models/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: modelId, device: device || 'cuda' }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Failed to load model: ${text}`)
    }
  }

  async unloadModel(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/v1/models/unload`, { method: 'POST' })
    } catch {}
  }

  async getStatus(): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/status`)
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }

  async getModelInfo(): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models/info`, { method: 'POST' })
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }

  async generateImage(params: {
    modelId: string
    prompt: string
    negativePrompt?: string
    width?: number
    height?: number
    steps?: number
    guidance?: number
    seed?: number
  }): Promise<string> {
    await this.ensureServer()

    const registry = getModelRegistry()
    const model = registry.get(params.modelId)
    if (!model) {
      throw new Error(`Model not installed: ${params.modelId}. Download it from the marketplace first.`)
    }

    const res = await fetch(`${this.baseUrl}/v1/image/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_id: params.modelId,
        prompt: params.prompt,
        negative_prompt: params.negativePrompt || '',
        width: params.width || 1024,
        height: params.height || 1024,
        steps: params.steps || 4,
        guidance: params.guidance || 0,
        seed: params.seed ?? -1,
      }),
      signal: AbortSignal.timeout(600_000),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Generation failed: ${text}`)
    }

    const data = await res.json()
    return data.output_path
  }

  async generateAndImport(params: {
    modelId: string
    prompt: string
    negativePrompt?: string
    width?: number
    height?: number
    steps?: number
    guidance?: number
    seed?: number
  }): Promise<any> {
    const outputPath = await this.generateImage(params)

    // Touch last used
    const registry = getModelRegistry()
    registry.touch(params.modelId)

    // Import the generated file as an asset
    const assetManager = getAssetManager()
    const asset = await assetManager.importFile(outputPath, 'image')

    // Update asset metadata with generation info
    const db = getRawDb()
    const model = registry.get(params.modelId)
    const modelName = model?.displayName || params.modelId
    db.prepare(
      'UPDATE assets SET prompt = ?, model_used = ?, credits_used = 0 WHERE id = ?'
    ).run(params.prompt, modelName, asset.id)
    db.saveSync()

    return asset
  }

  // ── TTS ────────────────────────────────────────────────

  async listVoices(): Promise<any[]> {
    await this.ensureServer()
    const res = await fetch(`${this.baseUrl}/v1/tts/voices`)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Failed to list voices: ${text}`)
    }
    const data = await res.json()
    return data.voices || []
  }

  async loadTTS(): Promise<void> {
    await this.ensureServer()
    const res = await fetch(`${this.baseUrl}/v1/tts/load`, { method: 'POST' })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Failed to load TTS model: ${text}`)
    }
  }

  async unloadTTS(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/v1/tts/unload`, { method: 'POST' })
    } catch {}
  }

  async generateTTS(params: {
    text: string
    voice: string
    speed?: number
  }): Promise<string> {
    await this.ensureServer()

    const res = await fetch(`${this.baseUrl}/v1/tts/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: params.text,
        voice: params.voice,
        speed: params.speed || 1.0,
      }),
      signal: AbortSignal.timeout(600_000),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`TTS generation failed: ${text}`)
    }

    const data = await res.json()
    return data.output_path
  }
}

let instance: LocalInferenceClient | null = null

export function getLocalInference(): LocalInferenceClient {
  if (!instance) instance = new LocalInferenceClient()
  return instance
}
