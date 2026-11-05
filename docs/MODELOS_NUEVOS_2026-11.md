# Modelos nuevos para Openfield, por plataforma (relevado 2026-11-05)

## Cómo leer este documento

**Acciones:**
- **CORREGIR**: el ID o el precio actual está mal.
- **RETIRAR**: el modelo está apagado o va a apagarse.
- **REEMPLAZAR**: hay una versión nueva que sustituye a una que ya tenemos.
- **AGREGAR**: modelo nuevo en esa plataforma.
- **+MODO**: modo nuevo (i2v, ref, edit, extend…) de un modelo que ya integramos.
- **VERIFICAR**: no confirmado en página oficial; hay que probarlo con una sola generación antes de integrarlo.

**Prioridad:**
- **P0**: urgente o roto.
- **P1**: recomendado.
- **P2**: útil.
- **P3**: nicho u opcional.

**Precios:** los que publica cada plataforma, en USD. En KIE 1 crédito ≈ $0.005; en APIMart 1 crédito ≈ $0.10 (nivel Gold).

**Fuentes:** páginas oficiales de cada plataforma (catálogos, docs, pricing, changelogs) y, para las fechas de lanzamiento, prensa marcada (2ª).

---

## 1. KIE (api.kie.ai)

| P | Acción | Modelo | Model id / endpoint | Precio | Detalle |
|---|---|---|---|---|---|
| P0 | RETIRAR | Sora 2 (KIE) | `sora-2` | — | OpenAI apagó la Videos API el 24-sep-2026 |
| P0 | VERIFICAR / RETIRAR | Imagen 4 Fast | `imagen4-fast` | — | Google apagó Imagen 4 en Gemini API el 17-ago. Probar si KIE todavía responde |
| P1 | +MODO | **Kling 4.0 Flash** | `kling-4.0/flash-reference-to-video`, `kling-4.0/flash-keyframe-to-video` | 17 cr/s ($0.085); 11.3 cr/s ($0.0565) con video de entrada | 720p, 3–20 s, audio nativo. Unos 40% más barato que Kling 4.0 |
| P1 | +MODO | Kling 4.0 Keyframe | `kling/v4-keyframe-to-video` (sv) | no publicado | Hoy solo tenemos la variante reference-to-video |
| P1 | REEMPLAZAR | **GPT Image 2.6** Flare / Sunburst / Economy (sustituye a 2.5) | `gpt-image-2-6/{flare,sunburst}-{text-to-image,image-to-image}`, `gpt-image-2-6/economy-text-to-image` | desde 6 cr ($0.03); Economy 5 cr ($0.025) | OpenAI lo anunció el 4-nov. Genera SVG y GIF; "50% más rápido" |
| P1 | REEMPLAZAR | **OmniHuman 2.0** (sustituye a 1.5) | `omnihuman-2-0` | 14 cr/s ($0.07) | Imagen + audio de 4–300 s, 720p. La mitad del precio de la 1.5 (27 cr/s) |
| P1 | AGREGAR | **Seedance 2.5 Draft** | `bytedance/seedance-2-5-draft` | tarifa de 480p (28 cr/s) | Borrador 480p y luego final 1080p con `draft_task_id` (válido 7 días). Es el flujo de Landking |
| P1 | AGREGAR | **Gemini Omni Video + Character + Audio** | `gemini-omni-video`; `/api/v1/omni/character/create`, `/omni/audio/create` | desde 63 cr ($0.315) por video; crear personaje o voz es gratis | Hasta 7 refs, voces y personajes que se mantienen entre tomas, 720p/1080p/4K |
| P1 | AGREGAR | **Vidu Q4 Preview** | `vidu-q4/image-to-video`, `vidu-q4/reference-to-video` | 540p $0.036/s · 720p $0.076 · 1080p $0.096 · 4K $0.312 | Hasta 15 imágenes + 3 audios, 3–16 s, 4K nativo |
| P1 | AGREGAR | **FLUX 3 Klein** | `flux-3/klein-text-to-image`, `flux-3/klein-edit-image` | $0.008 (1K) / $0.0125 (2K) / $0.0325 (4K) | Pesos abiertos, edición con 1–10 refs |
| P1 | REEMPLAZAR | **Grok Imagine Video 1.5 Preview** (sustituye a Grok Imagine) | `grok-imagine-video-1-5-preview` | 480p $0.012/s · 720p $0.0225/s | i2v, loop, 7 refs, keyframes, hasta 1080p. La ficha tiene precios contradictorios a 720p |
| P2 | AGREGAR | Nemotron 3.5 Transcribe | `nemotron-3-5-transcribe` | $0.0015/min | STT barato para autocaptions; alternativa a whisper-1 |
| P2 | +MODO | MiniMax H3 i2v / ref | `minimax-h3/image-to-video`, `minimax-h3/reference-to-video` | — | Hoy solo tenemos t2v |
| P2 | REEMPLAZAR | PixVerse V6 Max (sustituye a V6) | `pixverse-v6-max/{text,image}-to-video` | 1080p $0.088/s; $0.112/s con audio | Tier de calidad |
| P2 | +MODO | Wan 3.0 Video Prime | `wan/3-0-video-prime` | 480p $0.061/s · 720p $0.126 · 1080p $0.252 | 2–30 s, refs de img/video/audio |
| P2 | AGREGAR | HappyHorse 1.1 | `happyhorse-1-1/{text-to-video,reference-to-video}` | 720p $0.1125/s · 1080p $0.145/s | — |
| P2 | AGREGAR | ElevenLabs V3 Text-to-Dialogue | `elevenlabs/text-to-dialogue-v3` | $0.07 por 1.000 caracteres | Diálogo multi-voz (The Transition) |
| P2 | AGREGAR | InfiniteTalk | `/market/...` | 3 cr/s ($0.015) | Lipsync muy barato |
| P2 | AGREGAR | Seedream 5.0 Flash + Layer Decomposition | `seedream/5-flash-text-to-image`, `seedream/5-pro-layer-decomposition` | desde $0.016 | Separa la imagen en capas transparentes |
| P2 | AGREGAR | Kling 3.0 Motion Control | `/market/...` | 22.7 cr/s ($0.11) | Motion transfer |
| P3 | REEMPLAZAR | Hailuo 2.3 Pro/Std (sustituye a Hailuo 02 Pro) | `hailuo/2-3-image-to-video-pro` | desde $0.15 por video | — |
| P3 | REEMPLAZAR | Qwen Image 3.0 Pro (sustituye a Qwen Image 3) | `qwen3-pro/*` (sv) | — | Mejor con texto denso |
| P3 | AGREGAR | Gemini 3.8 Flash-Lite TTS | `google/gemini-3-8-flash-lite-tts` (sv) | $0.35 por M tokens | — |
| P3 | AGREGAR | Topaz Image/Video, Grok Upscale, Recraft Crisp Upscale | `topaz/*`, `grok-imagine/upscale`, `recraft/crisp-upscale` | Topaz video $0.04/s; Crisp $0.0025 | Upscales |
| P3 | AGREGAR | Kling AI Avatar, Volcengine Lip Sync, Wan 2.2 Animate | `/market/...` | Avatar 10.1 cr/s; lipsync 8 cr/s | — |
| P3 | +MODO | Suno: Persona, Custom Voice, Stems, MIDI, Cover, Mashup | `/suno-api/*` | — | Ya tenemos Suno V6 |

