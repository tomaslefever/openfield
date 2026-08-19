import * as crypto from 'crypto'
import type { IpcContext } from './context'
import { getActiveWorkspaceId } from '../services/workspace-service'

function rowToPrompt(row: any) {
  return {
    ...row,
    refs: undefined,
    references: (() => { try { return row.refs ? JSON.parse(row.refs) : [] } catch { return [] } })(),
    tags: (() => { try { return row.tags ? JSON.parse(row.tags) : [] } catch { return [] } })(),
  }
}

export function registerPromptsHandlers({ raw, handle }: IpcContext) {
  handle('prompts:list', () => {
    const wsId = getActiveWorkspaceId()
    const rows = raw.prepare('SELECT * FROM prompts WHERE workspace_id = ? ORDER BY updated_at DESC').all(wsId) as any[]
    return rows.map(rowToPrompt)
  })

  handle('prompts:create', (_e, data: any) => {
    const id = crypto.randomUUID()
    const now = Date.now()
    const wsId = getActiveWorkspaceId()
    raw.prepare(
      'INSERT INTO prompts (id, workspace_id, name, prompt, kind, refs, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, wsId, data.name || 'Untitled', data.prompt || '', data.kind || 'image',
      JSON.stringify(data.references || []), JSON.stringify(data.tags || []), now, now)
    return rowToPrompt(raw.prepare('SELECT * FROM prompts WHERE id = ?').get(id))
  })

  handle('prompts:update', (_e, id: string, data: any) => {
    const now = Date.now()
    const sets: string[] = ['updated_at = ?']
    const vals: any[] = [now]
    const map: Record<string, string> = { name: 'name', prompt: 'prompt', kind: 'kind' }
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) { sets.push(`${col} = ?`); vals.push(data[key]) }
    }
    if (data.references !== undefined) { sets.push('refs = ?'); vals.push(JSON.stringify(data.references)) }
    if (data.tags !== undefined) { sets.push('tags = ?'); vals.push(JSON.stringify(data.tags)) }
    vals.push(id)
    raw.prepare(`UPDATE prompts SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return rowToPrompt(raw.prepare('SELECT * FROM prompts WHERE id = ?').get(id))
  })

  handle('prompts:delete', (_e, id: string) => {
    raw.prepare('DELETE FROM prompts WHERE id = ?').run(id)
    return true
  })
}
