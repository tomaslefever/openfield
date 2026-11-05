# Modelos nuevos para integrar en Openfield (relevado 2026-11-05)

Plataformas revisadas: KIE, fal, Replicate, APIMart, MachGen, Higgsfield, Pruna, Kling AI, ElevenLabs y OpenAI.

- Los precios son los que publica cada plataforma, en USD.
- En "Dónde" va primero la opción más barata o más completa.
- ★ = recomendado.
- (sv) = sin verificar en página oficial.

## 0. Mantenimiento urgente (no son modelos nuevos)

| # | Qué | Acción |
|---|---|---|
| M1 | **Sora 2**: OpenAI apagó la Videos API el 24-sep-2026 | Sacar `sora-2` (KIE) y `apimart/sora-2` |
| M2 | **FLUX 3 Max (fal)**: la promo termina el 7-nov. Desde el 8-nov cuesta $0.17/s a 720p y $0.29/s a 1080p | Actualizar precios antes del 8-nov |
| M3 | **Seedance 2.5 (fal)**: `fal-ai/bytedance/seedance-2-5` da 404 | Cambiar a `bytedance/seedance-2.5/us/{text,image,reference}-to-video` |
| M4 | **Wan 3.0 (fal)**: `fal-ai/wan/v3/*` da 404 y el precio está mal | Cambiar a `alibaba/wan-3.0/*` con $0.05 / $0.10 / $0.20 por s (480p / 720p / 1080p) |
| M5 | **Imagen 4**: apagado en Gemini API el 17-ago | Revisar KIE `imagen4-fast` y `apimart/imagen-4.0` |
| M6 | **whisper-1** se apaga el 26-feb-2027 | Migrar a `gpt-transcribe`, o a Nemotron 3.5 Transcribe en KIE ($0.0015/min) |
| M7 | **Eleven SFX v2**: deprecado, se elimina el 1-mar-2027 | Reemplazar por SFX v3 (ver A5) |
| M8 | **IDs de fal y Replicate a confirmar** (sv) | fal: `fal-ai/gemini-tts`, `fal-ai/xai-tts`, `fal-ai/sonilo`, `fal-ai/cassette-ai`. Replicate: `kling-ai/*`; el dueño oficial es `kwaivgi` |

## V. Video

| # | Modelo | Novedad | Dónde (precio) | Nota |
|---|---|---|---|---|
| ★V1 | **Kling 4.0 Flash** | GA 4-nov; 720p, 3–20 s, refs | fal $0.094/s · KIE $0.085/s · Kling AI | ~40% más barato que Kling 4.0, sirve para borradores |
| ★V2 | **Kling 4.0 completo** (edit, extend, keyframes, 1080p) | Hoy solo tenemos ref2v en KIE | APIMart `kling-v4` ($0.14 / $0.21 por s) · Replicate `kwaivgi/kling-v4.0` | Suma 1080p y edit/extend |
| ★V3 | **Vidu Q4 Preview** | 7-oct; i2v y ref (15 imágenes + 3 audios), hasta 4K | KIE $0.036–0.31/s · APIMart $0.045–0.33/s | Hoy solo está en MachGen |
| ★V4 | **MiniMax H3 Lite / Highspeed** | Fin de octubre | Replicate $0.025/s / $0.06/s, con −50% hasta fin de año | El H3 más barato |
| V5 | **MiniMax H3 Omni** | r2v multimodal con audio | MachGen $0.02/s (ID de API sv) | Muy barato |
| V6 | **MiniMax H3 Max**: i2v, extend y Director | Hoy en fal solo tenemos t2v y ref | fal; APIMart `MiniMax-H3-Max` ($0.038–0.128/s) | — |
| ★V7 | **Grok Imagine Video 1.5** (+ Lite) | Audio, 7 refs, extend/edit; Lite $0.02/s | KIE preview $0.012–0.0225/s · APIMart ext ~$0.01/s · fal · xAI directo (Lite) | Video con audio de lo más barato |
| V8 | **LTX-2.5** Fast/Pro | 11-ago; pesos abiertos, 4K y audio | fal $0.09–0.30/s · Replicate | Reemplaza LTX-Video 2B y HunyuanVideo |
| V9 | **PixVerse V6 Max** | Tier de calidad | APIMart $0.078/s a 1080p · KIE $0.088/s | — |
| V10 | **Wan 3.0 Prime** | Gama alta de Wan, hasta 30 s | APIMart $0.051–0.206/s · KIE · fal | Hoy solo en Higgsfield |
| V11 | **HappyHorse 1.1** | Lipsync en 7 idiomas | KIE $0.1125/s a 720p · Higgsfield $0.09/s a 1080p · fal | Hoy tenemos 1.0 en APIMart y 1.1 en MachGen |
| ★V12 | **Gemini Omni 1.2 Flash** (+ Character/Audio en KIE) | Personajes y voces persistentes entre tomas | APIMart `gemini-omni-1.2-flash` (sin precio; lanzamiento sv) · KIE `gemini-omni-video` (desde $0.315/video) | Clave para personajes recurrentes |
| ★V13 | **Seedance 2.5 Draft** | Borrador 480p y luego final 1080p (`draft_task_id`) | KIE `bytedance/seedance-2-5-draft` | Calza con el flujo de Landking |
| V14 | **Seedance 2.5 edit / extend** en Higgsfield | — | Higgsfield $0.174/s | — |
| V15 | **Veo 3.1 Lite / Fast** | Veo con audio a ~1/3 del precio | Replicate $0.05–0.08/s · APIMart | — |
| V16 | **Pika H3 Flex** | 29-oct; desde $0.01/s, 12 refs | API de Pika (en KIE sv) | Requiere una plataforma nueva |
| V17 | **Kling 3.0 Turbo Pro / 4K / Pro** | — | fal $0.14/s a 1080p · Higgsfield | Variantes de modelos que ya tenemos |
| V18 | **FLUX 3** (video) en Replicate | — | Replicate (precio no visible) | Ya lo tenemos en fal |
| V19 | **Luma Ray 3.2** | HDR y export EXR | Replicate | Requiere una familia nueva |
| V20 | **Hailuo 2.3** Pro/Fast | Reemplaza Hailuo 02 | KIE · APIMart $0.025/s | — |