## 2. fal (fal.ai)

| P | Acción | Modelo | Endpoint | Precio | Detalle |
|---|---|---|---|---|---|
| P0 | CORREGIR precio | FLUX 3 Max | `blackforestlabs/flux-3-max/*` | **desde el 8-nov: 720p $0.17/s, 1080p $0.29/s** | La promo ($0.0425 / $0.0725) termina el 7-nov. Sigue sin probar en vivo |
| P0 | CORREGIR id | Seedance 2.5 (Fal) | hoy `fal-ai/bytedance/seedance-2-5` (404) → `bytedance/seedance-2.5/us/{text-to-video,image-to-video,reference-to-video}` | 480p $0.2205/s · 720p $0.473 · 1080p $1.164 | Los precios coinciden; el ID no. Hasta 30 s |
| P0 | CORREGIR id y precio | Wan 3.0 Video (Fal) | hoy `fal-ai/wan/v3/*` (404) → `alibaba/wan-3.0/{text,image}-to-video` | 480p $0.05/s · 720p $0.10 · 1080p $0.20 | El catálogo cobra $0.05/s a 720p; el precio real es el doble |
| P1 | VERIFICAR id | Gemini TTS, xAI TTS, Sonilo, CassetteAI | `fal-ai/gemini-tts` → `fal-ai/gemini-3.1-flash-tts`; `fal-ai/xai-tts` → `xai/tts/v1`; `fal-ai/sonilo` → `sonilo/v1.1/text-to-music`; `fal-ai/cassette-ai` → `cassetteai/music-generator` | — | fal muestra otros IDs (sv) |
| P1 | +MODO | **Kling 4.0 Flash** | `kling/v4/flash/{text-to-video,image-to-video,reference-to-video,video-to-video}` | 720p $0.094/s; $0.063/s con video de referencia | 3–20 s, solo 720p |
| P1 | REEMPLAZAR | **GPT Image 2.6** Flare/Sunburst (y 2.5), sustituye a GPT Image 2 (Fal) | `openai/gpt-image-2.6/{flare,sunburst}/{text-to-image,edit}` | por tokens; 2.5 Flare 1024²: low $0.006 … max $0.21 | — |
| P1 | REEMPLAZAR | **FLUX 3 Image + Edit** (sustituye a FLUX.1 dev/schnell/pro/Kontext) | `blackforestlabs/flux-3/text-to-image`, `/edit-image` | $0.048 a 1 MP | 1–10 refs, hasta 4K |
| P1 | REEMPLAZAR | **Ideogram 4.5 + Edit** (sustituye a Ideogram v2 y v2 Turbo) | `ideogram/v4.5`, `ideogram/v4.5/edit` | low $0.03 / med $0.06 / high $0.22 | Mejor tipografía, 4 refs |
| P1 | AGREGAR | **Krea 3** | `krea/v3/text-to-image` | $0.025/MP | Estética top |
| P1 | AGREGAR | **H3 Max Relight** | `minimax/h3-max/relight` | 480p $0.05/s … 2K $0.32/s | Re-ilumina un video conservando movimiento y audio. Ninguna otra plataforma de la app lo tiene |
| P1 | AGREGAR | **Sync-3** (sustituye a lipsync-2-pro) | `fal-ai/sync-lipsync/v3`, `/v3/image-to-video` | $8/min | Lipsync 4K |
| P1 | AGREGAR | **Lyria 3.5** | `google/lyria-3.5` | $0.10 por generación | — |
| P1 | AGREGAR | **ByteDance Video Upscaler** | `fal-ai/bytedance-upscaler/upscale/video` | 1080p $0.0072/s … 4K $0.0288/s (Pro ×10; 60 fps ×2) | El upscale a 4K más barato |
| P2 | +MODO | H3 Max: i2v, extend, Director | `minimax/h3-max/{image-to-video,extend-video,director,reference-director}` | Director $0.08/s, mínimo $4.80 | Hoy tenemos t2v y ref |
| P2 | AGREGAR | H3 Max Lip Sync | `minimax/h3-max/lip-sync/image-to-video` | $0.05–0.32/s | Avatar parlante hasta 2K |
| P2 | AGREGAR | H3 Max Recast | `minimax/h3-max/recast` | 768p $0.30/s · 1080p $0.45/s | Reemplaza personas conservando cámara y audio |
| P2 | REEMPLAZAR | LTX 2.5 Fast (sustituye a LTX-Video 2B y HunyuanVideo) | `lightricks/ltx-2.5/image-to-video/fast` | 720p $0.09/s … 4K $0.30/s, con audio | — |
| P2 | AGREGAR | Grok Imagine Video 1.5 | `xai/grok-imagine-video/v1.5/{text,image,reference}-to-video`, `xai/grok-imagine-video/{extend-video,edit-video}` | 480p $0.08/s · 720p $0.14 · 1080p $0.25 | — |
| P2 | +MODO | Kling 3.0 Turbo Pro | `fal-ai/kling-video/v3/turbo/pro/{text,image}-to-video` | 1080p $0.14/s | — |
| P2 | AGREGAR | Seedream 5.0 Pro / Flash / Lite + layerize | `bytedance/seedream/v5/{pro,flash,lite}/{text-to-image,edit}`, `/pro/layerize` | Pro $0.0675–0.135 | No tenemos Seedream en fal |
| P2 | REEMPLAZAR | Fibo 2.0 (sustituye a Bria FIBO) | `bria/fibo-2/generate`, `/edit` | $0.04–0.06 | — |
| P2 | AGREGAR | Ideogram Vector | `ideogram/vector/{text-to-vector,image-to-vector}` | $0.13–0.32 | SVG editable |
| P2 | AGREGAR | MiniMax Speech 2.8 HD/Turbo + voice-clone | `fal-ai/minimax/speech-2.8-hd`, `-turbo`, `fal-ai/minimax/voice-clone` | HD $0.10 por 1.000 caracteres | — |
| P2 | REEMPLAZAR | ElevenLabs Music v2.5 (sustituye a ElevenLabs Music) | `fal-ai/elevenlabs/music/v2.5` | $0.60/min | — |
| P2 | REEMPLAZAR | Stable Audio 3 Medium (sustituye a Stable Audio Open) | `stable-audio-3/medium/text-to-audio` | $0.0376 por audio | Hasta 6 min |
| P3 | AGREGAR | Wan 3.0 Prime, HappyHorse 1.1, Qwen Image 3 | `alibaba/wan-3.0-prime/image-to-video`, `alibaba/happy-horse/v1.1/*`, `alibaba/qwen-image-3/text-to-image` | $0.068–0.28/s · $0.14–0.18/s · $0.04–0.075 | — |
| P3 | REEMPLAZAR | MiniMax Music 2.6 (sustituye a Music 2.0) | `fal-ai/minimax-music/v2.6` | — | — |
| P3 | AGREGAR | ElevenLabs v3, Qwen3-TTS, Seed Audio 1.0 | `fal-ai/elevenlabs/tts/eleven-v3`, `fal-ai/qwen-3-tts/*`, `bytedance/seed-audio-1.0` | Seed $0.1875/min | — |
| P3 | AGREGAR | Mureka v9.5, ACE-Step | `fal-ai/mureka/v9.5/generate/*`, `fal-ai/ace-step/prompt-to-audio` | ACE $0.0002/s | — |
| P3 | AGREGAR | HeyGen v3 Lipsync, Avatar V, VEED Lipsync v2 | `fal-ai/heygen/v3/lipsync/*`, `fal-ai/heygen/avatar5/digital-twin`, `veed/lipsync/v2` | $0.10/s · $0.10/s · $0.07/s | — |
| P3 | AGREGAR | Topaz Video, FLUX Video Upscale, SeedVR2 | `topaz/upscale/video/*`, `blackforestlabs/flux-video-upscale`, `fal-ai/seedvr/upscale/*` | FLUX $0.084–0.474/s | — |

