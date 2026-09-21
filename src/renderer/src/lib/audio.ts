import { Mic, AudioLines } from 'lucide-react'
import { AUDIO_MODELS, cleanModelName, type ProviderId } from './models'

export const MODEL_NAMES: Record<string, string> = {
  // Voice / TTS
  'elevenlabs-tts': 'ElevenLabs TTS',
  'gpt-tts-1': 'GPT TTS',
  'minimax-text-to-speech': 'MiniMax TTS',
  'qwen-3-tts': 'Qwen 3 TTS',
  'elevenlabs-tts-kie': 'ElevenLabs TTS (KIE)',
  'fal-ai/dia-tts': 'Dia TTS',
  'fal-ai/orpheus-tts': 'Orpheus TTS',
  'fal-ai/qwen-audio-3-tts': 'Qwen Audio 3.0 TTS',
  'fal-ai/kokoro': 'Kokoro TTS',
  'fal-ai/gemini-tts': 'Gemini TTS',
  'fal-ai/xai-tts': 'xAI TTS',
  'fal-ai/elevenlabs/tts': 'ElevenLabs TTS (Fal)',
  'google/gemini-3.1-flash-tts': 'Gemini 3.1 Flash TTS',
  'f5-tts': 'F5-TTS',
  'inworld/inworld-tts': 'Inworld TTS',
  'cjwbw/kokoro': 'Kokoro',
  'lucataco/xtts-v2': 'XTTS v2',
  'machgen/Eleven-v3': 'Eleven-v3',
  'machgen/Eleven-SFX-v2': 'Eleven-SFX-v2',
  'machgen/kokoro-82m': 'Kokoro-82M',
  'machgen/fish-speech': 'Fish-Speech',
  'kokoro-82m': 'Kokoro-82M',
  'fish-speech': 'Fish-Speech',

  // Music
  'machgen/Eleven-Music-v2': 'Eleven-Music-v2',
  'elevenlabs:music': 'ElevenLabs Music',
  'elevenlabs-music': 'ElevenLabs Music',
  'elevenlabs-music-v2-5': 'ElevenLabs Music v2.5',
  'elevenlabs:sfx': 'ElevenLabs SFX',
  'suno-v4': 'Suno v4 / v4.5',
  'suno-v3-5': 'Suno v3.5',
  'fal-ai/minimax/music-3': 'MiniMax Music 3',
  'fal-ai/minimax-music': 'MiniMax Music 2.0',
  'fal-ai/cassette-ai': 'CassetteAI',
  'fal-ai/sonilo': 'Sonilo V1.1',
  'fal-ai/stable-audio-open': 'Stable Audio Open',
  'fal-ai/elevenlabs/music': 'ElevenLabs Music (Fal)',
  'google/lyria-3': 'Lyria 3',
  'stability-ai/stable-audio-2.5': 'Stable Audio 2.5',
  'stability-ai/stable-audio-open-1.0': 'Stable Audio Open 1.0',
  'meta/musicgen': 'MusicGen',
  'machgen/stable-audio': 'Stable Audio Open',
  'stable-audio': 'Stable Audio Open',
  'openaudio-text-to-music': 'OpenAudio Music',
  'mucat-text-to-music': 'MuCat Music',
}

export const KIND_ICON: Record<string, typeof Mic> = {
  voice: Mic,
  music: AudioLines,
}

export function getAudioKind(asset: any): 'voice' | 'music' | null {
  const model = asset.modelUsed || ''

  // 1. Explicit parameter check
  try {
    const p = typeof asset.parameters === 'string' ? JSON.parse(asset.parameters || '{}') : (asset.parameters || {})
    if (p.kind === 'voice') return 'voice'
    if (p.kind === 'music') return 'music'
  } catch {}

  // 2. Lookup in catalog
  const found = AUDIO_MODELS.find(
    (m) =>
      m.t2aId === model ||
      m.name === model ||
      m.modelId === model ||
      (m.t2aId && model.endsWith(m.t2aId))
  )
  if (found?.kind) return found.kind

  // 3. Prefix & heuristic matching
  if (
    model.startsWith('piper:') ||
    model.startsWith('kokoro:') ||
    model.includes('tts') ||
    model.includes('speech') ||
    model.includes('inworld') ||
    model.includes('xtts') ||
    (model.startsWith('elevenlabs:') && model !== 'elevenlabs:sfx' && model !== 'elevenlabs:music')
  ) {
    return 'voice'
  }

  if (
    model.includes('music') ||
    model.includes('suno') ||
    model.includes('audio-open') ||
    model.includes('stable-audio') ||
    model.includes('cassette') ||
    model.includes('sonilo') ||
    model.includes('lyria') ||
    model === 'elevenlabs:sfx'
  ) {
    return 'music'
  }

  return null
}

export function getAudioProvider(asset: any): ProviderId | null {
  if (!asset) return null
  const model = asset.modelUsed || ''

  // 1. Explicit parameter check
  try {
    const p = typeof asset.parameters === 'string' ? JSON.parse(asset.parameters || '{}') : (asset.parameters || {})
    if (p.provider) return p.provider as ProviderId
    if (p.engine === 'elevenlabs' || (typeof p.engine === 'string' && p.engine.startsWith('elevenlabs'))) return 'elevenlabs'
    if (p.engine === 'local') return 'local'
  } catch {}

  // 2. Catalog check
  const found = AUDIO_MODELS.find(
    (m) =>
      m.t2aId === model ||
      m.name === model ||
      m.modelId === model ||
      (m.t2aId && model.endsWith(m.t2aId))
  )
  if (found?.provider) return found.provider

  // 3. Heuristic matching
  if (model.startsWith('piper:') || model.startsWith('kokoro:')) return 'local'
  if (model.startsWith('elevenlabs:') || model.startsWith('elevenlabs-')) return 'elevenlabs'
  if (model.startsWith('fal-ai/')) return 'fal'
  if (model.startsWith('machgen/')) return 'machgen'
  if (
    model.startsWith('google/') ||
    model.startsWith('stability-ai/') ||
    model.startsWith('meta/') ||
    model.startsWith('cjwbw/') ||
    model.startsWith('inworld/') ||
    model.startsWith('lucataco/')
  ) {
    return 'replicate'
  }
  if (model.startsWith('suno-') || model.startsWith('gpt-tts') || model.startsWith('minimax-') || model.startsWith('qwen-')) {
    return 'kie'
  }

  return null
}

export function formatAudioModelLabel(model: string | undefined): string {
  if (!model) return '—'
  if (model.startsWith('piper:')) return `Piper · ${model.slice(6)}`
  if (model.startsWith('kokoro:')) return `Kokoro · ${model.slice(7)}`
  if (model.startsWith('elevenlabs:vc:')) return `ElevenLabs VC · ${model.slice(13)}`
  if (model.startsWith('elevenlabs:') && model !== 'elevenlabs:music' && model !== 'elevenlabs:sfx') {
    return `ElevenLabs · ${model.slice(11)}`
  }
  return cleanModelName(MODEL_NAMES[model] || model)
}
