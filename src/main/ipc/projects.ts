import * as crypto from 'crypto'
import type { IpcContext } from './context'
import { getActiveWorkspaceId } from '../services/workspace-service'

export function registerProjectsHandlers({ raw, handle }: IpcContext) {
  handle('projects:list', () => {
    const wsId = getActiveWorkspaceId()
    return raw.prepare('SELECT * FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC').all(wsId)
  })

  handle('projects:get', (_e, id: string) => {
    return raw.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  })

  handle('projects:create', (_e, name: string) => {
    const id = crypto.randomUUID()
    const now = Date.now()
    const wsId = getActiveWorkspaceId()
    const timelineData = JSON.stringify({
      tracks: [
        { id: 'track-video-1', type: 'video', clips: [], locked: false, visible: true, muted: false },
        { id: 'track-audio-1', type: 'audio', clips: [], locked: false, visible: true, muted: false },
      ],
      duration: 0, fps: 30, width: 1920, height: 1080,
    })
    raw.prepare('INSERT INTO projects (id, name, timeline_data, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, timelineData, wsId, now, now)
    return raw.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  })

  handle('projects:update', (_e, id: string, data: any) => {
    const now = Date.now()
    raw.prepare('UPDATE projects SET name = COALESCE(?, name), timeline_data = COALESCE(?, timeline_data), updated_at = ? WHERE id = ?')
      .run(data.name || null, data.timelineData ? JSON.stringify(data.timelineData) : null, now, id)
    return raw.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  })

  handle('projects:delete', (_e, id: string) => {
    raw.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return true
  })
}
