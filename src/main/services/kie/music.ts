/**
 * Suno on KIE: one createTask model (`ai-music-api/generate`) with the Suno version in `input.model`.
 * Docs: https://docs.kie.ai/suno-api/generate-music
 * Older versions (V4…V5_5) are discontinued; the docs say to use V6, V6_MINI or V6_WILD.
 */

export const KIE_SUNO_TASK_MODEL = 'ai-music-api/generate'

/** App model id → Suno version sent as `input.model` */
const SUNO_VERSIONS: Record<string, string> = {
  'suno/V6': 'V6',
  'suno/V6_MINI': 'V6_MINI',
  'suno/V6_WILD': 'V6_WILD',
}

export function isKieSunoModel(model: string): boolean {
  return model in SUNO_VERSIONS
}

export interface KieSunoParams {
  model: string
  prompt?: string
  instrumental?: boolean
}

/**
 * Builds the input for Suno's non-custom mode. That mode rejects requests without a style
 * (or lyrics/media), so the description doubles as the style.
 */
export function buildKieSunoInput(params: KieSunoParams): Record<string, any> {
  const prompt = (params.prompt || '').trim()
  if (!prompt) throw new Error('La descripción de la música está vacía')
  if (prompt.length > 3000) throw new Error('Suno acepta hasta 3000 caracteres de descripción')
  return {
    custom_mode: false,
    instrumental: !!params.instrumental,
    model: SUNO_VERSIONS[params.model],
    prompt,
    style: prompt.slice(0, 1000),
  }
}
