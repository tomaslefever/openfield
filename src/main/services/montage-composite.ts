/*
 * Clip compositing: where a video/image clip sits in the frame (a box), how its source fills that
 * box, crop, rounded mask, shadow, chroma key, blur and keyframed motion.
 * SHARED by the main process (montage export) and the renderer (Timeline preview imports this very
 * file), so both compute the same geometry: keep it free of Node/Electron/DOM imports.
 *
 * Geometry, in output-frame pixels:
 *   box      centre (x·W, y·H), size (w·W, h·H), rotated by `rotation` degrees about its centre
 *   content  the cropped source, fitted into the box (contain / cover / fill) × scale, placed by
 *            anchor (0 = left/top edge, 0.5 centred, 1 = right/bottom); clipped to the box
 *   radius   rounds the box corners; shadow follows the box's (masked, keyed) alpha
 */

export type Fit = 'contain' | 'cover' | 'fill'

export interface CompositeTransform { x?: number; y?: number; w?: number; h?: number; fit?: Fit; scale?: number; anchorX?: number; anchorY?: number; rotation?: number }
export interface CompositeCrop { left?: number; right?: number; top?: number; bottom?: number }
export interface CompositeShadow { x?: number; y?: number; blur?: number; opacity?: number; color?: string }
export interface CompositeChroma { color?: string; similarity?: number; smoothness?: number; despill?: number }

/** Every group is optional; on a clip, `null` switches a group its track sets off */
export interface Composite {
  transform?: CompositeTransform | null
  crop?: CompositeCrop | null
  /** Corner radius, output-frame px */
  radius?: number | null
  shadow?: CompositeShadow | null
  chroma?: CompositeChroma | null
  /** Gaussian blur of the content, output-frame px (sigma) */
  blur?: number | null
}

export interface MotionKey { t: number; v: number }
/** Keyframed transform values, times in source seconds like the volume keyframes */
export interface Motion { x?: MotionKey[]; y?: MotionKey[]; scale?: MotionKey[]; rotation?: MotionKey[] }

export const TRANSFORM_DEFAULTS = { x: 0.5, y: 0.5, w: 1, h: 1, fit: 'contain' as Fit, scale: 1, anchorX: 0.5, anchorY: 0.5, rotation: 0 }
export const SHADOW_DEFAULTS = { x: 0, y: 12, blur: 40, opacity: 0.45, color: '#000000' }
export const CHROMA_DEFAULTS = { color: '#00ff00', similarity: 0.3, smoothness: 0.1, despill: 0.5 }

export interface Effective {
  transform: typeof TRANSFORM_DEFAULTS
  crop: { left: number; right: number; top: number; bottom: number }
  radius: number
  shadow: typeof SHADOW_DEFAULTS | null
  chroma: typeof CHROMA_DEFAULTS | null
  blur: number
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Track defaults overlaid by the clip's own settings (a clip `null` turns a group off) */
export function effectiveComposite(track?: Composite | null, clip?: Composite | null): Effective {
  const pick = <K extends keyof Composite>(k: K): Composite[K] => (clip && k in clip ? clip[k] : track?.[k])
  const tr = { ...(track?.transform ?? {}), ...(clip && 'transform' in clip ? clip.transform ?? {} : {}) }
  const crop = pick('crop') ?? {}
  const sh = pick('shadow')
  const ck = pick('chroma')
  return {
    transform: {
      x: num(tr.x, 0.5), y: num(tr.y, 0.5), w: Math.max(0.01, num(tr.w, 1)), h: Math.max(0.01, num(tr.h, 1)),
      fit: tr.fit === 'cover' || tr.fit === 'fill' ? tr.fit : 'contain',
      scale: Math.max(0.01, num(tr.scale, 1)),
      anchorX: clamp(num(tr.anchorX, 0.5), 0, 1), anchorY: clamp(num(tr.anchorY, 0.5), 0, 1),
      rotation: num(tr.rotation, 0),
    },
    crop: {
      left: clamp(num(crop.left, 0), 0, 0.95), right: clamp(num(crop.right, 0), 0, 0.95),
      top: clamp(num(crop.top, 0), 0, 0.95), bottom: clamp(num(crop.bottom, 0), 0, 0.95),
    },
    radius: Math.max(0, num(pick('radius'), 0)),
    shadow: sh ? { x: num(sh.x, SHADOW_DEFAULTS.x), y: num(sh.y, SHADOW_DEFAULTS.y), blur: Math.max(0, num(sh.blur, SHADOW_DEFAULTS.blur)), opacity: clamp(num(sh.opacity, SHADOW_DEFAULTS.opacity), 0, 1), color: hexColor(sh.color) ?? SHADOW_DEFAULTS.color } : null,
    chroma: ck ? { color: hexColor(ck.color) ?? CHROMA_DEFAULTS.color, similarity: clamp(num(ck.similarity, CHROMA_DEFAULTS.similarity), 0.001, 1), smoothness: clamp(num(ck.smoothness, CHROMA_DEFAULTS.smoothness), 0, 1), despill: clamp(num(ck.despill, CHROMA_DEFAULTS.despill), 0, 1) } : null,
    blur: Math.max(0, num(pick('blur'), 0)),
  }
}

export function hexColor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const m = /^#?([0-9a-f]{6})$/i.exec(v.trim())
  return m ? `#${m[1].toLowerCase()}` : undefined
}