## I. Imagen

| # | Modelo | Novedad | Dónde (precio) | Nota |
|---|---|---|---|---|
| ★I1 | **GPT Image 2.6** Flare/Sunburst (+ Economy en KIE) | Changelog de OpenAI 4-nov; SVG y GIF animado | KIE desde $0.025–0.03 · fal · Replicate · APIMart (marcado "not yet live") | Sucesor directo del 2.5 que ya usamos |
| ★I2 | **FLUX 3 Image** + Edit | 10 refs, hasta 4K | fal $0.048 a 1 MP · APIMart $0.038–0.486 · Replicate | Reemplaza FLUX.1 y Kontext |
| ★I3 | **FLUX 3 Klein** | 15-oct; pesos abiertos | KIE $0.008–0.0325 · APIMart $0.0064 | Imagen ultra barata |
| ★I4 | **Ideogram 4.5** + Edit | Mejor tipografía | fal $0.03–0.22 · Replicate | Reemplaza Ideogram v2 en fal y Replicate |
| I5 | **Ideogram Vector** | Texto o imagen a SVG | fal $0.13–0.32 | Logos editables |
| ★I6 | **Krea 3** | 15-oct; edición regional y 6–8 refs | fal $0.025/MP · Replicate $0.03–0.08 | Estética top, barato |
| I7 | **Seedream 5.0 Flash** + Layer Decomposition | Capas transparentes | KIE desde $0.016 · fal `seedream/v5/pro/layerize` | — |
| I8 | **Seedream 5.5** | (sv) ByteDance no lo anunció | APIMart `seedream-5.5` | Probar antes de integrar |
| I9 | **MAI-Image 2.6 / 2.7** (Microsoft) | 2.7 es top 2–3 en edición (preview 27-oct) | APIMart 2.6: $0.031 (Flash $0.016) | Familia nueva |
| I10 | **Hy-Image 3.5** (Tencent) | Edición multi-turno | APIMart $0.019–0.026 a 1K–4K | 4K barato |
| I11 | **Qwen Image 3 Pro / Edit** | Texto denso | APIMart $0.029–0.057 · KIE · Higgsfield (edit) | — |
| I12 | **Fibo 2.0** (Bria) | Datos licenciados | fal $0.04–0.06 | Reemplaza FIBO 1 |
| I13 | **Nano Banana 2.1 ext** | — | APIMart $0.012 | La más barata para NB 2.1 |
| I14 | **p-image / p-image-edit** (Pruna) | Menos de 1 s | Pruna $0.005 / $0.010 | Hoy no tenemos imagen de Pruna |
| I15 | **Recraft V4.1** (+ SVG / Utility) | — | Replicate · Higgsfield | Reemplaza Recraft V3 |
| I16 | **Midjourney** | No es API oficial | APIMart $0.045 | Riesgo de legalidad y estabilidad |

## A. Audio

