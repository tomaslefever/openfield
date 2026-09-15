// Copy text to clipboard with a fallback for environments where the async
// Clipboard API is unavailable or blocked (e.g. missing window focus).
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

// Chromium only allows image/png and image/jpeg on clipboard write. Anything
// else (webp — the default storage format — gif, etc.) is re-encoded to PNG
// via canvas before writing.
const CLIPBOARD_SAFE_TYPES = new Set(['image/png', 'image/jpeg'])

function imageToPngBase64(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth || img.width || 1
        canvas.height = img.naturalHeight || img.height || 1
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/png').split(',')[1] || null)
      } catch (err) {
        console.warn('[clipboard] PNG re-encode failed:', err)
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// Copy an image (given as base64 data) to the clipboard as a PNG blob.
export async function copyImage(base64: string, mime: string): Promise<boolean> {
  if (!base64) return false
  try {
    let outBase64 = base64
    let outType = mime || 'image/png'
    if (!CLIPBOARD_SAFE_TYPES.has(outType)) {
      const png = await imageToPngBase64(`data:${outType};base64,${base64}`)
      if (!png) return false
      outBase64 = png
      outType = 'image/png'
    }
    const byteChars = atob(outBase64)
    const bytes = new Uint8Array(byteChars.length)
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i)
    const blob = new Blob([bytes], { type: outType })
    await navigator.clipboard.write([new ClipboardItem({ [outType]: blob })])
    return true
  } catch (err) {
    console.warn('[clipboard] Copy image failed:', err)
    return false
  }
}
