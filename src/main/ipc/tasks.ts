import type { IpcContext } from './context'
import { getActiveWorkspaceId } from '../services/workspace-service'

export function registerTasksHandlers({ raw, handle }: IpcContext) {
  handle('tasks:list', () => {
    const wsId = getActiveWorkspaceId()
    return raw.prepare('SELECT * FROM tasks WHERE workspace_id = ? ORDER BY created_at DESC').all(wsId)
  })
}
