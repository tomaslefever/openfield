# Etapa 2 — Imagen Local con Flux: Subtareas



## 2.0 — Python Server (`scripts/server.py`) [3h]

Mini servidor FastAPI que el manager spawnea via `child_process`. Recibe peticiones de generacion y devuelve la ruta del archivo generado.

### 2.0.1 Instalar dependencias Python

**Archivo**: `scripts/requirements.txt`

```
fastapi>=0.110.0
uvicorn>=0.29.0
diffusers>=0.30.0
transformers>=4.44.0
accelerate>=0.33.0
safetensors>=0.4.0
huggingface_hub>=0.24.0
torch>=2.3.0
pillow>=10.0.0
numpy>=1.26.0
```

### 2.0.2 Servidor base con endpoints

**Archivo**: `scripts/server.py`

```python
import argparse
import uvicorn
from fastapi import FastAPI

app = FastAPI(title="KIE Local Models")

@app.get("/v1/health")
async def health(): return {"status": "ok"}

@app.get("/v1/status")
async def status():
    import torch
    return {
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU",
        "vram_total": torch.cuda.get_device_properties(0).total_mem if torch.cuda.is_available() else 0,
        "vram_free": torch.cuda.mem_get_info()[0] if torch.cuda.is_available() else 0,
        "models_loaded": [],
    }

@app.post("/v1/models/load")
async def load_model(model_id: str, device: str = "cuda"):
    # Carga el pipeline en GPU
    ...

@app.post("/v1/models/unload")
async def unload_model(model_id: str):
    # Libera GPU
    ...

@app.post("/v1/image/generate")
async def generate_image(prompt: str, model_id: str, width: int, height: int, steps: int, guidance: float, seed: int):
    # Genera imagen, guarda en output dir, devuelve path
    ...

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=19876)
    parser.add_argument("--models-dir", type=str, required=True)
    parser.add_argument("--device", type=str, default="cuda")
    args = parser.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=args.port)
```

### 2.0.3 Engine de imagen (Flux + diffusers)

**Archivo**: `scripts/engines/image.py`

```python
class ImageEngine:
    def __init__(self, models_dir: str, device: str = "cuda"):
        self.models_dir = Path(models_dir)
        self.device = device
        self.pipe = None
        self.loaded_model = None

    def load(self, model_id: str):
        from diffusers import FluxPipeline
        import torch
        
        model_path = str(self.models_dir / model_id.replace("/", "--"))
        self.pipe = FluxPipeline.from_pretrained(
            model_path,
            torch_dtype=torch.bfloat16,
        ).to(self.device)
        self.loaded_model = model_id

    def unload(self):
        if self.pipe:
            del self.pipe
            self.pipe = None
        torch.cuda.empty_cache()
        self.loaded_model = None

    def generate(self, params: dict) -> str:
        import torch
        from uuid import uuid4
        
        image = self.pipe(
            prompt=params["prompt"],
            width=params.get("width", 1024),
            height=params.get("height", 1024),
            num_inference_steps=params.get("steps", 4),
            guidance_scale=params.get("guidance", 0),
            generator=torch.Generator().manual_seed(params.get("seed", -1)),
        ).images[0]
        
        output_dir = self.models_dir.parent / "outputs"
        output_dir.mkdir(exist_ok=True)
        output_path = output_dir / f"{uuid4()}.png"
        image.save(str(output_path))
        return str(output_path)
```


## 2.1 — Servicio local-inference en Electron (`src/main/`) [2h]

Capa que habla con el Python server via HTTP desde el main process. Misma interfaz que `kie-api.ts` pero local.

### 2.1.1 Cliente HTTP local

**Archivo**: `src/main/services/local-models/local-inference.ts`

