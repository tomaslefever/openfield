import * as crypto from 'crypto'
import type { IpcContext } from './context'
import { rowToElement } from './helpers'
import { getActiveWorkspaceId } from '../services/workspace-service'
import { getAssetManager } from '../services/asset-manager'

function extractBase64(v: string): string | null {
  if (!v || typeof v !== 'string') return null
  if (v.startsWith('data:')) {
    const m = v.match(/^data:[^;,]*;base64,(.+)$/)
    return m ? m[1] : null
  }
  if (/^https?:\/\//i.test(v)) return null
  return v.length > 100 ? v : null
}

export function registerElementsHandlers({ raw, handle }: IpcContext) {
  handle('elements:list', () => {
    const wsId = getActiveWorkspaceId()
    const rows = raw.prepare('SELECT * FROM elements WHERE workspace_id = ? ORDER BY updated_at DESC').all(wsId) as any[]
    return rows.map(rowToElement)
  })

  handle('elements:create', async (_e, data: any) => {
    const id = data.id || crypto.randomUUID()
    const now = Date.now()
    const wsId = getActiveWorkspaceId()
    const am = getAssetManager()

    // Media is stored as binary files in the assets folders; the DB only
    // stores asset IDs (and plain URLs). Base64 never persists.
    const persist = async (b64: string, mime: string, name: string): Promise<string> => {
      try {
        const a = await am.importBase64(b64, mime, name, { modelUsed: 'ref', workspaceId: wsId })
        return a?.id || ''
      } catch (e: any) {
        console.warn('[elements] Failed to persist media:', e?.message)
        return ''
      }
    }

    const storeField = async (rawVal: any, existingAssetId: string, mime: string, name: string) => {
      const v = typeof rawVal === 'string' ? rawVal : ''
      const b64 = extractBase64(v)
      if (b64) {
        const assetId = existingAssetId || await persist(b64, mime, name)
        return { assetId, col: '' }
      }
      return { assetId: existingAssetId, col: v }
    }

    const img = await storeField(data.imageBase64 ?? data.image_base64, data.imageAssetId || data.image_asset_id || '', 'image/png', 'element-image.png')
    const pose = await storeField(data.poseRef ?? data.pose_ref, data.poseAssetId || data.pose_asset_id || '', 'image/png', 'element-pose.png')
    const video = await storeField(data.videoRef ?? data.video_ref, data.videoAssetId || data.video_asset_id || '', 'video/mp4', 'element-video.mp4')
    const hdri = await storeField(data.hdriRef ?? data.hdri_ref, data.hdriAssetId || data.hdri_asset_id || '', 'image/png', 'element-hdri.png')

    let refAssetIds: string[] = Array.isArray(data.referenceAssetIds) ? [...data.referenceAssetIds]
      : Array.isArray(data.reference_asset_ids) ? [...data.reference_asset_ids]
        : []
    const refUrls: string[] = []
    const refImgs = data.referenceImages ?? data.reference_images ?? []
    if (Array.isArray(refImgs)) {
      for (const r of refImgs) {
        if (typeof r !== 'string' || !r) continue
        const b64 = extractBase64(r)
        if (b64) {
          const aid = await persist(b64, 'image/png', 'element-ref.png')
          if (aid && !refAssetIds.includes(aid)) refAssetIds.push(aid)
        } else {
          refUrls.push(r)
        }
      }
    }

    raw.prepare(
      `INSERT INTO elements (id, name, kind, description, tags, image_base64, image_asset_id, prompt, voice_id,
       reference_images, reference_asset_ids, pose_ref, pose_asset_id, pose_task_id, moodboard_task_id,
       video_ref, video_asset_id, hdri_ref, hdri_asset_id, style, properties, workspace_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, data.name, data.kind, data.description || '',
      JSON.stringify(data.tags || []), img.col, img.assetId,
      data.prompt || '', data.voiceId || data.voice_id || '',
      JSON.stringify(refUrls), JSON.stringify(refAssetIds),
      pose.col, pose.assetId,
      data.poseTaskId || data.pose_task_id || '',
      data.moodboardTaskId || data.moodboard_task_id || '',
      video.col, video.assetId,
      hdri.col, hdri.assetId,
      data.style || '', JSON.stringify(data.properties || {}),
      wsId, now, now
    )
    const row = raw.prepare('SELECT * FROM elements WHERE id = ?').get(id)
    return row ? rowToElement(row) : null
  })

  handle('elements:update', async (_e, id: string, data: any) => {
    const now = Date.now()
    const wsId = getActiveWorkspaceId()
    const am = getAssetManager()

    const persist = async (b64: string, mime: string, name: string): Promise<string> => {
      try {
        const a = await am.importBase64(b64, mime, name, { modelUsed: 'ref', workspaceId: wsId })
        return a?.id || ''
      } catch (e: any) {
        console.warn('[elements] Failed to persist media:', e?.message)
        return ''
      }
    }

    const sets: string[] = ['updated_at = ?']
    const vals: any[] = [now]

    const fields = ['name', 'kind', 'description', 'prompt', 'voice_id', 'pose_task_id',
      'moodboard_task_id', 'style', 'image_asset_id', 'pose_asset_id', 'video_asset_id', 'hdri_asset_id']
    const map: Record<string, string> = {
      voiceId: 'voice_id',
      poseTaskId: 'pose_task_id',
      moodboardTaskId: 'moodboard_task_id',
      imageAssetId: 'image_asset_id',
      poseAssetId: 'pose_asset_id',
      videoAssetId: 'video_asset_id',
      hdriAssetId: 'hdri_asset_id',
    }

    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) {
        sets.push(`${col} = ?`)
        vals.push(data[key])
      }
    }
    for (const f of fields) {
      if (data[f] !== undefined && !map[f]) {
        sets.push(`${f} = ?`)
        vals.push(data[f])
      }
    }
    if (data.tags !== undefined) { sets.push('tags = ?'); vals.push(JSON.stringify(data.tags)) }
    if (data.properties !== undefined) { sets.push('properties = ?'); vals.push(JSON.stringify(data.properties)) }

    // Media fields: base64 is persisted as binary assets, URLs stay as-is.
    const setMediaField = async (col: string, assetCol: string, rawVal: any, existingAssetId: string, mime: string, name: string) => {
      const v = typeof rawVal === 'string' ? rawVal : ''
      const b64 = extractBase64(v)
      if (b64) {
        const assetId = existingAssetId || await persist(b64, mime, name)
        sets.push(`${col} = ?`); vals.push('')
        if (assetId) { sets.push(`${assetCol} = ?`); vals.push(assetId) }
      } else {
        sets.push(`${col} = ?`); vals.push(v)
      }
    }

    if (data.imageBase64 !== undefined || data.image_base64 !== undefined) {
      await setMediaField('image_base64', 'image_asset_id', data.imageBase64 ?? data.image_base64,
        data.imageAssetId ?? data.image_asset_id ?? '', 'image/png', 'element-image.png')
    }
    if (data.poseRef !== undefined || data.pose_ref !== undefined) {
      await setMediaField('pose_ref', 'pose_asset_id', data.poseRef ?? data.pose_ref,
        data.poseAssetId ?? data.pose_asset_id ?? '', 'image/png', 'element-pose.png')
    }
    if (data.videoRef !== undefined || data.video_ref !== undefined) {
      await setMediaField('video_ref', 'video_asset_id', data.videoRef ?? data.video_ref,
        data.videoAssetId ?? data.video_asset_id ?? '', 'video/mp4', 'element-video.mp4')
    }
    if (data.hdriRef !== undefined || data.hdri_ref !== undefined) {
      await setMediaField('hdri_ref', 'hdri_asset_id', data.hdriRef ?? data.hdri_ref,
        data.hdriAssetId ?? data.hdri_asset_id ?? '', 'image/png', 'element-hdri.png')
    }

    // Asset ids aligned 1:1 with the referenceImages sent ('' where nothing could be stored),
    // returned so the renderer can remember them and never re-import the same image.
    let alignedRefIds: string[] | undefined
    if (data.referenceImages !== undefined || data.reference_images !== undefined) {
      const refImgs = data.referenceImages ?? data.reference_images ?? []
      const givenIds: string[] | null = Array.isArray(data.referenceAssetIds) ? data.referenceAssetIds
        : Array.isArray(data.reference_asset_ids) ? data.reference_asset_ids : null
      // Aligned mode: givenIds[i] is the asset already backing refImgs[i] (or '' if new)
      const aligned = !!givenIds && Array.isArray(refImgs) && givenIds.length === refImgs.length
      const refAssetIds: string[] = aligned ? [] : [...(givenIds || [])]
      const refUrls: string[] = []
      alignedRefIds = []
      if (Array.isArray(refImgs)) {
        for (let i = 0; i < refImgs.length; i++) {
          const r = refImgs[i]
          if (typeof r !== 'string' || !r) { alignedRefIds.push(''); continue }
          const b64 = extractBase64(r)
          if (b64) {
            const aid = (aligned && givenIds![i]) || await persist(b64, 'image/png', 'element-ref.png')
            if (aid && !refAssetIds.includes(aid)) refAssetIds.push(aid)
            alignedRefIds.push(aid || '')
          } else {
            refUrls.push(r)
            alignedRefIds.push('')
          }
        }
      }
      sets.push('reference_images = ?'); vals.push(JSON.stringify(refUrls))
      sets.push('reference_asset_ids = ?'); vals.push(JSON.stringify(refAssetIds))
    } else if (data.referenceAssetIds !== undefined || data.reference_asset_ids !== undefined) {
      sets.push('reference_asset_ids = ?'); vals.push(JSON.stringify(data.referenceAssetIds ?? data.reference_asset_ids ?? []))
    }

    vals.push(id)
    raw.prepare(`UPDATE elements SET ${sets.join(', ')} WHERE id = ?`).run(...vals)

    const row = raw.prepare('SELECT image_asset_id, pose_asset_id, video_asset_id, hdri_asset_id FROM elements WHERE id = ?').get(id) as any
    if (!row) return null
    return {
      id,
      imageAssetId: row.image_asset_id || '',
      poseAssetId: row.pose_asset_id || '',
      videoAssetId: row.video_asset_id || '',
      hdriAssetId: row.hdri_asset_id || '',
      ...(alignedRefIds ? { referenceAssetIds: alignedRefIds } : {}),
    }
  })

  handle('elements:delete', (_e, id: string) => {
    raw.prepare('DELETE FROM elements WHERE id = ?').run(id)
    return true
  })
}
