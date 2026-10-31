import { toast } from 'sonner'
import { MAX_REFERENCES, type MediaRef } from '../stores/elements-store'
import { collectReferences } from '../components/assets/AssetReferences'

export type MediaKind = 'image' | 'video'

const MAX_BYTES: Record<MediaKind, number> = {
  image: 20 * 1024 * 1024,
  video: 50 * 1024 * 1024,
}

function readFileB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function filesToRefs(files: File[], accept: MediaKind): Promise<MediaRef[]> {
  const out: MediaRef[] = []
  for (const file of files) {
    if (!file.type.startsWith(`${accept}/`)) continue
    if (file.size > MAX_BYTES[accept]) {
      toast.error(`${file.name} supera ${MAX_BYTES[accept] / 1024 / 1024} MB`)
      continue
    }
    try { out.push({ base64: await readFileB64(file), assetId: '' }) } catch { /* unreadable file */ }
  }
  return out
}

function parseParams(asset: any): any {
  if (asset?.parameters && typeof asset.parameters === 'object') return asset.parameters
  try { return JSON.parse(asset?.parameters || '{}') } catch { return {} }
}

/**
 * The image references a generated asset was made with, ready to become an element's
 * references. Stored refs keep their asset id (no re-import); inline-only refs are sent
 * as base64 and stored on create. URL-only refs are skipped (they may have expired).
 */
export async function referencesFromAsset(asset: any): Promise<MediaRef[]> {
  if (!asset) return []
  const raw = collectReferences(parseParams(asset))
    .filter((r) => r.kind === 'image' && r.assetId !== asset.id)
    .slice(0, MAX_REFERENCES)
  if (raw.length === 0) return []

  const ids = raw.map((r) => r.assetId).filter((id): id is string => !!id)
  let byId = new Map<string, string>()
  if (ids.length) {
    try {
      const results = await (window as any).electronAPI?.assets.readBase64(ids)
      byId = new Map((results || []).map((r: any) => [r.id, r.base64]))
    } catch (err) {
      console.warn('[element-references] Failed to read reference assets:', err)
    }
  }

  const out: MediaRef[] = []
  for (const r of raw) {
    const stored = r.assetId ? byId.get(r.assetId) : undefined
    if (stored) { out.push({ base64: stored, assetId: r.assetId! }); continue }
    if (r.src?.startsWith('data:')) {
      const b64 = r.src.slice(r.src.indexOf(',') + 1)
      if (b64) out.push({ base64: b64, assetId: '' })
    }
  }
  return out
}
