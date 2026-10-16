import type { KlingModelDef } from './types'

const DURATIONS_3_15 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

// Prices from https://kling.ai/document-api/pricing/base/video (1 unit = $0.14).
// A new Kling version that ships on the same "new API" (e.g. Kling 4.0) only needs an entry here
// plus its twin in the renderer's VIDEO_MODELS.
export const KLING_MODELS: KlingModelDef[] = [
  {
    id: 'kling-3.0',
    name: 'Kling 3.0',
    category: 'Kling',
    type: 'video',
    supportsTextToVideo: true,
    supportsFirstFrame: true,
    supportsLastFrame: true,
    audioSetting: true,
    multiShot: true,
    multiShotSetting: true,
    durationOptions: DURATIONS_3_15,
    resolutions: ['720p', '1080p', '4k'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    pricing: [
      { resolution: '720p', cost: 0.084 },
      { resolution: '720p-audio', cost: 0.126 },
      { resolution: '1080p', cost: 0.112 },
      { resolution: '1080p-audio', cost: 0.168 },
      { resolution: '4k', cost: 0.42 },
    ],
    unit: 's',
  },
  {
    id: 'kling-3.0-turbo',
    name: 'Kling 3.0 Turbo',
    category: 'Kling',
    type: 'video',
    supportsTextToVideo: true,
    supportsFirstFrame: true,
    supportsLastFrame: false,
    audioSetting: false,
    multiShot: true,
    multiShotSetting: false,
    durationOptions: DURATIONS_3_15,
    resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    pricing: [
      { resolution: '720p', cost: 0.112 },
      { resolution: '1080p', cost: 0.14 },
    ],
    unit: 's',
  },
]

export function getKlingModel(modelOrId?: string): KlingModelDef | undefined {
  if (!modelOrId) return undefined
  const cleaned = modelOrId
    .replace(/^klingai\//, '')
    .replace(/\/(t2v|i2v|fflf)$/, '')
    .trim()
    .toLowerCase()
  return KLING_MODELS.find((m) => m.id === cleaned || m.name.toLowerCase() === cleaned)
}
