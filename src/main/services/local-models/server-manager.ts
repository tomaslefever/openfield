import { ChildProcess, spawn, exec as execCb } from 'child_process'
import { EventEmitter } from 'events'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { promisify } from 'util'
import { getRawDb, getModelsDir } from '../../db'
import { ServerState, HardwareInfo, PythonInfo } from './types'

const execAsync = promisify(execCb)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ─── Python Detection ──────────────────────────────────────────

function readSetting(key: string): any {
  try {
    const row = getRawDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
    if (!row || !row.value) return null
    try { return JSON.parse(row.value) } catch { return row.value }
  } catch { return null }
}

export async function detectPython(): Promise<PythonInfo | null> {
  const settingsPath = readSetting('pythonPath')

  if (settingsPath && typeof settingsPath === 'string' && fs.existsSync(settingsPath)) {
    return await getPythonInfo(settingsPath)
  }

  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python']

  for (const cmd of candidates) {
    try {
      const { stdout } = await execAsync(`${cmd} --version`)
      if (stdout.includes('Python 3')) {
        return await getPythonInfo(cmd)
      }
    } catch {}
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || ''
    const commonPaths = [
      path.join(localAppData, 'Programs', 'Python', 'Python311'),
      path.join(localAppData, 'Programs', 'Python', 'Python312'),
      path.join(localAppData, 'Programs', 'Python', 'Python313'),
      'C:\\Python311', 'C:\\Python312', 'C:\\Python313',
      'C:\\Program Files\\Python311', 'C:\\Program Files\\Python312', 'C:\\Program Files\\Python313',
    ]
    for (const p of commonPaths) {
      const exe = path.join(p, 'python.exe')
      if (fs.existsSync(exe)) return await getPythonInfo(exe)
    }
  }

  return null
}

async function getPythonInfo(pythonPath: string): Promise<PythonInfo> {
  let version = ''
  let hasCuda = false
  let cudaVersion: string | null = null

  try {
    const { stdout } = await execAsync(`"${pythonPath}" --version`)
    version = stdout.trim().replace('Python ', '')
  } catch {}

  try {
    const code = 'import torch; print("CUDA:" + str(torch.cuda.is_available())); print("VER:" + (torch.version.cuda if torch.cuda.is_available() else "N/A"))'
    const { stdout } = await execAsync(`"${pythonPath}" -c "${code}"`)
    if (stdout.includes('CUDA:True')) {
      hasCuda = true
      const match = stdout.match(/VER:(\S+)/)
      cudaVersion = match ? match[1] : null
    }
  } catch {}

  return { path: pythonPath, version, hasCuda, cudaVersion, missingDeps: [] }
}

export async function checkPipDeps(pythonPath: string): Promise<string[]> {
  const required = [
    'fastapi', 'uvicorn', 'torch', 'torchvision', 'torchaudio',
    'diffusers', 'transformers', 'accelerate', 'safetensors',
    'huggingface_hub', 'pillow', 'numpy', 'kokoro',
  ]
  const missing: string[] = []

  for (const pkg of required) {
    try {
      await execAsync(`"${pythonPath}" -c "import ${pkg.replace(/-/g, '_').replace(/accelerate/g, 'accelerate').replace(/huggingface_hub/g, 'huggingface_hub')}"`)
    } catch {
      missing.push(pkg)
    }
  }

  return missing
}

export async function installPipDeps(
  pythonPath: string,
  packages: string[],
  onLog: (line: string) => void
): Promise<boolean> {
  try {
    const child = spawn(pythonPath, ['-m', 'pip', 'install', '--upgrade', ...packages], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    })

    child.stdout?.on('data', (data) => onLog(data.toString()))
    child.stderr?.on('data', (data) => onLog(data.toString()))

    return new Promise((resolve) => {
      child.on('close', (code) => resolve(code === 0))
      child.on('error', () => resolve(false))
    })
  } catch {
    return false
  }
}

// ─── Hardware Detection ───────────────────────────────────────

export async function detectHardware(): Promise<HardwareInfo> {
  const gpuInfo = await detectGPU()
  return {
    gpu: gpuInfo,
    cpuCores: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'Unknown',
    ramBytes: os.totalmem(),
    platform: process.platform,
    recommendedModels: getRecommendedModels(gpuInfo?.vramBytes || 0),
  }
}

async function detectGPU(): Promise<HardwareInfo['gpu']> {
  let result: HardwareInfo['gpu'] = null

  try {
    const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader')
    const lines = stdout.trim().split('\n')
    if (lines.length > 0 && lines[0].includes(',')) {
      const parts = lines[0].split(',')
      const name = parts[0].trim()
      const memRaw = parts[1].replace(/[^0-9]/g, '')
      const memMB = parseInt(memRaw)
      if (!isNaN(memMB)) {
        result = { name, vramBytes: memMB * 1024 * 1024, cudaVersion: '' }
      }
    }
  } catch {}

  if (result) {
    try {
      const { stdout } = await execAsync('nvidia-smi --query-gpu=compute_cap --format=csv,noheader')
      const cap = stdout.trim()
      if (cap) {
        result = { ...result, cudaVersion: cap }
      }
    } catch {}
    return result
  }

  if (process.platform === 'darwin') {
    return { name: 'Apple Silicon (MPS)', vramBytes: os.totalmem() * 0.75, cudaVersion: 'MPS' }
  }

  return null
}