## 3. Replicate (api.replicate.com)

| P | Acción | Modelo | Model id | Precio | Detalle |
|---|---|---|---|---|---|
| P1 | VERIFICAR id | Kling 3.0 / Kling 1.5 Pro | hoy `kling-ai/kling-video-3.0`, `kling-ai/kling-v1.5-pro` → el dueño oficial es `kwaivgi` (`kwaivgi/kling-v3-video`) | — | Puede que hoy fallen (sv) |
| P1 | REEMPLAZAR | **Kling 4.0** (sustituye a Kling 1.5 Pro; agregar junto a 3.0) | `kwaivgi/kling-v4.0` | 720p $0.157/s · 1080p $0.235/s; con video de entrada $0.094 / $0.141 | 3–30 s, 10 keyframes, refs, edición, 21:9 |
| P1 | REEMPLAZAR | **MiniMax H3 Lite / Highspeed** (sustituye a MiniMax Video-01) | `minimax/h3-lite`, `minimax/h3-highspeed` | Lite $0.025–0.04/s; Highspeed $0.06/s; −50% hasta fin de año | t2v, i2v, ref |
| P1 | REEMPLAZAR | **P-Video 2 Pro Avatar** (sustituye a P-Video Avatar) | `prunaai/p-video-2-pro-avatar` | por segundo según resolución | O integrarlo directo en Pruna (ver sección 7) |
| P1 | +MODO | **Veo 3.1 Lite / Fast** | `google/veo-3.1-lite`, `google/veo-3.1-fast` | Lite $0.05/s (720p) · $0.08/s (1080p) | Veo con audio a un tercio del precio |
| P1 | REEMPLAZAR | **GPT Image 2.6** Flare / Sunburst | `openai/gpt-image-2.6-flare`, `-sunburst` | no visible | Creado el 4-nov |
| P1 | REEMPLAZAR | **FLUX 3 Image** (sustituye a FLUX.1 Dev/Schnell/1.1 Pro) | `black-forest-labs/flux-3-image` | no visible | — |
| P1 | REEMPLAZAR | **Ideogram 4.5** + precise-edit (sustituye a Ideogram v2 y v2 Turbo) | `ideogram-ai/ideogram-4-5`, `ideogram-ai/ideogram-4-5-precise-edit` | no visible | — |
| P1 | AGREGAR | **Krea 3** | `krea/krea-3` | 1K $0.03–0.05 · 2K $0.06–0.08 | Edición regional, 8 imágenes |
| P2 | REEMPLAZAR | Imagen 4 / Ultra / Fast (sustituye a Imagen 3) | `google/imagen-4`, `-ultra`, `-fast` | — | Verificar que sigue vivo (Google apagó Imagen 4 en Gemini API) |
| P2 | REEMPLAZAR | Recraft V4.1 (+ pro, svg) (sustituye a Recraft V3) | `recraft-ai/recraft-v4.1` | — | — |
| P2 | REEMPLAZAR | Wan 3 / Wan 3 Prime (sustituye a Wan 2.1) | `alibaba/wan-3`, `alibaba/wan-3-prime` | — | Hasta 30 s |
| P2 | REEMPLAZAR | LTX 2.5 Fast (sustituye a LTX-Video) | `lightricks/ltx-2.5-fast` | — | Hasta 20 s, 4K, audio |
| P2 | REEMPLAZAR | Gemini 3.8 Flash TTS (sustituye a 3.1) | `google/gemini-3.8-flash-tts`, `-lite-tts` | — | 30 voces, 2 hablantes |
| P2 | REEMPLAZAR | Lyria 3 Pro (sustituye a Lyria 3) | `google/lyria-3-pro` | — | Canciones de ~3 min (Lyria 3 hace 30 s) |
| P2 | REEMPLAZAR | Inworld Realtime TTS 2 (sustituye a Inworld TTS) | `inworld/realtime-tts-2` | — | — |
| P2 | AGREGAR | PixVerse V6 Max | `pixverse/pixverse-v6-max` | 1080p $0.22/s; $0.28/s con audio | — |
| P2 | AGREGAR | Runway Aleph 2 | `runwayml/aleph-2` | early access | Edición de video v2v |
| P2 | AGREGAR | Seedance 2.5 | `bytedance/seedance-2.5` | no visible | t2v, i2v, ref, edit, extend |
| P3 | AGREGAR | Luma Ray 3.2 | `luma/ray-3.2` | — | HDR y export EXR |
| P3 | AGREGAR | Grok Video 1.5 (+ r2v, extensión) | `xai/grok-imagine-video-1.5`, `xai/grok-imagine-r2v`, `xai/grok-imagine-video-extension` | — | — |
| P3 | AGREGAR | MiniMax Speech 2.8, Chatterbox, Qwen3-TTS (sustituyen a F5, XTTS y Kokoro) | `minimax/speech-2.8-hd`, `resemble-ai/chatterbox`, `qwen/qwen3-tts` | — | TTS modernos |
| P3 | AGREGAR | Familia Pruna (animate / edit / replace / upscale / reference) | `prunaai/p-video-*` | — | Mejor directo en Pruna |
| P3 | AGREGAR | Upscalers de video | `topazlabs/video-upscale`, `bytedance/video-upscaler`, `bria/video-increase-resolution` | — | Alternativas a Crystal Upscaler |

