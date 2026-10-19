export type SeedanceResolution = '480p' | '720p' | '1080p' | '4k'
export type SeedanceAspectRatio = '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9'

// ─── Seedance 2.0 ───────────────────────────────────────────

export interface Seedance20T2VInput {
  prompt: string
  duration?: number
  resolution?: SeedanceResolution
  aspect_ratio?: SeedanceAspectRatio
  generate_audio?: boolean
}

export interface Seedance20I2VInput {
  prompt?: string
  image_url: string
  end_image_url?: string
  duration?: number
  resolution?: SeedanceResolution
  aspect_ratio?: SeedanceAspectRatio
  generate_audio?: boolean
}

export interface Seedance20Ref2VInput {
  prompt?: string
  image_urls?: string[]
  video_urls?: string[]
  audio_urls?: string[]
  duration?: number
  resolution?: SeedanceResolution
  aspect_ratio?: SeedanceAspectRatio
  generate_audio?: boolean
}

export type Seedance20Input = Seedance20T2VInput | Seedance20I2VInput | Seedance20Ref2VInput

// ─── Seedance 2.5 ───────────────────────────────────────────

export interface Seedance25T2VInput {
  prompt: string
  duration?: number
  resolution?: '480p' | '720p' | '1080p'
  aspect_ratio?: SeedanceAspectRatio
  bitrate_mode?: 'standard' | 'high'
  output_format?: 'mp4' | 'mov'
  generate_audio?: boolean
}

export interface Seedance25I2VInput {
  prompt?: string
  image_url: string
  end_image_url?: string
  duration?: number
  resolution?: '480p' | '720p' | '1080p'
  bitrate_mode?: 'standard' | 'high'
  output_format?: 'mp4' | 'mov'
  generate_audio?: boolean
}

export interface Seedance25Ref2VInput {
  prompt?: string
  image_urls?: string[]
  video_urls?: string[]
  audio_urls?: string[]
  duration?: number
  resolution?: '480p' | '720p' | '1080p'
  aspect_ratio?: SeedanceAspectRatio
  bitrate_mode?: 'standard' | 'high'
  output_format?: 'mp4' | 'mov'
  generate_audio?: boolean
}

export interface Seedance25VideoEditInput {
  prompt: string
  video_url: string
  bitrate_mode?: 'standard' | 'high'
  output_format?: 'mp4' | 'mov'
}

export interface Seedance25VideoExtendInput {
  prompt: string
  video_url: string
  duration?: number
  bitrate_mode?: 'standard' | 'high'
  output_format?: 'mp4' | 'mov'
}

export type Seedance25Input =
  | Seedance25T2VInput
  | Seedance25I2VInput
  | Seedance25Ref2VInput
  | Seedance25VideoEditInput
  | Seedance25VideoExtendInput

export type SeedanceInput = Seedance20Input | Seedance25Input

// ─── Kling 3.0 ──────────────────────────────────────────────

export interface Kling30StdInput {
  prompt?: string
  image_url?: string
  sound?: 'on' | 'off'
  duration?: number
  elements?: string[]
  cfg_scale?: number
  multi_shots?: boolean
  aspect_ratio?: '16:9' | '9:16' | '1:1'
  multi_prompt?: Array<{
    prompt: string
    duration: number
  }>
}

// ─── Wan 3.0 ────────────────────────────────────────────────

export interface Wan30Input {
  prompt?: string
  image_url?: string
  end_image_url?: string
  image_urls?: string[]
  video_urls?: string[]
  audio_urls?: string[]
  duration?: number
  resolution?: '480p' | '720p' | '1080p'
  aspect_ratio?: string
  generate_audio?: boolean
}

// ─── Wan 3.0 Prime ──────────────────────────────────────────

export type Wan30PrimeResolution = '480p' | '720p' | '1080p'
export type Wan30PrimeAspectRatio = '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive'

export interface Wan30PrimeCommonInput {
  prompt: string
  seed?: number
  duration?: number
  resolution?: Wan30PrimeResolution
  aspect_ratio?: Wan30PrimeAspectRatio
  generate_audio?: boolean
  enable_thinking?: boolean
}

export interface Wan30PrimeT2VInput extends Wan30PrimeCommonInput {}

export interface Wan30PrimeI2VInput extends Wan30PrimeCommonInput {
  image_url: string
  end_image_url?: string
}

export interface Wan30PrimeRef2VInput extends Wan30PrimeCommonInput {
  image_urls?: string[]
  video_urls?: string[]
  audio_urls?: string[]
  file_url?: string
  link_url?: string
}