```typescript
import { getServerManager } from './server-manager'

export class LocalInferenceClient {
  private get baseUrl(): string {
    const mgr = getServerManager()
    const state = mgr.getState()
    if (state.status !== 'running' || !state.port) {
      throw new Error('Local model server is not running')
    }
    return `http://localhost:${state.port}`
  }

  async ensureServer(): Promise<void> {
    const mgr = getServerManager()
    if (mgr.getState().status !== 'running') {
      await mgr.start()
    }
  }

  async loadModel(modelId: string, device?: string): Promise<void> {
    await this.ensureServer()
    const res = await fetch(`${this.baseUrl}/v1/models/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: modelId, device: device || 'cuda' }),
    })
    if (!res.ok) throw new Error(`Failed to load model: ${res.statusText}`)
  }

  async generateImage(params: {
    modelId: string
    prompt: string
    width?: number
    height?: number
    steps?: number
    guidance?: number
    seed?: number
  }): Promise<string> {
    await this.ensureServer()
    const model = getModelRegistry().get(params.modelId)
    if (!model) throw new Error(`Model not installed: ${params.modelId}`)

    // Ensure model is loaded
    await this.loadModel(params.modelId)

    const res = await fetch(`${this.baseUrl}/v1/image/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(600_000), // 10 min timeout
    })

    if (!res.ok) throw new Error(`Generation failed: ${await res.text()}`)
    const data = await res.json()
    return data.output_path
  }

  async getStatus() {
    try {
      const res = await fetch(`${this.baseUrl}/v1/status`)
      return await res.json()
    } catch { return null }
  }
}
```

### 2.1.2 Integrar con Task Queue (opcional para MVP)

Agregar tipo `local_image` al `task-queue.ts` existente. O mas simple: invocar directo desde el handler y manejar progress via eventos.


## 2.2 — IPC y preload para generacion local [1h]

### 2.2.1 Handlers nuevos en `ipc/handlers.ts`

```typescript
import { LocalInferenceClient } from '../services/local-models/local-inference'
import { getModelRegistry } from '../services/local-models/model-registry'

const localInference = new LocalInferenceClient()

ipcMain.handle('local:image:generate', async (event, params) => {
  const sender = event.sender
  sender.send('local:image:progress', { status: 'loading_model', progress: 0 })
  
  const outputPath = await localInference.generateImage(params)
  
  // Importar a assets y registrar
  const asset = await getAssetManager().importFile(outputPath, 'image')
  
  // Actualizar metadata del asset con prompt y modelo
  getRawDb().prepare('UPDATE assets SET prompt = ?, model_used = ?, credited_used = 0 WHERE id = ?')
    .run(params.prompt, params.modelId, asset.id)
  
  getModelRegistry().touch(params.modelId)
  sender.send('local:image:completed', asset)
  return asset
})

ipcMain.handle('local:server:status', () => getServerManager().getState())
ipcMain.handle('local:server:start', async () => { await getServerManager().start(); return getServerManager().getState() })
ipcMain.handle('local:server:stop', async () => { await getServerManager().stop(); return getServerManager().getState() })
ipcMain.handle('local:server:loadModel', async (_e, modelId: string) => { await localInference.loadModel(modelId) })
```

### 2.2.2 Preload

Agregar dentro de `local:`:
```typescript
local: {
  // ... existente ...
  imageGenerate: (params: any) => ipcRenderer.invoke('local:image:generate', params),
  serverLoadModel: (modelId: string) => ipcRenderer.invoke('local:server:loadModel', modelId),
}
```

Canales nuevos:
```typescript
'local:image:progress', 'local:image:completed', 'local:image:error',
```


## 2.3 — PromptComposer: agregar modelos locales [2h]

Modificar `PromptComposer.tsx` para que el selector de modelos incluya modelos locales instalados con `pipelineTag === 'text-to-image'`.

### 2.3.1 Cargar modelos locales

```typescript
// En PromptComposer, al montar:
useEffect(() => {
  const api = (window as any).electronAPI
  api?.models.list({ pipelineTag: 'text-to-image' }).then((models: any[]) => {
    const localModels = (models || []).map((m: any) => ({
      id: m.id,
      name: m.displayName,
      category: 'Local',
      cost: 0,
      unit: 'img',
      local: true,
    }))
    setLocalImageModels(localModels)
  })
}, [])
```

### 2.3.2 Model selector con categorias

El dropdown de modelos ahora tiene `Cloud` y `Local` como categorias:

```
┌─────────────────────────────┐
│ CLOUD                       │
│   GPT Image 2               │
│   Flux 2 Pro                │
│   Seedream 5 Pro            │
│ ─────────────────────────  │
│ LOCAL                       │
│   FLUX.1 Schnell      [GPU] │
│   SDXL                [GPU] │
└─────────────────────────────┘
```

### 2.3.3 Indicador de status

Mostrar si el server local esta corriendo y modelo cargado:

```typescript
const [serverStatus, setServerStatus] = useState('stopped')

