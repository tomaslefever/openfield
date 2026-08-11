# Etapa 0 — Fundamentos: Subtareas Detalladas



## 0.0 — Setup de directorios y tipos compartidos

### 0.0.1 Crear directorios

```
src/main/services/local-models/
├── engines/
│   ├── piper.ts
│   ├── image.ts        ← placeholder (Etapa 2)
│   ├── video.ts        ← placeholder (Etapa 3)
│   └── audio.ts        ← placeholder (Etapa 4)
├── marketplace.ts
├── model-downloader.ts
├── model-registry.ts
├── server-manager.ts
└── types.ts

scripts/
├── server.py            ← placeholder (Etapa 2)
├── engines/
│   ├── image.py         ← placeholder (Etapa 2)
│   ├── video.py         ← placeholder (Etapa 3)
│   └── audio.py         ← placeholder (Etapa 4)
└── requirements.txt     ← placeholder (Etapa 2)

src/renderer/src/stores/
└── local-models-store.ts
```

### 0.0.2 Definir tipos compartidos

**Archivo**: `src/main/services/local-models/types.ts`

```typescript
// ─── Enums ──────────────────────────────────────────
export type PipelineTag = 'text-to-image' | 'text-to-video' | 'text-to-speech'
export type ModelEngine = 'diffusers' | 'ltx_video' | 'kokoro' | 'piper'
export type ModelStatus = 'ready' | 'downloading' | 'installing' | 'error'
export type ServerStatus = 'stopped' | 'starting' | 'running' | 'error'

// ─── Modelo instalado ───────────────────────────────
export interface InstalledModel {
  id: string                    // "black-forest-labs/FLUX.1-schnell"
  pipelineTag: PipelineTag
  displayName: string           // "FLUX.1 Schnell"
  description: string
  version: string               // "fp16", "q4_k_m"
  sizeBytes: number
  path: string                  // ruta local absoluta
  installedAt: number           // timestamp
  lastUsedAt: number | null
  license: string               // "apache-2.0", "mit", "openrail"
  minVram: number               // GB
  engine: ModelEngine
  status: ModelStatus
  downloadProgress: number      // 0–100
  errorMessage: string | null
}

// ─── Modelo del marketplace (HF Hub) ────────────────
export interface MarketplaceModel {
  id: string
  pipelineTag: PipelineTag
  displayName: string
  description: string
  author: string
  downloads: number
  likes: number
  license: string
  tags: string[]
  updatedAt: string
  siblings: MarketplaceFile[]
  cardData: Record<string, unknown>
  // Fields added by our curation layer
  recommendedVariant: string | null  // e.g. "fp16"
  minVram: number | null
}

export interface MarketplaceFile {
  filename: string
  size: number
}

// ─── Busqueda en marketplace ────────────────────────
export interface MarketplaceSearchParams {
  pipelineTag?: PipelineTag
  query?: string
  license?: string
  library?: string           // "diffusers", "transformers", "safetensors"
  sort?: 'downloads' | 'likes' | 'lastModified'
  limit?: number
  offset?: number
}

export interface MarketplaceSearchResult {
  models: MarketplaceModel[]
  total: number
  hasMore: boolean
}

// ─── Download job ───────────────────────────────────
export interface DownloadJob {
  modelId: string
  bytesDownloaded: number
  totalBytes: number
  progress: number           // 0–100
  speedBytesPerSec: number
  etaSeconds: number
  status: 'downloading' | 'paused' | 'verifying' | 'completed' | 'error'
  errorMessage: string | null
}

// ─── Server state ───────────────────────────────────
export interface ServerState {
  status: ServerStatus
  port: number | null
  pid: number | null
  gpuName: string | null
  vramTotal: number | null    // bytes
  vramFree: number | null     // bytes
  loadedModels: string[]
  startedAt: number | null
}

// ─── Hardware info ──────────────────────────────────
export interface HardwareInfo {
  gpu: { name: string; vramBytes: number; cudaVersion: string } | null
  cpuCores: number
  cpuModel: string
  ramBytes: number
  platform: string             // "win32", "darwin", "linux"
  recommendedModels: string[]
}

// ─── TTS params ─────────────────────────────────────
export interface TTSRequest {
  text: string
  voice: string                // e.g. "en_US-lessac-medium"
  speed?: number               // 0.5 – 2.0
  outputFormat?: 'wav' | 'mp3'
}

export interface PiperVoice {
  id: string                   // "en_US-lessac-medium"
  language: string             // "English"
  gender: string               // "female"
  quality: 'low' | 'medium' | 'high'
  sizeBytes: number
  url: string                  // HF download URL
}

// ─── Model load params ──────────────────────────────
export interface LoadModelParams {
  modelId: string
  device?: 'cuda' | 'cpu' | 'mps'
  precision?: 'fp32' | 'fp16' | 'bf16' | 'fp8'
}

// ─── CURATED MODELS (hardcoded, curados por nosotros) ───
export const CURATED_MODELS: MarketplaceModel[] = [
  {
    id: 'black-forest-labs/FLUX.1-schnell',
    pipelineTag: 'text-to-image',
    displayName: 'FLUX.1 Schnell',
    description: 'Modelo de 4 pasos para generación rápida de imágenes. Excelente balance calidad-velocidad.',
    author: 'Black Forest Labs',
    downloads: 1_500_000,
    likes: 8_500,
    license: 'apache-2.0',
    tags: ['flux', 'text-to-image', 'fast', 'high-quality'],
    updatedAt: '2025-03-15',
    siblings: [],
    cardData: {},
    recommendedVariant: 'fp16',
    minVram: 12,
  },
  {
    id: 'Lightricks/LTX-Video',
    pipelineTag: 'text-to-video',
    displayName: 'LTX-Video 2B Distilled',
    description: 'Modelo de video generativo. Genera hasta 10s de video en ~30 segundos. Soporta I2V y T2V.',
    author: 'Lightricks',
    downloads: 450_000,
    likes: 3_200,
    license: 'openrail',
    tags: ['ltx', 'video', 'text-to-video', 'image-to-video', 'real-time'],
    updatedAt: '2025-07-16',
    siblings: [],
    cardData: {},
    recommendedVariant: '2b-distilled-fp8',
    minVram: 8,
  },
  {
    id: 'hexgrad/Kokoro-82M',
    pipelineTag: 'text-to-speech',
    displayName: 'Kokoro 82M v1.0',
    description: 'TTS de alta calidad con solo 82M parámetros. Soporta inglés, español, francés, japonés, chino, coreano.',
    author: 'hexgrad',
    downloads: 280_000,
    likes: 1_800,
    license: 'apache-2.0',
    tags: ['tts', 'text-to-speech', 'lightweight', 'multilingual'],
    updatedAt: '2025-01-10',
    siblings: [],
    cardData: {},
    recommendedVariant: null,  // Kokoro se instala via pip
    minVram: 1,
  },
]
```


