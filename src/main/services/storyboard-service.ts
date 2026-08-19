import * as crypto from 'crypto'
import { getRawDb } from '../db'
import { requireApiKey } from '../ipc/helpers'
import { getTaskQueue } from './task-queue'
import { getActiveWorkspaceId } from './workspace-service'

export interface StoryboardStyle {
  id: string
  name: string
  description: string
  suffix: string
}

export const STORYBOARD_STYLES: StoryboardStyle[] = [
  {
    id: '3d-animation',
    name: '3D Animation',
    description: 'Render 3D estilo Pixar/DreamWorks',
    suffix: '3D animation style, Pixar-like render, soft studio lighting, volumetric depth, polished surfaces, high detail',
  },
  {
    id: 'realistic',
    name: 'Realistic',
    description: 'Fotorrealismo cinematográfico',
    suffix: 'photorealistic, cinematic realism, natural lighting, shallow depth of field, high detail, 8K',
  },
  {
    id: 'charcoal',
    name: 'Charcoal',
    description: 'Carboncillo expresivo en blanco y negro',
    suffix: 'charcoal sketch style, hand-drawn charcoal texture, black and white, expressive strokes, grainy paper',
  },
  {
    id: 'claymation',
    name: 'Claymation',
    description: 'Stop-motion con figuras de plastilina',
    suffix: 'claymation style, stop-motion clay figures, tactile plasticine textures, warm studio lighting',
  },
  {
    id: 'concept-sketch',
    name: 'Concept Sketch',
    description: 'Arte conceptual con línea y mancha',
    suffix: 'concept art sketch, rough pencil and ink linework, cinematic composition, artist study, loose rendering',
  },
  {
    id: 'anime',
    name: 'Anime',
    description: 'Estilo anime con cel shading',
    suffix: 'anime style, cel shading, vibrant colors, dynamic composition, studio quality, detailed lineart',
  },
]

export function getStyle(id: string): StoryboardStyle | null {
  return STORYBOARD_STYLES.find(s => s.id === id) || null
}

export function styleSuffix(style: string): string {
  if (!style) return ''
  const preset = getStyle(style)
  return preset ? preset.suffix : style.trim()
}

export function applyStyle(prompt: string, style: string): string {
  if (!prompt?.trim()) return prompt
  const suffix = styleSuffix(style)
  if (!suffix) return prompt
  if (prompt.toLowerCase().includes(suffix.toLowerCase())) return prompt
  return `${prompt.replace(/\s+$/, '')}, ${suffix}`
}

function readSetting(key: string): any {
  try {
    const row = getRawDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
    if (!row || !row.value) return null
    try { return JSON.parse(row.value) } catch { return row.value }
  } catch { return null }
}

export function getBridgePort(): number {
  const p = readSetting('bridgePort')
  return typeof p === 'number' && p > 0 ? p : 19877
}

export function isBridgeEnabled(): boolean {
  const v = readSetting('enableBridge')
  return v === true || v === 'true' || v === null
}

// ─── Boards ────────────────────────────────────────────────