## 4. APIMart (api.apimart.ai)

| P | Acción | Modelo | Model id | Precio | Detalle |
|---|---|---|---|---|---|
| P0 | RETIRAR | Sora 2 (APIMart) | `sora-2` | — | API apagada el 24-sep |
| P0 | VERIFICAR / RETIRAR | Imagen 4.0 (APIMart) | `imagen-4.0-apimart` | — | Apagado en Gemini API el 17-ago |
| P1 | VERIFICAR / REEMPLAZAR | VEO 3 → Veo 3.1 fast / quality / lite | `veo3.1-fast-official`, `veo3.1-quality-official`, `veo3.1-lite-ext` | fast $0.064/s · quality $0.16/s · lite $0.07 por video | Confirmar a qué apunta nuestro `veo3` |
| P1 | VERIFICAR | Nano Banana 2 (APIMart) | `gemini-3.1-flash-image-preview-official` | — | Google lo deprecó el 6-oct |
| P1 | REEMPLAZAR | **Kling V4** (sustituye a Kling v3 y 3.0 Turbo) | `kling-v4` | 720p $0.14/s · 1080p $0.21/s; con video de entrada $0.084 / $0.126 | t2v, i2v + 8 keyframes, ref img/video/audio, **edit, extend**, 3–30 s |
| P1 | REEMPLAZAR | **Gemini Omni 1.2 Flash** (sustituye a 1.1 Flash) | `gemini-omni-1.2-flash` | no publicado | auto/t2v/i2v/ref/edit/extend, hasta 4K. Lanzamiento (sv) |
| P1 | AGREGAR | **Vidu Q4 Preview** | `viduq4-preview` | 540p $0.045/s · 1080p $0.10 · 4K $0.33 | Más barato que KIE salvo a 4K |
| P1 | AGREGAR | **FLUX 3 Image** / **Klein** | `flux-3-image`, `flux-3-image-klein` | $0.038 (1K) … $0.486 (4K); Klein $0.0064 | — |
| P1 | AGREGAR | **Lyria 3.5 / 3 Pro** (Flow Music) | `model: flowmusic`, `version: "lyria-3.5"` | ~$0.06 por generación | Letra, extend, cover, stems, hasta 240 s |
| P1 | AGREGAR | **Nano Banana 2.1** official / ext | `gemini-nano-banana-2.1`, `gemini-nano-banana-2.1-ext` | ext $0.012 | La NB 2.1 más barata |
| P1 | REEMPLAZAR | MiniMax H3 Max (además de H3) | `MiniMax-H3-Max` | 480p $0.038/s · 768p $0.057 · 1080p $0.128 | También `MiniMax-H3-Regeneration` y `MiniMax-H3-Context-IR` |
| P2 | REEMPLAZAR | Grok Imagine Video 1.5 official / ext | `grok-imagine-video-1.5`, `grok-imagine-1.5-video-ext` | official $0.064–0.20/s; ext ~$0.01/s | — |
| P2 | REEMPLAZAR | HappyHorse 1.1 (sustituye a 1.0) | `happyhorse-1.1` | 720p $0.13/s · 1080p $0.172 | Lipsync en 7 idiomas |
| P2 | REEMPLAZAR | PixVerse V6 Max | `pixverse-v6-max` | 1080p $0.078/s; $0.10/s con audio | Más barato que en KIE |
| P2 | +MODO | Wan 3.0 Prime | `wan3.0-video-prime` | 480p $0.051/s · 720p $0.103 · 1080p $0.206 | — |
| P2 | +MODO | Seedance 2.0 Face + Private Avatar | `seedance-2.0-face`; `POST /v1/seedance2/private-avatar` | $0.06/s | Caras reales aprobadas para personajes recurrentes (sv) |
| P2 | AGREGAR | MAI-Image 2.6 / 2.6 Flash / 2.7 | `mai-image-2.6`, `mai-image-2.6-flash`, `mai-image-2.7` | $0.031; Flash $0.016; 2.7 sin precio | 2.7 es top en edición |
| P2 | AGREGAR | Hy-Image 3.5 Preview | `hy-image-v3.5-preview` | $0.019 (1K–2K) · $0.026 (4K) | — |
| P2 | AGREGAR | Qwen Image 3.0 Pro | `qwen-image-3.0-pro` | $0.029–0.057 | — |
| P2 | VERIFICAR | GPT Image 2.6 | `gpt-image-2.6-flare`, `-sunburst` | ~$0.02 a 1K | APIMart lo marca "not yet live" |
| P2 | VERIFICAR | Seedream 5.5 | `seedream-5.5` | no publicado | ByteDance no lo anunció |
| P3 | +MODO | Wan 2.7 R2V / VideoEdit | `wan2.7-r2v`, `wan2.7-videoedit` | $0.066/s | — |
| P3 | +MODO | Hailuo 2.3 Fast, SkyReels V4 Fast | `MiniMax-Hailuo-2.3-Fast`, `skyreels-v4-fast` | $0.025/s · $0.064/s | — |
| P3 | AGREGAR | Muse Video Ext / Muse Image Ext | `muse-video-ext`, `muse-image-ext` | $0.024 por clip de 10 s · $0.0048 | Fabricante desconocido (sv) |
| P3 | AGREGAR | Midjourney | `midjourney` | $0.045 | No es oficial: riesgo |
| P3 | AGREGAR | FLUX 2 Max/Pro/Flex, Kontext Max, Z-Image Turbo, Wan 2.7 Image | `flux-2-max`, … | $0.01–0.064 | — |
| P3 | AGREGAR | Suno V6 | `suno` | — | Segunda vía para Suno (hoy solo en KIE) |

