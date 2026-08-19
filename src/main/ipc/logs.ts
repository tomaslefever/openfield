import type { IpcContext } from './context'
import { getActiveWorkspaceId } from '../services/workspace-service'

export function registerLogsHandlers({ raw, handle }: IpcContext) {
  handle('logs:list', (_e, taskId?: string) => {
    const wsId = getActiveWorkspaceId()
    if (taskId) {
      return raw.prepare('SELECT * FROM run_logs WHERE task_id = ? ORDER BY created_at ASC').all(taskId)
    }
    return raw.prepare('SELECT * FROM run_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100').all(wsId)
  })

  handle('logs:clear', () => {
    const wsId = getActiveWorkspaceId()
    raw.prepare('DELETE FROM run_logs WHERE workspace_id = ?').run(wsId)
    return true
  })
}
