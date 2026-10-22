/**
 * Content Studio prompts in the structure proven on the Landking spots:
 * tagged sections ([REFERENCE USE], [IDENTITY / CONTINUITY LOCKS], [DIALOGUE ...], [SHOT ...],
 * [LIGHT AND IMAGE], [PRODUCTION SOUND], [NEGATIVES]) where every attached file is named by
 * its slot (Image1, Audio1...) and bound to an element tag (<Ana>, <Cafetería>...).
 */
import type { ModelPricing } from './models'

// ─── Eleven v4 audio tags ────────────────────────────────────────────────

/** Models that read [bracketed] audio tags as performance direction (Eleven v4, v4 Turbo and v3) */
export function supportsAudioTags(modelId?: string): boolean {
  return !!modelId && /^eleven_v[34](?:_|$)/.test(modelId)
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/** Spanish stage directions → Eleven v4 audio tags */
const CUE_TO_TAG: Array<[RegExp, string]> = [
  [/^(?:susurr|en voz baja|bajito|en secreto)/, 'whispers'],
  [/^(?:grit|a los gritos)/, 'shouts'],
  [/^(?:rie|riendo|risa|entre risas|carcajada)/, 'laughs'],
  [/^(?:llor|sollozando)/, 'crying'],
  [/^suspir/, 'sighs'],
  [/^(?:jadea|agitad|sin aliento)/, 'out of breath'],
  [/^carraspe/, 'clears throat'],
  [/^pausa larga/, 'long pause'],
  [/^pausa/, 'pause'],
  [/^(?:emocionad|entusiasmad|euforic)/, 'excited'],
  [/^(?:alegre|feliz|contento|contenta)/, 'happy'],
  [/^triste/, 'sad'],
  [/^(?:enojad|furios|molest|enfadad)/, 'mad'],
  [/^nervios/, 'nervous'],
  [/^(?:asustad|con miedo|aterrad)/, 'scared'],
  [/^sarcastic/, 'sarcastic'],
  [/^seri[oa]/, 'serious'],
  [/^orgullos/, 'proud'],
  [/^cansad/, 'tired'],
  [/^curios/, 'curious'],
  [/^(?:sorprendid|asombrad)/, 'amazed'],
  [/^(?:suave|suavemente|tiern)/, 'softly'],
  [/^(?:lento|lentamente|despacio)/, 'slowly'],
  [/^(?:rapido|apurad)/, 'rushed'],
]

/** Directions that only say who speaks or from where: never performance */
const NON_PERFORMANCE = /^(?:v\.?\s?o\.?|voz en off|en off|off|locutor|locutora|narrador|narradora|o\.?s\.?|acento\b|tono\b)/

function cueToTag(cue: string): string | null {
  const c = fold(cue)
  if (!c || NON_PERFORMANCE.test(c)) return null
  for (const [re, tag] of CUE_TO_TAG) if (re.test(c)) return tag
  return null
}

/** An English natural-language tag such as [excited] or [whispering, fearful] */
const isEnglishTag = (s: string) => /^[a-z][a-z ,'-]{1,79}$/i.test(s.trim()) && !NON_PERFORMANCE.test(fold(s))

/**
 * Normalizes a line for TTS. With audio tags, English [tags] are kept and Spanish (cues) become
 * v4 tags; without them every short stage direction is removed.
 */
export function prepareTtsLine(text: string, audioTags: boolean): string {
  if (!text) return ''
  let s = text.trim()
  s = s.replace(/\[([^\]]{1,80})\]/g, (m, inner: string) => {
    if (!audioTags) return ''
    const mapped = cueToTag(inner)
    if (mapped) return `[${mapped}]`
    return isEnglishTag(inner) ? `[${inner.trim()}]` : ''
  })
  s = s.replace(/\(([^)]{1,30})\)/g, (m, inner: string) => {
    if (!audioTags) return ''
    const mapped = cueToTag(inner)
    return mapped ? `[${mapped}]` : ''
  })
  // Outer quotes around the spoken words (tags may come first)
  s = s.replace(/^((?:\[[^\]]+\]\s*)*)["“'«](.*)["”'»]$/s, '$1$2')
  return s.replace(/\s+/g, ' ').trim()
}

/** The spoken words only, for subtitles and video prompts */
export function stripAudioTags(text: string): string {
  return prepareTtsLine(text, false)
}

/** Delivery notes carried by the line's tags/cues, in English, for the video prompt */
export function deliveryOf(text: string): string[] {
  const tagged = prepareTtsLine(text || '', true)
  return [...tagged.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1])
}

