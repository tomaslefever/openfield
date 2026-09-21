import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import { getRawDb, getAssetsDir, getWorkspacesDir, getWorkspaceAssetSubDir } from '../db'

export interface WorkspaceStats {
  totalAssets: number
  images: number
  videos: number
  audio: number
}

export interface Workspace {
  id: string
  name: string
  color: string
  config: Record<string, any>
  isArchived: boolean
  createdAt: number
  updatedAt: number
  stats?: WorkspaceStats
  lastImageUrl?: string
}

function rowToWorkspace(row: any): Workspace {
  let config: Record<string, any> = {}
  try { config = row.config ? JSON.parse(row.config) : {} } catch { config = {} }
  return {
    id: row.id,
    name: row.name,
    color: row.color || '#6366f1',
    config,
    isArchived: !!(row.isArchived ?? row.is_archived),
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  }
}

export function getDefaultWorkspaceId(): string {
  const raw = getRawDb()
  const row = raw.prepare("SELECT value FROM settings WHERE key = 'defaultWorkspaceId'").get() as any
  if (row?.value) {
    try {
      const v = JSON.parse(row.value)
      if (typeof v === 'string' && v) return v
    } catch {
      if (typeof row.value === 'string' && row.value) return row.value
    }
  }
  const ws = raw.prepare('SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1').get() as any
  return ws?.id || ''
}

export function getActiveWorkspaceId(): string {
  const raw = getRawDb()
  const row = raw.prepare("SELECT value FROM settings WHERE key = 'activeWorkspaceId'").get() as any
  let id = ''
  if (row?.value) {
    try { id = JSON.parse(row.value) } catch { id = row.value }
  }
  if (id) {
    const exists = raw.prepare('SELECT id FROM workspaces WHERE id = ?').get(id)
    if (exists) return id
  }
  return getDefaultWorkspaceId()
}

export function setActiveWorkspaceId(id: string) {
  const raw = getRawDb()
  raw.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES ('activeWorkspaceId', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).run(JSON.stringify(id), Date.now())
  raw.save()
}

export function isDefaultWorkspace(id: string): boolean {
  return id === getDefaultWorkspaceId()
}

export function workspaceAssetsDir(workspaceId?: string): string {
  const id = workspaceId || getActiveWorkspaceId()
  // The default workspace keeps the legacy global assets dir so existing
  // files don't need to be moved. New workspaces get their own folder.
  if (isDefaultWorkspace(id)) return getAssetsDir()
  return path.join(getWorkspacesDir(), id, 'assets').replace(/\\/g, '/')
}

export function workspaceAssetSubDir(type: 'image' | 'video' | 'audio', workspaceId?: string): string {
  const id = workspaceId || getActiveWorkspaceId()
  return getWorkspaceAssetSubDir(id, isDefaultWorkspace(id), type)
}

export async function ensureWorkspaceDirs(workspaceId?: string) {
  const id = workspaceId || getActiveWorkspaceId()
  const assets = workspaceAssetsDir(id)
  for (const sub of ['images', 'videos', 'audio']) {
    await fs.mkdir(path.join(assets, sub), { recursive: true }).catch(() => {})
  }
}

export function getWorkspaceStatsMap(): Record<string, WorkspaceStats> {
  const raw = getRawDb()
  const statsMap: Record<string, WorkspaceStats> = {}
  try {
    const rows = raw.prepare(`
      SELECT 
        workspace_id,
        COUNT(*) as total,
        SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END) as images,
        SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END) as videos,
        SUM(CASE WHEN type = 'audio' THEN 1 ELSE 0 END) as audio
      FROM assets 
      WHERE (model_used IS NULL OR (model_used != 'upload' AND model_used != 'ref'))
      GROUP BY workspace_id
    `).all() as any[]

    for (const r of rows) {
      const wid = r.workspaceId || r.workspace_id
      if (wid) {
        statsMap[wid] = {
          totalAssets: Number(r.total) || 0,
          images: Number(r.images) || 0,
          videos: Number(r.videos) || 0,
          audio: Number(r.audio) || 0,
        }
      }
    }
  } catch (err) {
    console.warn('[WorkspaceService] Failed to load workspace stats:', err)
  }
  return statsMap
}

