import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Film } from 'lucide-react'
import { CompositeLayer } from './CompositeLayer'
import { CompositePanel, TransformOverlay } from './CompositeEditor'
import { fileUrl } from '../../services/file-url'
import { clipDuckAt, clipEnd, clipOpacityAt, clipVolumeAt, computeDucking, usableWords, useMontageStore, type MontageClip } from '../../stores/montage-store'

/** Clips are mounted a little before they start so playback picks them up without a gap */
const PRELOAD_AHEAD = 2
const KEEP_BEHIND = 0.5
/** Allowed drift between the master clock and a playing element before it is re-seeked */
const PLAY_DRIFT = 0.25
const SCRUB_DRIFT = 0.04

const isActive = (c: MontageClip, t: number) => t >= c.start && t < clipEnd(c)

/** Keeps one media element in step with the timeline clock */
/** `gain` multiplies the clip's own volume curve (ducking) */
function syncMedia(el: HTMLMediaElement, clip: MontageClip, t: number, playing: boolean, muted: boolean, gain = 1) {
  if (!isActive(clip, t)) {
    if (!el.paused) el.pause()
    if (t < clip.start && !el.seeking && Math.abs(el.currentTime - clip.offset) > SCRUB_DRIFT) el.currentTime = clip.offset
    return
  }
  // Keyframes and fades included
  el.volume = muted ? 0 : Math.min(1, Math.max(0, clipVolumeAt(clip, t - clip.start) * gain))
  const local = clip.offset + (t - clip.start)
  if (playing) {
    if (!el.seeking && Math.abs(el.currentTime - local) > PLAY_DRIFT) el.currentTime = local
    if (el.paused) el.play().catch(() => {})
  } else {
    if (!el.paused) el.pause()
    if (!el.seeking && Math.abs(el.currentTime - local) > SCRUB_DRIFT) el.currentTime = local
  }
}