## 0.1 — Migración de base de datos

### 0.1.1 Agregar tabla `local_models` y settings

Modificar `src/main/db/index.ts`, función `runMigrations()`. Agregar al array `tables`:

```sql
CREATE TABLE IF NOT EXISTS local_models (
  id TEXT PRIMARY KEY,
  pipeline_tag TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT DEFAULT '',
  version TEXT NOT NULL,
  size_bytes INTEGER DEFAULT 0,
  path TEXT NOT NULL,
  installed_at INTEGER NOT NULL,
  last_used_at INTEGER,
  license TEXT DEFAULT '',
  min_vram REAL DEFAULT 0,
  engine TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  download_progress REAL DEFAULT 0,
  error_message TEXT
)
```

Agregar seed settings nuevos al array de `seed.run(...)`:

```typescript
seed.run('localModelsDir', JSON.stringify(''), now)
seed.run('pythonPath', JSON.stringify(''), now)
seed.run('enableLocalModels', JSON.stringify(false), now)
seed.run('localServerPort', JSON.stringify(19876), now)
seed.run('localModelsDevice', JSON.stringify('cuda'), now)
seed.run('localModelsPrecision', JSON.stringify('bf16'), now)
seed.run('localModelsAutoUnloadSeconds', JSON.stringify(300), now)
```

### 0.1.2 Agregar migration SQL standalone (para documentación)

Crear `src/main/migrations/0001_local_models.sql`:

```sql
CREATE TABLE IF NOT EXISTS local_models (
  id TEXT PRIMARY KEY,
  pipeline_tag TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT DEFAULT '',
  version TEXT NOT NULL,
  size_bytes INTEGER DEFAULT 0,
  path TEXT NOT NULL,
  installed_at INTEGER NOT NULL,
  last_used_at INTEGER,
  license TEXT DEFAULT '',
  min_vram REAL DEFAULT 0,
  engine TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  download_progress REAL DEFAULT 0,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_local_models_pipeline ON local_models(pipeline_tag);
CREATE INDEX IF NOT EXISTS idx_local_models_status ON local_models(status);
```


## 0.2 — Model Registry (CRUD de modelos instalados)

**Archivo**: `src/main/services/local-models/model-registry.ts`

### 0.2.1 Interfaz

```typescript
export class ModelRegistry {
  // ─── Queries ──────────────────────────────────────
  /** Lista todos los modelos instalados */
  list(filters?: { pipelineTag?: PipelineTag; status?: ModelStatus }): InstalledModel[]

  /** Obtiene un modelo por ID */
  get(id: string): InstalledModel | null

  /** Modelos agrupados por pipeline tag */
  listByPipeline(): Record<PipelineTag, InstalledModel[]>

  /** Verifica si un modelo esta instalado */
  isInstalled(id: string): boolean

  /** Total de espacio usado por modelos (bytes) */
  getTotalSize(): number

  // ─── Mutations ────────────────────────────────────
  /** Registra un modelo recien descargado */
  add(model: Omit<InstalledModel, 'installedAt' | 'lastUsedAt' | 'status' | 'downloadProgress' | 'errorMessage'>): void

  /** Actualiza progreso de descarga */
  updateDownloadProgress(id: string, progress: number): void

  /** Marca como listo */
  markReady(id: string): void

  /** Marca error */
  markError(id: string, error: string): void

  /** Actualiza lastUsedAt */
  touch(id: string): void

  /** Elimina de DB y borra archivos en disco */
  uninstall(id: string): void
}
```

### 0.2.2 Implementación

Todas las operaciones usan `getRawDb()` como en el resto del código. Sin ORM, solo `raw.prepare(...)`.