## 5. MachGen (api.machgen.ai)

| P | Acción | Modelo | Model id | Precio | Detalle |
|---|---|---|---|---|---|
| P1 | AGREGAR | **MiniMax H3 Omni** | ficha `machgen/minimax-h3-omni`; ID de API (sv) | $0.02/s (480p y 768p) | t2v, i2v, r2v (9 imágenes + 3 videos + 3 audios), 1–15 s, audio estéreo |
| P1 | REEMPLAZAR | **ElevenLabs v4** (sustituye a Eleven-v3) | ficha `elevenlabs/eleven-v4`; ID (sv) | $0.001 por carácter | TTS y diálogo de hasta 10 voces |
| P2 | AGREGAR | YuE2 | `YuE2-3B`, tarea `T2M` (verificado) | $0.10 por canción | Con letra o instrumental, ~6 min, FLAC |
| P2 | AGREGAR | Vidu-Upscale-Pro | ID (sv) | 1080p $0.059/s · 4K $0.236 · 8K $0.942 | Más barato que Topaz |
| P2 | VERIFICAR | Vidu-Q4-Preview | ya integrado | $0.045/s | Salió de /models (sigue en /docs). Confirmar que funciona |
| P3 | REEMPLAZAR | Kling Video 4.0 (sustituye a Kling-v3 y o3) | ID (sv; la ficha da 404) | 720p $0.157/s · 1080p $0.235 | Más caro que en KIE o APIMart |
| P3 | AGREGAR | Vidu S1 | API LiveSession | $0.009/s | Avatar en tiempo real; no encaja con generación por lotes |

