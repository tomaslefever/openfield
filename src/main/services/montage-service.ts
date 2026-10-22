import * as crypto from 'crypto'
import * as syncFs from 'fs'
import * as path from 'path'
import { app, BrowserWindow } from 'electron'
import { getRawDb } from '../db'
import { getActiveWorkspaceId } from './workspace-service'
import { getAssetManager } from './asset-manager'
import { resolveAssetFile } from './asset-file'
import { getFFmpeg } from './ffmpeg'
import {
  DUCKING_DEFAULTS,
  cleanKeys,
  clipDuckKeys,
  computeDucking,
  duckingConfig,
  envelopeAt,
  fadeLengths,
  isVoiceClip,
  montageSize,
  renderMontage,
  voiceRanges,
  type CaptionStyle,
  type CaptionWord,
  type DuckingConfig,
  type EnvelopeKey,
  type MontageClip,
  type MontageDoc,
  type MontageTrack,
  type TrackRole,
} from './montage-export'
import { cleanMotion } from './montage-composite'

/*
 * Montage timelines owned by the main process. A timeline is one `projects` row whose
 * `timeline_data` holds the montage doc (`kind: 'montage'`, renderer `montage-store.ts` mirrors the
 * schema). Every write goes through here: it bumps the doc's `rev` and broadcasts
 * `montage:changed`, so the MCP tools and the open Timeline page always see the same timeline. The
 * page keeps a local copy for smooth dragging and saves it back with the `rev` it started from;
 * a save based on an older rev is refused (see saveFromUi) so neither side overwrites the other.
 */

export type TrackKind = 'caption' | 'video' | 'audio'
export type { MontageDoc, MontageClip, MontageTrack, CaptionStyle }

/** Caller mistakes (missing ids, out-of-range times, overlaps); reported verbatim to the agent */
export class MontageError extends Error {}

export const MIN_CLIP = 0.1
export const IMAGE_DEFAULT = 5
const EPS = 1e-6

const uid = () => crypto.randomUUID()
const r4 = (n: number) => Math.round(n * 10000) / 10000
const finite = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const TRACK_LABEL: Record<TrackKind, string> = { caption: 'Subtítulos', video: 'Video', audio: 'Audio' }

export const trackKindFor = (kind: MontageClip['kind']): TrackKind =>
  kind === 'caption' ? 'caption' : kind === 'audio' ? 'audio' : 'video'

export const clipEnd = (c: MontageClip) => c.start + c.duration

export function docDuration(doc: MontageDoc): number {
  return doc.clips.reduce((max, c) => Math.max(max, clipEnd(c)), 0)
}

export function emptyDoc(aspect?: number): MontageDoc {
  return {
    kind: 'montage',
    aspect: aspect ?? 16 / 9,
    ...(aspect ? { aspectLocked: true } : {}),
    tracks: [
      { id: uid(), kind: 'caption', name: 'Subtítulos' },
      { id: uid(), kind: 'video', name: 'Video 1' },
      { id: uid(), kind: 'audio', name: 'Audio 1' },
    ],
    clips: [],
  }
}

/** Stored docs are untrusted: same rules as the renderer's sanitizeDoc */
export function sanitizeDoc(data: any): MontageDoc {
  const tracks: MontageTrack[] = (data.tracks ?? [])
    .filter((t: any) => t && typeof t.id === 'string' && ['caption', 'video', 'audio'].includes(t.kind))
    .map((t: any) => ({
      ...t,
      name: typeof t.name === 'string' && t.name ? t.name : TRACK_LABEL[t.kind as TrackKind],
      role: t.kind !== 'caption' && (t.role === 'voice' || t.role === 'background') ? t.role : undefined,
      ducking: t.ducking && typeof t.ducking === 'object' ? cleanDucking(t.ducking) : undefined,
      composite: t.kind === 'video' && t.composite && typeof t.composite === 'object' ? t.composite : undefined,
      captionY: t.kind === 'caption' && typeof t.captionY === 'number' && Number.isFinite(t.captionY) ? Math.min(1, Math.max(0, t.captionY)) : undefined,
    }))
  const trackIds = new Set(tracks.map((t) => t.id))
  const clips: MontageClip[] = (data.clips ?? [])
    .filter((c: any) => c && trackIds.has(c.trackId) && (c.kind === 'caption' || (typeof c.src === 'string' && c.src)))
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
  return {
    kind: 'montage',
    aspect: finite(data.aspect, 16 / 9) || 16 / 9,
    ...(data.aspectLocked ? { aspectLocked: true } : {}),
    tracks,
    clips,
  }
}

/** Only known ducking fields, as finite numbers in sane ranges */
export function cleanDucking(raw: any): Partial<DuckingConfig> {
  const out: Partial<DuckingConfig> = {}
  if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled
  const n = (key: keyof DuckingConfig, min: number, max: number) => {
    const v = raw[key]
    if (typeof v === 'number' && Number.isFinite(v)) (out as any)[key] = Math.min(max, Math.max(min, v))
  }
  n('amountDb', -60, 0)
  n('attack', 0, 5)
  n('release', 0, 10)
  n('padBefore', 0, 5)
  n('padAfter', 0, 5)
  return out
}

/** Speech generations (TTS / Voice Studio / voice design), by the model id stored on the asset */
export function isVoiceModel(model?: string | null): boolean {
  const m = String(model || '').toLowerCase()
  if (!m || /music|sfx|sound|song|suno|lyria/.test(m)) return false
  return /^elevenlabs(-design)?:/.test(m) || /^eleven_/.test(m) || /tts|text-to-speech|speech|dialogue|voice/.test(m)
}