export type Wan30PrimeInput = Wan30PrimeT2VInput | Wan30PrimeI2VInput | Wan30PrimeRef2VInput

// ─── MiniMax H3 / Hailuo ────────────────────────────────────

export interface MiniMaxH3Input {
  prompt?: string
  image_url?: string
  duration?: number
  resolution?: string
  aspect_ratio?: string
  aigc_watermark?: boolean
  prompt_optimizer?: boolean
}

export interface MiniMaxH3RefInput {
  prompt: string
  duration?: number
  image_urls?: string[]
  video_urls?: string[]
  audio_urls?: string[]
  resolution?: '2K'
  aspect_ratio?: string
  aigc_watermark?: boolean
}

export type MiniMaxHailuoInput = MiniMaxH3Input


// ─── Image Models ───────────────────────────────────────────

export interface HiggsfieldImageInput {
  prompt: string
  aspect_ratio?: string
  resolution?: '720p' | '1080p' | string
  batch_size?: number
  seed?: number
  negative_prompt?: string
  [key: string]: any
}

// ─── Marketing Studio ───────────────────────────────────────

export interface MarketingStudioPresetItem {
  id: string
  type: string
  name: string
}

export interface MarketingStudioPresetsResponse {
  total: number
  cursor: string | null
  items: MarketingStudioPresetItem[]
}

export interface MarketingStudioImageInput {
  prompt: string
  quality?: 'low' | 'medium' | 'high'
  preset_id?: string
  image_urls?: string[]
  moderation?: 'auto' | 'low'
  resolution?: '1k' | '2k' | '4k'
  aspect_ratio?: 'auto' | '1:1' | '3:2' | '2:3' | '4:3' | '3:4' | '16:9' | '9:16' | '21:9'
  enhance_prompt?: boolean
}

// ─── AI Influencer (character sheet) ────────────────────────

export type AiInfluencerTier =
  | 'normal' | 'freak' | 'total'
  | 'insects' | 'frogs' | 'cats' | 'dogs' | 'capybaras' | 'birds'

export interface AiInfluencerInput {
  tier?: AiInfluencerTier
  /** Category key → option keys (each category has its own max) */
  selection?: Record<string, string[]>
  /** Identity reference photo; does not count toward item_image_urls */
  image_url?: string | null
  /** Up to 3 clothing / footwear / item references */
  item_image_urls?: string[]
  /** Up to 4,000 chars */
  brief?: string
  /** 1 – 1,000,000 */
  seed?: number | null
  /** Human tiers must use 0 */
  variation_index?: number
  /** #RRGGBB, animal tiers only */
  body_color?: string | null
  /** Insect species id, only with tier="insects" */
  pinned_species?: string | null
}

export interface AiInfluencerOption {
  key: string
  label: string
  img: string | null
  color: string | null
  tiers: string[] | null
  slot: string | null
  exclusive?: boolean
}

export interface AiInfluencerCategory {
  key: string
  label: string
  tiers: string[]
  max: number
  options: AiInfluencerOption[]
}

export interface AiInfluencerOptionsResponse {
  config_revision: string
  categories: AiInfluencerCategory[]
}

// ─── Genjutsu Motion Transfer ───────────────────────────────

export interface GenjutsuMotionTransferInput {
  prompt?: string
  /** Source video, min 4 s; longer than 30 s is trimmed */
  video_url: string
  /** 1 – 8 references (characters, locations, styles) */
  image_urls: string[]
  resolution?: '480p' | '720p' | '1080p'
}

// ─── Cinema Studio 4.0 ──────────────────────────────────────

