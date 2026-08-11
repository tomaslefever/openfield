import * as crypto from 'crypto'
import type { IpcContext } from './context'
import { rowToElement } from './helpers'

export function registerElementsHandlers({ raw, handle }: IpcContext) {
  handle('elements:list', () => {
    const rows = raw.prepare('SELECT * FROM elements ORDER BY updated_at DESC').all() as any[]
    return rows.map(rowToElement)
  })

  handle('elements:create', (_e, data: any) => {
    const id = data.id || crypto.randomUUID()
    const now = Date.now()
    raw.prepare(
      `INSERT INTO elements (id, name, kind, description, tags, image_base64, prompt, voice_id,
       reference_images, pose_ref, pose_task_id, moodboard_task_id, video_ref, hdri_ref,
       style, properties, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, data.name, data.kind, data.description || '',
      JSON.stringify(data.tags || []), data.imageBase64 || '',
      data.prompt || '', data.voiceId || '',
      JSON.stringify(data.referenceImages || []), data.poseRef || '',
      data.poseTaskId || '', data.moodboardTaskId || '',
      data.videoRef || '', data.hdriRef || '',
      data.style || '', JSON.stringify(data.properties || {}),
      now, now
    )
    const row = raw.prepare('SELECT * FROM elements WHERE id = ?').get(id)
    return row ? rowToElement(row) : null
  })

  handle('elements:update', (_e, id: string, data: any) => {
    const now = Date.now()
    const sets: string[] = ['updated_at = ?']
    const vals: any[] = [now]

    const fields = ['name', 'kind', 'description', 'prompt', 'voice_id', 'pose_task_id',
      'moodboard_task_id', 'style']
    const map: Record<string, string> = { voiceId: 'voice_id', poseTaskId: 'pose_task_id', moodboardTaskId: 'moodboard_task_id' }

    for (const f of fields) {
      const col = map[f] || f.replace(/[A-Z]/g, (c: string) => '_' + c.toLowerCase())
      if (data[f] !== undefined) {
        sets.push(`${col} = ?`)
        vals.push(data[f])
      }
    }
    if (data.tags !== undefined) { sets.push('tags = ?'); vals.push(JSON.stringify(data.tags)) }
    if (data.imageBase64 !== undefined) { sets.push('image_base64 = ?'); vals.push(data.imageBase64) }
    if (data.referenceImages !== undefined) { sets.push('reference_images = ?'); vals.push(JSON.stringify(data.referenceImages)) }
    if (data.poseRef !== undefined) { sets.push('pose_ref = ?'); vals.push(data.poseRef) }
    if (data.videoRef !== undefined) { sets.push('video_ref = ?'); vals.push(data.videoRef) }
    if (data.hdriRef !== undefined) { sets.push('hdri_ref = ?'); vals.push(data.hdriRef) }
    if (data.properties !== undefined) { sets.push('properties = ?'); vals.push(JSON.stringify(data.properties)) }

    vals.push(id)
    raw.prepare(`UPDATE elements SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return true
  })

  handle('elements:delete', (_e, id: string) => {
    raw.prepare('DELETE FROM elements WHERE id = ?').run(id)
    return true
  })
}
