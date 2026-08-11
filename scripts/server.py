import argparse
import json
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add parent dir to path so engines module is importable
sys.path.insert(0, str(Path(__file__).parent))
from engines.image import ImageEngine

try:
    from engines.tts import TTSEngine
    KOKORO_AVAILABLE = True
except ImportError:
    TTSEngine = None  # type: ignore
    KOKORO_AVAILABLE = False

app = FastAPI(title="Openfield Local Models API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Global state
image_engine: ImageEngine | None = None
tts_engine: TTSEngine | None = None
MODELS_DIR = ""
DEVICE = "cuda"


# ─── Models ──────────────────────────────────────────────────

class LoadModelRequest(BaseModel):
    model_id: str
    device: str = "cuda"


class GenerateImageRequest(BaseModel):
    model_id: str
    prompt: str
    negative_prompt: str = ""
    width: int = 1024
    height: int = 1024
    steps: int = 4
    guidance: float = 0.0
    seed: int = -1


class GenerateTTSRequest(BaseModel):
    text: str
    voice: str
    speed: float = 1.0


# ─── Health / Status ─────────────────────────────────────────

@app.get("/v1/health")
async def health():
    return {"status": "ok", "python": sys.version}


@app.get("/v1/status")
async def status():
    import torch

    gpu_name = None
    vram_total = 0
    vram_free = 0
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        free, total = torch.cuda.mem_get_info()
        vram_free = free
        vram_total = total

    loaded_info = image_engine.get_loaded_info() if image_engine else {"model": None, "loaded": False}
    tts_info = tts_engine.get_loaded_info() if tts_engine else {"engine": None, "loaded": False}

    return {
        "gpu": gpu_name,
        "vram_total": vram_total,
        "vram_free": vram_free,
        "device": DEVICE,
        "models_dir": MODELS_DIR,
        "loaded_model": loaded_info.get("model"),
        "model_loaded": loaded_info.get("loaded", False),
        "tts_engine": tts_info.get("engine"),
        "tts_loaded": tts_info.get("loaded", False),
    }


# ─── Model Management ────────────────────────────────────────

@app.post("/v1/models/load")
async def load_model(req: LoadModelRequest):
    global image_engine

    if image_engine is None:
        image_engine = ImageEngine(MODELS_DIR, DEVICE)

    try:
        model_id = image_engine.load(req.model_id)
        return {"status": "ok", "model_id": model_id}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/v1/models/unload")
async def unload_model():
    global image_engine
    if image_engine:
        image_engine.unload()
    return {"status": "ok"}


@app.post("/v1/models/info")
async def model_info():
    if image_engine is None:
        return {"model": None, "loaded": False}
    return image_engine.get_loaded_info()


# ─── Image Generation ────────────────────────────────────────

@app.post("/v1/image/generate")
async def generate_image(req: GenerateImageRequest):
    global image_engine

    if image_engine is None:
        image_engine = ImageEngine(MODELS_DIR, DEVICE)

    try:
        if not image_engine.is_loaded() or image_engine.loaded_model != req.model_id:
            image_engine.load(req.model_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load model: {e}")

    try:
        output_path = image_engine.generate(req.model_dump())
        return {
            "status": "ok",
            "output_path": output_path,
            "model_id": req.model_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")


# ─── TTS Generation ──────────────────────────────────────────

@app.get("/v1/tts/voices")
async def tts_voices():
    global tts_engine
    if not KOKORO_AVAILABLE:
        raise HTTPException(status_code=503, detail="Kokoro TTS is not available. Install it with: pip install kokoro")
    if tts_engine is None:
        tts_engine = TTSEngine(MODELS_DIR, DEVICE)
    if not tts_engine.is_installed():
        raise HTTPException(status_code=404, detail="Kokoro-82M model not installed. Download from marketplace.")
    return {"voices": tts_engine.list_voices()}


@app.post("/v1/tts/load")
async def tts_load():
    global tts_engine
    if not KOKORO_AVAILABLE:
        raise HTTPException(status_code=503, detail="Kokoro TTS is not available. Install it with: pip install kokoro")
    if tts_engine is None:
        tts_engine = TTSEngine(MODELS_DIR, DEVICE)
    if not tts_engine.is_installed():
        raise HTTPException(status_code=404, detail="Kokoro-82M model not installed.")
    try:
        status = tts_engine.load()
        return {"status": status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/v1/tts/unload")
async def tts_unload():
    global tts_engine
    if tts_engine:
        tts_engine.unload()
    return {"status": "ok"}


@app.post("/v1/tts/generate")
async def tts_generate(req: GenerateTTSRequest):
    global tts_engine
    if not KOKORO_AVAILABLE:
        raise HTTPException(status_code=503, detail="Kokoro TTS is not available. Install it with: pip install kokoro")
    if tts_engine is None:
        tts_engine = TTSEngine(MODELS_DIR, DEVICE)
    if not tts_engine.is_installed():
        raise HTTPException(status_code=404, detail="Kokoro-82M model not installed.")

    try:
        if not tts_engine.is_loaded():
            tts_engine.load()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load Kokoro: {e}")

    try:
        output_path = tts_engine.generate(req.model_dump())
        return {"status": "ok", "output_path": output_path, "voice": req.voice}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {e}")


# ─── Entry Point ─────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Openfield Local Models Server")
    parser.add_argument("--port", type=int, default=19876)
    parser.add_argument("--models-dir", type=str, required=True)
    parser.add_argument("--device", type=str, default="cuda")
    args = parser.parse_args()

    MODELS_DIR = str(Path(args.models_dir).resolve())
    DEVICE = args.device

    print(f"[server] Starting on port {args.port}")
    print(f"[server] Models dir: {MODELS_DIR}")
    print(f"[server] Device: {DEVICE}")

    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")
