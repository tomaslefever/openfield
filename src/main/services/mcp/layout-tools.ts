import { MontageError, broadcastMontage, getMontage, mutateMontage, requireClip, requireTrack, timelineResolution, type MontageTrack } from '../montage-service'
import { BUILT_IN_LAYOUTS, addLayoutToMontage, createMontageFromLayout, findLayout, listLayouts, savedLayouts, writeSavedLayouts, type Layout, type LayoutSlot } from '../montage-layouts'
import { cleanMotion, effectiveComposite, hexColor, type Composite, type Fit, type Motion } from '../montage-composite'
import type { MontageClip } from '../montage-export'
import { type McpTool, ToolInputError, READ_ONLY, EDIT, CREATE, str, num, optStr } from './types'

/*
 * Composition for agents: place clips (box position/size in output-frame pixels, fit, scale,
 * anchor, rotation), crop, rounded corners, shadow, chroma key, blur and keyframed motion, on a clip
 * or on a whole track (a layout slot its clips inherit); and layout presets that set several tracks
 * up in one call. Stored as frame fractions (montage-composite.ts); exchanged here in pixels.
 */

const r1 = (n: number) => Math.round(n * 10) / 10
const r4 = (n: number) => Math.round(n * 10000) / 10000

function guard<T>(fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    if (err instanceof MontageError) throw new ToolInputError(err.message)
    throw err
  }
}

// ─── px ⇄ stored composite ──────────────────────────────────────

export const compositeSchema = {
  type: 'object',
  description: 'Output-frame pixels (1080×1920 for 9:16, 1920×1080 for 16:9). Every field optional; only what you pass changes. null turns a group (crop, radius, shadow, chroma, blur) off.',
  properties: {
    x: { type: 'number', description: 'Box centre x, px' },
    y: { type: 'number', description: 'Box centre y, px' },
    width: { type: 'number', minimum: 1, description: 'Box width, px (default: full frame)' },
    height: { type: 'number', minimum: 1, description: 'Box height, px' },
    fit: { type: 'string', enum: ['contain', 'cover', 'fill'], description: 'How the source fills the box: contain (whole, letterboxed transparent), cover (fills, cropped to the box), fill (stretched)' },
    scale: { type: 'number', minimum: 0.01, description: 'Content zoom inside the box, 1 = fitted (push-in: animate it)' },
    anchor_x: { type: 'number', minimum: 0, description: '0 left … 0.5 centre … 1 right: which part shows when the content overflows (cover / zoom)' },
    anchor_y: { type: 'number', minimum: 0, description: '0 top … 1 bottom (1 keeps a keyed person standing on the box bottom)' },
    rotation: { type: 'number', description: 'Degrees, about the box centre' },
    crop: { type: 'object', description: 'Crop of the source before fitting, fractions 0..0.95 per side', properties: { left: { type: 'number' }, right: { type: 'number' }, top: { type: 'number' }, bottom: { type: 'number' } }, additionalProperties: false },
    radius: { type: 'number', minimum: 0, description: 'Rounded corners of the box, px' },
    shadow: { type: 'object', description: 'Drop shadow of the box (follows key and corners). {} = defaults (0, 12, blur 40, 45% black)', properties: { x: { type: 'number' }, y: { type: 'number' }, blur: { type: 'number' }, opacity: { type: 'number' }, color: { type: 'string', description: '#rrggbb' } }, additionalProperties: false },
    chroma: { type: 'object', description: 'Chroma key. {} = green screen defaults (similarity 0.3, smoothness 0.1, despill 0.5). Sources with alpha (webm VP9, ProRes 4444) need no key.', properties: { color: { type: 'string' }, similarity: { type: 'number' }, smoothness: { type: 'number' }, despill: { type: 'number' } }, additionalProperties: false },
    blur: { type: 'number', minimum: 0, description: 'Gaussian blur of the content, px' },
  },
  additionalProperties: false,
}

