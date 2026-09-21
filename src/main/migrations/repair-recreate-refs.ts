import { getRawDb } from '../db'
import { getAssetManager } from '../services/asset-manager'

const isRealBase64 = (s: any): s is string => typeof s === 'string' && s.length > 100

// One-time repair for assets generated before the base64->binary refactor persisted
// asset IDs. It re-imports the reference images from the original task payload to disk
// and rewrites parameters to reference them by assetId so the "Recreate" button can
// reload the references.
export async function repairRecreateRefs(): Promise<number> {
  const raw = getRawDb()
  const am = getAssetManager()

  const taskRows = raw.prepare('SELECT task_id, payload FROM tasks UNION SELECT task_id, payload FROM openfield_tasks').all() as any[]
  const tasks = new Map<string, any>()
  for (const t of taskRows) tasks.set(t.taskId, t.payload)

  const assets = raw.prepare(
    `SELECT * FROM assets
     WHERE task_id IS NOT NULL AND task_id != ''
       AND file_path NOT LIKE '__error__%' AND file_path NOT LIKE 'pending-%'`
  ).all() as any[]

  let updated = 0
  for (const asset of assets) {
    const payloadStr = tasks.get(asset.taskId)
    if (!payloadStr) continue
    let tp: any
    try { tp = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr } catch { continue }

    let params: any
    try { params = JSON.parse(asset.parameters || '{}') } catch { params = {} }
    if (!params || typeof params !== 'object' || Array.isArray(params)) params = {}

    const changed: string[] = []

    const importRef = async (base64: string, mime: string, name: string): Promise<string> => {
      const a = await am.importBase64(base64, mime, name)
      return a.id
    }

    if (!params.imageAssetId && isRealBase64(tp.imageBase64)) {
      try {
        params.imageAssetId = await importRef(tp.imageBase64, tp.imageMime || 'image/png', 'input.png')
        if (tp.imageMime) params.imageMime = tp.imageMime
        changed.push('image')
      } catch {}
    }

    for (const [refKey, defaultMime] of [['imageRefs', 'image/png'], ['videoRefs', 'video/mp4']] as const) {
      if (!Array.isArray(tp[refKey])) continue
      params[refKey] = Array.isArray(params[refKey]) ? params[refKey] : []
      for (let i = 0; i < tp[refKey].length; i++) {
        const tr = tp[refKey][i]
        if (!tr) continue
        if (tr.assetId && !params[refKey][i]?.assetId) {
          params[refKey][i] = { ...(params[refKey][i] || {}), assetId: tr.assetId }
          changed.push(refKey)
        } else if (!params[refKey][i]?.assetId && isRealBase64(tr.base64)) {
          try {
            const assetId = await importRef(tr.base64, tr.mime || defaultMime, tr.name || `ref-${i}`)
            params[refKey][i] = { ...(params[refKey][i] || {}), name: tr.name, refType: tr.refType, mime: tr.mime || defaultMime, assetId }
            changed.push(refKey)
          } catch {}
        }
      }
    }

    for (const key of ['firstFrame', 'lastFrame']) {
      const idKey = key + 'AssetId'
      const b64Key = key + 'Base64'
      if (!params[idKey] && isRealBase64(tp[b64Key])) {
        try {
          params[idKey] = await importRef(tp[b64Key], 'image/png', key + '.png')
          changed.push(key)
        } catch {}
      }
    }

    if (changed.length === 0) continue

    // Strip base64 from stored params (keep asset IDs)
    if (params.imageBase64) params.imageBase64 = ''
    if (params.firstFrameBase64) params.firstFrameBase64 = ''
    if (params.lastFrameBase64) params.lastFrameBase64 = ''
    if (Array.isArray(params.imageRefs)) {
      params.imageRefs = params.imageRefs.map((r: any) => ({
        name: r.name, refType: r.refType, mime: r.mime,
        ...(r.assetId ? { assetId: r.assetId } : {}),
        ...(!r.assetId && r.base64 ? { base64: r.base64 } : {}),
      }))
    }
    if (Array.isArray(params.videoRefs)) {
      params.videoRefs = params.videoRefs.map((r: any) => ({
        name: r.name, mime: r.mime,
        ...(r.assetId ? { assetId: r.assetId } : {}),
        ...(!r.assetId && r.base64 ? { base64: r.base64 } : {}),
      }))
    }

    raw.prepare('UPDATE assets SET parameters = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(params), Date.now(), asset.id)
    updated++
  }

  if (updated > 0) {
    raw.save()
    console.log(`[repair-recreate-refs] Repaired ${updated} asset(s) - refs now stored as asset IDs`)
  }
  return updated
}
