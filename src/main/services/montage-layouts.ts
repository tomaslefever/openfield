import { getRawDb } from '../db'
import { readSetting } from '../ipc/helpers'
import { DUCKING_DEFAULTS } from './montage-export'
import type { Composite } from './montage-composite'
import { MontageError, addTrack, createMontage, mutateMontage, requireTrack, type MontageDoc, type MontageRecord, type MontageTrack } from './montage-service'

/*
 * Layout presets for montages (Timeline "Nuevo montaje desde plantilla" and the MCP layout tools).
 * A layout is a set of slots, one track each: video slots carry a composition every clip on the
 * track inherits, caption slots a style and height. Applying one never overwrites a montage: it
 * either builds a new montage, or only ADDS tracks to an existing one (same aspect, untouched tracks).
 */

export interface LayoutSlot {
  /** Track name when the slot creates its track */
  name: string
  kind: 'video' | 'caption'
  composite?: Composite
  captionStyle?: 'classic' | 'social'
  captionY?: number
  highlight?: boolean
  note: string
}

export interface Layout {
  name: string
  description: string
  aspect: number
  /** Slots from top to bottom, in track order */
  slots: Record<string, LayoutSlot>
  /** Audio tracks a new montage from this layout starts with */
  audio?: { name: string; role?: 'voice' | 'background' }[]
  builtIn?: boolean
}

const W9 = 1080
const H9 = 1920

export const BUILT_IN_LAYOUTS: Layout[] = [
  {
    name: 'reel-avatar-recuadro',
    description: 'Reel vertical: escenas de apoyo arriba (1080×1080), recuadro redondeado con sombra abajo (borde superior ≈1150), presentadora con chroma delante con la cabeza por encima del recuadro, subtítulos en la franja (≈1100) y una pista a pantalla completa para el gancho y los épicos.',
    aspect: 9 / 16,
    builtIn: true,
    slots: {
      captions: { name: 'Subtítulos', kind: 'caption', captionStyle: 'social', captionY: 1100 / H9, highlight: true, note: 'Word-by-word captions in the band between the two zones' },
      fullscreen: { name: 'Pantalla completa', kind: 'video', note: 'Hook and epic beats: full frame, covers the layout' },
      avatar: {
        name: 'Avatar (key)', kind: 'video', note: 'The presenter on green screen, keyed, standing on the frame bottom; head above the panel',
        composite: { transform: { x: 0.5, y: 1390 / H9, w: 1, h: 1060 / H9, fit: 'contain', anchorX: 0.5, anchorY: 1 }, chroma: {} },
      },
      frame: {
        name: 'Recuadro', kind: 'video', note: 'Room background, blurred, rounded with a soft shadow',
        composite: { transform: { x: 0.5, y: 1515 / H9, w: 1000 / W9, h: 730 / H9, fit: 'cover' }, radius: 48, shadow: { x: 0, y: 14, blur: 40, opacity: 0.5, color: '#000000' }, blur: 14 },
      },
      support: {
        name: 'Apoyo', kind: 'video', note: 'Support scenes (screens, drafts, epics) cut on the beat',
        composite: { transform: { x: 0.5, y: 540 / H9, w: 1, h: 1080 / H9, fit: 'cover' } },
      },
    },
    audio: [{ name: 'Voz', role: 'voice' }, { name: 'Música', role: 'background' }],
  },
]

export function savedLayouts(): Layout[] {
  const v = readSetting('timelineLayouts')
  return Array.isArray(v) ? v.filter((l) => l && typeof l.name === 'string' && l.slots) : []
}

export function writeSavedLayouts(list: Layout[]) {
  getRawDb()
    .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .run('timelineLayouts', JSON.stringify(list), Date.now())
}

export const listLayouts = (): Layout[] => [...BUILT_IN_LAYOUTS, ...savedLayouts()]

export function findLayout(name: string): Layout {
  const l = listLayouts().find((x) => x.name.toLowerCase() === name.trim().toLowerCase())
  if (!l) throw new MontageError(`Layout '${name}' not found. timeline_list_layouts lists them.`)
  return l
}

/** Puts the given tracks in the layout's top-to-bottom order, within the positions they occupy */
function orderSlots(doc: MontageDoc, ids: string[]) {
  const set = new Set(ids)
  const positions = doc.tracks.map((t, i) => (set.has(t.id) ? i : -1)).filter((i) => i >= 0)
  const byId = new Map(doc.tracks.map((t) => [t.id, t]))
  const ordered = ids.map((id) => byId.get(id)!)
  // Caption slots always sit above video slots, as the editor keeps them
  ordered.sort((a, b) => (a.kind === 'caption' ? 0 : 1) - (b.kind === 'caption' ? 0 : 1))
  positions.forEach((pos, i) => { doc.tracks[pos] = ordered[i] })
}