export const hasMotion = (m?: Motion | null) => !!m && (['x', 'y', 'scale', 'rotation'] as const).some((k) => (m[k]?.length ?? 0) > 0)

/** True when the clip draws exactly as before compositing existed: full-frame contain, no effects */
export function isPlain(e: Effective, motion?: Motion | null): boolean {
  const t = e.transform
  return t.x === 0.5 && t.y === 0.5 && t.w === 1 && t.h === 1 && t.fit === 'contain' && t.scale === 1 && t.rotation === 0 &&
    !e.crop.left && !e.crop.right && !e.crop.top && !e.crop.bottom && !e.radius && !e.shadow && !e.chroma && !e.blur && !hasMotion(motion)
}

/** Linear between keys, held outside; values are not clamped (positions, scales, angles) */
export function motionAt(keys: MotionKey[] | undefined, t: number, fallback: number): number {
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

export function cleanMotion(raw: any): Motion | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Motion = {}
  for (const k of ['x', 'y', 'scale', 'rotation'] as const) {
    if (!Array.isArray(raw[k])) continue
    const keys = raw[k].filter((p: any) => p && Number.isFinite(p.t) && Number.isFinite(p.v)).map((p: any) => ({ t: p.t, v: p.v })).sort((a: MotionKey, b: MotionKey) => a.t - b.t)
    if (keys.length) out[k] = keys
  }
  return hasMotion(out) ? out : undefined
}

export interface Placement {
  /** Box centre and size, frame px */
  cx: number
  cy: number
  bw: number
  bh: number
  rotation: number
  /** Content rect inside the box, box px (may extend past it; it is clipped to the box) */
  x: number
  y: number
  dw: number
  dh: number
  /** Display px per (cropped) source px */
  kx: number
  ky: number
}

/** Where the clip is at `sourceT` (source seconds) for a W×H frame and a sw×sh source */
export function placement(e: Effective, motion: Motion | null | undefined, W: number, H: number, sw: number, sh: number, sourceT: number): Placement {
  const t = e.transform
  const cx = motionAt(motion?.x, sourceT, t.x) * W
  const cy = motionAt(motion?.y, sourceT, t.y) * H
  const scale = Math.max(0.01, motionAt(motion?.scale, sourceT, t.scale))
  const rotation = motionAt(motion?.rotation, sourceT, t.rotation)
  const bw = t.w * W
  const bh = t.h * H
  const cw = Math.max(1, sw * (1 - e.crop.left - e.crop.right))
  const ch = Math.max(1, sh * (1 - e.crop.top - e.crop.bottom))
  let kx: number
  let ky: number
  if (t.fit === 'fill') { kx = bw / cw; ky = bh / ch }
  else { kx = ky = t.fit === 'cover' ? Math.max(bw / cw, bh / ch) : Math.min(bw / cw, bh / ch) }
  kx *= scale
  ky *= scale
  const dw = cw * kx
  const dh = ch * ky
  return { cx, cy, bw, bh, rotation, x: (bw - dw) * t.anchorX, y: (bh - dh) * t.anchorY, dw, dh, kx, ky }
}

// ─── ffmpeg ─────────────────────────────────────────────────────

const f4 = (n: number) => Number(n.toFixed(4))
const rgbHex = (hex: string) => `0x${hex.slice(1)}`
const rgbOf = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16))

