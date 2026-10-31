import { useEffect, useRef, useState } from 'react'
import { fileUrl } from '../../services/file-url'
import { effectiveComposite, isPlain, placement } from '../../../../main/services/montage-composite'
import { useMontageStore, type MontageClip, type MontageTrack } from '../../stores/montage-store'

/*
 * One video/image clip in the preview, placed with the same geometry the export uses
 * (main/services/montage-composite.ts): shadow and opacity outside, rotation + rounded clip in the
 * middle, the cropped content inside. Chroma key runs in WebGL with the export's chromakey/despill math.
 */

/** Output frame size for an aspect (montage-export montageSize: 1080 on the short side) */
export function frameSize(aspect: number) {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9
  return a >= 1 ? { W: even(1080 * a), H: 1080 } : { W: 1080, H: even(1080 / a) }
}

const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export interface LayerProps {
  clip: MontageClip
  track?: MontageTrack
  /** Seconds into the clip */
  local: number
  opacity: number
  zIndex: number
  /** Preview frame size, CSS px */
  boxW: number
  boxH: number
  aspect: number
  bindMedia: (el: HTMLMediaElement | null) => void
}

export function CompositeLayer({ clip, track, local, opacity, zIndex, boxW, boxH, aspect, bindMedia }: LayerProps) {
  const e = effectiveComposite(track?.composite, clip.composite)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const sw = clip.sourceWidth || natural?.w
  const sh = clip.sourceHeight || natural?.h
  const src = fileUrl(clip.src!)
  const onSize = (w: number, h: number) => {
    if (!w || !h) return
    if (w !== natural?.w || h !== natural?.h) setNatural({ w, h })
    // Remember it on the clip so the handles, the panel and the export share it
    if (clip.sourceWidth !== w || clip.sourceHeight !== h) useMontageStore.getState().setSourceSize(clip.id, w, h)
  }

  if (isPlain(e, clip.motion)) {
    const style = { zIndex, opacity }
    return clip.kind === 'image' ? (
      <img src={src} alt="" draggable={false} onLoad={(ev) => onSize(ev.currentTarget.naturalWidth, ev.currentTarget.naturalHeight)} className="absolute inset-0 h-full w-full object-contain" style={style} />
    ) : (
      <video ref={bindMedia} src={src} preload="auto" playsInline onLoadedMetadata={(ev) => onSize(ev.currentTarget.videoWidth, ev.currentTarget.videoHeight)} className="absolute inset-0 h-full w-full object-contain" style={style} />
    )
  }

  const { W, H } = frameSize(aspect)
  const f = boxW / W
  const p = sw && sh ? placement(e, clip.motion, W, H, sw, sh, clip.offset + local) : null
  const c = e.crop
  const fullW = p ? p.dw / (1 - c.left - c.right) : 0
  const fullH = p ? p.dh / (1 - c.top - c.bottom) : 0
  const media = clip.kind === 'image' ? (
    <img
      src={src}
      alt=""
      draggable={false}
      // WebGL keying needs CORS-clean pixels (the asset protocol answers with Allow-Origin *)
      crossOrigin={e.chroma ? 'anonymous' : undefined}
      onLoad={(ev) => onSize(ev.currentTarget.naturalWidth, ev.currentTarget.naturalHeight)}
      style={mediaStyle(fullW, fullH, c, f, !!e.chroma)}
    />
  ) : (
    <video
      ref={bindMedia}
      src={src}
      preload="auto"
      playsInline
      crossOrigin={e.chroma ? 'anonymous' : undefined}
      onLoadedMetadata={(ev) => onSize(ev.currentTarget.videoWidth, ev.currentTarget.videoHeight)}
      style={mediaStyle(fullW, fullH, c, f, !!e.chroma)}
    />
  )

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        zIndex,
        opacity: p ? opacity : 0,
        left: p ? (p.cx - p.bw / 2) * f : 0,
        top: p ? (p.cy - p.bh / 2) * f : 0,
        width: p ? p.bw * f : 0,
        height: p ? p.bh * f : 0,
        // drop-shadow's blur radius is twice the export's gaussian sigma (blur / 2)
        filter: e.shadow && e.shadow.opacity > 0 ? `drop-shadow(${e.shadow.x * f}px ${e.shadow.y * f}px ${e.shadow.blur * f}px ${rgba(e.shadow.color, e.shadow.opacity)})` : undefined,
      }}
    >
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ transform: p?.rotation ? `rotate(${p.rotation}deg)` : undefined, borderRadius: e.radius * f }}
      >
        <div
          className="absolute overflow-hidden"
          style={{
            left: p ? p.x * f : 0,
            top: p ? p.y * f : 0,
            width: p ? p.dw * f : 0,
            height: p ? p.dh * f : 0,
            filter: e.blur > 0 ? `blur(${e.blur * f}px)` : undefined,
          }}
        >
          {media}
          {e.chroma && (
            <ChromaCanvas
              source={clip.id}
              kind={clip.kind === 'image' ? 'image' : 'video'}
              color={e.chroma.color}
              similarity={e.chroma.similarity}
              smoothness={e.chroma.smoothness}
              despill={e.chroma.despill}
              style={mediaStyle(fullW, fullH, c, f, false)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function mediaStyle(fullW: number, fullH: number, c: { left: number; top: number }, f: number, hidden: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    left: -c.left * fullW * f,
    top: -c.top * fullH * f,
    width: fullW * f,
    height: fullH * f,
    maxWidth: 'none',
    objectFit: 'fill',
    // Keyed media stays mounted (it is the canvas' texture and keeps the clock in sync) but invisible
    opacity: hidden ? 0 : 1,
  }
}

/* ─── Chroma key (WebGL) ─────────────────────────────────────────── */

const VERT = `attribute vec2 p; varying vec2 uv; void main(){ uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`

// ffmpeg chromakey: mean over a 3×3 neighbourhood of the UV distance to the key, (diff - similarity) / blend.
// Pixel chroma is limited-range (as the frames ffmpeg keys); the key colour uses ffmpeg's full-range RGB_TO_U/V.
// despill (mix 0.5, expand 0): spill = g - (r + b) / 2, g -= amount × spill (blue screens: same on b).
const FRAG = `precision mediump float;
uniform sampler2D tex; uniform vec2 texel; uniform vec2 keyUV; uniform float sim; uniform float blend; uniform float spillAmt; uniform float spillType;
varying vec2 uv;
vec2 toUV(vec3 c){ c *= 255.0; return vec2(128.0 + 0.878431 * (-0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b), 128.0 + 0.878431 * (0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b)); }
void main(){
  vec4 col = texture2D(tex, uv);
  float diff = 0.0;
  for (int dy = -1; dy <= 1; dy++) { for (int dx = -1; dx <= 1; dx++) {
    vec2 d = toUV(texture2D(tex, uv + vec2(float(dx), float(dy)) * texel).rgb) - keyUV;
    diff += sqrt((d.x * d.x + d.y * d.y) / 130050.0);
  } }
  diff /= 9.0;
  float a = blend > 0.0001 ? clamp((diff - sim) / blend, 0.0, 1.0) : (diff > sim ? 1.0 : 0.0);
  vec3 rgb = col.rgb;
  if (spillType > 0.5 && spillType < 1.5) { float s = max(rgb.g - (rgb.r + rgb.b) * 0.5, 0.0); rgb.g = max(rgb.g - spillAmt * s, 0.0); }
  else if (spillType > 1.5) { float s = max(rgb.b - (rgb.r + rgb.g) * 0.5, 0.0); rgb.b = max(rgb.b - spillAmt * s, 0.0); }
  a *= col.a;
  gl_FragColor = vec4(rgb * a, a);
}`

interface ChromaProps {
  /** The sibling media element is found next to the canvas */
  source: string
  kind: 'video' | 'image'
  color: string
  similarity: number
  smoothness: number
  despill: number
  style: React.CSSProperties
}

function ChromaCanvas({ kind, color, similarity, smoothness, despill, style }: ChromaProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const params = useRef({ color, similarity, smoothness, despill })
  params.current = { color, similarity, smoothness, despill }

  useEffect(() => {
    const canvas = ref.current
    const media = canvas?.previousElementSibling as HTMLVideoElement | HTMLImageElement | null
    if (!canvas || !media) return
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true })
    if (!gl) return
    const compile = (type: number, code: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, code)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v)
    const u = (n: string) => gl.getUniformLocation(prog, n)

    let raf = 0
    const draw = () => {
      const w = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth
      const h = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight
      if (w && h && (media instanceof HTMLImageElement ? media.complete : media.readyState >= 2)) {
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
        gl.viewport(0, 0, w, h)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media)
        const { color: hex, similarity: sim, smoothness: blend, despill: amt } = params.current
        const n = parseInt(hex.slice(1), 16)
        const R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255
        gl.uniform2f(u('texel'), 1 / w, 1 / h)
        gl.uniform2f(u('keyUV'), 128 - 0.16874 * R - 0.33126 * G + 0.5 * B, 128 + 0.5 * R - 0.41869 * G - 0.08131 * B)
        gl.uniform1f(u('sim'), sim)
        gl.uniform1f(u('blend'), blend)
        gl.uniform1f(u('spillAmt'), amt)
        gl.uniform1f(u('spillType'), G > R && G > B ? 1 : B > R && B > G ? 2 : 0)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
      if (kind === 'video') raf = requestAnimationFrame(draw)
    }
    if (kind === 'image' && media instanceof HTMLImageElement && !media.complete) media.addEventListener('load', draw, { once: true })
    else draw()
    // Images redraw only when the key settings change
    const id = kind === 'image' ? window.setInterval(draw, 250) : 0
    return () => {
      // No loseContext(): a re-run of this effect (StrictMode, key change) reuses the canvas' context
      cancelAnimationFrame(raf)
      window.clearInterval(id)
      gl.deleteTexture(tex)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }, [kind])

  return <canvas ref={ref} style={style} />
}