function applySlot(track: MontageTrack, def: LayoutSlot) {
  if (def.kind === 'video') track.composite = def.composite ? structuredClone(def.composite) : undefined
  else {
    track.captionStyle = def.captionStyle
    track.captionY = def.captionY
    if (def.highlight !== undefined) track.highlight = def.highlight
  }
}

export interface SlotResult { trackId: string; name: string; created: boolean }

/** A track already laid out (composition or caption placement): mapping a slot onto it would overwrite it */
const isLaidOut = (t: MontageTrack) =>
  t.kind === 'video' ? !!t.composite && Object.keys(t.composite).length > 0 : t.captionY !== undefined || t.captionStyle !== undefined

/**
 * Adds a layout to an existing montage without changing anything already there: same aspect only,
 * slots either mapped to tracks that have no layout yet or created as new (empty) tracks.
 */
export function addLayoutToMontage(id: string, layout: Layout, mapped: Record<string, string> = {}, createMissing = true): { record: MontageRecord; slots: Record<string, SlotResult> } {
  for (const k of Object.keys(mapped)) if (!(k in layout.slots)) throw new MontageError(`Layout '${layout.name}' has no slot '${k}'. Slots: ${Object.keys(layout.slots).join(', ')}`)
  const { record, result } = mutateMontage(id, (doc) => {
    if (Math.abs(doc.aspect - layout.aspect) > 0.01) {
      throw new MontageError(`This timeline's frame is not the layout's (${layout.aspect < 1 ? '9:16' : '16:9'}). Applying a layout never changes an existing montage: create a new one from it instead (timeline_apply_layout with new_timeline).`)
    }
    const slots: Record<string, SlotResult> = {}
    const created: string[] = []
    for (const [slot, def] of Object.entries(layout.slots)) {
      if (mapped[slot]) {
        const track = requireTrack(doc, mapped[slot])
        if (track.kind !== def.kind) throw new MontageError(`Slot '${slot}' needs a ${def.kind} track; '${track.name}' is ${track.kind}`)
        if (isLaidOut(track)) throw new MontageError(`Track '${track.name}' already has a ${track.kind === 'video' ? 'composition' : 'caption placement'}; a layout never overwrites it. Leave '${slot}' unmapped to get a new track.`)
        applySlot(track, def)
        slots[slot] = { trackId: track.id, name: track.name, created: false }
      } else if (createMissing) {
        const track = addTrack(doc, def.kind, { name: def.name })
        applySlot(track, def)
        created.push(track.id)
        slots[slot] = { trackId: track.id, name: track.name, created: true }
      }
    }
    // Only the new tracks are arranged; existing tracks keep their places
    orderSlots(doc, created)
    return slots
  })
  return { record, slots: result }
}

/** A new montage built from the layout: its slot tracks in order, then its audio tracks */
export function createMontageFromLayout(name: string, layout: Layout, source: 'mcp' | 'ui' = 'mcp'): { record: MontageRecord; slots: Record<string, SlotResult> } {
  const rec = createMontage(name || layout.name, layout.aspect, source)
  const { record, result } = mutateMontage(rec.id, (doc) => {
    const slots: Record<string, SlotResult> = {}
    const tracks: MontageTrack[] = []
    for (const [slot, def] of Object.entries(layout.slots)) {
      const track: MontageTrack = { id: crypto.randomUUID(), kind: def.kind, name: def.name }
      applySlot(track, def)
      tracks.push(track)
      slots[slot] = { trackId: track.id, name: track.name, created: true }
    }
    tracks.sort((a, b) => (a.kind === 'caption' ? 0 : 1) - (b.kind === 'caption' ? 0 : 1))
    for (const a of layout.audio ?? [{ name: 'Audio 1' }]) {
      tracks.push({
        id: crypto.randomUUID(), kind: 'audio', name: a.name,
        ...(a.role ? { role: a.role } : {}),
        ...(a.role === 'background' ? { ducking: { ...DUCKING_DEFAULTS } } : {}),
      })
    }
    // The montage was created a moment ago and is empty: its default tracks are replaced
    doc.tracks = tracks
    doc.aspectLocked = true
    return slots
  }, { source })
  return { record, slots: result }
}