export const motionSchema = {
  type: 'object',
  description: 'Keyframes {time (seconds into the clip), value}, linear in between. x/y px (box centre), scale multiplier, rotation degrees. [] removes that property.',
  properties: Object.fromEntries(['x', 'y', 'scale', 'rotation'].map((k) => [k, {
    type: 'array',
    items: { type: 'object', properties: { time: { type: 'number' }, value: { type: 'number' } }, required: ['time', 'value'], additionalProperties: false },
  }])),
  additionalProperties: false,
}

const frac = (v: number) => {
  if (!Number.isFinite(v) || v < 0 || v > 0.95) throw new ToolInputError('crop values are fractions between 0 and 0.95')
  return v
}

/** Patch an existing composite with px arguments */
export function applyCompositeArgs(base: Composite | undefined, a: any, W: number, H: number): Composite {
  const out: Composite = { ...(base ?? {}) }
  const tr = { ...(out.transform ?? {}) }
  let touched = false
  const set = (k: keyof typeof tr, v: any) => { (tr as any)[k] = v; touched = true }
  if (a.x !== undefined) set('x', r4(num(a.x) / W))
  if (a.y !== undefined) set('y', r4(num(a.y) / H))
  if (a.width !== undefined) set('w', r4(num(a.width) / W))
  if (a.height !== undefined) set('h', r4(num(a.height) / H))
  if (a.fit !== undefined) set('fit', a.fit as Fit)
  if (a.scale !== undefined) set('scale', num(a.scale))
  if (a.anchor_x !== undefined) set('anchorX', Math.min(1, Math.max(0, num(a.anchor_x))))
  if (a.anchor_y !== undefined) set('anchorY', Math.min(1, Math.max(0, num(a.anchor_y))))
  if (a.rotation !== undefined) set('rotation', num(a.rotation))
  if (touched) out.transform = tr
  if ('crop' in a) out.crop = a.crop === null ? null : Object.fromEntries(Object.entries({ ...(out.crop ?? {}), ...a.crop }).map(([k, v]) => [k, frac(num(v))]))
  if ('radius' in a) out.radius = a.radius === null ? null : Math.max(0, num(a.radius))
  if ('blur' in a) out.blur = a.blur === null ? null : Math.max(0, num(a.blur))
  if ('shadow' in a) {
    if (a.shadow === null) out.shadow = null
    else {
      const s = a.shadow
      if (s.color !== undefined && !hexColor(s.color)) throw new ToolInputError('shadow.color must be #rrggbb')
      out.shadow = { ...(out.shadow ?? {}), ...s }
    }
  }
  if ('chroma' in a) {
    if (a.chroma === null) out.chroma = null
    else {
      const c = a.chroma
      if (c.color !== undefined && !hexColor(c.color)) throw new ToolInputError('chroma.color must be #rrggbb')
      out.chroma = { ...(out.chroma ?? {}), ...c }
    }
  }
  return out
}

/** Stored composite → px, only what is set */
export function compositeReport(c: Composite | undefined | null, W: number, H: number) {
  if (!c || !Object.keys(c).length) return undefined
  const t = c.transform
  return {
    ...(t ? {
      ...(t.x !== undefined ? { x: r1(t.x * W) } : {}), ...(t.y !== undefined ? { y: r1(t.y * H) } : {}),
      ...(t.w !== undefined ? { width: r1(t.w * W) } : {}), ...(t.h !== undefined ? { height: r1(t.h * H) } : {}),
      ...(t.fit ? { fit: t.fit } : {}), ...(t.scale !== undefined ? { scale: t.scale } : {}),
      ...(t.anchorX !== undefined ? { anchor_x: t.anchorX } : {}), ...(t.anchorY !== undefined ? { anchor_y: t.anchorY } : {}),
      ...(t.rotation ? { rotation: t.rotation } : {}),
    } : {}),
    ...('crop' in c ? { crop: c.crop } : {}),
    ...('radius' in c ? { radius: c.radius } : {}),
    ...('shadow' in c ? { shadow: c.shadow } : {}),
    ...('chroma' in c ? { chroma: c.chroma } : {}),
    ...('blur' in c ? { blur: c.blur } : {}),
  }
}

