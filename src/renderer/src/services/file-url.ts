export function fileUrl(filePath: string, cacheBust?: number): string {
  if (!filePath) return ''
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath
  const normalized = filePath.replace(/\\/g, '/')
  const qs = cacheBust ? `?t=${cacheBust}` : ''
  return 'asset://localhost/' + normalized + qs
}