export function listBoards(workspaceId?: string): any[] {
  const raw = getRawDb()
  const wsId = workspaceId || getActiveWorkspaceId()
  const boards = raw.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM storyboard_scenes sc WHERE sc.storyboard_id = s.id) AS sceneCount,
      COALESCE(
        (SELECT a.local_path FROM storyboard_scenes sc2
         JOIN assets a ON a.id = sc2.image_asset_id AND a.local_path IS NOT NULL
         WHERE sc2.storyboard_id = s.id ORDER BY sc2."order" ASC LIMIT 1),
        (SELECT a2.file_path FROM storyboard_scenes sc3
         JOIN assets a2 ON a2.id = sc3.image_asset_id AND a2.file_path IS NOT NULL
         WHERE sc3.storyboard_id = s.id ORDER BY sc3."order" ASC LIMIT 1)
      ) AS thumbnailPath
    FROM storyboards s
    WHERE s.workspace_id = ?
    ORDER BY s.updated_at DESC
  `).all(wsId) as any[]
  return boards.map(b => ({
    ...b,
    sceneCount: b.sceneCount ?? 0,
    thumbnailPath: b.thumbnailPath || null,
  }))
}

export function getBoard(id: string): any {
  const raw = getRawDb()
  const board = raw.prepare('SELECT * FROM storyboards WHERE id = ?').get(id)
  if (!board) throw new Error(`Storyboard ${id} not found`)
  const scenes = raw.prepare('SELECT * FROM storyboard_scenes WHERE storyboard_id = ? ORDER BY "order" ASC').all(id)
  const transitions = raw.prepare('SELECT * FROM storyboard_transitions WHERE storyboard_id = ?').all(id)
  return { ...board, scenes, transitions }
}

export function createBoard(name: string, style?: string, workspaceId?: string): any {
  const raw = getRawDb()
  const id = crypto.randomUUID()
  const now = Date.now()
  const wsId = workspaceId || getActiveWorkspaceId()
  raw.prepare(
    'INSERT INTO storyboards (id, name, style, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name || 'Untitled Storyboard', style || '', wsId, now, now)
  raw.save()
  return { id, name: name || 'Untitled Storyboard', style: style || '', createdAt: now, updatedAt: now }
}

export function updateBoardName(id: string, name: string): boolean {
  getRawDb().prepare('UPDATE storyboards SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), id)
  getRawDb().save()
  return true
}

export function updateBoard(id: string, settings: any): boolean {
  const raw = getRawDb()
  const fields: string[] = []
  const values: any[] = []
  for (const [key, val] of Object.entries(settings)) {
    const col = key.replace(/[A-Z]/g, c => '_' + c.toLowerCase())
    fields.push(`${col} = ?`)
    values.push(val)
  }
  if (fields.length === 0) return false
  values.push(Date.now(), id)
  raw.prepare(`UPDATE storyboards SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`).run(...values)
  raw.save()
  return true
}

export function deleteBoard(id: string): boolean {
  const raw = getRawDb()
  raw.prepare('DELETE FROM storyboard_transitions WHERE storyboard_id = ?').run(id)
  raw.prepare('DELETE FROM storyboard_scenes WHERE storyboard_id = ?').run(id)
  raw.prepare('DELETE FROM storyboards WHERE id = ?').run(id)
  raw.save()
  return true
}

// ─── Scenes ────────────────────────────────────────────────

export function createScene(storyboardId: string, data: any): any {
  const raw = getRawDb()
  const id = crypto.randomUUID()
  const now = Date.now()
  const maxOrder = (raw.prepare('SELECT COALESCE(MAX("order"), -1) as max_order FROM storyboard_scenes WHERE storyboard_id = ?').get(storyboardId) as any)?.maxOrder ?? -1

  let prompt = data.prompt || ''
  const board = raw.prepare('SELECT style FROM storyboards WHERE id = ?').get(storyboardId) as any
  if (board?.style) prompt = applyStyle(prompt, board.style)

  raw.prepare(
    'INSERT INTO storyboard_scenes (id, storyboard_id, "order", description, prompt, aspect_ratio, resolution, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, storyboardId, maxOrder + 1, data.description || '', prompt, data.aspectRatio || '1:1', data.resolution || '1K', now, now)
  raw.save()
  return { id, order: maxOrder + 1, ...data, prompt }
}

export function updateScene(id: string, data: any): boolean {
  const raw = getRawDb()
  const updates: string[] = []
  const values: any[] = []
  const fieldMap: Record<string, string> = {
    description: 'description', prompt: 'prompt',
    aspectRatio: 'aspect_ratio', resolution: 'resolution',
    imageBase64: 'image_asset_id', videoBase64: 'video_asset_id',
  }
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) {
      updates.push(`${col} = ?`)
      if (key === 'imageBase64' || key === 'videoBase64') {
        values.push(null)
      } else {
        values.push(data[key])
      }
    }
  }
  if (updates.length === 0) return false
  values.push(Date.now(), id)
  raw.prepare(`UPDATE storyboard_scenes SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`).run(...values)
  raw.save()
  return true
}

export function setSceneAsset(sceneId: string, type: 'image' | 'video', assetId: string): boolean {
  const col = type === 'image' ? 'image_asset_id' : 'video_asset_id'
  getRawDb().prepare(`UPDATE storyboard_scenes SET ${col} = ?, updated_at = ? WHERE id = ?`).run(assetId, Date.now(), sceneId)
  getRawDb().save()
  return true
}

export function deleteScene(id: string): boolean {
  const raw = getRawDb()
  const scene = raw.prepare('SELECT * FROM storyboard_scenes WHERE id = ?').get(id) as any
  if (!scene) return false
  raw.prepare('DELETE FROM storyboard_transitions WHERE from_scene_id = ? OR to_scene_id = ?').run(id, id)
  raw.prepare('DELETE FROM storyboard_scenes WHERE id = ?').run(id)
  raw.save()
  return true
}

export function reorderScenes(storyboardId: string, sceneIds: string[]): boolean {
  const raw = getRawDb()
  const stmt = raw.prepare('UPDATE storyboard_scenes SET "order" = ?, updated_at = ? WHERE id = ?')
  const now = Date.now()
  for (let i = 0; i < sceneIds.length; i++) {
    stmt.run(i, now, sceneIds[i])
  }
  raw.save()
  return true
}

export function getScene(id: string): any {
  return getRawDb().prepare('SELECT * FROM storyboard_scenes WHERE id = ?').get(id)
}

// ─── Transitions ───────────────────────────────────────────

export function createTransition(data: any): any {
  const raw = getRawDb()
  const id = crypto.randomUUID()
  const now = Date.now()
  raw.prepare(
    'INSERT INTO storyboard_transitions (id, storyboard_id, from_scene_id, to_scene_id, duration, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, data.storyboardId, data.fromSceneId, data.toSceneId, data.duration || 5, now, now)
  raw.save()
  return { id, ...data }
}

export function deleteTransition(id: string): boolean {
  getRawDb().prepare('DELETE FROM storyboard_transitions WHERE id = ?').run(id)
  getRawDb().save()
  return true
}

export function updateTransition(id: string, data: any): boolean {
  const raw = getRawDb()
  const updates: string[] = []
  const values: any[] = []
  if (data.duration != null) { updates.push('duration = ?'); values.push(data.duration) }
  if (data.videoBase64 != null) { updates.push('video_asset_id = ?'); values.push(data.videoBase64) }
  if (data.videoAssetId != null) { updates.push('video_asset_id = ?'); values.push(data.videoAssetId) }
  if (updates.length === 0) return false
  values.push(Date.now(), id)
  raw.prepare(`UPDATE storyboard_transitions SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`).run(...values)
  raw.save()
  return true
}

// ─── Generation ────────────────────────────────────────────

export async function generateSceneImage(sceneId: string, params: any): Promise<{ taskId: string; sceneId: string }> {
  const scene = getScene(sceneId)
  const board = scene ? getBoard(scene.storyboard_id) : null
  const apiKey = requireApiKey()
  const queue = getTaskQueue(apiKey)
  let prompt = params.prompt || scene?.prompt || ''
  if (board?.style) prompt = applyStyle(prompt, board.style)
  const taskId = await queue.enqueue('image', {
    sceneId,
    prompt,
    model: params.model || 'gpt-image-2-text-to-image',
    aspectRatio: params.aspectRatio || scene?.aspect_ratio || '1:1',
    resolution: params.resolution || scene?.resolution || '1K',
  })
  return { taskId, sceneId }
}

export async function generateSceneVideo(sceneId: string, params: any): Promise<{ taskId: string; sceneId: string }> {
  const scene = getScene(sceneId)
  const board = scene ? getBoard(scene.storyboard_id) : null
  const apiKey = requireApiKey()
  const queue = getTaskQueue(apiKey)
  let prompt = params.prompt || scene?.prompt || ''
  if (board?.style) prompt = applyStyle(prompt, board.style)
  const taskId = await queue.enqueue('video', {
    sceneId,
    prompt,
    model: params.model || 'kling-3.0/video',
    duration: params.duration || 5,
    imageBase64: params.imageBase64,
    imageMime: 'image/png',
    aspectRatio: params.aspectRatio || '16:9',
    resolution: params.resolution || '1K',
  })
  return { taskId, sceneId }
}

export async function generateTransition(transitionId: string, params: any): Promise<{ taskId: string; transitionId: string }> {
  const apiKey = requireApiKey()
  const queue = getTaskQueue(apiKey)
  const taskId = await queue.enqueue('video', {
    transitionId,
    prompt: params.prompt || 'Smooth cinematic transition',
    model: params.model || 'pixverse-v6/image-to-video',
    duration: params.duration || 5,
    firstFrameBase64: params.firstFrameBase64,
    lastFrameBase64: params.lastFrameBase64,
    aspectRatio: params.aspectRatio || '16:9',
    resolution: params.resolution || '1K',
  })
  return { taskId, transitionId }
}

export function getTask(taskId: string): any {
  const row = getRawDb().prepare('SELECT * FROM openfield_tasks WHERE task_id = ?').get(taskId)
  if (!row) return null
  let payload: any = {}
  try { payload = JSON.parse(row.payload || '{}') } catch {}
  return {
    taskId: row.task_id,
    status: row.status,
    type: row.type,
    error: row.error_message || null,
    progress: row.progress ?? 0,
    resultAssetId: row.result_asset_id || null,
    creditsUsed: row.credits_used ?? null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    prompt: payload.prompt || null,
  }
}
