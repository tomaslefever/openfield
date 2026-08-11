# KIE Studio Desktop — Integración de Modelos Locales Open-Weight



---

## Arquitectura General

```
┌── Renderer (React + Tailwind) ──────────────────────────┐
│  MarketplacePage    ImageGenPage    VideoGenPage         │
│  ModelCard          DownloadProgress  GPUStatus          │
└──────────────────────────┬──────────────────────────────┘
                           │ IPC (contextBridge)
┌── Main Process (Node.js + Electron) ────────────────────┐
│  src/main/services/                                      │
│    ├─ marketplace.ts      ← HuggingFace Hub REST API     │
│    ├─ model-downloader.ts ← resume, progress, checksum   │
│    ├─ model-registry.ts   ← DB de modelos instalados     │
│    ├─ server-manager.ts   ← spawn/kill Python subprocess │
│    ├─ local-inference.ts  ← cliente HTTP → server local  │
│    └─ task-queue.ts       ← [ya existe, adaptar]        │
│                                                          │
│  src/main/ipc/handlers.ts ← [ya existe, extender]        │
└──────────────────────────┬──────────────────────────────┘
                           │ child_process.spawn()
                           │ HTTP localhost:19876
┌── Python Sidecar (subprocess) ──────────────────────────┐
│  scripts/server.py        ← FastAPI, endpoints REST      │
│  scripts/engines/                                        │
│    ├─ image.py             ← Flux, SDXL                  │
│    ├─ video.py             ← LTX-Video                   │
│    └─ audio.py             ← Kokoro, Piper               │
│                                                          │
│  ~/.cache/kie-studio/models/  ← modelos descargados      │
│  ~/.cache/kie-studio/outputs/  ← resultados generados    │
└─────────────────────────────────────────────────────────┘
```

---

## Etapa 0 — Fundamentos (Semana 1-2)

**Objetivo**: Infraestructura minima para que la app pueda descargar y ejecutar un modelo local.

### 0.1 Model Registry (DB local de modelos)

**Archivo**: `src/main/services/model-registry.ts`

```typescript
interface InstalledModel {
  id: string;                        // "black-forest-labs/FLUX.1-schnell"
  pipelineTag: "text-to-image" | "text-to-video" | "text-to-speech";
  displayName: string;               // "FLUX.1 Schnell"
  version: string;                   // "fp16"
  sizeBytes: number;                 // 23900000000
  path: string;                      // ~/.cache/kie-studio/models/flux-schnell/
  installedAt: string;               // ISO date
  lastUsedAt: string;                // ISO date
  license: string;
  minVram: number;                   // 12 (GB)
  engine: "diffusers" | "ltx_video" | "kokoro" | "piper";
  status: "ready" | "downloading" | "error";
  downloadProgress: number;          // 0–100
}
```

**Storage**: Tabla SQLite nueva (misma DB existente via `sql.js`) + archivo `models.json` en cache dir para que Python server tambien lo lea.

```sql
CREATE TABLE IF NOT EXISTS local_models (
  id TEXT PRIMARY KEY,
  pipeline_tag TEXT NOT NULL,
  display_name TEXT NOT NULL,
  version TEXT NOT NULL,
  size_bytes INTEGER,
  path TEXT NOT NULL,
  installed_at TEXT NOT NULL,
  last_used_at TEXT,
  license TEXT,
  min_vram REAL,
  engine TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  download_progress REAL DEFAULT 0
);
```

### 0.2 HuggingFace Marketplace Client

**Archivo**: `src/main/services/marketplace.ts`

Consume la API publica de HF Hub. Sin autenticacion para modelos publicos.

```typescript
class MarketplaceService {
  // Listar modelos por pipeline
  async search(params: {
    pipelineTag: "text-to-image" | "text-to-video" | "text-to-speech";
    query?: string;
    license?: string;
    library?: string;
    sort?: "downloads" | "likes" | "lastModified";
    limit?: number;
    offset?: number;
  }): Promise<MarketplaceModel[]>;

  // Detalle de un modelo
  async getModel(modelId: string): Promise<MarketplaceModel & {
    siblings: { filename: string; size: number }[];
    readme: string;
  }>;

  // Modelos destacados curados por nosotros
  async getCurated(): Promise<MarketplaceModel[]>;
}
```

