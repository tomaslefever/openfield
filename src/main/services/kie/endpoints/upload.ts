import type { OpenfieldApiClient } from '../client'

const EXT_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/x-wav': 'wav',
}

/**
 * POST /api/file-stream-upload
 * Uploads a base64 file and returns the download URL used as model input.
 */
export async function uploadFileBase64(client: OpenfieldApiClient, base64?: string, mimeType?: string): Promise<string> {
  if (!base64 || typeof base64 !== 'string' || base64.length < 10) {
    console.warn('[OF] uploadFileBase64 called without valid base64 string')
    return ''
  }

  const mime = mimeType || 'image/png'
  const ext = EXT_BY_MIME[mime] || (mime.includes('/') ? mime.split('/')[1] : 'png') || 'png'
  console.log('[OF] uploadFile start, length:', base64.length, 'mime:', mime)

  try {
    // Decode base64 to binary buffer
    const binary = Buffer.from(base64, 'base64')
    const blob = new Blob([binary], { type: mime })

    const formData = new FormData()
    formData.append('file', blob, `file-${Date.now()}.${ext}`)
    formData.append('uploadPath', 'openfield')

    const response = await fetch(`https://kieai.redpandaai.co/api/file-stream-upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${client.apiKey}` },
      body: formData,
    })
    const res = await response.json()
    console.log('[OF] uploadFile result:', res)
    return res.data?.downloadUrl || ''
  } catch (err: any) {
    console.error('[OF] uploadFile error:', err.message)
    return ''
  }
}
