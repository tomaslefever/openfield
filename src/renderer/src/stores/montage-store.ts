import { create } from 'zustand'
import { fileUrl } from '../services/file-url'
import { useAppStore } from './app-store'
import { useWorkspaceStore } from './workspace-store'
import { cleanMotion, type Composite, type Motion } from '../../../main/services/montage-composite'
export type { Composite, Motion } from '../../../main/services/montage-composite'

/*
 * Montage timeline: one document per project row (`projects.timeline_data`, tagged
 * `kind: 'montage'`). Captions, video and audio tracks all live in a single timeline.
 * Track order is display order; among video tracks the first one renders on top.
 *
 * The main process owns the stored timeline (services/montage-service.ts): MCP tools edit it there
 * and broadcast `montage:changed`, which this store adopts live. Saves carry the `rev` this copy
 * started from; main refuses a save based on an older rev and hands back the current doc.
 */

export type TrackKind = 'caption' | 'video' | 'audio'
export type ClipKind = 'video' | 'image' | 'audio' | 'caption'
/** Caption look: 'classic' small bottom lines, 'social' large raised text for vertical video */
export type CaptionStyle = 'classic' | 'social'

export interface MontageTrack {
  id: string
  kind: TrackKind
  name: string
  muted?: boolean
  /** Caption tracks only; undefined = classic */
  captionStyle?: CaptionStyle
  /** Caption tracks only: colour the spoken word when the clip has word timings (default on) */
  highlight?: boolean
  /** Video/audio tracks: 'voice' ducks the 'background' tracks while it plays */
  role?: TrackRole
  /** Background tracks: ducking settings (missing fields take DUCKING_DEFAULTS) */
  ducking?: Partial<DuckingConfig>
  /** Video tracks: default composition of their clips (a layout slot); clips override it */
  composite?: Composite
  /** Caption tracks: vertical centre of the captions, 0..1 of the frame (default: style's bottom placement) */
  captionY?: number
}

/** A transcribed word; on a clip, seconds relative to the clip start */
export interface CaptionWord {
  text: string
  start: number
  end: number
}

export interface MontageClip {
  id: string
  trackId: string
  kind: ClipKind
  name: string
  /** Media file path (video/image/audio) */
  src?: string
  /** Library asset the media came from */
  assetId?: string
  /** Caption text */
  text?: string
  /** Autocaption word timings (relative to `start`); ignored once the text no longer matches them */
  words?: CaptionWord[]
  /** Position on the timeline, seconds */
  start: number
  /** In-point inside the source media, seconds */
  offset: number
  duration: number
  /** Source length; undefined for images and captions (freely stretchable) */
  sourceDuration?: number
  /** 0..1; overridden by volumeKeys when there are any */
  volume: number
  /** Video/image clips, 0..1 (default 1); overridden by opacityKeys when there are any */
  opacity?: number
  /** Seconds of fade at each end: opacity for video/image, volume for audio (and a video's own sound) */
  fadeIn?: number
  fadeOut?: number
  /** Volume keyframes (clips with sound), times in SOURCE seconds so they stay on the content when trimmed */
  volumeKeys?: EnvelopeKey[]
  /** Voice override for ducking: true/false beats the track role (TTS clips are flagged when added) */
  voice?: boolean
  /** Video/image: placement and effects; the track's composite fills what it leaves out */
  composite?: Composite
  /** Keyframed x / y / scale / rotation, source seconds */
  motion?: Motion
  /** Source pixel size, when known */
  sourceWidth?: number
  sourceHeight?: number
  /** Opacity keyframes (video/image clips), times in source seconds */
  opacityKeys?: EnvelopeKey[]
}

/** One keyframe: `t` in source seconds (clip.offset + time into the clip), `v` 0..1 */
export interface EnvelopeKey {
  t: number
  v: number
}

export interface MontageDoc {
  kind: 'montage'
  version: 1
  /** Preview aspect ratio (width / height), taken from the first visual clip */
  aspect: number
  /** Aspect chosen explicitly (e.g. by an agent creating a 9:16 timeline); clips no longer change it */
  aspectLocked?: boolean
  tracks: MontageTrack[]
  clips: MontageClip[]
}

export interface MontageSummary {
  id: string
  name: string
  updatedAt: number
}

/** Minimal library asset shape the timeline needs */
export interface MontageAsset {
  id: string
  type: 'video' | 'image' | 'audio'
  /** Local file when downloaded, otherwise the provider URL */
  path: string
  name: string
  duration?: number | null
  width?: number | null
  height?: number | null
  /** Model id of the generation (TTS clips become voices) */
  model?: string | null
}

/** Library row (assets:list) → timeline asset; null when the file is unusable */
export function toMontageAsset(row: any): MontageAsset | null {
  const remote = row.filePath && !String(row.filePath).startsWith('__error__') ? row.filePath : null
  const path = row.localPath || remote
  if (!path || !['video', 'image', 'audio'].includes(row.type)) return null
  return {
    id: row.id,
    type: row.type,
    path,
    name: row.fileName || 'clip',
    duration: row.duration,
    width: row.width,
    height: row.height,
    model: row.modelUsed ?? null,
  }
}

export const MIN_CLIP = 0.1
export const IMAGE_DEFAULT = 5
export const CAPTION_DEFAULT = 3
const HISTORY_LIMIT = 100

