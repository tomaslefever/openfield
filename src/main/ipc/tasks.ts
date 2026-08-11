import type { IpcContext } from './context'

export function registerTasksHandlers({ raw, handle }: IpcContext) {
  handle('tasks:list', () => {
    return raw.prepare('SELECT * FROM openfield_tasks ORDER BY created_at DESC').all()
  })
}
