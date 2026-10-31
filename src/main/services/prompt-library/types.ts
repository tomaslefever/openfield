/** Shared shapes and taxonomy of the prompt library (built-in templates and user prompts). */

export type PromptKind = 'image' | 'video'

export type PromptCategory =
  | 'advertising'
  | 'product'
  | 'ugc'
  | 'social'
  | 'food'
  | 'beauty'
  | 'fashion'
  | 'real-estate'
  | 'brand'
  | 'character'
  | 'storyboard'
  | 'editing'
  | 'style'

export const PROMPT_CATEGORIES: Record<PromptCategory, string> = {
  advertising: 'Publicidad',
  product: 'Fotografía de producto',
  ugc: 'UGC',
  social: 'Redes sociales',
  food: 'Gastronomía',
  beauty: 'Belleza y cosmética',
  fashion: 'Moda',
  'real-estate': 'Inmobiliaria',
  brand: 'Marca',
  character: 'Personajes',
  storyboard: 'Storyboard',
  editing: 'Edición',
  style: 'Estilo',
}

/**
 * Model families a prompt is written for. A concrete model id ("nano-banana-pro",
 * "kling-video/v3/text-to-video") matches the family whose slug it contains.
 */
export const MODEL_TAGS: Record<string, { label: string; kind: PromptKind }> = {
  'nano-banana': { label: 'Nano Banana (Gemini Image)', kind: 'image' },
  seedream: { label: 'Seedream', kind: 'image' },
  'gpt-image': { label: 'GPT Image', kind: 'image' },
  flux: { label: 'FLUX / Kontext', kind: 'image' },
  ideogram: { label: 'Ideogram', kind: 'image' },
  'qwen-image': { label: 'Qwen Image', kind: 'image' },
  midjourney: { label: 'Midjourney', kind: 'image' },
  veo: { label: 'Veo', kind: 'video' },
  kling: { label: 'Kling', kind: 'video' },
  seedance: { label: 'Seedance', kind: 'video' },
  sora: { label: 'Sora', kind: 'video' },
  hailuo: { label: 'Hailuo', kind: 'video' },
  wan: { label: 'Wan', kind: 'video' },
  runway: { label: 'Runway', kind: 'video' },
}

export const ALL_IMAGE_MODELS = ['nano-banana', 'seedream', 'gpt-image', 'flux', 'qwen-image']
export const ALL_VIDEO_MODELS = ['veo', 'kling', 'seedance', 'sora', 'hailuo', 'wan', 'runway']

/** Kinds of piece a prompt produces (several per prompt) */
export const PROMPT_TYPES: Record<string, string> = {
  ads: 'Anuncios',
  product: 'Producto',
  'character-sheet': 'Character sheet',
  consistency: 'Consistencia',
  storyboard: 'Storyboard',
  'multi-shot': 'Multi-plano',
  ugc: 'UGC',
  dialogue: 'Diálogo / lip-sync',
  editing: 'Edición',
  'style-reference': 'Referencia de estilo',
  typography: 'Texto / tipografía',
  photorealism: 'Fotorrealismo',
  'image-to-video': 'Imagen a video',
  'camera-motion': 'Movimiento de cámara',
  audio: 'Audio / SFX',
  social: 'Redes',
  food: 'Gastronomía',
  fashion: 'Moda',
  'real-estate': 'Inmobiliaria',
  brand: 'Marca',
}

export interface PromptVariable {
  name: string
  description: string
  example: string
  /** Optional variables may be left empty; the filled prompt drops the placeholder. */
  optional?: boolean
}

/**
 * A visual reference of a built-in template: a bundled file (resources/prompt-library/<file>,
 * openly licensed) or an example image hosted by its source (`url`, shown with credit, not bundled).
 */
export interface BuiltinReference {
  file?: string
  url?: string
  caption: string
  credit: string
  sourceUrl?: string
  license: string
  /** When the example was published (YYYY-MM-DD or YYYY-MM), so agents and reviewers see how current it is */
  date?: string
}

export interface PromptSourceLink {
  title: string
  url: string
}

export interface BuiltinPrompt {
  id: string
  name: string
  kind: PromptKind
  category: PromptCategory
  description: string
  tags: string[]
  /** Model families it is written for (keys of MODEL_TAGS) */
  models: string[]
  /** Kinds of piece (keys of PROMPT_TYPES) */
  types: string[]
  template: string
  variables: PromptVariable[]
  guidance: string[]
  aspectRatios: string[]
  durationSeconds?: number
  references?: BuiltinReference[]
  /** Guides and collections the template was distilled from */
  sources?: PromptSourceLink[]
}

/** Variables most templates share */
export const V = {
  brand: { name: 'brand', description: 'Nombre de la marca', example: 'Lumen Coffee' },
  product: { name: 'product', description: 'El producto, concreto (formato, envase, color)', example: 'a matte black 250 g bag of specialty coffee beans' },
  audience: { name: 'audience', description: 'A quién le habla el anuncio', example: 'young urban professionals' },
  palette: { name: 'palette', description: 'Colores de marca', example: 'warm cream, espresso brown and copper accents' },
  mood: { name: 'mood', description: 'Tono emocional', example: 'calm, premium, inviting' },
  setting: { name: 'setting', description: 'Dónde ocurre la escena', example: 'a sunlit Scandinavian kitchen counter' },
  talent: { name: 'talent', description: 'Quién aparece (edad, estilo, actitud)', example: 'a woman in her late 20s with curly hair, relaxed linen shirt' },
  headline: { name: 'headline', description: 'Titular corto que debe aparecer escrito', example: 'Wake up to better' },
  cta: { name: 'cta', description: 'Llamado a la acción', example: 'Shop now', optional: true },
  character: { name: 'character', description: 'Descripción fija del personaje (rasgos, pelo, ropa, accesorios) — la misma en cada prompt', example: 'Mara, a 30-year-old woman with a sharp black bob, olive skin, a small scar over her left eyebrow, wearing a mustard raincoat and silver hoop earrings' },
  style: { name: 'style', description: 'Estilo visual fijo de la serie', example: 'cinematic photorealism, soft teal-and-amber grade, 35mm film grain' },
} satisfies Record<string, PromptVariable>