export function getWorkspaceLastImageMap(): Record<string, string> {
  const raw = getRawDb()
  const imageMap: Record<string, string> = {}
  try {
    const rows = raw.prepare(`
      SELECT workspace_id, local_path, file_path
      FROM (
        SELECT 
          workspace_id, 
          local_path, 
          file_path,
          ROW_NUMBER() OVER (
            PARTITION BY workspace_id 
            ORDER BY created_at DESC
          ) as rn
        FROM assets
        WHERE (type = 'image' OR (local_path IS NOT NULL AND (local_path LIKE '%.webp' OR local_path LIKE '%.png' OR local_path LIKE '%.jpg' OR local_path LIKE '%.jpeg')))
          AND (
            (local_path IS NOT NULL AND local_path != '')
            OR (file_path IS NOT NULL AND file_path != '' AND file_path NOT LIKE '__error__%')
          )
      )
      WHERE rn = 1
    `).all() as any[]

    for (const r of rows) {
      const wid = r.workspaceId || r.workspace_id
      const p = r.localPath || r.local_path || r.filePath || r.file_path
      if (wid && p) {
        imageMap[wid] = p
      }
    }

    // Fallback: check drama_shots for any workspace still missing an image
    const dramaRows = raw.prepare(`
      SELECT dp.workspace_id, ds.keyframe_url
      FROM drama_shots ds
      JOIN drama_projects dp ON ds.project_id = dp.id
      WHERE dp.workspace_id IS NOT NULL 
        AND ds.keyframe_url IS NOT NULL 
        AND ds.keyframe_url != ''
      ORDER BY ds.created_at DESC
    `).all() as any[]
    for (const dr of dramaRows) {
      const wid = dr.workspaceId || dr.workspace_id
      const url = dr.keyframeUrl || dr.keyframe_url
      if (wid && url && !imageMap[wid]) {
        imageMap[wid] = url
      }
    }
  } catch (err) {
    console.warn('[WorkspaceService] Failed to load workspace images:', err)
  }
  return imageMap
}

export function listWorkspaces(): Workspace[] {
  const raw = getRawDb()
  const rows = raw.prepare('SELECT * FROM workspaces ORDER BY created_at ASC').all() as any[]
  const statsMap = getWorkspaceStatsMap()
  const imageMap = getWorkspaceLastImageMap()
  return rows.map((r) => {
    const ws = rowToWorkspace(r)
    ws.stats = statsMap[ws.id] || { totalAssets: 0, images: 0, videos: 0, audio: 0 }
    ws.lastImageUrl = imageMap[ws.id] || undefined
    return ws
  })
}

export function getWorkspace(id: string): Workspace | null {
  const row = getRawDb().prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as any
  if (!row) return null
  const ws = rowToWorkspace(row)
  const statsMap = getWorkspaceStatsMap()
  const imageMap = getWorkspaceLastImageMap()
  ws.stats = statsMap[ws.id] || { totalAssets: 0, images: 0, videos: 0, audio: 0 }
  ws.lastImageUrl = imageMap[ws.id] || undefined
  return ws
}

