import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Minus, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RestartToUpdateButton } from './RestartToUpdateButton'

/*
 * Custom window title bar. The native caption is hidden from the main process
 * (`titleBarStyle: 'hidden'`), so this bar owns window dragging and, on Windows/Linux,
 * the minimize/maximize/close buttons. macOS keeps its traffic lights on the left.
 *
 * Any page can put controls into the bar with <TitleBarSlot side="start|center|end">.
 */

type SlotSide = 'start' | 'center' | 'end'

const slots: Record<SlotSide, HTMLElement | null> = { start: null, center: null, end: null }
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function registerSlot(side: SlotSide) {
  return (el: HTMLElement | null) => {
    if (slots[side] === el) return
    slots[side] = el
    listeners.forEach((l) => l())
  }
}

const slotRefs: Record<SlotSide, (el: HTMLElement | null) => void> = {
  start: registerSlot('start'),
  center: registerSlot('center'),
  end: registerSlot('end'),
}

/** Renders its children inside the title bar while mounted. Children are clickable (no-drag). */
export function TitleBarSlot({ side = 'start', children }: { side?: SlotSide; children: React.ReactNode }) {
  const target = useSyncExternalStore(subscribe, () => slots[side])
  if (!target) return null
  return createPortal(<div className="app-no-drag flex items-center gap-1">{children}</div>, target)
}

const api = () => (window as any).electronAPI?.window

export function TitleBar() {
  const platform: string = api()?.platform ?? 'win32'
  const isMac = platform === 'darwin'
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (isMac) return
    api()?.isMaximized?.().then((v: boolean) => setMaximized(!!v)).catch(() => {})
    return (window as any).electronAPI?.on?.('window:maximized', (v: boolean) => setMaximized(!!v))
  }, [isMac])

  return (
    <header
      className={cn(
        'app-drag relative z-40 flex h-[--titlebar-height] shrink-0 select-none items-center',
        'border-b border-hairline bg-surface-950 text-ink-muted',
        isMac ? 'pl-[78px]' : 'pl-3',
      )}
      onDoubleClick={isMac ? () => api()?.maximize?.() : undefined}
    >
      {!isMac && (
        <span className="mr-3 flex items-center gap-2 text-[12px] font-medium text-ink">
          <img src="./favicon.png" alt="" className="size-4" draggable={false} />
          Openfield
        </span>
      )}

      <div ref={slotRefs.start} className="flex min-w-0 items-center gap-1" />
      <div ref={slotRefs.center} className="flex min-w-0 flex-1 items-center justify-center gap-1" />
      <div ref={slotRefs.end} className="flex min-w-0 items-center gap-1" />
      <div className="flex items-center pl-1 pr-2">
        <RestartToUpdateButton />
      </div>

      {!isMac && (
        <div className="app-no-drag flex h-full items-stretch">
          <WindowButton label="Minimize" onClick={() => api()?.minimize?.()}>
            <Minus size={15} strokeWidth={1.25} />
          </WindowButton>
          <WindowButton label={maximized ? 'Restore' : 'Maximize'} onClick={() => api()?.maximize?.()}>
            {maximized
              ? <Copy size={12} strokeWidth={1.25} className="-scale-x-100" />
              : <Square size={11} strokeWidth={1.25} />}
          </WindowButton>
          <WindowButton label="Close" onClick={() => api()?.close?.()} danger>
            <X size={16} strokeWidth={1.25} />
          </WindowButton>
        </div>
      )}
    </header>
  )
}

function WindowButton({ label, onClick, danger, children }: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex w-[46px] items-center justify-center text-ink-muted transition-colors',
        danger ? 'hover:bg-[#e81123] hover:text-white' : 'hover:bg-surface-800 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
