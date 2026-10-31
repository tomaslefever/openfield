import { useEffect } from 'react'
import { docDuration, useMontageStore } from '../../stores/montage-store'

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

/** Space, S, T, Delete, arrows, Home/End and undo/redo while the montage page is open */
export function useMontageShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const s = useMontageStore.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && key === 'y') { e.preventDefault(); s.redo(); return }
      if (mod) return
      if (e.key === ' ') { e.preventDefault(); s.togglePlay() }
      else if (key === 's') s.splitAtPlayhead()
      else if (key === 't') s.addCaption()
      else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedClipId) s.removeClip(s.selectedClipId)
      else if (e.key === 'ArrowLeft') { e.preventDefault(); s.pause(); s.setTime(s.time - (e.shiftKey ? 1 : 1 / 30)) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); s.pause(); s.setTime(s.time + (e.shiftKey ? 1 : 1 / 30)) }
      else if (e.key === 'Home') s.setTime(0)
      else if (e.key === 'End') s.setTime(docDuration(s.doc))
      else if (e.key === 'Escape') s.select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