```typescript
// Ejemplo de implementacion
import { getRawDb } from '../../db'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

const MODELS_DIR = path.join(app.getPath('userData'), 'kie-studio', 'models')

export class ModelRegistry {
  list(filters?: { pipelineTag?: PipelineTag; status?: ModelStatus }): InstalledModel[] {
    const db = getRawDb()
    let sql = 'SELECT * FROM local_models WHERE 1=1'
    const params: any[] = []
    if (filters?.pipelineTag) { sql += ' AND pipeline_tag = ?'; params.push(filters.pipelineTag) }
    if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status) }
    return db.prepare(sql).all(...params) as unknown as InstalledModel[]
  }

  add(model: Omit<InstalledModel, 'installedAt' | 'lastUsedAt' | 'status' | 'downloadProgress' | 'errorMessage'>): void {
    const db = getRawDb()
    db.prepare(`
      INSERT INTO local_models (id, pipeline_tag, display_name, description, version, size_bytes, path, installed_at, license, min_vram, engine, status, download_progress)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', 0)
    `).run(model.id, model.pipelineTag, model.displayName, model.description, model.version, model.sizeBytes, model.path, Date.now(), model.license, model.minVram, model.engine)
    db.saveSync()
  }

  uninstall(id: string): void {
    const model = this.get(id)
    const db = getRawDb()
    if (model?.path && fs.existsSync(model.path)) {
      fs.rmSync(model.path, { recursive: true, force: true })
    }
    db.prepare('DELETE FROM local_models WHERE id = ?').run(id)
    db.saveSync()
  }

  // ... resto de metodos
}

let registryInstance: ModelRegistry | null = null
export function getModelRegistry(): ModelRegistry {
  if (!registryInstance) registryInstance = new ModelRegistry()
  return registryInstance
}
```

### 0.2.3 Crear directorio de modelos

Agregar en `initDatabase()` de `db/index.ts`:

```typescript
fs.mkdirSync(path.join(dbDir, 'models'), { recursive: true })
```


## 0.3 — Marketplace Client (HuggingFace Hub API)

**Archivo**: `src/main/services/local-models/marketplace.ts`

### 0.3.1 Interfaz

```typescript
export class MarketplaceClient {
  private baseUrl = 'https://huggingface.co/api'

  /** Busqueda con filtros */
  async search(params: MarketplaceSearchParams): Promise<MarketplaceSearchResult>

  /** Detalle de un modelo (incluye lista de archivos) */
  async getModel(modelId: string): Promise<MarketplaceModel>

  /** Obtener README en markdown */
  async getReadme(modelId: string): Promise<string>

  /** Modelos curados (siempre disponibles, sin llamar a la API) */
  getCurated(): MarketplaceModel[]

  /** Mapea la respuesta cruda de HF a nuestro tipo */
  private mapHfModel(raw: any): MarketplaceModel
}
```

### 0.3.2 Endpoints usados

```typescript
// GET https://huggingface.co/api/models
//   ?pipeline_tag=text-to-image
//   &library=diffusers
//   &sort=downloads
//   &direction=-1
//   &limit=20
//   &search=flux
//   &full=false

// GET https://huggingface.co/api/models/{model_id}
//   → id, pipeline_tag, tags, downloads, likes, siblings[], cardData, config

// GET https://huggingface.co/{model_id}/resolve/main/README.md
//   → texto plano del README
```

### 0.3.3 Implementación

```typescript
export class MarketplaceClient {
  async search(params: MarketplaceSearchParams): Promise<MarketplaceSearchResult> {
    const url = new URL(`${this.baseUrl}/models`)
    if (params.pipelineTag) url.searchParams.set('pipeline_tag', params.pipelineTag)
    if (params.query) url.searchParams.set('search', params.query)
    if (params.license) url.searchParams.set('filter', params.license)  // aprox
    if (params.library) url.searchParams.set('library', params.library)
    if (params.sort === 'downloads') url.searchParams.set('sort', 'downloads')
    if (params.sort === 'likes') url.searchParams.set('sort', 'likes')
    if (params.sort === 'lastModified') url.searchParams.set('sort', 'lastModified')
    url.searchParams.set('direction', '-1')
    url.searchParams.set('limit', String(params.limit || 20))
    url.searchParams.set('full', 'false')

    const res = await fetch(url.toString())
    const models = await res.json() as any[]

    return {
      models: models.map(m => this.mapHfModel(m)),
      total: models.length,
      hasMore: models.length === (params.limit || 20),
    }
  }

  async getModel(modelId: string): Promise<MarketplaceModel> {
    const res = await fetch(`${this.baseUrl}/models/${encodeURIComponent(modelId)}`)
    return this.mapHfModel(await res.json())
  }

  private mapHfModel(raw: any): MarketplaceModel {
    return {
      id: raw.id,
      pipelineTag: raw.pipeline_tag || 'text-to-image',
      displayName: (raw.cardData?.pipeline_tag || raw.id).split('/').pop() || raw.id,
      description: raw.cardData?.modelDescription || '',
      author: raw.id.split('/')[0],
      downloads: raw.downloads || 0,
      likes: raw.likes || 0,
      license: raw.cardData?.license || 'unknown',
      tags: raw.tags || [],
      updatedAt: raw.lastModified || '',
      siblings: (raw.siblings || []).map((s: any) => ({ filename: s.rfilename, size: s.size || 0 })),
      cardData: raw.cardData || {},
      recommendedVariant: null,  // el curated list lo setea
      minVram: null,
    }
  }

  getCurated(): MarketplaceModel[] {
    return CURATED_MODELS
  }
}

const marketplaceInstance = new MarketplaceClient()
export function getMarketplaceClient(): MarketplaceClient { return marketplaceInstance }
```


