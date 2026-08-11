import gc
import json
import os
import shutil
import sys
import wave
from pathlib import Path
from uuid import uuid4

import numpy as np
import torch


_LANG_MAP: dict[str, str] = {
    'a': 'English (US)',
    'b': 'English (UK)',
    'e': 'Spanish',
    'f': 'French',
    'h': 'Hindi',
    'i': 'Italian',
    'j': 'Japanese',
    'p': 'Portuguese (BR)',
    'z': 'Chinese',
}


def _fix_espeak():
    """Ensure espeak-ng data is reachable at an ASCII path.

    The espeakng-loader wheel hardcodes its CI build path.  We detect
    the real data directory at import-time and, on Windows, copy it to
    ``%PROGRAMDATA%`` if the original path is non-ASCII (e.g. a user
    name like ``Tomás``).  The FastAPI server calls this once at
    startup so every subsequent request sees a healthy espeak-ng.
    """
    if os.environ.get('ESPEAK_DATA_PATH'):
        return

    candidates: list[Path] = []

    try:
        import espeakng_loader
        base = Path(espeakng_loader.__file__).resolve().parent
        candidates.append(base / 'espeak-ng' / '_dynamic' / 'share' / 'espeak-ng-data')
    except ImportError:
        pass

    try:
        import phonemizer
        base = Path(phonemizer.__file__).resolve().parent
        candidates.append(base / 'espeak' / 'espeak-ng-data')
    except ImportError:
        pass

    for p in sys.path:
        if not p:
            continue
        candidates.append(Path(p) / 'espeakng_loader' / 'espeak-ng' / '_dynamic' / 'share' / 'espeak-ng-data')

    src: Path | None = None
    for c in candidates:
        if (c / 'phontab').exists():
            src = c
            break

    if src is None:
        for p in sys.path:
            if not p:
                continue
            for candidate in Path(p).rglob('espeak-ng-data'):
                if candidate.is_dir() and (candidate / 'phontab').exists():
                    src = candidate
                    break
            if src is not None:
                break

    if src is None:
        return

    if sys.platform == 'win32':
        try:
            import espeakng_loader as _el
            base = Path(_el.__file__).resolve().parent
            lib_dir = base / 'espeak-ng' / '_dynamic'
            try:
                os.add_dll_directory(str(lib_dir))
            except Exception:
                pass
            for name in ('libespeak-ng.dll', 'espeak-ng.dll'):
                if (lib_dir / name).exists():
                    os.environ.setdefault('PHONEMIZER_ESPEAK_LIBRARY', str(lib_dir / name))
                    break
        except ImportError:
            pass

        try:
            if str(src).isascii():
                os.environ['ESPEAK_DATA_PATH'] = str(src)
                return
        except Exception:
            pass

        dest = Path(os.environ.get('PROGRAMDATA', 'C:\\ProgramData')) / 'openfield' / 'espeak-ng-data'
        if not (dest / 'phontab').exists():
            dest.mkdir(parents=True, exist_ok=True)
            for item in src.iterdir():
                s = src / item.name
                d = dest / item.name
                if s.is_dir():
                    if not d.exists():
                        shutil.copytree(s, d)
                else:
                    shutil.copy2(s, d)
        os.environ['ESPEAK_DATA_PATH'] = str(dest)
        return

    os.environ['ESPEAK_DATA_PATH'] = str(src)


def _patch_phonemizer():
    """Let phonemizer accept any language/voice without validation.

    On Windows the espeak C library may report an empty voice list
    even with correct data.  This monkey-patch removes the fatal
    validation — the actual phonemization will still raise if espeak
    truly cannot handle the language.
    """
    try:
        from phonemizer.backend.base import BaseBackend
    except ImportError:
        return

    def _init(self, language):
        self._language = language

    BaseBackend._init_language = _init

    try:
        from phonemizer.backend.espeak.wrapper import EspeakWrapper
    except ImportError:
        return

    if getattr(EspeakWrapper, '_openfield_patched', False):
        return

    _orig_set_voice = EspeakWrapper.set_voice

    def _set_voice(self, voice_code):
        try:
            _orig_set_voice(self, voice_code)
        except RuntimeError:
            pass

    EspeakWrapper.set_voice = _set_voice
    EspeakWrapper._openfield_patched = True


