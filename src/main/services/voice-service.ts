import crypto from 'crypto'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import zlib from 'zlib'
import { getRawDb } from '../db'
import { readSetting } from '../ipc/helpers'
import { getAssetManager } from './asset-manager'
import { getFFmpeg } from './ffmpeg'
import { resolveAssetFile, resolveAssetFileForUpload } from './asset-file'

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

/** Same per-second estimate the app shows for ElevenLabs Music (lib/models.ts AUDIO_MODELS) */
export const USD_PER_MUSIC_SECOND = 0.004

export const MUSIC_MIN_SECONDS = 3
export const MUSIC_MAX_SECONDS = 600

export interface MusicResult {
  assetId: string
  durationSeconds: number | null
  generationSeconds: number
}

/**
 * ElevenLabs Music (`/v1/music`) for agents (MCP music_generate). Saved like the composer's
 * `elevenlabs:music` (ipc/elevenlabs.ts): model_used `elevenlabs:music`, kind music, so the
 * Timeline treats it as background music for ducking.
 */
export async function composeMusic(input: { prompt: string; durationSeconds: number; modelId?: string; forceInstrumental?: boolean; name?: string }): Promise<MusicResult> {
  const started = Date.now()
  const musicLengthMs = Math.max(MUSIC_MIN_SECONDS * 1000, Math.min(MUSIC_MAX_SECONDS * 1000, Math.round(input.durationSeconds * 1000)))
  const modelId = input.modelId || 'music_v2'
  const body: any = { prompt: input.prompt.trim(), music_length_ms: musicLengthMs, model_id: modelId }
  if (input.forceInstrumental) body.force_instrumental = true
  const res = await fetch(`${BASE}/v1/music`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
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
  const buffer = Buffer.from(await res.arrayBuffer())

  const tmp = path.join(os.tmpdir(), `openfield-elevenlabs-music-${crypto.randomUUID()}.mp3`)
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
      input.prompt.trim(),
      'elevenlabs:music',
      JSON.stringify({
        // Same keys as the composer, plus where it came from
        kind: 'music',
        duration: Math.round(musicLengthMs / 1000),
        music_length_ms: musicLengthMs,
        model_id: modelId,
        ...(input.forceInstrumental ? { force_instrumental: true } : {}),
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
    return { assetId: asset.id, durationSeconds: duration, generationSeconds: secs }
  } finally {
    fs.unlink(tmp).catch(() => {})
  }
}

// ─── Video to Music ──────────────────────────────────────────────────────────

/**
 * ElevenLabs Video to Music (`POST /v1/music/video-to-music`, multipart): scores up to 10 videos,
 * joined in order, as one piece. https://elevenlabs.io/docs/api-reference/music/video-to-music
 * ElevenLabs publishes no separate price for it, so estimates use the Music rate (an assumption).
 */
export const VIDEO_TO_MUSIC_MAX_VIDEOS = 10
export const VIDEO_TO_MUSIC_MAX_BYTES = 200 * 1024 * 1024
export const VIDEO_TO_MUSIC_MAX_SECONDS = 600
export const VIDEO_TO_MUSIC_MAX_TAGS = 10
export const VIDEO_TO_MUSIC_MAX_DESCRIPTION = 4100

export interface VideoInput {
  assetId: string
  path: string
  mime: string
  bytes: number
  seconds: number
}

/** Library video assets → local files with size and length, checked against the API limits */
export async function probeVideoInputs(assetIds: string[], forUpload = false): Promise<VideoInput[]> {
  if (assetIds.length === 0) throw new Error('At least one video is required')
  if (assetIds.length > VIDEO_TO_MUSIC_MAX_VIDEOS) throw new Error(`Video to Music takes at most ${VIDEO_TO_MUSIC_MAX_VIDEOS} videos`)
  const out: VideoInput[] = []
  for (const assetId of assetIds) {
    // The upload copy is MP4 (non-MP4 assets are converted once); an estimate reads the original
    const file = forUpload ? await resolveAssetFileForUpload(assetId) : resolveAssetFile(assetId)
    if (!file) throw new Error(`Asset ${assetId} has no local file`)
    const mime = file.mime || 'video/mp4'
    if (!mime.startsWith('video/')) throw new Error(`Asset ${assetId} is not a video (${mime})`)
    const bytes = (await fs.stat(file.path)).size
    let seconds = 0
    try { seconds = (await getFFmpeg().probe(file.path)).duration || 0 } catch {}
    out.push({ assetId, path: file.path, mime, bytes, seconds: Math.round(seconds * 1000) / 1000 })
  }
  const totalBytes = out.reduce((n, v) => n + v.bytes, 0)
  const totalSeconds = out.reduce((n, v) => n + v.seconds, 0)
  if (totalBytes > VIDEO_TO_MUSIC_MAX_BYTES) throw new Error(`The videos weigh ${Math.round(totalBytes / 1048576)} MB; Video to Music takes 200 MB combined`)
  if (totalSeconds > VIDEO_TO_MUSIC_MAX_SECONDS) throw new Error(`The videos last ${Math.round(totalSeconds)} s; Video to Music takes ${VIDEO_TO_MUSIC_MAX_SECONDS} s in total`)
  return out
}

/** Entries of a ZIP archive (stored or deflated; no ZIP64), for the separate_tracks response */
function unzip(buf: Buffer): Array<{ name: string; data: Buffer }> {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('ElevenLabs sent an unreadable ZIP')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const entries: Array<{ name: string; data: Buffer }> = []
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const method = buf.readUInt16LE(p + 10)
    const compressed = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    p += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/') || buf.readUInt32LE(local) !== 0x04034b50) continue
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(start, start + compressed)
    if (method === 0) entries.push({ name, data: Buffer.from(raw) })
    else if (method === 8) entries.push({ name, data: zlib.inflateRawSync(raw) })
  }
  return entries
}

export interface VideoToMusicTrack {
  assetId: string
  /** 'mix' unless separate_tracks split it into music and sfx */
  role: 'mix' | 'music' | 'sfx'
  fileName: string
  durationSeconds: number | null
}

export interface VideoToMusicResult {
  tracks: VideoToMusicTrack[]
  /** ElevenLabs id of the generated song (song-id response header), when sent */
  songId: string | null
  videoSeconds: number
  generationSeconds: number
}

/**
 * Scores the given library videos with ElevenLabs. Each returned track becomes a library audio
 * asset: model_used `elevenlabs:music` (the Timeline ducks it as music), or `elevenlabs:sfx` for
 * the effects track of a separate_tracks result.
 */
export async function videoToMusic(input: {
  videoAssetIds: string[]
  description?: string
  tags?: string[]
  useAudioAsReference?: boolean
  addSfx?: boolean
  separateTracks?: boolean
  name?: string
}): Promise<VideoToMusicResult> {
  const started = Date.now()
  const description = input.description?.trim()
  if (description && description.length > VIDEO_TO_MUSIC_MAX_DESCRIPTION) throw new Error(`description takes at most ${VIDEO_TO_MUSIC_MAX_DESCRIPTION} characters`)
  const tags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean)
  if (tags.length > VIDEO_TO_MUSIC_MAX_TAGS) throw new Error(`At most ${VIDEO_TO_MUSIC_MAX_TAGS} tags`)
  const videos = await probeVideoInputs(input.videoAssetIds, true)

  const form = new FormData()
  for (const [i, v] of videos.entries()) {
    form.append('videos', new Blob([new Uint8Array(await fs.readFile(v.path))], { type: v.mime }), `video-${i + 1}${path.extname(v.path) || '.mp4'}`)
  }
  if (description) form.append('description', description)
  for (const tag of tags) form.append('tags', tag)
  if (input.useAudioAsReference) form.append('use_audio_as_reference', 'true')
  if (input.addSfx) form.append('add_sfx', 'true')
  if (input.separateTracks) form.append('separate_tracks', 'true')

  const res = await fetch(`${BASE}/v1/music/video-to-music`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey() },
    body: form,
    signal: AbortSignal.timeout(15 * 60_000),
  })
  if (!res.ok) {
    let detail = `ElevenLabs (${res.status})`
    try {
      const j: any = await res.json()
      const d = j?.detail
      if (d) detail = `ElevenLabs: ${typeof d === 'string' ? d : d.message || JSON.stringify(d)}`
    } catch {}
    if (res.status === 401) detail = 'ElevenLabs rejected the API key'
    if (res.status === 403) detail = 'ElevenLabs: Video to Music needs a paid subscription'
    throw new Error(detail)
  }
  const songId = res.headers.get('song-id')
  const buffer = Buffer.from(await res.arrayBuffer())
  const isZip = /zip/i.test(res.headers.get('content-type') || '') || buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  const parts = isZip
    ? unzip(buffer).filter((e) => /\.(mp3|wav|ogg|opus|m4a|aac|flac)$/i.test(e.name))
    : [{ name: 'music.mp3', data: buffer }]
  if (parts.length === 0) throw new Error('ElevenLabs returned no audio')

  const videoSeconds = Math.round(videos.reduce((n, v) => n + v.seconds, 0) * 1000) / 1000
  const elapsedMs = Date.now() - started
  const secs = Number((elapsedMs / 1000).toFixed(1))
  const prompt = description || (tags.length ? tags.join(', ') : 'Video to Music')
  const base = input.name ? input.name.replace(/\.[a-z0-9]+$/i, '') : null
  const tracks: VideoToMusicTrack[] = []
  const db = getRawDb()
  for (const part of parts) {
    const role: VideoToMusicTrack['role'] = !isZip ? 'mix' : /sfx|effect/i.test(part.name) ? 'sfx' : 'music'
    const ext = path.extname(part.name) || '.mp3'
    const tmp = path.join(os.tmpdir(), `openfield-video-to-music-${crypto.randomUUID()}${ext}`)
    await fs.writeFile(tmp, part.data)
    try {
      const asset = await getAssetManager().importFile(tmp, 'audio')
      let duration: number | null = null
      try {
        const info = await getFFmpeg().probe((asset as any).localPath || (asset as any).filePath)
        duration = info.duration > 0 ? Math.round(info.duration * 1000) / 1000 : null
      } catch {}
      const fileName = base ? `${base}${role === 'mix' ? '' : `_${role}`}${ext}` : null
      db.prepare(
        `UPDATE assets SET prompt = ?, model_used = ?, parameters = ?, provider = 'elevenlabs', credits_used = 0${duration ? ', duration = ?' : ''}${fileName ? ', file_name = ?' : ''} WHERE id = ?`,
      ).run(
        prompt,
        role === 'sfx' ? 'elevenlabs:sfx' : 'elevenlabs:music',
        JSON.stringify({
          kind: role === 'sfx' ? 'sfx' : 'music',
          mode: 'video-to-music',
          role,
          videoAssetIds: input.videoAssetIds,
          videoSeconds,
          ...(description ? { description } : {}),
          ...(tags.length ? { tags } : {}),
          ...(input.useAudioAsReference ? { use_audio_as_reference: true } : {}),
          ...(input.addSfx ? { add_sfx: true } : {}),
          ...(input.separateTracks ? { separate_tracks: true } : {}),
          ...(songId ? { songId } : {}),
          source: 'mcp',
          generationTimeSeconds: secs,
          generationTime: `${secs}s`,
          generationTimeMs: elapsedMs,
        }),
        ...(duration ? [duration] : []),
        ...(fileName ? [fileName] : []),
        asset.id,
      )
      tracks.push({ assetId: asset.id, role, fileName: fileName || part.name, durationSeconds: duration })
    } finally {
      fs.unlink(tmp).catch(() => {})
    }
  }
  db.saveSync?.()
  return { tracks, songId, videoSeconds, generationSeconds: secs }
}
