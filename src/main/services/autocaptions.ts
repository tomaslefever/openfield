import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { readSetting } from '../ipc/helpers'
import { audioChannels, mixTimelineAudio, resolveClipFile, type AudioSource, type MontageClip, type MontageDoc } from './montage-export'
import { removeTemp } from './asset-export'

/*
 * Timeline autocaptions: mixes the audio of a clip, a track or the whole montage into one mono
 * file aligned to the timeline, transcribes it with a speech-to-text provider the user already
 * has a key for, and cuts the words into short caption segments in timeline seconds. The renderer
 * (montage-store `applyAutocaptions`) turns the segments into caption clips.
 */

export type CaptionProvider = 'elevenlabs' | 'openai'
export type CaptionScope = 'clip' | 'track' | 'sequence'

export interface CaptionWord { text: string; start: number; end: number }

/** Timeline seconds; `words` empty when the provider gave no word timings (translations) */
export interface CaptionSegment { start: number; end: number; text: string; words: CaptionWord[] }

export interface AutocaptionRequest {
  doc: MontageDoc
  scope: CaptionScope
  clipId?: string
  trackId?: string
  provider: CaptionProvider
  /** ISO-639-1; empty = detect */
  language?: string
  /** Whisper translation endpoint: English text with segment timings only */
  translateToEnglish?: boolean
  maxChars: number
  maxWords: number
}

export interface AutocaptionResult {
  segments: CaptionSegment[]
  language?: string
  audioSeconds: number
}

/** Rates mirror the renderer's TRANSCRIPTION_MODELS (lib/models.ts) */
export const CAPTION_PROVIDERS: { id: CaptionProvider; label: string; keyName: string; model: string; usdPerSecond: number }[] = [
  { id: 'elevenlabs', label: 'ElevenLabs Scribe v2', keyName: 'elevenlabsApiKey', model: 'scribe_v2', usdPerSecond: 0.22 / 3600 },
  { id: 'openai', label: 'OpenAI Whisper', keyName: 'openaiApiKey', model: 'whisper-1', usdPerSecond: 0.006 / 60 },
]

/** OpenAI rejects uploads over 25 MB; at 32 kbps mono that is about 1 h 45 min of audio */
const OPENAI_MAX_BYTES = 25 * 1024 * 1024
const SAMPLE_RATE = 16000
/** A pause this long always starts a new caption */
const BREAK_GAP = 0.7
const MAX_CAPTION_SECONDS = 6
const MIN_CAPTION_SECONDS = 0.5
/** Captions linger this long after the last word when the next one is not right behind */
const HOLD_AFTER = 0.3

const num = (n: number) => Number(n.toFixed(4))

export function captionProviderStatus() {
  return CAPTION_PROVIDERS.map((p) => ({ id: p.id, label: p.label, model: p.model, configured: !!readSetting(p.keyName) }))
}

/** Seconds of audio a request would send and its estimated cost, before transcribing */
export function estimateAutocaptions(doc: MontageDoc, scope: CaptionScope, provider: CaptionProvider, clipId?: string, trackId?: string) {
  const sources = captionSources(doc, scope, clipId, trackId)
  const seconds = sources.length ? Math.max(...sources.map((c) => c.start + c.duration)) - Math.min(...sources.map((c) => c.start)) : 0
  const rate = CAPTION_PROVIDERS.find((p) => p.id === provider)!.usdPerSecond
  return { sources: sources.length, audioSeconds: num(seconds), estimatedUsd: Math.round(seconds * rate * 10000) / 10000 }
}

/** Clips whose audio feeds the transcription, mirroring how the export mixes sound */
export function captionSources(doc: MontageDoc, scope: CaptionScope, clipId?: string, trackId?: string): MontageClip[] {
  const trackById = new Map(doc.tracks.map((t) => [t.id, t]))
  const hasSound = (c: MontageClip) => {
    const kind = trackById.get(c.trackId)?.kind
    return (c.kind === 'video' && kind === 'video') || (c.kind === 'audio' && kind === 'audio')
  }
  if (scope === 'clip') return doc.clips.filter((c) => c.id === clipId && hasSound(c))
  if (scope === 'track') return doc.clips.filter((c) => c.trackId === trackId && hasSound(c))
  return doc.clips.filter((c) => hasSound(c) && !trackById.get(c.trackId)?.muted && (c.volume ?? 1) > 0)
}

/**
 * One mono 16 kHz MP3 of the sources laid out as on the timeline, starting at the first source.
 * A single clip is taken at full level; a mix keeps each clip's volume so music beds stay under the voice.
 * Mixed in small groups (montage-export mixTimelineAudio) so a long sequence stays light on memory.
 */
