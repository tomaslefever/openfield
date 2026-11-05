import type { PVideoAvatarInput } from './types'

export interface ReplicateModelCatalogEntry {
  id: string
  name: string
  category: string
  version?: string
  /** Replicate's owner/name when the id is prefixed to stay unique across providers */
  apiModel?: string
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
  // Pruna P-2 family (docs.api.pruna.ai/guides/models). No pinned version: runs the latest
  // through /models/{owner}/{name}/predictions. P-Video 2 Pro and its reference variant are one
  // model in the UI; the composer routes to -reference when refs are attached.
  {
    id: 'prunaai/p-video-2',
    name: 'P-Video 2',
    category: 'PrunaAI',
    type: 'video',
    costPerSecond: 0.025,
    resolutions: ['720p', '1080p'],
  },
  {
    id: 'prunaai/p-video-2-pro',
    name: 'P-Video 2 Pro',
    category: 'PrunaAI',
    type: 'video',
    costPerSecond: 0.035,
    resolutions: ['480p', '768p'],
  },
  {
    id: 'prunaai/p-video-2-pro-reference',
    name: 'P-Video 2 Pro',
    category: 'PrunaAI',
    type: 'video',
    costPerSecond: 0.035,
    resolutions: ['480p', '768p'],
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
  // Lipsync: re-syncs the mouth of an existing video to a new audio track (billed per output second)
  { id: 'sync/lipsync-2-pro', name: 'Lipsync 2 Pro', category: 'Sync', type: 'video', costPerSecond: 0.08325, resolutions: [] },
  // Pruna's talking avatar (portrait + audio or a script spoken with Gemini TTS, 1 s–3 min).
  // $0.02 / $0.04 / $0.06 / $0.08 / $0.12 per second at 480p / 768p / 1080p / 2k / 4k
  {
    id: 'prunaai/p-video-2-pro-avatar',
    name: 'P-Video 2 Pro Avatar',
    category: 'PrunaAI',
    type: 'video',
    costPerSecond: 0.04,
    resolutions: ['480p', '768p', '1080p', '2k', '4k'],
    voices: P_VIDEO_AVATAR_VOICES,
    languages: P_VIDEO_AVATAR_LANGUAGES,
  },
  // Video models
  { id: 'runway/gen-4.5', name: 'Runway Gen-4.5', category: 'Runway', type: 'video', costPerSecond: 0.10, resolutions: ['720p', '1080p'] },
  { id: 'google/veo-3.1', name: 'Veo 3.1', category: 'Google', type: 'video', costPerSecond: 0.15, resolutions: ['720p', '1080p'] },
  // Veo 3.1 Lite (always with audio): $0.05/s 720p, $0.08/s 1080p; 4/6/8 s, 1080p only at 8 s
  { id: 'google/veo-3.1-lite', name: 'Veo 3.1 Lite', category: 'Google', type: 'video', costPerSecond: 0.05, resolutions: ['720p', '1080p'] },
  // Veo 3.1 Fast: $0.15/s with audio, $0.10/s without (any resolution); 4/6/8 s
  { id: 'google/veo-3.1-fast', name: 'Veo 3.1 Fast', category: 'Google', type: 'video', costPerSecond: 0.15, resolutions: ['720p', '1080p'] },
  // Kling 3.0 is published by kwaivgi (kling-ai/* answers 404; see REPLICATE_LEGACY_IDS).
  // Per second: standard (720p) $0.168, $0.252 with audio; pro (1080p) $0.224, $0.336 with audio; 4k $0.42
  { id: 'kwaivgi/kling-v3-video', name: 'Kling 3.0', category: 'Kling', type: 'video', costPerSecond: 0.168, resolutions: ['720p', '1080p', '4K'] },
  // Kling 1.5 Pro is no longer on Replicate (kling-ai/kling-v1.5-pro and kwaivgi/kling-v1.5-pro
  // both answer 404). Kept so old assets resolve; Kling 4.0 replaces it.
  { id: 'kling-ai/kling-v1.5-pro', name: 'Kling 1.5 Pro', category: 'Kling', type: 'video', costPerSecond: 0.05, resolutions: ['720p'] },
  // Kling 4.0: text, keyframes (start / up to 8 middle / end), reference images and videos, or
  // video edit (base_video); 3–30 s. $0.157/s 720p, $0.235/s 1080p; with any video input
  // $0.094 / $0.141 per second, billed on output + max(input, output) seconds
  { id: 'kwaivgi/kling-v4.0', name: 'Kling 4.0', category: 'Kling', type: 'video', costPerSecond: 0.157, resolutions: ['720p', '1080p'] },
  // MiniMax H3 Lite / Highspeed (t2v, first/last frame, references). Prices include the
  // launch discount Replicate shows (−50% until the end of 2026): Lite $0.0125/s 480P, $0.02/s 768P;
  // Highspeed $0.03/s (768P only). Ids are prefixed: bare minimax/* routes to fal.
  { id: 'replicate/minimax/h3-lite', apiModel: 'minimax/h3-lite', name: 'MiniMax H3 Lite', category: 'MiniMax', type: 'video', costPerSecond: 0.02, resolutions: ['768P', '480P'] },
  { id: 'replicate/minimax/h3-highspeed', apiModel: 'minimax/h3-highspeed', name: 'MiniMax H3 Highspeed', category: 'MiniMax', type: 'video', costPerSecond: 0.03, resolutions: ['768P'] },
  { id: 'wan-video/wan-2.1', name: 'Wan 2.1 Video', category: 'Wan', type: 'video', costPerSecond: 0.025, resolutions: ['720p'] },
  { id: 'lightricks/ltx-video', name: 'LTX-Video', category: 'Lightricks', type: 'video', costPerSecond: 0.01, resolutions: ['720p'] },
  { id: 'minimax/video-01', name: 'MiniMax Video-01', category: 'MiniMax', type: 'video', costPerSecond: 0.03, resolutions: ['720p'] },

  // Image models
  { id: 'black-forest-labs/flux-dev', name: 'FLUX.1 Dev', category: 'Flux', type: 'image', costPerImage: 0.025, resolutions: ['1K'] },
  { id: 'black-forest-labs/flux-schnell', name: 'FLUX.1 Schnell', category: 'Flux', type: 'image', costPerImage: 0.003, resolutions: ['1K'] },
  { id: 'black-forest-labs/flux-1.1-pro', name: 'FLUX 1.1 Pro', category: 'Flux', type: 'image', costPerImage: 0.040, resolutions: ['1K'] },
  { id: 'ideogram-ai/ideogram-v2', name: 'Ideogram v2', category: 'Ideogram', type: 'image', costPerImage: 0.080, resolutions: ['1K'] },
  { id: 'ideogram-ai/ideogram-v2-turbo', name: 'Ideogram v2 Turbo', category: 'Ideogram', type: 'image', costPerImage: 0.040, resolutions: ['1K'] },
  { id: 'replicate/google/nano-banana-2.1', apiModel: 'google/nano-banana-2.1', name: 'Nano Banana 2.1', category: 'Google', type: 'image', costPerImage: 0.034, resolutions: ['1K', '2K', '4K'] },
  { id: 'google/imagen-3', name: 'Imagen 3', category: 'Google', type: 'image', costPerImage: 0.030, resolutions: ['1K'] },
  { id: 'recraft-ai/recraft-v3', name: 'Recraft V3', category: 'Recraft', type: 'image', costPerImage: 0.040, resolutions: ['1K'] },
  // GPT Image 2.6 (2026-11-04). Billed per image by quality: low $0.05, medium $0.09, high $0.128,
  // xhigh $0.25, max $0.50 (auto bills as $0.25, so "high" is sent explicitly)
  { id: 'openai/gpt-image-2.6-flare', name: 'GPT Image 2.6 Flare', category: 'OpenAI', type: 'image', costPerImage: 0.128, resolutions: ['1K', '2K', '4K'] },
  { id: 'openai/gpt-image-2.6-sunburst', name: 'GPT Image 2.6 Sunburst', category: 'OpenAI', type: 'image', costPerImage: 0.128, resolutions: ['1K', '2K', '4K'] },
  // FLUX 3 (text-to-image and edit with up to 10 images): $0.024 1k, $0.035 1.5k, $0.05 2k, $0.3035 4k
  { id: 'black-forest-labs/flux-3-image', name: 'FLUX 3', category: 'Flux', type: 'image', costPerImage: 0.024, resolutions: ['1K', '2K', '4K'] },
  // Ideogram 4.5 (generate, or edit up to 5 source images): medium $0.06 (low $0.03, high $0.10 /
  // $0.22 with source images). Precise Edit: one source + up to 4 references, medium $0.06
  { id: 'ideogram-ai/ideogram-4-5', name: 'Ideogram 4.5', category: 'Ideogram', type: 'image', costPerImage: 0.06, resolutions: ['1K'] },
  { id: 'ideogram-ai/ideogram-4-5-precise-edit', name: 'Ideogram 4.5 Precise Edit', category: 'Ideogram', type: 'image', costPerImage: 0.06, resolutions: ['1K'] },
  // Krea 3 (fast thinking): $0.03 1k, $0.06 2k, plus $0.02 per megapixel of input images
  { id: 'krea/krea-3', name: 'Krea 3', category: 'Krea', type: 'image', costPerImage: 0.03, resolutions: ['1K', '2K'] },

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

/**
 * Ids that no longer exist on Replicate, mapped to the model that replaced them under its official
 * owner. Old renderer entries and stored tasks keep working: they run under the new id.
 */
export const REPLICATE_LEGACY_IDS: Record<string, string> = {
  'kling-ai/kling-video-3.0': 'kwaivgi/kling-v3-video',
}

/** The catalog id a model id runs as (legacy ids resolve to their replacement) */
export function resolveReplicateModelId(modelId: string): string {
  return REPLICATE_LEGACY_IDS[modelId] || modelId
}

export function getReplicateModel(modelId: string): ReplicateModelCatalogEntry | undefined {
  const id = resolveReplicateModelId(modelId)
  return REPLICATE_MODELS.find(m => m.id === id)
}
