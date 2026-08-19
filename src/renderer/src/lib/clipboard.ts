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

// Copy an image (given as base64 data) to the clipboard as a PNG blob.
export async function copyImage(base64: string, mime: string): Promise<boolean> {
  if (!base64) return false
  try {
    const byteChars = atob(base64)
    const bytes = new Uint8Array(byteChars.length)
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i)
    const type = mime || 'image/png'
    const blob = new Blob([bytes], { type })
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })])
    return true
  } catch {
    return false
  }
}
