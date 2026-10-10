import * as React from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Hover popover anchored to an element, always inside the viewport: rendered in a portal (so
 * scrolling/overflow containers cannot clip it) with fixed coordinates clamped to the window edges.
 * Opens above the anchor and flips below when there is no room; re-places itself when its
 * content resizes (images/videos load after mount) or the window scrolls/resizes.
 */
export function ViewportPopover({ anchor, children, className }: { anchor: HTMLElement | null; children: React.ReactNode; className?: string }) {
  const popRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const pop = popRef.current
    if (!anchor || !pop) return
    const place = () => {
      const M = 8
      const a = anchor.getBoundingClientRect()
      const p = pop.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const left = Math.min(Math.max(a.left, M), Math.max(M, vw - p.width - M))
      let top = a.top - p.height - M
      if (top < M) top = a.bottom + M
      top = Math.min(Math.max(top, M), Math.max(M, vh - p.height - M))
      setPos({ left, top })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(pop)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={popRef}
      className={`fixed z-[1000] popover-surface rounded-xl pointer-events-none ${className ?? 'p-1.5'}`}
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? 'visible' : 'hidden',
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: 'calc(100vh - 16px)',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