## 0.4 — Model Downloader (descarga con resume)

**Archivo**: `src/main/services/local-models/model-downloader.ts`

### 0.4.1 Interfaz

```typescript
export class ModelDownloader {
  private active: Map<string, DownloadJob> = new Map()
  private maxConcurrent = 2

  /**
   * Inicia la descarga de un modelo desde HuggingFace.
   * Descarga todos los archivos de un repo a una carpeta local.
   * Soporta resume via HTTP Range headers.
   */
  async download(
    modelId: string,
    options?: {
      filter?: string[]                      // ["*.safetensors", "model_index.json"]
      onProgress?: (job: DownloadJob) => void
      onComplete?: (modelId: string, path: string) => void
      onError?: (modelId: string, error: string) => void
    }
  ): Promise<string>                         // path local

  /** Cancela una descarga activa */
  cancel(modelId: string): void

  /** Pausa */
  pause(modelId: string): void

  /** Reanuda */
  resume(modelId: string): void

  /** Jobs activos */
  getActive(): DownloadJob[]

  /** Verifica SHA256 de archivos descargados */
  private async verifyIntegrity(dirPath: string, modelId: string): Promise<boolean>

  /** Descarga un archivo individual */
  private async downloadFile(
    url: string,
    destPath: string,
    expectedSize: number,
    onProgress: (downloaded: number, total: number) => void,
    signal: AbortSignal
  ): Promise<void>
}
```

### 0.4.2 Detalles de implementación

**Descarga individual con resume**:

```typescript
private async downloadFile(
  url: string,
  destPath: string,
  expectedSize: number,
  onProgress: (downloaded: number, total: number) => void,
  signal: AbortSignal
): Promise<void> {
  const destDir = path.dirname(destPath)
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })

  // Verificar si ya existe parcial
  let startByte = 0
  if (fs.existsSync(destPath)) {
    const stat = fs.statSync(destPath)
    if (stat.size === expectedSize) return // ya descargado completo
    startByte = stat.size
  }

  const headers: Record<string, string> = {}
  if (startByte > 0) headers['Range'] = `bytes=${startByte}-`

  const res = await fetch(url, { headers, signal })
  if (res.status === 206 || res.ok) {
    const reader = res.body!.getReader()
    const stream = fs.createWriteStream(destPath, { flags: startByte > 0 ? 'a' : 'w' })
    let downloaded = startByte

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      await new Promise<void>((resolve, reject) => stream.write(value, (err) => err ? reject(err) : resolve()))
      downloaded += value.length
      onProgress(downloaded, expectedSize)
    }

    stream.end()
    await new Promise(resolve => stream.on('finish', resolve))
  }
}
```

**Descarga de todo un repo**:

Se usa el endpoint de HF para listar archivos del repo, con filtro opcional:

```
GET https://huggingface.co/api/models/{model_id}
  → siblings[] tiene la lista de archivos con sus sizes

Cada archivo se descarga de:
  https://huggingface.co/{model_id}/resolve/main/{filename}
```

**Integración con Pipeline Registry**: Cada tipo de modelo (diffusers, ltx_video, etc.) expone una función `getRequiredFiles(modelId: string): string[]` que define qué archivos necesita mínimamente para funcionar.

```typescript
// Ejemplo (se expande en etapas 2-4)
const PIPELINE_FILES: Record<ModelEngine, (modelId: string) => string[]> = {
  diffusers: () => ['model_index.json', '*.safetensors', '*.json', 'tokenizer/**', 'text_encoder/**', 'vae/**'],
  ltx_video: () => ['*.safetensors', '*.yaml', '*.json'],
  kokoro: () => ['*.safetensors', 'config.json', 'tokenizer.json'],
  piper: () => ['*.onnx', '*.json'],
}
```


## 0.5a — Detector de Python y dependencias

**Archivo**: `src/main/services/local-models/server-manager.ts` (primera parte)

### Interfaz del detector

```typescript
interface PythonInfo {
  path: string        // e.g. "C:\\Python311\\python.exe"
  version: string     // e.g. "3.11.5"
  hasCuda: boolean
  cudaVersion: string | null
  missingDeps: string[]  // paquetes que faltan instalar
}

// Funciones standalone (no requieren proceso)
export async function detectPython(): Promise<PythonInfo | null>
export async function checkPipDeps(pythonPath: string): Promise<string[]>
export async function installPipDeps(pythonPath: string, packages: string[], onLog: (line: string) => void): Promise<boolean>
export async function detectHardware(): Promise<HardwareInfo>
```

### Implementación

