import * as syncFs from 'fs'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'
import { getFFmpeg } from './ffmpeg'
import { resolveAssetFile } from './asset-file'
import { downloadToTemp, removeTemp } from './asset-export'
import { effectiveComposite, isPlain, layerFilters, maskArgs, boxSize, type Composite, type Motion } from './montage-composite'

/*
 * Renders a montage document (renderer `montage-store.ts`, `kind: 'montage'`) to an MP4 that
 * mirrors the preview: a black canvas, video/image clips letterboxed into it with the first video
 * track on top, audio from video and audio clips mixed at each clip's volume (muted tracks
 * skipped), and captions burned in via libass. Long montages render in pieces (see renderMontage)
 * so memory stays flat: one ffmpeg per picture segment with only the clips visible in it.
 */

export type CaptionStyle = 'classic' | 'social'
export interface MontageTrack {
  id: string
  kind: 'caption' | 'video' | 'audio'
  name: string
  muted?: boolean
  /** Caption tracks: 'social' is the large vertical-video look */
  captionStyle?: CaptionStyle
  /** Caption tracks: vertical centre of the captions, 0..1 of the frame (default: the style's bottom placement) */
  captionY?: number
  /** Caption tracks: colour the word being spoken (needs `words` on the clip) */
  highlight?: boolean
  /** Video/audio tracks: 'voice' ducks the 'background' tracks while it plays */
  role?: TrackRole
  /** Background tracks: how they duck under the voices (missing fields take DUCKING_DEFAULTS) */
  ducking?: Partial<DuckingConfig>
  /** Video tracks: default composition of their clips (a layout slot); clips override it */
  composite?: Composite
}

export type TrackRole = 'voice' | 'background'

export interface DuckingConfig {
  enabled: boolean
  /** Gain while a voice plays, dB (negative) */
  amountDb: number
  /** Seconds to go down before the (padded) voice start, and to come back after its end */
  attack: number
  release: number
  /** Seconds added before and after each voice clip */
  padBefore: number
  padAfter: number
}

export const DUCKING_DEFAULTS: DuckingConfig = { enabled: true, amountDb: -12, attack: 0.15, release: 0.4, padBefore: 0.1, padAfter: 0.25 }
export interface CaptionWord { text: string; start: number; end: number }
export interface EnvelopeKey { t: number; v: number }
export interface MontageClip {
  id: string
  trackId: string
  kind: 'video' | 'image' | 'audio' | 'caption'
  name: string
  src?: string
  assetId?: string
  text?: string
  /** Voice override: true/false beats the track role (TTS clips are flagged when added) */
  voice?: boolean
  /** Captions from autocaptions: word timings relative to the clip start */
  words?: CaptionWord[]
  start: number
  offset: number
  duration: number
  volume: number
  /** Video/image clips, 0..1 (default 1); overridden by opacityKeys */
  opacity?: number
  /** Fade lengths in seconds: opacity for video/image, volume for audio and a video's own sound */
  fadeIn?: number
  fadeOut?: number
  /** Keyframes, times in source seconds (clip.offset + time into the clip); override volume/opacity */
  volumeKeys?: EnvelopeKey[]
  opacityKeys?: EnvelopeKey[]
  /** Video/image: placement and effects (montage-composite.ts); track defaults fill what it leaves out */
  composite?: Composite
  /** Keyframed x / y / scale / rotation, source seconds */
  motion?: Motion
  /** Source pixel size, when known (else probed) */
  sourceWidth?: number
  sourceHeight?: number
  /** Source length; undefined for images and captions */
  sourceDuration?: number
}
export interface MontageDoc {
  kind: 'montage'
  aspect: number
  /** Set when the aspect was chosen explicitly; the first visual clip then no longer sets it */
  aspectLocked?: boolean
  tracks: MontageTrack[]
  clips: MontageClip[]
}

