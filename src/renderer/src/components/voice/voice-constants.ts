type PresetVoice = { id: string; label: string; gender?: 'male' | 'female'; detail?: string }

// KIE accepts only these voices for its ElevenLabs TTS models (enum in docs.kie.ai)
const KIE_ELEVENLABS_VOICES: PresetVoice[] = [
  { id: 'EkK5I93UQWFDigLMpZcX', label: 'James' },
  { id: 'Z3R5wn05IrDiVCyEkUrK', label: 'Arabella' },
  { id: 'NNl6r8mD7vthiJatiJt1', label: 'Bradford' },
  { id: 'YOq2y2Up4RgXP2HyXjE5', label: 'Xavier' },
  { id: 'B8gJV1IhpuegLxdpXFOE', label: 'Kuon' },
  { id: '2zRM7PkgwBPiau2jvVXc', label: 'Monika Sogam' },
  { id: '1SM7GgM6IMuvQlz2BwM3', label: 'Mark' },
  { id: '5l5f8iK3YPeGga21rQIX', label: 'Adeline' },
  { id: 'scOwDtmlUjD3prqpp97I', label: 'Sam' },
  { id: 'NOpBlnGInO9m6vDvFkFC', label: 'Spuds Oxley' },
  { id: 'BZgkqPqms7Kj9ulSkVzn', label: 'Eve' },
  { id: 'wo6udizrrtpIxWGp2qJk', label: 'Northern Terry' },
  { id: 'gU0LNdkMOQCOrPrwtbee', label: 'British Football Announcer' },
  { id: 'DGzg6RaUqxGRTHSBjfgF', label: 'Brock' },
  { id: 'x70vRnQBMBu4FAYhjJbO', label: 'Nathan' },
  { id: 'Sm1seazb4gs7RSlUVw7c', label: 'Anika' },
  { id: 'P1bg08DkjqiVEzOn76yG', label: 'Viraj' },
  { id: 'qDuRKMlYmrm8trt5QyBn', label: 'Taksh' },
  { id: 'qXpMhyvQqiRxWQs4qSSB', label: 'Horatius' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', label: 'Liam' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', label: 'Callum' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', label: 'Laura' },
  { id: 'kPzsL2i3teMYv0FxEYQ6', label: 'Brittney' },
  { id: 'UgBBYS2sOqTuMpoF3BR0', label: 'Mark (2)' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', label: 'Bella' },
  { id: 'nPczCjzI2devNBz1zQrb', label: 'Brian' },
  { id: 'uYXf8XasLslADfZ2MB4u', label: 'Hope' },
  { id: 'gs0tAILXbY5DNrJrsM6F', label: 'Jeff' },
  { id: 'DTKMou8ccj1ZaWGBiotd', label: 'Jamahal' },
  { id: 'vBKc2FfBKJfcZNyEt1n6', label: 'Finn' },
  { id: 'DYkrAHD8iwork3YSUBbs', label: 'Tom' },
  { id: '56AoDkrOh6qfVPDXZ7Pt', label: 'Cassidy' },
  { id: 'eR40ATw9ArzDf9h3v7t7', label: 'Addison 2.0' },
  { id: 'g6xIsTj2HwM6VR4iXFCw', label: 'Jessica Anne Bogart' },
  { id: 'lcMyyd2HUfFzxdCaC4Ta', label: 'Lucy' },
  { id: '6aDn1KB0hjpdcocrUkmq', label: 'Tiffany' },
  { id: 'Sq93GQT4X1lKDXsQcixO', label: 'Felix' },
  { id: 'flHkNRp1BlvT73UL6gyz', label: 'Jessica Anne Bogart (2)' },
  { id: '9yzdeviXkFddZ4Oz8Mok', label: 'Lutz' },
  { id: 'pPdl9cQBQq4p6mRkZy2Z', label: 'Emma' },
  { id: 'zYcjlYFOd3taleS0gkk3', label: 'Edward' },
  { id: 'nzeAacJi50IvxcyDnMXa', label: 'Marshal' },
  { id: 'ruirxsoakN0GWmGNIo04', label: 'John Morgan' },
  { id: 'TC0Zp7WVFzhA8zpTlRqV', label: 'Aria' },
  { id: 'ljo9gAlSqKOvF6D8sOsX', label: 'Viking Bjorn' },
  { id: 'PPzYpIqttlTYA83688JI', label: 'Pirate Marshal' },
  { id: '8JVbfL6oEdmuxKn5DK2C', label: 'Johnny Kid' },
  { id: 'iCrDUkL56s3C8sCRl7wb', label: 'Hope (2)' },
  { id: 'wJqPPQ618aTW29mptyoc', label: 'Ana Rita' },
  { id: 'EiNlNiXeDU1pqqOPrYMO', label: 'John Doe' },
  { id: '4YYIPFl9wE5c4L2eu2Gb', label: 'Burt Reynolds™' },
  { id: '6F5Zhi321D3Oq7v1oNT4', label: 'Hank' },
  { id: 'YXpFCvM1S3JbWEJhoskW', label: 'Wyatt' },
  { id: 'LG95yZDEHg6fCZdQjLqj', label: 'Phil' },
  { id: 'CeNX9CMwmxDxUF5Q2Inm', label: 'Johnny Dynamite' },
  { id: 'aD6riP1btT197c6dACmy', label: 'Rachel M' },
  { id: 'mtrellq69YZsNwzUSyXh', label: 'Rex Thunder' },
  { id: 'dHd5gvgSOzSfduK4CvEg', label: 'Ed' },
  { id: 'eVItLK1UvXctxuaRV2Oq', label: 'Jean' },
  { id: 'esy0r39YPLQjOczyOib8', label: 'Britney' },
  { id: 'Tsns2HvNFKfGiNjllgqo', label: 'Sven' },
  { id: '1U02n4nD6AdIZ9CjF053', label: 'Viraj (2)' },
  { id: 'AeRdCCKzvd23BpJoofzx', label: 'Nathaniel' },
  { id: 'LruHrtVF6PSyGItzMNHS', label: 'Benjamin' },
  { id: '1wGbFxmAM3Fgw63G1zZJ', label: 'Allison' },
  { id: 'hqfrgApggtO1785R4Fsn', label: 'Theodore HQ' },
  { id: 'MJ0RnG71ty4LH3dvNfSd', label: 'Leon' },
]

// Gemini TTS preset voices (KIE google/gemini-3-1-flash-tts; also valid on 3.8)
const GEMINI_TTS_VOICES: PresetVoice[] = [
  { id: 'Zephyr', label: 'Zephyr', gender: 'female', detail: 'Bright' },
  { id: 'Puck', label: 'Puck', gender: 'male', detail: 'Upbeat' },
  { id: 'Charon', label: 'Charon', gender: 'male', detail: 'Informative' },
  { id: 'Kore', label: 'Kore', gender: 'female', detail: 'Firm' },
  { id: 'Fenrir', label: 'Fenrir', gender: 'male', detail: 'Excitable' },
  { id: 'Leda', label: 'Leda', gender: 'female', detail: 'Youthful' },
  { id: 'Orus', label: 'Orus', gender: 'male', detail: 'Firm' },
  { id: 'Aoede', label: 'Aoede', gender: 'female', detail: 'Breezy' },
  { id: 'Callirrhoe', label: 'Callirrhoe', gender: 'female', detail: 'Easy-going' },
  { id: 'Autonoe', label: 'Autonoe', gender: 'female', detail: 'Bright' },
  { id: 'Enceladus', label: 'Enceladus', gender: 'male', detail: 'Breathy' },
  { id: 'Iapetus', label: 'Iapetus', gender: 'male', detail: 'Clear' },
  { id: 'Umbriel', label: 'Umbriel', gender: 'male', detail: 'Easy-going' },
  { id: 'Algieba', label: 'Algieba', gender: 'male', detail: 'Smooth' },
  { id: 'Despina', label: 'Despina', gender: 'female', detail: 'Smooth' },
  { id: 'Erinome', label: 'Erinome', gender: 'female', detail: 'Clear' },
  { id: 'Algenib', label: 'Algenib', gender: 'male', detail: 'Gravelly' },
  { id: 'Rasalgethi', label: 'Rasalgethi', gender: 'male', detail: 'Informative' },
  { id: 'Laomedeia', label: 'Laomedeia', gender: 'female', detail: 'Upbeat' },
  { id: 'Achernar', label: 'Achernar', gender: 'female', detail: 'Soft' },
  { id: 'Alnilam', label: 'Alnilam', gender: 'male', detail: 'Firm' },
  { id: 'Schedar', label: 'Schedar', gender: 'male', detail: 'Even' },
  { id: 'Gacrux', label: 'Gacrux', gender: 'female', detail: 'Mature' },
  { id: 'Pulcherrima', label: 'Pulcherrima', gender: 'female', detail: 'Forward' },
  { id: 'Achird', label: 'Achird', gender: 'male', detail: 'Friendly' },
  { id: 'Zubenelgenubi', label: 'Zubenelgenubi', gender: 'male', detail: 'Casual' },
  { id: 'Vindemiatrix', label: 'Vindemiatrix', gender: 'female', detail: 'Gentle' },
  { id: 'Sadachbia', label: 'Sadachbia', gender: 'male', detail: 'Lively' },
  { id: 'Sadaltager', label: 'Sadaltager', gender: 'male', detail: 'Knowledgeable' },
  { id: 'Sulafat', label: 'Sulafat', gender: 'female', detail: 'Warm' },
]

// Voices added in Gemini 3.8 Flash TTS (Fola is the API default)
const GEMINI_38_EXTRA_VOICES: PresetVoice[] = [
  { id: 'Fola', label: 'Fola' },
  { id: 'Bodi', label: 'Bodi' },
  { id: 'Lumi', label: 'Lumi' },
  { id: 'Sola', label: 'Sola' },
  { id: 'Varo', label: 'Varo' },
  { id: 'Koda', label: 'Koda' },
  { id: 'Nika', label: 'Nika' },
  { id: 'Tavi', label: 'Tavi' },
  { id: 'Zeno', label: 'Zeno' },
  { id: 'Kira', label: 'Kira' },
  { id: 'Ludo', label: 'Ludo' },
  { id: 'Mako', label: 'Mako' },
  { id: 'Rina', label: 'Rina' },
  { id: 'Brio', label: 'Brio' },
  { id: 'Jori', label: 'Jori' },
  { id: 'Rami', label: 'Rami' },
  { id: 'Veda', label: 'Veda' },
  { id: 'Enzo', label: 'Enzo' },
  { id: 'Riko', label: 'Riko' },
  { id: 'Sami', label: 'Sami' },
  { id: 'Zali', label: 'Zali' },
  { id: 'Gero', label: 'Gero' },
  { id: 'Neno', label: 'Neno' },
  { id: 'Olin', label: 'Olin' },
  { id: 'Tari', label: 'Tari' },
  { id: 'Daro', label: 'Daro' },
  { id: 'Hali', label: 'Hali' },
  { id: 'Milo', label: 'Milo' },
  { id: 'Arlo', label: 'Arlo' },
  { id: 'Cleo', label: 'Cleo' },
  { id: 'Finn', label: 'Finn' },
  { id: 'Lora', label: 'Lora' },
  { id: 'Enya', label: 'Enya' },
  { id: 'Jett', label: 'Jett' },
  { id: 'Knox', label: 'Knox' },
  { id: 'Nyla', label: 'Nyla' },
  { id: 'Cruz', label: 'Cruz' },
  { id: 'Elio', label: 'Elio' },
  { id: 'Tova', label: 'Tova' },
  { id: 'Zuri', label: 'Zuri' },
]

export const PRESET_VOICES_BY_MODEL: Record<string, PresetVoice[]> = {
  'elevenlabs/text-to-speech-multilingual-v2': KIE_ELEVENLABS_VOICES,
  'elevenlabs/text-to-speech-turbo-2-5': KIE_ELEVENLABS_VOICES,
  'google/gemini-3-1-flash-tts': GEMINI_TTS_VOICES,
  'google/gemini-3-8-flash-tts': [
    ...GEMINI_38_EXTRA_VOICES,
    ...GEMINI_TTS_VOICES,
  ],
  'fal-ai/kokoro': [
    { id: 'af_heart', label: 'Heart', gender: 'female', detail: 'American English - Grade A' },
    { id: 'af_bella', label: 'Bella', gender: 'female', detail: 'American English - Warm' },
    { id: 'af_nicole', label: 'Nicole', gender: 'female', detail: 'American English - Whisper' },
    { id: 'af_sarah', label: 'Sarah', gender: 'female', detail: 'American English - Casual' },
    { id: 'am_adam', label: 'Adam', gender: 'male', detail: 'American English - Clear' },
    { id: 'am_michael', label: 'Michael', gender: 'male', detail: 'American English - Natural' },
    { id: 'bf_emma', label: 'Emma', gender: 'female', detail: 'British English - Crisp' },
    { id: 'bf_isabella', label: 'Isabella', gender: 'female', detail: 'British English - Friendly' },
    { id: 'bm_george', label: 'George', gender: 'male', detail: 'British English - Formal' },
    { id: 'bm_lewis', label: 'Lewis', gender: 'male', detail: 'British English - Storyteller' },
  ],
  'cjwbw/kokoro': [
    { id: 'af_heart', label: 'Heart', gender: 'female', detail: 'American English - Grade A' },
    { id: 'af_bella', label: 'Bella', gender: 'female', detail: 'American English - Warm' },
    { id: 'af_nicole', label: 'Nicole', gender: 'female', detail: 'American English - Whisper' },
    { id: 'af_sarah', label: 'Sarah', gender: 'female', detail: 'American English - Casual' },
    { id: 'am_adam', label: 'Adam', gender: 'male', detail: 'American English - Clear' },
    { id: 'am_michael', label: 'Michael', gender: 'male', detail: 'American English - Natural' },
  ],
  'machgen/kokoro-82m': [
    { id: 'af_heart', label: 'Heart', gender: 'female', detail: 'American English - Grade A' },
    { id: 'af_bella', label: 'Bella', gender: 'female', detail: 'American English - Warm' },
    { id: 'af_nicole', label: 'Nicole', gender: 'female', detail: 'American English - Whisper' },
    { id: 'af_sarah', label: 'Sarah', gender: 'female', detail: 'American English - Casual' },
    { id: 'am_adam', label: 'Adam', gender: 'male', detail: 'American English - Clear' },
    { id: 'am_michael', label: 'Michael', gender: 'male', detail: 'American English - Natural' },
  ],
}

// Languages supported by the ElevenLabs multilingual models (ISO 639-1 codes,
// per the API's verified_languages.language / voice_verification.language schema)
export const VOICE_LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'it', name: 'Italian' },
  { code: 'hi', name: 'Hindi' },
  { code: 'pl', name: 'Polish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ko', name: 'Korean' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ro', name: 'Romanian' },
  { code: 'sv', name: 'Swedish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'id', name: 'Indonesian' },
  { code: 'tr', name: 'Turkish' },
  { code: 'el', name: 'Greek' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'he', name: 'Hebrew' },
  { code: 'no', name: 'Norwegian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'hr', name: 'Croatian' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'ms', name: 'Malay' },
  { code: 'sk', name: 'Slovak' },
]

export const VOICE_ACCENTS_BY_LANG: Record<string, string[]> = {
  en: ['American', 'British', 'Australian', 'Canadian', 'Indian', 'Irish', 'Scottish', 'Nigerian', 'South African', 'Singaporean', 'New Zealand', 'Filipino', 'Welsh', 'London', 'Cockney', 'New York', 'Texan', 'Southern American', 'Bostonian', 'Jamaican', 'Kenyan', 'Ghanaian', 'Zimbabwean'],
  es: ['Spanish', 'Mexican', 'Colombian', 'Argentinian', 'Chilean', 'Peruvian', 'Venezuelan', 'Latin American'],
  fr: ['French', 'Canadian French', 'Belgian', 'Swiss'],
  pt: ['Portuguese', 'Brazilian'],
  de: ['German', 'Austrian', 'Swiss'],
  it: ['Italian'],
  nl: ['Dutch', 'Belgian'],
  ru: ['Russian'],
  ja: ['Japanese'],
  ko: ['Korean'],
  zh: ['Chinese', 'Mandarin', 'Cantonese'],
  ar: ['Arabic', 'Egyptian', 'Levantine'],
  tr: ['Turkish'],
  pl: ['Polish'],
  sv: ['Swedish'],
  uk: ['Ukrainian'],
  vi: ['Vietnamese'],
  hi: ['Hindi'],
}

export const VOICE_GENDERS = ['male', 'female', 'neutral']

export const ELEVENLABS_MODELS = [
  { value: 'eleven_v4', label: 'V4 (flagship)' },
  { value: 'eleven_v3', label: 'V3' },
  { value: 'eleven_v3_flash', label: 'V3 Flash (fastest)' },
  { value: 'eleven_multilingual_v3', label: 'Multilingual v3' },
  { value: 'eleven_multilingual_v3_flash', label: 'Multilingual v3 Flash' },
  { value: 'eleven_multilingual_v2', label: 'Multilingual v2' },
  { value: 'eleven_turbo_v2_5', label: 'Turbo v2.5' },
  { value: 'eleven_flash_v2_5', label: 'Flash v2.5' },
  { value: 'eleven_turbo_v2', label: 'Turbo v2' },
  { value: 'eleven_flash_v2', label: 'Flash v2' },
  { value: 'eleven_monolingual_v1', label: 'Monolingual v1 (English)' },
  { value: 'eleven_multilingual_v1', label: 'Multilingual v1' },
]

export function parseAssetParams(asset: any): Record<string, any> {
  if (!asset?.parameters) return {}
  if (typeof asset.parameters !== 'string') return asset.parameters
  try { return JSON.parse(asset.parameters) || {} } catch { return {} }
}

// The voice id lives in the stored params, or is encoded in model_used
// as `elevenlabs:<id>` / `elevenlabs:vc:<id>` / `piper:<id>` / `kokoro:<id>`
export function voiceIdOf(asset: any): string {
  const p = parseAssetParams(asset)
  if (p.voiceId) return String(p.voiceId)
  if (p.voice) return String(p.voice)
  const model: string = asset?.modelUsed || ''
  if (model.startsWith('elevenlabs:vc:')) return model.slice(14)
  if (model.startsWith('elevenlabs:') && model !== 'elevenlabs:music' && model !== 'elevenlabs:sfx') return model.slice(11)
  if (model.startsWith('piper:')) return model.slice(6)
  if (model.startsWith('kokoro:')) return model.slice(7)
  return ''
}

export function findPresetVoice(id: string) {
  if (!id) return undefined
  for (const list of Object.values(PRESET_VOICES_BY_MODEL)) {
    const hit = list.find((v) => v.id === id)
    if (hit) return hit
  }
  return undefined
}

// Readable fallback for ElevenLabs model ids the catalog does not name,
// e.g. eleven_turbo_v2_5 → "Turbo v2.5", eleven_multilingual_sts_v2 → "Multilingual Sts v2"
export function prettifyElevenModelId(id: string): string {
  if (!id) return ''
  const label = id
    .replace(/^eleven_/, '')
    .replace(/_v(\d+)_(\d+)/g, ' v$1.$2')
    .replace(/_v(\d+)/g, ' v$1')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => (/^v\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
  return /^v\d/.test(label) ? `Eleven ${label}` : label
}
