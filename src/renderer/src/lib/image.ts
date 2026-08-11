// Downscale an image (base64) to fit API limits (Recraft remove-background:
// max 5MB, max 4096px). Returns the same base64 when it already fits.
export function downscaleImage(
  base64: string,
  mime: string,
  maxBytes = 5242880,
  maxDim = 4096
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const { width, height } = img
      const maxBase64Len = Math.ceil(maxBytes / 3) * 4
      const scale = Math.min(1, maxDim / Math.max(width, height))
      if (scale === 1 && base64.length <= maxBase64Len) {
        resolve(base64)
        return
      }
      const w = Math.max(1, Math.round(width * scale))
      const h = Math.max(1, Math.round(height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(base64); return }
      ctx.drawImage(img, 0, 0, w, h)
      let quality = 0.92
      let out = canvas.toDataURL('image/jpeg', quality).split(',')[1]
      while (out.length > maxBase64Len && quality > 0.3) {
        quality -= 0.1
        out = canvas.toDataURL('image/jpeg', quality).split(',')[1]
      }
      resolve(out)
    }
    img.onerror = () => resolve(base64)
    img.src = `data:${mime};base64,${base64}`
  })
}
