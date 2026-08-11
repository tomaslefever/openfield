import { spawn, exec as execCb } from 'child_process'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { promisify } from 'util'
import * as https from 'https'
import { TTSRequest, PiperVoice } from '../types'
import { getPiperDir as getAppPiperDir } from '../../../db'

const execAsync = promisify(execCb)

const PIPER_RELEASES: Record<string, { url: string; exeName: string }> = {
  win32: {
    url: 'https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_windows_amd64.zip',
    exeName: 'piper.exe',
  },
  darwin: {
    url: 'https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_macos_x64.tar.gz',
    exeName: 'piper',
  },
  linux: {
    url: 'https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_linux_x64.tar.gz',
    exeName: 'piper',
  },
}

const PIPER_VOICES_REPO = 'rhasspy/piper-voices'

function getPiperDirLocal(): string {
  return getAppPiperDir()
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const destDir = path.dirname(destPath)
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        https.get(res.headers.location!, (redirectRes) => {
          const file = fs.createWriteStream(destPath)
          redirectRes.pipe(file)
          file.on('finish', () => { file.close(); resolve() })
          file.on('error', reject)
        }).on('error', reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      const file = fs.createWriteStream(destPath)
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', reject)
    }).on('error', reject)
  })
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  // Use Node built-in if available, otherwise try PowerShell's Expand-Archive on Windows
  if (process.platform === 'win32') {
    try {
      await execAsync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`)
      return
    } catch {}
  }

  // Fallback: try using system unzip/tar
  try {
    if (zipPath.endsWith('.tar.gz')) {
      await execAsync(`tar -xzf "${zipPath}" -C "${destDir}"`)
    } else if (zipPath.endsWith('.zip')) {
      await execAsync(`unzip -o "${zipPath}" -d "${destDir}"`)
    }
  } catch {
    throw new Error('Failed to extract archive. Please install 7-Zip or WinRAR.')
  }
}

function findPiperExe(dir: string, exeName: string): string | null {
  function search(d: string): string | null {
    if (!fs.existsSync(d)) return null
    const entries = fs.readdirSync(d, { withFileTypes: true })
    for (const e of entries) {
      const full = path.join(d, e.name)
      if (e.isFile() && e.name === exeName) return full
      if (e.isDirectory()) {
        const found = search(full)
        if (found) return found
      }
    }
    return null
  }
  return search(dir)
}

export class PiperEngine {
  private piperDir: string

  constructor() {
    this.piperDir = getPiperDirLocal()
  }

  getExePath(): string | null {
    if (!fs.existsSync(this.piperDir)) return null
    const osInfo = PIPER_RELEASES[process.platform] || PIPER_RELEASES.win32
    // Direct path (already extracted)
    const direct = path.join(this.piperDir, 'piper', osInfo.exeName)
    if (fs.existsSync(direct)) return direct
    // Search recursively
    const found = findPiperExe(this.piperDir, osInfo.exeName)
    return found ?? null
  }

  async isInstalled(): Promise<boolean> {
    return this.getExePath() !== null
  }

  async install(onProgress?: (msg: string, pct: number) => void): Promise<void> {
    const osInfo = PIPER_RELEASES[process.platform] || PIPER_RELEASES.win32

    if (!fs.existsSync(this.piperDir)) {
      fs.mkdirSync(this.piperDir, { recursive: true })
    }

    const zipPath = path.join(this.piperDir, 'piper_archive')
    onProgress?.('Downloading Piper binary...', 10)
    await downloadFile(osInfo.url, zipPath)
    onProgress?.('Extracting...', 60)
    await extractZip(zipPath, this.piperDir)
    onProgress?.('Cleaning up...', 90)
    try { fs.unlinkSync(zipPath) } catch {}

    const exePath = this.getExePath()
    if (!exePath) throw new Error('Piper executable not found after install')

    // Make executable on macOS/Linux
    if (process.platform !== 'win32') {
      try { await execAsync(`chmod +x "${exePath}"`) } catch {}
    }

    onProgress?.('Piper installed', 100)
  }

  getAvailableVoices(): PiperVoice[] {
    return [
      { id: 'en_US-lessac-medium', language: 'English', gender: 'female', quality: 'medium', sizeBytes: 50000000, url: '' },
      { id: 'en_US-ryan-high', language: 'English', gender: 'male', quality: 'high', sizeBytes: 70000000, url: '' },
      { id: 'en_US-amy-low', language: 'English', gender: 'female', quality: 'low', sizeBytes: 25000000, url: '' },
      { id: 'es_ES-carlfm-x-low', language: 'Spanish', gender: 'male', quality: 'low', sizeBytes: 30000000, url: '' },
      { id: 'es_MX-claude-x-low', language: 'Spanish (MX)', gender: 'male', quality: 'low', sizeBytes: 28000000, url: '' },
      { id: 'fr_FR-siwis-medium', language: 'French', gender: 'male', quality: 'medium', sizeBytes: 50000000, url: '' },
      { id: 'de_DE-thorsten-medium', language: 'German', gender: 'male', quality: 'medium', sizeBytes: 48000000, url: '' },
      { id: 'ja_JP-jp-medium', language: 'Japanese', gender: 'female', quality: 'medium', sizeBytes: 45000000, url: '' },
      { id: 'zh_CN-huayan-medium', language: 'Chinese', gender: 'female', quality: 'medium', sizeBytes: 52000000, url: '' },
      { id: 'pt_BR-edresson-low', language: 'Portuguese', gender: 'male', quality: 'low', sizeBytes: 25000000, url: '' },
    ]
  }

  getVoicesDir(): string {
    return path.join(this.piperDir, 'voices')
  }

  isVoiceDownloaded(voiceId: string): boolean {
    const modelPath = path.join(this.getVoicesDir(), `${voiceId}.onnx`)
    const configPath = path.join(this.getVoicesDir(), `${voiceId}.onnx.json`)
    return fs.existsSync(modelPath) && fs.existsSync(configPath)
  }

  async downloadVoice(voiceId: string, onProgress?: (pct: number) => void): Promise<void> {
    const voice = this.getAvailableVoices().find(v => v.id === voiceId)
    if (!voice) throw new Error(`Unknown voice: ${voiceId}`)

    const voicesDir = this.getVoicesDir()
    if (!fs.existsSync(voicesDir)) {
      fs.mkdirSync(voicesDir, { recursive: true })
    }

    const [langCode] = voiceId.split('-')
    const baseUrl = `https://huggingface.co/${PIPER_VOICES_REPO}/resolve/main/${langCode}/${voiceId}/${voiceId}`

    onProgress?.(10)
    await downloadFile(`${baseUrl}.onnx`, path.join(voicesDir, `${voiceId}.onnx`))
    onProgress?.(60)

    try {
      await downloadFile(`${baseUrl}.onnx.json`, path.join(voicesDir, `${voiceId}.onnx.json`))
    } catch {
      // Config is optional for some voices
    }

    onProgress?.(100)
  }

  async generate(params: TTSRequest): Promise<string> {
    const exePath = this.getExePath()
    if (!exePath) throw new Error('Piper not installed. Call install() first.')

    const voiceFile = path.join(this.getVoicesDir(), `${params.voice}.onnx`)
    if (!fs.existsSync(voiceFile)) {
      throw new Error(`Voice not downloaded: ${params.voice}. Call downloadVoice() first.`)
    }

    const outputDir = path.join(app.getPath('temp'), 'openfield-tts')
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const outputFile = path.join(outputDir, `tts-${crypto.randomUUID()}.wav`)

    const args = ['--model', voiceFile, '--output_file', outputFile]

    if (params.speed && params.speed !== 1.0) {
      args.push('--length_scale', String(1 / params.speed))
    }

    return new Promise((resolve, reject) => {
      const child = spawn(exePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      child.stdin!.write(params.text)
      child.stdin!.end()

      let stderr = ''
      child.stderr?.on('data', (data) => { stderr += data.toString() })

      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputFile)) {
          resolve(outputFile)
        } else {
          reject(new Error(`Piper exited with code ${code}: ${stderr}`))
        }
      })

      child.on('error', reject)
    })
  }
}
