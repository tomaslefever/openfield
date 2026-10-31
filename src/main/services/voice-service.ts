import crypto from 'crypto'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { getRawDb } from '../db'
import { readSetting } from '../ipc/helpers'
import { getAssetManager } from './asset-manager'
import { getFFmpeg } from './ffmpeg'

/*
 * ElevenLabs text-to-speech for agents (MCP voice_generate / voice_list). Saves each line as a
 * library asset exactly like the Voice Studio does (ipc/elevenlabs.ts `elevenlabs:generate`): same
 * model_used (`elevenlabs:<voiceId>`, which the Timeline treats as a voice for ducking), prompt and
 * parameters, so the UI shows them as normal generations.
 */

const BASE = 'https://api.elevenlabs.io'

/** Same per-clip estimate the app shows for ElevenLabs voices (lib/models.ts AUDIO_MODELS) */
export const USD_PER_LINE = 0.015

export interface VoiceSettings {
  model: string
  stability: number
  similarityBoost: number
  style: number
  speed: number
  useSpeakerBoost: boolean
}

export const VOICE_DEFAULTS: VoiceSettings = { model: 'eleven_v4', stability: 0.5, similarityBoost: 0.75, style: 0, speed: 1, useSpeakerBoost: true }

function apiKey(): string {
  const key = readSetting('elevenlabsApiKey')
  if (!key) throw new Error('ElevenLabs API key not configured. Add it in Providers.')
  return key
}

export const hasElevenLabsKey = () => !!readSetting('elevenlabsApiKey')

/** Settings of the latest line generated with this voice, so new lines sound like the old ones */
export function lastVoiceSettings(voiceId: string): Partial<VoiceSettings> | null {
  const row = getRawDb()
    .prepare("SELECT parameters FROM assets WHERE model_used = ? AND provider = 'elevenlabs' ORDER BY created_at DESC LIMIT 1")
    .get(`elevenlabs:${voiceId}`) as any
  if (!row?.parameters) return null
  try {
    const p = JSON.parse(row.parameters)
    const out: Partial<VoiceSettings> = {}
    if (typeof p.model === 'string') out.model = p.model
    for (const k of ['stability', 'similarityBoost', 'style', 'speed'] as const) if (typeof p[k] === 'number') out[k] = p[k]
    if (typeof p.useSpeakerBoost === 'boolean') out.useSpeakerBoost = p.useSpeakerBoost
    return out
  } catch {
    return null
  }
}

/** ElevenLabs credits per character: Flash / Turbo models bill half */
export const creditsPerChar = (model: string) => (/flash|turbo/i.test(model) ? 0.5 : 1)

export interface VoiceInfo {
  id: string
  name: string
  category?: string
  language?: string
  accent?: string
  gender?: string
  description?: string
  previewUrl?: string
  source: 'account' | 'library'
}

/** Account voices (custom, designed, cloned and saved ones) plus, optionally, the public library */
export async function listVoices(opts: { search?: string; language?: string; gender?: string; includeLibrary?: boolean; pageSize?: number } = {}): Promise<VoiceInfo[]> {
  const key = apiKey()
  const size = Math.min(100, Math.max(1, opts.pageSize ?? 50))
  const get = async (url: string) => {
    const res = await fetch(`${BASE}${url}`, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(30_000) })
    if (res.status === 401) throw new Error('ElevenLabs rejected the API key')
    if (!res.ok) throw new Error(`ElevenLabs voices (${res.status})`)
    return res.json() as Promise<any>
  }
  const q = new URLSearchParams({ page_size: String(size) })
  if (opts.search) q.set('search', opts.search)
  const account = ((await get(`/v2/voices?${q}`)).voices ?? []).map((v: any): VoiceInfo => ({
    id: v.voice_id,
    name: v.name,
    category: v.category,
    language: v.labels?.language ?? v.verified_languages?.[0]?.language,
    accent: v.labels?.accent,
    gender: v.labels?.gender,
    description: v.description || v.labels?.descriptive || undefined,
    previewUrl: v.preview_url || undefined,
    source: 'account',
  }))
  let library: VoiceInfo[] = []
  if (opts.includeLibrary) {
    const lq = new URLSearchParams({ page_size: String(size) })
    if (opts.search) lq.set('search', opts.search)
    if (opts.language) lq.set('language', opts.language)
    if (opts.gender) lq.set('gender', opts.gender)
    library = ((await get(`/v1/shared-voices?${lq}`)).voices ?? []).map((v: any): VoiceInfo => ({
      id: v.voice_id, name: v.name, category: v.category, language: v.language, accent: v.accent, gender: v.gender,
      description: v.descriptive || v.description || undefined, previewUrl: v.preview_url || undefined, source: 'library',
    }))
  }
  const lang = opts.language?.toLowerCase()
  const gender = opts.gender?.toLowerCase()
  const keep = (v: VoiceInfo) => v.source === 'library' || ((!lang || (v.language ?? '').toLowerCase() === lang) && (!gender || (v.gender ?? '').toLowerCase() === gender))
  const seen = new Set<string>()
  return [...account, ...library].filter((v) => v.id && keep(v) && !seen.has(v.id) && !!seen.add(v.id))
}

