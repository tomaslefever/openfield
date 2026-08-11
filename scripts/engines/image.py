import os
import sys
import gc
from pathlib import Path
from uuid import uuid4

import torch

class ImageEngine:
    def __init__(self, models_dir: str, device: str = "cuda"):
        self.models_dir = Path(models_dir)
        self.device = device
        self.pipe = None
        self.loaded_model: str | None = None
        self.output_dir = self.models_dir.parent / "outputs"
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _get_model_path(self, model_id: str) -> Path:
        safe_name = model_id.replace("/", "--")
        return self.models_dir / safe_name

    def load(self, model_id: str) -> str:
        if self.loaded_model == model_id and self.pipe is not None:
            return model_id

        if self.pipe is not None:
            self.unload()

        model_path = self._get_model_path(model_id)

        if not model_path.exists():
            raise FileNotFoundError(
                f"Model not found at {model_path}. Download it first via the marketplace."
            )

        try:
            from diffusers import FluxPipeline
            self.pipe = FluxPipeline.from_pretrained(
                str(model_path),
                torch_dtype=torch.bfloat16,
                local_files_only=True,
            ).to(self.device)
        except Exception:
            try:
                from diffusers import AutoPipelineForText2Image
                self.pipe = AutoPipelineForText2Image.from_pretrained(
                    str(model_path),
                    torch_dtype=torch.bfloat16,
                    local_files_only=True,
                ).to(self.device)
            except Exception as e:
                raise RuntimeError(
                    f"Failed to load model {model_id} from {model_path}. "
                    f"Ensure it is a valid diffusers-format model with model_index.json. Error: {e}"
                )

        self.loaded_model = model_id
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        return model_id

    def unload(self) -> None:
        if self.pipe is not None:
            del self.pipe
            self.pipe = None
        self.loaded_model = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def is_loaded(self) -> bool:
        return self.pipe is not None

    def generate(self, params: dict) -> str:
        if self.pipe is None:
            raise RuntimeError("No model loaded. Call load() first.")

        prompt = params.get("prompt", "")
        if not prompt:
            raise ValueError("prompt is required")

        width = int(params.get("width", 1024))
        height = int(params.get("height", 1024))
        steps = int(params.get("steps", 4))
        guidance = float(params.get("guidance", 0))
        seed = int(params.get("seed", -1))

        # Ensure dimensions are multiples of 8 for diffusers
        width = (width // 8) * 8
        height = (height // 8) * 8

        generator = None
        if seed >= 0:
            generator = torch.Generator(
                device=self.device if self.device != "cpu" else "cpu"
            ).manual_seed(seed)

        generate_kwargs = {
            "prompt": prompt,
            "width": width,
            "height": height,
            "num_inference_steps": steps,
        }

        if generator is not None:
            generate_kwargs["generator"] = generator

        if guidance > 0:
            generate_kwargs["guidance_scale"] = guidance

        with torch.inference_mode():
            result = self.pipe(**generate_kwargs)
            image = result.images[0]

        output_filename = f"{uuid4()}.png"
        output_path = self.output_dir / output_filename
        image.save(str(output_path))

        return str(output_path)

    def get_loaded_info(self) -> dict:
        info = {"model": self.loaded_model, "loaded": self.is_loaded()}
        if torch.cuda.is_available():
            free, total = torch.cuda.mem_get_info()
            info["vram_free"] = free
            info["vram_total"] = total
        return info