export function createWorkspace(name: string, color?: string): Workspace {
  const raw = getRawDb()
  const id = crypto.randomUUID()
  const now = Date.now()
  raw.prepare(
    'INSERT INTO workspaces (id, name, color, config, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name || 'Untitled Project', color || '#6366f1', '{}', 0, now, now)
  raw.save()
  return getWorkspace(id)!
}

export function renameWorkspace(id: string, name: string): Workspace | null {
  const raw = getRawDb()
  raw.prepare('UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), id)
  raw.save()
  return getWorkspace(id)
}

export function updateWorkspaceConfig(id: string, config: Record<string, any>): Workspace | null {
  const raw = getRawDb()
  const existing = getWorkspace(id)
  const merged = { ...(existing?.config || {}), ...config }
  raw.prepare('UPDATE workspaces SET config = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(merged), Date.now(), id)
  raw.save()
  return getWorkspace(id)
}

export function updateWorkspaceColor(id: string, color: string): Workspace | null {
  const raw = getRawDb()
  raw.prepare('UPDATE workspaces SET color = ?, updated_at = ? WHERE id = ?').run(color, Date.now(), id)
  raw.save()
  return getWorkspace(id)
}

export function duplicateWorkspace(id: string): Workspace | null {
  const src = getWorkspace(id)
  if (!src) return null
  const copy = createWorkspace(`${src.name} (copy)`, src.color)
  updateWorkspaceConfig(copy.id, src.config)
  return getWorkspace(copy.id)
}

const WORKSPACE_SCOPED_TABLES = [
  'assets', 'elements', 'storyboards', 'workflows', 'projects',
  'openfield_tasks', 'replicate_tasks', 'fal_tasks', 'run_logs', 'prompts',
]

export async function deleteWorkspace(id: string): Promise<{ ok: boolean; error?: string }> {
  const raw = getRawDb()
  const all = listWorkspaces()
  if (all.length <= 1) return { ok: false, error: 'Cannot delete the last workspace' }
  const ws = getWorkspace(id)
  if (!ws) return { ok: false, error: 'Workspace not found' }

  // Remove asset files owned by this workspace
  try {
    const rows = raw.prepare('SELECT file_path, local_path FROM assets WHERE workspace_id = ?').all(id) as any[]
    for (const r of rows) {
      const p = r.localPath || (r.filePath && !String(r.filePath).startsWith('http') && !String(r.filePath).startsWith('__error__') ? r.filePath : null)
      if (p) await fs.unlink(p).catch(() => {})
    }
  } catch {}

  // Delete rows in dependency-safe order
  const storyboardIds = raw.prepare('SELECT id FROM storyboards WHERE workspace_id = ?').all(id) as any[]
  for (const sb of storyboardIds) {
    raw.prepare('DELETE FROM storyboard_transitions WHERE storyboard_id = ?').run(sb.id)
    raw.prepare('DELETE FROM storyboard_scenes WHERE storyboard_id = ?').run(sb.id)
  }
  for (const table of WORKSPACE_SCOPED_TABLES) {
    raw.prepare(`DELETE FROM ${table} WHERE workspace_id = ?`).run(id)
  }

  // Remove workspace folder (only for non-default workspaces; the default
  // workspace shares the legacy global assets dir and must never be removed)
  if (!isDefaultWorkspace(id)) {
    const dir = path.join(getWorkspacesDir(), id)
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }

  // Delete the workspace row itself
  raw.prepare('DELETE FROM workspaces WHERE id = ?').run(id)

  // If the deleted workspace was the default, promote the oldest remaining one
  if (getDefaultWorkspaceId() === id) {
    const next = raw.prepare('SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1').get() as any
    if (next?.id) {
      raw.prepare(
        "INSERT INTO settings (key, value, updated_at) VALUES ('defaultWorkspaceId', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      ).run(JSON.stringify(next.id), Date.now())
    }
  }

  // Reset active to the (possibly new) default if the deleted one was active
  if (getActiveWorkspaceId() === id) {
    setActiveWorkspaceId(getDefaultWorkspaceId())
  }

  raw.save()
  return { ok: true }
}

// Task → workspace lookup with cache, used to tag run_logs on tasks started
// before the active workspace was switched.
const taskWorkspaceCache = new Map<string, string>()

export function getTaskWorkspace(taskId: string): string {
  if (taskWorkspaceCache.has(taskId)) return taskWorkspaceCache.get(taskId)!
  const raw = getRawDb()
  let wsId = ''
  for (const table of ['openfield_tasks', 'fal_tasks', 'replicate_tasks', 'machgen_tasks', 'higgsfield_tasks']) {
    try {
      const row = raw.prepare(`SELECT workspace_id FROM ${table} WHERE task_id = ?`).get(taskId) as any
      if (row?.workspace_id) { wsId = row.workspace_id; break }
    } catch {}
  }
  if (!wsId) wsId = getActiveWorkspaceId()
  taskWorkspaceCache.set(taskId, wsId)
  return wsId
}