## 6. Higgsfield (api.higgsfield.ai)

| P | Acción | Modelo | Endpoint | Precio de lista | Detalle |
|---|---|---|---|---|---|
| P1 | +MODO | **Seedance 2.5 i2v / ref / edit / extend** | `/bytedance/seedance-2.5/{image-to-video,reference-to-video,video-edit,video-extend}` | t2v/i2v $0.145/s; ref/edit/extend $0.174/s | Hoy solo tenemos t2v |
| P1 | +MODO | **Kling 3.0 Pro / 4K / Turbo** + i2v | `/kling-video/v3.0/{pro,4k,std}/{text,image}-to-video`, `/kling-video/v3.0-turbo/*` | Pro $0.084/s · 4K $0.21 · Turbo $0.07 · Std $0.063 | Hoy solo tenemos Std t2v |
| P1 | AGREGAR | **HappyHorse 1.1** | `/alibaba/happy-horse/v1.1/{text,image,reference}-to-video` | $0.09/s a 1080p | Más barato que en MachGen ($0.132) |
| P1 | VERIFICAR | **Kling 4.0 / 4.0 Flash** | (sv; la ficha de docs da 404) | desde $0.094/s | Tiene precio en la API pero no documentación |
| P2 | +MODO | MiniMax H3 i2v/ref; Wan 3.0 i2v/ref | `/minimax/h3/{image,reference}-to-video`, `/alibaba/wan-3.0/{image,reference}-to-video` | H3 $0.065/s (2K) | — |
| P2 | +MODO | Genjutsu Object Swap / Restyle | `/higgsfield/genjutsu/object-swap/v1.0`, `/restyle/v1.0` | Genjutsu desde $0.318/s; Lite desde $0.05/s | — |
| P2 | AGREGAR | Kling 3.0 / 2.6 Motion Control | `/kling-video/v3/motion-control/{std,pro}`, `/kling-video/motion-control/{std,pro}` | sin publicar | Motion transfer |
| P2 | AGREGAR | Kling O3 / Omni | `/kling-video/o3/{first-last-frame,image-reference,video-reference,video-edit}` | sin publicar | — |
| P2 | AGREGAR | Grok Imagine Video 1.5 | `/xai/grok-imagine-video/v1.5/reference-to-video` | sin publicar | — |
| P2 | AGREGAR | Cinema Studio 4.0 | `/higgsfield/cinema-studio/4.0` | sin publicar | Propio de Higgsfield |
| P2 | +MODO | Qwen Image 3 Edit | `/alibaba/qwen-image-3/edit` | sin publicar | Hoy solo tenemos t2i |
| P2 | AGREGAR | Soul ID (entrenar personaje) | `/v1/custom-references` | — | Personajes recurrentes |
| P3 | AGREGAR | Ads Studio | `/higgsfield/ads-studio/v1.0` | — | 1–8 anuncios a partir de un brief |
| P3 | +MODO | Recraft V4.1 Pro / Utility | `/recraft/v4.1/utility/text-to-image` | — | — |
| P3 | AGREGAR | LTX-2.5, Wan 2.7/2.6, PixVerse V6, Hailuo 2.3 | `/lightricks/ltx-2.5/*`, … | — | Ya los tenemos en otras plataformas |

