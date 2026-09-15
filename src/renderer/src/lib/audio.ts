import { Mic, AudioLines } from 'lucide-react'

export const MODEL_NAMES: Record<string, string> = {
  'gpt-tts-1': 'GPT TTS',
  'minimax-text-to-speech': 'MiniMax TTS',
  'openaudio-text-to-music': 'OpenAudio Music',
  'mucat-text-to-music': 'MuCat Music',
  'elevenlabs:music': 'ElevenLabs Music',
  'elevenlabs:sfx': 'ElevenLabs SFX',
}

export const KIND_ICON: Record<string, typeof Mic> = {
  voice: Mic,
  music: AudioLines,
}

export function getAudioKind(asset: any): 'voice' | 'music' | null {
  const model = asset.modelUsed || ''
  if (model.startsWith('piper:') || model.startsWith('kokoro:') || (model.startsWith('elevenlabs:') && model !== 'elevenlabs:sfx' && model !== 'elevenlabs:music') || model === 'gpt-tts-1' || model === 'minimax-text-to-speech') return 'voice'
  if (model === 'openaudio-text-to-music' || model === 'mucat-text-to-music' || model === 'elevenlabs:sfx' || model === 'elevenlabs:music') return 'music'
  try {
    const p = JSON.parse(asset.parameters || '{}')
    if (p.kind === 'voice') return 'voice'
    if (p.kind === 'music') return 'music'
  } catch {}
  return null
}
