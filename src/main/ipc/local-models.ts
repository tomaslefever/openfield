import type { IpcContext } from './context'
import { getServerManager, detectPython, detectHardware } from '../services/local-models/server-manager'
import { getLocalInference } from '../services/local-models/local-inference'
import { PiperEngine } from '../services/local-models/engines/piper'
import { KokoroEngine } from '../services/local-models/engines/kokoro'
import { getAssetManager } from '../services/asset-manager'
import { getRawDb } from '../db'

export function registerLocalModelsHandlers({ handle }: IpcContext) {
  // ─── Server Manager ────────────────────────────────
  handle('local:server:status', () => {
    return getServerManager().getState()
  })

  handle('local:server:start', async () => {
    await getServerManager().start()
    return getServerManager().getState()
  })

  handle('local:server:stop', async () => {
    await getServerManager().stop()
    return getServerManager().getState()
  })

  handle('local:server:panic', () => {
    getServerManager().panicKill()
    return getServerManager().getState()
  })

  // ─── System Detection ──────────────────────────────
  handle('local:detectPython', async () => {
    return detectPython()
  })

  handle('local:detectHardware', async () => {
    return detectHardware()
  })

  // ─── Piper TTS ─────────────────────────────────────
  handle('local:piper:isInstalled', () => {
    return new PiperEngine().isInstalled()
  })

  handle('local:piper:install', async (event) => {
    const piper = new PiperEngine()
    await piper.install((msg, pct) => {
      event.sender.send('models:download:progress', { modelId: 'piper', progress: pct, status: pct >= 100 ? 'completed' : 'downloading' })
    })
    return true
  })

  handle('local:piper:getVoices', () => {
    return new PiperEngine().getAvailableVoices()
  })

  handle('local:piper:isVoiceDownloaded', (_e, voiceId: string) => {
    return new PiperEngine().isVoiceDownloaded(voiceId)
  })

  handle('local:piper:downloadVoice', async (event, voiceId: string) => {
    const piper = new PiperEngine()
    await piper.downloadVoice(voiceId, (pct) => {
      event.sender.send('models:download:progress', { modelId: `piper-voice-${voiceId}`, progress: pct, status: pct >= 100 ? 'completed' : 'downloading' })
    })
    return true
  })

  handle('local:piper:generate', async (_e, params) => {
    const piper = new PiperEngine()
    return piper.generate(params)
  })

  // ─── Kokoro TTS ────────────────────────────────────
  handle('local:kokoro:isInstalled', () => {
    return new KokoroEngine().isInstalled()
  })

  handle('local:kokoro:getVoices', async () => {
    return new KokoroEngine().getVoices()
  })

  handle('local:kokoro:install', async (event) => {
    const kokoro = new KokoroEngine()
    await kokoro.ensurePythonDeps((msg, pct) => {
      event.sender.send('models:download:progress', { modelId: 'kokoro', progress: pct, status: pct >= 100 ? 'completed' : 'downloading', message: msg })
    })
    return true
  })

  // ─── Local Audio Generation (Piper / Kokoro TTS) ────
  handle('local:audio:generate', async (event, params) => {
    const sender = event.sender
    const kokoro = new KokoroEngine()
    const useKokoro = params.engine === 'kokoro' || (params.voiceId && kokoro.hasVoice(params.voiceId))

    if (useKokoro) {
      if (!kokoro.isInstalled()) {
        throw new Error('Kokoro-82M no está descargado. Descárgalo desde el Model Marketplace.')
      }
      sender.send('local:audio:progress', { status: 'preparing', message: 'Preparando Kokoro...', pct: 5 })
      await kokoro.ensurePythonDeps((msg, pct) => {
        sender.send('local:audio:progress', {
          status: 'installing_deps',
          message: msg || 'Instalando dependencias de Kokoro (solo la primera vez)...',
          pct: Math.max(5, Math.min(80, pct)),
        })
      })
      sender.send('local:audio:progress', { status: 'generating', message: 'Generando audio con Kokoro...', pct: 85 })
      const wavPath = await kokoro.generate({ text: params.prompt || '', voice: params.voiceId, speed: params.speed || 1 })
      const asset = await getAssetManager().importFile(wavPath, 'audio')
      const db = getRawDb()
      db.prepare(
        'UPDATE assets SET prompt = ?, model_used = ?, credits_used = 0 WHERE id = ?'
      ).run(params.prompt || '', `kokoro:${params.voiceId}`, asset.id)
      db.saveSync()
      sender.send('local:audio:progress', { status: 'completed', message: 'Audio generado', pct: 100 })
      return asset
    }

    const piper = new PiperEngine()
    if (!(await piper.isInstalled())) {
      throw new Error('Piper no está instalado. Instálalo en la pestaña Kokoro (TTS) del Marketplace.')
    }
    let voiceId = params.voiceId
    if (!voiceId || !piper.isVoiceDownloaded(voiceId)) {
      const downloaded = piper.getAvailableVoices().find(v => piper.isVoiceDownloaded(v.id))
      if (downloaded) voiceId = downloaded.id
    }
    if (!voiceId || !piper.isVoiceDownloaded(voiceId)) {
      throw new Error('Ninguna voz de Piper descargada. Descarga una voz en la pestaña Kokoro (TTS) del Marketplace.')
    }

    const wavPath = await piper.generate({ text: params.prompt || '', voice: voiceId, speed: params.speed || 1 })

    const asset = await getAssetManager().importFile(wavPath, 'audio')
    const db = getRawDb()
    db.prepare(
      'UPDATE assets SET prompt = ?, model_used = ?, credits_used = 0 WHERE id = ?'
    ).run(params.prompt || '', `piper:${voiceId}`, asset.id)
    db.saveSync()
    return asset
  })

  // ─── Local Image Generation ───────────────────────
  handle('local:image:generate', async (event, params) => {
    const sender = event.sender
    try {
      sender.send('local:image:progress', { status: 'starting_server', progress: 5 })
      const inference = getLocalInference()

      sender.send('local:image:progress', { status: 'loading_model', progress: 15 })
      const asset = await inference.generateAndImport(params)

      sender.send('local:image:progress', { status: 'completed', progress: 100 })
      sender.send('local:image:completed', asset)
      return asset
    } catch (err: any) {
      sender.send('local:image:error', { message: err.message || 'Unknown error' })
      throw err
    }
  })

  handle('local:server:loadModel', async (_e, modelId: string, device?: string) => {
    return getLocalInference().loadModel(modelId, device)
  })

  handle('local:server:unloadModel', async () => {
    return getLocalInference().unloadModel()
  })

  handle('local:server:modelInfo', async () => {
    return getLocalInference().getModelInfo()
  })
}
