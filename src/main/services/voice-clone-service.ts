import crypto from 'crypto'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { app } from 'electron'
import { getRawDb } from '../db'
import { readSetting } from '../ipc/helpers'
import { getAssetManager } from './asset-manager'
import { getFFmpeg } from './ffmpeg'

/*
 * Voice cloning with Qwen3-TTS 1.7B on fal.ai (the same model Voicebox runs locally):
 *   1. fal-ai/qwen-3-tts/clone-voice/1.7b turns a short reference clip + its transcript into a
 *      speaker embedding (.safetensors hosted by fal)
 *   2. fal-ai/qwen-3-tts/text-to-speech/1.7b speaks any text with that embedding
 * The reference clip is kept on disk so the voice can be re-cloned if fal drops the embedding.
 * Generated lines land in the library as voice assets (model_used contains "text-to-speech", so
 * the Timeline treats them as voices for autoducking), like ElevenLabs lines.
 */

export const CLONE_MODEL = 'fal-ai/qwen-3-tts/clone-voice/1.7b'
export const TTS_MODEL = 'fal-ai/qwen-3-tts/text-to-speech/1.7b'
const TRANSCRIBE_MODEL = 'fal-ai/whisper'
/** fal list price of the TTS endpoint */
export const USD_PER_1K_CHARS = 0.09

export const CLONE_LANGUAGES = ['Auto', 'Spanish', 'English', 'Portuguese', 'French', 'German', 'Italian', 'Japanese', 'Korean', 'Chinese', 'Russian'] as const
export const WHISPER_CODES: Record<string, string> = {
  Spanish: 'es', English: 'en', Portuguese: 'pt', French: 'fr', German: 'de', Italian: 'it',
  Japanese: 'ja', Korean: 'ko', Chinese: 'zh', Russian: 'ru',
}
/** fal accepts references up to 300 s; a short clean clip clones best */
const MAX_REFERENCE_BYTES = 25 * 1024 * 1024

export interface ClonedVoice {
  id: string
  name: string
  provider: string
  model: string
  language: string
  referenceText: string
  referenceSeconds: number | null
  hasEmbedding: boolean
  createdAt: number
  updatedAt: number
}

export interface AudioInput {
  base64: string
  mime?: string
  fileName?: string
}

function falKey(): string {
  const key = readSetting('falApiKey')
  if (!key) throw new Error('fal.ai API key not configured. Add it in Providers.')
  return key
}

export const hasFalKey = () => !!readSetting('falApiKey')

export async function falRun<T = any>(model: string, input: Record<string, any>, timeoutMs = 300_000): Promise<T> {
  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${falKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const j: any = await res.json()
      const d = j?.detail ?? j?.message ?? j
      detail = typeof d === 'string' ? d : Array.isArray(d) ? d.map((x: any) => x?.msg || JSON.stringify(x)).join('; ') : JSON.stringify(d)
    } catch {}
    if (res.status === 401 || res.status === 403) detail = 'fal.ai rejected the API key'
    const err: any = new Error(`fal.ai ${model} (${res.status})${detail ? `: ${detail.slice(0, 400)}` : ''}`)
    err.status = res.status
    throw err
  }
  return await res.json() as T
}

const voicesDir = () => path.join(app.getPath('userData'), 'cloned-voices')

const EXT_BY_MIME: Record<string, string> = {
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/wave': '.wav',
  'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/flac': '.flac',
}
const MIME_BY_EXT: Record<string, string> = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m]))

function normalizeAudio(input: AudioInput): { buffer: Buffer; mime: string; ext: string } {
  const b64 = (input.base64 || '').replace(/^data:[^;]+;base64,/, '')
  if (!b64) throw new Error('Reference audio is empty')
  const buffer = Buffer.from(b64, 'base64')
  if (buffer.length > MAX_REFERENCE_BYTES) throw new Error('Reference audio is too large: use a clip of 5-30 seconds')
  const nameExt = path.extname(input.fileName || '').toLowerCase()
  const mime = (input.mime && input.mime !== 'application/octet-stream' ? input.mime : MIME_BY_EXT[nameExt]) || 'audio/wav'
  const ext = EXT_BY_MIME[mime.split(';')[0]] || nameExt || '.wav'
  return { buffer, mime: mime.split(';')[0], ext }
}