/** Effective placement of a clip in px (track slot + clip overrides) */
export function effectiveReport(track: MontageTrack | undefined, clip: MontageClip, W: number, H: number) {
  const e = effectiveComposite(track?.composite, clip.composite)
  const t = e.transform
  return {
    x: r1(t.x * W), y: r1(t.y * H), width: r1(t.w * W), height: r1(t.h * H), fit: t.fit, scale: t.scale, anchor_x: t.anchorX, anchor_y: t.anchorY, rotation: t.rotation,
    ...(e.crop.left || e.crop.right || e.crop.top || e.crop.bottom ? { crop: e.crop } : {}),
    ...(e.radius ? { radius: e.radius } : {}),
    ...(e.shadow ? { shadow: e.shadow } : {}),
    ...(e.chroma ? { chroma: e.chroma } : {}),
    ...(e.blur ? { blur: e.blur } : {}),
  }
}

export function motionReport(clip: MontageClip, W: number, H: number) {
  const m = clip.motion
  if (!m) return undefined
  const scaleOf = (k: 'x' | 'y' | 'scale' | 'rotation') => (k === 'x' ? W : k === 'y' ? H : 1)
  return Object.fromEntries((['x', 'y', 'scale', 'rotation'] as const).filter((k) => m[k]?.length).map((k) => [k, m[k]!.map((p) => ({ time: r4(p.t - clip.offset), value: r1(p.v * scaleOf(k) * (k === 'scale' ? 10 : 1)) / (k === 'scale' ? 10 : 1) }))]))
}

function applyMotionArgs(clip: MontageClip, a: any, W: number, H: number): Motion | undefined {
  const next: any = { ...(clip.motion ?? {}) }
  for (const k of ['x', 'y', 'scale', 'rotation'] as const) {
    if (!(k in a)) continue
    const keys = a[k] as { time: number; value: number }[]
    keys.forEach((p, i) => {
      if (!Number.isFinite(p.time) || p.time < -1e-6 || p.time > clip.duration + 1e-6) throw new ToolInputError(`motion_keyframes.${k}[${i}].time (${p.time}s) is outside the clip (0–${r4(clip.duration)}s)`)
      if (k === 'scale' && !(p.value > 0)) throw new ToolInputError(`motion_keyframes.scale[${i}].value must be > 0`)
    })
    const div = k === 'x' ? W : k === 'y' ? H : 1
    next[k] = keys.map((p) => ({ t: r4(clip.offset + p.time), v: k === 'x' || k === 'y' ? r4(p.value / div) : p.value }))
  }
  return cleanMotion(next)
}

// ─── Layout presets (services/montage-layouts.ts) ────────────

function layoutReport(l: Layout) {
  const W = l.aspect >= 1 ? Math.round(1080 * l.aspect / 2) * 2 : 1080
  const H = l.aspect >= 1 ? 1080 : Math.round(1080 / l.aspect / 2) * 2
  return {
    name: l.name,
    description: l.description,
    builtIn: !!l.builtIn,
    frame: { width: W, height: H },
    slots: Object.fromEntries(Object.entries(l.slots).map(([k, s]) => [k, {
      kind: s.kind, name: s.name, note: s.note,
      ...(s.composite ? { composite: compositeReport(s.composite, W, H) } : {}),
      ...(s.captionY !== undefined ? { caption_y: r1(s.captionY * H), caption_style: s.captionStyle } : {}),
    }])),
  }
}

// ─── Tools ──────────────────────────────────────────────────────

const timelineId = { timeline_id: { type: 'string', description: 'Timeline id' } }

