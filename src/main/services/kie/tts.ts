/**
 * KIE text-to-speech models and their createTask input shapes.
 * Docs: https://docs.kie.ai/market/elevenlabs/text-to-speech-multilingual-v2
 *       https://docs.kie.ai/market/google/gemini-3-1-flash-tts
 *       https://docs.kie.ai/market/google/gemini-3-8-flash-tts
 */

export const KIE_ELEVENLABS_TTS_MODELS = [
  'elevenlabs/text-to-speech-multilingual-v2',
  'elevenlabs/text-to-speech-turbo-2-5',
]

export const KIE_GEMINI_TTS_MODELS = [
  'google/gemini-3-1-flash-tts',
  'google/gemini-3-8-flash-tts',
]

/** KIE only accepts these voice ids for its ElevenLabs TTS models (enum in the API) */
export const KIE_ELEVENLABS_VOICE_IDS = new Set([
  'EkK5I93UQWFDigLMpZcX', 'Z3R5wn05IrDiVCyEkUrK', 'NNl6r8mD7vthiJatiJt1', 'YOq2y2Up4RgXP2HyXjE5',
  'B8gJV1IhpuegLxdpXFOE', '2zRM7PkgwBPiau2jvVXc', '1SM7GgM6IMuvQlz2BwM3', '5l5f8iK3YPeGga21rQIX',
  'scOwDtmlUjD3prqpp97I', 'NOpBlnGInO9m6vDvFkFC', 'BZgkqPqms7Kj9ulSkVzn', 'wo6udizrrtpIxWGp2qJk',
  'gU0LNdkMOQCOrPrwtbee', 'DGzg6RaUqxGRTHSBjfgF', 'x70vRnQBMBu4FAYhjJbO', 'Sm1seazb4gs7RSlUVw7c',
  'P1bg08DkjqiVEzOn76yG', 'qDuRKMlYmrm8trt5QyBn', 'qXpMhyvQqiRxWQs4qSSB', 'TX3LPaxmHKxFdv7VOQHJ',
  'N2lVS1w4EtoT3dr4eOWO', 'FGY2WhTYpPnrIDTdsKH5', 'kPzsL2i3teMYv0FxEYQ6', 'UgBBYS2sOqTuMpoF3BR0',
  'hpp4J3VqNfWAUOO0d1Us', 'nPczCjzI2devNBz1zQrb', 'uYXf8XasLslADfZ2MB4u', 'gs0tAILXbY5DNrJrsM6F',
  'DTKMou8ccj1ZaWGBiotd', 'vBKc2FfBKJfcZNyEt1n6', 'DYkrAHD8iwork3YSUBbs', '56AoDkrOh6qfVPDXZ7Pt',
  'eR40ATw9ArzDf9h3v7t7', 'g6xIsTj2HwM6VR4iXFCw', 'lcMyyd2HUfFzxdCaC4Ta', '6aDn1KB0hjpdcocrUkmq',
  'Sq93GQT4X1lKDXsQcixO', 'flHkNRp1BlvT73UL6gyz', '9yzdeviXkFddZ4Oz8Mok', 'pPdl9cQBQq4p6mRkZy2Z',
  'zYcjlYFOd3taleS0gkk3', 'nzeAacJi50IvxcyDnMXa', 'ruirxsoakN0GWmGNIo04', 'TC0Zp7WVFzhA8zpTlRqV',
  'ljo9gAlSqKOvF6D8sOsX', 'PPzYpIqttlTYA83688JI', '8JVbfL6oEdmuxKn5DK2C', 'iCrDUkL56s3C8sCRl7wb',
  'wJqPPQ618aTW29mptyoc', 'EiNlNiXeDU1pqqOPrYMO', '4YYIPFl9wE5c4L2eu2Gb', '6F5Zhi321D3Oq7v1oNT4',
  'YXpFCvM1S3JbWEJhoskW', 'LG95yZDEHg6fCZdQjLqj', 'CeNX9CMwmxDxUF5Q2Inm', 'aD6riP1btT197c6dACmy',
  'mtrellq69YZsNwzUSyXh', 'dHd5gvgSOzSfduK4CvEg', 'eVItLK1UvXctxuaRV2Oq', 'esy0r39YPLQjOczyOib8',
  'Tsns2HvNFKfGiNjllgqo', '1U02n4nD6AdIZ9CjF053', 'AeRdCCKzvd23BpJoofzx', 'LruHrtVF6PSyGItzMNHS',
  '1wGbFxmAM3Fgw63G1zZJ', 'hqfrgApggtO1785R4Fsn', 'MJ0RnG71ty4LH3dvNfSd',
])
const DEFAULT_ELEVENLABS_VOICE = 'EkK5I93UQWFDigLMpZcX'