```typescript
export async function detectPython(): Promise<PythonInfo | null> {
  const db = getRawDb()
  const settingsPath = db.prepare('SELECT value FROM settings WHERE key = ?').get('pythonPath') as any

  // 1. Intentar el path configurado en settings
  let pythonPath = settingsPath?.value ? JSON.parse(settingsPath.value) : ''

  if (pythonPath && fs.existsSync(pythonPath)) {
    return await getPythonInfo(pythonPath)
  }

  // 2. Intentar "python" o "python3" del PATH
  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python']

  for (const cmd of candidates) {
    try {
      const { stdout } = await execAsync(`${cmd} --version`)
      if (stdout.includes('Python 3')) {
        pythonPath = cmd
        return await getPythonInfo(cmd)
      }
    } catch {}
  }

  // 3. Buscar en rutas comunes de Windows
  if (process.platform === 'win32') {
    const commonPaths = [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312'),
      'C:\\Python311', 'C:\\Python312', 'C:\\Program Files\\Python311', 'C:\\Program Files\\Python312',
    ]
    for (const p of commonPaths) {
      const exe = path.join(p, 'python.exe')
      if (fs.existsSync(exe)) return await getPythonInfo(exe)
    }
  }

  return null
}

async function getPythonInfo(pythonPath: string): Promise<PythonInfo> {
  // python --version
  const { stdout: versionOut } = await execAsync(`"${pythonPath}" --version`)

  // python -c "import torch; print(torch.cuda.is_available())"
  let hasCuda = false
  let cudaVersion: string | null = null
  try {
    const { stdout: cudaOut } = await execAsync(
      `"${pythonPath}" -c "import torch; print('CUDA:', torch.cuda.is_available(), torch.version.cuda if torch.cuda.is_available() else 'N/A')"`
    )
    hasCuda = cudaOut.includes('CUDA: True')
    if (hasCuda) {
      cudaVersion = cudaOut.match(/\d+\.\d+/)?.[0] || null
    }
  } catch {}

  return { path: pythonPath, version: versionOut.trim().replace('Python ', ''), hasCuda, cudaVersion, missingDeps: [] }
}
```

### Detección de hardware

```typescript
export async function detectHardware(): Promise<HardwareInfo> {
  const os = await import('os')
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
  // Intentar via nvidia-smi
  try {
    const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader')
    const lines = stdout.trim().split('\n')
    if (lines.length > 0 && lines[0].includes(',')) {
      const [name, memRaw] = lines[0].split(',')
      const memMB = parseInt(memRaw.replace(/[^0-9]/g, ''))
      return { name: name.trim(), vramBytes: memMB * 1024 * 1024, cudaVersion: '' }
    }
  } catch {}
  // Fallback: check macOS MPS
  if (process.platform === 'darwin') {
    return { name: 'Apple Silicon (MPS)', vramBytes: 0, cudaVersion: 'MPS' }
  }
  return null
}

function getRecommendedModels(vramBytes: number): string[] {
  const vramGB = vramBytes / (1024 ** 3)
  const recs: string[] = []
  if (vramGB >= 24) recs.push('FLUX.1-schnell', 'FLUX.1-dev')
  else if (vramGB >= 12) recs.push('FLUX.1-schnell-q4', 'SDXL')
  else if (vramGB >= 8) recs.push('Lumina-Image-2.0')
  else recs.push('TTS-only (no image gen)')
  if (vramGB >= 8) recs.push('LTX-Video-2B')
  return recs
}
```


## 0.5b — Server Manager (ciclo de vida del proceso Python)

Continuación de `src/main/services/local-models/server-manager.ts`

```typescript
export class ServerManager extends EventEmitter {
  private process: ChildProcess | null = null
  private port: number
  private state: ServerState

  constructor() {
    super()
    this.port = 19876
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

  getState(): Readonly<ServerState> { return { ...this.state } }

  /**
   * Inicia el servidor Python.
   * 1. Detecta o usa Python configurado
   * 2. Verifica/instala dependencias (fastapi, uvicorn, torch, diffusers...)
   * 3. Spawnea `python scripts/server.py --port {port}`
   * 4. Poll GET /v1/health hasta que responda
   */
  async start(): Promise<void> {
    if (this.state.status === 'running') return
    this.state.status = 'starting'
    this.emit('status:change', this.state)

    const python = await detectPython()
    if (!python) throw new Error('Python 3.10+ not found. Install from python.org')

    // Verificar dependencias
    const deps = [
      'fastapi', 'uvicorn', 'torch', 'torchvision', 'torchaudio',
      'diffusers', 'transformers', 'accelerate', 'safetensors',
      'huggingface_hub', 'pillow', 'numpy',
    ]
    const missing = await checkPipDeps(python.path)
    if (missing.length > 0) {
      this.emit('deps:installing', missing)
      await installPipDeps(python.path, missing, (line) => this.emit('deps:log', line))
    }

    // Spawn
    const serverScript = path.join(__dirname, '..', '..', '..', 'scripts', 'server.py')
    this.process = spawn(python.path, [
      serverScript,
      '--port', String(this.port),
      '--models-dir', MODELS_DIR,
      '--device', 'cuda',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    })

    this.process.stdout?.on('data', (data) => this.emit('server:stdout', data.toString()))
    this.process.stderr?.on('data', (data) => this.emit('server:stderr', data.toString()))
    this.process.on('exit', (code) => {
      this.state.status = 'stopped'
      this.emit('status:change', this.state)
      if (code !== 0) this.emit('server:crash', code)
    })

    this.state.pid = this.process.pid!

    // Esperar readiness (max 30s)
    await this.waitForReady(30_000)
    this.state.status = 'running'
    this.state.port = this.port
    this.state.startedAt = Date.now()
    this.emit('status:change', this.state)
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM')
      // Windows no tiene SIGTERM, usar taskkill
      if (process.platform === 'win32') {
        try { await execAsync(`taskkill /PID ${this.process.pid} /T /F`) } catch {}
      }
      this.process = null
    }
    this.state.status = 'stopped'
    this.state.loadedModels = []
    this.emit('status:change', this.state)
  }

  /** Hace polling del health endpoint hasta que el server responda */
  private async waitForReady(timeoutMs: number): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`http://localhost:${this.port}/v1/health`)
        if (res.ok) return
      } catch {}
      await sleep(500)
    }
    throw new Error('Server failed to start within timeout')
  }
}