export interface MontageRenderOptions {
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

const FPS = 30
const SHORT_SIDE = 1080
const SAMPLE_RATE = 48000

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
const num = (n: number) => Number(n.toFixed(4))

/** Output size from the preview aspect: 1080 on the short side, even dimensions for yuv420p */
export function montageSize(aspect: number): { width: number; height: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9
  return a >= 1
    ? { width: even(SHORT_SIDE * a), height: SHORT_SIDE }
    : { width: SHORT_SIDE, height: even(SHORT_SIDE / a) }
}

function assTime(sec: number): string {
  const cs = Math.max(0, Math.round(sec * 100))
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs % 100)}`
}

function assText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\​') // a lone backslash must not start an override like \N
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\N')
}

/**
 * Captions as an ASS script sized to the frame (preview: bold white, ~4.5% of the height, 7% bottom
 * margin). Overlapping captions stack like the preview, first caption track on top: the timeline is
 * cut at every caption boundary and each segment becomes one event with its lines in track order
 * (libass's own collision stacking would order them by start time instead).
 * Tracks in the 'social' style get their own large, raised events instead (see socialEvents).
 */
function buildAss(captions: MontageClip[], trackById: Map<string, MontageTrack>, trackOrder: Map<string, number>, width: number, height: number): string {
  // CSS font-size is the em box; ASS sizes by ascent+descent, about 1.15em for Arial
  const fontSize = Math.round(height * 0.045 * 1.15)
  const outline = num(Math.max(1, height * 0.0012))
  const shadow = num(Math.max(1, height * 0.0012))
  const marginH = Math.round(width * 0.06)
  const marginV = Math.round(height * 0.07)

  const isSocial = (c: MontageClip) => trackById.get(c.trackId)?.captionStyle === 'social'
  const yOf = (c: MontageClip) => trackById.get(c.trackId)?.captionY
  // Captions placed at a height (captionY) are their own centred events; the rest stack at the bottom
  const pos = (c: MontageClip) => (yOf(c) === undefined ? '' : `\\an5\\pos(${Math.round(width / 2)},${Math.round(yOf(c)! * height)})`)
  const shown = captions
    .filter((c) => c.text && c.text.trim() && !isSocial(c) && yOf(c) === undefined)
    .sort((a, b) => trackOrder.get(a.trackId)! - trackOrder.get(b.trackId)!)
  const cuts = [...new Set(shown.flatMap((c) => [c.start, c.start + c.duration]))].sort((a, b) => a - b)
  const segments: { start: number; end: number; text: string }[] = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i]
    const b = cuts[i + 1]
    const text = shown
      .filter((c) => c.start <= a + 1e-6 && c.start + c.duration >= b - 1e-6)
      .map((c) => assText(c.text!.trim()))
      .join('\\N')
    if (!text) continue
    const prev = segments[segments.length - 1]
    if (prev && prev.text === text && Math.abs(prev.end - a) < 1e-6) prev.end = b
    else segments.push({ start: a, end: b, text })
  }
  const events = segments.map((g) => `Dialogue: 0,${assTime(g.start)},${assTime(g.end)},Caption,,0,0,0,,{\\blur2}${g.text}`)
  for (const c of captions) {
    if (!c.text?.trim()) continue
    if (isSocial(c)) events.push(...socialEvents(c, trackById.get(c.trackId)?.highlight !== false, pos(c)))
    else if (yOf(c) !== undefined) events.push(`Dialogue: 0,${assTime(c.start)},${assTime(c.start + c.duration)},Caption,,0,0,0,,{${pos(c)}\\blur2}${assText(c.text.trim())}`)
  }
  const social = socialStyle(width, height)

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 1',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Caption,Arial,${fontSize},&H00FFFFFF,&H00FFFFFF,&H4D000000,&H4D000000,-1,0,0,0,100,100,0.5,0,1,${outline},${shadow},2,${marginH},${marginH},${marginV},1`,
    `Style: Social,Arial,${social.fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${social.outline},${social.shadow},2,${social.marginH},${social.marginH},${social.marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n')
}

/** Highlighted word colour, ASS &HBBGGRR (preview: #FFE14D) */
const HIGHLIGHT = '&H4DE1FF&'

/**
 * Vertical-video captions (preview `SocialCaption`): heavy uppercase text sized from the short side
 * of the frame (7.5%), thick outline, raised above the platform UI (22% of the height in portrait,
 * 12% in landscape).
 */
function socialStyle(width: number, height: number) {
  const fontSize = Math.round(Math.min(width, height) * 0.075 * 1.15)
  return {
    fontSize,
    outline: num(Math.max(2, fontSize * 0.09)),
    shadow: num(Math.max(1, fontSize * 0.03)),
    marginH: Math.round(width * 0.07),
    marginV: Math.round(height * (height > width ? 0.22 : 0.12)),
  }
}

// ─── Envelopes (same math as the renderer's montage-store; keep both in step) ───

/** Linear between keyframes, held before the first and after the last */
export function envelopeAt(keys: EnvelopeKey[] | undefined, t: number, fallback: number): number {
  if (!keys?.length) return fallback
  if (t <= keys[0].t) return keys[0].v
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]
    if (t <= b.t) {
      const a = keys[i - 1]
      const span = b.t - a.t
      return span > 0 ? a.v + ((b.v - a.v) * (t - a.t)) / span : b.v
    }
  }
  return keys[keys.length - 1].v
}

/** Fade lengths, scaled down together when they would overlap */
export function fadeLengths(c: Pick<MontageClip, 'fadeIn' | 'fadeOut' | 'duration'>): [number, number] {
  let a = Math.max(0, c.fadeIn ?? 0)
  let b = Math.max(0, c.fadeOut ?? 0)
  if (a + b > c.duration && a + b > 0) {
    const k = c.duration / (a + b)
    a *= k
    b *= k
  }
  return [a, b]
}

export function fadeGain(c: MontageClip, local: number): number {
  const [fi, fo] = fadeLengths(c)
  let g = 1
  if (fi > 0 && local < fi) g = Math.min(g, Math.max(0, local / fi))
  if (fo > 0 && local > c.duration - fo) g = Math.min(g, Math.max(0, (c.duration - local) / fo))
  return g
}

// ─── Ducking (same math as the renderer's montage-store; keep both in step) ───

const sounds = (c: MontageClip, track?: MontageTrack) =>
  !!track && ((c.kind === 'video' && track.kind === 'video') || (c.kind === 'audio' && track.kind === 'audio'))

/** A clip whose sound counts as a voice: its own flag, else its track's role */
export function isVoiceClip(c: MontageClip, track?: MontageTrack): boolean {
  if (!sounds(c, track)) return false
  return c.voice ?? track!.role === 'voice'
}

export const duckingConfig = (track: MontageTrack): DuckingConfig => ({ ...DUCKING_DEFAULTS, ...(track.ducking ?? {}) })

/** Padded voice ranges on the timeline, merged when the gap is too short to come back up between them */
export function voiceRanges(doc: MontageDoc, cfg: DuckingConfig, exceptTrackId?: string): [number, number][] {
  const trackById = new Map(doc.tracks.map((t) => [t.id, t]))
  const ranges = doc.clips
    .filter((c) => c.trackId !== exceptTrackId && !trackById.get(c.trackId)?.muted && isVoiceClip(c, trackById.get(c.trackId)))
    .map((c): [number, number] => [c.start - cfg.padBefore, c.start + c.duration + cfg.padAfter])
    .sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] - last[1] < cfg.attack + cfg.release) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }
  return merged
}

/**
 * Gain curve (timeline seconds) a background track gets from the voices: 1, down to the duck level
 * `attack` seconds before each padded voice range, held, back to 1 over `release`. Null when the
 * track does not duck. It is derived from the doc every time, so moving a voice clip re-ducks.
 */
export function duckingKeys(doc: MontageDoc, track: MontageTrack): EnvelopeKey[] | null {
  if (track.role !== 'background') return null
  const cfg = duckingConfig(track)
  if (!cfg.enabled) return null
  const g = Math.pow(10, Math.min(0, cfg.amountDb) / 20)
  return voiceRanges(doc, cfg, track.id).flatMap(([a, b]) => [
    { t: a - cfg.attack, v: 1 },
    { t: a, v: g },
    { t: b, v: g },
    { t: b + cfg.release, v: 1 },
  ])
}

/** Ducking curve of every ducking track */
export function computeDucking(doc: MontageDoc): Map<string, EnvelopeKey[]> {
  const out = new Map<string, EnvelopeKey[]>()
  for (const t of doc.tracks) {
    const keys = duckingKeys(doc, t)
    if (keys) out.set(t.id, keys)
  }
  return out
}

/** The ducking curve cut to one clip, in seconds into the clip (exact: values at both edges kept) */
export function clipDuckKeys(c: MontageClip, keys: EnvelopeKey[] | undefined): EnvelopeKey[] | undefined {
  if (!keys?.length) return undefined
  const end = c.start + c.duration
  const local: EnvelopeKey[] = [{ t: 0, v: envelopeAt(keys, c.start, 1) }]
  for (const k of keys) if (k.t > c.start && k.t < end) local.push({ t: k.t - c.start, v: k.v })
  local.push({ t: c.duration, v: envelopeAt(keys, end, 1) })
  return local.every((k) => k.v >= 0.9999) ? undefined : local
}

export const clipOpacityAt = (c: MontageClip, local: number) => envelopeAt(c.opacityKeys, c.offset + local, c.opacity ?? 1) * fadeGain(c, local)

/** Valid keyframes sorted by time, values clamped to 0..1; undefined when none */
export function cleanKeys(raw: unknown): EnvelopeKey[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const keys = raw
    .filter((k: any) => k && Number.isFinite(k.t) && Number.isFinite(k.v))
    .map((k: any) => ({ t: k.t, v: Math.min(1, Math.max(0, k.v)) }))
    .sort((a, b) => a.t - b.t)
  return keys.length ? keys : undefined
}

/** ffmpeg expression of a volume curve over `t` (seconds into the clip) */
function volumeExpr(keys: EnvelopeKey[]): string {
  const f = (n: number) => `(${num(n)})`
  let expr = f(keys[keys.length - 1].v)
  for (let i = keys.length - 1; i >= 1; i--) {
    const a = keys[i - 1]
    const b = keys[i]
    const span = b.t - a.t
    const ramp = span > 0 ? `${f(a.v)}+${f(b.v - a.v)}*(t-${f(a.t)})/${f(span)}` : f(b.v)
    expr = `if(lt(t,${f(b.t)}),${ramp},${expr})`
  }
  return `if(lt(t,${f(keys[0].t)}),${f(keys[0].v)},${expr})`
}

const sameText = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()

/** Word timings still usable for highlighting: present and matching the (possibly edited) text */
function captionWords(clip: MontageClip): CaptionWord[] | null {
  const words = clip.words
  if (!words?.length || !clip.text || !sameText(words.map((w) => w.text).join(' '), clip.text)) return null
  return words
}

/** One event per spoken word with that word coloured; a single plain event without usable word timings */
function socialEvents(clip: MontageClip, highlight: boolean, pos = ''): string[] {
  const start = clip.start
  const end = clip.start + clip.duration
  const event = (a: number, b: number, text: string) => `Dialogue: 1,${assTime(a)},${assTime(b)},Social,,0,0,0,,{${pos}\\blur1}${text}`
  const words = highlight ? captionWords(clip) : null
  if (!words) return [event(start, end, assText(clip.text!.trim().toUpperCase()))]

  const tokens = words.map((w) => assText(w.text.toUpperCase()))
  const line = (active: number) => tokens.map((t, i) => (i === active ? `{\\c${HIGHLIGHT}}${t}{\\c&HFFFFFF&}` : t)).join(' ')
  // Slice the caption at each word start; a word stays lit until the next one begins
  const cuts = [start]
  const active = [-1]
  words.forEach((w, i) => {
    const t = Math.min(end, Math.max(start, start + w.start))
    if (t > cuts[cuts.length - 1] + 0.01) { cuts.push(t); active.push(i) }
    else active[active.length - 1] = i
  })
  cuts.push(end)
  const out: string[] = []
  for (let i = 0; i < active.length; i++) {
    if (cuts[i + 1] - cuts[i] > 0.005) out.push(event(cuts[i], cuts[i + 1], line(active[i])))
  }
  return out
}

/** Local file for a clip: its own path when on disk, the library asset's file, or a temp download */
export async function resolveClipFile(clip: MontageClip, downloads: Map<string, string>): Promise<string> {
  let src = clip.src || ''
  if (src.startsWith('file:///')) src = src.slice(8)
  else if (src.startsWith('file://')) src = src.slice(7)
  if (src.startsWith('asset://localhost/')) src = decodeURIComponent(src.slice('asset://localhost/'.length).split('?')[0])
  if (src && !/^https?:\/\//.test(src) && syncFs.existsSync(src)) return src
  const fromAsset = resolveAssetFile(clip.assetId)?.path
  if (fromAsset) return fromAsset
  if (/^https?:\/\//.test(src)) {
    const cached = downloads.get(src)
    if (cached) return cached
    const file = await downloadToTemp(src)
    downloads.set(src, file)
    return file
  }
  throw new Error(`No se encontró el archivo de «${clip.name}»`)
}

/** Channel count of the first audio stream; 0 when there is none */
export async function audioChannels(file: string): Promise<number> {
  try {
    const info = await getFFmpeg().probe(file)
    const stream = info.streams.find((s) => s.codecType === 'audio')
    return stream ? stream.channels || 2 : 0
  } catch {
    return 0
  }
}

// ─── Process limits ─────────────────────────────────────────────

/** Encoder threads: half the cores, 2–8, so an export never takes the whole machine */
const ENCODE_THREADS = Math.min(8, Math.max(2, Math.floor(os.cpus().length / 2)))
/** Audio sources mixed per ffmpeg run; each one is an open demuxer + decoder */
const AUDIO_GROUP = 12

export interface FfmpegRunOptions {
  signal?: AbortSignal
  /** Called with the output time reached, in seconds */
  onTime?: (seconds: number) => void
}

/** Runs the bundled ffmpeg at below-normal priority; rejects with its last stderr lines */
export function runFfmpeg(args: string[], cwd: string, opts: FfmpegRunOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new Error('Exportación cancelada'))
    const proc = spawn(getFFmpeg().getBinaryPath(), ['-hide_banner', '-nostats', '-progress', 'pipe:1', '-y', ...args], { cwd })
    try { if (proc.pid) os.setPriority(proc.pid, os.constants.priority.PRIORITY_BELOW_NORMAL) } catch {}
    let stderr = ''
    let aborted = false
    const onAbort = () => { aborted = true; proc.kill() }
    opts.signal?.addEventListener('abort', onAbort, { once: true })

    proc.stdout.on('data', (d: Buffer) => {
      const match = /out_time_us=(\d+)/g
      let m: RegExpExecArray | null
      let last: number | null = null
      while ((m = match.exec(d.toString()))) last = Number(m[1])
      if (last !== null) opts.onTime?.(last / 1e6)
    })
    proc.stderr.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-4000) })
    proc.on('error', (err) => { opts.signal?.removeEventListener('abort', onAbort); reject(err) })
    proc.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort)
      if (aborted) return reject(new Error('Exportación cancelada'))
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg terminó con código ${code}: ${stderr.split('\n').filter(Boolean).slice(-3).join(' ')}`))
    })
  })
}