/**
 * Uploads a file to fal storage and returns its CDN URL. Some endpoints (Whisper) reject data URLs,
 * so references always travel this way.
 */
export async function uploadToFal(buffer: Buffer, mime: string, fileName: string): Promise<string> {
  let lastError: unknown
  for (const host of ['https://rest.fal.ai', 'https://rest.alpha.fal.ai']) {
    try {
      const init = await fetch(`${host}/storage/upload/initiate?storage_type=fal-cdn-v3`, {
        method: 'POST',
        headers: { Authorization: `Key ${falKey()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_type: mime, file_name: fileName }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!init.ok) throw new Error(`fal.ai storage (${init.status})`)
      const { upload_url: uploadUrl, file_url: fileUrl } = await init.json() as { upload_url?: string; file_url?: string }
      if (!uploadUrl || !fileUrl) throw new Error('fal.ai storage returned no upload URL')
      const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mime }, body: new Uint8Array(buffer), signal: AbortSignal.timeout(120_000) })
      if (!put.ok) throw new Error(`fal.ai storage upload (${put.status})`)
      return fileUrl
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not upload the audio to fal.ai')
}

const referenceFileName = (mime: string) => `reference${EXT_BY_MIME[mime] || '.wav'}`

function rowToVoice(r: any): ClonedVoice {
  return {
    id: r.id,
    name: r.name,
    provider: r.provider,
    model: r.model,
    language: r.language || 'Auto',
    referenceText: r.referenceText,
    referenceSeconds: r.referenceSeconds ?? null,
    hasEmbedding: !!r.embeddingUrl,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function getRow(id: string): any {
  const row = getRawDb().prepare('SELECT * FROM cloned_voices WHERE id = ?').get(id)
  if (!row) throw new Error(`Cloned voice '${id}' not found`)
  return row
}

export function listClonedVoices(): ClonedVoice[] {
  return (getRawDb().prepare('SELECT * FROM cloned_voices ORDER BY updated_at DESC').all() as any[]).map(rowToVoice)
}

export function getClonedVoice(id: string): ClonedVoice {
  return rowToVoice(getRow(id))
}

/** Transcript of a reference clip (fal Whisper), to prefill the reference text */
export async function transcribeReference(input: AudioInput & { language?: string }): Promise<{ text: string; language?: string }> {
  const { buffer, mime } = normalizeAudio(input)
  const code = input.language ? WHISPER_CODES[input.language] : undefined
  const res = await falRun<{ text?: string; inferred_languages?: string[] }>(TRANSCRIBE_MODEL, {
    audio_url: await uploadToFal(buffer, mime, referenceFileName(mime)),
    task: 'transcribe',
    chunk_level: 'none',
    ...(code ? { language: code } : {}),
  })
  const text = (res.text || '').replace(/\s+/g, ' ').trim()
  if (!text) throw new Error('No speech found in the reference audio')
  return { text, language: res.inferred_languages?.[0] }
}

async function cloneEmbedding(buffer: Buffer, mime: string, referenceText: string): Promise<string> {
  const res = await falRun<{ speaker_embedding?: { url?: string } }>(CLONE_MODEL, {
    audio_url: await uploadToFal(buffer, mime, referenceFileName(mime)),
    reference_text: referenceText,
  })
  const url = res.speaker_embedding?.url
  if (!url) throw new Error('fal.ai returned no speaker embedding')
  return url
}

async function probeSeconds(file: string): Promise<number | null> {
  try {
    const info = await getFFmpeg().probe(file)
    return info.duration > 0 ? Math.round(info.duration * 100) / 100 : null
  } catch {
    return null
  }
}

/** Longest reference accepted: Qwen3-TTS clones best from 5–20 s of clean speech */
export const MAX_REFERENCE_SECONDS = 30
/**
 * Below this many characters per second the transcript cannot cover the whole clip (speech runs at
 * ~12–16). A transcript that leaves part of the audio out makes Qwen3-TTS babble instead of speaking.
 */
const MIN_CHARS_PER_SECOND = 7

function checkReference(seconds: number | null, referenceText: string) {
  if (!seconds) return
  if (seconds > MAX_REFERENCE_SECONDS) {
    throw new Error(`El audio de referencia dura ${seconds.toFixed(1)} s: recórtalo a 5–20 s de voz limpia (máximo ${MAX_REFERENCE_SECONDS} s).`)
  }
  const cps = referenceText.replace(/\s+/g, ' ').length / seconds
  if (cps < MIN_CHARS_PER_SECOND) {
    throw new Error(`La transcripción parece incompleta: el audio dura ${seconds.toFixed(1)} s y el texto solo cubre una parte. Escribe todo lo que se dice o usa "Transcribir automáticamente"; si sobra audio, recórtalo.`)
  }
}

/**
 * Codec tokens to allow for a line. Qwen3-TTS runs at 12 tokens per second and fal's default of
 * 200 cuts speech at ~16 s; allow about twice the expected length (speech ~14 chars/s).
 */
function maxTokensFor(text: string): number {
  const expectedSeconds = text.length / 14
  return Math.max(200, Math.min(4096, Math.ceil(expectedSeconds * 2 * 12) + 60))
}

/** Saves the reference clip, clones it on fal and stores the voice */
export async function createClonedVoice(input: AudioInput & { name: string; referenceText: string; language?: string }): Promise<ClonedVoice> {
  const name = (input.name || '').trim()
  const referenceText = (input.referenceText || '').trim()
  if (!name) throw new Error('Give the voice a name')
  if (!referenceText) throw new Error('The transcript of the reference audio is required')
  const { buffer, mime, ext } = normalizeAudio(input)

  const id = crypto.randomUUID()
  await fs.mkdir(voicesDir(), { recursive: true })
  const refPath = path.join(voicesDir(), `${id}${ext}`)
  await fs.writeFile(refPath, buffer)
  try {
    const seconds = await probeSeconds(refPath)
    checkReference(seconds, referenceText)
    const embeddingUrl = await cloneEmbedding(buffer, mime, referenceText)
    const now = Date.now()
    const db = getRawDb()
    db.prepare(
      `INSERT INTO cloned_voices (id, name, provider, model, language, reference_path, reference_mime, reference_text, reference_seconds, embedding_url, created_at, updated_at)
       VALUES (?, ?, 'fal', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, name, TTS_MODEL, input.language || 'Spanish', refPath, mime, referenceText, seconds, embeddingUrl, now, now)
    db.saveSync?.()
    return getClonedVoice(id)
  } catch (err) {
    await fs.unlink(refPath).catch(() => {})
    throw err
  }
}

export function updateClonedVoice(id: string, patch: { name?: string; language?: string }): ClonedVoice {
  const row = getRow(id)
  const name = patch.name !== undefined ? patch.name.trim() : row.name
  if (!name) throw new Error('Give the voice a name')
  const language = patch.language || row.language
  const db = getRawDb()
  db.prepare('UPDATE cloned_voices SET name = ?, language = ?, updated_at = ? WHERE id = ?').run(name, language, Date.now(), id)
  db.saveSync?.()
  return getClonedVoice(id)
}

export async function deleteClonedVoice(id: string): Promise<void> {
  const row = getRow(id)
  const db = getRawDb()
  db.prepare('DELETE FROM cloned_voices WHERE id = ?').run(id)
  db.saveSync?.()
  await fs.unlink(row.referencePath).catch(() => {})
}

/** The stored reference clip, for listening in the UI */
export async function readReference(id: string): Promise<{ base64: string; mime: string }> {
  const row = getRow(id)
  const buffer = await fs.readFile(row.referencePath)
  return { base64: buffer.toString('base64'), mime: row.referenceMime || 'audio/wav' }
}

/** Clones the stored reference again (new embedding), e.g. when fal no longer serves the old one */
export async function recloneVoice(id: string): Promise<string> {
  const row = getRow(id)
  const buffer = await fs.readFile(row.referencePath)
  const url = await cloneEmbedding(buffer, row.referenceMime || 'audio/wav', row.referenceText)
  const db = getRawDb()
  db.prepare('UPDATE cloned_voices SET embedding_url = ?, updated_at = ? WHERE id = ?').run(url, Date.now(), id)
  db.saveSync?.()
  return url
}

export interface ClonedSpeechResult {
  assetId: string
  durationSeconds: number | null
  characters: number
  estimatedUsd: number
  generationSeconds: number
}

/** One line in a cloned voice → audio asset in the library. `name` becomes the asset's file name. */
export async function synthesizeClonedSpeech(input: {
  voiceId: string
  text: string
  language?: string
  name?: string
  source?: 'voice-studio' | 'mcp'
}): Promise<ClonedSpeechResult> {
  const started = Date.now()
  const text = (input.text || '').trim()
  if (!text) throw new Error('Text is required')
  const row = getRow(input.voiceId)
  const language = input.language || row.language || 'Auto'
  // Voices saved before this check existed may babble: say so instead of charging for noise
  try {
    checkReference(row.referenceSeconds ?? null, row.referenceText)
  } catch (err: any) {
    throw new Error(`La voz “${row.name}” no está bien clonada. ${err.message} Bórrala y vuelve a crearla.`)
  }

  const speak = (embeddingUrl: string) => falRun<{ audio?: { url?: string; content_type?: string } | string }>(TTS_MODEL, {
    text,
    language,
    speaker_voice_embedding_file_url: embeddingUrl,
    reference_text: row.referenceText,
    max_new_tokens: maxTokensFor(text),
  })

  let embeddingUrl: string = row.embeddingUrl || await recloneVoice(row.id)
  let res
  try {
    res = await speak(embeddingUrl)
  } catch (err: any) {
    // The hosted embedding can expire: clone the stored reference again and retry once
    const status = Number(err?.status)
    if (!(status >= 400 && status < 500) || status === 401 || status === 403) throw err
    embeddingUrl = await recloneVoice(row.id)
    res = await speak(embeddingUrl)
  }

  const audio = res.audio
  const url = typeof audio === 'string' ? audio : audio?.url
  if (!url) throw new Error('fal.ai returned no audio')
  const download = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!download.ok) throw new Error(`Could not download the generated audio (${download.status})`)
  const buffer = Buffer.from(await download.arrayBuffer())
  const ext = path.extname(new URL(url).pathname) || '.mp3'

  const tmp = path.join(os.tmpdir(), `openfield-clone-${crypto.randomUUID()}${ext}`)
  await fs.writeFile(tmp, buffer)
  try {
    const asset = await getAssetManager().importFile(tmp, 'audio')
    const duration = await probeSeconds((asset as any).localPath || asset.filePath)
    const elapsedMs = Date.now() - started
    const secs = Number((elapsedMs / 1000).toFixed(1))
    const estimatedUsd = Math.round((text.length / 1000) * USD_PER_1K_CHARS * 10000) / 10000
    const fileName = input.name ? (path.extname(input.name) ? input.name : `${input.name}${ext}`) : undefined
    const db = getRawDb()
    db.prepare(
      `UPDATE assets SET prompt = ?, model_used = ?, parameters = ?, provider = 'fal', credits_used = 0${duration ? ', duration = ?' : ''}${fileName ? ', file_name = ?' : ''} WHERE id = ?`,
    ).run(
      text,
      TTS_MODEL,
      JSON.stringify({
        engine: 'fal',
        provider: 'fal',
        mode: 'cloned-voice',
        model: TTS_MODEL,
        clonedVoiceId: row.id,
        clonedVoiceName: row.name,
        voiceName: row.name,
        language,
        source: input.source || 'voice-studio',
        estimatedUsd,
        generationTimeSeconds: secs,
        generationTime: `${secs}s`,
        generationTimeMs: elapsedMs,
      }),
      ...(duration ? [duration] : []),
      ...(fileName ? [fileName] : []),
      asset.id,
    )
    db.saveSync?.()
    return { assetId: asset.id, durationSeconds: duration, characters: text.length, estimatedUsd, generationSeconds: secs }
  } finally {
    fs.unlink(tmp).catch(() => {})
  }
}
