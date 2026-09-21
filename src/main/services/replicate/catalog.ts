import type { PVideoAvatarInput } from './types'

export interface ReplicateModelCatalogEntry {
  id: string
  name: string
  category: string
  version?: string
  type: 'video' | 'image' | 'audio'
  costPerSecond?: number
  costPerImage?: number
  resolutions: string[]
  voices?: string[]
  languages?: string[]
}

export const P_VIDEO_AVATAR_VERSION = '8a54bb678ef43a7a40950731bad3f33f4ac904267fecebd2186c826a6da6f5a5'
export const P_VIDEO_VERSION = '4420187a2059aa9ec6836c7da161eb11dce9afda5310e29e1d9f65efa9fd58ad'
export const CRYSTAL_UPSCALER_VERSION = 'a1817a6d378e6734bbdf8a184a6eca7870401891550ef9064a902a695241ad67'

export const P_VIDEO_AVATAR_VOICES = [
  'Zephyr (Female)', 'Puck (Male)', 'Charon (Male)', 'Kore (Female)', 'Fenrir (Male)',
  'Leda (Female)', 'Orus (Male)', 'Aoede (Female)', 'Callirrhoe (Female)', 'Autonoe (Female)',
  'Enceladus (Male)', 'Iapetus (Male)', 'Umbriel (Male)', 'Algenib (Male)', 'Despina (Female)',
  'Erinome (Female)', 'Laomedeia (Female)', 'Achernar (Female)', 'Algieba (Male)', 'Schedar (Male)',
  'Gacrux (Female)', 'Pulcherrima (Female)', 'Achird (Male)', 'Zubenelgenubi (Male)',
  'Vindemiatrix (Female)', 'Sadachbia (Male)', 'Sadaltager (Male)', 'Sulafat (Female)',
  'Alnilam (Male)', 'Rasalgethi (Male)',
]

export const P_VIDEO_AVATAR_LANGUAGES = [
  'English (US)', 'English (UK)', 'Spanish', 'French', 'German', 'Italian',
  'Portuguese (Brazil)', 'Japanese', 'Korean', 'Hindi',
]

export const REPLICATE_MODELS: ReplicateModelCatalogEntry[] = [
  {
    id: 'prunaai/p-video-avatar',
    name: 'P-Video Avatar',
    category: 'PrunaAI',
    version: P_VIDEO_AVATAR_VERSION,
    type: 'video',
    costPerSecond: 0.025,
    resolutions: ['720p', '1080p'],
    voices: P_VIDEO_AVATAR_VOICES,
    languages: P_VIDEO_AVATAR_LANGUAGES,
  },
  {
    id: 'prunaai/p-video',
    name: 'P-Video',
    category: 'PrunaAI',
    version: P_VIDEO_VERSION,
    type: 'video',
    costPerSecond: 0.02,
    resolutions: ['720p', '1080p'],
  },
  {
    id: 'philz1337x/crystal-video-upscaler',
    name: 'Crystal Video Upscaler',
    category: 'Crystal',
    version: CRYSTAL_UPSCALER_VERSION,
    type: 'video',
    costPerSecond: 0.1,
    resolutions: [],
  },
  // Video models
  { id: 'runway/gen-4.5', name: 'Runway Gen-4.5', category: 'Runway', type: 'video', costPerSecond: 0.10, resolutions: ['720p', '1080p'] },
  { id: 'google/veo-3.1', name: 'Veo 3.1', category: 'Google', type: 'video', costPerSecond: 0.15, resolutions: ['720p', '1080p'] },
  { id: 'kling-ai/kling-video-3.0', name: 'Kling 3.0', category: 'Kling', type: 'video', costPerSecond: 0.08, resolutions: ['720p'] },
  { id: 'kling-ai/kling-v1.5-pro', name: 'Kling 1.5 Pro', category: 'Kling', type: 'video', costPerSecond: 0.05, resolutions: ['720p'] },
  { id: 'wan-video/wan-2.1', name: 'Wan 2.1 Video', category: 'Wan', type: 'video', costPerSecond: 0.025, resolutions: ['720p'] },
  { id: 'lightricks/ltx-video', name: 'LTX-Video', category: 'Lightricks', type: 'video', costPerSecond: 0.01, resolutions: ['720p'] },
  { id: 'minimax/video-01', name: 'MiniMax Video-01', category: 'MiniMax', type: 'video', costPerSecond: 0.03, resolutions: ['720p'] },

  // Image models
  { id: 'black-forest-labs/flux-dev', name: 'FLUX.1 Dev', category: 'Flux', type: 'image', costPerImage: 0.025, resolutions: ['1K'] },
  { id: 'black-forest-labs/flux-schnell', name: 'FLUX.1 Schnell', category: 'Flux', type: 'image', costPerImage: 0.003, resolutions: ['1K'] },
  { id: 'black-forest-labs/flux-1.1-pro', name: 'FLUX 1.1 Pro', category: 'Flux', type: 'image', costPerImage: 0.040, resolutions: ['1K'] },
  { id: 'ideogram-ai/ideogram-v2', name: 'Ideogram v2', category: 'Ideogram', type: 'image', costPerImage: 0.080, resolutions: ['1K'] },
  { id: 'ideogram-ai/ideogram-v2-turbo', name: 'Ideogram v2 Turbo', category: 'Ideogram', type: 'image', costPerImage: 0.040, resolutions: ['1K'] },
  { id: 'google/imagen-3', name: 'Imagen 3', category: 'Google', type: 'image', costPerImage: 0.030, resolutions: ['1K'] },
  { id: 'recraft-ai/recraft-v3', name: 'Recraft V3', category: 'Recraft', type: 'image', costPerImage: 0.040, resolutions: ['1K'] },

  // Audio / TTS models
  { id: 'google/gemini-3.1-flash-tts', name: 'Gemini 3.1 Flash TTS', category: 'Google', type: 'audio', resolutions: [] },
  { id: 'f5-tts', name: 'F5-TTS', category: 'F5', type: 'audio', resolutions: [] },
  { id: 'inworld/inworld-tts', name: 'Inworld TTS', category: 'Inworld', type: 'audio', resolutions: [] },
  { id: 'cjwbw/kokoro', name: 'Kokoro', category: 'Kokoro', type: 'audio', resolutions: [] },
  { id: 'lucataco/xtts-v2', name: 'XTTS v2', category: 'Coqui', type: 'audio', resolutions: [] },

  // Music models
  { id: 'google/lyria-3', name: 'Lyria 3', category: 'Google', type: 'audio', resolutions: [] },
  { id: 'stability-ai/stable-audio-2.5', name: 'Stable Audio 2.5', category: 'Stability', type: 'audio', resolutions: [] },
  { id: 'stability-ai/stable-audio-open-1.0', name: 'Stable Audio Open 1.0', category: 'Stability', type: 'audio', resolutions: [] },
  { id: 'meta/musicgen', name: 'MusicGen', category: 'Meta', type: 'audio', resolutions: [] },
]

export type PVideoAvatarParams = Partial<PVideoAvatarInput>

export function getReplicateModel(modelId: string): ReplicateModelCatalogEntry | undefined {
  return REPLICATE_MODELS.find(m => m.id === modelId)
}
