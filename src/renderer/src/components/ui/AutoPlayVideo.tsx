import { useRef, useState, useEffect } from 'react'

interface AutoPlayVideoProps {
  src?: string
  className?: string
  poster?: string
}

export function AutoPlayVideo({ src, className, poster }: AutoPlayVideoProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const v = ref.current
    if (!v || !src) return
    let cancelled = false
    v.muted = false
    setMuted(false)

    const tryPlay = () => {
      try {
        const p = v.play()
        if (p !== undefined) {
          p.catch(() => {
            if (cancelled) return
            // Autoplay with sound blocked: fall back to muted autoplay
            v.muted = true
            setMuted(true)
            v.play().catch(() => { /* still blocked, user can press play */ })
          })
        }
      } catch { /* no-op */ }
    }

    if (v.readyState >= 2) {
      tryPlay()
    } else {
      v.addEventListener('loadeddata', tryPlay, { once: true })
    }
    return () => { cancelled = true }
  }, [src])

  if (!src) return null

  return (
    <video
      ref={ref}
      key={src}
      src={src}
      poster={poster}
      className={className}
      controls
      autoPlay
      playsInline
      preload="auto"
      muted={muted}
    />
  )
}
