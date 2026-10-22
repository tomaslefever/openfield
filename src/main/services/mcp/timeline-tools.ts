import * as fs from 'fs/promises'
import * as path from 'path'
import {
  MontageError,
  addCaptions,
  addMediaClip,
  addTrack,
  applyAutocaptions,
  broadcastMontage,
  cancelActiveExport,
  clipEnd,
  createMontage,
  defaultExportPath,
  deleteMontage,
  docDuration,
  getExportJob,
  getMontage,
  listMontages,
  localKeys,
  assetModelLookup,
  applyAutoDucking,
  bakeDucking,
  detectVoices,
  planAutoDucking,
  duckingReport,
  setDucking,
  mediaSourceFromAsset,
  mutateMontage,
  removeClips,
  removeTrack,
  splitClip,
  startExport,
  timelineResolution,
  updateClip,
  updateTrack,
  type ExportJob,
  type MediaSource,
  type MontageClip,
  type MontageRecord,
} from '../montage-service'
import { isVoiceClip } from '../montage-export'
import { compositeReport, effectiveReport, motionReport } from './layout-tools'
import { captionProviderStatus, estimateAutocaptions, generateAutocaptions, montageSrt, type CaptionProvider, type CaptionScope } from '../autocaptions'
import { requireAsset } from './generation-tools'
import { type McpTool, ToolInputError, READ_ONLY, EDIT, CREATE, DESTRUCTIVE, GENERATE, str, num, optStr } from './types'

/*
 * Timeline (Montage) editing for agents: everything the Timeline page can do, on the same stored
 * timeline (main montage-service). Each edit is saved at once and shows live in the open window.
 * Ids are stable uuids returned by every call; creating calls accept a caller-chosen id so a retry
 * returns the existing object instead of adding a duplicate.
 */

const ASPECTS: Record<string, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5, '4:3': 4 / 3 }
const r3 = (n: number) => Math.round(n * 1000) / 1000

const timelineId = { timeline_id: { type: 'string', description: 'Timeline id (from timeline_list / timeline_create)' } }

/** Service errors are caller mistakes: surface them as tool input errors */
function guard<T>(fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    if (err instanceof MontageError) throw new ToolInputError(err.message)
    throw err
  }
}

async function guardAsync<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof MontageError) throw new ToolInputError(err.message)
    throw err
  }
}

function aspectArg(v: any): number | undefined {
  const a = optStr(v)
  if (!a) return undefined
  if (!(a in ASPECTS)) throw new ToolInputError(`aspect must be one of ${Object.keys(ASPECTS).join(', ')}`)
  return ASPECTS[a]
}

function aspectLabel(aspect: number): string {
  const hit = Object.entries(ASPECTS).find(([, v]) => Math.abs(v - aspect) < 0.01)
  return hit ? hit[0] : r3(aspect).toString()
}

const ISO3: Record<string, string> = { spa: 'es', eng: 'en', por: 'pt', fra: 'fr', ita: 'it', deu: 'de', ger: 'de', cat: 'ca' }
const NAMES: Record<string, string> = { spanish: 'es', english: 'en', portuguese: 'pt', french: 'fr', italian: 'it', german: 'de', catalan: 'ca' }

/** Track-name tag from whatever the provider reports (ISO-639-1/3 or an English name); same as the page */
function languageTag(lang?: string): string {
  const l = (lang || '').toLowerCase()
  const code = ISO3[l] ?? NAMES[l] ?? (l.length === 2 ? l : '')
  return code ? code.toUpperCase() : 'auto'
}

function clipSummary(c: MontageClip, includeWords = false, voice?: boolean) {
  const media = c.kind === 'video' || c.kind === 'audio'
  return {
    id: c.id,
    kind: c.kind,
    trackId: c.trackId,
    start: r3(c.start),
    end: r3(clipEnd(c)),
    duration: r3(c.duration),
    ...(c.kind !== 'caption' ? { name: c.name, assetId: c.assetId ?? null } : {}),
    ...(media ? { in: r3(c.offset), out: r3(c.offset + c.duration), sourceDuration: c.sourceDuration !== undefined ? r3(c.sourceDuration) : null, volume: c.volume } : {}),
    ...(c.kind === 'video' || c.kind === 'image' ? { opacity: c.opacity ?? 1 } : {}),
    ...(c.fadeIn ? { fadeIn: r3(c.fadeIn) } : {}),
    ...(c.fadeOut ? { fadeOut: r3(c.fadeOut) } : {}),
    ...(c.volumeKeys?.length ? { volumeKeyframes: localKeys(c, c.volumeKeys) } : {}),
    ...(c.opacityKeys?.length ? { opacityKeyframes: localKeys(c, c.opacityKeys) } : {}),
    ...(voice ? { voice: true } : {}),
    ...(c.voice !== undefined ? { voiceOverride: c.voice } : {}),
    ...(c.kind === 'caption' ? { text: c.text ?? '', ...(c.words?.length ? { wordTimings: includeWords ? c.words : c.words.length } : {}) } : {}),
  }
}