// ─── Audio ──────────────────────────────────────────────────────

export interface AudioSource {
  file: string
  /** Timeline second where it starts */
  start: number
  /** In-point inside the file */
  offset: number
  duration: number
  volume: number
  channels: number
  /** Volume curve with times in seconds into the clip; overrides volume */
  keys?: EnvelopeKey[]
  /** Ducking gain curve, seconds into the clip; multiplies the volume */
  duck?: EnvelopeKey[]
  fadeIn?: number
  fadeOut?: number
}

/**
 * Mixes timeline audio into one file covering [rangeStart, rangeStart + duration). Sources are
 * mixed AUDIO_GROUP at a time into PCM stems, then the stems together, so a long montage never
 * has more than a dozen decoders open at once.
 */
export async function mixTimelineAudio(
  sources: AudioSource[],
  rangeStart: number,
  duration: number,
  out: string,
  format: { sampleRate: number; channels: 1 | 2; codecArgs: string[] },
  tmpDir: string,
  opts: FfmpegRunOptions = {},
): Promise<void> {
  const layout = format.channels === 1 ? 'mono' : 'stereo'
  const mixGroup = async (group: AudioSource[], file: string, codecArgs: string[], onTime?: (s: number) => void) => {
    const args: string[] = ['-f', 'lavfi', '-t', String(num(duration)), '-i', `anullsrc=r=${format.sampleRate}:cl=${layout}`]
    const filters: string[] = []
    group.forEach((src, i) => {
      args.push('-threads', '1', '-ss', String(num(Math.max(0, src.offset))), '-t', String(num(src.duration)), '-i', src.file)
      const delay = Math.max(0, Math.round((src.start - rangeStart) * 1000))
      // Mono plays on both speakers at full level, as in the browser (ffmpeg's own upmix is -3 dB)
      const upmix = src.channels === 1 && format.channels === 2 ? 'pan=stereo|c0=c0|c1=c0,' : ''
      filters.push(
        `[${i + 1}:a]asetpts=PTS-STARTPTS,${upmix}aresample=${format.sampleRate},aformat=sample_fmts=fltp:channel_layouts=${layout},` +
        `atrim=duration=${num(src.duration)},${gainFilters(src)}adelay=${delay}:all=1[a${i}]`,
      )
    })
    filters.push(`[0:a]${group.map((_, i) => `[a${i}]`).join('')}amix=inputs=${group.length + 1}:duration=first:dropout_transition=0:normalize=0[aout]`)
    const graph = path.join(tmpDir, `${path.basename(file)}.graph.txt`)
    await fs.writeFile(graph, filters.join(';\n'), 'utf-8')
    args.push('-filter_complex_script', path.basename(graph), '-map', '[aout]', '-t', String(num(duration)), ...codecArgs, file)
    await runFfmpeg(args, tmpDir, { signal: opts.signal, onTime })
  }

  if (sources.length === 0) {
    await runFfmpeg(['-f', 'lavfi', '-t', String(num(duration)), '-i', `anullsrc=r=${format.sampleRate}:cl=${layout}`, ...format.codecArgs, out], tmpDir, opts)
    return
  }
  if (sources.length <= AUDIO_GROUP) {
    await mixGroup(sources, out, format.codecArgs, opts.onTime)
    return
  }
  const groups: AudioSource[][] = []
  for (let i = 0; i < sources.length; i += AUDIO_GROUP) groups.push(sources.slice(i, i + AUDIO_GROUP))
  const stems: AudioSource[] = []
  for (const [g, group] of groups.entries()) {
    const stem = path.join(tmpDir, `stem_${g}.wav`)
    await mixGroup(group, stem, ['-c:a', 'pcm_s16le'], (t) => opts.onTime?.(((g + t / duration) / (groups.length + 1)) * duration))
    stems.push({ file: stem, start: rangeStart, offset: 0, duration, volume: 1, channels: format.channels })
  }
  if (stems.length > AUDIO_GROUP) throw new Error('Demasiadas fuentes de audio para mezclar')
  await mixGroup(stems, out, format.codecArgs, (t) => opts.onTime?.(((groups.length + t / duration) / (groups.length + 1)) * duration))
}