| # | Modelo | Novedad | Dónde (precio) | Nota |
|---|---|---|---|---|
| ★A1 | **Lyria 3.5** (Google) | Canción completa con voz | APIMart Flow Music ~$0.06 · fal $0.10 · Gemini API $0.08 | Hoy solo Lyria 3 de 30 s |
| ★A2 | **ElevenLabs Video to Music** | 19-oct; musicaliza un video con SFX y stems | ElevenLabs directo | Encaja con Montage |
| ★A3 | **Eleven v4 Turbo** + `audio_effects` | ~100 ms; reverb, distancia, ambiente | ElevenLabs directo | Tenemos v4, no Turbo |
| A4 | **ElevenLabs v3 Text-to-Dialogue** | Diálogo multi-voz | KIE $0.07 por 1.000 caracteres | Útil para The Transition |
| ★A5 | **ElevenLabs SFX v3** | 2-nov; multi-sonido, loop, 30 s | ElevenLabs directo | Reemplaza SFX v2 (deprecado) |
| A6 | **MiniMax Speech 2.8 HD/Turbo** + clonación | — | fal $0.10 por 1.000 caracteres · Replicate | — |
| A7 | **Gemini 3.8 Flash TTS** en Replicate (+ Lite en KIE) | — | Replicate · KIE Lite $0.35 por M tokens | Ya está en KIE |
| A8 | **Stable Audio 3** | Datos licenciados, hasta 6 min | fal $0.0376 por audio | Reemplaza Stable Audio Open |
| A9 | **YuE2** | Canción con voz, open-weight | MachGen $0.10 por canción | — |
| A10 | **MiniMax Music 2.6 / ElevenLabs Music v2.5 en fal** | — | fal ($0.60/min la v2.5) | Versiones nuevas en fal |
| A11 | **Seed Audio 1.0** / **Qwen3-TTS** / **Inworld Realtime TTS 2** | — | fal $0.1875/min · fal · Replicate | TTS alternativos |
| A12 | **Suno extras** (Persona, Stems, Cover, MIDI) | — | KIE | Funciones, no modelos |
| A13 | **ElevenLabs Dubbing v2 / Voice Changer** | — | ElevenLabs directo | Funciones nuevas |
| A14 | **Nemotron 3.5 Transcribe** / **gpt-transcribe** | — | KIE $0.0015/min · OpenAI | Para autocaptions (ver M6) |

## L. Lipsync / avatar / motion

| # | Modelo | Novedad | Dónde (precio) | Nota |
|---|---|---|---|---|
| ★L1 | **OmniHuman 2.0** | 15-oct; hasta 5 min | KIE $0.07/s | La mitad del precio de la 1.5 que tenemos |
| ★L2 | **p-video-2-pro-avatar** | Guion con TTS en español, hasta 4K | Pruna $0.02–0.12/s | Reemplaza p-video-avatar |
| ★L3 | **Sync-3** | Lipsync 4K | fal $8/min | Sucesor de lipsync-2-pro |
| L4 | **H3 Max Lip Sync** | Imagen + audio, hasta 2K | fal $0.05–0.32/s | — |
| L5 | **HeyGen v3 Lipsync / Avatar V** | — | fal $0.10/s | — |
| L6 | **InfiniteTalk** / **VEED Lipsync v2** | — | KIE $0.015/s · fal $0.07/s | Baratos |
| L7 | **Kling 3.0 Motion Control** | — | KIE · Higgsfield | Motion transfer |
| L8 | **p-video-animate / -replace** | Motion transfer y swap de personaje | Pruna $0.03–0.06/s | — |

## E. Edición y upscale de video

| # | Modelo | Novedad | Dónde (precio) | Nota |
|---|---|---|---|---|
| ★E1 | **H3 Max Relight** | Re-iluminar un video conservando movimiento y audio | fal $0.05–0.32/s | Nadie más lo tiene |
| E2 | **H3 Max Recast** | Reemplaza personas en un video | fal $0.30–0.45/s | — |
| E3 | **Runway Aleph 2** | Edición v2v de primer nivel | Replicate (early access) | — |
| E4 | **p-video-edit** | Edición por texto, 15 s | Pruna $0.045/s (draft $0.025) | — |
| E5 | **Genjutsu Object Swap / Restyle** | — | Higgsfield desde $0.05/s | Ya tenemos Genjutsu motion |
| ★E6 | **ByteDance Video Upscaler** | El 4K más barato | fal $0.0072–0.0288/s | Alternativa a Topaz |
| E7 | **p-video-upscale** | Hasta 4K a 60 fps | Pruna $0.01–0.16/s | — |
| E8 | **FLUX Video Upscale** / **Topaz en fal** / **Vidu Upscale Pro** | — | fal $0.084–0.47/s · fal · MachGen $0.059–0.94/s | — |

## Sin novedades confirmadas (jul–nov 2026)

Veo 4, Imagen 5, Nano Banana 3, Seedance 3, Runway Gen-5, Luma Ray 4, PixVerse V7, Recraft V5.