**Solo en la web de Higgsfield, sin API (no integrables):** Intone (lipsync, 30-oct), Ideogram 4.5 y Precise Edit, Ideogram Vector, FLUX 3 Image, Nano Banana 2.1, Seedream 5.0, GPT Image 2.5, MiniMax H3 Max, Gemini Omni 1.1, FLUX 3 Video Upscaler, Eleven v4, Shorts, Mangaka, Content Factory, Relight.

## 7. Pruna (api.pruna.ai)

| P | Acción | Modelo | Model id | Precio | Detalle |
|---|---|---|---|---|---|
| P1 | AGREGAR | **p-video-2-pro-reference** | `p-video-2-pro-reference` | $0.015/s (480p, modo cost) … $0.115/s (4K, modo speed); mínimo $0.075 | r2v sobre H3: 9 imágenes + 3 videos + 3 audios, 5–15 s |
| P1 | AGREGAR | **p-video-2-pro-avatar** | `p-video-2-pro-avatar` | 480p $0.02/s · 1080p $0.06 · 4K $0.12 | Retrato + audio o guion con TTS (español), hasta 3 min |
| P2 | AGREGAR | p-video-edit | `p-video-edit` | $0.045/s; draft $0.025 | Edición por texto, 4 refs |
| P2 | AGREGAR | p-video-upscale | `p-video-upscale` | $0.01–0.16/s | Hasta 4K a 60 fps |
| P2 | AGREGAR | p-video-animate / p-video-replace | `p-video-animate`, `p-video-replace` | $0.03/s (720p) · $0.06/s (1080p) | Motion transfer y swap de personaje |
| P2 | AGREGAR | p-image / p-image-edit | `p-image`, `p-image-edit` | $0.005 / $0.010 | Imagen en menos de 1 s |
| P3 | AGREGAR | p-image-ideogram, p-image-upscale, p-image-try-on, trainers | — | $0.003–0.12 | — |

## 8. Kling AI directo (api-singapore.klingai.com)

| P | Acción | Modelo | Detalle |
|---|---|---|---|
| P1 | +MODO | **Kling 4.0 Flash** (t2v, i2v, omni) | GA 4-nov; 720p, 3–20 s, 10 imágenes + 5 videos de referencia. ~$0.094/s (sv) |
| P2 | +MODO | Kling 3.0 Omni, 3.0/2.6 Motion Control | En la API nueva desde jul-2026 (sv). El sitio de Kling no se pudo leer (requiere JS) |

## 9. ElevenLabs directo