// Poll status via IPC
useEffect(() => {
  const check = () => api?.local.serverStatus().then((s: any) => setServerStatus(s?.status || 'stopped'))
  check()
  const interval = setInterval(check, 5000)
  return () => clearInterval(interval)
}, [])
```


## 2.4 — ImageGenPage: integracion [1.5h]

Modificar `ImageGenPage.tsx` para que detecte si el modelo seleccionado es local o cloud.

### 2.4.1 Routing de generacion

```typescript
async function handleGenerate(params: any) {
  const isLocal = selectedModel?.local === true

  if (isLocal) {
    const asset = await api.local.imageGenerate({
      modelId: selectedModel.id,
      prompt: params.prompt,
      width: params.width,
      height: params.height,
      steps: params.steps || 4,
      guidance: params.guidance || 3.5,
      seed: params.seed || -1,
    })
    addAsset(asset)
  } else {
    const taskId = await api.kie.generateImage(params)
    // ... logica existente
  }
}
```

### 2.4.2 Progress durante generacion

El handler emite `local:image:progress` y `local:image:completed`. Mostrar estado en la UI:

```
┌────────────────────────────────────────┐
│ ⚡ Generating with FLUX.1 Schnell       │
│ ████████████░░░░░░  Generating...      │
│ Loading model to GPU... (15s)          │
└────────────────────────────────────────┘
```


## 2.5 — Settings: configuracion de modelos locales [1h]

### 2.5.1 Seccion nueva en SettingsPage

```
┌────────────────────────────────────────┐
│ Local Models                           │
├────────────────────────────────────────┤
│ Device:     [CUDA ▼] [CPU] [MPS]      │
│ Precision:  [bf16 ▼]                   │
│ Server port: [19876]                   │
│ Python:     [C:\Python311\python.exe]  │
│                                         │
│ Models dir: [C:\Users\...\models] [..]  │
│ Output dir: [C:\Users\...\outputs] [..] │
│                                         │
│ Server: ● Running  [Stop] [Restart]    │
│ GPU: NVIDIA RTX 4090  23.9 GB free     │
│                                         │
│ Installed models:                      │
│ ☑ FLUX.1 Schnell  23.9 GB [Uninstall] │
│ ☐ SDXL            7.2 GB  [Uninstall] │
└────────────────────────────────────────┘
```


## 2.6 — Verificacion y test [0.5h]

- Iniciar Python server manualmente: `python scripts/server.py --port 19876 --models-dir ...`
- Probar `POST /v1/image/generate` con curl
- Verificar que la imagen se guarda y se importa como asset
- Probar flujo completo: descargar Flux → generar imagen → ver en Library


## Resumen

| # | Subtarea | Archivos | Horas |
|---|---|---|---|
| 2.0 | Python server + Flux engine | `scripts/server.py`, `scripts/engines/image.py`, `requirements.txt` | 3h |
| 2.1 | LocalInferenceClient | `src/main/services/local-models/local-inference.ts` | 2h |
| 2.2 | IPC handlers + preload | `handlers.ts`, `preload/index.ts` | 1h |
| 2.3 | PromptComposer: modelos locales | `PromptComposer.tsx` | 2h |
| 2.4 | ImageGenPage: routing local/cloud | `ImageGenPage.tsx` | 1.5h |
| 2.5 | SettingsPage: config local | `SettingsPage.tsx` | 1h |
| 2.6 | Verificacion | manual | 0.5h |

**Total Etapa 2**: ~11 horas (2-3 dias)
