import { useRef, useState } from 'react'
import { toast } from 'sonner'

export function aspectStyle(ratio?: string): React.CSSProperties {
  const [w, h] = (ratio || '9:16').split(':')
  return { aspectRatio: w && h ? `${w} / ${h}` : '9 / 16' }
}

export interface PickedAsset {
  assetId?: string
  /** Local path (preferred) or remote URL */
  url: string
}

/** Best on-disk/remote location of an asset row (rows come camelCased from the DB) */
export function assetLocation(asset: any): string {
  return asset?.localPath || asset?.local_path || asset?.filePath || asset?.file_path || asset?.url || ''
}

function readFileB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** Stores a dropped/uploaded file as an asset so the project only keeps a path */
export async function importImageFile(file: File): Promise<PickedAsset | null> {
  if (!file.type.startsWith('image/')) return null
  try {
    const api = (window as any).electronAPI
    const base64 = await readFileB64(file)
    const asset = await api?.assets?.importBase64(base64, file.type || 'image/png', file.name, undefined, 'upload')
    const url = assetLocation(asset)
    return url ? { assetId: asset?.id, url } : null
  } catch (err) {
    console.error('[ContentStudio] Failed to import image:', err)
    toast.error('No se pudo importar la imagen')
    return null
  }
}

/** Library drags carry asset JSON; desktop drags carry files */
export async function assetFromDrop(dt: DataTransfer): Promise<PickedAsset | null> {
  const json = dt.getData('application/x-openfield-asset') || dt.getData('application/x-openfield-assets')
  if (json) {
    try {
      const parsed = JSON.parse(json)
      const asset = Array.isArray(parsed) ? parsed[0] : parsed
      if (asset && (!asset.type || asset.type === 'image')) {
        const url = assetLocation(asset)
        if (url) return { assetId: asset.id, url }
      }
    } catch { /* fall through to files */ }
  }
  const file = Array.from(dt.files || []).find((f) => f.type.startsWith('image/'))
  return file ? importImageFile(file) : null
}

/** Accepts the first file/asset of a drop; ignores internal reorder drags */
export function useMediaDrop(onAsset: (asset: PickedAsset) => void, enabled = true) {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const accepts = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types)
    return types.includes('Files') || types.includes('application/x-openfield-asset') || types.includes('application/x-openfield-assets')
  }
  if (!enabled) return { over: false, handlers: {} }
  return {
    over,
    handlers: {
      onDragEnter: (e: React.DragEvent) => {
        if (!accepts(e)) return
        e.preventDefault()
        depth.current++
        setOver(true)
      },
      onDragOver: (e: React.DragEvent) => {
        if (accepts(e)) e.preventDefault()
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!accepts(e)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setOver(false)
      },
      onDrop: async (e: React.DragEvent) => {
        if (!accepts(e)) return
        e.preventDefault()
        e.stopPropagation()
        depth.current = 0
        setOver(false)
        const asset = await assetFromDrop(e.dataTransfer)
        if (asset) onAsset(asset)
      },
    },
  }
}

export interface ComposerRef {
  base64: string
  mime: string
}

/** Loads stored images as composer references (skips anything not on disk) */
export async function readComposerRefs(assetIds: (string | undefined)[]): Promise<ComposerRef[]> {
  const ids = assetIds.filter((id): id is string => !!id)
  if (ids.length === 0) return []
  try {
    const results = await (window as any).electronAPI?.assets?.readBase64(ids)
    return (results || [])
      .filter((r: any) => r?.base64)
      .map((r: any) => ({ base64: r.base64, mime: r.mime || 'image/png' }))
  } catch {
    return []
  }
}

/** QuickPromptComposer offers 1K/2K/4K; map other resolution labels onto it */
export function composerResolution(res?: string): string {
  return res === '1K' || res === '2K' || res === '4K' ? res : '2K'
}
