export type PipelineTag = 'text-to-image' | 'text-to-video' | 'text-to-speech'
export type ModelEngine = 'diffusers' | 'ltx_video' | 'kokoro' | 'piper'
export type ModelStatus = 'ready' | 'downloading' | 'installing' | 'error'
export type ServerStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface InstalledModel {
  id: string
  pipelineTag: PipelineTag
  displayName: string
  description: string
  version: string
  sizeBytes: number
  path: string
  installedAt: number
  lastUsedAt: number | null
  license: string
  minVram: number
  engine: ModelEngine
  status: ModelStatus
  downloadProgress: number
  errorMessage: string | null
}

export interface MarketplaceModel {
  id: string
  pipelineTag: PipelineTag
  displayName: string
  description: string
  author: string
  downloads: number
  likes: number
  license: string
  tags: string[]
  updatedAt: string
  siblings: MarketplaceFile[]
  cardData: Record<string, unknown>
  recommendedVariant: string | null
  minVram: number | null
  downloadFilter?: string[]
}

export interface MarketplaceFile {
  filename: string
  size: number
}

export interface MarketplaceSearchParams {
  pipelineTag?: PipelineTag
  query?: string
  license?: string
  library?: string
  sort?: 'downloads' | 'likes' | 'lastModified'
  limit?: number
  offset?: number
}

export interface MarketplaceSearchResult {
  models: MarketplaceModel[]
  total: number
  hasMore: boolean
}

export interface DownloadJob {
  modelId: string
  bytesDownloaded: number
  totalBytes: number
  progress: number
  speedBytesPerSec: number
  etaSeconds: number
  status: 'downloading' | 'paused' | 'verifying' | 'completed' | 'error' | 'cancelled'
  errorMessage: string | null
}

export interface ServerState {
  status: ServerStatus
  port: number | null
  pid: number | null
  gpuName: string | null
  vramTotal: number | null
  vramFree: number | null
  loadedModels: string[]
  startedAt: number | null
}

export interface HardwareInfo {
  gpu: { name: string; vramBytes: number; cudaVersion: string } | null
  cpuCores: number
  cpuModel: string
  ramBytes: number
  platform: string
  recommendedModels: string[]
}

export interface TTSRequest {
  text: string
  voice: string
  speed?: number
  outputFormat?: 'wav' | 'mp3'
}

export interface PiperVoice {
  id: string
  language: string
  gender: string
  quality: 'low' | 'medium' | 'high'
  sizeBytes: number
  url: string
}

export interface LoadModelParams {
  modelId: string
  device?: 'cuda' | 'cpu' | 'mps'
  precision?: 'fp32' | 'fp16' | 'bf16' | 'fp8'
}

export interface PythonInfo {
  path: string
  version: string
  hasCuda: boolean
  cudaVersion: string | null
  missingDeps: string[]
}

export const CURATED_MODELS: MarketplaceModel[] = [
  {
    id: 'black-forest-labs/FLUX.1-schnell',
    pipelineTag: 'text-to-image',
    displayName: 'FLUX.1 Schnell',
    description: 'Modelo de 4 pasos para generacion rapida de imagenes. Excelente balance calidad-velocidad.',
    author: 'Black Forest Labs',
    downloads: 1520000,
    likes: 8500,
    license: 'apache-2.0',
    tags: ['flux', 'text-to-image', 'fast', 'high-quality'],
    updatedAt: '2025-03-15',
    siblings: [],
    cardData: {},
    recommendedVariant: 'fp16',
    minVram: 12,
  },
  {
    id: 'Lightricks/LTX-Video',
    pipelineTag: 'text-to-video',
    displayName: 'LTX-Video 2B Distilled',
    description: 'Modelo de video generativo. Genera hasta 10s de video en ~30 segundos. Soporta I2V y T2V.',
    author: 'Lightricks',
    downloads: 450000,
    likes: 3200,
    license: 'openrail',
    tags: ['ltx', 'video', 'text-to-video', 'image-to-video', 'real-time'],
    updatedAt: '2025-07-16',
    siblings: [],
    cardData: {},
    recommendedVariant: '2b-distilled-fp8',
    minVram: 8,
  },
  {
    id: 'hexgrad/Kokoro-82M',
    pipelineTag: 'text-to-speech',
    displayName: 'Kokoro 82M v1.0',
    description: 'TTS de alta calidad con solo 82M parametros. Soporta ingles, espanol, frances, japones, chino, coreano.',
    author: 'hexgrad',
    downloads: 280000,
    likes: 1800,
    license: 'apache-2.0',
    tags: ['tts', 'text-to-speech', 'lightweight', 'multilingual'],
    updatedAt: '2025-01-10',
    siblings: [],
    cardData: {},
    recommendedVariant: null,
    minVram: 1,
  },
  {
    id: 'MeiGen-AI/InfiniteTalk',
    pipelineTag: 'text-to-speech',
    displayName: 'InfiniteTalk',
    description: 'Modelo de voz/audio en tiempo real de MeiGen AI. Se descarga la variante cuantizada fp8 multi (ingles y chino).',
    author: 'MeiGen-AI',
    downloads: 18739,
    likes: 237,
    license: 'apache-2.0',
    tags: ['infinitetalk', 'speech', 'audio', 'real-time'],
    updatedAt: '2025-09-04',
    siblings: [],
    cardData: {},
    recommendedVariant: 'multi-fp8',
    minVram: 8,
    downloadFilter: [
      'quant_models/infinitetalk_multi_fp8.safetensors',
      'quant_models/infinitetalk_multi_fp8.json',
      'quant_models/t5_fp8.safetensors',
      'quant_models/t5_map_fp8.json',
      'quant_models/quant.json',
    ],
  },
]

export const PIPER_VOICES: PiperVoice[] = [
  { id: 'en_US-lessac-medium', language: 'English', gender: 'female', quality: 'medium', sizeBytes: 50000000, url: '' },
  { id: 'en_US-ryan-high', language: 'English', gender: 'male', quality: 'high', sizeBytes: 70000000, url: '' },
  { id: 'es_ES-carlfm-x-low', language: 'Spanish', gender: 'male', quality: 'low', sizeBytes: 30000000, url: '' },
  { id: 'es_MX-claude-x-low', language: 'Spanish (MX)', gender: 'male', quality: 'low', sizeBytes: 28000000, url: '' },
  { id: 'fr_FR-siwis-medium', language: 'French', gender: 'male', quality: 'medium', sizeBytes: 50000000, url: '' },
  { id: 'de_DE-thorsten-medium', language: 'German', gender: 'male', quality: 'medium', sizeBytes: 48000000, url: '' },
  { id: 'ja_JP-jp-medium', language: 'Japanese', gender: 'female', quality: 'medium', sizeBytes: 45000000, url: '' },
  { id: 'zh_CN-huayan-medium', language: 'Chinese', gender: 'female', quality: 'medium', sizeBytes: 52000000, url: '' },
]
