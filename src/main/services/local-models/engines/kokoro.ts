import * as fs from 'fs'
import * as path from 'path'
import { getModelsDir } from '../../../db'
import { getLocalInference } from '../local-inference'

export const KOKORO_MODEL_ID = 'hexgrad/Kokoro-82M'

export interface KokoroVoice {
  id: string
  langCode: string
  language: string
  fileName: string
  sizeBytes: number
}

export class KokoroEngine {
  getModelDir(): string {
    return path.join(getModelsDir(), KOKORO_MODEL_ID.replace(/\//g, '--'))
  }

  isInstalled(): boolean {
    return fs.existsSync(path.join(this.getModelDir(), 'kokoro-v1_0.pth'))
  }

  async getVoices(): Promise<KokoroVoice[]> {
    try {
      return await getLocalInference().listVoices()
    } catch (err: any) {
      console.error('[Kokoro] listVoices failed:', err?.message || err)
      throw err
    }
  }

  hasVoice(voiceId: string): boolean {
    return fs.existsSync(path.join(this.getModelDir(), 'voices', `${voiceId}.pt`))
  }

  async ensurePythonDeps(onLog?: (line: string, pct: number) => void): Promise<void> {
    onLog?.('Iniciando servidor local...', 5)
    await getLocalInference().ensureServer()
    onLog?.('Servidor local listo', 100)
  }

  async generate(params: { text: string; voice: string; speed?: number; device?: string }): Promise<string> {
    if (!this.isInstalled()) {
      throw new Error('Kokoro-82M no está descargado. Descárgalo desde el Model Marketplace primero.')
    }
    if (!this.hasVoice(params.voice)) {
      throw new Error(`Voz de Kokoro no descargada: ${params.voice}`)
    }

    return await getLocalInference().generateTTS({
      text: params.text,
      voice: params.voice,
      speed: params.speed || 1,
    })
  }
}

export function resetKokoroDepsCheck(): void {
  // No-op — the server handles deps at startup
}