export interface SpeechResult {
  assetId: string
  durationSeconds: number | null
  characters: number
  /** Credits ElevenLabs reported for the request (character-cost header), when it sent one */
  creditsUsed: number | null
  generationSeconds: number
}

/** One line → MP3 in the library. `name` becomes the asset's file name when given. */
export async function synthesizeSpeech(input: { text: string; voiceId: string; languageCode?: string; settings: VoiceSettings; name?: string }): Promise<SpeechResult> {
  const started = Date.now()
  const s = input.settings
  const body: any = {
    text: input.text,
    model_id: s.model,
    voice_settings: {
      stability: s.stability,
      similarity_boost: s.similarityBoost,
      style: s.style,
      use_speaker_boost: s.useSpeakerBoost,
      speed: s.speed,
    },
  }
  if (input.languageCode) body.language_code = input.languageCode
  const res = await fetch(`${BASE}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) {
    let detail = `ElevenLabs (${res.status})`
    try {
      const j: any = await res.json()
      const d = j?.detail
      if (d) detail = `ElevenLabs: ${typeof d === 'string' ? d : d.message || JSON.stringify(d)}`
    } catch {}
    if (res.status === 401) detail = 'ElevenLabs rejected the API key'
    throw new Error(detail)
  }
  const cost = Number(res.headers.get('character-cost') ?? res.headers.get('x-character-count'))
  const buffer = Buffer.from(await res.arrayBuffer())

  const tmp = path.join(os.tmpdir(), `openfield-voice-${crypto.randomUUID()}.mp3`)
  await fs.writeFile(tmp, buffer)
  try {
    const asset = await getAssetManager().importFile(tmp, 'audio')
    let duration: number | null = null
    try {
      const info = await getFFmpeg().probe((asset as any).localPath || (asset as any).filePath)
      duration = info.duration > 0 ? Math.round(info.duration * 1000) / 1000 : null
    } catch {}
    const elapsedMs = Date.now() - started
    const secs = Number((elapsedMs / 1000).toFixed(1))
    const db = getRawDb()
    db.prepare(
      `UPDATE assets SET prompt = ?, model_used = ?, parameters = ?, provider = 'elevenlabs', credits_used = 0${duration ? ', duration = ?' : ''}${input.name ? ', file_name = ?' : ''} WHERE id = ?`,
    ).run(
      input.text,
      `elevenlabs:${input.voiceId}`,
      JSON.stringify({
        // Same keys as the Voice Studio, plus where it came from
        engine: 'elevenlabs',
        voiceId: input.voiceId,
        model: s.model,
        speed: s.speed,
        stability: s.stability,
        similarityBoost: s.similarityBoost,
        style: s.style,
        useSpeakerBoost: s.useSpeakerBoost,
        ...(input.languageCode ? { languageCode: input.languageCode } : {}),
        ...(Number.isFinite(cost) && cost > 0 ? { characterCost: cost } : {}),
        source: 'mcp',
        generationTimeSeconds: secs,
        generationTime: `${secs}s`,
        generationTimeMs: elapsedMs,
      }),
      ...(duration ? [duration] : []),
      ...(input.name ? [input.name.endsWith('.mp3') ? input.name : `${input.name}.mp3`] : []),
      asset.id,
    )
    db.saveSync?.()
    return { assetId: asset.id, durationSeconds: duration, characters: input.text.length, creditsUsed: Number.isFinite(cost) && cost > 0 ? cost : null, generationSeconds: secs }
  } finally {
    fs.unlink(tmp).catch(() => {})
  }
}