// Singleton
let instance: ServerManager | null = null
export function getServerManager(): ServerManager {
  if (!instance) instance = new ServerManager()
  return instance
}
```


## 0.6 — Piper TTS Engine (primer modelo funcionando)

### 0.6.1 Descarga del binario Piper

**Archivo**: `src/main/services/local-models/engines/piper.ts`

Piper es un binario C++ standalone. No requiere Python ni GPU.

Estrategia para obtener Piper:

```typescript
// URLs de releases precompiladas (GitHub Releases)
const PIPER_RELEASE_URL = 'https://github.com/rhasspy/piper/releases/download/v1.2.0'

const PIPER_BINARIES: Record<string, string> = {
  win32: `${PIPER_RELEASE_URL}/piper_windows_amd64.zip`,
  darwin: `${PIPER_RELEASE_URL}/piper_macos_x64.tar.gz`,
  linux: `${PIPER_RELEASE_URL}/piper_linux_x64.tar.gz`,
}

// Voces disponibles en HF Hub: https://huggingface.co/rhasspy/piper-voices
const PIPER_VOICES_REPO = 'rhasspy/piper-voices'
// Cada voz es un archivo .onnx + .onnx.json en:
// https://huggingface.co/rhasspy/piper-voices/resolve/main/{lang}/{lang_XX}-{voice}-{quality}.onnx
```

### 0.6.2 Implementación

```typescript
// Voces curadas (subset inicial)
const PIPER_VOICES: PiperVoice[] = [
  { id: 'en_US-lessac-medium', language: 'English', gender: 'female', quality: 'medium', sizeBytes: 50_000_000, url: '' },
  { id: 'en_US-ryan-high', language: 'English', gender: 'male', quality: 'high', sizeBytes: 70_000_000, url: '' },
  { id: 'es_ES-carlfm-x-low', language: 'Spanish', gender: 'male', quality: 'low', sizeBytes: 30_000_000, url: '' },
  { id: 'es_MX-claude-x-low', language: 'Spanish (MX)', gender: 'male', quality: 'low', sizeBytes: 28_000_000, url: '' },
  { id: 'fr_FR-siwis-medium', language: 'French', gender: 'male', quality: 'medium', sizeBytes: 50_000_000, url: '' },
  { id: 'de_DE-thorsten-medium', language: 'German', gender: 'male', quality: 'medium', sizeBytes: 48_000_000, url: '' },
  { id: 'ja_JP-jp-medium', language: 'Japanese', gender: 'female', quality: 'medium', sizeBytes: 45_000_000, url: '' },
  { id: 'zh_CN-huayan-medium', language: 'Chinese', gender: 'female', quality: 'medium', sizeBytes: 52_000_000, url: '' },
]

export class PiperEngine {
  private piperExe: string
  private voicesDir: string

  constructor() {
    this.piperExe = path.join(app.getPath('userData'), 'kie-studio', 'piper', 'piper.exe')
    this.voicesDir = path.join(app.getPath('userData'), 'kie-studio', 'piper', 'voices')
  }

  async isInstalled(): Promise<boolean> {
    return fs.existsSync(this.piperExe)
  }

  /** Descarga e instala Piper (binario + voces) */
  async install(onProgress?: (msg: string, pct: number) => void): Promise<void> {
    const url = PIPER_BINARIES[process.platform] || PIPER_BINARIES.win32
    const destDir = path.dirname(this.piperExe)
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
    if (!fs.existsSync(this.voicesDir)) fs.mkdirSync(this.voicesDir, { recursive: true })

    // Descargar y extraer ZIP
    onProgress?.('Downloading Piper binary...', 10)
    const zipPath = path.join(destDir, 'piper.zip')
    // ... download + extract logic
    onProgress?.('Piper installed', 100)
  }

  /** Lista de voces disponibles */
  getAvailableVoices(): PiperVoice[] { return PIPER_VOICES }

  /** Verifica si una voz esta descargada */
  isVoiceDownloaded(voiceId: string): boolean {
    return fs.existsSync(path.join(this.voicesDir, `${voiceId}.onnx`))
  }

  /** Descarga una voz */
  async downloadVoice(voiceId: string, onProgress?: (pct: number) => void): Promise<void> {
    const voice = PIPER_VOICES.find(v => v.id === voiceId)
    if (!voice) throw new Error(`Unknown voice: ${voiceId}`)
    // URL: rhasspy/piper-voices/resolve/main/{lang}/{id}.onnx
    const [lang] = voiceId.split('-')
    const url = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${lang}/${voiceId}/${voiceId}.onnx`
    // ... download logic usando fetch
  }

  /** Genera un archivo de audio WAV */
  async generate(params: TTSRequest): Promise<string> {
    const voiceFile = path.join(this.voicesDir, `${params.voice}.onnx`)
    const outputPath = path.join(app.getPath('temp'), `tts-${crypto.randomUUID()}.wav`)

    // echo "texto" | piper --model voz.onnx --output_file output.wav
    const child = spawn(this.piperExe, [
      '--model', voiceFile,
      '--output_file', outputPath,
      ...(params.speed ? ['--length_scale', String(1 / params.speed)] : []),
    ], { stdio: ['pipe', 'pipe', 'pipe'] })

    // Enviar texto por stdin
    child.stdin!.write(params.text)
    child.stdin!.end()

    await new Promise<void>((resolve, reject) => {
      child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Piper exited with code ${code}`)))
      child.on('error', reject)
    })

    return outputPath
  }
}
```


## 0.7 — IPC Handlers + Preload

### 0.7.1 Agregar handlers en `src/main/ipc/handlers.ts`

```typescript
// ─── Import ──────────────────────────────────────
import { getModelRegistry } from '../services/local-models/model-registry'
import { getMarketplaceClient } from '../services/local-models/marketplace'
import { getServerManager, detectPython, detectHardware } from '../services/local-models/server-manager'