# ── Run startup fixes once ────────────────────────────────────
_fix_espeak()
_patch_phonemizer()


class TTSEngine:
    def __init__(self, models_dir: str, device: str = 'cpu'):
        self.models_dir = Path(models_dir)
        self.device = device if device != 'auto' else ('cuda' if torch.cuda.is_available() else 'cpu')
        self.model_dir = self.models_dir / 'hexgrad--Kokoro-82M'
        self.model: object | None = None   # KModel
        self._pipelines: dict[str, object] = {}  # lang_code → KPipeline
        self.output_dir = self.models_dir.parent / 'outputs'
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _lang_code(self, voice_id: str) -> str:
        code = voice_id[0].lower() if voice_id else 'a'
        return code if code in set('abefhijpz') else 'a'

    def is_installed(self) -> bool:
        return (self.model_dir / 'kokoro-v1_0.pth').exists() and (self.model_dir / 'config.json').exists()

    def list_voices(self) -> list[dict]:
        voices_dir = self.model_dir / 'voices'
        if not voices_dir.exists():
            return []
        result: list[dict] = []
        for f in sorted(voices_dir.glob('*.pt')):
            vid = f.stem
            result.append({
                'id': vid,
                'langCode': vid[0] if vid else 'a',
                'language': _LANG_MAP.get(vid[0], 'Unknown'),
                'fileName': f.name,
                'sizeBytes': f.stat().st_size,
            })
        return result

    def load(self) -> str:
        if self.model is not None:
            return 'already_loaded'

        from kokoro import KPipeline
        from kokoro.model import KModel

        cfg = str(self.model_dir / 'config.json')
        weights = str(self.model_dir / 'kokoro-v1_0.pth')

        self.model = KModel(config=cfg, model=weights)
        self.model = self.model.to(self.device).eval()
        self._pipelines.clear()
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        return 'loaded'

    def unload(self) -> None:
        self._pipelines.clear()
        if self.model is not None:
            del self.model
            self.model = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def is_loaded(self) -> bool:
        return self.model is not None

    def get_loaded_info(self) -> dict:
        return {
            'engine': 'kokoro',
            'loaded': self.is_loaded(),
            'voices': len(self.list_voices()),
        }

    def generate(self, params: dict) -> str:
        if not self.is_loaded():
            raise RuntimeError('Kokoro model not loaded. Call load() first.')

        text = params.get('text', '')
        voice = params.get('voice', '')
        speed = float(params.get('speed', 1.0))

        if not text:
            raise ValueError('text is required')
        if not voice:
            raise ValueError('voice is required')

        voice_path = self.model_dir / 'voices' / f'{voice}.pt'
        if not voice_path.exists():
            raise FileNotFoundError(f'Voice not found: {voice}.pt')

        lang = self._lang_code(voice)

        if lang not in self._pipelines:
            from kokoro import KPipeline
            self._pipelines[lang] = KPipeline(lang_code=lang, model=self.model)

        pipeline = self._pipelines[lang]

        chunks = []
        with torch.no_grad():
            for result in pipeline(text, voice=str(voice_path), speed=speed):
                if result.audio is not None:
                    chunks.append(result.audio.cpu())

        if not chunks:
            raise RuntimeError('Kokoro produced no audio')

        audio = torch.cat(chunks)
        peak = audio.abs().max().item()
        if peak > 1.0:
            audio = audio / peak

        pcm = (audio.numpy() * 32767).clip(-32768, 32767).astype(np.int16)

        output_path = self.output_dir / f'kokoro-{uuid4()}.wav'
        with wave.open(str(output_path), 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(24000)
            w.writeframes(pcm.tobytes())

        return str(output_path)
