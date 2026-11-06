import crypto from 'crypto'
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { getFFmpeg } from './ffmpeg'
import { WHISPER_CODES, falRun, uploadToFal } from './voice-clone-service'

/*
 * Speech to text for any audio or video (Voice Studio → Transcribir, MCP audio_transcribe) with
 * fal Whisper, using the app's fal.ai key. The sound is first extracted to MP3 with ffmpeg, so
 * videos upload only their audio and any container ffmpeg reads is accepted.
 */

const MODEL = 'fal-ai/whisper'
/** What the renderer may send over IPC */
const MAX_INPUT_BYTES = 500 * 1024 * 1024

export interface TranscriptSegment { start: number; end: number; text: string }

export interface Transcript {
  text: string
  segments: TranscriptSegment[]
  language: string | null
  durationSeconds: number | null
  /** Plain text with one segment per line, ready to save as .txt */
  plain: string
  srt: string
}

const EXT_BY_MIME: Record<string, string> = {
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/webm': '.webm',
  'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/flac': '.flac',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'video/x-matroska': '.mkv',
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000))
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`
}

export function toSrt(segments: TranscriptSegment[]): string {
  return segments.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`).join('\n')
}

/** Transcribes a media file on disk */
export async function transcribeFile(filePath: string, opts: { language?: string } = {}): Promise<Transcript> {
  const ff = getFFmpeg()
  let durationSeconds: number | null = null
  try {
    const info = await ff.probe(filePath)
    durationSeconds = info.duration > 0 ? Math.round(info.duration * 100) / 100 : null
  } catch {}

  const mp3 = path.join(os.tmpdir(), `openfield-stt-${crypto.randomUUID()}.mp3`)
  try {
    try {
      await ff.extractAudio(filePath, mp3, 'mp3')
    } catch {
      throw new Error('No se pudo leer el audio del archivo (¿tiene pista de sonido?)')
    }
    const buffer = await fs.readFile(mp3)
    const url = await uploadToFal(buffer, 'audio/mpeg', 'audio.mp3')
    const code = opts.language && opts.language !== 'Auto' ? (WHISPER_CODES[opts.language] || opts.language) : undefined
    const res = await falRun<{ text?: string; chunks?: { timestamp?: [number | null, number | null]; text?: string }[]; inferred_languages?: string[] }>(
      MODEL,
      { audio_url: url, task: 'transcribe', chunk_level: 'segment', ...(code ? { language: code } : {}) },
      900_000,
    )
    const segments: TranscriptSegment[] = []
    for (const c of res.chunks || []) {
      const text = (c.text || '').replace(/\s+/g, ' ').trim()
      if (!text) continue
      const start = Number(c.timestamp?.[0] ?? segments.at(-1)?.end ?? 0)
      const end = Number(c.timestamp?.[1] ?? durationSeconds ?? start)
      segments.push({ start, end: Math.max(end, start), text })
    }
    const text = (res.text || segments.map((s) => s.text).join(' ')).replace(/\s+/g, ' ').trim()
    if (!text) throw new Error('No se encontró voz en el audio')
    return {
      text,
      segments,
      language: res.inferred_languages?.[0] ?? (code || null),
      durationSeconds,
      plain: segments.length ? segments.map((s) => s.text).join('\n') : text,
      srt: toSrt(segments),
    }
  } finally {
    fs.unlink(mp3).catch(() => {})
  }
}

/** Transcribes media sent from the renderer as base64 */
export async function transcribeBase64(input: { base64: string; mime?: string; fileName?: string; language?: string }): Promise<Transcript> {
  const b64 = (input.base64 || '').replace(/^data:[^;]+;base64,/, '')
  if (!b64) throw new Error('El archivo está vacío')
  const buffer = Buffer.from(b64, 'base64')
  if (buffer.length > MAX_INPUT_BYTES) throw new Error('El archivo es demasiado grande (máximo 500 MB)')
  const ext = path.extname(input.fileName || '') || EXT_BY_MIME[(input.mime || '').split(';')[0]] || '.bin'
  const tmp = path.join(os.tmpdir(), `openfield-stt-in-${crypto.randomUUID()}${ext}`)
  await fs.writeFile(tmp, buffer)
  try {
    return await transcribeFile(tmp, { language: input.language })
  } finally {
    fs.unlink(tmp).catch(() => {})
  }
}