/** Directive for the script LLM: how to write dialogue lines for the chosen voice source */
export function dialogueWritingDirective(voiceSource: 'eleven' | 'video'): string {
  if (voiceSource === 'video') {
    return `
- DIÁLOGOS (VOZ GENERADA POR EL MODELO DE VIDEO): escribe dialogueText solo con las palabras habladas, sin etiquetas entre corchetes ni acotaciones. Si en una toma hablan varias personas, escribe una línea por intervención con el formato "Nombre: texto".`
  }
  return `
- DIÁLOGOS (ELEVENLABS ELEVEN V4 CON AUDIO TAGS): dirige la interpretación con audio tags EN INGLÉS entre corchetes, colocados justo antes de las palabras que modifican. La emoción se mantiene hasta el siguiente tag: usa uno por cláusula y solo cuando la emoción cambia.
  * Emoción: [excited], [playful], [amazed], [proud], [optimistic], [startled], [mad], [bitter], [anxious], [scared], [vulnerable], [confused], [tired], [despair], [let down], [peaceful], [content], [curious], [thoughtful], [nervous], [sad], [happy].
  * Volumen y entrega: [whispers], [shouts], [softly], [quietly]. Ritmo: [slowly], [rushed], [pause], [long pause].
  * Reacciones: [laughs], [sighs], [gasps], [clears throat], [crying].
  * Se pueden combinar o describir en lenguaje natural: [whispering, fearful], [nervous, trying to sound confident].
  * Ejemplo: "[excited] ¡Lo logramos! [laughs] No lo puedo creer. [softly] Gracias por quedarte."
  * Si en una toma hablan varias personas, escribe una línea por intervención con el formato "Nombre: [tag] texto". La voz en off va como "Narrador: [tag] texto".
  * Nunca uses acotaciones en español entre paréntesis.`
}

// ─── Reference slots ─────────────────────────────────────────────────────

export type PromptRefRole = 'character' | 'scenario' | 'prop' | 'frame' | 'video'

export interface PromptRef {
  role: PromptRefRole
  name: string
}

export interface PromptCharacter {
  name: string
  role?: string
  visualPrompt?: string
  /** Its picture travels as a reference */
  hasRef?: boolean
}

export interface PromptTurn {
  speaker: string
  text: string
  isNarrator?: boolean
}

export const elementTag = (name: string) => `<${(name || 'Element').replace(/[<>]/g, '').trim()}>`

function slotLabel(model: ModelPricing | undefined, kind: 'image' | 'video' | 'audio', n: number): string {
  const fallback = kind === 'image' ? 'Image%d' : kind === 'video' ? 'Video%d' : 'Audio%d'
  const tpl = model?.refTags?.[kind] || fallback
  return tpl.replace('%d', String(n))
}

function referenceLines(model: ModelPricing | undefined, refs: PromptRef[], videoRefCount: number): string[] {
  const lines: string[] = []
  let img = 0
  for (const r of refs) {
    const slot = slotLabel(model, 'image', ++img)
    const tag = elementTag(r.name)
    if (r.role === 'character') lines.push(`${slot} is ${tag}: it defines their face, hair and wardrobe exactly. Ignore its background.`)
    else if (r.role === 'scenario') lines.push(`${slot} is ${tag}: it defines the location only (architecture, light and atmosphere); take no people from it.`)
    else if (r.role === 'prop') lines.push(`${slot} is ${tag}: it defines this object exactly (shape, colors, materials and any label as shown).`)
    else if (r.role === 'frame') lines.push(`${slot} is the FIRST FRAME LOOK of this shot: same people, wardrobe, place and light. Use it for framing, wardrobe and light continuity.`)
  }
  for (let i = 1; i <= videoRefCount; i++) {
    lines.push(`${slotLabel(model, 'video', i)} is the previous shot: continue its motion, light and continuity.`)
  }
  return lines
}

function characterLocks(characters: PromptCharacter[]): string[] {
  return characters.map((c) => {
    const tag = elementTag(c.name)
    if (c.hasRef) return `${tag}: preserve their face, hair, clothing and voice ownership exactly as in their reference.`
    return `${tag}${c.role ? ` (${c.role})` : ''}: ${c.visualPrompt || 'keep the same look in every shot'}.`
  })
}

// ─── Keyframe (image) ────────────────────────────────────────────────────

export interface KeyframePromptInput {
  model?: ModelPricing
  refs: PromptRef[]
  camera?: string
  /** What the first frame shows (the shot's keyframe prompt or its action) */
  frame: string
  characters: PromptCharacter[]
  /** On-screen people who speak in this shot */
  speakers: string[]
  location?: { name: string; visualPrompt?: string; hasRef?: boolean }
  visualStyle?: string
}