function timelineSummary(rec: MontageRecord, includeWords = false) {
  const { doc } = rec
  const { width: FW, height: FH } = timelineResolution(doc)
  return {
    id: rec.id,
    name: rec.name,
    rev: rec.rev,
    aspect: aspectLabel(doc.aspect),
    resolution: timelineResolution(doc),
    duration: r3(docDuration(doc)),
    tracks: doc.tracks.map((t, index) => {
      const clips = doc.clips.filter((c) => c.trackId === t.id).sort((a, b) => a.start - b.start)
      return {
        id: t.id,
        kind: t.kind,
        name: t.name,
        index,
        ...(t.kind !== 'caption' ? { muted: !!t.muted, role: t.role ?? 'none' } : { captionStyle: t.captionStyle ?? 'classic', highlight: t.highlight !== false }),
        ...(t.role === 'background' ? { ducking: duckingReport(doc, t) } : {}),
        ...(t.composite ? { composite: compositeReport(t.composite, FW, FH) } : {}),
        ...(t.kind === 'caption' && t.captionY !== undefined ? { captionY: Math.round(t.captionY * FH) } : {}),
        end: r3(clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0)),
        clips: clips.map((c) => ({
          ...clipSummary(c, includeWords, isVoiceClip(c, t)),
          ...((c.kind === 'video' || c.kind === 'image') && (c.composite || t.composite || c.motion)
            ? { placement: effectiveReport(t, c, FW, FH), ...(c.composite ? { ownComposite: compositeReport(c.composite, FW, FH) } : {}), ...(c.motion ? { motion: motionReport(c, FW, FH) } : {}) }
            : {}),
        })),
      }
    }),
  }
}

/** Short state returned after an edit, so the agent can chain calls without a timeline_get */
function after(rec: MontageRecord) {
  return { timelineId: rec.id, rev: rec.rev, duration: r3(docDuration(rec.doc)) }
}

function jobSummary(job: ExportJob) {
  return {
    jobId: job.id,
    timelineId: job.timelineId,
    status: job.status,
    progress: job.progress,
    path: job.path,
    ...(job.assetId ? { assetId: job.assetId } : {}),
    ...(job.error ? { error: job.error } : {}),
    ...(job.finishedAt ? { seconds: Math.round((job.finishedAt - job.startedAt) / 100) / 10 } : {}),
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitJob(job: ExportJob, seconds: number): Promise<ExportJob> {
  const deadline = Date.now() + Math.min(Math.max(seconds, 0), 600) * 1000
  while (job.status === 'running' && Date.now() < deadline) await sleep(1000)
  return job
}

const clipItemSchema = {
  type: 'object',
  properties: {
    asset_id: { type: 'string', description: 'Library asset id (video, image or audio; "latest" = newest generation)' },
    track_id: { type: 'string', description: 'Target track; default = first track of the right kind (video for video/image, audio for audio), created if missing' },
    start: { type: 'number', minimum: 0, description: 'Timeline position in seconds. Default: right after the last clip of the track (append)' },
    in: { type: 'number', minimum: 0, description: 'In-point inside the source, seconds (video/audio). Default 0' },
    out: { type: 'number', minimum: 0, description: 'Out-point inside the source, seconds (video/audio). Alternative to duration' },
    duration: { type: 'number', minimum: 0.1, description: 'Length on the timeline. Default: rest of the source from in; 5 s for images' },
    volume: { type: 'number', minimum: 0, description: '0..1, default 1 (video/audio)' },
    opacity: { type: 'number', minimum: 0, description: '0..1, default 1 (video/image)' },
    fade_in: { type: 'number', minimum: 0, description: 'Fade-in seconds: opacity for video/image, volume for audio (a video fades its own sound too)' },
    fade_out: { type: 'number', minimum: 0, description: 'Fade-out seconds, same rules as fade_in' },
    id: { type: 'string', description: 'Optional caller-chosen clip id; retrying with the same id returns the existing clip' },
  },
  required: ['asset_id'],
  additionalProperties: false,
}

const keyframeSchema = {
  type: 'object',
  properties: {
    time: { type: 'number', minimum: 0, description: 'Seconds into the clip (0 = clip start)' },
    value: { type: 'number', minimum: 0, description: '0..1' },
  },
  required: ['time', 'value'],
  additionalProperties: false,
}

const captionItemSchema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    start: { type: 'number', minimum: 0, description: 'Timeline seconds' },
    end: { type: 'number', minimum: 0, description: 'Timeline seconds (or pass duration)' },
    duration: { type: 'number', minimum: 0.1, description: 'Default 3 s when end is omitted' },
    id: { type: 'string', description: 'Optional caller-chosen id for idempotent retries' },
  },
  required: ['text', 'start'],
  additionalProperties: false,
}