/** Volume (or its keyframe curve, evaluated per audio frame) followed by the fades, each with a trailing comma */
function gainFilters(src: AudioSource): string {
  const out: string[] = []
  const base = src.keys?.length ? volumeExpr(src.keys) : String(num(Math.min(1, Math.max(0, src.volume))))
  if (src.keys?.length || src.duck?.length) {
    // Curves are evaluated once per audio frame: 256-sample frames keep the steps at ~5 ms
    out.push('asetnsamples=n=256:p=0')
    out.push(`volume='${src.duck?.length ? `(${base})*(${volumeExpr(src.duck)})` : base}':eval=frame`)
  } else out.push(`volume=${base}`)
  const [fi, fo] = fadeLengths({ fadeIn: src.fadeIn, fadeOut: src.fadeOut, duration: src.duration })
  if (fi > 0) out.push(`afade=t=in:st=0:d=${num(fi)}`)
  if (fo > 0) out.push(`afade=t=out:st=${num(src.duration - fo)}:d=${num(fo)}`)
  return out.map((f) => `${f},`).join('')
}

// ─── Render ─────────────────────────────────────────────────────

/** One stretch of the frame between two visual cuts, with the clips visible all through it */
interface Segment { fromFrame: number; toFrame: number; clips: MontageClip[] }

