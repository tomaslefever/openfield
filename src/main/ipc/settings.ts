import type { IpcContext } from './context'
import { readSetting } from './helpers'

export function registerSettingsHandlers({ raw, handle }: IpcContext) {
  handle('settings:get', (_e, key: string) => readSetting(key))

  handle('settings:set', (_e, key: string, value: any) => {
    raw.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .run(key, JSON.stringify(value), Date.now())
    raw.saveSync()
    return true
  })

  handle('settings:getAll', () => {
    const rows = raw.prepare('SELECT key, value FROM settings').all() as any[]
    const result: Record<string, any> = {}
    for (const row of rows) {
      try { result[row.key] = JSON.parse(row.value) } catch { result[row.key] = row.value }
    }
    return result
  })
}
