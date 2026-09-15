export function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = Math.min(2, buffer.numberOfChannels)
  const sampleRate = buffer.sampleRate
  const data = new Float32Array(buffer.length * numChannels)
  for (let ch = 0; ch < numChannels; ch++) {
    const src = buffer.getChannelData(ch)
    for (let i = 0; i < src.length; i++) data[i * numChannels + ch] = src[i]
  }
  const blockAlign = numChannels * 2
  const byteRate = sampleRate * blockAlign
  const out = new ArrayBuffer(44 + data.length * 2)
  const view = new DataView(out)
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + data.length * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, data.length * 2, true)
  let off = 44
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]))
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    off += 2
  }
  return out
}

export function audioBufferToBase64(buffer: AudioBuffer): { base64: string; mime: string } {
  const wav = encodeWav(buffer)
  const bytes = new Uint8Array(wav)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return { base64: btoa(binary), mime: 'audio/wav' }
}

export function sliceAudioBuffer(buffer: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const start = Math.max(0, Math.floor(startSec * buffer.sampleRate))
  const end = Math.min(buffer.length, Math.floor(endSec * buffer.sampleRate))
  if (end - start < 1) return buffer
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, ch) =>
    buffer.getChannelData(ch).slice(start, end)
  )
  const trimmed = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: channels[0].length,
    sampleRate: buffer.sampleRate,
  })
  channels.forEach((data, ch) => trimmed.copyToChannel(data, ch))
  return trimmed
}

export function decodeAudioFile(file: File): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de audio'))
    reader.onload = async () => {
      try {
        const audioCtx = new AudioContext({ sampleRate: 44100 })
        const decoded = await audioCtx.decodeAudioData(reader.result as ArrayBuffer)
        resolve(decoded)
      } catch {
        reject(new Error('Formato de audio no soportado'))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

export function decodeBase64Audio(base64: string): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    try {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const audioCtx = new AudioContext({ sampleRate: 44100 })
      audioCtx.decodeAudioData(bytes.buffer as ArrayBuffer)
        .then(resolve)
        .catch(() => reject(new Error('No se pudo decodificar el audio')))
    } catch {
      reject(new Error('No se pudo decodificar el audio'))
    }
  })
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
