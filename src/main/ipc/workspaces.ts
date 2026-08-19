import type { IpcContext } from './context'
import {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  updateWorkspaceConfig,
  getActiveWorkspaceId,
  getDefaultWorkspaceId,
  setActiveWorkspaceId,
} from '../services/workspace-service'

export function registerWorkspacesHandlers({ handle }: IpcContext) {
  handle('workspaces:list', () => listWorkspaces())

  handle('workspaces:get', (_e, id: string) => getWorkspace(id))

  handle('workspaces:getActive', () => getActiveWorkspaceId())

  handle('workspaces:getDefault', () => getDefaultWorkspaceId())

  handle('workspaces:setActive', (_e, id: string) => {
    setActiveWorkspaceId(id)
    return getActiveWorkspaceId()
  })

  handle('workspaces:create', (_e, name: string, color?: string) => createWorkspace(name, color))

  handle('workspaces:rename', (_e, id: string, name: string) => renameWorkspace(id, name))

  handle('workspaces:updateConfig', (_e, id: string, config: any) => updateWorkspaceConfig(id, config))

  handle('workspaces:duplicate', (_e, id: string) => duplicateWorkspace(id))

  handle('workspaces:delete', (_e, id: string) => deleteWorkspace(id))
}