export function getLayoutTools(): McpTool[] {
  return [
    {
      name: 'timeline_set_composite',
      title: 'Place / key / mask a clip or track',
      description: 'Composition of a video/image clip (clip_id) or of every clip on a video track (track_id, a layout slot clips inherit and may override): box position and size in output-frame px, fit, zoom, anchor, rotation, source crop, rounded corners, shadow, chroma key, blur, plus motion keyframes (clips only) for push-ins, pans or slides. Upper video tracks cover lower ones with real compositing. Same result in the preview and the export. Pass reset: true to drop the clip\'s (or track\'s) own composition.',
      inputSchema: {
        type: 'object',
        properties: {
          ...timelineId,
          clip_id: { type: 'string' },
          track_id: { type: 'string' },
          composite: compositeSchema,
          motion_keyframes: motionSchema,
          reset: { type: 'boolean', description: 'Remove the composition (and motion) before applying anything else' },
        },
        required: ['timeline_id'],
        additionalProperties: false,
      },
      annotations: EDIT,
      handler: async (args) => guard(() => {
        const clipId = optStr(args.clip_id)
        const trackId = optStr(args.track_id)
        if (!!clipId === !!trackId) throw new ToolInputError('Pass exactly one of clip_id or track_id')
        if (trackId && args.motion_keyframes) throw new ToolInputError('motion_keyframes go on clips (they are timed to the clip)')
        const { record, result } = mutateMontage(str(args.timeline_id), (doc) => {
          const { width: W, height: H } = timelineResolution(doc)
          if (clipId) {
            const clip = requireClip(doc, clipId)
            if (clip.kind !== 'video' && clip.kind !== 'image') throw new ToolInputError('Only video and image clips have a composition')
            if (args.reset === true) { clip.composite = undefined; clip.motion = undefined }
            if (args.composite) clip.composite = applyCompositeArgs(clip.composite, args.composite, W, H)
            if (args.motion_keyframes) clip.motion = applyMotionArgs(clip, args.motion_keyframes, W, H)
            const track = doc.tracks.find((t) => t.id === clip.trackId)
            return { clipId, own: compositeReport(clip.composite, W, H) ?? null, effective: effectiveReport(track, clip, W, H), motion: motionReport(clip, W, H) ?? null }
          }
          const track = requireTrack(doc, trackId!)
          if (track.kind !== 'video') throw new ToolInputError('Track compositions apply to video tracks')
          if (args.reset === true) track.composite = undefined
          if (args.composite) track.composite = applyCompositeArgs(track.composite, args.composite, W, H)
          return { trackId, composite: compositeReport(track.composite, W, H) ?? null, clips: doc.clips.filter((c) => c.trackId === track.id).length }
        })
        return { ...result, rev: record.rev }
      }),
    },
    {
      name: 'timeline_list_layouts',
      title: 'List layout presets',
      description: 'Layout presets for timeline_apply_layout: built-in ones (reel-avatar-recuadro) and those saved with timeline_save_layout, each with its slots (one track each) and their composition in px.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: READ_ONLY,
      handler: async () => ({ layouts: listLayouts().map(layoutReport) }),
    },
    {
      name: 'timeline_apply_layout',
      title: 'Apply a layout preset',
      description: 'Lay a montage out with a preset in one call; it never overwrites a montage. Usually: new_timeline {name} creates a NEW montage from the layout (its frame, e.g. 1080×1920, its slot tracks in order plus its audio tracks such as Voz and Música with ducking). With timeline_id instead, the layout is only ADDED to that montage: same frame aspect required, missing slots become new empty tracks, and `tracks` may map slots onto existing tracks that have no layout yet (anything already laid out is refused, nothing is moved or deleted). Then add clips to each slot track with timeline_add_clips (track_id); clips inherit the slot composition and can override it with timeline_set_composite.',
      inputSchema: {
        type: 'object',
        properties: {
          layout: { type: 'string', description: 'Layout name, e.g. reel-avatar-recuadro (timeline_list_layouts)' },
          new_timeline: { type: 'object', description: 'Create a new montage from the layout', properties: { name: { type: 'string' }, open: { type: 'boolean', description: 'Show it in the app (default true)' } }, additionalProperties: false },
          timeline_id: { type: 'string', description: 'Add the layout to this existing montage instead (only adds tracks)' },
          tracks: { type: 'object', description: 'With timeline_id: existing track id per slot, e.g. {"support": "<id>"}; those tracks must have no layout yet', additionalProperties: { type: 'string' } },
          create_missing: { type: 'boolean', description: 'With timeline_id: create tracks for unmapped slots (default true)' },
        },
        required: ['layout'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => guard(() => {
        const layout = findLayout(str(args.layout))
        const isNew = !!args.new_timeline
        if (isNew === !!optStr(args.timeline_id)) throw new ToolInputError('Pass new_timeline (recommended: a new montage) or timeline_id (add to an existing one), not both')
        if (isNew && args.tracks) throw new ToolInputError('tracks maps slots onto an existing montage; a new_timeline gets its own tracks')
        const { record, slots } = isNew
          ? createMontageFromLayout(str(args.new_timeline.name), layout)
          : addLayoutToMontage(str(args.timeline_id), layout, args.tracks ?? {}, args.create_missing !== false)
        if (isNew && args.new_timeline.open !== false) {
          broadcastMontage({ id: record.id, rev: record.rev, name: record.name, doc: record.doc, source: 'mcp', workspaceId: record.workspaceId, open: true })
        }
        return {
          timelineId: record.id,
          name: record.name,
          created: isNew,
          layout: layout.name,
          slots,
          audioTracks: record.doc.tracks.filter((t) => t.kind === 'audio').map((t) => ({ trackId: t.id, name: t.name, role: t.role ?? 'none' })),
          resolution: timelineResolution(record.doc),
          rev: record.rev,
          next: 'Add clips to each slot track with timeline_add_clips (track_id = the trackId of the slot).',
        }
      }),
    },
    {
      name: 'timeline_save_layout',
      title: 'Save a layout preset',
      description: 'Save the composition of some tracks of a timeline as a reusable layout: `tracks` maps slot names to track ids (video tracks keep their composition, caption tracks their style and height). Overwrites a saved layout with the same name; built-in names are reserved.',
      inputSchema: {
        type: 'object',
        properties: {
          ...timelineId,
          name: { type: 'string' },
          description: { type: 'string' },
          tracks: { type: 'object', description: 'Slot name → track id, top to bottom', additionalProperties: { type: 'string' } },
        },
        required: ['timeline_id', 'name', 'tracks'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => guard(() => {
        const name = str(args.name).trim()
        if (!/^[\w.-]{2,60}$/.test(name)) throw new ToolInputError('name: 2–60 letters, digits, dot, dash or underscore')
        if (BUILT_IN_LAYOUTS.some((l) => l.name === name)) throw new ToolInputError(`'${name}' is a built-in layout; pick another name`)
        const rec = getMontage(str(args.timeline_id))
        const entries = Object.entries(args.tracks as Record<string, string>)
        if (!entries.length) throw new ToolInputError('tracks must map at least one slot')
        // Slots follow the timeline's track order (top to bottom)
        const order = new Map(rec.doc.tracks.map((t, i) => [t.id, i]))
        const slots: Record<string, LayoutSlot> = {}
        for (const [slot, id] of entries.sort((a, b) => (order.get(a[1]) ?? 0) - (order.get(b[1]) ?? 0))) {
          const t = requireTrack(rec.doc, id)
          if (t.kind === 'audio') throw new ToolInputError(`'${t.name}' is an audio track; layouts hold video and caption tracks`)
          slots[slot] = t.kind === 'video'
            ? { name: t.name, kind: 'video', composite: t.composite ? structuredClone(t.composite) : undefined, note: '' }
            : { name: t.name, kind: 'caption', captionStyle: t.captionStyle, captionY: t.captionY, highlight: t.highlight, note: '' }
        }
        const layout: Layout = { name, description: optStr(args.description) ?? `Saved from '${rec.name}'`, aspect: rec.doc.aspect, slots }
        writeSavedLayouts([...savedLayouts().filter((l) => l.name !== name), layout])
        return { saved: layoutReport(layout) }
      }),
    },
  ]
}