// ─── Persistence ────────────────────────────────────────────────

export interface MontageRecord {
  id: string
  name: string
  rev: number
  workspaceId: string
  updatedAt: number
  doc: MontageDoc
}

function parseRow(row: any): MontageRecord | null {
  if (!row) return null
  try {
    const raw = row.timelineData ?? row.timeline_data
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!data || data.kind !== 'montage' || !Array.isArray(data.tracks) || !Array.isArray(data.clips)) return null
    return {
      id: row.id,
      name: row.name,
      rev: finite(data.rev, 0),
      workspaceId: row.workspaceId ?? row.workspace_id,
      updatedAt: row.updatedAt ?? row.updated_at,
      doc: sanitizeDoc(data),
    }
  } catch {
    return null
  }
}

export function getMontage(id: string): MontageRecord {
  const rec = parseRow(getRawDb().prepare('SELECT * FROM projects WHERE id = ?').get(id))
  if (!rec) throw new MontageError(`Timeline '${id}' not found. Call timeline_list to see the timelines of the active workspace.`)
  return rec
}

export function findMontage(id: string): MontageRecord | null {
  return parseRow(getRawDb().prepare('SELECT * FROM projects WHERE id = ?').get(id))
}

export function listMontages(workspaceId = getActiveWorkspaceId()): MontageRecord[] {
  const rows = getRawDb().prepare('SELECT * FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId) as any[]
  return rows.map(parseRow).filter((r): r is MontageRecord => !!r)
}

type ChangeSource = 'mcp' | 'ui'

export interface MontageChange {
  id: string
  rev: number
  name: string
  /** null when the timeline was deleted */
  doc: MontageDoc | null
  source: ChangeSource
  workspaceId: string
  /** Ask the window to show the Timeline page on this timeline */
  open?: boolean
}

export function broadcastMontage(change: MontageChange) {
  for (const win of BrowserWindow.getAllWindows()) {
    try { if (!win.isDestroyed()) win.webContents.send('montage:changed', change) } catch {}
  }
}

function writeDoc(id: string, doc: MontageDoc, rev: number, name?: string) {
  getRawDb()
    .prepare('UPDATE projects SET name = COALESCE(?, name), timeline_data = ?, updated_at = ? WHERE id = ?')
    .run(name ?? null, JSON.stringify({ ...doc, rev }), Date.now(), id)
}

/**
 * Applies `fn` to a copy of the timeline, saves it under the next rev and tells the window.
 * `fn` may throw MontageError; nothing is written then.
 */
export function mutateMontage<T>(id: string, fn: (doc: MontageDoc) => T, opts: { name?: string; source?: ChangeSource } = {}): { record: MontageRecord; result: T } {
  const rec = getMontage(id)
  const doc: MontageDoc = structuredClone(rec.doc)
  const result = fn(doc)
  const rev = rec.rev + 1
  const clean = sanitizeDoc(doc)
  writeDoc(id, clean, rev, opts.name)
  const record = { ...rec, rev, doc: clean, name: opts.name ?? rec.name, updatedAt: Date.now() }
  broadcastMontage({ id, rev, name: record.name, doc: clean, source: opts.source ?? 'mcp', workspaceId: rec.workspaceId })
  return { record, result }
}

export function createMontage(name: string, aspect?: number, source: ChangeSource = 'mcp'): MontageRecord {
  const id = uid()
  const now = Date.now()
  const doc = emptyDoc(aspect)
  const clean = name.trim() || `Montaje ${listMontages().length + 1}`
  getRawDb()
    .prepare('INSERT INTO projects (id, name, timeline_data, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, clean, JSON.stringify({ ...doc, rev: 1 }), getActiveWorkspaceId(), now, now)
  broadcastMontage({ id, rev: 1, name: clean, doc, source, workspaceId: getActiveWorkspaceId() })
  return getMontage(id)
}

export function deleteMontage(id: string) {
  const rec = getMontage(id)
  getRawDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
  broadcastMontage({ id, rev: rec.rev + 1, name: rec.name, doc: null, source: 'mcp', workspaceId: rec.workspaceId })
}

/**
 * The Timeline page's save. `baseRev` is the rev its copy started from: when the stored timeline
 * moved on since (an agent edited it), the save is refused and the current state returned instead.
 * Without `baseRev` (older callers) the save always wins.
 */
export function saveFromUi(id: string, data: any, baseRev?: number, name?: string): { ok: true; rev: number } | { ok: false; stale: true; rev: number; doc: MontageDoc; name: string } {
  const rec = findMontage(id)
  if (rec && typeof baseRev === 'number' && rec.rev > baseRev) return { ok: false, stale: true, rev: rec.rev, doc: rec.doc, name: rec.name }
  const rev = (rec?.rev ?? 0) + 1
  writeDoc(id, sanitizeDoc(data), rev, name)
  return { ok: true, rev }
}

// ─── Timeline arithmetic ────────────────────────────────────────

export function requireTrack(doc: MontageDoc, trackId: string): MontageTrack {
  const track = doc.tracks.find((t) => t.id === trackId)
  if (!track) throw new MontageError(`Track '${trackId}' not found in this timeline. Tracks: ${doc.tracks.map((t) => `${t.id} (${t.kind} "${t.name}")`).join(', ') || 'none'}`)
  return track
}

export function requireClip(doc: MontageDoc, clipId: string): MontageClip {
  const clip = doc.clips.find((c) => c.id === clipId)
  if (!clip) throw new MontageError(`Clip '${clipId}' not found in this timeline. Call timeline_get to see the clip ids.`)
  return clip
}

/** Nearest start on the track to `desired` where `duration` fits without overlapping */
export function fitStart(doc: MontageDoc, trackId: string, desired: number, duration: number, ignoreId?: string): number {
  const siblings = doc.clips.filter((c) => c.trackId === trackId && c.id !== ignoreId).sort((a, b) => a.start - b.start)
  let best = Math.max(0, desired)
  let bestDist = Infinity
  let cursor = 0
  const tryGap = (a: number, b: number) => {
    if (b - a < duration - EPS) return
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

/** End of the last clip on a track: where an appended clip goes */
export function trackEnd(doc: MontageDoc, trackId: string): number {
  return doc.clips.filter((c) => c.trackId === trackId).reduce((m, c) => Math.max(m, clipEnd(c)), 0)
}

function assertFree(doc: MontageDoc, trackId: string, start: number, duration: number, ignoreId?: string) {
  const hit = doc.clips.find((c) => c.trackId === trackId && c.id !== ignoreId && start < clipEnd(c) - EPS && start + duration > c.start + EPS)
  if (!hit) return
  const free = fitStart(doc, trackId, start, duration, ignoreId)
  throw new MontageError(
    `[${r4(start)}s, ${r4(start + duration)}s] overlaps clip '${hit.id}' ("${hit.kind === 'caption' ? hit.text : hit.name}", ${r4(hit.start)}–${r4(clipEnd(hit))}s) on track '${trackId}'. ` +
    `Nearest free start: ${r4(free)}s, or use another track.`,
  )
}

function assertCompatible(kind: MontageClip['kind'], track: MontageTrack) {
  if (trackKindFor(kind) !== track.kind) {
    throw new MontageError(`A ${kind} clip can't go on ${track.kind} track '${track.id}' ("${track.name}"): use a ${trackKindFor(kind)} track.`)
  }
}

/** First track of `kind`, created when there is none */
function trackOfKind(doc: MontageDoc, kind: TrackKind): MontageTrack {
  const found = doc.tracks.find((t) => t.kind === kind)
  return found ?? addTrack(doc, kind)
}

// ─── Tracks ─────────────────────────────────────────────────────

export function addTrack(doc: MontageDoc, kind: TrackKind, opts: { name?: string; id?: string; index?: number; captionStyle?: CaptionStyle; highlight?: boolean } = {}): MontageTrack {
  if (opts.id) {
    const existing = doc.tracks.find((t) => t.id === opts.id)
    if (existing) {
      if (existing.kind !== kind) throw new MontageError(`Track id '${opts.id}' already exists as a ${existing.kind} track`)
      return existing
    }
  }
  const count = doc.tracks.filter((t) => t.kind === kind).length
  const track: MontageTrack = {
    id: opts.id || uid(),
    kind,
    name: opts.name?.trim() || (kind === 'caption' && count === 0 ? 'Subtítulos' : `${TRACK_LABEL[kind]} ${count + 1}`),
    ...(kind === 'caption' && opts.captionStyle ? { captionStyle: opts.captionStyle } : {}),
    ...(kind === 'caption' && opts.highlight !== undefined ? { highlight: opts.highlight } : {}),
  }
  let at: number
  if (opts.index !== undefined) at = Math.min(Math.max(0, Math.floor(opts.index)), doc.tracks.length)
  else if (kind === 'video') {
    // Same placement as the editor: new video tracks go on top of the existing ones
    const first = doc.tracks.findIndex((t) => t.kind === 'video')
    at = first === -1 ? doc.tracks.filter((t) => t.kind === 'caption').length : first
  } else {
    let last = -1
    doc.tracks.forEach((t, i) => { if (t.kind === kind) last = i })
    at = last !== -1 ? last + 1 : kind === 'caption' ? 0 : doc.tracks.length
  }
  doc.tracks.splice(at, 0, track)
  return track
}

export function updateTrack(doc: MontageDoc, trackId: string, patch: { name?: string; muted?: boolean; captionStyle?: CaptionStyle; highlight?: boolean; index?: number; volume?: number; role?: TrackRole | 'none' }): MontageTrack {
  const track = requireTrack(doc, trackId)
  if (patch.role !== undefined) {
    if (track.kind === 'caption') throw new MontageError('Caption tracks have no sound: only video and audio tracks can be voice or background')
    track.role = patch.role === 'none' ? undefined : patch.role
  }
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new MontageError('Track name cannot be empty')
    track.name = patch.name.trim()
  }
  if (patch.muted !== undefined) {
    if (track.kind === 'caption') throw new MontageError('Caption tracks have no sound to mute')
    track.muted = patch.muted
  }
  if (patch.captionStyle !== undefined || patch.highlight !== undefined) {
    if (track.kind !== 'caption') throw new MontageError('caption_style and highlight only apply to caption tracks')
    if (patch.captionStyle !== undefined) track.captionStyle = patch.captionStyle
    if (patch.highlight !== undefined) track.highlight = patch.highlight
  }
  if (patch.volume !== undefined) {
    if (track.kind === 'caption') throw new MontageError('Caption tracks have no volume')
    const v = Math.min(1, Math.max(0, patch.volume))
    for (const c of doc.clips) if (c.trackId === track.id && c.kind !== 'image') c.volume = v
  }
  if (patch.index !== undefined) {
    const from = doc.tracks.indexOf(track)
    doc.tracks.splice(from, 1)
    doc.tracks.splice(Math.min(Math.max(0, Math.floor(patch.index)), doc.tracks.length), 0, track)
  }
  return track
}

export function removeTrack(doc: MontageDoc, trackId: string): number {
  requireTrack(doc, trackId)
  const removed = doc.clips.filter((c) => c.trackId === trackId).length
  doc.tracks = doc.tracks.filter((t) => t.id !== trackId)
  doc.clips = doc.clips.filter((c) => c.trackId !== trackId)
  return removed
}

// ─── Media clips ────────────────────────────────────────────────

export interface MediaSource {
  assetId: string
  type: 'video' | 'image' | 'audio'
  /** Local file, or the provider URL when not downloaded yet */
  path: string
  name: string
  duration?: number
  width?: number
  height?: number
  /** A speech generation (TTS): flagged as a voice clip when placed */
  isVoice?: boolean
}

/** A library asset as a timeline source, probing duration and size when the row lacks them */
export async function mediaSourceFromAsset(asset: any): Promise<MediaSource> {
  const type = asset?.type
  if (!['video', 'image', 'audio'].includes(type)) throw new MontageError(`Asset '${asset?.id}' is ${type || 'of unknown type'}; only video, image and audio assets go on a timeline`)
  const filePath: string = asset.filePath || ''
  if (filePath.startsWith('__error__')) throw new MontageError(`Asset '${asset.id}' is a failed generation and has no file`)
  const local = resolveAssetFile(asset.id)?.path
  const remote = /^https?:\/\//.test(filePath) ? filePath : null
  if (!local && !remote) {
    throw new MontageError(`Asset '${asset.id}' has no file yet (still generating?). Wait for its task with wait_for_tasks, then retry.`)
  }
  let duration = finite(asset.duration, 0) || undefined
  let width = finite(asset.width, 0) || undefined
  let height = finite(asset.height, 0) || undefined
  if (local && ((type !== 'image' && !duration) || (type !== 'audio' && !(width && height)))) {
    try {
      const info = await getFFmpeg().probe(local)
      if (!duration && info.duration > 0) duration = info.duration
      const v = info.streams.find((s) => s.codecType === 'video')
      if (v?.width && v?.height && !(width && height)) { width = v.width; height = v.height }
    } catch {}
  }
  if (type !== 'image' && !duration) throw new MontageError(`Could not read the duration of asset '${asset.id}'`)
  return { assetId: asset.id, type, path: local || remote!, name: asset.fileName || asset.name || 'clip', duration, width, height, isVoice: type === 'audio' && isVoiceModel(asset.modelUsed) }
}

export interface AddClipInput {
  id?: string
  trackId?: string
  /** Timeline seconds; default = appended after the last clip of the track */
  start?: number
  /** In-point inside the source, seconds */
  in?: number
  /** Out-point inside the source; alternative to duration */
  out?: number
  duration?: number
  volume?: number
  /** Video/image only */
  opacity?: number
  fadeIn?: number
  fadeOut?: number
}

export function addMediaClip(doc: MontageDoc, src: MediaSource, input: AddClipInput): { clip: MontageClip; existed: boolean } {
  if (input.id) {
    const existing = doc.clips.find((c) => c.id === input.id)
    if (existing) {
      if (existing.assetId !== src.assetId) throw new MontageError(`Clip id '${input.id}' already exists with another asset`)
      return { clip: existing, existed: true }
    }
  }
  const kind = src.type
  const track = input.trackId ? requireTrack(doc, input.trackId) : trackOfKind(doc, trackKindFor(kind))
  assertCompatible(kind, track)

  const sourceDuration = kind === 'image' ? undefined : src.duration!
  const offset = kind === 'image' ? 0 : Math.max(0, input.in ?? 0)
  if (sourceDuration !== undefined && offset > sourceDuration - MIN_CLIP + EPS) {
    throw new MontageError(`in (${r4(offset)}s) is past the end of the source (${r4(sourceDuration)}s long)`)
  }
  let duration: number
  if (input.out !== undefined) {
    if (kind === 'image') throw new MontageError('Images have no out-point; pass duration instead')
    if (input.out <= offset + EPS) throw new MontageError(`out (${r4(input.out)}s) must be after in (${r4(offset)}s)`)
    duration = input.out - offset
  } else duration = input.duration ?? (sourceDuration !== undefined ? sourceDuration - offset : IMAGE_DEFAULT)
  if (duration < MIN_CLIP - EPS) throw new MontageError(`duration must be at least ${MIN_CLIP}s`)
  if (sourceDuration !== undefined && offset + duration > sourceDuration + 0.05) {
    throw new MontageError(`in + duration (${r4(offset + duration)}s) is past the end of the source (${r4(sourceDuration)}s long). Max duration from in=${r4(offset)}s: ${r4(sourceDuration - offset)}s`)
  }
  if (sourceDuration !== undefined) duration = Math.min(duration, sourceDuration - offset)

  const start = input.start !== undefined ? Math.max(0, input.start) : trackEnd(doc, track.id)
  assertFree(doc, track.id, start, duration)

  const clip: MontageClip = {
    id: input.id || uid(),
    trackId: track.id,
    kind,
    name: src.name,
    src: src.path,
    assetId: src.assetId,
    start: r4(start),
    offset: r4(offset),
    duration: r4(duration),
    ...(sourceDuration !== undefined ? { sourceDuration } : {}),
    volume: Math.min(1, Math.max(0, input.volume ?? 1)),
    ...(src.isVoice ? { voice: true } : {}),
    ...(kind !== 'audio' && src.width && src.height ? { sourceWidth: src.width, sourceHeight: src.height } : {}),
  }
  applyLook(clip, { opacity: input.opacity, fadeIn: input.fadeIn, fadeOut: input.fadeOut })
  // Like the editor: the first visual clip sets the frame, unless the aspect was chosen explicitly
  const hasVisual = doc.clips.some((c) => c.kind === 'video' || c.kind === 'image')
  if (!hasVisual && kind !== 'audio' && !doc.aspectLocked && src.width && src.height) doc.aspect = src.width / src.height
  doc.clips.push(clip)
  return { clip, existed: false }
}

export interface ClipPatch {
  start?: number
  trackId?: string
  in?: number
  out?: number
  duration?: number
  volume?: number
  text?: string
  opacity?: number
  fadeIn?: number
  fadeOut?: number
  /** Keyframes with times in seconds into the clip (0..duration); [] removes them */
  volumeKeys?: EnvelopeKey[]
  opacityKeys?: EnvelopeKey[]
  /** true/false overrides the track role; 'auto' follows the track */
  voice?: boolean | 'auto'
}

/** Opacity and fades, validated against the clip kind and length (fades of 0 are removed) */
function applyLook(clip: MontageClip, look: { opacity?: number; fadeIn?: number; fadeOut?: number }) {
  if (look.opacity !== undefined) {
    if (clip.kind !== 'video' && clip.kind !== 'image') throw new MontageError('Only video and image clips have an opacity')
    clip.opacity = Math.min(1, Math.max(0, look.opacity))
  }
  if (look.fadeIn !== undefined || look.fadeOut !== undefined) {
    if (clip.kind === 'caption') throw new MontageError('Captions have no fades')
    const fi = look.fadeIn !== undefined ? Math.max(0, look.fadeIn) : clip.fadeIn ?? 0
    const fo = look.fadeOut !== undefined ? Math.max(0, look.fadeOut) : clip.fadeOut ?? 0
    if (fi + fo > clip.duration + EPS) throw new MontageError(`fade_in + fade_out (${r4(fi + fo)}s) is longer than the clip (${r4(clip.duration)}s)`)
    clip.fadeIn = fi > 0 ? r4(fi) : undefined
    clip.fadeOut = fo > 0 ? r4(fo) : undefined
  }
}

/** Clip-local keyframes → stored source-time keyframes (empty list clears them) */
function toSourceKeys(clip: MontageClip, keys: EnvelopeKey[], what: string): EnvelopeKey[] | undefined {
  keys.forEach((k, i) => {
    if (!Number.isFinite(k.t) || !Number.isFinite(k.v)) throw new MontageError(`${what}[${i}] needs numeric time and value`)
    if (k.t < -EPS || k.t > clip.duration + EPS) throw new MontageError(`${what}[${i}].time (${r4(k.t)}s) is outside the clip (0–${r4(clip.duration)}s)`)
    if (k.v < 0 || k.v > 1) throw new MontageError(`${what}[${i}].value must be between 0 and 1`)
  })
  return cleanKeys(keys.map((k) => ({ t: r4(clip.offset + k.t), v: k.v })))
}

/** Stored source-time keyframes → seconds into the clip, for reporting */
export function localKeys(clip: MontageClip, keys?: EnvelopeKey[]) {
  return (keys ?? []).map((k) => ({ time: r4(k.t - clip.offset), value: k.v }))
}

export { fadeLengths }

/** Moves, trims, re-times or re-texts one clip; every value is validated against its source */
export function updateClip(doc: MontageDoc, clipId: string, patch: ClipPatch): MontageClip {
  const clip = requireClip(doc, clipId)
  const track = patch.trackId ? requireTrack(doc, patch.trackId) : requireTrack(doc, clip.trackId)
  assertCompatible(clip.kind, track)

  const hasSource = clip.sourceDuration !== undefined
  let offset = clip.offset
  if (patch.in !== undefined) {
    if (!hasSource) throw new MontageError(`${clip.kind === 'caption' ? 'Captions' : 'Images'} have no in-point; change start or duration instead`)
    offset = Math.max(0, patch.in)
  }
  let duration = clip.duration
  if (patch.out !== undefined) {
    if (!hasSource) throw new MontageError('Only video and audio clips have an out-point')
    if (patch.out <= offset + EPS) throw new MontageError(`out (${r4(patch.out)}s) must be after in (${r4(offset)}s)`)
    duration = patch.out - offset
  } else if (patch.duration !== undefined) duration = patch.duration
  if (duration < MIN_CLIP - EPS) throw new MontageError(`duration must be at least ${MIN_CLIP}s`)
  if (hasSource && offset + duration > clip.sourceDuration! + 0.05) {
    throw new MontageError(`in + duration (${r4(offset + duration)}s) is past the end of the source (${r4(clip.sourceDuration!)}s long)`)
  }
  if (hasSource) duration = Math.min(duration, clip.sourceDuration! - offset)
  const start = patch.start !== undefined ? Math.max(0, patch.start) : clip.start
  assertFree(doc, track.id, start, duration, clip.id)

  if (patch.text !== undefined) {
    if (clip.kind !== 'caption') throw new MontageError('Only caption clips have text')
    if (!patch.text.trim()) throw new MontageError('Caption text cannot be empty; remove the clip instead')
    clip.text = patch.text
  }
  if (patch.volume !== undefined) {
    if (clip.kind !== 'video' && clip.kind !== 'audio') throw new MontageError('Only video and audio clips have a volume')
    clip.volume = Math.min(1, Math.max(0, patch.volume))
  }
  clip.trackId = track.id
  clip.start = r4(start)
  clip.offset = r4(offset)
  clip.duration = r4(duration)
  applyLook(clip, { opacity: patch.opacity, fadeIn: patch.fadeIn, fadeOut: patch.fadeOut })
  if (patch.volumeKeys !== undefined) {
    if (clip.kind !== 'video' && clip.kind !== 'audio') throw new MontageError('Only video and audio clips have volume keyframes')
    clip.volumeKeys = toSourceKeys(clip, patch.volumeKeys, 'volume_keyframes')
  }
  if (patch.opacityKeys !== undefined) {
    if (clip.kind !== 'video' && clip.kind !== 'image') throw new MontageError('Only video and image clips have opacity keyframes')
    clip.opacityKeys = toSourceKeys(clip, patch.opacityKeys, 'opacity_keyframes')
  }
  if (patch.voice !== undefined) {
    if (clip.kind !== 'video' && clip.kind !== 'audio') throw new MontageError('Only video and audio clips can be marked as voice')
    clip.voice = patch.voice === 'auto' ? undefined : patch.voice
  }
  return clip
}

// ─── Ducking ────────────────────────────────────────────────────

/**
 * Marks the voices of a timeline from its library assets: TTS clips get `voice: true` (unless
 * already set either way), and when no track is a voice track yet, every sound track whose clips
 * are mostly TTS becomes one. `modelOf` looks an asset's model id up.
 */
export function detectVoices(doc: MontageDoc, modelOf: (assetId: string) => string | undefined): { voiceTracks: string[]; voiceClips: string[] } {
  const tts = (c: MontageClip) => c.kind === 'audio' && !!c.assetId && isVoiceModel(modelOf(c.assetId))
  const voiceClips: string[] = []
  for (const c of doc.clips) {
    if (c.voice === undefined && tts(c)) { c.voice = true; voiceClips.push(c.id) }
  }
  const voiceTracks: string[] = []
  if (!doc.tracks.some((t) => t.role === 'voice')) {
    for (const t of doc.tracks) {
      if (t.kind === 'caption' || t.role === 'background') continue
      const sounding = doc.clips.filter((c) => c.trackId === t.id && (c.kind === 'audio' || c.kind === 'video'))
      const speech = sounding.filter(tts).length
      if (sounding.length > 0 && speech * 2 >= sounding.length) { t.role = 'voice'; voiceTracks.push(t.id) }
    }
  }
  return { voiceTracks, voiceClips }
}

/** Every asset's model id, for detectVoices */
export function assetModelLookup(): (assetId: string) => string | undefined {
  const stmt = getRawDb().prepare('SELECT model_used FROM assets WHERE id = ?')
  return (id) => (stmt.get(id) as any)?.modelUsed ?? undefined
}

export interface AutoDuckingPlan {
  ok: boolean
  /** Why nothing can duck: no voice clips at all, or nothing besides the voices to bring down */
  reason?: 'no-voices' | 'no-background'
  /** Tracks to make voice tracks and TTS clips to flag (from detectVoices) */
  voiceTracks: string[]
  voiceClips: string[]
  /** Tracks that will duck: existing background tracks plus audio tracks holding non-voice clips */
  backgroundTracks: string[]
}

/**
 * One-click autoducking (Timeline button and MCP timeline_autoducking share it): detect the voices
 * from the library, then duck every audio track that is not a voice track and holds non-voice
 * clips (music, ambience, sfx beds). Video tracks keep their sound unless marked background by hand,
 * since their audio is often dialogue. Works on a copy; applyAutoDucking writes it.
 */
export function planAutoDucking(doc: MontageDoc, modelOf: (assetId: string) => string | undefined): AutoDuckingPlan {
  const work = structuredClone(doc)
  const { voiceTracks, voiceClips } = detectVoices(work, modelOf)
  const trackById = new Map(work.tracks.map((t) => [t.id, t]))
  const hasVoice = work.clips.some((c) => isVoiceClip(c, trackById.get(c.trackId)))
  const backgroundTracks = work.tracks
    .filter((t) => t.role === 'background' || (t.kind === 'audio' && t.role !== 'voice' && work.clips.some((c) => c.trackId === t.id && c.kind === 'audio' && !isVoiceClip(c, t))))
    .map((t) => t.id)
  const reason = !hasVoice ? 'no-voices' : backgroundTracks.length === 0 ? 'no-background' : undefined
  return { ok: !reason, ...(reason ? { reason } : {}), voiceTracks, voiceClips, backgroundTracks }
}

export function applyAutoDucking(doc: MontageDoc, plan: AutoDuckingPlan, config: Partial<DuckingConfig> = {}) {
  const voiceTracks = new Set(plan.voiceTracks)
  const voiceClips = new Set(plan.voiceClips)
  for (const t of doc.tracks) if (voiceTracks.has(t.id)) t.role = 'voice'
  for (const c of doc.clips) if (voiceClips.has(c.id)) c.voice = true
  for (const id of plan.backgroundTracks) setDucking(doc, id, { ...config, enabled: true })
}

/** Turns a background track into a ducking one with `config` (defaults for what is missing) */
export function setDucking(doc: MontageDoc, trackId: string, config: Partial<DuckingConfig>): MontageTrack {
  const track = requireTrack(doc, trackId)
  if (track.kind === 'caption') throw new MontageError('Caption tracks have no sound to duck')
  track.role = 'background'
  track.ducking = { ...DUCKING_DEFAULTS, ...(track.ducking ?? {}), ...cleanDucking(config) }
  return track
}

/**
 * Writes a track's ducking into its clips' volume keyframes (multiplied with any existing curve)
 * and switches the automatic ducking off, so the curve can be edited by hand from then on.
 */
export function bakeDucking(doc: MontageDoc, trackId: string): number {
  const track = requireTrack(doc, trackId)
  const keys = computeDucking(doc).get(trackId)
  if (!keys) throw new MontageError(`Track '${trackId}' has no active ducking to bake`)
  let baked = 0
  for (const c of doc.clips) {
    if (c.trackId !== trackId || isVoiceClip(c, track)) continue
    const duck = clipDuckKeys(c, keys)
    if (!duck) continue
    // Sample both curves at every point where either one bends
    const times = new Set<number>([0, c.duration, ...duck.map((k) => k.t), ...(c.volumeKeys ?? []).map((k) => k.t - c.offset)])
    const local = [...times].filter((t) => t >= 0 && t <= c.duration).sort((a, b) => a - b)
    c.volumeKeys = cleanKeys(local.map((t) => ({
      t: r4(c.offset + t),
      v: Math.round(envelopeAt(c.volumeKeys, c.offset + t, c.volume) * envelopeAt(duck, t, 1) * 10000) / 10000,
    })))
    baked++
  }
  track.ducking = { ...duckingConfig(track), enabled: false }
  return baked
}

/** What a ducking track does right now: its settings, the voice ranges and the gain curve */
export function duckingReport(doc: MontageDoc, track: MontageTrack) {
  const cfg = duckingConfig(track)
  const keys = computeDucking(doc).get(track.id) ?? []
  return {
    ...cfg,
    duckGain: r4(Math.pow(10, Math.min(0, cfg.amountDb) / 20)),
    voiceRanges: cfg.enabled ? voiceRanges(doc, cfg, track.id).map(([a, b]) => [r4(a), r4(b)]) : [],
    envelope: keys.map((k) => ({ time: r4(k.t), value: r4(k.v) })),
  }
}

const sameText = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()

function usableWords(clip: MontageClip): CaptionWord[] | null {
  const words = clip.words
  if (clip.kind !== 'caption' || !words?.length || !clip.text || !sameText(words.map((w) => w.text).join(' '), clip.text)) return null
  return words
}

/** Splits a clip at timeline second `at`; transcribed captions split their words and text too */
export function splitClip(doc: MontageDoc, clipId: string, at: number): [MontageClip, MontageClip] {
  const clip = requireClip(doc, clipId)
  if (at <= clip.start + MIN_CLIP - EPS || at >= clipEnd(clip) - MIN_CLIP + EPS) {
    throw new MontageError(`at (${r4(at)}s) must fall inside the clip, at least ${MIN_CLIP}s from its edges (${r4(clip.start)}–${r4(clipEnd(clip))}s)`)
  }
  const head = at - clip.start
  // Each half keeps the fade on its outer end
  const tail: MontageClip = { ...clip, id: uid(), start: r4(at), offset: r4(clip.offset + head), duration: r4(clip.duration - head), fadeIn: undefined }
  const words = usableWords(clip)
  if (words) {
    const before = words.filter((w) => w.start < head)
    const after = words.filter((w) => w.start >= head)
    if (before.length && after.length) {
      clip.words = before
      clip.text = before.map((w) => w.text).join(' ')
      tail.words = after.map((w) => ({ ...w, start: w.start - head, end: w.end - head }))
      tail.text = after.map((w) => w.text).join(' ')
    }
  }
  clip.duration = r4(head)
  clip.fadeOut = undefined
  doc.clips.splice(doc.clips.indexOf(clip) + 1, 0, tail)
  return [clip, tail]
}

export function removeClips(doc: MontageDoc, ids: string[]): { removed: string[]; notFound: string[] } {
  const present = new Set(doc.clips.map((c) => c.id))
  const removed = ids.filter((id) => present.has(id))
  const drop = new Set(removed)
  doc.clips = doc.clips.filter((c) => !drop.has(c.id))
  return { removed, notFound: ids.filter((id) => !present.has(id)) }
}

// ─── Captions ───────────────────────────────────────────────────

export interface CaptionInput { id?: string; text: string; start: number; end?: number; duration?: number }

/** Adds caption segments to a caption track (the first one, created if missing); all-or-nothing */
export function addCaptions(doc: MontageDoc, trackId: string | undefined, captions: CaptionInput[]): MontageClip[] {
  const track = trackId ? requireTrack(doc, trackId) : trackOfKind(doc, 'caption')
  if (track.kind !== 'caption') throw new MontageError(`Track '${track.id}' is a ${track.kind} track; captions need a caption track`)
  const out: MontageClip[] = []
  captions.forEach((c, i) => {
    const where = `captions[${i}]`
    if (c.id) {
      const existing = doc.clips.find((x) => x.id === c.id)
      if (existing) {
        if (existing.kind !== 'caption') throw new MontageError(`${where}: id '${c.id}' belongs to a ${existing.kind} clip`)
        out.push(existing)
        return
      }
    }
    if (!c.text?.trim()) throw new MontageError(`${where}: text is empty`)
    const start = Math.max(0, c.start)
    const duration = c.end !== undefined ? c.end - start : c.duration ?? 3
    if (duration < MIN_CLIP - EPS) throw new MontageError(`${where}: end must be at least ${MIN_CLIP}s after start`)
    try {
      assertFree(doc, track.id, start, duration)
    } catch (err: any) {
      throw new MontageError(`${where}: ${err.message}`)
    }
    const clip: MontageClip = { id: c.id || uid(), trackId: track.id, kind: 'caption', name: 'Subtítulo', text: c.text, start: r4(start), offset: 0, duration: r4(duration), volume: 1 }
    doc.clips.push(clip)
    out.push(clip)
  })
  return out
}

/** Autocaptions result → a new caption track on top (renderer applyAutocaptions does the same) */
export function applyAutocaptions(
  doc: MontageDoc,
  segments: { start: number; end: number; text: string; words: CaptionWord[] }[],
  info: { name: string; captionStyle: CaptionStyle; highlight: boolean },
): { track: MontageTrack; clips: MontageClip[] } {
  const track: MontageTrack = { id: uid(), kind: 'caption', ...info }
  const clips: MontageClip[] = segments
    .filter((s) => s.text.trim() && s.end - s.start >= MIN_CLIP / 2)
    .map((s) => ({
      id: uid(),
      trackId: track.id,
      kind: 'caption' as const,
      name: 'Subtítulo',
      text: s.text,
      words: s.words.length ? s.words.map((w) => ({ text: w.text, start: Math.max(0, w.start - s.start), end: Math.max(0, w.end - s.start) })) : undefined,
      start: s.start,
      offset: 0,
      duration: Math.max(MIN_CLIP, s.end - s.start),
      volume: 1,
    }))
  if (clips.length > 0) {
    doc.tracks.unshift(track)
    doc.clips.push(...clips)
  }
  return { track, clips }
}

// ─── Export jobs ────────────────────────────────────────────────

export interface ExportJob {
  id: string
  timelineId: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  path: string
  assetId?: string
  error?: string
  startedAt: number
  finishedAt?: number
}

const jobs = new Map<string, ExportJob>()
let activeExport: { job: ExportJob; controller: AbortController } | null = null

export function getExportJob(id: string): ExportJob | null {
  return jobs.get(id) ?? null
}

export function cancelActiveExport() {
  activeExport?.controller.abort()
}

/** A free file name in the user's Videos folder */
export function defaultExportPath(name: string): string {
  const safe = String(name || 'Montaje').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Montaje'
  const dir = app.getPath('videos')
  let candidate = path.join(dir, `${safe}.mp4`)
  for (let i = 2; syncFs.existsSync(candidate); i++) candidate = path.join(dir, `${safe} (${i}).mp4`)
  return candidate
}

/**
 * Renders a timeline to MP4. One export at a time across the app (Timeline page and MCP share the
 * lock). Progress goes to the window as `export:progress` like a page-started export. Resolves
 * when the render ends; the job record keeps the outcome for status queries.
 */
export function startExport(timelineId: string, outputPath: string, opts: { importToLibrary?: boolean; onProgress?: (p: number) => void } = {}): { job: ExportJob; done: Promise<ExportJob> } {
  if (activeExport) throw new MontageError(`Another export is running (job ${activeExport.job.id}, timeline ${activeExport.job.timelineId}). Wait for it or cancel it.`)
  const rec = getMontage(timelineId)
  if (docDuration(rec.doc) <= 0) throw new MontageError('The timeline is empty: add clips before exporting')
  const dest = outputPath.toLowerCase().endsWith('.mp4') ? outputPath : `${outputPath}.mp4`
  if (!path.isAbsolute(dest)) throw new MontageError('output_path must be an absolute path')
  if (!syncFs.existsSync(path.dirname(dest))) throw new MontageError(`Folder not found: ${path.dirname(dest)}`)

  const job: ExportJob = { id: uid(), timelineId, status: 'running', progress: 0, path: dest, startedAt: Date.now() }
  jobs.set(job.id, job)
  const controller = new AbortController()
  activeExport = { job, controller }
  const send = (channel: string, payload: any) => {
    for (const win of BrowserWindow.getAllWindows()) { try { if (!win.isDestroyed()) win.webContents.send(channel, payload) } catch {} }
  }

  const done = (async () => {
    try {
      await renderMontage(rec.doc, dest, {
        signal: controller.signal,
        onProgress: (percent) => {
          job.progress = Math.round(percent * 10) / 10
          opts.onProgress?.(percent)
          send('export:progress', { projectId: timelineId, percent })
        },
      })
      if (opts.importToLibrary) {
        try {
          const asset = await getAssetManager().importFile(dest, 'video')
          job.assetId = asset.id
          send('assets:changed', {})
        } catch (err: any) {
          job.error = `Exported, but importing into the library failed: ${err?.message || err}`
        }
      }
      job.status = 'completed'
      job.progress = 100
      send('export:complete', { projectId: timelineId, path: dest })
    } catch (err: any) {
      job.status = controller.signal.aborted ? 'cancelled' : 'failed'
      job.error = err?.message || 'Export failed'
      send('export:error', { projectId: timelineId, error: job.error, canceled: controller.signal.aborted })
    } finally {
      job.finishedAt = Date.now()
      activeExport = null
    }
    return job
  })()
  return { job, done }
}

/** Output frame size of a timeline */
export function timelineResolution(doc: MontageDoc) {
  return montageSize(doc.aspect)
}