// Dentro de registerIpcHandlers(), agregar:

// ─── Marketplace ────────────────────────────────
ipcMain.handle('marketplace:search', async (_e, params) => {
  return getMarketplaceClient().search(params)
})

ipcMain.handle('marketplace:getModel', async (_e, modelId: string) => {
  return getMarketplaceClient().getModel(modelId)
})

ipcMain.handle('marketplace:getReadme', async (_e, modelId: string) => {
  try { return await getMarketplaceClient().getReadme(modelId) } catch { return '' }
})

ipcMain.handle('marketplace:getCurated', () => {
  return getMarketplaceClient().getCurated()
})

// ─── Model Registry ─────────────────────────────
ipcMain.handle('models:list', (_e, filters?: { pipelineTag?: string }) => {
  return getModelRegistry().list(filters)
})

ipcMain.handle('models:listByPipeline', () => {
  return getModelRegistry().listByPipeline()
})

ipcMain.handle('models:get', (_e, id: string) => {
  return getModelRegistry().get(id)
})

ipcMain.handle('models:uninstall', async (_e, id: string) => {
  getModelRegistry().uninstall(id)
  return true
})

// ─── Model Download ─────────────────────────────
ipcMain.handle('models:download', async (event, modelId: string, options?: any) => {
  const downloader = getModelDownloader()
  const sender = event.sender

  const path = await downloader.download(modelId, {
    ...options,
    onProgress: (job) => {
      sender.send('models:download:progress', job)
      getModelRegistry().updateDownloadProgress(modelId, job.progress)
    },
    onComplete: (id: string, p: string) => {
      sender.send('models:download:completed', { modelId: id, path: p })
    },
    onError: (id: string, error: string) => {
      sender.send('models:download:error', { modelId: id, error })
      getModelRegistry().markError(id, error)
    },
  })
  return path
})

ipcMain.handle('models:cancelDownload', (_e, modelId: string) => {
  getModelDownloader().cancel(modelId)
  return true
})

ipcMain.handle('models:getActiveDownloads', () => {
  return getModelDownloader().getActive()
})

// ─── Server Manager ─────────────────────────────
ipcMain.handle('local:server:status', () => {
  return getServerManager().getState()
})

ipcMain.handle('local:server:start', async () => {
  await getServerManager().start()
  return getServerManager().getState()
})

ipcMain.handle('local:server:stop', async () => {
  await getServerManager().stop()
  return getServerManager().getState()
})

// ─── System Detection ───────────────────────────
ipcMain.handle('local:detectPython', async () => {
  return detectPython()
})

ipcMain.handle('local:detectHardware', async () => {
  return detectHardware()
})

// ─── Piper TTS ──────────────────────────────────
ipcMain.handle('local:piper:isInstalled', () => {
  return new PiperEngine().isInstalled()
})

ipcMain.handle('local:piper:install', async (event) => {
  const piper = new PiperEngine()
  await piper.install((msg, pct) => event.sender.send('models:download:progress', { modelId: 'piper', progress: pct }))
  return true
})

ipcMain.handle('local:piper:getVoices', () => {
  return new PiperEngine().getAvailableVoices()
})

ipcMain.handle('local:piper:downloadVoice', async (event, voiceId: string) => {
  const piper = new PiperEngine()
  await piper.downloadVoice(voiceId, (pct) => {
    event.sender.send('models:download:progress', { modelId: `piper-voice-${voiceId}`, progress: pct })
  })
  return true
})

