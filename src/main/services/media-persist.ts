import * as fs from 'fs/promises'
import * as syncFs from 'fs'
import { getAssetManager } from './asset-manager'
import { getActiveWorkspaceId } from './workspace-service'
import { resolveAssetFileForUpload, prepareUploadFile } from './asset-file'

const MIN_BASE64_LENGTH = 100

function looksLikeBase64(v: any): v is string {
  if (typeof v !== 'string' || v.length < MIN_BASE64_LENGTH) return false
  return /^[A-Za-z0-9+/=]+$/.test(v.slice(0, 4096))
}

// Raw base64 or a data URI. Anything not persisted here is wiped by redactPayload, so a
// data URI that slipped through would silently drop the reference.
function parseMedia(v: any): { b64: string; mime?: string } | null {
  if (typeof v !== 'string') return null
  const m = v.match(/^data:([^;,]+);base64,(.*)$/s)
  if (m) return looksLikeBase64(m[2]) ? { b64: m[2], mime: m[1] } : null
  return looksLikeBase64(v) ? { b64: v } : null
}

/**
 * Persists every base64 media field of a payload as a binary asset file on
 * disk (deduplicated by content hash) and attaches the resulting asset IDs to
 * the returned payload. Base64 bytes never reach the database — the caller
 * must redact the payload before persisting (see redactPayload).
 */
export async function persistMediaToAssets(payload: any): Promise<any> {
  if (!payload || typeof payload !== 'object') return payload
  const am = getAssetManager()
  const wsId = getActiveWorkspaceId()
  const out: any = { ...payload }

  const saveB64 = async (value: any, mime: string, name: string): Promise<string | null> => {
    const media = parseMedia(value)
    if (!media) return null
    try {
      const a = await am.importBase64(media.b64, media.mime || mime, name, { modelUsed: 'ref', workspaceId: wsId })
      return a?.id || null
    } catch (e: any) {
      console.warn('[media-persist] Failed to persist media to disk:', e?.message)
      return null
    }
  }

  if (!out.imageAssetId) {
    const id = await saveB64(out.imageBase64, out.imageMime || 'image/png', 'input_image.png')
    if (id) out.imageAssetId = id
  }
  if (!out.firstFrameAssetId) {
    const id = await saveB64(out.firstFrameBase64, 'image/png', 'firstframe.png')
    if (id) out.firstFrameAssetId = id
  }
  if (!out.lastFrameAssetId) {
    const id = await saveB64(out.lastFrameBase64, 'image/png', 'lastframe.png')
    if (id) out.lastFrameAssetId = id
  }
  if (!out.audioAssetId) {
    const id = await saveB64(out.audioBase64, out.audioMime || 'audio/mpeg', 'input_audio.mp3')
    if (id) out.audioAssetId = id
  }

  const enrichRefs = async (refs: any[], kind: 'image' | 'video' | 'audio') => {
    if (!Array.isArray(refs)) return refs
    return Promise.all(refs.map(async (r: any) => {
      if (!r || typeof r !== 'object' || r.assetId) return r
      const source = parseMedia(r.base64) ? r.base64 : (parseMedia(r.url) ? r.url : null)
      if (!source) return r
      const defMime = kind === 'image' ? 'image/png' : kind === 'video' ? 'video/mp4' : 'audio/mpeg'
      const id = await saveB64(source, r.mime || defMime, r.name || `${kind}-ref.bin`)
      if (!id) return r
      const storedMime = (am.getAsset(id) as any)?.mimeType
      return { ...r, assetId: id, ...(storedMime ? { mime: storedMime } : {}) }
    }))
  }

  if (Array.isArray(out.imageRefs)) out.imageRefs = await enrichRefs(out.imageRefs, 'image')
  if (Array.isArray(out.videoRefs)) out.videoRefs = await enrichRefs(out.videoRefs, 'video')
  if (Array.isArray(out.audioRefs)) out.audioRefs = await enrichRefs(out.audioRefs, 'audio')
  if (Array.isArray(out.imageRefEntries)) out.imageRefEntries = await enrichRefs(out.imageRefEntries, 'image')

  return out
}

/**
 * In-memory only: re-hydrates base64 fields from the binary asset files
 * referenced by asset IDs, so queue processing can keep uploading media
 * without base64 ever being persisted.
 */
export async function hydratePayloadMedia(payload: any): Promise<any> {
  if (!payload || typeof payload !== 'object') return payload
  const readB64 = async (p: string, mime: string | null): Promise<{ b64: string; mime: string | null } | null> => {
    try {
      const prepared = await prepareUploadFile(p, mime)
      const buf = await fs.readFile(prepared.path)
      if (buf.length > 0) return { b64: buf.toString('base64'), mime: prepared.mime || mime }
    } catch {}
    return null
  }

  const loadAsset = async (assetId?: string) => {
    const file = await resolveAssetFileForUpload(assetId).catch(() => null)
    return file ? readB64(file.path, file.mime) : null
  }
  const loadB64 = async (assetId?: string): Promise<string | null> => (await loadAsset(assetId))?.b64 || null

  if (!payload.imageBase64 && payload.imageAssetId) {
    const b = await loadB64(payload.imageAssetId)
    if (b) payload.imageBase64 = b
  }
  if (!payload.firstFrameBase64 && payload.firstFrameAssetId) {
    const b = await loadB64(payload.firstFrameAssetId)
    if (b) payload.firstFrameBase64 = b
  }
  if (!payload.lastFrameBase64 && payload.lastFrameAssetId) {
    const b = await loadB64(payload.lastFrameAssetId)
    if (b) payload.lastFrameBase64 = b
  }
  if (!payload.audioBase64 && payload.audioAssetId) {
    const b = await loadB64(payload.audioAssetId)
    if (b) payload.audioBase64 = b
  }

  // Refs with no asset id may still point at a file on disk (library picks, element images)
  const loadLocal = async (p?: string, mime?: string) => {
    if (typeof p !== 'string' || !p || p.startsWith('http') || p.startsWith('data:') || !syncFs.existsSync(p)) return null
    return readB64(p, mime || null)
  }

  const hydrateRefs = async (refs: any[]) => {
    if (!Array.isArray(refs)) return
    for (const r of refs) {
      if (!r || typeof r !== 'object' || r.base64) continue
      const loaded = (await loadAsset(r.assetId)) || (await loadLocal(r.localPath, r.mime)) || (await loadLocal(r.url, r.mime))
      if (loaded) {
        r.base64 = loaded.b64
        // A converted video (mkv/webm/mov → mp4) must be sent with its new type
        if (loaded.mime) r.mime = loaded.mime
      }
    }
  }
  await hydrateRefs(payload.imageRefs)
  await hydrateRefs(payload.videoRefs)
  await hydrateRefs(payload.audioRefs)
  await hydrateRefs(payload.imageRefEntries)

  return payload
}
