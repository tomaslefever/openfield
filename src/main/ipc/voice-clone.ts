import type { IpcContext } from './context'
import { notifyAssetsChanged } from './assets'
import {
  CLONE_LANGUAGES,
  USD_PER_1K_CHARS,
  createClonedVoice,
  deleteClonedVoice,
  hasFalKey,
  listClonedVoices,
  readReference,
  recloneVoice,
  synthesizeClonedSpeech,
  transcribeReference,
  updateClonedVoice,
} from '../services/voice-clone-service'

/** Voice Studio → "Clonar voz": cloned voices on fal Qwen3-TTS (services/voice-clone-service.ts) */
export function registerVoiceCloneHandlers(ctx: IpcContext) {
  const { handle } = ctx

  handle('voiceClone:info', () => ({ configured: hasFalKey(), languages: CLONE_LANGUAGES, usdPer1kChars: USD_PER_1K_CHARS }))
  handle('voiceClone:list', () => listClonedVoices())
  handle('voiceClone:transcribe', (_e, params) => transcribeReference(params))
  handle('voiceClone:create', (_e, params) => createClonedVoice(params))
  handle('voiceClone:update', (_e, id: string, patch) => updateClonedVoice(id, patch || {}))
  handle('voiceClone:delete', (_e, id: string) => deleteClonedVoice(id))
  handle('voiceClone:reference', (_e, id: string) => readReference(id))
  handle('voiceClone:reclone', async (_e, id: string) => { await recloneVoice(id); return true })

  handle('voiceClone:generate', async (event, params: { voiceId: string; text: string; language?: string }) => {
    const sender = event.sender
    sender.send('local:audio:progress', { status: 'generating', message: 'Generando con tu voz clonada (fal.ai)...', pct: 40 })
    try {
      const result = await synthesizeClonedSpeech({ ...params, source: 'voice-studio' })
      sender.send('local:audio:progress', { status: 'completed', message: 'Audio generado', pct: 100 })
      try { notifyAssetsChanged() } catch {}
      return result
    } catch (err: any) {
      sender.send('local:audio:error', { message: err?.message || String(err) })
      throw err
    }
  })
}