function getRecommendedModels(vramBytes: number): string[] {
  const vramGB = vramBytes / (1024 ** 3)
  const recs: string[] = []
  if (vramGB >= 24) recs.push('black-forest-labs/FLUX.1-schnell', 'black-forest-labs/FLUX.1-dev')
  else if (vramGB >= 12) recs.push('black-forest-labs/FLUX.1-schnell')
  if (vramGB >= 8) recs.push('Lightricks/LTX-Video (2B)')
  else recs.push('Piper TTS (CPU only, no GPU required)')
  return recs
}

// ─── Server Manager ───────────────────────────────────────────

function getModelsDirLocal(): string {
  return getModelsDir()
}

export class ServerManager extends EventEmitter {
  private process: ChildProcess | null = null
  private port: number
  private state: ServerState

  constructor() {
    super()
    const configuredPort = readSetting('localServerPort')
    this.port = typeof configuredPort === 'number' ? configuredPort : 19876
    this.state = {
      status: 'stopped',
      port: null,
      pid: null,
      gpuName: null,
      vramTotal: null,
      vramFree: null,
      loadedModels: [],
      startedAt: null,
    }
  }

  getState(): Readonly<ServerState> {
    return { ...this.state }
  }

  async start(): Promise<void> {
    if (this.state.status === 'running' || this.state.status === 'starting') return

    this.state.status = 'starting'
    this.emit('status:change', this.state)

    const python = await detectPython()
    if (!python) {
      this.state.status = 'error'
      this.emit('status:change', this.state)
      throw new Error('Python 3.10+ not found. Please install Python from python.org')
    }

    // Find server script relative to project root
    const possiblePaths = [
      path.join(__dirname, '..', '..', '..', '..', 'scripts', 'server.py'),
      path.join(app.getAppPath(), 'scripts', 'server.py'),
      path.join(process.cwd(), 'scripts', 'server.py'),
    ]

    let serverScript: string | null = null
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) { serverScript = p; break }
    }

    if (!serverScript) {
      this.state.status = 'error'
      this.emit('status:change', this.state)
      throw new Error('Server script not found: scripts/server.py')
    }

    // Ensure Python deps are installed before spawning the server
    const missing = await checkPipDeps(python.path)
    if (missing.length > 0) {
      this.emit('server:stdout', `Installing missing Python packages: ${missing.join(', ')}\n`)
      const ok = await installPipDeps(python.path, missing, (line) => {
        this.emit('server:stdout', line)
      })
      if (!ok) {
        this.state.status = 'error'
        this.emit('status:change', this.state)
        throw new Error(`Failed to install Python packages: ${missing.join(', ')}`)
      }
    }

    const device = readSetting('localModelsDevice') || 'cuda'
    const modelsDir = getModelsDirLocal()

    this.process = spawn(python.path, [
      serverScript,
      '--port', String(this.port),
      '--models-dir', modelsDir,
      '--device', device,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    })

    this.process.stdout?.on('data', (data) => this.emit('server:stdout', data.toString()))
    this.process.stderr?.on('data', (data) => this.emit('server:stderr', data.toString()))

    this.process.on('exit', (code) => {
      this.state.status = 'stopped'
      this.state.pid = null
      this.state.loadedModels = []
      this.emit('status:change', this.state)
      if (code !== 0 && code !== null) {
        this.emit('server:crash', code)
      }
    })

    this.state.pid = this.process.pid!

    await this.waitForReady(30_000)

    this.state.status = 'running'
    this.state.port = this.port
    this.state.startedAt = Date.now()
    this.emit('status:change', this.state)
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.killProcess(this.process)
      this.process = null
    }
    this.state.status = 'stopped'
    this.state.loadedModels = []
    this.state.pid = null
    this.emit('status:change', this.state)
  }

  panicKill(): void {
    // Aggressive kill — SIGKILL/TASKKILL /F to process tree
    if (this.process) {
      if (process.platform === 'win32' && this.process.pid) {
        try { execCb(`taskkill /PID ${this.process.pid} /T /F`) } catch {}
        // Also kill any orphaned python processes that might be stuck on GPU
        try { execCb('taskkill /IM python.exe /F 2>nul') } catch {}
      } else {
        try { this.process.kill('SIGKILL') } catch {}
      }
      this.process = null
    }
    this.state.status = 'stopped'
    this.state.loadedModels = []
    this.state.pid = null
    this.emit('status:change', this.state)
  }

  private killProcess(child: ChildProcess): void {
    if (process.platform === 'win32' && child.pid) {
      try { execCb(`taskkill /PID ${child.pid} /T /F`) } catch {}
    } else {
      try { child.kill('SIGTERM') } catch {}
    }
  }

  async restart(): Promise<void> {
    await this.stop()
    await sleep(1000)
    await this.start()
  }

  private async waitForReady(timeoutMs: number): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`http://localhost:${this.port}/v1/health`)
        if (res.ok) return
      } catch {}
      await sleep(500)
    }
    throw new Error('Local model server failed to start within timeout')
  }
}

let instance: ServerManager | null = null

export function getServerManager(): ServerManager {
  if (!instance) instance = new ServerManager()
  return instance
}