**Endpoints HF Hub**:
```
GET https://huggingface.co/api/models
  ?pipeline_tag=text-to-image
  &library=diffusers
  &sort=downloads
  &direction=-1
  &limit=20
  &search=flux

GET https://huggingface.co/api/models/{model_id}
  → metadata completa, siblings (archivos), tags, cardData

GET https://huggingface.co/{model_id}/resolve/main/README.md
  → README crudo del modelo
```

### 0.3 Model Downloader

**Archivo**: `src/main/services/model-downloader.ts`

```typescript
class ModelDownloader {
  // Descarga con resume usando Range headers
  async download(modelId: string, options?: {
    onProgress?: (percent: number, speed: string, eta: string) => void;
    filter?: string[];  // ["*.safetensors", "*.json"]
  }): Promise<string>;  // local path

  // Verificar integridad
  async verify(modelId: string): Promise<boolean>;

  // Eliminar modelo
  async uninstall(modelId: string): Promise<void>;

  // Lista de descargas activas
  getActive(): DownloadJob[];
}
```

**Detalles tecnicos**:
- Descarga via `fetch()` con `Range` headers para resume.
- Checksum: HF Hub expone SHA256 en la metadata.
- Usar `TransformStream`/`WritableStream` para escribir a disco sin cargar en memoria.
- Cola de descargas con max 2 concurrentes.

### 0.4 Python Server Manager

**Archivo**: `src/main/services/server-manager.ts`

```typescript
class ServerManager {
  private process: ChildProcess | null = null;
  private port = 19876;

  // Detectar Python (settings → PATH → bundled)
  async findPython(): Promise<string>;

  // Verificar dependencias (torch, fastapi, diffusers, etc.)
  async checkDependencies(): Promise<{ ok: boolean; missing: string[] }>;

  // Instalar dependencias automaticamente
  async installDependencies(onLog: (line: string) => void): Promise<void>;

  // Iniciar servidor
  async start(): Promise<void>;

  // Health check
  async isReady(): Promise<boolean>;

  // Detener
  async stop(): Promise<void>;

  // Reiniciar
  async restart(): Promise<void>;
}
```

### 0.5 Primer Modelo: Piper TTS (sin GPU, sin Python)

**Por que Piper primero**: Es la via mas rapida para validar toda la infraestructura. Piper es un binario C++ (`.exe`), no requiere Python ni GPU. Modelos `.onnx` de ~50MB.

**Archivo**: `src/main/services/local-models/engines/piper.ts`

```typescript
// Piper se llama como child_process directo, sin Python server
// echo "Hello world" | piper --model en_US-lessac-medium.onnx --output_file output.wav
class PiperEngine {
  async generate(text: string, voice: string): Promise<string>;
  async loadVoice(voiceId: string): Promise<void>;
  getVoices(): PiperVoice[];   // 30+ voces en español, inglés, etc
}
```

**Deliverables Etapa 0**:
- [x] Tabla `local_models` en SQLite
- [x] `marketplace.ts` consumiendo HF Hub API
- [x] `model-downloader.ts` con resume y progreso
- [x] `server-manager.ts` detectando Python e instalando deps
- [x] Piper TTS funcionando end-to-end
- [x] IPC handlers basicos para marketplace y download

---

## Etapa 1 — Marketplace UI (Semana 2-3)

**Objetivo**: Interfaz completa para explorar, descargar y gestionar modelos.

### 1.1 Marketplace Page

**Archivo**: `src/renderer/src/pages/MarketplacePage.tsx`

```
┌────────────────────────────────────────────────────────┐
│ 🏪 Model Marketplace                    [Settings] [⚙] │
├────────────────────────────────────────────────────────┤
│ 🔍 [Buscar...]  │ [All ▼] │ [T2I] [T2V] [TTS] │ ...  │
├────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│ │              │ │              │ │              │   │
│ │  FLUX.1      │ │  LTX-Video   │ │  Kokoro 82M  │   │
│ │  schnell     │ │  2B dist     │ │  v1.0        │   │
│ │              │ │              │ │              │   │
│ │  ████░░ 12GB │ │  ████░░ 8GB  │ │  ██░░░ 400MB │   │
│ │  ⬇ 1.5M      │ │  ⬇ 450K      │ │  ⬇ 280K      │   │
│ │  Apache 2.0  │ │  OpenRail    │ │  MIT         │   │
│ │  [Instalar]  │ │  [Instalar]  │ │  [Instalado] │   │
│ └──────────────┘ └──────────────┘ └──────────────┘   │
└────────────────────────────────────────────────────────┘
```