export const TRACK_LABEL: Record<TrackKind, string> = { caption: 'Subtítulos', video: 'Video', audio: 'Audio' }

export const trackKindFor = (kind: ClipKind): TrackKind =>
  kind === 'caption' ? 'caption' : kind === 'audio' ? 'audio' : 'video'

const uid = () => crypto.randomUUID()
const api = () => (window as any).electronAPI

export function emptyDoc(): MontageDoc {
  return {
    kind: 'montage',
    version: 1,
    aspect: 16 / 9,
    tracks: [
      { id: uid(), kind: 'caption', name: 'Subtítulos' },
      { id: uid(), kind: 'video', name: 'Video 1' },
      { id: uid(), kind: 'audio', name: 'Audio 1' },
    ],
    clips: [],
  }
}

export const clipEnd = (c: MontageClip) => c.start + c.duration

/*
 * Envelopes. Same math as main montage-export (keep both in step): keyframes interpolate linearly
 * and hold before the first / after the last; fades are linear and together never exceed the clip.
 */

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

export function fadeLengths(c: MontageClip): [number, number] {
  let a = Math.max(0, c.fadeIn ?? 0)
  let b = Math.max(0, c.fadeOut ?? 0)
  if (a + b > c.duration && a + b > 0) {
    const k = c.duration / (a + b)
    a *= k
    b *= k
  }
  return [a, b]
}

/** 0..1 multiplier from the fades at `local` seconds into the clip */
export function fadeGain(c: MontageClip, local: number): number {
  const [fi, fo] = fadeLengths(c)
  let g = 1
  if (fi > 0 && local < fi) g = Math.min(g, Math.max(0, local / fi))
  if (fo > 0 && local > c.duration - fo) g = Math.min(g, Math.max(0, (c.duration - local) / fo))
  return g
}

/** Volume before fades (keyframes or the clip volume) at `local` seconds into the clip */
export const clipVolumeEnvelope = (c: MontageClip, local: number) => envelopeAt(c.volumeKeys, c.offset + local, c.volume)
export const clipOpacityEnvelope = (c: MontageClip, local: number) => envelopeAt(c.opacityKeys, c.offset + local, c.opacity ?? 1)
export const clipVolumeAt = (c: MontageClip, local: number) => clipVolumeEnvelope(c, local) * fadeGain(c, local)
export const clipOpacityAt = (c: MontageClip, local: number) => clipOpacityEnvelope(c, local) * fadeGain(c, local)

/*
 * Ducking (same math as main montage-export; keep both in step). A background track's gain is derived
 * from the voice clips every time, so it follows when a voice moves, and it multiplies the clips' own
 * volume curve instead of replacing it.
 */

export type TrackRole = 'voice' | 'background'

export interface DuckingConfig {
  enabled: boolean
  /** Gain while a voice plays, dB (negative) */
  amountDb: number
  /** Seconds to go down before the padded voice start / to come back after its end */
  attack: number
  release: number
  /** Seconds added before and after each voice clip */
  padBefore: number
  padAfter: number
}

export const DUCKING_DEFAULTS: DuckingConfig = { enabled: true, amountDb: -12, attack: 0.15, release: 0.4, padBefore: 0.1, padAfter: 0.25 }

/** Speech generations (TTS / Voice Studio / voice design), by model id; mirrors main isVoiceModel */
export function isVoiceModel(model?: string | null): boolean {
  const m = String(model || '').toLowerCase()
  if (!m || /music|sfx|sound|song|suno|lyria/.test(m)) return false
  return /^elevenlabs(-design)?:/.test(m) || /^eleven_/.test(m) || /tts|text-to-speech|speech|dialogue|voice/.test(m)
}

const sounds = (c: MontageClip, track?: MontageTrack) =>
  !!track && ((c.kind === 'video' && track.kind === 'video') || (c.kind === 'audio' && track.kind === 'audio'))

export function isVoiceClip(c: MontageClip, track?: MontageTrack): boolean {
  if (!sounds(c, track)) return false
  return c.voice ?? track!.role === 'voice'
}

export const duckingConfig = (track: MontageTrack): DuckingConfig => ({ ...DUCKING_DEFAULTS, ...(track.ducking ?? {}) })

/** Padded voice ranges, merged when the gap is too short to come back up between them */
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

/** Gain curve (timeline seconds) of a ducking background track; null when it does not duck */
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

export function computeDucking(doc: MontageDoc): Map<string, EnvelopeKey[]> {
  const out = new Map<string, EnvelopeKey[]>()
  for (const t of doc.tracks) {
    const keys = duckingKeys(doc, t)
    if (keys) out.set(t.id, keys)
  }
  return out
}

/** Ducking gain of a clip at `local` seconds into it (1 for voices and non-ducking tracks) */
export function clipDuckAt(c: MontageClip, track: MontageTrack | undefined, keys: EnvelopeKey[] | undefined, local: number): number {
  if (!keys?.length || isVoiceClip(c, track)) return 1
  return envelopeAt(keys, c.start + local, 1)
}

/** Valid keyframes sorted by time, values clamped to 0..1 */
export function cleanKeys(raw: unknown): EnvelopeKey[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const keys = raw
    .filter((k: any) => k && Number.isFinite(k.t) && Number.isFinite(k.v))
    .map((k: any) => ({ t: k.t, v: Math.min(1, Math.max(0, k.v)) }))
    .sort((a, b) => a.t - b.t)
  return keys.length ? keys : undefined
}

