import { getRawDb } from '../db'
import * as fs from 'fs/promises'

// Removes the damage caused by a buggy run of repairRecreateRefs (which read
// `task_id` instead of the camelCased `taskId`, so it imported the same reference
// images for EVERY valid asset instead of just the matching task's asset).
//
// It deletes the bogus 'upload' assets (created before the buggy repair's flag
// timestamp) and strips the bogus imageAssetId/imageRefs keys those runs added to
// asset parameters. Runs once (guarded by the `repairCleanupDone` setting).
export async function cleanupRepairDamage(): Promise<{ removed: number; fixed: number }> {
  const raw = getRawDb()

  const cleanupDone = raw.prepare("SELECT value FROM settings WHERE key = 'repairCleanupDone'").get() as any
  if (cleanupDone) return { removed: 0, fixed: 0 }

  // Cutoff: the buggy repair stored its flag AFTER importing the bogus uploads, so
  // every upload created at/before that timestamp is bogus. Legit uploads (created
  // after) are left untouched.
  const v1flag = raw.prepare("SELECT updated_at FROM settings WHERE key = 'repairRecreateRefsDone'").get() as any
  if (!v1flag) {
    raw.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('repairCleanupDone', '1', ?)").run(Date.now())
    return { removed: 0, fixed: 0 }
  }
  const cutoff = v1flag.updatedAt

  const uploads = raw.prepare("SELECT id, file_path, local_path FROM assets WHERE model_used = 'upload' AND created_at <= ?").all(cutoff) as any[]
  const removedIds = new Set<string>()
  for (const u of uploads) {
    const p = u.localPath || u.filePath
    if (p && !p.startsWith('http') && !p.startsWith('__error__')) {
      try { await fs.unlink(p) } catch {}
    }
    raw.prepare('DELETE FROM assets WHERE id = ?').run(u.id)
    removedIds.add(u.id)
  }

  let fixed = 0
  const assets = raw.prepare("SELECT id, parameters FROM assets WHERE parameters IS NOT NULL AND parameters != ''").all() as any[]
  for (const a of assets) {
    let params: any
    try { params = JSON.parse(a.parameters) } catch { continue }
    if (!params || typeof params !== 'object' || Array.isArray(params)) continue

    const refs = Array.isArray(params.imageRefs) ? params.imageRefs : []
    const touchesDeleted = removedIds.has(params.imageAssetId) || refs.some((r: any) => removedIds.has(r?.assetId))
    if (!touchesDeleted) continue

    delete params.imageAssetId
    delete params.imageRefs
    if (params.imageMime === 'image/jpeg') delete params.imageMime
    delete params.firstFrameAssetId
    delete params.lastFrameAssetId
    if (params.imageBase64 === '') delete params.imageBase64
    if (params.firstFrameBase64 === '') delete params.firstFrameBase64
    if (params.lastFrameBase64 === '') delete params.lastFrameBase64

    raw.prepare('UPDATE assets SET parameters = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(params), Date.now(), a.id)
    fixed++
  }

  // Clear the v1 flag so the corrected repair runs; mark cleanup as done.
  raw.prepare("DELETE FROM settings WHERE key = 'repairRecreateRefsDone'").run()
  raw.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('repairCleanupDone', '1', ?)").run(Date.now())
  raw.save()

  console.log(`[cleanup-repair-damage] Removed ${uploads.length} bogus upload asset(s), cleaned parameters of ${fixed} asset(s)`)
  return { removed: uploads.length, fixed }
}
