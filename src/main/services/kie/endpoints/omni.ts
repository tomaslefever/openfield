import type { OpenfieldApiClient } from '../client'
import type {
  OmniAudioCreateParams,
  OmniAudioCreateResult,
  OmniCharacterCreateParams,
  OmniCharacterCreateResult,
} from '../types'
import { uploadFileBase64 } from './upload'

/** Preset voices accepted by /api/v1/omni/audio/create (audio_id) */
export const GEMINI_OMNI_VOICES = [
  'achernar', 'achird', 'algenib', 'algieba', 'alnilam', 'aoede', 'autonoe', 'callirrhoe', 'charon', 'despina',
  'enceladus', 'erinome', 'fenrir', 'gacrux', 'iapetus', 'kore', 'laomedeia', 'leda', 'orus', 'puck',
  'pulcherrima', 'rasalgethi', 'sadachbia', 'sadaltager', 'schedar', 'sulafat', 'umbriel', 'vindemiatrix', 'zephyr', 'zubenelgenubi',
] as const

/**
 * POST /api/v1/omni/audio/create (free, synchronous)
 * Registers a voice preset and returns its audioId; no audio file is generated. Pass the id in
 * omniAudioIds of a gemini-omni-video / google/gemini-omni-flash-1-1 generation, or in audioIds
 * of createOmniCharacter.
 */
export async function createOmniAudio(client: OpenfieldApiClient, params: OmniAudioCreateParams): Promise<OmniAudioCreateResult> {
  if (!(GEMINI_OMNI_VOICES as readonly string[]).includes(params.audioId)) {
    throw new Error(`Unknown Gemini Omni voice: ${params.audioId}`)
  }
  if (!params.name?.trim()) throw new Error('Gemini Omni voice needs a name')
  const body: Record<string, any> = { audio_id: params.audioId, name: params.name.slice(0, 210) }
  if (params.voiceDescription) body.voice_description = params.voiceDescription.slice(0, 20000)
  if (params.exampleDialogue) body.example_dialogue = params.exampleDialogue.slice(0, 120)
  const res = await client.request<{ code: number; msg: string; data: OmniAudioCreateResult }>('/api/v1/omni/audio/create', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return res.data
}

/**
 * POST /api/v1/omni/character/create (free, synchronous)
 * Creates a character from a portrait (and an optional full-body image) and returns its
 * characterId, used in omniCharacterIds of a Gemini Omni generation (max 3 per video; each uses
 * one image slot, two when created with a body image).
 */
export async function createOmniCharacter(client: OpenfieldApiClient, params: OmniCharacterCreateParams): Promise<OmniCharacterCreateResult> {
  if (!params.descriptions?.trim()) throw new Error('Gemini Omni character needs a description')
  const imageUrls: string[] = []
  for (const img of (params.images || []).slice(0, 2)) {
    if (img.url && /^https?:/.test(img.url)) {
      imageUrls.push(img.url)
    } else if (img.base64) {
      const url = await uploadFileBase64(client, img.base64, img.mime || 'image/png')
      if (url) imageUrls.push(url)
    }
  }
  if (imageUrls.length === 0) throw new Error('Gemini Omni character needs a portrait image')
  const body: Record<string, any> = { descriptions: params.descriptions, image_urls: imageUrls }
  const audioIds = (params.audioIds || []).filter(Boolean)
  if (audioIds.length) body.audio_ids = audioIds
  if (params.characterName) body.character_name = params.characterName
  const res = await client.request<{ code: number; msg: string; data: OmniCharacterCreateResult }>('/api/v1/omni/character/create', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return res.data
}