### 1.2 Model Detail Modal

```
┌────────────────────────────────────────┐
│ FLUX.1 [schnell]                  [✕]  │
│ black-forest-labs/FLUX.1-schnell       │
├────────────────────────────────────────┤
│                                        │
│ ### Description                        │
│ FLUX.1 [schnell] is a 4-step distilled │
│ model for fast text-to-image...        │
│                                        │
│ ─── Files ────────────────────────     │
│ ☑ model_index.json         2 KB       │
│ ☑ flux1-schnell.safetensors  23 GB    │
│ ☐ vae/diffusion_pytorch... 320 MB     │
│                                        │
│ ─── Info ──────────────────────────    │
│ License:    Apache 2.0                 │
│ Downloads:  1.5M                       │
│ VRAM:       ~12 GB (Q4) ~24 GB (FP16) │
│ Engine:     diffusers                  │
│ Size:       23.9 GB                    │
│ Updated:    2025-03-15                 │
│                                        │
│ [Cancelar]           [Descargar (23GB)]│
└────────────────────────────────────────┘
```

### 1.3 Download Progress (global)

Componente tipo "bandeja de descargas" accesible desde cualquier pagina.

```tsx
// src/renderer/src/components/DownloadTray.tsx
const downloads = useDownloadStore(); 

// Muestra en sidebar o como toast global:
// ┌─────────────────────────────────────┐
// │ ⬇ FLUX.1 schnell   ████░░░░ 48%   │
// │   4.2 GB / 12 GB · 15 MB/s · 8 min │
// │ ⬇ LTX-Video 2B      ██░░░░░░ 18%   │
// │   1.1 GB / 6.2 GB · 22 MB/s · 4 min│
// └─────────────────────────────────────┘
```

### 1.4 My Models Page

Pagina para ver modelos instalados, ordenar por tamaño/uso, desinstalar.

**Deliverables Etapa 1**:
- [x] `MarketplacePage.tsx` con grid, filtros, busqueda
- [x] `ModelDetailModal.tsx` con info de HF, files, install
- [x] `DownloadTray.tsx` con progress y cancel
- [x] `MyModelsPage.tsx` con gestion de instalados
- [x] Zustand stores: `marketplace-store.ts`, `download-store.ts`
- [x] IPC handlers: `marketplace:search`, `marketplace:detail`, `models:list`, `models:uninstall`

---

## Etapa 2 — Imagen Local con Flux (Semana 3-4)

**Objetivo**: Text-to-image local con Flux funcionando via Python sidecar.

### 2.1 Python Server Base

**Archivo**: `scripts/server.py`

```python
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from engines.image import ImageEngine
from engines.video import VideoEngine
from engines.audio import AudioEngine

app = FastAPI(title="KIE Local Models API")
app.add_middleware(CORSMiddleware, allow_origins=["*"])

image = ImageEngine(models_dir="./models")
video = VideoEngine(models_dir="./models")
audio = AudioEngine(models_dir="./models")

@app.get("/v1/health")
async def health(): return {"status": "ok"}

@app.get("/v1/status")
async def status():
    import torch
    return {
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU",
        "vram_total": torch.cuda.get_device_properties(0).total_mem if torch.cuda.is_available() else 0,
        "vram_free": torch.cuda.mem_get_info()[0] if torch.cuda.is_available() else 0,
        "models_loaded": image.loaded_models + video.loaded_models + audio.loaded_models,
    }

@app.post("/v1/models/load")
async def load_model(req: LoadModelRequest):
    # Cargar modelo en GPU (o CPU). Solo uno a la vez por tipo.
    ...

@app.post("/v1/models/unload")
async def unload_model(req: UnloadModelRequest):
    ...

@app.post("/v1/image/generate")
async def generate_image(req: ImageRequest):
    ...

# ... etc
```

### 2.2 Image Engine

**Archivo**: `scripts/engines/image.py`

Soporta:
- `FLUX.1-schnell` (4 pasos, rapido)
- `FLUX.1-dev` (50 pasos, mas calidad)
- `Lumina Image 2.0` (alternativa ligera)