ipcMain.handle('local:piper:generate', async (_e, params: TTSRequest) => {
  const piper = new PiperEngine()
  return piper.generate(params)
})
```

### 0.7.2 Extender preload (`src/preload/index.ts`)

Agregar dentro del objeto `electronAPI`:

```typescript
marketplace: {
  search: (params: any) => ipcRenderer.invoke('marketplace:search', params),
  getModel: (modelId: string) => ipcRenderer.invoke('marketplace:getModel', modelId),
  getReadme: (modelId: string) => ipcRenderer.invoke('marketplace:getReadme', modelId),
  getCurated: () => ipcRenderer.invoke('marketplace:getCurated'),
},
models: {
  list: (filters?: any) => ipcRenderer.invoke('models:list', filters),
  listByPipeline: () => ipcRenderer.invoke('models:listByPipeline'),
  get: (id: string) => ipcRenderer.invoke('models:get', id),
  download: (modelId: string, options?: any) => ipcRenderer.invoke('models:download', modelId, options),
  cancelDownload: (modelId: string) => ipcRenderer.invoke('models:cancelDownload', modelId),
  getActiveDownloads: () => ipcRenderer.invoke('models:getActiveDownloads'),
  uninstall: (id: string) => ipcRenderer.invoke('models:uninstall', id),
},
local: {
  serverStatus: () => ipcRenderer.invoke('local:server:status'),
  serverStart: () => ipcRenderer.invoke('local:server:start'),
  serverStop: () => ipcRenderer.invoke('local:server:stop'),
  detectPython: () => ipcRenderer.invoke('local:detectPython'),
  detectHardware: () => ipcRenderer.invoke('local:detectHardware'),
  piperIsInstalled: () => ipcRenderer.invoke('local:piper:isInstalled'),
  piperInstall: () => ipcRenderer.invoke('local:piper:install'),
  piperGetVoices: () => ipcRenderer.invoke('local:piper:getVoices'),
  piperDownloadVoice: (voiceId: string) => ipcRenderer.invoke('local:piper:downloadVoice', voiceId),
  piperGenerate: (params: any) => ipcRenderer.invoke('local:piper:generate', params),
},
```

Y agregar los canales de eventos en `validChannels`:

```typescript
const validChannels = [
  'kie:task:progress', 'kie:task:completed', 'kie:task:failed',
  'export:progress', 'export:complete', 'export:error',
  'error', 'notification',
  'models:download:progress', 'models:download:completed', 'models:download:error',  // NUEVOS
]
```

### 0.7.3 Actualizar tipo `ElectronAPI`

Agregar las nuevas propiedades al tipo exportado y al tipo global `Window.electronAPI` para TypeScript.


## 0.8 — Integración en el ciclo de vida de la app

### 0.8.1 Modificar `src/main/index.ts`

```typescript
// En app.whenReady():
import { getServerManager } from './services/local-models/server-manager'

// Iniciar servidor al arrancar si hay modelos locales o la feature esta habilitada
const enableLocal = readSetting('enableLocalModels')
if (enableLocal) {
  try {
    await getServerManager().start()
  } catch (e) {
    console.warn('[local-models] Server failed to start:', e)
  }
}
```

### 0.8.2 Limpiar en `app.on('before-quit')`

```typescript
app.on('before-quit', async () => {
  await getServerManager().stop()
})
```

### 0.8.3 Agregar una página placeholder mínima

**Archivo**: `src/renderer/src/pages/MarketplacePage.tsx` (placeholder, se desarrolla en Etapa 1)

```tsx
export default function MarketplacePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Model Marketplace</h1>
      <p className="text-muted-foreground">Coming soon. Browse and install open-weight models from HuggingFace.</p>
    </div>
  )
}
```

Agregar ruta en `App.tsx` y entrada en sidebar (oculta si `enableLocalModels === false`).


## 0.9 — Tests y verificación

### 0.9.1 Verificaciones manuales

```
1. Abrir DevTools → ver que la tabla local_models existe
2. Llamar marketplace:search desde DevTools → ver respuesta de HF
3. Descargar un archivo chico de HF → ver resume funcionar
4. Iniciar Piper TTS → ver archivo WAV generado
5. Detectar Python → ver path en console
6. Iniciar/detener server manager → ver proceso spawn/kill
```

### 0.9.2 Archivos creados en Etapa 0

```
CREADOS:
  src/main/services/local-models/
    ├── types.ts                     (~250 líneas)
    ├── model-registry.ts            (~120 líneas)
    ├── marketplace.ts               (~100 líneas)
    ├── model-downloader.ts          (~200 líneas)
    ├── server-manager.ts            (~300 líneas)
    └── engines/
        └── piper.ts                 (~180 líneas)
  src/main/migrations/
    └── 0001_local_models.sql        (~20 líneas)
  scripts/
    ├── server.py                    (placeholder)
    ├── engines/                     (placeholders)
    └── requirements.txt             (placeholder)
  src/renderer/src/stores/
    └── local-models-store.ts        (~80 líneas)
  src/renderer/src/pages/
    └── MarketplacePage.tsx          (placeholder)

MODIFICADOS:
  src/main/db/index.ts               (~30 líneas: migration + seed + mkdir)
  src/main/ipc/handlers.ts           (~100 líneas: nuevos handlers)
  src/preload/index.ts               (~40 líneas: nuevas APIs)
  src/main/index.ts                  (~10 líneas: server start/stop)
  src/renderer/src/App.tsx           (~10 líneas: ruta marketplace)
```

## Resumen de Subtareas

| # | Subtarea | Archivos | Esfuerzo |
|---|---|---|---|
| 0.0 | Directorios + tipos | `types.ts`, directorios | 1h |
| 0.1 | DB migration | `db/index.ts`, `0001_*.sql` | 30m |
| 0.2 | Model Registry | `model-registry.ts` | 2h |
| 0.3 | Marketplace client | `marketplace.ts` | 2h |
| 0.4 | Model downloader | `model-downloader.ts` | 3h |
| 0.5a | Python/hardware detector | `server-manager.ts` (parte 1) | 2h |
| 0.5b | Server manager | `server-manager.ts` (parte 2) | 3h |
| 0.6 | Piper TTS engine | `engines/piper.ts` | 3h |
| 0.7 | IPC handlers + preload | `handlers.ts`, `preload/index.ts` | 2h |
| 0.8 | App integration | `index.ts`, `App.tsx` | 1h |
| 0.9 | Tests + verificación | manual | 1h |

**Total Etapa 0**: ~20 horas (3-4 días de trabajo)
