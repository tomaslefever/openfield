import * as path from 'path'

/**
 * ffmpeg-static / ffprobe-static resolve their binary from __dirname, which in a packaged build
 * points inside app.asar. Electron cannot spawn an executable from inside the archive (ENOENT);
 * electron-builder ships the real binary in app.asar.unpacked, so every spawn goes through here.
 */
function unpacked(binPath: string): string {
  return binPath.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
}

function staticBinary(pkg: string, fallback: string): string {
  try {
    const mod = require(pkg)
    const p = typeof mod === 'string' ? mod : mod?.path
    return p ? unpacked(p) : fallback
  } catch {
    return fallback
  }
}

export function ffmpegBinary(): string {
  return staticBinary('ffmpeg-static', 'ffmpeg')
}

export function ffprobeBinary(): string {
  return staticBinary('ffprobe-static', 'ffprobe')
}
