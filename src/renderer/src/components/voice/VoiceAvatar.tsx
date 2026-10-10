// Deterministic gradient orb per voice so the same voice reads the same
// everywhere (composer chip, history rows, player).
function hueOf(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % 360
}

export function VoiceAvatar({ seed, name, size = 20, className = '' }: {
  seed: string
  name?: string
  size?: number
  className?: string
}) {
  const hue = hueOf(seed || name || '?')
  const initial = (name || seed || '?').trim().charAt(0).toUpperCase()
  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-full flex-shrink-0 font-semibold text-white/95 ring-1 ring-white/15 select-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, Math.round(size * 0.42)),
        background: `radial-gradient(circle at 30% 25%, hsl(${hue} 85% 72%), hsl(${(hue + 40) % 360} 70% 48%) 55%, hsl(${(hue + 80) % 360} 65% 30%))`,
      }}
    >
      {size >= 16 ? initial : null}
    </span>
  )
}