```python
class ImageEngine:
    def __init__(self, models_dir: str):
        self.pipe = None
        self.models_dir = Path(models_dir)
        self.loaded_model = None

    def load(self, model_id: str, device: str = "cuda"):
        from diffusers import FluxPipeline, Lumina2Pipeline
        import torch

        pipe_cls = {
            "flux": FluxPipeline,
            "lumina": Lumina2Pipeline,
        }[self._detect_family(model_id)]

        self.pipe = pipe_cls.from_pretrained(
            str(self.models_dir / model_id.replace("/", "--")),
            torch_dtype=torch.bfloat16,
        ).to(device)

        self.loaded_model = model_id

    def generate(self, params) -> str:
        image = self.pipe(
            prompt=params.prompt,
            width=params.width,
            height=params.height,
            num_inference_steps=params.steps,
            guidance_scale=params.guidance,
            generator=torch.Generator().manual_seed(params.seed) if params.seed >= 0 else None,
        ).images[0]

        output = f"outputs/{uuid4()}.png"
        image.save(str(self.output_dir / output))
        return output
```

### 2.3 Integracion con la UI existente

Modificar `PromptComposer.tsx` para que el selector de modelos tenga 3 categorias:

```tsx
// En lugar de solo IMAGE_MODELS (hardcodeado), ahora:
const MODEL_CATEGORIES = {
  cloud: IMAGE_MODELS,      // GPT Image, Seedream, Flux Pro, etc (API KIE)
  local: installedModels,   // Flux Schnell, Lumina (modelos descargados)
  local_queue: [],          // modelos descubiertos pero no descargados aun
};
```

- El `ImageGenPage.tsx` existente ya tiene gallery, zoom, bulk ops → reutilizar 100%.
- La unica diferencia es que en lugar de llamar a `api.kie.generateImage()`, llama a `api.local.generateImage()`.

### 2.4 Settings: GPU & Device

**Archivo**: Extender `SettingsPage.tsx`

```
┌────────────────────────────────────────────┐
│ Local Models                          [⚙]  │
├────────────────────────────────────────────┤
│ Device:     [CUDA (NVIDIA RTX 4090) ▼]     │
│ Precision:  [bf16 ▼] [fp16] [fp32] [fp8]  │
│ Max VRAM %: [═══════○──────] 80%          │
│ Models dir: [C:\Users\...\.cache\...] [..] │
│ Python:     [C:\Python311\python.exe]  [..] │
│ Auto-unload after: [5 min ▼]              │
│                                            │
│ ─── Installed Models ───────────────────── │
│ ☑ FLUX.1 schnell    23.9 GB  [Uninstall]  │
│ ☑ Kokoro 82M v1.0   412 MB   [Uninstall]  │
└────────────────────────────────────────────┘
```

**Deliverables Etapa 2**:
- [x] `scripts/server.py` con FastAPI + health/status endpoints
- [x] `scripts/engines/image.py` con Flux schnell/dev + Lumina
- [x] `server-manager.ts` completo (start/stop/restart/deps)
- [x] `local-inference.ts` cliente HTTP para el renderer
- [x] Integracion en `PromptComposer.tsx` (categoria "Local")
- [x] SettingsPage extendido
- [x] GPU status indicator en la UI

---

## Etapa 3 — Video Local con LTX-Video (Semana 4-6)

**Objetivo**: Text-to-video e image-to-video local con LTX.

### 3.1 Video Engine

**Archivo**: `scripts/engines/video.py`

```python
class VideoEngine:
    def load(self, model_id: str):
        # ltxv-2b-0.9.8-distilled, ltxv-13b-0.9.8-distilled, etc
        from ltx_video.inference import InferenceConfig, load_pipeline

        config_path = f"configs/{model_id}.yaml"
        self.pipe = load_pipeline(config_path)
        self.loaded_model = model_id

    def generate(self, params) -> str:
        from ltx_video.inference import InferenceConfig, run_inference

        config = InferenceConfig(
            prompt=params.prompt,
            height=params.height,
            width=params.width,
            num_frames=params.num_frames,
            fps=params.fps,
            seed=params.seed,
            output_path=f"outputs/{uuid4()}.mp4",
        )

        if params.image_path:
            config.conditioning_media_paths = [params.image_path]
            config.conditioning_start_frames = [0]

        run_inference(self.pipe, config)
        return config.output_path
```

