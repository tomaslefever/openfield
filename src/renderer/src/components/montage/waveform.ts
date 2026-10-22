import { useEffect, useState } from 'react'
import { fileUrl } from '../../services/file-url'

/** Peak buckets per second of source audio */
export const PEAKS_PER_SEC = 50

const cache = new Map<string, Promise<Float32Array | null>>()
let ctx: AudioContext | null = null

/**
 * Raw file bytes. asset:// media responses carry no CORS header, so local library files are
 * read over IPC; remote URLs are fetched directly.
 */
async function readBytes(path: string, assetId?: string): Promise<ArrayBuffer> {
  if (assetId && !/^https?:/.test(path)) {
    const [file] = (await (window as any).electronAPI?.assets.readBase64([assetId])) ?? []
    if (file?.base64) return Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0)).buffer
  }
  return (await fetch(fileUrl(path))).arrayBuffer()
}

/** Normalised peaks (0..1) for a whole audio file, decoded once per path */
function loadPeaks(path: string, assetId?: string): Promise<Float32Array | null> {
  let pending = cache.get(path)
  if (pending) return pending
  pending = (async () => {
    try {
      ctx ??= new AudioContext()
      const audio = await ctx.decodeAudioData(await readBytes(path, assetId))
      const channel = audio.getChannelData(0)
      const buckets = Math.max(1, Math.ceil(audio.duration * PEAKS_PER_SEC))
      const size = Math.max(1, Math.floor(channel.length / buckets))
      const peaks = new Float32Array(buckets)
      let max = 0
      for (let b = 0; b < buckets; b++) {
        let peak = 0
        const from = b * size
        const to = Math.min(channel.length, from + size)
        for (let i = from; i < to; i += 4) {
          const v = Math.abs(channel[i])
          if (v > peak) peak = v
        }
        peaks[b] = peak
        if (peak > max) max = peak
      }
      if (max > 0) for (let b = 0; b < buckets; b++) peaks[b] /= max
      return peaks
    } catch {
      return null
    }
  })()
  cache.set(path, pending)
  return pending
}

export function usePeaks(path: string | undefined, assetId?: string): Float32Array | null {
  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  useEffect(() => {
    if (!path) return
    let alive = true
    loadPeaks(path, assetId).then((p) => alive && setPeaks(p))
    return () => { alive = false }
  }, [path, assetId])
  return peaks
}