/**
 * Cuts the picture at every video/image clip boundary (snapped to the frame grid). Inside a segment
 * the same clips are visible from start to end, so each segment renders with only those inputs.
 */
function planSegments(visuals: MontageClip[], totalFrames: number, trackOrder: Map<string, number>): Segment[] {
  const toFrame = (t: number) => Math.min(totalFrames, Math.max(0, Math.round(t * FPS)))
  const cuts = new Set<number>([0, totalFrames])
  for (const c of visuals) { cuts.add(toFrame(c.start)); cuts.add(toFrame(c.start + c.duration)) }
  const sorted = [...cuts].sort((a, b) => a - b)
  const segments: Segment[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (b <= a) continue
    const clips = visuals
      .filter((c) => toFrame(c.start) <= a && toFrame(c.start + c.duration) >= b)
      // Bottom video track first, so each overlay lands above the ones before it
      .sort((x, y) => trackOrder.get(y.trackId)! - trackOrder.get(x.trackId)!)
    const prev = segments[segments.length - 1]
    // Consecutive black stretches merge into one segment
    if (prev && clips.length === 0 && prev.clips.length === 0) prev.toFrame = b
    else segments.push({ fromFrame: a, toFrame: b, clips })
  }
  return segments
}

/**
 * Renders a montage to MP4 in pieces so memory stays flat however long the montage is:
 * 1. audio of every audible clip mixed (a dozen sources per pass) into one PCM track;
 * 2. the picture rendered segment by segment between visual cuts, each with only the clips visible
 *    in it (usually one) letterboxed on black and the captions of that stretch burned in;
 * 3. the segments joined without re-encoding and muxed with the audio.
 */