export function MontagePreview() {
  const doc = useMontageStore((s) => s.doc)
  const time = useMontageStore((s) => s.time)
  const playing = useMontageStore((s) => s.playing)
  const frameRef = useRef<HTMLDivElement>(null)
  const media = useRef(new Map<string, HTMLMediaElement>())
  const [box, setBox] = useState({ w: 0, h: 0 })

  // Fit the frame inside the available area at the montage aspect ratio
  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    const fit = () => {
      const { width, height } = el.getBoundingClientRect()
      const w = Math.min(width, height * doc.aspect)
      setBox({ w, h: w / doc.aspect })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [doc.aspect])

  const trackIndex = useMemo(() => new Map(doc.tracks.map((t, i) => [t.id, i])), [doc.tracks])
  const mutedTracks = useMemo(() => new Set(doc.tracks.filter((t) => t.muted).map((t) => t.id)), [doc.tracks])

  // Only clips near the playhead get an element; the set changes rarely, not every frame
  const windowKey = doc.clips
    .filter((c) => c.kind !== 'caption' && time >= c.start - PRELOAD_AHEAD && time < clipEnd(c) + KEEP_BEHIND)
    .map((c) => c.id)
    .join(',')
  const mounted = useMemo(() => {
    const ids = new Set(windowKey.split(','))
    return doc.clips.filter((c) => ids.has(c.id))
  }, [windowKey, doc.clips])

  const visuals = mounted
    .filter((c) => (c.kind === 'video' || c.kind === 'image') && trackIndex.has(c.trackId))
    // Earlier video tracks render on top
    .sort((a, b) => trackIndex.get(b.trackId)! - trackIndex.get(a.trackId)!)
  const audios = mounted.filter((c) => c.kind === 'audio' && trackIndex.has(c.trackId))
  const trackById = useMemo(() => new Map(doc.tracks.map((t) => [t.id, t])), [doc.tracks])
  // Derived from the voice clips, so it follows every edit (same curve as the export)
  const ducking = useMemo(() => computeDucking(doc), [doc])
  const activeCaptions = doc.clips
    .filter((c) => c.kind === 'caption' && isActive(c, time) && trackIndex.has(c.trackId))
    .sort((a, b) => trackIndex.get(a.trackId)! - trackIndex.get(b.trackId)!)
  const isSocial = (c: MontageClip) => trackById.get(c.trackId)?.captionStyle === 'social'
  // Tracks with a set height (captionY) are drawn centred there, like the export's n5\pos events
  const placed = (c: MontageClip) => trackById.get(c.trackId)?.captionY !== undefined
  const captions = activeCaptions.filter((c) => !isSocial(c) && !placed(c))
  const socialCaptions = activeCaptions.filter((c) => isSocial(c) && !placed(c))
  const placedCaptions = activeCaptions.filter(placed)

  useEffect(() => {
    for (const clip of mounted) {
      const el = media.current.get(clip.id)
      if (el) syncMedia(el, clip, time, playing, mutedTracks.has(clip.trackId), clipDuckAt(clip, trackById.get(clip.trackId), ducking.get(clip.trackId), time - clip.start))
    }
  })

  // Stop everything when leaving the page
  useEffect(() => () => { media.current.forEach((el) => el.pause()) }, [])

  const bindMedia = (id: string) => (el: HTMLMediaElement | null) => {
    if (el) media.current.set(id, el)
    else media.current.delete(id)
  }

  const empty = doc.clips.length === 0

  return (
    <div ref={frameRef} className="relative flex h-full w-full items-center justify-center">
      <CompositePanel />
      <div
        className="relative overflow-hidden rounded-[8px] bg-black"
        style={{ width: box.w, height: box.h }}
      >
        {visuals.map((clip) => (
          // Placement, crop, mask, shadow, key and blur: same geometry as the export (montage-composite.ts)
          <CompositeLayer
            key={clip.id}
            clip={clip}
            track={trackById.get(clip.trackId)}
            local={time - clip.start}
            opacity={isActive(clip, time) ? clipOpacityAt(clip, time - clip.start) : 0}
            // Earlier (higher) video tracks cover later ones, as in the export
            zIndex={doc.tracks.length - trackIndex.get(clip.trackId)!}
            boxW={box.w}
            boxH={box.h}
            aspect={doc.aspect}
            bindMedia={bindMedia(clip.id)}
          />
        ))}
        {audios.map((clip) => (
          <audio key={clip.id} ref={bindMedia(clip.id)} src={fileUrl(clip.src!)} preload="auto" />
        ))}

        {captions.length > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-1 px-[6%]"
            style={{ paddingBottom: box.h * 0.07 }}
          >
            {captions.map((c) => (
              <span
                key={c.id}
                className="max-w-full whitespace-pre-wrap text-center font-bold leading-tight tracking-wide text-white"
                style={{ fontSize: Math.max(10, box.h * 0.045), textShadow: '0 1px 2px rgb(0 0 0 / 0.7), 0 0 12px rgb(0 0 0 / 0.35)' }}
              >
                {c.text}
              </span>
            ))}
          </div>
        )}

        {socialCaptions.length > 0 && (
          // Mirrors montage-export socialStyle: 7.5% of the short side, raised 22% (portrait) / 12% (landscape)
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[101] flex flex-col items-center gap-1 px-[7%]"
            style={{ paddingBottom: box.h * (doc.aspect < 1 ? 0.22 : 0.12) }}
          >
            {socialCaptions.map((c) => (
              <SocialCaption
                key={c.id}
                clip={c}
                time={time}
                fontSize={Math.max(12, Math.min(box.w, box.h) * 0.075)}
                highlight={trackById.get(c.trackId)?.highlight !== false}
              />
            ))}
          </div>
        )}

        {placedCaptions.map((c) => {
          const track = trackById.get(c.trackId)!
          const social = track.captionStyle === 'social'
          return (
            <div
              key={c.id}
              className="pointer-events-none absolute inset-x-0 z-[100] flex -translate-y-1/2 justify-center"
              style={{ top: track.captionY! * box.h, paddingLeft: box.w * (social ? 0.07 : 0.06), paddingRight: box.w * (social ? 0.07 : 0.06) }}
            >
              {social ? (
                <SocialCaption clip={c} time={time} fontSize={Math.max(12, Math.min(box.w, box.h) * 0.075)} highlight={track.highlight !== false} />
              ) : (
                <span
                  className="max-w-full whitespace-pre-wrap text-center font-bold leading-tight tracking-wide text-white"
                  style={{ fontSize: Math.max(10, box.h * 0.045), textShadow: '0 1px 2px rgb(0 0 0 / 0.7), 0 0 12px rgb(0 0 0 / 0.35)' }}
                >
                  {c.text}
                </span>
              )}
            </div>
          )
        })}

        <TransformOverlay boxW={box.w} boxH={box.h} />

        {empty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/40">
            <Film size={32} strokeWidth={1.5} />
            <p className="text-xs">Arrastra clips desde la biblioteca al timeline</p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Large uppercase caption; the word being spoken is lit when the clip has word timings */
function SocialCaption({ clip, time, fontSize, highlight }: { clip: MontageClip; time: number; fontSize: number; highlight: boolean }) {
  const words = highlight ? usableWords(clip) : null
  let active = -1
  if (words) words.forEach((w, i) => { if (clip.start + w.start <= time) active = i })
  const outline = Math.max(2, fontSize * 0.09)
  return (
    <span
      className="max-w-full whitespace-pre-wrap text-center font-[Arial,sans-serif] font-black uppercase leading-[1.1] text-white"
      style={{
        fontSize,
        WebkitTextStroke: `${outline * 2}px black`,
        paintOrder: 'stroke fill',
        textShadow: `0 ${fontSize * 0.03}px ${fontSize * 0.03}px rgb(0 0 0 / 0.5)`,
      }}
    >
      {words
        ? words.map((w, i) => (
            <span key={i} style={i === active ? { color: '#FFE14D' } : undefined}>
              {i > 0 ? ' ' : ''}{w.text}
            </span>
          ))
        : clip.text}
    </span>
  )
}
