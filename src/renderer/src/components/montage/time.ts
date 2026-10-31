/** 1:05.32 (or 1:05 without hundredths) */
export function formatClock(seconds: number, fraction = true): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const base = `${m}:${sec.toString().padStart(2, '0')}`
  if (!fraction) return base
  return `${base}.${Math.floor((s % 1) * 100).toString().padStart(2, '0')}`
}

/** Ruler label: 00:05 (00:05.5 when ticks are sub-second) */
export function formatRuler(seconds: number, fraction: boolean): string {
  const m = Math.floor(seconds / 60)
  const sec = seconds % 60
  const whole = Math.floor(sec).toString().padStart(2, '0')
  const frac = fraction && sec % 1 ? `.${Math.round((sec % 1) * 100).toString().padStart(2, '0').replace(/0$/, '')}` : ''
  return `${m.toString().padStart(2, '0')}:${whole}${frac}`
}

const RULER_STEPS = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]

/** Smallest ruler step that keeps labels at least `minPx` apart */
export function rulerStep(pxPerSec: number, minPx = 72): number {
  return RULER_STEPS.find((s) => s * pxPerSec >= minPx) ?? RULER_STEPS[RULER_STEPS.length - 1]
}
