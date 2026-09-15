import { useAppStore } from '../stores/app-store'

export interface FileUrlOptions {
  cacheBust?: number
  thumb?: boolean
  scale?: string
}

export function fileUrl(
  filePath: string,
  optionsOrCacheBust?: number | FileUrlOptions
): string {
  if (!filePath) return ''
  if (filePath.startsWith('data:')) return filePath
  if (filePath.startsWith('asset://')) return filePath
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath

  let clean = filePath
  if (clean.startsWith('file:///')) {
    clean = clean.slice(8)
  } else if (clean.startsWith('file://')) {
    clean = clean.slice(7)
  }

  const normalized = clean.replace(/\\/g, '/')
  const options = typeof optionsOrCacheBust === 'number' ? { cacheBust: optionsOrCacheBust } : (optionsOrCacheBust || {})

  const params = new URLSearchParams()
  if (options.cacheBust) {
    params.set('t', String(options.cacheBust))
  }
  if (options.thumb) {
    const scale = options.scale || useAppStore.getState().gridRenderScale || '0.25'
    if (scale !== '1.0') {
      params.set('thumb', '1')
      params.set('scale', scale)
    }
  }

  const qs = params.toString() ? `?${params.toString()}` : ''
  return 'asset://localhost/' + normalized + qs
}

export function srcUrl(
  filePath: string | undefined | null,
  optionsOrCacheBust?: number | FileUrlOptions
): string | undefined {
  if (!filePath) return undefined
  return fileUrl(filePath, optionsOrCacheBust)
}

export function thumbUrl(
  filePath: string | undefined | null,
  cacheBust?: number
): string | undefined {
  if (!filePath) return undefined
  return fileUrl(filePath, { thumb: true, cacheBust })
}