const sameText = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()

/** A caption's word timings while they still spell its text (editing the text turns highlighting off) */
export function usableWords(clip: MontageClip): CaptionWord[] | null {
  const words = clip.words
  if (clip.kind !== 'caption' || !words?.length || !clip.text || !sameText(words.map((w) => w.text).join(' '), clip.text)) return null
  return words
}

/** Splitting a transcribed caption at `head` seconds gives each half its own words and text */
function splitCaptionWords(clip: MontageClip, head: number): [Partial<MontageClip>, Partial<MontageClip>] {
  const words = usableWords(clip)
  if (!words) return [{}, {}]
  const before = words.filter((w) => w.start < head)
  const after = words.filter((w) => w.start >= head)
  if (before.length === 0 || after.length === 0) return [{}, {}]
  return [
    { words: before, text: before.map((w) => w.text).join(' ') },
    { words: after.map((w) => ({ ...w, start: w.start - head, end: w.end - head })), text: after.map((w) => w.text).join(' ') },
  ]
}

export function docDuration(doc: MontageDoc): number {
  return doc.clips.reduce((max, c) => Math.max(max, clipEnd(c)), 0)
}

/** Nearest start on `trackId` to `desired` where a clip of `duration` fits without overlapping */
export function fitStart(doc: MontageDoc, trackId: string, desired: number, duration: number, ignoreId?: string): number {
  const siblings = doc.clips
    .filter((c) => c.trackId === trackId && c.id !== ignoreId)
    .sort((a, b) => a.start - b.start)
  let best = Math.max(0, desired)
  let bestDist = Infinity
  let cursor = 0
  const tryGap = (a: number, b: number) => {
    if (b - a < duration - 1e-6) return
    const s = Math.min(Math.max(desired, a), b - duration)
    const d = Math.abs(s - desired)
    if (d < bestDist) { bestDist = d; best = s }
  }
  for (const c of siblings) {
    tryGap(cursor, c.start)
    cursor = Math.max(cursor, clipEnd(c))
  }
  tryGap(cursor, Infinity)
  return best
}

/** Free range around a clip on its own track: [previous clip end, next clip start] */
export function neighbourBounds(doc: MontageDoc, clip: MontageClip): { min: number; max: number } {
  let min = 0
  let max = Infinity
  for (const c of doc.clips) {
    if (c.trackId !== clip.trackId || c.id === clip.id) continue
    if (clipEnd(c) <= clip.start + 1e-6) min = Math.max(min, clipEnd(c))
    else if (c.start >= clipEnd(clip) - 1e-6) max = Math.min(max, c.start)
  }
  return { min, max }
}

interface MediaProbe { duration?: number; width?: number; height?: number }

/** Reads a media file's duration and size through a throwaway element */
export function probeMedia(url: string, kind: ClipKind): Promise<MediaProbe> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (v: MediaProbe) => { if (!settled) { settled = true; resolve(v) } }
    setTimeout(() => finish({}), 8000)
    if (kind === 'image') {
      const img = new Image()
      img.onload = () => finish({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => finish({})
      img.src = url
      return
    }
    const el = document.createElement(kind === 'audio' ? 'audio' : 'video')
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      const v = el instanceof HTMLVideoElement ? el : null
      finish({
        duration: Number.isFinite(el.duration) ? el.duration : undefined,
        width: v?.videoWidth || undefined,
        height: v?.videoHeight || undefined,
      })
      el.removeAttribute('src')
      el.load()
    }
    el.onerror = () => finish({})
    el.src = url
  })
}

/** IPC rows arrive camelCased */
const rowTimeline = (row: any) => row?.timelineData ?? row?.timeline_data

function parseDoc(raw: unknown): MontageDoc | null {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (data && data.kind === 'montage' && Array.isArray(data.tracks) && Array.isArray(data.clips)) return sanitizeDoc(data)
  } catch {}
  return null
}

const finite = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/** Stored docs are untrusted: drop media clips without a file or track, fill missing fields */
function sanitizeDoc(data: any): MontageDoc {
  const tracks: MontageTrack[] = data.tracks
    .filter((t: any) => t && typeof t.id === 'string' && ['caption', 'video', 'audio'].includes(t.kind))
    .map((t: any) => ({
      ...t,
      name: typeof t.name === 'string' && t.name ? t.name : TRACK_LABEL[t.kind as TrackKind],
      role: t.kind !== 'caption' && (t.role === 'voice' || t.role === 'background') ? t.role : undefined,
      ducking: t.ducking && typeof t.ducking === 'object' ? t.ducking : undefined,
      composite: t.kind === 'video' && t.composite && typeof t.composite === 'object' ? t.composite : undefined,
      captionY: t.kind === 'caption' && typeof t.captionY === 'number' && Number.isFinite(t.captionY) ? Math.min(1, Math.max(0, t.captionY)) : undefined,
    }))
  const trackIds = new Set(tracks.map((t) => t.id))
  const clips: MontageClip[] = data.clips
    .filter((c: any) => c && trackIds.has(c.trackId) && (c.kind === 'caption' || typeof c.src === 'string' && c.src))
    .map((c: any) => ({
      ...c,
      name: typeof c.name === 'string' && c.name ? c.name : c.kind === 'caption' ? 'Subtítulo' : 'Clip',
      text: c.kind === 'caption' ? String(c.text ?? '') : c.text,
      start: Math.max(0, finite(c.start, 0)),
      offset: Math.max(0, finite(c.offset, 0)),
      duration: Math.max(MIN_CLIP, finite(c.duration, IMAGE_DEFAULT)),
      volume: Math.min(1, Math.max(0, finite(c.volume, 1))),
      opacity: c.opacity === undefined ? undefined : Math.min(1, Math.max(0, finite(c.opacity, 1))),
      fadeIn: c.fadeIn ? Math.max(0, finite(c.fadeIn, 0)) || undefined : undefined,
      fadeOut: c.fadeOut ? Math.max(0, finite(c.fadeOut, 0)) || undefined : undefined,
      volumeKeys: cleanKeys(c.volumeKeys),
      opacityKeys: cleanKeys(c.opacityKeys),
      composite: c.composite && typeof c.composite === 'object' ? c.composite : undefined,
      motion: cleanMotion(c.motion),
      words: Array.isArray(c.words)
        ? c.words.filter((w: any) => w && typeof w.text === 'string' && Number.isFinite(w.start) && Number.isFinite(w.end))
        : undefined,
    }))
  return { kind: 'montage', version: 1, aspect: finite(data.aspect, 16 / 9) || 16 / 9, ...(data.aspectLocked ? { aspectLocked: true } : {}), tracks, clips }
}