/** Piecewise-linear expression of `v` over keys, in `x` (a time expression) */
export function pieceExpr(keys: { t: number; v: number }[], x: string): string {
  const f = (n: number) => `(${f4(n)})`
  let expr = f(keys[keys.length - 1].v)
  for (let i = keys.length - 1; i >= 1; i--) {
    const a = keys[i - 1]
    const b = keys[i]
    const span = b.t - a.t
    const ramp = span > 0 ? `${f(a.v)}+${f(b.v - a.v)}*(${x}-${f(a.t)})/${f(span)}` : f(b.v)
    expr = `if(lt(${x},${f(b.t)}),${ramp},${expr})`
  }
  return `if(lt(${x},${f(keys[0].t)}),${f(keys[0].v)},${expr})`
}

/** Motion keys in segment seconds (from 0), only the stretch that matters, exact at both edges */
function segmentKeys(keys: MotionKey[] | undefined, fallback: number, srcStart: number, dur: number): MotionKey[] | null {
  if (!keys?.length) return null
  const out: MotionKey[] = [{ t: 0, v: motionAt(keys, srcStart, fallback) }]
  for (const k of keys) if (k.t > srcStart && k.t < srcStart + dur) out.push({ t: k.t - srcStart, v: k.v })
  out.push({ t: dur, v: motionAt(keys, srcStart + dur, fallback) })
  return out.every((k) => Math.abs(k.v - out[0].v) < 1e-6) ? null : out
}

export interface LayerInput {
  /** ffmpeg input index of the clip's source and of its box mask (when rounded) */
  input: number
  maskInput?: number
  /** Output frame */
  W: number
  H: number
  /** Source pixel size */
  sw: number
  sh: number
  /** Source second shown at the segment's first frame, and the segment length */
  srcStart: number
  dur: number
  fps: number
  e: Effective
  motion?: Motion | null
  /** Opacity per frame (fades × opacity keys), already capped */
  opacity: number[]
  /** Unique label prefix, e.g. "c0" */
  id: string
  /** Name of the sendcmd file for animated opacity, written by the caller (commands for colorchannelmixer@<id>op) */
  opacityCmdFile?: string
}

/** Rounded-rectangle alpha mask (gray PNG) the size of a box, rendered once per segment */
export function maskArgs(w: number, h: number, r: number, out: string): string[] {
  const R = Math.min(r, w / 2, h / 2)
  // Single quotes protect the commas from the filtergraph parser
  const lum = `255*clip(${f4(R)}+0.5-hypot(max(abs(X+0.5-W/2)-(W/2-${f4(R)}),0),max(abs(Y+0.5-H/2)-(H/2-${f4(R)}),0)),0,1)`
  return ['-f', 'lavfi', '-i', `color=c=white:s=${w}x${h}:d=1,format=gray,geq=lum='${lum}'`, '-frames:v', '1', out]
}

/** Box pixel size used for the layer canvas */
export const boxSize = (e: Effective, W: number, H: number) => ({ bw: Math.max(2, Math.round(e.transform.w * W)), bh: Math.max(2, Math.round(e.transform.h * H)) })

/**
 * Filter chain for one composited clip: from `[input:v]` (already fps/trim-normalised as `[pre]`)
 * to a positioned overlay onto `base`. Returns the filters and the output label.
 */