| P | Acción | Modelo / feature | Endpoint | Detalle |
|---|---|---|---|---|
| P1 | AGREGAR | **SFX v3** | `eleven_text_to_sound_v3` | 2-nov; varios sonidos por escena, loop, 30 s, WAV. Reemplaza SFX v2 (se elimina el 1-mar-2027) |
| P1 | AGREGAR | **Video to Music** | Video to Music API | 19-oct; musicaliza hasta 10 videos, `add_sfx`, `separate_tracks`. Para Montage |
| P1 | +MODO | **Eleven v4 Turbo** | `eleven_v4_turbo` | ~100 ms |
| P2 | +MODO | `audio_effects` en TTS y Dialogue | `GET /v1/audio-effects/catalog` | Reverb, distancia, ambiente, paneo |
| P2 | +MODO | Text to Dialogue con continuidad | `previous_text` / `future_text` | — |
| P2 | AGREGAR | Dubbing v2 | `/v1/dubbing/project` | Más de 90 idiomas, WebVTT |
| P2 | AGREGAR | Voice Changer | `POST /v1/voice-changer/{voice_id}` | Reemplaza `/v1/speech-to-speech/` |
| P3 | +MODO | PVC sobre v4 + `clone_strength`; Music Finetunes | — | — |

## 10. OpenAI directo

| P | Acción | Modelo | Detalle |
|---|---|---|---|
| P1 | REEMPLAZAR | `whisper-1` → **`gpt-transcribe`** | Whisper se apaga el 26-feb-2027 |
| P3 | AGREGAR | GPT Image 2.5 / 2.6 directo (calidades `xhigh` / `max`, fondo transparente) | Ya lo tenemos por terceros, más barato |
| — | — | TTS | `tts-1` y `gpt-4o-mini-tts` se apagan el 6-ene-2027; no hay TTS nuevo |

## 11. Plataformas nuevas (no integradas hoy)

| P | Plataforma | Modelo | Detalle |
|---|---|---|---|
| P2 | xAI API directa | Grok Imagine Video 1.5 Lite | $0.02/s con audio. Solo existe en xAI |
| P2 | Gemini API directa | Lyria 3.5, Gemini 3.5 Transcribe, clonación de voz en Gemini 3.8 TTS | Lyria $0.08 por canción. La clonación usa una muestra de 30 s |
| P3 | Pika API | Pika H3 Flex | Desde $0.01/s, 12 refs, 4K |

## Sin novedades confirmadas (jul–nov 2026)

Veo 4, Imagen 5, Nano Banana 3, Seedance 3, Runway Gen-5, Luma Ray 4, PixVerse V7, Recraft V5.

## Estado de integración P1 (2026-11-05)

Integrado en código, sin probar en vivo (ninguna generación pagada):

- **KIE**: GPT Image 2.6 (Flare/Sunburst/Economy), FLUX 3 Klein, Kling 4.0 Flash, Grok Imagine Video 1.5 (exige imagen), Seedance 2.5 draft + 1080p, Gemini Omni Video, OmniHuman 2.0, Vidu Q4.
- **fal**: Kling 4.0 Flash (+ Edit), MiniMax H3 Max Relight, Sync-3 Lipsync, ByteDance Video Upscaler, GPT Image 2.6 Flare/Sunburst, FLUX 3, Ideogram 4.5, Krea 3, Gemini 3.1 Flash TTS, Lyria 3.5. IDs nuevos de xAI TTS, CassetteAI y Sonilo (los viejos quedan como alias).
- **Replicate**: Kling 3.0 en `kwaivgi/kling-v3-video` (precios corregidos), Kling 4.0, MiniMax H3 Lite/Highspeed, Veo 3.1 Lite/Fast, P-Video 2 Pro Avatar, GPT Image 2.6, FLUX 3, Ideogram 4.5 (+ Precise Edit), Krea 3. **Kling 1.5 Pro eliminado** (404).
- **APIMart**: Kling V4 (+ Edit/Extend), Vidu Q4, Veo 3.1 Fast/Quality oficiales (reemplazan "VEO 3", id no documentado), MiniMax H3 Max, FLUX 3 / Klein, Nano Banana 2.1 (+ Ext), Lyria 3.5. Referencias de video/audio solo como URL pública.
- **Higgsfield**: Kling 3.0 Pro/4K/Turbo, HappyHorse 1.1, Seedance 2.5 Edit/Extend; fix de `output_format` en i2v/ref.
- **Pruna**: P-Video 2 Pro Avatar.
- **Kling AI**: Kling 4.0 Flash; precio de Kling 4.0 corregido a $0.157 / $0.235.
- **ElevenLabs**: Eleven v4 Turbo, Video to Music (MCP).

Bloqueado o descartado: `whisper-1` → `gpt-transcribe` (sin timestamps ni traducción), Gemini Omni 1.2 Flash en APIMart (sin docs), MiniMax H3 Omni y Eleven v4 en MachGen (sin docs), Kling 4.0 en Higgsfield (sin docs).
