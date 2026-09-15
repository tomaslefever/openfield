import type { PVideoAvatarInput } from './types'

export interface ReplicateModelCatalogEntry {
  id: string
  name: string
  category: string
  version: string
  type: 'video'
  costPerSecond: number
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
]

export type PVideoAvatarParams = Partial<PVideoAvatarInput>