### 3.2 Modelos soportados

| Model ID | Engine | VRAM | Duracion |
|---|---|---|---|
| `Lightricks/LTX-Video/ltxv-2b-0.9.8-distilled` | ltx_video | ~8GB | 5-10s |
| `Lightricks/LTX-Video/ltxv-13b-0.9.8-distilled` | ltx_video | ~16GB | 10-30s |
| `Lightricks/LTX-Video/ltxv-13b-0.9.8-distilled-fp8` | ltx_video | ~12GB | 10-60s |

### 3.3 Integracion VideoGenPage

Similar a imagen: agregar categoria "Local" con modelos LTX al `VideoGenPage.tsx`. Reutilizar toda la UI de gallery con thumbstrip, hover-to-play, bulk ops.

**Deliverables Etapa 3**:
- [x] `scripts/engines/video.py` con LTX inference
- [x] Soporte para T2V, I2V, multi-keyframe
- [x] Integracion en `VideoGenPage.tsx`
- [x] Progress durante generacion (pasos de difusion)

---

## Etapa 4 — Audio/TTS Local (Semana 6-7)

**Objetivo**: TTS completo con voces en varios idiomas.

### 4.1 Audio Engines

#### Piper (ya integrado en Etapa 0, CPU, rapido)

```typescript
class PiperEngine {
  // Ya funcionando desde Etapa 0
  // ~30 voces, modelos .onnx de ~50MB
  // Soporte español: es_ES-carlfm-x_low, es_MX-claude-x_low
}
```

#### Kokoro (NN de 82M params, calidad superior)

**Archivo**: `scripts/engines/audio.py`

```python
class KokoroEngine:
    def load(self, model_id: str):
        # Kokoro usa ONNX, se puede cargar con onnxruntime
        # o usar la implementacion de transformers
        from kokoro import KPipeline
        self.pipe = KPipeline(lang_code='a')  # 'a' = american, 'b' = british
        # Tambien soporta español, francés, japonés, chino, coreano

    def generate(self, params) -> str:
        audio = self.pipe(
            text=params.text,
            voice=params.voice,       # "af_heart", "bf_emma", etc
            speed=params.speed or 1.0,
        )
        output = f"outputs/{uuid4()}.wav"
        export(output, output)
        return output
```

### 4.2 Voces por idioma (Piper + Kokoro combinados)

| Idioma | Piper (voces) | Kokoro (voces) |
|---|---|---|
| English | 12+ (male/female) | 10+ (af_*, bf_*, am_*, bm_*) |
| Spanish | 3 (es_ES, es_MX) | 2 |
| French | 2 | 2 |
| German | 2 | Realmente no |
| Japanese | 1 | 2 |
| Chinese | 2 | 2 |
| Korean | 0 | 2 |

### 4.3 UI de TTS

Componente nuevo o integrado en el PromptComposer como pestaña "Audio":

```
┌──────────────────────────────────────────┐
│ Text-to-Speech                           │
├──────────────────────────────────────────┤
│                                          │
│ Model:  [Kokoro 82M ▼] [Piper ▼]       │
│ Voice:  [af_heart (F) ▼] 🔊 Preview     │
│ Speed:  [══════○────────] 1.0x          │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Texto a sintetizar...                │ │
│ │                                      │ │
│ └──────────────────────────────────────┘ │
│                                          │
│                     [▶ Generar] [⏹ Parar]│
└──────────────────────────────────────────┘
```

**Deliverables Etapa 4**:
- [x] Piper funcionando desde Etapa 0 (expandir voces)
- [x] `scripts/engines/audio.py` con KokoroEngine
- [x] UI de TTS en `AudioGenPage.tsx` o tab en PromptComposer
- [x] Voice preview (generar "Hello" rapido para preview)
- [x] Integracion con Cinema Studio (voces para personajes)

---

## Etapa 5 — Polish & UX (Semana 7-8)

### 5.1 Progressive Model Loading

- Los modelos grandes (Flux, LTX) tardan 10-30s en cargar a GPU.
- Mostrar pantalla de carga con tips/estado.
- Mantener el modelo en GPU entre generaciones (configurable auto-unload timeout).