interface MontageState {
  montages: MontageSummary[]
  activeId: string | null
  name: string
  doc: MontageDoc
  past: MontageDoc[]
  future: MontageDoc[]
  selectedClipId: string | null
  loaded: boolean

  time: number
  playing: boolean
  loop: boolean
  /** Pixels per second */
  zoom: number
  /** Which envelope video clips show and edit on the timeline (audio: volume, images: opacity) */
  envelope: 'volume' | 'opacity'
  /** Composition edits (preview handles, properties panel) go to the clip or to its track (layout slot) */
  compositeTarget: 'clip' | 'track'

  load: () => Promise<void>
  loadNow: () => Promise<void>
  open: (id: string) => Promise<void>
  createMontage: () => Promise<void>
  /** New montage from a layout preset (main builds it); opens it */
  createFromLayout: (layout: string, name?: string) => Promise<{ ok: boolean; error?: string }>
  renameMontage: (name: string) => void
  deleteMontage: (id: string) => Promise<void>

  /** Snapshot the doc for undo; call once before a gesture or discrete edit */
  checkpoint: () => void
  undo: () => void
  redo: () => void
  /** Replace the doc without recording history (drag updates) */
  mutate: (fn: (doc: MontageDoc) => MontageDoc) => void

  select: (id: string | null) => void
  addAsset: (asset: MontageAsset, at?: { trackId?: string; start?: number }) => Promise<void>
  addCaption: (trackId?: string, start?: number) => string | null
  updateClip: (id: string, patch: Partial<MontageClip>) => void
  removeClip: (id: string) => void
  splitAtPlayhead: () => void
  addTrack: (kind: TrackKind) => void
  renameTrack: (id: string, name: string) => void
  toggleTrackMute: (id: string) => void
  removeTrack: (id: string) => void
  setCaptionStyle: (trackId: string, patch: Pick<MontageTrack, 'captionStyle' | 'highlight'>) => void
  /** Voice / background / none for a video or audio track */
  setTrackRole: (trackId: string, role: TrackRole | null) => void
  setDucking: (trackId: string, patch: Partial<DuckingConfig>) => void
  /** Writes the track's ducking into its clips' volume keyframes and turns automatic ducking off */
  bakeDucking: (trackId: string) => number
  /** Marks TTS clips/tracks as voices (main looks the assets up); returns how many were marked */
  detectVoices: () => Promise<{ voiceTracks: string[]; voiceClips: string[] }>
  /**
   * Autoducking button: detect voices and duck every music/background track (main planAutoDucking,
   * same as MCP timeline_autoducking). Nothing changes when there is nothing to duck.
   */
  enableAutoDucking: (config?: Partial<DuckingConfig>) => Promise<AutoDuckingResult>
  /** Switches ducking off on every background track (roles and settings are kept) */
  disableAutoDucking: () => void
  /** Same ducking settings on every background track */
  setDuckingAll: (patch: Partial<DuckingConfig>) => void
  /** New caption track (on top) holding transcribed segments in timeline seconds; returns the clip count */
  applyAutocaptions: (
    segments: { start: number; end: number; text: string; words: CaptionWord[] }[],
    track: { name: string; captionStyle: CaptionStyle; highlight: boolean },
  ) => number

  setTime: (t: number) => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  toggleLoop: () => void
  setZoom: (z: number) => void
  setEnvelope: (e: 'volume' | 'opacity') => void
  setCompositeTarget: (t: 'clip' | 'track') => void
  /** Replace a clip's or a track's composite (records history unless `live`, used while dragging) */
  setComposite: (target: { clipId: string } | { trackId: string }, composite: Composite | undefined, live?: boolean) => void
  setMotion: (clipId: string, motion: Motion | undefined, live?: boolean) => void
  /** The preview learned a source's pixel size (no history) */
  setSourceSize: (clipId: string, w: number, h: number) => void

  /** Persist the doc now (before an export reads the stored timeline) */
  saveNow: () => Promise<void>
  /** A timeline change made outside this window (MCP tools) */
  applyRemote: (change: MontageChange) => void
}