export async function renderMontage(doc: MontageDoc, outputPath: string, opts: MontageRenderOptions = {}): Promise<void> {
  const trackOrder = new Map(doc.tracks.map((t, i) => [t.id, i]))
  const trackById = new Map(doc.tracks.map((t) => [t.id, t]))
  const clips = doc.clips.filter((c) => trackOrder.has(c.trackId) && c.duration > 0)
  const total = clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0)
  if (total <= 0) throw new Error('El montaje está vacío')
  const totalFrames = Math.max(1, Math.round(total * FPS))
  const totalSeconds = totalFrames / FPS

  const { width, height } = montageSize(doc.aspect)
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfield-montage-'))
  const downloads = new Map<string, string>()
  const channelsOf = new Map<string, number>()
  const channels = async (file: string) => {
    if (!channelsOf.has(file)) channelsOf.set(file, await audioChannels(file))
    return channelsOf.get(file)!
  }
  // Overall progress: audio 10%, picture 85% (by frames), final mux 5%
  const report = (p: number) => opts.onProgress?.(Math.min(99, Math.max(0, p)))

  try {
    // 1. Audio
    const ducking = computeDucking(doc)
    const audible = (c: MontageClip) => !trackById.get(c.trackId)?.muted && ((c.volume ?? 1) > 0 || !!c.volumeKeys?.some((k) => k.v > 0))
    const audioSources: AudioSource[] = []
    for (const c of clips) {
      const kind = trackById.get(c.trackId)?.kind
      const sounding = (c.kind === 'video' && kind === 'video') || (c.kind === 'audio' && kind === 'audio')
      if (!sounding || !audible(c)) continue
      const file = await resolveClipFile(c, downloads)
      const ch = await channels(file)
      if (ch > 0) {
        audioSources.push({
          file, start: c.start, offset: c.offset, duration: c.duration, volume: c.volume ?? 1, channels: ch,
          keys: c.volumeKeys?.map((k) => ({ t: k.t - c.offset, v: k.v })),
          // Voice clips never duck, even on a background track
          duck: isVoiceClip(c, trackById.get(c.trackId)) ? undefined : clipDuckKeys(c, ducking.get(c.trackId)),
          fadeIn: c.fadeIn,
          fadeOut: c.fadeOut,
        })
      }
    }
    await mixTimelineAudio(audioSources, 0, totalSeconds, path.join(tmpDir, 'audio.wav'), { sampleRate: SAMPLE_RATE, channels: 2, codecArgs: ['-c:a', 'pcm_s16le'] }, tmpDir, {
      signal: opts.signal,
      onTime: (t) => report((t / totalSeconds) * 10),
    })

    // 2. Picture, one segment at a time
    const visuals = clips.filter((c) => (c.kind === 'video' || c.kind === 'image') && trackById.get(c.trackId)?.kind === 'video')
    const captions = clips.filter((c) => c.kind === 'caption' && trackById.get(c.trackId)?.kind === 'caption' && c.text?.trim())
    const files = new Map<string, string>()
    for (const c of visuals) files.set(c.id, await resolveClipFile(c, downloads))
    const probed = new Map<string, { w: number; h: number; codec: string }>()
    const probeVisual = async (file: string) => {
      if (!probed.has(file)) {
        let w = 0, h = 0, codec = ''
        try {
          const info = await getFFmpeg().probe(file)
          const v = info.streams.find((s) => s.codecType === 'video')
          w = v?.width ?? 0
          h = v?.height ?? 0
          codec = v?.codec ?? ''
        } catch {}
        probed.set(file, { w: w || width, h: h || height, codec })
      }
      return probed.get(file)!
    }
    const segments = planSegments(visuals, totalFrames, trackOrder)
    const list: string[] = []
    for (const [i, seg] of segments.entries()) {
      const name = `seg_${String(i).padStart(5, '0')}.mp4`
      await renderSegment(seg, name, { width, height, files, probe: probeVisual, captions, trackById, trackOrder, tmpDir }, {
        signal: opts.signal,
        onTime: (t) => report(10 + ((seg.fromFrame / FPS + t) / totalSeconds) * 85),
      })
      list.push(`file '${name}'`)
    }
    await fs.writeFile(path.join(tmpDir, 'segments.txt'), list.join('\n'), 'utf-8')

    // 3. Join and mux
    await runFfmpeg([
      '-f', 'concat', '-safe', '0', '-i', 'segments.txt',
      '-i', 'audio.wav',
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-t', String(num(totalSeconds)),
      '-movflags', '+faststart',
      outputPath,
    ], tmpDir, { signal: opts.signal, onTime: (t) => report(95 + (t / totalSeconds) * 5) })
    opts.onProgress?.(100)
  } catch (err) {
    await fs.unlink(outputPath).catch(() => {})
    throw err
  } finally {
    for (const file of downloads.values()) await removeTemp(file)
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

interface SegmentContext {
  width: number
  height: number
  files: Map<string, string>
  /** Pixel size and codec of a source file (cached) */
  probe: (file: string) => Promise<{ w: number; h: number; codec: string }>
  captions: MontageClip[]
  trackById: Map<string, MontageTrack>
  trackOrder: Map<string, number>
  tmpDir: string
}

/** One segment: its visible clips letterboxed on black, captions of the stretch burned in, video only */
async function renderSegment(seg: Segment, name: string, ctx: SegmentContext, opts: FfmpegRunOptions): Promise<void> {
  const { width, height } = ctx
  const frames = seg.toFrame - seg.fromFrame
  const from = seg.fromFrame / FPS
  const dur = frames / FPS
  const args: string[] = ['-f', 'lavfi', '-t', String(num(dur)), '-i', `color=c=black:s=${width}x${height}:r=${FPS}`]
  const filters: string[] = []
  let label = '0:v'

  let nextInput = 1
  const masks = new Map<string, number>()
  for (const [i, clip] of seg.clips.entries()) {
    const file = ctx.files.get(clip.id)!
    const e = effectiveComposite(ctx.trackById.get(clip.trackId)?.composite, clip.composite)
    // The bottom plain clip keeps the original fast path (opaque letterbox on black). Anything placed,
    // keyed or on top of other clips becomes a transparent layer composited over what is below.
    const composite = !isPlain(e, clip.motion) || i > 0
    const src = composite ? await ctx.probe(file) : null
    // VP8/VP9 alpha only decodes through libvpx
    const decoder = src && /^vp[89]$/.test(src.codec) && /\.webm$/i.test(file) ? ['-c:v', src.codec === 'vp9' ? 'libvpx-vp9' : 'libvpx'] : []
    const input = nextInput++
    if (clip.kind === 'image') args.push('-loop', '1', '-framerate', String(FPS), '-t', String(num(dur)), '-i', file)
    else args.push('-threads', '2', ...decoder, '-ss', String(num(Math.max(0, clip.offset + (from - clip.start)))), '-t', String(num(dur)), '-i', file)

    if (composite) {
      const opacity = Array.from({ length: frames }, (_, k) => Math.max(0, Math.min(1, Math.round(clipOpacityAt(clip, from + k / FPS - clip.start) * 10000) / 10000)))
      let opacityCmdFile: string | undefined
      if (opacity.some((v) => v !== opacity[0])) {
        const lines: string[] = []
        for (let k = 1; k < frames; k++) if (opacity[k] !== opacity[k - 1]) lines.push(`${num((k - 0.5) / FPS)} colorchannelmixer@c${i}op aa ${opacity[k]};`)
        opacityCmdFile = `${name}.c${i}.cmd`
        await fs.writeFile(path.join(ctx.tmpDir, opacityCmdFile), lines.join('\n'), 'utf-8')
      }
      let maskInput: number | undefined
      if (e.radius > 0) {
        const { bw, bh } = boxSize(e, width, height)
        const key = `${bw}x${bh}r${Math.round(e.radius * 10)}`
        const maskFile = `mask_${key}.png`
        if (!masks.has(key)) {
          if (!syncFs.existsSync(path.join(ctx.tmpDir, maskFile))) await runFfmpeg(maskArgs(bw, bh, e.radius, maskFile), ctx.tmpDir, { signal: opts.signal })
          args.push('-loop', '1', '-framerate', String(FPS), '-t', String(num(dur)), '-i', maskFile)
          masks.set(key, nextInput++)
        }
        maskInput = masks.get(key)
      }
      filters.push(`[${input}:v]setsar=1,fps=${FPS},tpad=stop_mode=clone:stop_duration=${num(dur)},trim=duration=${num(dur)},setpts=PTS-STARTPTS[c${i}pre]`)
      const layer = layerFilters({
        input, maskInput, W: width, H: height, sw: clip.sourceWidth || src!.w, sh: clip.sourceHeight || src!.h,
        srcStart: clip.offset + (from - clip.start), dur, fps: FPS, e, motion: clip.motion, opacity, id: `c${i}`, opacityCmdFile,
      }, `c${i}pre`, label)
      filters.push(...layer.filters)
      label = layer.out
      continue
    }

    // Opacity of each frame (keyframes x fades). blend ignores a runtime value of exactly 1, so animated
    // stretches top out at 0.9999 (1/255 at most); fully opaque segments keep the plain overlay.
    const opacity = Array.from({ length: frames }, (_, k) => Math.min(0.9999, Math.max(0, Math.round(clipOpacityAt(clip, from + k / FPS - clip.start) * 10000) / 10000)))
    const opaque = opacity.every((v) => v >= 0.9999)
    const animated = !opaque && opacity.some((v) => v !== opacity[0])
    let cmd = ''
    if (animated) {
      const lines: string[] = []
      for (let k = 1; k < frames; k++) {
        // Half a frame early so the value lands exactly on frame k
        if (opacity[k] !== opacity[k - 1]) lines.push(`${num((k - 0.5) / FPS)} blend@b${i} all_opacity ${opacity[k]};`)
      }
      const cmdFile = `${name}.b${i}.cmd`
      await fs.writeFile(path.join(ctx.tmpDir, cmdFile), lines.join('\n'), 'utf-8')
      cmd = `,sendcmd=f=${cmdFile}`
    }

    // object-contain on black, held on its last frame if the source runs short
    filters.push(
      `[${input}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${FPS},format=yuv420p,` +
      `tpad=stop_mode=clone:stop_duration=${num(dur)},trim=duration=${num(dur)},setpts=PTS-STARTPTS${cmd}[v${i}]`,
    )
    filters.push(
      opaque
        ? `[${label}][v${i}]overlay=eof_action=pass[o${i}]`
        // Clip on top of what is below, mixed by its opacity
        : `[v${i}][${label}]blend@b${i}=all_mode=normal:all_opacity=${opacity[0]}[o${i}]`,
    )
    label = `o${i}`
  }

  // Captions of this stretch, re-timed to the segment start
  const end = from + dur
  const shown = ctx.captions
    .filter((c) => c.start < end && c.start + c.duration > from)
    .map((c) => ({ ...c, start: c.start - from }))
  if (shown.length > 0) {
    const ass = `${name}.ass`
    await fs.writeFile(path.join(ctx.tmpDir, ass), buildAss(shown, ctx.trackById, ctx.trackOrder, width, height), 'utf-8')
    // Relative to ffmpeg's cwd (tmpDir): avoids escaping drive letters and accents in the filter
    filters.push(`[${label}]ass=${ass}[cap]`)
    label = 'cap'
  }
  filters.push(`[${label}]format=yuv420p[vout]`)

  const graph = `${name}.graph.txt`
  await fs.writeFile(path.join(ctx.tmpDir, graph), filters.join(';\n'), 'utf-8')
  args.push(
    '-filter_complex_threads', '2',
    '-filter_complex_script', graph,
    '-map', '[vout]',
    '-frames:v', String(frames),
    '-r', String(FPS),
    '-an',
    // Identical settings in every segment, so they join without re-encoding
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-threads', String(ENCODE_THREADS),
    '-video_track_timescale', String(FPS * 1000),
    name,
  )
  await runFfmpeg(args, ctx.tmpDir, opts)
}