export function buildKeyframePrompt(input: KeyframePromptInput): string {
  const sections: string[] = []
  const refLines = referenceLines(input.model, input.refs, 0)
  if (refLines.length) sections.push(`[REFERENCE USE]\n${refLines.join('\n')}`)

  const frame: string[] = []
  frame.push(`First frame of this shot.${input.camera ? ` ${input.camera.trim().replace(/\.?$/, '.')}` : ''}`)
  frame.push(input.frame.trim())
  const unrefChars = input.characters.filter((c) => !c.hasRef && c.visualPrompt)
  if (unrefChars.length) frame.push(characterLocks(unrefChars).join(' '))
  if (input.location && !input.location.hasRef && input.location.visualPrompt) {
    frame.push(`Location ${elementTag(input.location.name)}: ${input.location.visualPrompt}`)
  }
  if (input.speakers.length > 1) {
    frame.push(`${input.speakers.map(elementTag).join(' and ')} are both clearly visible, each with their own face and wardrobe, natural closed-mouth expressions, about to talk to each other.`)
  } else if (input.speakers.length === 1) {
    frame.push(`${elementTag(input.speakers[0])} has a natural, closed-mouth expression, about to speak.`)
  }
  frame.push(
    input.visualStyle?.trim()
      ? `${input.visualStyle.trim()}. Consistent with the rest of the piece.`
      : 'Photorealistic frame from a live-action production with real actors; cinematic lens, shallow depth of field, natural skin texture, subtle film grain, professional color grade.'
  )
  frame.push('No on-screen text, no captions, no watermarks.')
  sections.push(`[FRAME]\n${frame.join('\n')}`)
  return sections.join('\n\n')
}

// ─── Video ───────────────────────────────────────────────────────────────

export interface VideoPromptInput {
  model?: ModelPricing
  /** Images attached in this order (ingredients mode); empty when the clip starts from a pinned first frame */
  refs: PromptRef[]
  videoRefCount: number
  /** A dialogue/voice-over recording travels as Audio1 */
  hasAudio: boolean
  /** 'eleven': the recording drives the voices; 'video': the model voices the lines itself */
  voiceSource: 'eleven' | 'video'
  pinnedFirstFrame: boolean
  camera?: string
  action: string
  characters: PromptCharacter[]
  turns: PromptTurn[]
  location?: { name: string; visualPrompt?: string; hasRef?: boolean }
  visualStyle?: string
  lighting?: string
  filmLook?: string
}

const LIP_SYNC_RULES =
  'Lips, jaw and tongue articulate every syllable at the natural pace of the voice: open vowels open the mouth, closed consonants (m, p, b) close the lips, pauses in the voice are pauses on the face. Face, eyebrows, head and small gestures follow the rhythm, emphasis and energy of each line. Nothing else is said: no added, missing, changed or repeated words.'

function quoteLine(t: PromptTurn): string {
  const words = stripAudioTags(t.text)
  const delivery = deliveryOf(t.text)
  return `"${words}"${delivery.length ? ` (delivery: ${delivery.join(', then ')})` : ''}`
}