export function getTimelineTools(): McpTool[] {
  return [
    {
      name: 'timeline_list',
      title: 'List timelines',
      description: 'List the montage timelines (the app\'s Timeline page) of the active workspace, newest first, with duration and clip counts.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: READ_ONLY,
      handler: async () => {
        const timelines = listMontages().map((m) => ({
          id: m.id,
          name: m.name,
          rev: m.rev,
          aspect: aspectLabel(m.doc.aspect),
          duration: r3(docDuration(m.doc)),
          tracks: m.doc.tracks.length,
          clips: m.doc.clips.length,
          updatedAt: m.updatedAt,
        }))
        return { count: timelines.length, timelines }
      },
    },
    {
      name: 'timeline_create',
      title: 'Create timeline',
      description: 'Create an empty timeline (one caption, one video and one audio track) in the active workspace. With aspect, the frame is fixed (e.g. 9:16 for TikTok/Reels/Shorts); without it, the first video or image clip sets it, like in the editor.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          aspect: { type: 'string', enum: Object.keys(ASPECTS), description: 'Output frame; 1080 px on the short side' },
          open: { type: 'boolean', description: 'Show it in the app\'s Timeline page (default true)' },
        },
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => {
        const rec = createMontage(str(args.name), aspectArg(args.aspect))
        if (args.open !== false) broadcastMontage({ id: rec.id, rev: rec.rev, name: rec.name, doc: rec.doc, source: 'mcp', workspaceId: rec.workspaceId, open: true })
        return { timeline: timelineSummary(rec) }
      },
    },
    {
      name: 'timeline_get',
      title: 'Get timeline',
      description: 'Full state of a timeline: tracks in display order (first video track renders on top, first caption track on top), every clip with start/end on the timeline, in/out inside its source, volume, caption text; total duration and output resolution.',
      inputSchema: {
        type: 'object',
        properties: { ...timelineId, include_words: { type: 'boolean', description: 'Include autocaption word timings (default: only their count)' } },
        required: ['timeline_id'],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => guard(() => ({ timeline: timelineSummary(getMontage(str(args.timeline_id)), args.include_words === true) })),
    },
    {
      name: 'timeline_update',
      title: 'Rename timeline / set aspect',
      description: 'Rename a timeline and/or fix its output aspect.',
      inputSchema: {
        type: 'object',
        properties: { ...timelineId, name: { type: 'string' }, aspect: { type: 'string', enum: Object.keys(ASPECTS) } },
        required: ['timeline_id'],
        additionalProperties: false,
      },
      annotations: EDIT,
      handler: async (args) => guard(() => {
        const name = optStr(args.name)?.trim()
        const aspect = aspectArg(args.aspect)
        const { record } = mutateMontage(str(args.timeline_id), (doc) => {
          if (aspect) { doc.aspect = aspect; doc.aspectLocked = true }
        }, { name })
        return { timeline: { id: record.id, name: record.name, rev: record.rev, aspect: aspectLabel(record.doc.aspect), resolution: timelineResolution(record.doc) } }
      }),
    },
    {
      name: 'timeline_delete',
      title: 'Delete timeline',
      description: 'Permanently delete a timeline (library media is kept). confirm_name must repeat its exact name. Only when the user asked for it.',
      inputSchema: {
        type: 'object',
        properties: { ...timelineId, confirm_name: { type: 'string' } },
        required: ['timeline_id', 'confirm_name'],
        additionalProperties: false,
      },
      annotations: DESTRUCTIVE,
      handler: async (args) => guard(() => {
        const rec = getMontage(str(args.timeline_id))
        if (str(args.confirm_name) !== rec.name) throw new ToolInputError(`confirm_name must be exactly '${rec.name}'`)
        deleteMontage(rec.id)
        return { deleted: rec.id, name: rec.name }
      }),
    },
    {
      name: 'timeline_open',
      title: 'Show timeline in the app',
      description: 'Open the timeline in the app\'s Timeline page so the user can watch, review or screen-record it. Edits made through these tools already show live there.',
      inputSchema: { type: 'object', properties: { ...timelineId }, required: ['timeline_id'], additionalProperties: false },
      annotations: READ_ONLY,
      handler: async (args) => guard(() => {
        const rec = getMontage(str(args.timeline_id))
        broadcastMontage({ id: rec.id, rev: rec.rev, name: rec.name, doc: rec.doc, source: 'mcp', workspaceId: rec.workspaceId, open: true })
        return { opened: rec.id, name: rec.name }
      }),
    },

    // ─── Tracks ───────────────────────────────────────────────
    {
      name: 'timeline_add_track',
      title: 'Add track',
      description: 'Add a video, audio or caption track. Default placement matches the editor (new video tracks on top of the other video tracks, audio/caption after their kind); index places it explicitly (0 = top).',
      inputSchema: {
        type: 'object',
        properties: {
          ...timelineId,
          kind: { type: 'string', enum: ['video', 'audio', 'caption'] },
          name: { type: 'string' },
          index: { type: 'number', minimum: 0 },
          caption_style: { type: 'string', enum: ['classic', 'social'], description: 'Caption tracks: social = large raised text for vertical video' },
          highlight: { type: 'boolean', description: 'Caption tracks: colour the spoken word (needs autocaption word timings)' },
          id: { type: 'string', description: 'Optional caller-chosen id; retrying returns the existing track' },
        },
        required: ['timeline_id', 'kind'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => guard(() => {
        const { record, result } = mutateMontage(str(args.timeline_id), (doc) => addTrack(doc, args.kind, {
          name: optStr(args.name),
          id: optStr(args.id),
          index: args.index !== undefined ? num(args.index) : undefined,
          captionStyle: optStr(args.caption_style) as any,
          highlight: typeof args.highlight === 'boolean' ? args.highlight : undefined,
        }))
        return { track: { id: result.id, kind: result.kind, name: result.name, index: record.doc.tracks.findIndex((t) => t.id === result.id) }, ...after(record) }
      }),
    },
    {
      name: 'timeline_update_track',
      title: 'Update track',
      description: 'Rename, mute/unmute, set the volume of every clip on it, move it (index: 0 = top; reorders layering), set a caption track\'s style, or set a sound track\'s role (voice = its clips duck the background tracks; background = see timeline_set_ducking; none).',
      inputSchema: {
        type: 'object',
        properties: {
          ...timelineId,
          track_id: { type: 'string' },
          name: { type: 'string' },
          muted: { type: 'boolean', description: 'Video/audio tracks' },
          volume: { type: 'number', minimum: 0, description: '0..1 applied to every clip on the track' },
          index: { type: 'number', minimum: 0 },
          caption_style: { type: 'string', enum: ['classic', 'social'] },
          highlight: { type: 'boolean' },
          role: { type: 'string', enum: ['voice', 'background', 'none'], description: 'Video/audio tracks' },
          caption_y: { type: 'number', description: 'Caption tracks: vertical centre of the captions, output-frame px (null-like: -1 resets to the style default)' },
        },
        required: ['timeline_id', 'track_id'],
        additionalProperties: false,
      },
      annotations: EDIT,
      handler: async (args) => guard(() => {
        const { record, result } = mutateMontage(str(args.timeline_id), (doc) => updateTrack(doc, str(args.track_id), {
          name: typeof args.name === 'string' ? args.name : undefined,
          muted: typeof args.muted === 'boolean' ? args.muted : undefined,
          volume: args.volume !== undefined ? num(args.volume) : undefined,
          index: args.index !== undefined ? num(args.index) : undefined,
          captionStyle: optStr(args.caption_style) as any,
          highlight: typeof args.highlight === 'boolean' ? args.highlight : undefined,
          role: optStr(args.role) as any,
        }))
        if (args.caption_y !== undefined) {
          mutateMontage(record.id, (doc) => {
            const t = doc.tracks.find((x) => x.id === result.id)!
            if (t.kind !== 'caption') throw new ToolInputError('caption_y applies to caption tracks')
            const H = timelineResolution(doc).height
            t.captionY = num(args.caption_y) < 0 ? undefined : Math.min(1, Math.max(0, num(args.caption_y) / H))
          })
        }
        return { track: { ...result, index: record.doc.tracks.findIndex((t) => t.id === result.id) }, ...after(record) }
      }),
    },
    {
      name: 'timeline_remove_track',
      title: 'Remove track',
      description: 'Remove a track and every clip on it.',
      inputSchema: { type: 'object', properties: { ...timelineId, track_id: { type: 'string' } }, required: ['timeline_id', 'track_id'], additionalProperties: false },
      annotations: DESTRUCTIVE,
      handler: async (args) => guard(() => {
        const { record, result } = mutateMontage(str(args.timeline_id), (doc) => removeTrack(doc, str(args.track_id)))
        return { removedTrack: str(args.track_id), removedClips: result, ...after(record) }
      }),
    },

    // ─── Clips ────────────────────────────────────────────────
    {
      name: 'timeline_add_clips',
      title: 'Add clips',
      description: 'Place library assets on the timeline, in order (each one can append after the previous). Video and image assets go on video tracks, audio on audio tracks. All-or-nothing: if one clip fails validation (asset missing or not ready, in/out past the source, overlap on the track) nothing is added and the error says why.',
      inputSchema: {
        type: 'object',
        properties: {
          ...timelineId,
          clips: { type: 'array', minItems: 1, items: clipItemSchema, description: 'Up to 50 clips' },
        },
        required: ['timeline_id', 'clips'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => guardAsync(async () => {
        const items: any[] = args.clips
        if (items.length > 50) throw new ToolInputError('timeline_add_clips takes at most 50 clips per call')
        getMontage(str(args.timeline_id))
        const sources: MediaSource[] = []
        for (const [i, item] of items.entries()) {
          try {
            sources.push(await mediaSourceFromAsset(requireAsset(str(item.asset_id))))
          } catch (err: any) {
            throw new ToolInputError(`clips[${i}]: ${err.message}`)
          }
        }
        const { record, result } = mutateMontage(str(args.timeline_id), (doc) => items.map((item, i) => {
          try {
            return addMediaClip(doc, sources[i], {
              id: optStr(item.id),
              trackId: optStr(item.track_id),
              start: item.start !== undefined ? num(item.start) : undefined,
              in: item.in !== undefined ? num(item.in) : undefined,
              out: item.out !== undefined ? num(item.out) : undefined,
              duration: item.duration !== undefined ? num(item.duration) : undefined,
              volume: item.volume !== undefined ? num(item.volume) : undefined,
              opacity: item.opacity !== undefined ? num(item.opacity) : undefined,
              fadeIn: item.fade_in !== undefined ? num(item.fade_in) : undefined,
              fadeOut: item.fade_out !== undefined ? num(item.fade_out) : undefined,
            })
          } catch (err: any) {
            throw new MontageError(`clips[${i}] (asset ${item.asset_id}): ${err.message}`)
          }
        }))
        return {
          clips: result.map(({ clip, existed }) => ({ ...clipSummary(clip), ...(existed ? { existed: true } : {}) })),
          aspect: aspectLabel(record.doc.aspect),
          ...after(record),
        }
      }),
    },
    {
      name: 'timeline_update_clip',
      title: 'Move / trim / edit clip',
      description: 'Change one clip: start (move), track_id (move to another track of the same kind), in/out or duration (trim inside the source), volume (0 mutes the clip), opacity, fade_in/fade_out (seconds; 0 removes), volume_keyframes / opacity_keyframes (time in seconds into the clip + value 0..1, linear in between, held before the first and after the last; they replace volume/opacity; [] removes them), text (captions). Values are absolute; unspecified ones stay. Keyframes are stored on the source content, so later trims keep them on the same frames. Moves that would overlap another clip are refused with the nearest free start.',
      inputSchema: {
        type: 'object',
        properties: {
          ...timelineId,
          clip_id: { type: 'string' },
          start: { type: 'number', minimum: 0 },
          track_id: { type: 'string' },
          in: { type: 'number', minimum: 0 },
          out: { type: 'number', minimum: 0 },
          duration: { type: 'number', minimum: 0.1 },
          volume: { type: 'number', minimum: 0 },
          opacity: { type: 'number', minimum: 0, description: 'Video/image, 0..1' },
          fade_in: { type: 'number', minimum: 0, description: 'Seconds; 0 removes the fade' },
          fade_out: { type: 'number', minimum: 0, description: 'Seconds; 0 removes the fade' },
          volume_keyframes: { type: 'array', items: keyframeSchema, description: 'Video/audio clips. [] removes them' },
          opacity_keyframes: { type: 'array', items: keyframeSchema, description: 'Video/image clips. [] removes them' },
          voice: { type: 'string', enum: ['voice', 'not_voice', 'auto'], description: 'Video/audio clips: override whether this clip counts as a voice for ducking (auto = follow the track role)' },
          text: { type: 'string' },
        },
        required: ['timeline_id', 'clip_id'],
        additionalProperties: false,
      },
      annotations: EDIT,
      handler: async (args) => guard(() => {
        const n = (v: any) => (v !== undefined ? num(v) : undefined)
        const { record, result } = mutateMontage(str(args.timeline_id), (doc) => updateClip(doc, str(args.clip_id), {
          start: n(args.start),
          trackId: optStr(args.track_id),
          in: n(args.in),
          out: n(args.out),
          duration: n(args.duration),
          volume: n(args.volume),
          text: typeof args.text === 'string' ? args.text : undefined,
          opacity: n(args.opacity),
          fadeIn: n(args.fade_in),
          fadeOut: n(args.fade_out),
          volumeKeys: Array.isArray(args.volume_keyframes) ? args.volume_keyframes.map((k: any) => ({ t: num(k.time, NaN), v: num(k.value, NaN) })) : undefined,
          opacityKeys: Array.isArray(args.opacity_keyframes) ? args.opacity_keyframes.map((k: any) => ({ t: num(k.time, NaN), v: num(k.value, NaN) })) : undefined,
          voice: args.voice === 'voice' ? true : args.voice === 'not_voice' ? false : args.voice === 'auto' ? 'auto' : undefined,
        }))
        return { clip: clipSummary(result), ...after(record) }
      }),
    },
    {
      name: 'timeline_split_clip',
      title: 'Split clip',
      description: 'Cut a clip in two at a timeline time. Returns both halves (the first keeps the original id). Autocaptions split their words and text.',
      inputSchema: {
        type: 'object',
        properties: { ...timelineId, clip_id: { type: 'string' }, at: { type: 'number', minimum: 0, description: 'Timeline seconds, inside the clip' } },
        required: ['timeline_id', 'clip_id', 'at'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => guard(() => {
        const { record, result } = mutateMontage(str(args.timeline_id), (doc) => splitClip(doc, str(args.clip_id), num(args.at)))
        return { head: clipSummary(result[0]), tail: clipSummary(result[1]), ...after(record) }
      }),
    },
    {
      name: 'timeline_remove_clips',
      title: 'Remove clips',
      description: 'Remove clips (media or captions) by id. Ids already gone are reported in notFound, so retries are safe.',
      inputSchema: {
        type: 'object',
        properties: { ...timelineId, clip_ids: { type: 'array', items: { type: 'string' }, minItems: 1 } },
        required: ['timeline_id', 'clip_ids'],
        additionalProperties: false,
      },
      annotations: { ...DESTRUCTIVE, idempotentHint: true },
      handler: async (args) => guard(() => {
        const { record, result } = mutateMontage(str(args.timeline_id), (doc) => removeClips(doc, args.clip_ids))
        return { ...result, ...after(record) }
      }),
    },

    // ─── Ducking ──────────────────────────────────────────────
    {
      name: 'timeline_set_ducking',
      title: 'Duck background under voices',
      description: 'Make a music/background track dip automatically while voices play. Voices are the clips on tracks with role voice (plus clips marked voice). The dip is a gain curve recomputed from the voice clips every time (move or trim a voice and it follows), multiplied with the background clips\' own volume and keyframes, never overwriting them; the same curve plays in the preview and goes into the export. With no voice track or clip yet, voices are detected from the library: TTS / Voice Studio clips are marked as voices and tracks made mostly of them become voice tracks (detect_voice: false skips that). Returns the resulting voice ranges and curve. bake: true writes the current dip into the clips\' volume keyframes and switches automatic ducking off, so it can be edited by hand.',
      inputSchema: {
        type: 'object',
        properties: {
          ...timelineId,
          track_id: { type: 'string', description: 'The music/background track to duck' },
          enabled: { type: 'boolean', description: 'Default true' },
          amount_db: { type: 'number', description: 'Gain while voices play, dB (negative). Default -12' },
          attack_ms: { type: 'number', minimum: 0, description: 'Ramp down before each voice. Default 150' },
          release_ms: { type: 'number', minimum: 0, description: 'Ramp back up after each voice. Default 400' },
          pad_before_ms: { type: 'number', minimum: 0, description: 'Margin before each voice clip. Default 100' },
          pad_after_ms: { type: 'number', minimum: 0, description: 'Margin after each voice clip. Default 250' },
          voice_track_ids: { type: 'array', items: { type: 'string' }, description: 'Tracks to mark as voice tracks' },
          detect_voice: { type: 'boolean', description: 'Detect TTS voices from the library when none are marked. Default true' },
          bake: { type: 'boolean', description: 'Write the dip into volume keyframes and turn automatic ducking off' },
        },
        required: ['timeline_id', 'track_id'],
        additionalProperties: false,
      },
      annotations: EDIT,
      handler: async (args) => guard(() => {
        const ms = (v: any) => (v !== undefined ? num(v) / 1000 : undefined)
        let detected: { voiceTracks: string[]; voiceClips: string[] } | null = null
        let baked: number | null = null
        const trackId = str(args.track_id)
        const { record, result } = mutateMontage(str(args.timeline_id), (doc) => {
          for (const id of (args.voice_track_ids as string[] | undefined) ?? []) {
            if (id === trackId) throw new ToolInputError('A track cannot be both the voice and the background')
            updateTrack(doc, id, { role: 'voice' })
          }
          const track = setDucking(doc, trackId, {
            ...(typeof args.enabled === 'boolean' ? { enabled: args.enabled } : {}),
            ...(args.amount_db !== undefined ? { amountDb: num(args.amount_db) } : {}),
            ...(args.attack_ms !== undefined ? { attack: ms(args.attack_ms) } : {}),
            ...(args.release_ms !== undefined ? { release: ms(args.release_ms) } : {}),
            ...(args.pad_before_ms !== undefined ? { padBefore: ms(args.pad_before_ms) } : {}),
            ...(args.pad_after_ms !== undefined ? { padAfter: ms(args.pad_after_ms) } : {}),
          })
          const hasVoices = doc.tracks.some((t) => t.role === 'voice') || doc.clips.some((c) => c.voice === true)
          if (args.detect_voice !== false && !hasVoices) detected = detectVoices(doc, assetModelLookup())
          if (args.bake === true) baked = bakeDucking(doc, trackId)
          return track
        })
        const voiceTracks = record.doc.tracks.filter((t) => t.role === 'voice').map((t) => ({ id: t.id, name: t.name }))
        const voiceClips = record.doc.clips.filter((c) => isVoiceClip(c, record.doc.tracks.find((t) => t.id === c.trackId))).length
        return {
          track: { id: result.id, name: result.name, role: result.role },
          ducking: duckingReport(record.doc, result),
          voiceTracks,
          voiceClips,
          ...(detected ? { detected } : {}),
          ...(baked !== null ? { bakedClips: baked, note: 'Ducking written into volume keyframes; automatic ducking is now off.' } : {}),
          ...(voiceClips === 0 ? { warning: 'No voice clips: nothing ducks. Mark a voice track (voice_track_ids) or clips (timeline_update_clip voice).' } : {}),
          ...after(record),
        }
      }),
    },

    {
      name: 'timeline_autoducking',
      title: 'Autoducking (one call)',
      description: 'The Timeline Autoducking switch in one call: detects the voices (TTS / Voice Studio clips; tracks made mostly of them become voice tracks; tracks already marked voice count) and ducks every music/background audio track under them with -12 dB, 150 ms attack, 400 ms release by default. It stays on: the dip follows every later move or trim of the voices. enabled: false switches it off on every background track (settings kept). Fails with a clear message when there are no voices or nothing else to duck. For per-track control use timeline_set_ducking.',
      inputSchema: {
        type: 'object',
        properties: {
          ...timelineId,
          enabled: { type: 'boolean', description: 'Default true' },
          amount_db: { type: 'number', description: 'Default -12' },
          attack_ms: { type: 'number', minimum: 0, description: 'Default 150' },
          release_ms: { type: 'number', minimum: 0, description: 'Default 400' },
        },
        required: ['timeline_id'],
        additionalProperties: false,
      },
      annotations: EDIT,
      handler: async (args) => guard(() => {
        const tlId = str(args.timeline_id)
        if (args.enabled === false) {
          const { record, result } = mutateMontage(tlId, (doc) => {
            const bg = doc.tracks.filter((t) => t.role === 'background')
            for (const t of bg) t.ducking = { ...(t.ducking ?? {}), enabled: false }
            return bg.map((t) => ({ id: t.id, name: t.name }))
          })
          return { enabled: false, backgroundTracks: result, ...after(record) }
        }
        const plan = planAutoDucking(getMontage(tlId).doc, assetModelLookup())
        if (!plan.ok) {
          throw new ToolInputError(plan.reason === 'no-voices'
            ? 'No hay locuciones en el timeline: no voice clips were found (no TTS / Voice Studio clips and no track marked voice). Mark the voice track with timeline_update_track role: voice, or clips with timeline_update_clip voice: voice.'
            : 'Nothing to duck: every sound track holds voices. Put the music on its own audio track, or mark a track as background with timeline_set_ducking.')
        }
        const config = {
          ...(args.amount_db !== undefined ? { amountDb: num(args.amount_db) } : {}),
          ...(args.attack_ms !== undefined ? { attack: num(args.attack_ms) / 1000 } : {}),
          ...(args.release_ms !== undefined ? { release: num(args.release_ms) / 1000 } : {}),
        }
        const { record } = mutateMontage(tlId, (doc) => applyAutoDucking(doc, plan, config))
        const tracks = record.doc.tracks
        const name = (id: string) => tracks.find((t) => t.id === id)?.name ?? id
        return {
          enabled: true,
          voiceTracks: tracks.filter((t) => t.role === 'voice').map((t) => ({ id: t.id, name: t.name })),
          voiceClips: record.doc.clips.filter((c) => isVoiceClip(c, tracks.find((t) => t.id === c.trackId))).length,
          detected: { voiceTracks: plan.voiceTracks.map(name), voiceClips: plan.voiceClips.length },
          backgroundTracks: plan.backgroundTracks.map((id) => {
            const t = tracks.find((x) => x.id === id)!
            return { id, name: t.name, ducking: duckingReport(record.doc, t) }
          }),
          ...after(record),
        }
      }),
    },

    // ─── Captions ─────────────────────────────────────────────
    {
      name: 'timeline_add_captions',
      title: 'Add captions',
      description: 'Add caption segments (text + timeline start/end) to a caption track (default: the first one, created if missing). All-or-nothing; segments may not overlap others on the same track. Edit them with timeline_update_clip (text, start, duration) and delete with timeline_remove_clips.',
      inputSchema: {
        type: 'object',
        properties: {
          ...timelineId,
          track_id: { type: 'string' },
          captions: { type: 'array', minItems: 1, items: captionItemSchema, description: 'Up to 500 segments' },
        },
        required: ['timeline_id', 'captions'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => guard(() => {
        if (args.captions.length > 500) throw new ToolInputError('timeline_add_captions takes at most 500 segments per call')
        const { record, result } = mutateMontage(str(args.timeline_id), (doc) => addCaptions(doc, optStr(args.track_id), args.captions.map((c: any) => ({
          id: optStr(c.id),
          text: str(c.text),
          start: num(c.start),
          end: c.end !== undefined ? num(c.end) : undefined,
          duration: c.duration !== undefined ? num(c.duration) : undefined,
        }))))
        return { trackId: result[0]?.trackId, captions: result.map((c) => clipSummary(c)), ...after(record) }
      }),
    },
    {
      name: 'timeline_autocaptions',
      title: 'Autocaptions from audio',
      description: 'Transcribe the audio of one clip, one track or the whole timeline (what the export would mix) and add the result as a NEW caption track ("Subtítulos auto ES" etc.), synced and editable. Spends the user\'s ElevenLabs or OpenAI credits: call first with estimate_only: true to get the audio length and estimated cost. social style = large uppercase text raised for vertical video with the spoken word highlighted. Run it twice (or with translate_to_english) for a second language track.',
      inputSchema: {
        type: 'object',
        properties: {
          ...timelineId,
          scope: { type: 'string', enum: ['clip', 'track', 'sequence'], description: 'Default sequence' },
          clip_id: { type: 'string', description: 'scope clip: a video or audio clip' },
          track_id: { type: 'string', description: 'scope track: a video or audio track' },
          provider: { type: 'string', enum: ['elevenlabs', 'openai'], description: 'Default: ElevenLabs Scribe v2 if configured, else OpenAI Whisper' },
          language: { type: 'string', description: 'ISO-639-1 code of the spoken language (es, en, pt…); omit to detect' },
          translate_to_english: { type: 'boolean', description: 'OpenAI only: English captions of non-English speech (segment timings, no word highlight)' },
          max_chars: { type: 'number', minimum: 8, description: 'Max characters per caption line. Default 22 social / 42 classic' },
          max_words: { type: 'number', minimum: 1, description: 'Max words per caption line. Default 4 social / 12 classic' },
          style: { type: 'string', enum: ['social', 'classic'], description: 'Default: social for vertical timelines, classic otherwise' },
          highlight: { type: 'boolean', description: 'social style: highlight the spoken word (default true)' },
          estimate_only: { type: 'boolean', description: 'Only return audio length and estimated cost; nothing is transcribed or charged' },
        },
        required: ['timeline_id'],
        additionalProperties: false,
      },
      annotations: GENERATE,
      handler: async (args) => guardAsync(async () => {
        const rec = getMontage(str(args.timeline_id))
        const scope = (optStr(args.scope) ?? 'sequence') as CaptionScope
        if (scope === 'clip' && !optStr(args.clip_id)) throw new ToolInputError('scope clip needs clip_id')
        if (scope === 'track' && !optStr(args.track_id)) throw new ToolInputError('scope track needs track_id')
        const providers = captionProviderStatus()
        const requested = optStr(args.provider) as CaptionProvider | undefined
        const provider = requested ?? providers.find((p) => p.configured)?.id
        if (!provider) throw new ToolInputError('No speech-to-text provider configured: add an ElevenLabs or OpenAI API key in the app (Providers)')
        const translate = args.translate_to_english === true
        if (translate && provider !== 'openai') throw new ToolInputError('translate_to_english needs provider openai')
        const estimate = estimateAutocaptions(rec.doc, scope, provider, optStr(args.clip_id), optStr(args.track_id))
        if (estimate.sources === 0) throw new ToolInputError('No video or audio clips with sound in that scope')
        const configured = providers.find((p) => p.id === provider)!.configured
        const label = providers.find((p) => p.id === provider)!.label
        if (args.estimate_only === true) return { provider, model: label, configured, ...estimate, note: 'Nothing was transcribed. Call again without estimate_only to run it.' }
        if (!configured) throw new ToolInputError(`${label} has no API key configured in the app`)

        const style = (optStr(args.style) ?? (rec.doc.aspect < 1 ? 'social' : 'classic')) as 'social' | 'classic'
        const res = await generateAutocaptions({
          doc: rec.doc,
          scope,
          clipId: optStr(args.clip_id),
          trackId: optStr(args.track_id),
          provider,
          language: optStr(args.language),
          translateToEnglish: translate,
          maxChars: args.max_chars !== undefined ? num(args.max_chars) : style === 'social' ? 22 : 42,
          maxWords: args.max_words !== undefined ? num(args.max_words) : style === 'social' ? 4 : 12,
        })
        const tag = translate ? 'EN' : languageTag(res.language || optStr(args.language))
        const { record, result } = mutateMontage(rec.id, (doc) => applyAutocaptions(doc, res.segments, {
          name: `Subtítulos auto ${tag}`,
          captionStyle: style,
          highlight: style === 'social' && args.highlight !== false && !translate,
        }))
        return {
          provider,
          model: label,
          detectedLanguage: res.language ?? null,
          audioSeconds: res.audioSeconds,
          estimatedUsd: estimate.estimatedUsd,
          trackId: result.clips.length ? result.track.id : null,
          trackName: result.clips.length ? result.track.name : null,
          captions: result.clips.length,
          ...(result.clips.length ? { first: result.clips.slice(0, 5).map((c) => clipSummary(c)) } : { warning: 'No speech detected: nothing was added' }),
          ...after(record),
        }
      }),
    },

    // ─── Export ───────────────────────────────────────────────
    {
      name: 'timeline_export',
      title: 'Export timeline to MP4',
      description: 'Render the timeline to an H.264 MP4 (1080 px short side, 30 fps; captions burned in) and by default import it into the library as a video asset. Runs in the background: returns a job id; wait_seconds blocks up to that long. Poll with timeline_export_status. One export at a time in the whole app.',
      inputSchema: {
        type: 'object',
        properties: {
          ...timelineId,
          output_path: { type: 'string', description: 'Absolute .mp4 path. Default: the user\'s Videos folder, named after the timeline' },
          import_to_library: { type: 'boolean', description: 'Add the MP4 to the workspace library (default true)' },
          wait_seconds: { type: 'number', minimum: 0, description: 'Wait up to this long for the render (default 0, max 600)' },
        },
        required: ['timeline_id'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => guardAsync(async () => {
        const rec = getMontage(str(args.timeline_id))
        const dest = optStr(args.output_path) ?? defaultExportPath(rec.name)
        const { job } = startExport(rec.id, dest, { importToLibrary: args.import_to_library !== false })
        await waitJob(job, num(args.wait_seconds, 0))
        return { ...jobSummary(job), ...(job.status === 'running' ? { next: 'Call timeline_export_status with this job id (wait_seconds to block).' } : {}) }
      }),
    },
    {
      name: 'timeline_export_status',
      title: 'Export status',
      description: 'Status of a timeline export job: running (with progress %), completed (path and library asset id), failed or cancelled. wait_seconds blocks until it finishes or the time passes.',
      inputSchema: {
        type: 'object',
        properties: { job_id: { type: 'string' }, wait_seconds: { type: 'number', minimum: 0, description: 'Default 0, max 600' } },
        required: ['job_id'],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => {
        const job = getExportJob(str(args.job_id))
        if (!job) throw new ToolInputError(`Export job '${args.job_id}' not found (jobs are kept until the app restarts)`)
        await waitJob(job, num(args.wait_seconds, 0))
        return jobSummary(job)
      },
    },
    {
      name: 'timeline_cancel_export',
      title: 'Cancel export',
      description: 'Cancel the export that is running (if any).',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: EDIT,
      handler: async () => {
        cancelActiveExport()
        return { cancelled: true }
      },
    },
    {
      name: 'timeline_export_srt',
      title: 'Export captions as SRT',
      description: 'Write one caption track (or all caption tracks merged) as a .srt file, e.g. to upload subtitles to YouTube separately.',
      inputSchema: {
        type: 'object',
        properties: { ...timelineId, track_id: { type: 'string' }, output_path: { type: 'string', description: 'Absolute .srt path' } },
        required: ['timeline_id', 'output_path'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => guardAsync(async () => {
        const rec = getMontage(str(args.timeline_id))
        const trackId = optStr(args.track_id)
        if (trackId && !rec.doc.tracks.some((t) => t.id === trackId && t.kind === 'caption')) throw new ToolInputError(`'${trackId}' is not a caption track of this timeline`)
        let dest = str(args.output_path)
        if (!path.isAbsolute(dest)) throw new ToolInputError('output_path must be absolute')
        if (!dest.toLowerCase().endsWith('.srt')) dest += '.srt'
        const srt = montageSrt(rec.doc, trackId)
        if (!srt.trim()) throw new ToolInputError('No captions to export')
        await fs.writeFile(dest, '﻿' + srt, 'utf-8')
        return { path: dest, cues: srt.split(/\n\n(?=\d+\n)/).length }
      }),
    },
  ]
}
