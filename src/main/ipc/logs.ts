import type { IpcContext } from './context'

export function registerLogsHandlers({ raw, handle }: IpcContext) {
  handle('logs:list', (_e, taskId?: string) => {
    if (taskId) {
      return raw.prepare('SELECT * FROM run_logs WHERE task_id = ? ORDER BY created_at ASC').all(taskId)
    }
    return raw.prepare('SELECT * FROM run_logs ORDER BY created_at DESC LIMIT 100').all()
  })

  handle('logs:clear', () => {
    raw.prepare('DELETE FROM run_logs').run()
    return true
  })
}
