import { useSyncExternalStore } from 'react'

/**
 * Light / dark theme. The preference lives in the `theme` setting; a copy in localStorage lets
 * the inline script in index.html set the `.dark` class before first paint (no flash).
 */
export type ThemePreference = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'openfield-theme'
const listeners = new Set<(pref: ThemePreference) => void>()
let current: ThemePreference = 'dark'

function normalize(value: unknown): ThemePreference {
  return value === 'light' || value === 'system' ? value : 'dark'
}

const systemQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)')

export function resolveTheme(pref: ThemePreference): 'dark' | 'light' {
  if (pref === 'system') return systemQuery()?.matches ? 'dark' : 'light'
  return pref
}

function apply(pref: ThemePreference) {
  current = pref
  const root = document.documentElement
  const dark = resolveTheme(pref) === 'dark'
  if (root.classList.contains('dark') !== dark) {
    // Switch in one frame: without this every `transition-colors` element animates at its own pace
    root.classList.add('theme-switching')
    root.classList.toggle('dark', dark)
    void root.offsetHeight
    requestAnimationFrame(() => root.classList.remove('theme-switching'))
  }
  try { localStorage.setItem(STORAGE_KEY, pref) } catch {}
  listeners.forEach((fn) => fn(pref))
}

export function getThemePreference(): ThemePreference {
  return current
}

/** Applies and persists a preference (main process syncs native chrome on `settings:set`). */
export async function setThemePreference(pref: ThemePreference) {
  apply(pref)
  try { await (window as any).electronAPI?.settings.set('theme', pref) } catch {}
}

export function onThemeChange(fn: (pref: ThemePreference) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The theme actually rendered ('dark' | 'light'), for components that take a theme prop */
export function useResolvedTheme(): 'dark' | 'light' {
  return useSyncExternalStore(
    (cb) => onThemeChange(cb),
    () => resolveTheme(current),
  )
}

/** Call once at startup: cached preference first, then reconcile with the stored setting. */
export function initTheme() {
  let cached: string | null = null
  try { cached = localStorage.getItem(STORAGE_KEY) } catch {}
  apply(normalize(cached))

  systemQuery()?.addEventListener?.('change', () => {
    if (current === 'system') apply('system')
  })

  ;(window as any).electronAPI?.settings.get?.('theme')
    .then((stored: unknown) => {
      if (stored != null && normalize(stored) !== current) apply(normalize(stored))
    })
    .catch(() => {})
}
