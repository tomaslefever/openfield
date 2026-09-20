import type { MachgenModelDef } from './types'

export const MACHGEN_MODELS: MachgenModelDef[] = [
  {
    id: 'MiniMax-H3',
    name: 'MiniMax H3 (MachGen)',
    category: 'MiniMax',
    hosting: 'MachGen',
    supportsT2V: true,
    supportsI2V: true,
    supportsEndFrame: true, // Also supports lone end frame keyframe_indices: [-1]
    supportsR2V: true,
    supportsUpscale: true,
    supportsVideoRef: true,
    supportsAudioRef: true,
    allowedHeights: [480, 768, 1440],
    allowedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'],
    allowedDurations: [5, 6, 8, 10, 12, 15],
    defaultFps: 24,
    prices: [
      { resolution: '480p', height: 480, costPerSec: 0.035 },
      { resolution: '768p', height: 768, costPerSec: 0.04 },
      { resolution: '1440p', height: 1440, costPerSec: 0.10 },
    ],
  },
  {
    id: 'LTX-2.3-Pro',
    name: 'LTX-2.3-Pro (MachGen)',
    category: 'Lightricks',
    hosting: 'MachGen',
    supportsT2V: true,
    supportsI2V: true,
    supportsEndFrame: true, // start + end frame [0, -1]
    supportsR2V: false,
    supportsUpscale: false,
    allowedHeights: [540, 720, 1080],
    allowedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    allowedDurations: [5, 6, 8, 10],
    defaultFps: 24,
    prices: [
      { resolution: '540p', height: 540, costPerSec: 0.008 },
      { resolution: '720p', height: 720, costPerSec: 0.015 },
      { resolution: '1080p', height: 1080, costPerSec: 0.03 },
    ],
  },
  {
    id: 'Wan2.2-A14B',
    name: 'Wan2.2-A14B (MachGen)',
    category: 'Wan',
    hosting: 'MachGen',
    supportsT2V: true,
    supportsI2V: true,
    supportsEndFrame: false,
    supportsR2V: false,
    supportsUpscale: false,
    allowedHeights: [480, 720],
    allowedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    allowedDurations: [5, 6, 8, 10],
    defaultFps: 16,
    defaultInferSteps: 30,
    prices: [
      { resolution: '480p', height: 480, costPerSec: 0.018 },
      { resolution: '720p', height: 720, costPerSec: 0.036 },
    ],
  },
]

export function getMachgenModel(modelOrId?: string): MachgenModelDef | undefined {
  if (!modelOrId) return undefined
  const clean = modelOrId.replace(/^machgen\//, '').replace(/\/(t2v|i2v|fflf|ref|upscale)$/, '')
  return MACHGEN_MODELS.find(m => m.id.toLowerCase() === clean.toLowerCase() || m.name.toLowerCase() === clean.toLowerCase() || m.id.toLowerCase() === modelOrId.toLowerCase())
}