export interface AutoDuckingResult {
  ok: boolean
  reason?: 'no-voices' | 'no-background'
  voiceTracks: string[]
  voiceClips: string[]
  backgroundTracks: string[]
}

/** Payload of `montage:changed` (main montage-service broadcastMontage) */
export interface MontageChange {
  id: string
  rev: number
  name: string
  doc: unknown | null
  source: 'mcp' | 'ui'
  workspaceId: string
  open?: boolean
}

let rafId = 0
/** Concurrent load() calls (mount + workspace change) share one run, so only one montage is ever auto-created */
let loading: Promise<void> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
/** Stored rev the local doc is based on; sent with every save */
let baseRev: number | undefined
/** Timeline to open on the next load (the window was asked to show it before the page loaded) */
let preferId: string | null = null

const rowRev = (row: any): number | undefined => {
  try {
    const raw = rowTimeline(row)
    const rev = (typeof raw === 'string' ? JSON.parse(raw) : raw)?.rev
    return typeof rev === 'number' ? rev : undefined
  } catch {
    return undefined
  }
}

export const useMontageStore = create<MontageState>((set, get) => {
  /** Adopts the stored timeline; the local state before it stays one undo away */
  const adopt = (doc: MontageDoc, rev: number, name?: string) => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    baseRev = rev
    set((s) => ({
      past: [...s.past.slice(-HISTORY_LIMIT + 1), s.doc],
      future: [],
      doc,
      name: name ?? s.name,
      selectedClipId: doc.clips.some((c) => c.id === s.selectedClipId) ? s.selectedClipId : null,
      montages: s.montages.map((m) => (m.id === s.activeId ? { ...m, name: name ?? m.name, updatedAt: Date.now() } : m)),
    }))
  }

  const persist = async () => {
    const { activeId, doc } = get()
    if (!activeId) return
    try {
      const res = await api()?.projects.update(activeId, { timelineData: doc, baseRev })
      if (get().activeId !== activeId || !res) return
      if (res.stale) {
        // An agent edited the timeline after this copy was loaded: theirs wins, ours stays undoable
        const fresh = parseDoc(res.doc)
        if (fresh) adopt(fresh, res.rev, res.name)
      } else if (typeof res.rev === 'number') baseRev = res.rev
    } catch {}
  }

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveTimer = null; void persist() }, 500)
  }

  const flushSave = () => {
    if (!saveTimer) return
    clearTimeout(saveTimer)
    saveTimer = null
    void persist()
  }

  /** Discrete edit: record history, apply, save */
  const edit = (fn: (doc: MontageDoc) => MontageDoc) => {
    get().checkpoint()
    get().mutate(fn)
  }

  const tick = (() => {
    let last = 0
    const loop = (now: number) => {
      const { playing, time, doc } = get()
      if (!playing) return
      const dt = last ? (now - last) / 1000 : 0
      last = now
      const end = docDuration(doc)
      const next = time + dt
      if (next >= end) {
        if (get().loop && end > 0) {
          set({ time: 0 })
          rafId = requestAnimationFrame(loop)
          return
        }
        set({ time: end, playing: false })
        return
      }
      set({ time: next })
      rafId = requestAnimationFrame(loop)
    }
    return {
      start: () => { last = 0; cancelAnimationFrame(rafId); rafId = requestAnimationFrame(loop) },
      stop: () => cancelAnimationFrame(rafId),
    }
  })()

  return {
    montages: [],
    activeId: null,
    name: '',
    doc: emptyDoc(),
    past: [],
    future: [],
    selectedClipId: null,
    loaded: false,
    time: 0,
    playing: false,
    loop: false,
    zoom: 60,
    envelope: 'volume',
    compositeTarget: 'clip',

    load: () => {
      loading ??= get().loadNow().finally(() => { loading = null })
      return loading
    },

    loadNow: async () => {
      flushSave()
      get().pause()
      const rows: any[] = (await api()?.projects.list()) ?? []
      const montages = rows
        .filter((r) => parseDoc(rowTimeline(r)))
        .map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt ?? r.updated_at }))
      set({ montages, loaded: true })
      const wanted = preferId ? montages.find((m) => m.id === preferId) : undefined
      preferId = null
      if (wanted) return get().open(wanted.id)
      const keep = montages.find((m) => m.id === get().activeId)
      if (keep) return
      if (montages.length > 0) await get().open(montages[0].id)
      else await get().createMontage()
    },

    open: async (id) => {
      flushSave()
      get().pause()
      const row = await api()?.projects.get(id)
      const doc = parseDoc(rowTimeline(row))
      if (!row || !doc) return
      baseRev = rowRev(row)
      set({ activeId: id, name: row.name, doc, past: [], future: [], selectedClipId: null, time: 0 })
    },

    createMontage: async () => {
      flushSave()
      get().pause()
      const name = `Montaje ${get().montages.length + 1}`
      const row = await api()?.projects.create(name)
      if (!row) return
      const doc = emptyDoc()
      const saved = await api()?.projects.update(row.id, { timelineData: doc })
      baseRev = typeof saved?.rev === 'number' ? saved.rev : undefined
      set((s) => ({
        montages: [{ id: row.id, name, updatedAt: Date.now() }, ...s.montages],
        activeId: row.id, name, doc, past: [], future: [], selectedClipId: null, time: 0,
      }))
    },

    createFromLayout: async (layout, name) => {
      flushSave()
      get().pause()
      const res = await api()?.projects.createFromLayout?.(layout, name)
      if (!res?.ok) return { ok: false, error: res?.error ?? 'No se pudo crear el montaje' }
      set((s) => ({ montages: [{ id: res.id, name: res.name, updatedAt: Date.now() }, ...s.montages.filter((m) => m.id !== res.id)] }))
      await get().open(res.id)
      return { ok: true }
    },

    renameMontage: (name) => {
      const { activeId } = get()
      const clean = name.trim()
      if (!activeId || !clean) return
      set((s) => ({ name: clean, montages: s.montages.map((m) => (m.id === activeId ? { ...m, name: clean } : m)) }))
      api()?.projects.update(activeId, { name: clean }).catch(() => {})
    },

    deleteMontage: async (id) => {
      if (saveTimer && get().activeId === id) { clearTimeout(saveTimer); saveTimer = null }
      await api()?.projects.delete(id)
      const montages = get().montages.filter((m) => m.id !== id)
      set({ montages })
      if (get().activeId !== id) return
      set({ activeId: null })
      if (montages.length > 0) await get().open(montages[0].id)
      else await get().createMontage()
    },

    checkpoint: () => set((s) => ({ past: [...s.past.slice(-HISTORY_LIMIT + 1), s.doc], future: [] })),

    undo: () => {
      const { past, doc, future } = get()
      if (past.length === 0) return
      set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future] })
      scheduleSave()
    },

    redo: () => {
      const { past, doc, future } = get()
      if (future.length === 0) return
      set({ doc: future[0], past: [...past, doc], future: future.slice(1) })
      scheduleSave()
    },

    mutate: (fn) => {
      set((s) => ({ doc: fn(s.doc) }))
      scheduleSave()
    },

    select: (id) => set({ selectedClipId: id }),

    addAsset: async (asset, at = {}) => {
      const kind: ClipKind = asset.type
      const trackKind = trackKindFor(kind)
      const { doc, time } = get()
      const track =
        doc.tracks.find((t) => t.id === at.trackId && t.kind === trackKind) ??
        doc.tracks.find((t) => t.kind === trackKind)
      if (!track) return

      const hasVisual = doc.clips.some((c) => c.kind === 'video' || c.kind === 'image')
      // The first visual clip sets the preview aspect, so its size must be known
      const needsSize = kind !== 'audio' && !hasVisual && !(asset.width && asset.height)
      const needsDuration = kind !== 'image' && !(asset.duration && asset.duration > 0)
      const probe = needsSize || needsDuration ? await probeMedia(fileUrl(asset.path), kind) : {}
      let sourceDuration: number | undefined
      if (kind !== 'image') sourceDuration = (needsDuration ? probe.duration : asset.duration!) || IMAGE_DEFAULT
      const width = asset.width || probe.width
      const height = asset.height || probe.height
      const duration = sourceDuration ?? IMAGE_DEFAULT
      const desired = at.start ?? time
      const current = get().doc
      const start = fitStart(current, track.id, desired, duration)
      const clip: MontageClip = {
        id: uid(),
        trackId: track.id,
        kind,
        name: asset.name,
        src: asset.path,
        assetId: asset.id,
        start,
        offset: 0,
        duration,
        sourceDuration,
        volume: 1,
        ...(kind === 'audio' && isVoiceModel(asset.model) ? { voice: true } : {}),
        ...(kind !== 'audio' && width && height ? { sourceWidth: width, sourceHeight: height } : {}),
      }
      const aspect = !hasVisual && !current.aspectLocked && kind !== 'audio' && width && height ? width / height : current.aspect
      edit((d) => ({ ...d, aspect, clips: [...d.clips, clip] }))
      set({ selectedClipId: clip.id })
    },

    addCaption: (trackId, start) => {
      const { doc, time } = get()
      let track = doc.tracks.find((t) => t.id === trackId && t.kind === 'caption') ?? doc.tracks.find((t) => t.kind === 'caption')
      const newTrack = !track
      if (!track) track = { id: uid(), kind: 'caption', name: 'Subtítulos' }
      const base = newTrack ? { ...doc, tracks: [track, ...doc.tracks] } : doc
      const clip: MontageClip = {
        id: uid(),
        trackId: track.id,
        kind: 'caption',
        name: 'Subtítulo',
        text: 'Nuevo subtítulo',
        start: fitStart(base, track.id, start ?? time, CAPTION_DEFAULT),
        offset: 0,
        duration: CAPTION_DEFAULT,
        volume: 1,
      }
      edit(() => ({ ...base, clips: [...base.clips, clip] }))
      set({ selectedClipId: clip.id })
      return clip.id
    },

    updateClip: (id, patch) => edit((d) => ({ ...d, clips: d.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),

    removeClip: (id) => {
      edit((d) => ({ ...d, clips: d.clips.filter((c) => c.id !== id) }))
      if (get().selectedClipId === id) set({ selectedClipId: null })
    },

    splitAtPlayhead: () => {
      const { doc, time, selectedClipId } = get()
      const inside = (c: MontageClip) => time > c.start + MIN_CLIP && time < clipEnd(c) - MIN_CLIP
      const selected = doc.clips.find((c) => c.id === selectedClipId)
      const targets = selected ? (inside(selected) ? [selected] : []) : doc.clips.filter(inside)
      if (targets.length === 0) return
      const ids = new Set(targets.map((c) => c.id))
      edit((d) => ({
        ...d,
        clips: d.clips.flatMap((c) => {
          if (!ids.has(c.id)) return [c]
          const head = time - c.start
          const [a, b] = splitCaptionWords(c, head)
          return [
            // Each half keeps the fade on its outer end
            { ...c, duration: head, fadeOut: undefined, ...a },
            { ...c, id: uid(), start: time, offset: c.offset + head, duration: c.duration - head, fadeIn: undefined, ...b },
          ]
        }),
      }))
    },

    addTrack: (kind) =>
      edit((d) => {
        const count = d.tracks.filter((t) => t.kind === kind).length
        const track: MontageTrack = { id: uid(), kind, name: kind === 'caption' ? `Subtítulos ${count + 1}` : `${TRACK_LABEL[kind]} ${count + 1}` }
        const tracks = [...d.tracks]
        if (kind === 'video') {
          // New video tracks go on top of the existing ones (and render above them)
          const first = tracks.findIndex((t) => t.kind === 'video')
          tracks.splice(first === -1 ? tracks.filter((t) => t.kind === 'caption').length : first, 0, track)
        } else {
          let last = -1
          tracks.forEach((t, i) => { if (t.kind === kind) last = i })
          if (last !== -1) tracks.splice(last + 1, 0, track)
          else if (kind === 'caption') tracks.unshift(track)
          else tracks.push(track)
        }
        return { ...d, tracks }
      }),

    renameTrack: (id, name) => {
      const clean = name.trim()
      if (!clean) return
      edit((d) => ({ ...d, tracks: d.tracks.map((t) => (t.id === id ? { ...t, name: clean } : t)) }))
    },

    toggleTrackMute: (id) =>
      edit((d) => ({ ...d, tracks: d.tracks.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t)) })),

    removeTrack: (id) => {
      edit((d) => ({ ...d, tracks: d.tracks.filter((t) => t.id !== id), clips: d.clips.filter((c) => c.trackId !== id) }))
      const sel = get().doc.clips.find((c) => c.id === get().selectedClipId)
      if (!sel) set({ selectedClipId: null })
    },

    setTrackRole: (trackId, role) =>
      edit((d) => ({
        ...d,
        tracks: d.tracks.map((t) => (t.id === trackId && t.kind !== 'caption'
          ? { ...t, role: role ?? undefined, ...(role === 'background' ? { ducking: { ...DUCKING_DEFAULTS, ...(t.ducking ?? {}) } } : {}) }
          : t)),
      })),

    setDucking: (trackId, patch) =>
      edit((d) => ({ ...d, tracks: d.tracks.map((t) => (t.id === trackId ? { ...t, ducking: { ...DUCKING_DEFAULTS, ...(t.ducking ?? {}), ...patch } } : t)) })),

    bakeDucking: (trackId) => {
      const doc = get().doc
      const track = doc.tracks.find((t) => t.id === trackId)
      const keys = track && duckingKeys(doc, track)
      if (!track || !keys) return 0
      let baked = 0
      edit((d) => ({
        ...d,
        tracks: d.tracks.map((t) => (t.id === trackId ? { ...t, ducking: { ...duckingConfig(t), enabled: false } } : t)),
        clips: d.clips.map((c) => {
          if (c.trackId !== trackId || isVoiceClip(c, track)) return c
          const end = c.start + c.duration
          const innerKeys = keys.filter((k) => k.t > c.start && k.t < end)
          const inner = innerKeys.map((k) => k.t - c.start)
          // Untouched by the dip (same test as main clipDuckKeys)
          if ([envelopeAt(keys, c.start, 1), ...innerKeys.map((k) => k.v), envelopeAt(keys, end, 1)].every((v) => v >= 0.9999)) return c
          // Sample both curves wherever either one bends (same as main bakeDucking)
          const times = new Set<number>([0, c.duration, ...inner, ...(c.volumeKeys ?? []).map((k) => k.t - c.offset)])
          const local = [...times].filter((t) => t >= 0 && t <= c.duration).sort((a, b) => a - b)
          baked++
          return {
            ...c,
            volumeKeys: cleanKeys(local.map((t) => ({
              t: Math.round((c.offset + t) * 10000) / 10000,
              v: Math.round(clipVolumeEnvelope(c, t) * envelopeAt(keys, c.start + t, 1) * 10000) / 10000,
            }))),
          }
        }),
      }))
      return baked
    },

    detectVoices: async () => {
      const res = (await api()?.projects.detectVoices?.(get().doc)) ?? { voiceTracks: [], voiceClips: [] }
      const tracks = new Set<string>(res.voiceTracks)
      const clips = new Set<string>(res.voiceClips)
      if (tracks.size || clips.size) {
        edit((d) => ({
          ...d,
          tracks: d.tracks.map((t) => (tracks.has(t.id) ? { ...t, role: 'voice' as const } : t)),
          clips: d.clips.map((c) => (clips.has(c.id) ? { ...c, voice: true } : c)),
        }))
      }
      return res
    },

    enableAutoDucking: async (config = {}) => {
      const plan: AutoDuckingResult = (await api()?.projects.planAutoDucking?.(get().doc)) ?? { ok: false, reason: 'no-voices', voiceTracks: [], voiceClips: [], backgroundTracks: [] }
      if (!plan.ok) return plan
      const voiceTracks = new Set(plan.voiceTracks)
      const voiceClips = new Set(plan.voiceClips)
      const background = new Set(plan.backgroundTracks)
      edit((d) => ({
        ...d,
        tracks: d.tracks.map((t) => {
          if (voiceTracks.has(t.id)) return { ...t, role: 'voice' as const }
          if (background.has(t.id)) return { ...t, role: 'background' as const, ducking: { ...DUCKING_DEFAULTS, ...(t.ducking ?? {}), ...config, enabled: true } }
          return t
        }),
        clips: d.clips.map((c) => (voiceClips.has(c.id) ? { ...c, voice: true } : c)),
      }))
      return plan
    },

    disableAutoDucking: () =>
      edit((d) => ({ ...d, tracks: d.tracks.map((t) => (t.role === 'background' ? { ...t, ducking: { ...duckingConfig(t), enabled: false } } : t)) })),

    setDuckingAll: (patch) =>
      edit((d) => ({ ...d, tracks: d.tracks.map((t) => (t.role === 'background' ? { ...t, ducking: { ...duckingConfig(t), ...patch } } : t)) })),

    setCaptionStyle: (trackId, patch) =>
      edit((d) => ({ ...d, tracks: d.tracks.map((t) => (t.id === trackId && t.kind === 'caption' ? { ...t, ...patch } : t)) })),

    applyAutocaptions: (segments, info) => {
      const track: MontageTrack = { id: uid(), kind: 'caption', ...info }
      const clips: MontageClip[] = segments
        .filter((s) => s.text.trim() && s.end - s.start >= MIN_CLIP / 2)
        .map((s) => ({
          id: uid(),
          trackId: track.id,
          kind: 'caption',
          name: 'Subtítulo',
          text: s.text,
          words: s.words.length
            ? s.words.map((w) => ({ text: w.text, start: Math.max(0, w.start - s.start), end: Math.max(0, w.end - s.start) }))
            : undefined,
          start: s.start,
          offset: 0,
          duration: Math.max(MIN_CLIP, s.end - s.start),
          volume: 1,
        }))
      if (clips.length === 0) return 0
      // First track: renders above the other captions, like a freshly added top layer
      edit((d) => ({ ...d, tracks: [track, ...d.tracks], clips: [...d.clips, ...clips] }))
      return clips.length
    },

    setTime: (t) => set({ time: Math.max(0, t) }),

    play: () => {
      const { time, doc } = get()
      const end = docDuration(doc)
      if (end <= 0) return
      set({ playing: true, time: time >= end - 0.01 ? 0 : time })
      tick.start()
    },

    pause: () => {
      tick.stop()
      if (get().playing) set({ playing: false })
    },

    togglePlay: () => (get().playing ? get().pause() : get().play()),

    toggleLoop: () => set((s) => ({ loop: !s.loop })),

    setZoom: (z) => set({ zoom: Math.min(400, Math.max(8, z)) }),

    setEnvelope: (envelope) => set({ envelope }),

    setCompositeTarget: (compositeTarget) => set({ compositeTarget }),

    setComposite: (target, composite, live) => {
      const apply = (d: MontageDoc): MontageDoc => ('clipId' in target
        ? { ...d, clips: d.clips.map((c) => (c.id === target.clipId ? { ...c, composite } : c)) }
        : { ...d, tracks: d.tracks.map((t) => (t.id === target.trackId ? { ...t, composite } : t)) })
      if (live) get().mutate(apply)
      else edit(apply)
    },

    setMotion: (clipId, motion, live) => {
      const apply = (d: MontageDoc): MontageDoc => ({ ...d, clips: d.clips.map((c) => (c.id === clipId ? { ...c, motion } : c)) })
      if (live) get().mutate(apply)
      else edit(apply)
    },

    setSourceSize: (clipId, w, h) => {
      const c = get().doc.clips.find((x) => x.id === clipId)
      if (!c || (c.sourceWidth === w && c.sourceHeight === h)) return
      get().mutate((d) => ({ ...d, clips: d.clips.map((x) => (x.id === clipId ? { ...x, sourceWidth: w, sourceHeight: h } : x)) }))
    },

    saveNow: async () => {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
      await persist()
    },

    applyRemote: (change) => {
      if (change.source === 'ui') return
      if (change.workspaceId && change.workspaceId !== useWorkspaceStore.getState().activeId) return
      if (change.open) {
        preferId = change.id
        useAppStore.getState().setPage('montage')
      }
      if (!get().loaded) return
      if (!change.doc) {
        // Deleted: reload the list (opens another timeline if it was the open one)
        void get().loadNow()
        return
      }
      const doc = parseDoc(change.doc)
      if (!doc) return
      preferId = null
      if (change.id === get().activeId) {
        adopt(doc, change.rev, change.name)
        return
      }
      set((s) => ({ montages: [{ id: change.id, name: change.name, updatedAt: Date.now() }, ...s.montages.filter((m) => m.id !== change.id)] }))
      // Follow the agent: show the timeline it is editing
      void get().open(change.id)
    },
  }
})

// Live updates from the MCP tools (main montage-service)
api()?.on?.('montage:changed', (change: MontageChange) => useMontageStore.getState().applyRemote(change))