/** Creative-control fields. Omit one to let the director pick it; "auto" is rejected */
export const CINEMA_STUDIO_4_CONTROLS = {
  era: ['1960s', '1980s', '1990s', '2000s', '2020s'],
  genre: ['epic', 'drama', 'noir', 'comedy', 'horror', 'action'],
  light: ['silhouette', 'practicals', 'window', 'overhead-fall', 'contre-jour', 'soft-cross'],
  pacing: ['chaotic', 'dynamic', 'calm', 'single-shot'],
  camera_lens: ['clean-sharp', 'anamorphic', 'vintage-anamorphic', 'warm-vintage', 'halation-vintage'],
  camera_model: ['modern', '35mm-film', '8mm-film', 'dv-camcorder'],
  camera_aperture: ['f14-wide-open', 'f4-moderate', 'f11-deep-focus'],
  camera_movement: [
    'snorricam', 'robot-arm', 'tilt-up', 'rack-focus', 'tilt-down', 'pov', 'pan-left', 'crane-up',
    'pan-right', 'crane-down', 'side-tracking', 'pedestal-up', 'pedestal-down', 'handheld', 'tracking',
    'drone-orbit', 'dolly-zoom', 'aerial-pullback', 'static-shot', 'bullet-time', 'whip-pan',
    'slow-zoom-in', 'arc-left', 'slow-zoom-out', 'arc-right', 'truck-right', 'dolly-in', 'truck-left',
    'dolly-out', 'slider-right', 'crush-zoom', 'slider-left', 'helicopter-shot',
  ],
  color_palette: [
    'static-noon', 'twilight-fable', 'back-row-kissing-seats', 'on-the-other-side-of-the-porthole',
    'the-emerald-ambush', 'highway-standoff', 'the-faded-fresco', 'oil-ochre', 'the-mountain-convent',
    'ghost-in-the-code', 'pink-velvet', 'two-days-to-the-horizon', 'industrial-fog', 'stairs-go-up',
    'field-post', 'home-is-the-next-gas-station', 'glossy-flesh', 'the-crimson-ballet',
    'neon-rain-at-midnight', 'the-morning-after-rain', 'the-iron-borough', 'the-ground',
    'the-investigation', 'turquoise-mirage', 'a-dream-in-color', 'breakfast-on-schedule', 'favela-gold',
    'a-hotel-for-one', 'after-dark', 'crimson-vigi', 'the-neighbors-saw-everything', 'the-grey-channel',
    'mirage-at-noon', 'bubblegum-boulevard', 'yellow-room', 'the-earth-keeps-things-reluctantly',
    'tropic-fever-dream', 'bioluminescent-night', 'dont-turn-it-off-im-watching',
    'the-silk-curtain-falls', 'the-butterfly', 'playtime', 'wallpaper-romance', 'overtime',
    'the-way-home-is-longer', 'everyone-speaks-in-whispers', 'runaway-summer', 'amber-wasteland',
    'the-circus', 'gasoline-sunset',
  ],
} as const

export type CinemaStudio4Control = keyof typeof CINEMA_STUDIO_4_CONTROLS

export type CinemaStudio4Input = {
  prompt: string
  /** 4 – 30 s, default 5 */
  duration?: number
  resolution?: '480p' | '720p'
  aspect_ratio?: SeedanceAspectRatio
  generate_audio?: boolean
  /** Prompt tokens <<<image_1>>>, <<<video_1>>>, <<<audio_1>>> point into these, one-based */
  image_urls?: string[]
  video_urls?: string[]
  audio_urls?: string[]
} & { [K in CinemaStudio4Control]?: (typeof CINEMA_STUDIO_4_CONTROLS)[K][number] }

export type HiggsfieldVideoInput = SeedanceInput | Kling30StdInput | Wan30Input | Wan30PrimeInput | MiniMaxH3Input | MiniMaxH3RefInput | MiniMaxHailuoInput
export type HiggsfieldModelInput = HiggsfieldVideoInput | HiggsfieldImageInput | MarketingStudioImageInput | AiInfluencerInput | GenjutsuMotionTransferInput | CinemaStudio4Input | Record<string, any>

// ─── Storage / Uploads ──────────────────────────────────────

export interface HiggsfieldUploadUrlResponse {
  public_url: string
  upload_url: string
  content_type: string
  upload_headers?: Record<string, string>
}

// ─── Task Status ────────────────────────────────────────────

export type HiggsfieldTaskStatus =
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'nsfw'
  | 'canceled'

export interface HiggsfieldPendingStatus {
  request_id: string
  status_url: string
  cancel_url: string
  status: 'queued' | 'in_progress' | 'nsfw' | 'canceled'
}

export interface HiggsfieldFailedStatus {
  request_id: string
  status_url: string
  cancel_url: string
  status: 'failed'
  error: string
}

export interface HiggsfieldCompletedStatus {
  request_id: string
  status_url: string
  cancel_url: string
  status: 'completed'
  video?: {
    url: string
  }
  images?: Array<{ url: string }>
  image?: { url: string }
  output?: { url: string }
  zip?: { url: string }
  mov?: { url: string }
  jsx?: { url: string }
  fbx?: { url: string }
  ply?: { url: string }
}

export type HiggsfieldStatusResponse =
  | HiggsfieldPendingStatus
  | HiggsfieldFailedStatus
  | HiggsfieldCompletedStatus