export function layerFilters(L: LayerInput, pre: string, base: string): { filters: string[]; out: string } {
  const { e, W, H, sw, sh, fps, dur, srcStart, id } = L
  const f: string[] = []
  const { bw, bh } = boxSize(e, W, H)
  const p0 = placement(e, L.motion, W, H, sw, sh, srcStart)
  const scaleKeys = segmentKeys(L.motion?.scale, e.transform.scale, srcStart, dur)
  const xKeys = segmentKeys(L.motion?.x, e.transform.x, srcStart, dur)
  const yKeys = segmentKeys(L.motion?.y, e.transform.y, srcStart, dur)
  const rotKeys = segmentKeys(L.motion?.rotation, e.transform.rotation, srcStart, dur)

  // 1. Crop, key, despill, blur, all in source space
  let chain = `[${pre}]`
  const c = e.crop
  if (c.left || c.right || c.top || c.bottom) {
    chain += `crop=w=${f4(1 - c.left - c.right)}*iw:h=${f4(1 - c.top - c.bottom)}*ih:x=${f4(c.left)}*iw:y=${f4(c.top)}*ih:exact=1,`
  }
  if (e.chroma) {
    const k = e.chroma
    chain += `format=yuva444p,chromakey=color=${rgbHex(k.color)}:similarity=${f4(k.similarity)}:blend=${f4(k.smoothness)},format=rgba,`
    const [r, g, b] = rgbOf(k.color)
    if (k.despill > 0 && (g > r && g > b || b > r && b > g)) {
      chain += `despill=type=${b > g ? 'blue' : 'green'}:mix=0.5:expand=0:red=0:green=${b > g ? 0 : f4(-k.despill)}:blue=${b > g ? f4(-k.despill) : 0}:brightness=0:alpha=0,`
    }
  } else chain += 'format=rgba,'
  if (e.blur > 0) {
    // Blur in source pixels so it equals `blur` display px at the clip's scale
    const sigma = e.blur / Math.max(0.0001, Math.min(p0.kx, p0.ky))
    chain += `format=gbrap,gblur=sigma=${f4(Math.min(sigma, 1024))},format=rgba,`
  }

  // 2. Content into the box canvas (bw×bh, transparent)
  const cw = Math.max(1, sw * (1 - c.left - c.right))
  const ch = Math.max(1, sh * (1 - c.top - c.bottom))
  if (!scaleKeys) {
    // Static: crop the source to what the box shows, scale it, pad it into place
    const vx0 = Math.max(0, p0.x)
    const vy0 = Math.max(0, p0.y)
    const vx1 = Math.min(p0.bw, p0.x + p0.dw)
    const vy1 = Math.min(p0.bh, p0.y + p0.dh)
    if (vx1 - vx0 < 0.5 || vy1 - vy0 < 0.5) return { filters: [], out: base }
    const sx = (vx0 - p0.x) / p0.kx
    const sy = (vy0 - p0.y) / p0.ky
    const sW = (vx1 - vx0) / p0.kx
    const sH = (vy1 - vy0) / p0.ky
    const ox = Math.round(vx0)
    const oy = Math.round(vy0)
    const vw = Math.max(1, Math.min(bw - ox, Math.round(vx1) - ox))
    const vh = Math.max(1, Math.min(bh - oy, Math.round(vy1) - oy))
    chain += `crop=w=${f4(Math.min(cw, sW))}:h=${f4(Math.min(ch, sH))}:x=${f4(sx)}:y=${f4(sy)}:exact=1,scale=${vw}:${vh}:flags=bicubic,format=rgba,`
    chain += `pad=${bw}:${bh}:${ox}:${oy}:color=black@0`
  } else {
    // Animated zoom: stretch the (2 px transparent-padded) content to the box, then send its corners
    // where the content rect is on each frame; outside the content stays transparent
    const pad = 2
    const k = (e: string) => e
    const sc = pieceExpr(scaleKeys, '(in/' + fps + ')')
    const t = e.transform
    let kx0: number
    let ky0: number
    if (t.fit === 'fill') { kx0 = p0.bw / cw; ky0 = p0.bh / ch }
    else { kx0 = ky0 = t.fit === 'cover' ? Math.max(p0.bw / cw, p0.bh / ch) : Math.min(p0.bw / cw, p0.bh / ch) }
    // Padded content rect (box px) as expressions of the scale s(t)
    const dw = `(${f4(cw * kx0)}*S)`
    const dh = `(${f4(ch * ky0)}*S)`
    const left = `((${f4(p0.bw)}-${dw})*${f4(t.anchorX)}-${f4(pad * kx0)}*S)`
    const top = `((${f4(p0.bh)}-${dh})*${f4(t.anchorY)}-${f4(pad * ky0)}*S)`
    const right = `(${left}+${f4((cw + 2 * pad) * kx0)}*S)`
    const bottom = `(${top}+${f4((ch + 2 * pad) * ky0)}*S)`
    const withS = (expr: string) => k(expr.split('S').join(`(${sc})`))
    // Box px → canvas px (the canvas is bw×bh, rounded)
    const sxr = f4(bw / p0.bw)
    const syr = f4(bh / p0.bh)
    const X = (expr: string) => `'${withS(expr)}*${sxr}'`
    const Y = (expr: string) => `'${withS(expr)}*${syr}'`
    chain += `pad=iw+${2 * pad}:ih+${2 * pad}:${pad}:${pad}:color=black@0,scale=${bw}:${bh}:flags=bicubic,format=yuva444p,`
    chain += `perspective=x0=${X(left)}:y0=${Y(top)}:x1=${X(right)}:y1=${Y(top)}:x2=${X(left)}:y2=${Y(bottom)}:x3=${X(right)}:y3=${Y(bottom)}:sense=destination:eval=frame:interpolation=linear,format=rgba`
  }
  f.push(`${chain}[${id}box]`)
  let label = `${id}box`

  // 3. Rounded corners
  if (e.radius > 0 && L.maskInput !== undefined) {
    f.push(`[${label}]split[${id}m1][${id}m2]`)
    f.push(`[${id}m2]alphaextract[${id}a]`)
    f.push(`[${L.maskInput}:v]format=gray,scale=${bw}:${bh}[${id}mk]`)
    f.push(`[${id}a][${id}mk]blend=all_mode=multiply[${id}a2]`)
    f.push(`[${id}m1][${id}a2]alphamerge,format=rgba[${id}r]`)
    label = `${id}r`
  }

  // 4. Opacity (constant, or per frame through sendcmd)
  const op0 = L.opacity[0] ?? 1
  const opaque = L.opacity.every((v) => v >= 0.9999)
  if (!opaque) {
    const cmd = L.opacityCmdFile ? `sendcmd=f=${L.opacityCmdFile},` : ''
    f.push(`[${label}]${cmd}colorchannelmixer@${id}op=aa=${f4(op0)}[${id}o]`)
    label = `${id}o`
  }

  // 5. Rotation about the box centre
  const rad = (deg: number) => (deg * Math.PI) / 180
  let ow = bw
  let oh = bh
  if (rotKeys) {
    const diag = Math.ceil(Math.hypot(bw, bh) / 2) * 2
    ow = oh = diag
    f.push(`[${label}]rotate=a='(${pieceExpr(rotKeys, 't')})*PI/180':ow=${diag}:oh=${diag}:c=none[${id}rot]`)
    label = `${id}rot`
  } else if (Math.abs(e.transform.rotation % 360) > 1e-6) {
    const a = rad(e.transform.rotation)
    ow = Math.ceil((Math.abs(bw * Math.cos(a)) + Math.abs(bh * Math.sin(a))) / 2) * 2
    oh = Math.ceil((Math.abs(bw * Math.sin(a)) + Math.abs(bh * Math.cos(a))) / 2) * 2
    f.push(`[${label}]rotate=a=${f4(a)}:ow=${ow}:oh=${oh}:c=none[${id}rot]`)
    label = `${id}rot`
  }

  // 6. Position (box centre, maybe animated) and shadow
  const cxExpr = xKeys ? `(${pieceExpr(xKeys, 't')})*${W}` : `${f4(p0.cx)}`
  const cyExpr = yKeys ? `(${pieceExpr(yKeys, 't')})*${H}` : `${f4(p0.cy)}`
  let out = base
  if (e.shadow && e.shadow.opacity > 0) {
    const s = e.shadow
    const spread = Math.ceil(s.blur * 1.5) + 2
    const [r, g, b] = rgbOf(s.color)
    f.push(`[${label}]split[${id}l][${id}s]`)
    f.push(
      `[${id}s]lutrgb=r=${r}:g=${g}:b=${b},colorchannelmixer=aa=${f4(s.opacity)},pad=iw+${2 * spread}:ih+${2 * spread}:${spread}:${spread}:color=black@0,` +
      (s.blur > 0 ? `format=gbrap,gblur=sigma=${f4(s.blur / 2)},format=rgba` : 'format=rgba') + `[${id}sh]`,
    )
    f.push(`[${out}][${id}sh]overlay=x='${cxExpr}-overlay_w/2+${f4(s.x)}':y='${cyExpr}-overlay_h/2+${f4(s.y)}':eval=frame:format=auto[${id}bs]`)
    out = `${id}bs`
    label = `${id}l`
  }
  f.push(`[${out}][${label}]overlay=x='${cxExpr}-overlay_w/2':y='${cyExpr}-overlay_h/2':eval=frame:format=auto[${id}out]`)
  void ow
  void oh
  return { filters: f, out: `${id}out` }
}
