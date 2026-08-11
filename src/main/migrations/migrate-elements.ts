import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { getRawDb } from '../db'
import { getAssetManager } from '../services/asset-manager'

function getAssetsDir(): string {
  const userData = path.join(
    process.env.APPDATA || path.join(process.env.HOME || '', 'AppData', 'Roaming'),
    'openfield',
  )
  return path.join(userData, 'assets')
}

function saveBase64ToFile(base64: string, mimeType: string, dir: string): string {
  const ext = mimeType.split('/')[1] || 'png'
  const id = crypto.randomUUID()
  const fileName = `${id}.${ext}`
  const filePath = path.join(dir, fileName)
  const buffer = Buffer.from(base64, 'base64')
  fs.writeFileSync(filePath, buffer)
  return filePath
}

function migrateElement(element: any, assetManager: any) {
  const raw = getRawDb()
  const updates: string[] = []
  const params: any[] = []

  // Migrate image_base64 → image_asset_id
  if (element.image_base64 && !element.image_asset_id) {
    try {
      const filePath = saveBase64ToFile(element.image_base64, 'image/png', path.join(getAssetsDir(), 'images'))
      const asset = assetManager.importFile(filePath, 'image')
      updates.push('image_asset_id = ?')
      params.push(asset.id)
    } catch (err) { console.warn('[Migration] Failed to migrate image for', element.id, err) }
  }

  // Migrate pose_ref → pose_asset_id (only if it's base64, not a URL/path)
  if (element.pose_ref && !element.pose_asset_id && element.pose_ref.length > 100) {
    try {
      const filePath = saveBase64ToFile(element.pose_ref, 'image/png', path.join(getAssetsDir(), 'images'))
      const asset = assetManager.importFile(filePath, 'image')
      updates.push('pose_asset_id = ?')
      params.push(asset.id)
    } catch (err) { console.warn('[Migration] Failed to migrate pose for', element.id, err) }
  }

  // Migrate video_ref → video_asset_id
  if (element.video_ref && !element.video_asset_id && element.video_ref.length > 100) {
    try {
      const filePath = saveBase64ToFile(element.video_ref, 'video/mp4', path.join(getAssetsDir(), 'videos'))
      const asset = assetManager.importFile(filePath, 'video')
      updates.push('video_asset_id = ?')
      params.push(asset.id)
    } catch (err) { console.warn('[Migration] Failed to migrate video for', element.id, err) }
  }

  // Migrate hdri_ref → hdri_asset_id
  if (element.hdri_ref && !element.hdri_asset_id && element.hdri_ref.length > 100) {
    try {
      const filePath = saveBase64ToFile(element.hdri_ref, 'image/png', path.join(getAssetsDir(), 'images'))
      const asset = assetManager.importFile(filePath, 'image')
      updates.push('hdri_asset_id = ?')
      params.push(asset.id)
    } catch (err) { console.warn('[Migration] Failed to migrate HDRI for', element.id, err) }
  }

  // Migrate reference_images → reference_asset_ids (JSON array of base64)
  if (element.reference_images && element.reference_images !== '[]' && element.reference_asset_ids === '[]') {
    try {
      const imgs: string[] = JSON.parse(element.reference_images)
      const assetIds: string[] = []
      for (const b64 of imgs) {
        if (b64 && b64.length > 100) {
          const filePath = saveBase64ToFile(b64, 'image/png', path.join(getAssetsDir(), 'images'))
          const asset = assetManager.importFile(filePath, 'image')
          assetIds.push(asset.id)
        }
      }
      if (assetIds.length > 0) {
        updates.push('reference_asset_ids = ?')
        params.push(JSON.stringify(assetIds))
      }
    } catch (err) { console.warn('[Migration] Failed to migrate refs for', element.id, err) }
  }

  if (updates.length > 0) {
    params.push(element.id)
    raw.prepare(`UPDATE elements SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  }

  return updates.length > 0
}

export async function runElementsMigration(): Promise<number> {
  const raw = getRawDb()
  const assetManager = getAssetManager()

  // Add columns if they don't exist
  const columns = ['image_asset_id', 'pose_asset_id', 'video_asset_id', 'hdri_asset_id', 'reference_asset_ids']
  for (const col of columns) {
    try { raw.exec(`ALTER TABLE elements ADD COLUMN ${col} TEXT DEFAULT ''`) } catch {}
    try { raw.exec(`ALTER TABLE elements ADD COLUMN ${col} TEXT DEFAULT '[]'`) } catch {}
  }

  // Find elements with base64 data
  const elements = raw.prepare(`
    SELECT * FROM elements WHERE
      (image_base64 != '' AND image_base64 IS NOT NULL) OR
      (pose_ref != '' AND pose_ref IS NOT NULL) OR
      (video_ref != '' AND video_ref IS NOT NULL) OR
      (hdri_ref != '' AND hdri_ref IS NOT NULL) OR
      (reference_images != '[]' AND reference_images IS NOT NULL AND reference_images != '')
  `).all() as any[]

  if (elements.length === 0) {
    console.log('[Migration] No elements with base64 data to migrate')
    return 0
  }

  console.log(`[Migration] Migrating ${elements.length} elements with base64 data...`)
  let count = 0
  for (const el of elements) {
    if (migrateElement(el, assetManager)) count++
  }

  if (count > 0) {
    console.log(`[Migration] Migrated ${count} elements. Clearing old base64 columns...`)
    raw.exec(`UPDATE elements SET image_base64 = '', pose_ref = '', video_ref = '', hdri_ref = '', reference_images = '[]' WHERE image_base64 != '' OR pose_ref != '' OR video_ref != '' OR hdri_ref != ''`)
    raw.saveSync()
  }

  console.log(`[Migration] Done. ${count} elements migrated.`)
  return count
}