async function extractAudio(sources: MontageClip[], single: boolean, tmpDir: string, downloads: Map<string, string>): Promise<{ file: string; rangeStart: number; seconds: number }> {
  const rangeStart = Math.min(...sources.map((c) => c.start))
  const rangeEnd = Math.max(...sources.map((c) => c.start + c.duration))
  const seconds = rangeEnd - rangeStart

  const audio: AudioSource[] = []
  for (const clip of sources) {
    const file = await resolveClipFile(clip, downloads)
    const channels = await audioChannels(file)
    if (channels === 0) continue
    audio.push({ file, start: clip.start, offset: clip.offset, duration: clip.duration, volume: single ? 1 : clip.volume ?? 1, channels })
  }
  if (audio.length === 0) throw new Error('Los clips elegidos no tienen audio')

  const out = path.join(tmpDir, 'captions-audio.mp3')
  try {
    await mixTimelineAudio(audio, rangeStart, seconds, out, { sampleRate: SAMPLE_RATE, channels: 1, codecArgs: ['-c:a', 'libmp3lame', '-b:a', '32k'] }, tmpDir)
  } catch (err: any) {
    throw new Error(`No se pudo extraer el audio: ${err?.message || err}`)
  }
  return { file: out, rangeStart, seconds }
}

interface Transcript { words: CaptionWord[]; segments: { start: number; end: number; text: string }[]; language?: string }

async function errorDetail(res: Response, service: string): Promise<string> {
  let detail = `${service} (${res.status})`
  try {
    const body: any = await res.json()
    const msg = body?.detail?.message ?? body?.detail ?? body?.error?.message ?? body?.error
    if (msg) detail = `${service}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`
  } catch { /* non-JSON error body */ }
  if (res.status === 401) detail = `${service}: clave API inválida`
  return detail
}

async function transcribeElevenLabs(audio: Buffer, language?: string): Promise<Transcript> {
  const key = readSetting('elevenlabsApiKey')
  if (!key) throw new Error('Falta la clave de ElevenLabs. Agrégala en Proveedores.')
  const form = new FormData()
  form.append('model_id', 'scribe_v2')
  form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/mpeg' }), 'audio.mp3')
  form.append('timestamps_granularity', 'word')
  form.append('tag_audio_events', 'false')
  if (language) form.append('language_code', language)
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: form,
    signal: AbortSignal.timeout(15 * 60_000),
  })
  if (!res.ok) throw new Error(await errorDetail(res, 'ElevenLabs Scribe'))
  const body: any = await res.json()
  const words: CaptionWord[] = (body.words ?? [])
    .filter((w: any) => (w.type ?? 'word') === 'word' && String(w.text ?? '').trim())
    .map((w: any) => ({ text: String(w.text).trim(), start: Number(w.start) || 0, end: Number(w.end) || Number(w.start) || 0 }))
  return { words, segments: [], language: body.language_code }
}

/**
 * Whisper word timings come without punctuation, so each segment's words take their spelling from
 * the segment text when the token counts match.
 */