### 5.2 Batch & Queue

- Reutilizar el `task-queue.ts` existente para encolar generaciones locales.
- Max 1 job de imagen/video a la vez (por VRAM), TTS puede correr en paralelo.
- Mostrar cola en la UI: "3 generaciones pendientes..."

### 5.3 Error Handling & Recovery

- Si el Python server crashea → reiniciar automaticamente.
- Si se queda sin VRAM → sugerir modelo mas chico o cambiar precision.
- Si falta Python → guiar al usuario a instalarlo (link a python.org).
- Logs detallados en la `LogsPage.tsx` existente.

### 5.4 Auto-deteccion de Hardware

```typescript
// src/main/services/hardware-check.ts
interface HardwareInfo {
  gpu: { name: string; vram: number; cuda: boolean } | null;
  cpu: { cores: number; ram: number };
  recommendedModels: string[];  // segun VRAM disponible
}
```

### 5.5 Internacionalizacion

- Todos los textos del marketplace y UI local en español e inglés.
- Aprovechar el sistema de i18n si existe, o usar el que ya se usa en Settings.

**Deliverables Etapa 5**:
- [x] Loading states y feedback visual
- [x] Queue integration con task-queue.ts
- [x] Recovery automatico del Python server
- [x] Hardware detection y recomendaciones
- [x] Tests E2E con modelo Piper (rapido, sin GPU)

---

## Resumen de Esfuerzo

| Etapa | Contenido | Esfuerzo | Depende de |
|---|---|---|---|
| **0** | DB, marketplace API, downloader, server-manager, Piper | 1-2 sem | nada |
| **1** | Marketplace UI, download tray, model cards | 1 sem | Etapa 0 |
| **2** | Python server, Flux image generation, integracion UI | 1-2 sem | Etapa 0 |
| **3** | LTX-Video engine, video generation local | 1-2 sem | Etapa 2 |
| **4** | Kokoro TTS, Piper voces, Audio UI | 1 sem | Etapa 2 |
| **5** | Polish, error handling, queue, UX | 1 sem | Etapa 2-4 |

**Total estimado**: 6-8 semanas (dependiendo de complejidad en GPU/bundling).

---

## Riesgos Identificados

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| Bundling Python en Windows es complejo | Alto | Detectar Python del sistema; ofrecer "portable mode" con embeddable Python |
| VRAM insuficiente en GPUs consumer | Alto | GGUF quantized models, fallback a CPU (muy lento pero funcional) |
| Modelos cambian de nombre/repo en HF | Medio | Curated list + auto-redirect de HF |
| electron-builder con Python sidecar | Medio | Python como "extraResource", no empaquetado en ASAR |
| LTX-Video requiere CUDA toolkit especifico | Medio | Documentar requisitos; detectar y warn en startup |
| Licencias (Flux dev = non-commercial) | Bajo | Priorizar modelos Apache/MIT; tag claro en UI |

---

## Modelos Curados (curated list inicial)

```typescript
const CURATED_MODELS = {
  image: [
    { id: "black-forest-labs/FLUX.1-schnell", license: "Apache 2.0" },
    { id: "Alpha-VLLM/Lumina-Image-2.0", license: "Apache 2.0" },
  ],
  video: [
    { id: "Lightricks/LTX-Video", license: "OpenRail-M" },
  ],
  audio: [
    { id: "hexgrad/Kokoro-82M", license: "Apache 2.0" },
    // Piper models: hosted en HF como rhasspy/piper-voices
  ],
};
```

---

## Stack Tecnologico Final

| Capa | Tech |
|---|---|
| Desktop Shell | Electron 43 + TypeScript |
| Frontend | React 19 + Tailwind + shadcn/ui + Zustand + TanStack Query |
| Build | Vite 8 + electron-builder |
| DB | SQLite (sql.js) — ya existente |
| Python Runtime | Python 3.10+ (sistema o embeddable) |
| ML Backend | FastAPI + uvicorn |
| Image Engine | diffusers (FluxPipeline, Lumina2Pipeline) |
| Video Engine | ltx_video (Lightricks) |
| Audio Engine | Kokoro (ONNX) + Piper (C++ binary) |
| Model Download | fetch() + Range headers + SHA256 verify |
| Model Hub | HuggingFace Hub REST API |
