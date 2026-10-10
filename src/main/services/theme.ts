import { BrowserWindow, nativeTheme } from 'electron'

export type ThemePreference = 'dark' | 'light' | 'system'

// Match the renderer canvas (`--canvas` in index.css) so no flash shows before first paint
const CANVAS = { dark: '#0e0e0e', light: '#ffffff' }

export function normalizeTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'system' ? value : 'dark'
}

/** Native controls, scrollbars and `prefers-color-scheme` follow the app theme */
export function applyNativeTheme(pref: ThemePreference) {
  nativeTheme.themeSource = pref
  const bg = windowBackground()
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.setBackgroundColor(bg) } catch {}
  }
}

export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? CANVAS.dark : CANVAS.light
}
