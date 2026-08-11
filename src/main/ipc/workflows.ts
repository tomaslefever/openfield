import * as crypto from 'crypto'
import type { IpcContext } from './context'

export function registerWorkflowsHandlers({ raw, handle }: IpcContext) {
  handle('workflows:list', () => {
    return raw.prepare('SELECT * FROM workflows ORDER BY updated_at DESC').all()
  })

  handle('workflows:create', (_e, data: any) => {
    const id = crypto.randomUUID()
    const now = Date.now()
    raw.prepare('INSERT INTO workflows (id, name, description, nodes, edges, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, data.name, data.description || '', JSON.stringify(data.nodes || []), JSON.stringify(data.edges || []), now, now)
    return raw.prepare('SELECT * FROM workflows WHERE id = ?').get(id)
  })

  handle('workflows:update', (_e, id: string, data: any) => {
    const now = Date.now()
    raw.prepare('UPDATE workflows SET name = COALESCE(?, name), nodes = COALESCE(?, nodes), edges = COALESCE(?, edges), updated_at = ? WHERE id = ?')
      .run(data.name || null, data.nodes ? JSON.stringify(data.nodes) : null, data.edges ? JSON.stringify(data.edges) : null, now, id)
    return raw.prepare('SELECT * FROM workflows WHERE id = ?').get(id)
  })

  handle('workflows:delete', (_e, id: string) => {
    raw.prepare('DELETE FROM workflows WHERE id = ?').run(id)
    return true
  })
}
