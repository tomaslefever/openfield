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

/**
 * Element row → API shape. Media is NOT inlined here: an element's image, pose, video, HDRI
 * and references live as binary assets (the *AssetId columns) and the renderer loads the
 * ones it needs asynchronously (elements-store → assets:readBase64). Reading every file
 * synchronously in this mapper blocked the main process for the whole list on each load
 * and shipped the same bytes twice over IPC. The legacy inline columns (image_base64,
 * pose_ref, video_ref, hdri_ref, reference_images) are passed through for rows that
 * predate asset-backed media.
 */
export function rowToElement(row: any) {
  const imageAssetId = row.imageAssetId ?? row.image_asset_id ?? ''
  const poseAssetId = row.poseAssetId ?? row.pose_asset_id ?? ''
  const videoAssetId = row.videoAssetId ?? row.video_asset_id ?? ''
  const hdriAssetId = row.hdriAssetId ?? row.hdri_asset_id ?? ''
  const refAssetIds: string[] = safeJson(row.reference_asset_ids ?? row.referenceAssetIds, [])
  const storedRefs: string[] = safeJson(row.reference_images ?? row.referenceImages, [])

  return {
    ...row,
    id: row.id,
    name: row.name || '',
    kind: row.kind,
    description: row.description || '',
    tags: safeJson(row.tags, []),
    imageBase64: row.image_base64 || row.imageBase64 || '',
    imageAssetId,
    prompt: row.prompt || '',
    voiceId: row.voiceId ?? row.voice_id ?? '',
    referenceImages: storedRefs,
    referenceAssetIds: refAssetIds,
    poseRef: row.poseRef ?? row.pose_ref ?? '',
    poseAssetId,
    poseTaskId: row.poseTaskId ?? row.pose_task_id ?? '',
    moodboardTaskId: row.moodboardTaskId ?? row.moodboard_task_id ?? '',
    videoRef: row.videoRef ?? row.video_ref ?? '',
    videoAssetId,
    hdriRef: row.hdriRef ?? row.hdri_ref ?? '',
    hdriAssetId,
    style: row.style || '',
    properties: safeJson(row.properties, {}),
    workspaceId: row.workspaceId ?? row.workspace_id,
    createdAt: row.createdAt ?? row.created_at ?? 0,
    updatedAt: row.updatedAt ?? row.updated_at ?? 0,
  }
}

export function safeJson(raw: string | null | undefined, fallback: any) {
  if (!raw) return fallback
  try { return JSON.parse(raw) } catch { return fallback }
}
