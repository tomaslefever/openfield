import type { KlingModelDef } from './types'

const DURATIONS_3_15 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const DURATIONS_3_20 = Array.from({ length: 18 }, (_, i) => i + 3)
const DURATIONS_3_30 = Array.from({ length: 28 }, (_, i) => i + 3)

// Prices from https://kling.ai/document-api/pricing/base/video (checked 2026-11-05): 1 unit =
// $0.14 for Kling 3.x, $0.157 for Kling 4.0 / 4.0 Flash (Flagship Resource Pack).
// Kling 4.0 / 4.0 Flash bill a reference video at `costWithVideoInput` × max(output × 2, input + output) s.
// A new Kling version that ships on the same "new API" (e.g. Kling 4.0) only needs an entry here
// plus its twin in the renderer's VIDEO_MODELS.
export const KLING_MODELS: KlingModelDef[] = [
  {
    // Kling 4.0 Flash (GA 2026-11-04, Flagship Resource Pack): 720p only, 3-20 s, always native
    // audio. Image-to-video takes a first frame only; Omni (POST /omni-video/kling-4.0-flash)
    // takes up to 10 images and 5 feature videos.
    // Docs: https://kling.ai/document-api/api/video/4-0-flash/video-omni (+ /text-to-video, /image-to-video)
    id: 'kling-4.0-flash',
    name: 'Kling 4.0 Flash',
    category: 'Kling',
    type: 'video',
    supportsTextToVideo: true,
    supportsFirstFrame: true,
    supportsLastFrame: false,
    audioSetting: false,
    multiShot: false,
    multiShotSetting: false,
    omni: { maxImages: 10, maxVideos: 5, maxTotal: 15, maxVideoSeconds: 20, aspectRatios: ['21:9', '16:9', '9:16', '1:1', 'adaptive'] },
    durationOptions: DURATIONS_3_20,
    resolutions: ['720p'],
    aspectRatios: ['21:9', '16:9', '9:16', '1:1'],
    pricing: [{ resolution: '720p', cost: 0.094, costWithVideoInput: 0.063 }],
    unit: 's',
  },
  {
    // Kling 4.0 (needs the Flagship Resource Pack): always native audio, no audio or
    // multi_shot setting; up to 10 frames (first + 8 middle + last). Omni takes up to
    // 10 images and 5 feature videos (https://kling.ai/document-api/api/video/4-0/video-omni)
    id: 'kling-4.0',
    name: 'Kling 4.0',
    category: 'Kling',
    type: 'video',
    supportsTextToVideo: true,
    supportsFirstFrame: true,
    supportsLastFrame: true,
    audioSetting: false,
    multiShot: false,
    multiShotSetting: false,
    middleFrames: 8,
    omni: { maxImages: 10, maxVideos: 5, maxTotal: 15, maxVideoSeconds: 30, aspectRatios: ['21:9', '16:9', '9:16', '1:1', 'adaptive'] },
    durationOptions: DURATIONS_3_30,
    resolutions: ['720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1', '21:9'],
    pricing: [
      { resolution: '720p', cost: 0.157, costWithVideoInput: 0.094 },
      { resolution: '1080p', cost: 0.235, costWithVideoInput: 0.141 },
    ],
    unit: 's',
  },
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
    .replace(/\/(t2v|i2v|fflf|omni)$/, '')
    .trim()
    .toLowerCase()
  return KLING_MODELS.find((m) => m.id === cleaned || m.name.toLowerCase() === cleaned)
}