async function transcribeOpenAI(audio: Buffer, language: string | undefined, translate: boolean): Promise<Transcript> {
  const key = readSetting('openaiApiKey')
  if (!key) throw new Error('Falta la clave de OpenAI. Agrégala en Proveedores.')
  if (audio.length > OPENAI_MAX_BYTES) throw new Error('El audio supera los 25 MB que acepta OpenAI; transcribe por pistas o clips, o usa ElevenLabs')
  const form = new FormData()
  form.append('model', 'whisper-1')
  form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/mpeg' }), 'audio.mp3')
  form.append('response_format', 'verbose_json')
  if (!translate) {
    form.append('timestamp_granularities[]', 'word')
    form.append('timestamp_granularities[]', 'segment')
    if (language) form.append('language', language)
  }
  const res = await fetch(`https://api.openai.com/v1/audio/${translate ? 'translations' : 'transcriptions'}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(15 * 60_000),
  })
  if (!res.ok) throw new Error(await errorDetail(res, 'OpenAI Whisper'))
  const body: any = await res.json()
  const segments = (body.segments ?? []).map((s: any) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text ?? '').trim() }))
  const raw: CaptionWord[] = (body.words ?? []).map((w: any) => ({ text: String(w.word ?? '').trim(), start: Number(w.start) || 0, end: Number(w.end) || 0 })).filter((w: CaptionWord) => w.text)
  const words: CaptionWord[] = []
  let i = 0
  for (const seg of segments) {
    const inSeg: CaptionWord[] = []
    while (i < raw.length && raw[i].start < seg.end - 1e-3) inSeg.push(raw[i++])
    const tokens = seg.text.split(/\s+/).filter(Boolean)
    words.push(...(tokens.length === inSeg.length ? inSeg.map((w, k) => ({ ...w, text: tokens[k] })) : inSeg))
  }
  words.push(...raw.slice(i))
  return { words, segments, language: translate ? 'en' : body.language }
}

const endsSentence = (text: string) => /[.!?¡¿…]["»”)]*$/.test(text)

/**
 * Greedy line breaking: a caption closes when the next word would pass `maxChars` or `maxWords`,
 * after a sentence end, at a pause, or when it runs longer than MAX_CAPTION_SECONDS. Each caption
 * then stays up a little after its last word, without touching the next one.
 */
export function segmentWords(words: CaptionWord[], maxChars: number, maxWords: number): CaptionSegment[] {
  const groups: CaptionWord[][] = []
  let line: CaptionWord[] = []
  let chars = 0
  for (const w of words) {
    const prev = line[line.length - 1]
    const nextChars = chars + (line.length ? 1 : 0) + w.text.length
    const breakHere = prev && (
      nextChars > maxChars ||
      line.length >= maxWords ||
      endsSentence(prev.text) ||
      w.start - prev.end > BREAK_GAP ||
      w.end - line[0].start > MAX_CAPTION_SECONDS
    )
    if (breakHere) { groups.push(line); line = []; chars = 0 }
    chars += (line.length ? 1 : 0) + w.text.length
    line.push(w)
  }
  if (line.length) groups.push(line)

  const segments: CaptionSegment[] = groups.map((g) => ({
    start: g[0].start,
    end: Math.max(g[g.length - 1].end, g[0].start + 0.1),
    text: g.map((w) => w.text).join(' '),
    words: g,
  }))
  for (let k = 0; k < segments.length; k++) {
    const s = segments[k]
    const next = segments[k + 1]?.start ?? Infinity
    s.end = Math.min(Math.max(s.end + HOLD_AFTER, s.start + MIN_CAPTION_SECONDS), next)
    if (s.end - s.start < 0.1) s.end = Math.min(s.start + 0.1, next)
  }
  return segments.filter((s) => s.end > s.start)
}

/** Segment-only transcripts (translations): words get proportional timings just for line breaking */
function wordsFromSegments(segments: { start: number; end: number; text: string }[]): CaptionWord[] {
  const out: CaptionWord[] = []
  for (const seg of segments) {
    const tokens = seg.text.split(/\s+/).filter(Boolean)
    const total = tokens.reduce((n, t) => n + t.length + 1, 0) || 1
    let t = seg.start
    for (const token of tokens) {
      const d = ((token.length + 1) / total) * Math.max(0, seg.end - seg.start)
      out.push({ text: token, start: t, end: t + d })
      t += d
    }
  }
  return out
}

export async function generateAutocaptions(req: AutocaptionRequest): Promise<AutocaptionResult> {
  const sources = captionSources(req.doc, req.scope, req.clipId, req.trackId)
  if (sources.length === 0) throw new Error('No hay clips con audio en lo que elegiste')
  const translate = !!req.translateToEnglish && req.provider === 'openai'
  const maxChars = Math.min(120, Math.max(8, Math.round(req.maxChars) || 32))
  const maxWords = Math.min(30, Math.max(1, Math.round(req.maxWords) || 7))

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfield-captions-'))
  const downloads = new Map<string, string>()
  try {
    const { file, rangeStart, seconds } = await extractAudio(sources, req.scope === 'clip', tmpDir, downloads)
    const audio = await fs.readFile(file)
    const language = req.language && req.language !== 'auto' ? req.language : undefined
    const transcript = req.provider === 'elevenlabs'
      ? await transcribeElevenLabs(audio, language)
      : await transcribeOpenAI(audio, language, translate)

    const words = translate ? wordsFromSegments(transcript.segments) : transcript.words
    const shift = (w: CaptionWord): CaptionWord => ({ text: w.text, start: num(w.start + rangeStart), end: num(w.end + rangeStart) })
    // Captions never outlast the transcribed audio, so they don't lengthen the montage
    const rangeEnd = rangeStart + seconds
    const segments = segmentWords(words.map(shift), maxChars, maxWords)
      .map((s) => ({
        ...s,
        start: num(s.start),
        end: num(Math.min(s.end, rangeEnd)),
        // Proportional timings are only good for breaking lines, not for highlighting
        words: translate ? [] : s.words,
      }))
      .filter((s) => s.end - s.start >= 0.05)
    return { segments, language: transcript.language, audioSeconds: num(seconds) }
  } finally {
    for (const f of downloads.values()) await removeTemp(f)
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000))
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}:${pad(Math.floor((ms % 60000) / 1000))},${pad(ms % 1000, 3)}`
}

/** SRT of one caption track (or every caption track merged, in time order) */
export function montageSrt(doc: MontageDoc, trackId?: string): string {
  const captionTracks = new Set(doc.tracks.filter((t) => t.kind === 'caption' && (!trackId || t.id === trackId)).map((t) => t.id))
  const cues = doc.clips
    .filter((c) => c.kind === 'caption' && captionTracks.has(c.trackId) && c.text?.trim())
    .sort((a, b) => a.start - b.start)
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.start + c.duration)}\n${c.text!.trim()}\n`).join('\n')
}
