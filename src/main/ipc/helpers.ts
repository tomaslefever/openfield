import { getRawDb } from '../db'

export function readSetting(key: string): any {
  const row = getRawDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
  if (!row || !row.value) return null
  try { return JSON.parse(row.value) } catch { return row.value }
}

export function requireApiKey(): string {
  const key = readSetting('openfieldApiKey') || readSetting('kieApiKey')
  if (!key) throw new Error('KIE.ai API key not configured.')
  // Migrate old key name to new
  if (!readSetting('openfieldApiKey') && key) {
    const raw = getRawDb()
    raw.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .run('openfieldApiKey', JSON.stringify(key), Date.now())
  }
  return key
}

export function rowToElement(row: any) {
  return {
    ...row,
    tags: safeJson(row.tags, []),
    referenceImages: safeJson(row.referenceImages, []),
    referenceAssetIds: safeJson(row.referenceAssetIds ?? row.reference_asset_ids, []),
    properties: safeJson(row.properties, {}),
    imageBase64: '', // No longer stored in DB — loaded from asset
    imageAssetId: row.imageAssetId ?? row.image_asset_id ?? '',
    poseAssetId: row.poseAssetId ?? row.pose_asset_id ?? '',
    videoAssetId: row.videoAssetId ?? row.video_asset_id ?? '',
    hdriAssetId: row.hdriAssetId ?? row.hdri_asset_id ?? '',
  }
}

export function safeJson(raw: string | null | undefined, fallback: any) {
  if (!raw) return fallback
  try { return JSON.parse(raw) } catch { return fallback }
}