export function buildVideoPrompt(input: VideoPromptInput): string {
  const sections: string[] = []
  const { turns } = input
  const spoken = turns.filter((t) => !t.isNarrator)
  const narration = turns.filter((t) => t.isNarrator)
  const speakers = [...new Set(spoken.map((t) => t.speaker))]
  const audioSlot = slotLabel(input.model, 'audio', 1)
  const audioDrives = input.voiceSource === 'eleven' && input.hasAudio

  // [REFERENCE USE]
  const refLines = referenceLines(input.model, input.refs, input.videoRefCount)
  if (audioDrives) {
    if (speakers.length > 1) {
      refLines.push(`${audioSlot} is the dialogue recording: it holds every line of this shot in order (${turns.map((t) => (t.isNarrator ? 'the off-camera narrator' : elementTag(t.speaker))).join(', then ')}). Each voice belongs only to its speaker.`)
    } else if (speakers.length === 1) {
      refLines.push(`${audioSlot} is ${elementTag(`${speakers[0]}'s voice`)}: it defines ${elementTag(speakers[0])}'s exact spoken line, voice timbre, pace and delivery.`)
    } else if (narration.length) {
      refLines.push(`${audioSlot} is the off-camera narrator's voice-over. Nobody on screen speaks it.`)
    }
  }
  if (refLines.length) sections.push(`[REFERENCE USE]\n${refLines.join('\n')}`)

  // [IDENTITY / CONTINUITY LOCKS]
  const locks = characterLocks(input.characters)
  if (input.location && !input.location.hasRef && input.location.visualPrompt) {
    locks.push(`${elementTag(input.location.name)}: ${input.location.visualPrompt}.`)
  }
  if (input.pinnedFirstFrame) locks.push('Same faces, wardrobe, place and light as in the first frame.')
  if (speakers.length > 1) locks.push('Each person keeps their own face, wardrobe and voice for the whole shot.')
  if (locks.length) sections.push(`[IDENTITY / CONTINUITY LOCKS]\n${locks.join('\n')}`)

  // [DIALOGUE]
  if (speakers.length === 1 && spoken.length === 1 && !narration.length) {
    const who = elementTag(speakers[0])
    const voice = audioDrives
      ? `with the voice, timbre, pace and delivery of ${audioSlot} (a recording of this same line)`
      : 'in a natural voice that fits them'
    sections.push(`[DIALOGUE - LIP-SYNC IS THE PRIORITY]\n${who} speaks exactly this line, word for word, in full, in its original language, ${voice}:\n${quoteLine(spoken[0])}\n${LIP_SYNC_RULES}`)
  } else if (spoken.length) {
    const order = turns.map((t, i) =>
      t.isNarrator
        ? `${i + 1}. Off-camera narrator (voice-over, nobody on screen moves their lips): ${quoteLine(t)}`
        : `${i + 1}. ${elementTag(t.speaker)}: ${quoteLine(t)}`
    )
    const source = audioDrives
      ? `${audioSlot} holds every line in this exact order; each line is spoken only by its speaker, in sync with ${audioSlot}:`
      : 'Every line is said in this exact order, word for word, in its original language; give each person one distinct, natural voice that fits them and keep it for all their lines:'
    sections.push(`[DIALOGUE - LIP-SYNC IS THE PRIORITY]\nThis shot is a conversation. ${source}\n${order.join('\n')}\nWhile one person speaks, the others listen with natural reactions and a closed mouth. ${LIP_SYNC_RULES}`)
  } else if (narration.length) {
    const voice = audioDrives ? ` (${audioSlot})` : ''
    sections.push(`[VOICE-OVER]\nAn off-camera narrator${voice} says: ${narration.map(quoteLine).join(' ')}\nNobody on screen speaks or moves their lips to it; the picture follows the pacing of the narration.`)
  }

  // [SHOT]
  const shot: string[] = []
  if (input.pinnedFirstFrame) shot.push('The first frame is the exact start of this shot.')
  if (input.camera?.trim()) shot.push(input.camera.trim().replace(/\.?$/, '.'))
  if (input.action.trim()) shot.push(input.action.trim().replace(/\.?$/, '.'))
  shot.push('No cuts.')
  sections.push(`[SHOT - ONE CONTINUOUS TAKE]\n${shot.join(' ')}`)

  // [LIGHT AND IMAGE]
  const look = [
    input.visualStyle?.trim()
      ? `${input.visualStyle.trim()}, consistent visual aesthetic.`
      : 'Live-action, photorealistic, cinematic lens, 24 fps, natural motion blur, subtle film grain, shallow depth of field.',
    input.lighting?.trim(),
    input.filmLook?.trim(),
    input.pinnedFirstFrame || input.refs.some((r) => r.role === 'frame') ? 'Professional color grade matching the first frame.' : '',
  ].filter(Boolean)
  sections.push(`[LIGHT AND IMAGE]\n${look.join(' ')}`)

  // [PRODUCTION SOUND]
  const sound = spoken.length || narration.length
    ? audioDrives
      ? `Clear dialogue exactly as in ${audioSlot}. Natural diegetic ambience and foley under the voice. No music.`
      : 'Clear, close, natural dialogue recorded on set. Natural diegetic ambience and foley under the voice. No music.'
    : 'Natural diegetic ambience and foley only. No voices, no music.'
  sections.push(`[PRODUCTION SOUND]\n${sound}`)

  // [NEGATIVES]
  const neg: string[] = []
  if (spoken.length) neg.push('No lip-sync drift: no mouth moving faster or slower than the voice, no mouth moving during silences, no frozen face while speaking, no mumbling, no extra words.')
  if (speakers.length > 1) neg.push('No voice swaps, no two people speaking at once, no line said by the wrong person.')
  if (narration.length) neg.push('No lip movement for the narration.')
  neg.push('No cuts. No face drift, identity or wardrobe changes. No on-screen text, titles, captions, subtitles or watermarks. No distorted hands, no warped objects, no flickering. No background music, no soundtrack.')
  sections.push(`[NEGATIVES]\n${neg.join(' ')}`)

  return sections.join('\n\n')
}
