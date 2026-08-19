import { useRef } from 'react'

// FLIP helper for asset grids: captures card positions, then after an in-place
// removal animates the remaining cards from their old spots to the new layout.
export function useGridFlip() {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const positionsRef = useRef<Map<string, DOMRect>>(new Map())

  const getCards = () => {
    const els = gridRef.current?.querySelectorAll<HTMLElement>('[data-asset-card]')
    return els ? Array.from(els) : []
  }

  const capture = () => {
    positionsRef.current.clear()
    for (const el of getCards()) {
      const id = el.dataset.assetCard
      if (id) positionsRef.current.set(id, el.getBoundingClientRect())
    }
  }

  const fadeOut = (ids: string[]) => {
    const idSet = new Set(ids)
    for (const el of getCards()) {
      if (el.dataset.assetCard && idSet.has(el.dataset.assetCard)) {
        el.animate(
          [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.9)' }],
          { duration: 180, easing: 'ease', fill: 'forwards' }
        )
      }
    }
  }

  const animate = () => {
    for (const el of getCards()) {
      const id = el.dataset.assetCard
      if (!id) continue
      const prev = positionsRef.current.get(id)
      if (!prev) continue
      const now = el.getBoundingClientRect()
      const dx = prev.left - now.left
      const dy = prev.top - now.top
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
        )
      }
    }
  }

  return { gridRef, capture, fadeOut, animate }
}
