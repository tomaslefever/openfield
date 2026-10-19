/**
 * Video templates distilled from the official prompting guides (Veo 3.1, Sora 2, Kling 3,
 * Wan, Runway, Luma) and well-documented community practice (Seedance, Hailuo). Written in
 * our own words: the structure and vocabulary each model follows, not copied prompts.
 */
import { type BuiltinPrompt, V, ALL_VIDEO_MODELS } from './types'

const S = {
  veo: { title: 'Google Cloud · Ultimate prompting guide for Veo 3.1', url: 'https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1' },
  veoApi: { title: 'Gemini API · Veo docs', url: 'https://ai.google.dev/gemini-api/docs/veo' },
  deepmind: { title: 'Google DeepMind · Veo prompt guide', url: 'https://deepmind.google/models/veo/prompt-guide/' },
  sora: { title: 'OpenAI Cookbook · Sora 2 prompting guide', url: 'https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide' },
  kling: { title: 'Kling · Prompt guide', url: 'https://kling.ai/blog/kling-ai-prompt-guide' },
  klingQuick: { title: 'Kling · Text-to-video quickstart', url: 'https://kling.ai/quickstart/text-to-video-prompt-guide' },
  kling3: { title: 'fal.ai · Kling 3.0 prompting guide', url: 'https://blog.fal.ai/kling-3-0-prompting-guide/' },
  wan: { title: 'Alibaba Model Studio · Wan text-to-video prompts', url: 'https://www.alibabacloud.com/help/en/model-studio/text-to-video-prompt' },
  luma: { title: 'Luma · Ray3 user guide', url: 'https://lumalabs.ai/learning-hub/ray3-user-guide' },
  seedanceCommunity: { title: 'YouMind · awesome-seedance-2-prompts (CC BY 4.0)', url: 'https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts' },
  segmind: { title: 'Segmind · Seedance 1.0 Pro tutorial', url: 'https://blog.segmind.com/ultimate-seedance-1-0-pro-tutorial/' },
  subtitles: { title: 'MIT Technology Review · Veo 3 subtitles problem', url: 'https://www.technologyreview.com/2025/07/15/1120156/googles-generative-video-model-veo-3-has-a-subtitles-problem' },
}

const NO_TEXT_TAIL = 'No subtitles, no captions, no on-screen text, no watermark.'