const GEMINI_31_VOICES = new Set([
  'Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Aoede', 'Autonoe', 'Callirrhoe', 'Charon', 'Despina',
  'Enceladus', 'Erinome', 'Fenrir', 'Gacrux', 'Iapetus', 'Kore', 'Laomedeia', 'Leda', 'Orus', 'Puck',
  'Pulcherrima', 'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Schedar', 'Sulafat', 'Umbriel', 'Vindemiatrix', 'Zephyr', 'Zubenelgenubi',
])
const GEMINI_38_VOICES = new Set([
  ...GEMINI_31_VOICES,
  'Bodi', 'Lumi', 'Sola', 'Varo', 'Koda', 'Nika', 'Tavi', 'Zeno', 'Kira', 'Ludo', 'Mako', 'Rina', 'Brio', 'Jori',
  'Rami', 'Veda', 'Enzo', 'Riko', 'Sami', 'Zali', 'Gero', 'Neno', 'Olin', 'Tari', 'Daro', 'Fola', 'Hali', 'Milo',
  'Arlo', 'Cleo', 'Finn', 'Lora', 'Enya', 'Jett', 'Knox', 'Nyla', 'Cruz', 'Elio', 'Tova', 'Zuri',
])

export function isKieTtsModel(model: string): boolean {
  return KIE_ELEVENLABS_TTS_MODELS.includes(model) || KIE_GEMINI_TTS_MODELS.includes(model)
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

export interface KieTtsParams {
  model: string
  prompt?: string
  text?: string
  voice?: string
  voiceId?: string
  voice_id?: string
  speed?: number | string
  stability?: number | string
  similarityBoost?: number | string
  style?: number | string
}

/** Builds the createTask `input` for a KIE TTS model */
export function buildKieTtsInput(params: KieTtsParams): Record<string, any> {
  const text = (params.text || params.prompt || '').trim()
  if (!text) throw new Error('El texto para TTS está vacío')
  const requestedVoice = params.voiceId || params.voice || params.voice_id || ''

  if (KIE_ELEVENLABS_TTS_MODELS.includes(params.model)) {
    if (text.length > 5000) throw new Error('ElevenLabs (KIE) acepta hasta 5000 caracteres por solicitud')
    // Voices from the user's own ElevenLabs account are not available through KIE
    const voice = KIE_ELEVENLABS_VOICE_IDS.has(requestedVoice) ? requestedVoice : DEFAULT_ELEVENLABS_VOICE
    const input: Record<string, any> = { text, voice }
    const speed = num(params.speed)
    if (speed !== undefined) input.speed = clamp(speed, 0.7, 1.2)
    const stability = num(params.stability)
    if (stability !== undefined) input.stability = clamp(stability, 0, 1)
    const similarity = num(params.similarityBoost)
    if (similarity !== undefined) input.similarity_boost = clamp(similarity, 0, 1)
    const style = num(params.style)
    if (style !== undefined) input.style = clamp(style, 0, 1)
    return input
  }

  if (params.model === 'google/gemini-3-1-flash-tts') {
    const voice_name = GEMINI_31_VOICES.has(requestedVoice) ? requestedVoice : 'Kore'
    return {
      speakers: [{ speaker_id: 'Speaker 1', voice_name, accent: 'Neutral' }],
      dialogue_turns: [{ speaker_id: 'Speaker 1', text }],
    }
  }

  if (params.model === 'google/gemini-3-8-flash-tts') {
    const voice_name = GEMINI_38_VOICES.has(requestedVoice) ? requestedVoice : 'Fola'
    return {
      speakers: [{ speaker_id: 'Speaker 1', voice_name }],
      dialogue_turns: [{ speaker_id: 'Speaker 1', text }],
    }
  }

  throw new Error(`Modelo TTS de KIE no soportado: ${params.model}`)
}
