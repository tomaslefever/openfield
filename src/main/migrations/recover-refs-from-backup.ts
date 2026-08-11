import { getRawDb, getUserDataDir } from '../db'
import { getAssetManager } from '../services/asset-manager'
import * as fs from 'fs'
import * as path from 'path'

const isRealBase64 = (s: any): s is string => typeof s === 'string' && s.length > 100

// Recover reference images for assets generated before the binary refactor. The old
// builds stored the full base64 payloads in the asset parameters; a previous cleanup
// of the live DB stripped them, but the on-disk backup (database.sqlite.backup) still
// has them. This re-imports those refs to disk and stores asset IDs so "Recreate"
// works for every recoverable asset. Idempotent and runs once.
export async function recoverRefsFromBackup(): Promise<number> {
  const raw = getRawDb()
  const am = getAssetManager()
  const backupPath = path.join(getUserDataDir(), 'database.sqlite.backup')

  let bakDb: any
  try {
    const buf = await fs.promises.readFile(backupPath)
    const initSqlJs = require('sql.js')
    const SQL = await initSqlJs({
      locateFile: (file: string) => {
        const cwdPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
        return fs.existsSync(cwdPath) ? cwdPath : file
      },
    })
    bakDb = new SQL.Database(buf)
  } catch (err: any) {
    console.warn('[recover-refs] Could not load backup, skipping recovery:', err?.message)
    return 0
  }

  const bakRows = bakDb.exec('SELECT file_name, parameters FROM assets')
  const bakMap = new Map<string, string>()
  if (bakRows[0]) {
    for (const r of bakRows[0].values) bakMap.set(r[0], r[1])
  }
  bakDb.close()

  const assets = raw.prepare(
    `SELECT * FROM assets
     WHERE type IN ('image','video')
       AND file_path NOT LIKE '__error__%' AND file_path NOT LIKE 'pending-%'`
  ).all() as any[]

  let updated = 0
  for (const asset of assets) {
    const bakParamsStr = bakMap.get(asset.fileName)
    if (!bakParamsStr) continue
    let bakP: any
    try { bakP = JSON.parse(bakParamsStr) } catch { continue }
    if (!bakP || typeof bakP !== 'object') continue

    let curP: any
    try { curP = JSON.parse(asset.parameters || '{}') } catch { curP = {} }
    if (!curP || typeof curP !== 'object' || Array.isArray(curP)) curP = {}

    // Skip assets that already have disk-backed refs
    const hasStoredRefs = !!curP.imageAssetId
      || (Array.isArray(curP.imageRefs) && curP.imageRefs.some((r: any) => r.assetId))
      || (Array.isArray(curP.videoRefs) && curP.videoRefs.some((r: any) => r.assetId))
      || isRealBase64(curP.imageBase64) || isRealBase64(curP.firstFrameBase64) || isRealBase64(curP.lastFrameBase64)
    if (hasStoredRefs) continue

    // Carry over scalar metadata (prompt, model, aspect ratio, ...) from the backup
    // payload since the current parameters were stripped
    for (const [k, v] of Object.entries(bakP)) {
      if (curP[k] !== undefined) continue
      if (k === 'imageBase64' || k === 'firstFrameBase64' || k === 'lastFrameBase64'
        || k === 'imageRefs' || k === 'videoRefs' || k === 'audioRefs') continue
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
        || (Array.isArray(v) && !v.some((x: any) => typeof x === 'string' && x.length > 100))) {
        curP[k] = v
      }
    }

    const changed: string[] = []

    const importRef = async (base64: string, mime: string, name: string): Promise<string> => {
      const a = await am.importBase64(base64, mime, name)
      return a.id
    }

    if (!curP.imageAssetId && isRealBase64(bakP.imageBase64)) {
      try {
        curP.imageAssetId = await importRef(bakP.imageBase64, bakP.imageMime || 'image/png', 'input.png')
        if (bakP.imageMime) curP.imageMime = bakP.imageMime
        changed.push('image')
      } catch {}
    }

    for (const [refKey, defaultMime] of [['imageRefs', 'image/png'], ['videoRefs', 'video/mp4']] as const) {
      if (!Array.isArray(bakP[refKey])) continue
      curP[refKey] = Array.isArray(curP[refKey]) ? curP[refKey] : []
      for (let i = 0; i < bakP[refKey].length; i++) {
        const br = bakP[refKey][i]
        if (!br) continue
        if (!curP[refKey][i]?.assetId && isRealBase64(br.base64)) {
          try {
            const assetId = await importRef(br.base64, br.mime || defaultMime, br.name || `ref-${i}`)
            curP[refKey][i] = { ...(curP[refKey][i] || {}), name: br.name, refType: br.refType, mime: br.mime || defaultMime, assetId }
            changed.push(refKey)
          } catch {}
        }
      }
    }

    for (const key of ['firstFrame', 'lastFrame']) {
      const idKey = key + 'AssetId'
      const b64Key = key + 'Base64'
      if (!curP[idKey] && isRealBase64(bakP[b64Key])) {
        try {
          curP[idKey] = await importRef(bakP[b64Key], 'image/png', key + '.png')
          changed.push(key)
        } catch {}
      }
    }

    if (changed.length === 0) continue

    if (curP.imageBase64) curP.imageBase64 = ''
    if (curP.firstFrameBase64) curP.firstFrameBase64 = ''
    if (curP.lastFrameBase64) curP.lastFrameBase64 = ''
    if (Array.isArray(curP.imageRefs)) {
      curP.imageRefs = curP.imageRefs.map((r: any) => ({
        name: r.name, refType: r.refType, mime: r.mime,
        ...(r.assetId ? { assetId: r.assetId } : {}),
        ...(!r.assetId && r.base64 ? { base64: r.base64 } : {}),
      }))
    }
    if (Array.isArray(curP.videoRefs)) {
      curP.videoRefs = curP.videoRefs.map((r: any) => ({
        name: r.name, mime: r.mime,
        ...(r.assetId ? { assetId: r.assetId } : {}),
        ...(!r.assetId && r.base64 ? { base64: r.base64 } : {}),
      }))
    }

    raw.prepare('UPDATE assets SET parameters = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(curP), Date.now(), asset.id)
    updated++
  }

  if (updated > 0) {
    raw.save()
    console.log(`[recover-refs] Recovered refs for ${updated} asset(s) from backup`)
  }
  return updated
}