export const VIDEO_RESEARCH_PROMPTS: BuiltinPrompt[] = [
  // ─── Storyboard / multi-plano ────────────────────────────────
  {
    id: 'of:video-veo-timestamp-storyboard',
    name: 'Storyboard en 4 planos con timestamps (8 s)',
    kind: 'video',
    category: 'storyboard',
    description: 'Una sola generación de 8 s cortada en cuatro planos de 2 s con marcas de tiempo, el mismo personaje en todos. Ideal para un mini-spot o la apertura de una historia.',
    tags: ['storyboard', 'multi plano', 'timestamps', 'secuencia', 'planos', 'shot list', 'escena', 'spot', 'veo'],
    models: ['veo', 'seedance', 'kling', 'wan'],
    types: ['storyboard', 'multi-shot', 'consistency', 'audio'],
    template:
      '{{style}}. Recurring character: {{character}}.\n' +
      '[00:00-00:02] Wide establishing shot of {{setting}}; {{shot1}}. Ambient noise: {{ambience}}.\n' +
      '[00:02-00:04] Medium shot, slow push-in on the character; {{shot2}}.\n' +
      '[00:04-00:06] Close-up, shallow depth of field; {{shot3}}. SFX: {{sfx}}.\n' +
      '[00:06-00:08] Low-angle hero shot, camera holds still; {{shot4}}.\n' +
      'Same face, hairstyle, wardrobe and lighting in every shot. ' + NO_TEXT_TAIL,
    variables: [
      V.style, V.character,
      { ...V.setting, example: 'a rain-soaked neon alley at night' },
      { name: 'shot1', description: 'Acción del plano 1 (establecer)', example: 'the character steps out of a taxi and opens a black umbrella' },
      { name: 'shot2', description: 'Acción del plano 2', example: 'she checks a glowing message on her phone and frowns' },
      { name: 'shot3', description: 'Acción del plano 3 (detalle/emoción)', example: 'a single raindrop runs down her cheek as her eyes narrow' },
      { name: 'shot4', description: 'Acción del plano 4 (cierre)', example: 'she turns toward camera, determined, neon reflecting in the puddles' },
      { name: 'ambience', description: 'Sonido ambiente', example: 'steady rain and distant traffic' },
      { name: 'sfx', description: 'Efecto puntual sincronizado', example: 'a sharp phone vibration' },
    ],
    guidance: [
      'Repite la descripción del personaje palabra por palabra en cada generación de la serie (su "biblia").',
      'Un movimiento de cámara por plano y nunca más de 4–6 planos por generación.',
      'Para más de 8 s: extiende el clip (Veo Extend) o genera el frame inicial/final de cada tramo con una plantilla de character sheet.',
      'En Seedance/Wan escribe "Shot 1: / Shot 2:" o rangos "0–2s:"; añade "hard cut" si cambias de locación.',
    ],
    aspectRatios: ['16:9', '9:16'],
    durationSeconds: 8,
    references: [{ url: 'https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7f63ad253175a9ad1dac53de490efac8/thumbnails/thumbnail.jpg', caption: 'Corto de 15 s en planos cronometrados (0–4/4–9/9–15 s)', credit: 'AIGC｜阳家豪 vía YouMind', sourceUrl: 'https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts', license: 'Repo: CC BY 4.0; recopilado de la comunidad', date: '2026-09' }],
    sources: [S.veo, S.veoApi, S.seedanceCommunity],
  },
  {
    id: 'of:video-kling-multishot',
    name: 'Secuencia multi-plano Kling (hasta 6 planos)',
    kind: 'video',
    category: 'storyboard',
    description: 'Formato de storyboard personalizado de Kling 3: locación primero, planos numerados con duración, encuadre y cámara, y una sola línea de estilo al final.',
    tags: ['storyboard', 'multi shot', 'kling', 'planos', 'secuencia', 'narrativa', 'escena'],
    models: ['kling'],
    types: ['storyboard', 'multi-shot', 'consistency'],
    template:
      'Setting: {{setting}}. Main character: {{character}}.\n' +
      'Shot 1 ({{d1}}s, wide, eye level, static): {{shot1}}\n' +
      'Shot 2 ({{d2}}s, medium, slow tracking shot): {{shot2}}\n' +
      'Shot 3 ({{d3}}s, close-up, handheld): {{shot3}}\n' +
      'Shot 4 ({{d4}}s, wide, crane up): {{shot4}}\n' +
      'Style for all shots: {{style}}; consistent character, wardrobe and lighting throughout.',
    variables: [
      { ...V.setting, example: 'a small Lisbon bakery at dawn, warm tungsten light, flour in the air' },
      V.character,
      { name: 'd1', description: 'Segundos plano 1', example: '3' },
      { name: 'shot1', description: 'Plano 1', example: 'The baker unlocks the door and flips the sign to OPEN.' },
      { name: 'd2', description: 'Segundos plano 2', example: '3' },
      { name: 'shot2', description: 'Plano 2', example: 'She carries a tray of pastries along the counter.' },
      { name: 'd3', description: 'Segundos plano 3', example: '2' },
      { name: 'shot3', description: 'Plano 3', example: 'Her flour-dusted hands break a croissant open, steam rising.' },
      { name: 'd4', description: 'Segundos plano 4', example: '4' },
      { name: 'shot4', description: 'Plano 4', example: 'The first customers line up outside as the street lights switch off.' },
      V.style,
    ],
    guidance: [
      'Total ≤ 15 s. Términos de cámara simples rinden más que jerga técnica compleja.',
      'Evita cifras exactas ("tres copas"): Kling no es fiable con números.',
      'Para identidad fija usa un Element/referencia del personaje además del texto.',
    ],
    aspectRatios: ['16:9', '9:16', '1:1'],
    durationSeconds: 12,
    references: [{ url: 'https://d1extl9qtlpf43.cloudfront.net/kling-blog/file/b40cd0822a50b0a42b3323275f973de0c64b0c562b1a32eba0357f527c8aea4f.jpg', caption: 'Elements: referencias de personaje en Kling', credit: 'Kling AI', sourceUrl: 'https://kling.ai/quickstart/text-to-video-prompt-guide', license: '© Kling; enlazado desde la guía oficial' }],
    sources: [S.kling, S.kling3],
  },
  {
    id: 'of:video-seedance-hardcut-sequence',
    name: 'Secuencia con identidad bloqueada y hard cuts',
    kind: 'video',
    category: 'storyboard',
    description: 'Varias escenas en locaciones distintas con el mismo personaje, unidas por cortes secos. Patrón muy usado en Seedance 2.x y Wan 2.6+ con imagen de referencia.',
    tags: ['hard cut', 'seedance', 'secuencia', 'viaje', 'vlog', 'consistencia', 'personaje', 'referencia', 'storyboard'],
    models: ['seedance', 'wan', 'kling'],
    types: ['storyboard', 'multi-shot', 'consistency'],
    template:
      'Keep the exact face, hairstyle, skin tone, body proportions and outfit of the person in @Image1 throughout; no face or outfit changes. {{style}}.\n' +
      '0–4s: {{scene1}}\n' +
      '4–8s: hard cut, no blending. {{scene2}}\n' +
      '8–12s: hard cut, no blending. {{scene3}}\n' +
      'One dominant performer, natural motion, ' + NO_TEXT_TAIL,
    variables: [
      V.style,
      { name: 'scene1', description: 'Escena 1 con cámara', example: 'Tracking shot behind her walking through a Kyoto bamboo path, morning mist.' },
      { name: 'scene2', description: 'Escena 2 con cámara', example: 'Medium shot, she snaps her fingers on a busy Tokyo crossing at night, camera static.' },
      { name: 'scene3', description: 'Escena 3 con cámara', example: 'Slow orbit as she laughs on a Santorini rooftop at golden hour.' },
    ],
    guidance: [
      'Asigna a cada referencia UNA función (@Image1 = identidad, @Image2 = producto…): Seedance no infiere para qué sirve cada archivo.',
      'Escribe "hard cut" para que no haga morphing entre locaciones.',
      'En Wan 2.6+ las referencias se llaman "Image 1" / "Video 1".',
    ],
    aspectRatios: ['9:16', '16:9'],
    durationSeconds: 12,
    references: [{ url: 'https://pbs.twimg.com/amplify_video_thumb/2105548013406208000/img/aXj0BPfngqyW4MT8.jpg', caption: 'Vlog de viaje con el mismo personaje y hard cuts entre ciudades', credit: 'Adam也叫吉米 vía YouMind', sourceUrl: 'https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts', license: 'Repo: CC BY 4.0; recopilado de la comunidad', date: '2026-10-01' }],
    sources: [S.seedanceCommunity, S.wan],
  },
  {
    id: 'of:video-first-last-frame',
    name: 'Transición entre frame inicial y final',
    kind: 'video',
    category: 'storyboard',
    description: 'Une dos imágenes ya aprobadas (p. ej. dos viñetas del storyboard) describiendo solo la transición y el audio. La forma más fiable de encadenar planos sin perder consistencia.',
    tags: ['first frame', 'last frame', 'frame inicial', 'frame final', 'transición', 'keyframes', 'storyboard', 'encadenar'],
    models: ['veo', 'kling', 'seedance', 'wan', 'runway'],
    types: ['image-to-video', 'storyboard', 'consistency', 'camera-motion'],
    template:
      '{{camera}} from the first frame to the last frame: {{transition}}. ' +
      '{{subject_motion}}. Lighting and colors stay continuous between both frames. ' +
      'Audio: {{audio}}. ' + NO_TEXT_TAIL,
    variables: [
      { name: 'camera', description: 'Movimiento de cámara único con ritmo', example: 'A smooth, slow 180-degree arc around the subject' },
      { name: 'transition', description: 'Qué cambia entre los frames', example: 'the singer on stage seen from the crowd becomes her point of view looking out at the audience' },
      { name: 'subject_motion', description: 'Qué hace el sujeto', example: 'She raises the microphone and starts singing' },
      { name: 'audio', description: 'Sonido / música', example: 'crowd cheering rising into the opening chord of a rock song' },
    ],
    guidance: [
      'Genera ambos frames con la misma plantilla y personaje (character sheet) y conecta con start_frame_asset_id / end_frame_asset_id.',
      'No describas lo que ya muestran las imágenes: solo el movimiento entre ellas.',
      'En Veo las funciones de frames/ingredientes exigen clips de 8 s.',
    ],
    aspectRatios: ['16:9', '9:16'],
    durationSeconds: 8,
    references: [{ url: 'https://storage.googleapis.com/gweb-cloudblog-publish/images/4_k5TSJwO.max-1400x1400.jpg', caption: 'Ejemplo de frame inicial para la transición (guía oficial de Veo 3.1)', credit: 'Google Cloud', sourceUrl: 'https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1', license: '© Google; enlazado desde la guía oficial', date: '2025-10' }],
    sources: [S.veo, S.kling, S.luma],
  },

  // ─── Consistencia de personaje ──────────────────────────────
  {
    id: 'of:video-character-reference-lock',
    name: 'Personaje consistente con referencias (ingredients / elements)',
    kind: 'video',
    category: 'character',
    description: 'Clip con un personaje (y opcionalmente un producto y un lugar) fijados por imágenes de referencia: Veo "ingredients", Kling Elements, Seedance @Image. Para series y campañas con el mismo talento.',
    tags: ['personaje', 'consistencia', 'referencia', 'ingredients', 'elements', 'mismo personaje', 'serie', 'campaña', 'identidad'],
    models: ['veo', 'kling', 'seedance', 'wan', 'sora'],
    types: ['consistency', 'character-sheet', 'ads'],
    template:
      'Using the provided images for {{ref_roles}}. {{character}}. ' +
      '{{camera}}: {{action}} in {{setting}}. {{lighting}}. ' +
      'Preserve the exact face, hairstyle, skin tone, proportions and outfit from the reference images; product label unchanged. ' +
      '{{style}}. ' + NO_TEXT_TAIL,
    variables: [
      { name: 'ref_roles', description: 'Qué es cada imagen de referencia, en orden', example: 'the woman (image 1), the perfume bottle (image 2) and the hotel lobby (image 3)' },
      V.character,
      { name: 'camera', description: 'Encuadre y movimiento', example: 'Medium shot, slow dolly in' },
      { name: 'action', description: 'Una sola acción', example: 'she lifts the bottle, sprays it once on her wrist and smiles' },
      { ...V.setting, example: 'a marble hotel lobby' },
      { name: 'lighting', description: 'Luz', example: 'Soft warm key light from tall windows, gentle rim light' },
      V.style,
    ],
    guidance: [
      'Veo admite hasta 3 referencias; Sora hasta 2 personajes reutilizables; Seedance necesita que digas la función de cada @Image.',
      'Usa como referencia una hoja de personaje limpia (fondo neutro, buena luz, alta resolución).',
      'Repite siempre la misma frase de personaje y la misma paleta de 3–5 colores en toda la serie.',
    ],
    aspectRatios: ['9:16', '16:9'],
    durationSeconds: 8,
    references: [{ url: 'https://pbs.twimg.com/amplify_video_thumb/2110586692981923840/img/O9ggPIEmigfihsdm.jpg', caption: 'Presentador de la imagen 1 con el producto exacto de la imagen 2', credit: 'Meenakshi Yadav vía YouMind', sourceUrl: 'https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts', license: 'Repo: CC BY 4.0; recopilado de la comunidad', date: '2026-10-15' }],
    sources: [S.veo, S.kling, S.sora, S.seedanceCommunity],
  },

  // ─── Diálogo / UGC ───────────────────────────────────────────
  {
    id: 'of:video-veo-ugc-dialogue',
    name: 'UGC hablado con audio nativo (Veo)',
    kind: 'video',
    category: 'ugc',
    description: 'Selfie vertical con diálogo entre comillas, voz descrita, SFX y ambiente en líneas separadas, y el bloqueo de subtítulos quemados que Veo tiende a agregar.',
    tags: ['ugc', 'diálogo', 'lip sync', 'selfie', 'talking head', 'veo', 'audio', 'testimonio', 'creador'],
    models: ['veo'],
    types: ['ugc', 'dialogue', 'audio', 'ads'],
    template:
      'Handheld selfie vlog, front phone camera at arm\'s length, natural window light, slight handheld shake. ' +
      '{{talent}} in {{setting}} holds {{product}} up to the lens and says in a {{voice}} voice: "{{line}}" (no subtitles, no on-screen text). ' +
      'SFX: {{sfx}}. Ambient noise: {{ambience}}. Authentic, unpolished, social-media native look.',
    variables: [
      V.talent, V.setting, V.product,
      { name: 'voice', description: 'Voz: tono, ritmo, acento, emoción', example: 'warm, fast-paced, slightly amused Mexican-Spanish' },
      { name: 'line', description: 'La frase (15–25 palabras para 8 s)', example: 'Okay, I was not expecting this… it actually smells like real coffee, not candy.' },
      { name: 'sfx', description: 'Sonido sincronizado con una acción', example: 'the soft crinkle of the bag as she shakes it' },
      { name: 'ambience', description: 'Ambiente', example: 'quiet apartment, faint street noise' },
    ],
    guidance: [
      'Pon "subtitles, captions, text overlay, watermark" en negative_prompt (extra_params) cuando el proveedor lo admita.',
      'Que alguien hable en el último segundo si vas a extender el clip: si no, la voz puede cambiar.',
      'Para guion largo, encadena clips de 8 s en el Timeline.',
    ],
    aspectRatios: ['9:16'],
    durationSeconds: 8,
    sources: [S.veo, S.veoApi, S.subtitles],
  },
  {
    id: 'of:video-sora-dialogue-blocks',
    name: 'Escena con diálogo en bloques (Sora)',
    kind: 'video',
    category: 'ugc',
    description: 'Estructura oficial de Sora 2: prosa de escena, línea de cinematografía, acciones en beats contables y el diálogo en un bloque aparte con etiquetas de personaje.',
    tags: ['sora', 'diálogo', 'escena', 'beats', 'conversación', 'ficción', 'microdrama', 'audio'],
    models: ['sora'],
    types: ['dialogue', 'storyboard', 'audio'],
    template:
      '{{style}}. {{scene}}\n\n' +
      'Cinematography: {{camera}}; {{lighting}}; palette: {{palette}}.\n\n' +
      'Actions:\n- {{beat1}}\n- {{beat2}}\n- {{beat3}}\n\n' +
      'Dialogue:\n{{speaker_a}}: "{{line_a}}"\n{{speaker_b}}: "{{line_b}}"\n\n' +
      'Background sound: {{ambience}}.',
    variables: [
      { ...V.style, example: 'Shot on 35mm film, 1970s grade' },
      { name: 'scene', description: 'Prosa de la escena', example: 'A cramped diner booth late at night; rain streaks the window; two old friends share a single milkshake.' },
      { name: 'camera', description: 'Cámara', example: 'medium two-shot, slow push-in' },
      { name: 'lighting', description: 'Luz', example: 'warm practical lamp above the table, cool blue spill from the street' },
      V.palette,
      { name: 'beat1', description: 'Beat 1 (contable)', example: 'Leo slides the glass across the table.' },
      { name: 'beat2', description: 'Beat 2', example: 'Ana takes two sips, pauses, looks out the window.' },
      { name: 'beat3', description: 'Beat 3', example: 'She smiles without looking back at him.' },
      { name: 'speaker_a', description: 'Etiqueta personaje A', example: 'Leo' },
      { name: 'line_a', description: 'Línea A (corta)', example: 'You still take it with too much cherry.' },
      { name: 'speaker_b', description: 'Etiqueta personaje B', example: 'Ana' },
      { name: 'line_b', description: 'Línea B (corta)', example: 'Some things are worth not changing.' },
      { name: 'ambience', description: 'Ambiente', example: 'rain on glass, low diner chatter, no added score' },
    ],
    guidance: [
      '1–2 intercambios para 4 s, pocos más para 8 s: los parlamentos largos se desincronizan.',
      'Duración, resolución y formato van como parámetros, no en el texto.',
      'Itera con un solo cambio por vez manteniendo todo lo demás igual.',
    ],
    aspectRatios: ['16:9', '9:16'],
    durationSeconds: 8,
    sources: [S.sora],
  },
  {
    id: 'of:video-kling-two-speaker-dialogue',
    name: 'Diálogo entre dos personajes con voces etiquetadas (Kling)',
    kind: 'video',
    category: 'ugc',
    description: 'Formato de audio nativo de Kling 2.6/3: cada personaje con etiqueta única y voz distinta, la acción antes de su línea y conectores para el turno.',
    tags: ['kling', 'diálogo', 'dos personajes', 'voces', 'lip sync', 'conversación', 'audio'],
    models: ['kling'],
    types: ['dialogue', 'audio', 'ugc'],
    template:
      '{{setting}}. {{camera}}.\n' +
      '{{label_a}} {{action_a}}. [{{label_a}}: {{role_a}}, {{voice_a}}]: "{{line_a}}"\n' +
      'Immediately, {{label_b}} {{action_b}}. [{{label_b}}: {{role_b}}, {{voice_b}}]: "{{line_b}}"\n' +
      'Room tone: {{ambience}}.',
    variables: [
      { ...V.setting, example: 'A tiny recording studio with foam panels' },
      { name: 'camera', description: 'Cámara', example: 'Medium two-shot, camera static' },
      { name: 'label_a', description: 'Etiqueta única A (no "Man")', example: 'The Producer' },
      { name: 'action_a', description: 'Acción de A antes de hablar', example: 'leans back and pulls off his headphones' },
      { name: 'role_a', description: 'Rol A', example: 'veteran producer' },
      { name: 'voice_a', description: 'Voz A', example: 'raspy, deep, unimpressed' },
      { name: 'line_a', description: 'Línea A', example: 'Again. And this time, mean it.' },
      { name: 'label_b', description: 'Etiqueta única B', example: 'The Singer' },
      { name: 'action_b', description: 'Acción de B', example: 'grips the mic stand and nods' },
      { name: 'role_b', description: 'Rol B', example: 'young singer' },
      { name: 'voice_b', description: 'Voz B', example: 'clear, nervous, determined' },
      { name: 'line_b', description: 'Línea B', example: 'Okay. One more take.' },
      { name: 'ambience', description: 'Ambiente acústico', example: 'small dead room, faint amp hum' },
    ],
    guidance: [
      'Máximo 2 hablantes; con 3 o más las voces derivan.',
      'Usa siempre la misma etiqueta: nada de pronombres ni sinónimos después.',
      'Clips de 10 s para diálogo, 5 s si solo hay efectos.',
    ],
    aspectRatios: ['16:9', '9:16'],
    durationSeconds: 10,
    sources: [S.kling3, S.kling],
  },

  // ─── Producto / cámara ───────────────────────────────────────
  {
    id: 'of:video-product-orbit-loop',
    name: 'Producto: órbita 360° en loop perfecto',
    kind: 'video',
    category: 'advertising',
    description: 'El producto quieto mientras la cámara orbita en cuatro cuartos de arco cronometrados y vuelve exactamente al encuadre inicial, para un loop sin costura en redes o pantallas.',
    tags: ['producto', 'orbit', 'órbita', '360', 'loop', 'packshot', 'comercial', 'turntable', 'anuncio'],
    models: ['seedance', 'veo', 'kling', 'hailuo'],
    types: ['ads', 'product', 'camera-motion'],
    template:
      'Product commercial, macro-to-medium framing. {{product}} stands perfectly still on {{surface}}; only the camera moves. ' +
      'The camera performs a slow 360° orbit at constant height and distance: 0–2s first quarter, 2–4s second quarter, 4–6s third quarter, 6–8s last quarter, ending exactly on the opening composition for a seamless loop. ' +
      '{{lighting}}; reflections glide across the {{material}}. {{style}}. Label stays sharp and unchanged. No on-screen text.',
    variables: [
      V.product,
      { name: 'surface', description: 'Superficie', example: 'glossy black acrylic' },
      { name: 'lighting', description: 'Receta de luz', example: 'Softbox key from the left, thin rim light behind, light volumetric haze' },
      { name: 'material', description: 'Material del producto', example: 'brushed aluminium cap and frosted glass' },
      { ...V.style, example: 'premium beauty commercial, clean high-key grade' },
    ],
    guidance: [
      'Nunca pidas que el producto gire mientras la cámara orbita: elige uno.',
      'Parte de un packshot real como frame inicial para que la etiqueta no se invente.',
      'Describe materiales y luz, no metáforas ("elegante", "mágico").',
    ],
    aspectRatios: ['1:1', '9:16', '16:9'],
    durationSeconds: 8,
    references: [{ url: 'https://pbs.twimg.com/amplify_video_thumb/2111022723648692224/img/jigbacq0gScBd5Nl.jpg', caption: 'Órbita 360° en cuartos de arco que vuelve al encuadre inicial', credit: 'fdc888 vía YouMind', sourceUrl: 'https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts', license: 'Repo: CC BY 4.0; recopilado de la comunidad', date: '2026-10-16' }],
    sources: [S.seedanceCommunity, S.veo, S.kling, S.segmind],
  },
  {
    id: 'of:video-i2v-motion-only',
    name: 'Imagen a video: describe solo el movimiento',
    kind: 'video',
    category: 'advertising',
    description: 'Para animar una imagen ya aprobada (key visual, viñeta, foto de producto). Separa el movimiento del sujeto y el de la cámara, con palabra de ritmo, sin re-describir la imagen.',
    tags: ['image to video', 'imagen a video', 'animar', 'i2v', 'movimiento', 'runway', 'wan', 'start frame'],
    models: ALL_VIDEO_MODELS,
    types: ['image-to-video', 'camera-motion'],
    template:
      'Subject: {{subject_motion}}. Camera: {{camera_motion}}. Environment: {{environment_motion}}. ' +
      'Keep the composition, faces, colors and every detail of the image; natural, physically plausible motion. No new objects, no on-screen text.',
    variables: [
      { name: 'subject_motion', description: 'Qué se mueve del sujeto (o "holds still")', example: 'she slowly turns her head toward the window and exhales' },
      { name: 'camera_motion', description: 'Un movimiento con ritmo (o "holds completely still")', example: 'slow, steady push-in' },
      { name: 'environment_motion', description: 'Movimiento ambiental', example: 'curtains sway gently, dust drifts in the light beam' },
    ],
    guidance: [
      'No pidas movimientos que necesitan partes fuera de cuadro (un retrato que se levanta y camina).',
      'En Wan mantén las órbitas por debajo de ~45°; obedece solo el primero de varios movimientos.',
      'Usa imágenes de entrada en alta resolución.',
    ],
    aspectRatios: ['16:9', '9:16', '1:1'],
    durationSeconds: 5,
    sources: [S.wan, S.kling3, S.luma],
  },
  {
    id: 'of:video-camera-move-shot',
    name: 'Plano cinematográfico con un movimiento de cámara',
    kind: 'video',
    category: 'style',
    description: 'Fórmula base de Veo/Kling/Wan: cinematografía + sujeto + acción + contexto + estilo, con un único movimiento de cámara nombrado al principio y su ritmo.',
    tags: ['cámara', 'dolly', 'orbit', 'crane', 'tracking', 'fpv', 'drone', 'cinematográfico', 'plano'],
    models: ALL_VIDEO_MODELS,
    types: ['camera-motion', 'photorealism'],
    template:
      '{{shot_size}}, {{lens}}, {{camera_move}}. {{subject}} {{action}} in {{setting}}. ' +
      '{{lighting}}. {{style}}. ' + NO_TEXT_TAIL,
    variables: [
      { name: 'shot_size', description: 'Tamaño de plano y ángulo', example: 'Low-angle wide shot' },
      { name: 'lens', description: 'Lente / foco', example: '24mm anamorphic, deep focus' },
      { name: 'camera_move', description: 'UN movimiento + ritmo (dolly in, orbit, crane up, tracking, FPV drone, handheld, whip pan…)', example: 'slow crane up revealing the valley' },
      { name: 'subject', description: 'Sujeto', example: 'A lone horse rider' },
      { name: 'action', description: 'Acción', example: 'gallops along a ridge' },
      { ...V.setting, example: 'misty Patagonian mountains at dawn' },
      { name: 'lighting', description: 'Luz', example: 'Low golden backlight, volumetric fog' },
      { ...V.style, example: 'epic nature documentary, rich contrast' },
    ],
    guidance: [
      'Sin palabra de ritmo (slow, steady, rapid) el movimiento sale a velocidad media.',
      'Para un plano fijo dilo en positivo: "camera holds completely still".',
      'En Hailuo usa comandos entre corchetes: [Push in], [Pan left], [Tracking shot] (máx. 3).',
    ],
    aspectRatios: ['16:9', '9:16', '21:9'],
    durationSeconds: 5,
    references: [{ url: 'https://d1extl9qtlpf43.cloudfront.net/kling-blog/file/06573c0f16fe5410497beee5c0e31c57905e458cc61be23b60c1f850d1f2acea.jpg', caption: 'Movimientos de cámara (guía oficial de Kling)', credit: 'Kling AI', sourceUrl: 'https://kling.ai/quickstart/text-to-video-prompt-guide', license: '© Kling; enlazado desde la guía oficial' }],
    sources: [S.deepmind, S.veo, S.klingQuick, S.wan],
  },
  {
    id: 'of:video-hailuo-bracket-camera',
    name: 'Comandos de cámara entre corchetes (Hailuo)',
    kind: 'video',
    category: 'style',
    description: 'Hailuo / MiniMax acepta movimientos de cámara como comandos [Push in], [Pan left]… dentro del prompt. Bueno para física realista (líquidos, telas, deporte).',
    tags: ['hailuo', 'minimax', 'cámara', 'corchetes', 'push in', 'pan', 'física', 'acción'],
    models: ['hailuo'],
    types: ['camera-motion', 'ads'],
    template:
      '{{subject}} {{action}} in {{setting}}. [{{cmd1}}], then [{{cmd2}}]. {{lighting}}. {{style}}. Realistic physics, natural motion blur.',
    variables: [
      { name: 'subject', description: 'Sujeto', example: 'A sprinter in a red kit' },
      { name: 'action', description: 'Acción física', example: 'explodes out of the starting blocks, sweat spraying' },
      { ...V.setting, example: 'an empty stadium at night under floodlights' },
      { name: 'cmd1', description: 'Comando 1: Push in, Pull out, Pan left/right, Tilt up/down, Truck left/right, Tracking shot, Static shot, Zoom in, Pedestal up', example: 'Tracking shot' },
      { name: 'cmd2', description: 'Comando 2', example: 'Push in' },
      { name: 'lighting', description: 'Luz', example: 'Hard floodlights from above, deep shadows' },
      { ...V.style, example: 'sports commercial, high contrast' },
    ],
    guidance: ['No más de 3 comandos por clip.', 'Desactiva prompt_optimizer (extra_params) si quieres control literal.'],
    aspectRatios: ['16:9', '9:16'],
    durationSeconds: 6,
    sources: [S.segmind],
  },
  {
    id: 'of:video-audio-layers',
    name: 'Capas de audio: voz, efectos y ambiente',
    kind: 'video',
    category: 'style',
    description: 'Cómo escribir el audio para modelos con sonido nativo (Veo, Sora, Kling, Wan): fuentes concretas sincronizadas con acciones, ambiente aparte y música solo como género/ánimo.',
    tags: ['audio', 'sfx', 'sonido', 'ambiente', 'música', 'foley', 'veo', 'wan', 'kling'],
    models: ['veo', 'sora', 'kling', 'wan', 'seedance'],
    types: ['audio'],
    template:
      '{{visual}}\n' +
      'SFX: {{sfx}}, synced to the action.\n' +
      'Ambient noise: {{ambience}}; {{acoustics}}.\n' +
      'Music: {{music}}.',
    variables: [
      { name: 'visual', description: 'La descripción visual del plano', example: 'Close-up: a bartender sets a heavy crystal glass on the marble bar and pours whisky over a single ice sphere.' },
      { name: 'sfx', description: 'Efecto con su fuente exacta', example: 'as the glass touches the marble, a soft clink; then the gentle glug of pouring and ice crackling' },
      { name: 'ambience', description: 'Ambiente', example: 'low lounge chatter' },
      { name: 'acoustics', description: 'Espacio acústico', example: 'small warm room acoustics' },
      { name: 'music', description: 'Género y ánimo (o "no added score")', example: 'slow late-night jazz, brushed drums, quiet' },
    ],
    guidance: [
      'Nombra la fuente ("puerta de madera que se cierra de golpe"), no "un ruido".',
      'Una capa de sonido dominante por clip.',
      '"No added score" / "no background music" son instrucciones válidas.',
    ],
    aspectRatios: ['16:9', '9:16'],
    durationSeconds: 8,
    sources: [S.veo, S.sora, S.kling3, S.wan],
  },
  {
    id: 'of:video-v2v-edit',
    name: 'Edición de video a video (cambiar, quitar, reiluminar)',
    kind: 'video',
    category: 'editing',
    description: 'Edita un clip existente con un verbo de acción y un objetivo (Runway Aleph, Kling O1/edición, Wan). Útil para cambiar ángulo, clima, vestuario o estilo sin regenerar la escena.',
    tags: ['editar video', 'video to video', 'aleph', 'cambiar', 'quitar', 'relight', 'restyle', 'edición'],
    models: ['runway', 'kling', 'wan'],
    types: ['editing', 'consistency'],
    template:
      '{{verb}} {{target}}. Keep everything else in the video unchanged: the people, their motion, timing, framing and background. {{extra}}',
    variables: [
      { name: 'verb', description: 'Verbo: Change, Remove, Add, Replace, Re-light, Re-style', example: 'Re-light' },
      { name: 'target', description: 'Qué y cómo', example: 'the scene as golden hour, warm low sun from the right with long shadows' },
      { name: 'extra', description: 'Cómo usar la imagen de referencia, si hay', example: 'Match the color palette of the reference image.', optional: true },
    ],
    guidance: [
      'Un solo cambio por pasada; encadena pasadas para varios cambios.',
      'Para nuevos ángulos: "Change the camera to a wide angle that shows the entire person".',
    ],
    aspectRatios: ['16:9', '9:16'],
    sources: [S.luma],
  },
]
