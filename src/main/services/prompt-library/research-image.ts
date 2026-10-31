/**
 * Image templates distilled from the official prompting guides (Google Gemini/Nano Banana,
 * OpenAI GPT Image, BFL FLUX.2/Kontext, ByteDance Seedream, Ideogram, Midjourney) and
 * community collections. Written in our own words; visual references are either bundled
 * (CC BY 4.0, see resources/prompt-library/ATTRIBUTION.md) or linked to their source.
 */
import { type BuiltinPrompt, type BuiltinReference, V } from './types'

const S = {
  google: { title: 'Google Developers · How to prompt Gemini 2.5 Flash Image', url: 'https://developers.googleblog.com/en/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/' },
  googleCloud: { title: 'Google Cloud · Ultimate prompting guide for Nano Banana', url: 'https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana' },
  nbPro: { title: 'Google · Prompting tips for Nano Banana Pro', url: 'https://blog.google/products/gemini/prompting-tips-nano-banana-pro/' },
  openai: { title: 'OpenAI Cookbook · Image generation prompting guide', url: 'https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide.md' },
  seedream: { title: 'BytePlus · Seedream 4.0–5.0 prompt guide', url: 'https://docs.byteplus.com/docs/ModelArk/seedream-4-0-5-0-prompt-guide' },
  flux2: { title: 'BFL · FLUX.2 prompting guide', url: 'https://docs.bfl.ai/guides/prompting_guide_flux2' },
  bflMulti: { title: 'BFL · Multi-reference editing', url: 'https://docs.bfl.ml/guides/prompting_editing_multi_reference.md' },
  bflProduct: { title: 'BFL · Product consistency', url: 'https://docs.bfl.ml/guides/usecases_editing_product_consistency.md' },
  bflHex: { title: 'BFL · Hex color prompting', url: 'https://docs.bfl.ml/guides/usecases_t2i_hex_color_prompting.md' },
  bflEdit: { title: 'BFL · Kontext image editing', url: 'https://docs.bfl.ml/kontext/kontext_image_editing.md' },
  bflType: { title: 'BFL · Typography & design', url: 'https://docs.bfl.ml/guides/usecases_t2i_typography_design.md' },
  bflPhoto: { title: 'BFL · Photorealistic images', url: 'https://docs.bfl.ml/guides/usecases_t2i_photorealistic.md' },
  ideogramText: { title: 'Ideogram · Text in images', url: 'https://docs.ideogram.ai/prompting/text-in-images.md' },
  ideogramFix: { title: 'Ideogram · Fix common problems', url: 'https://docs.ideogram.ai/prompting/fix-common-problems.md' },
  ideogramChar: { title: 'Ideogram · Character', url: 'https://ideogram.ai/features/character' },
  mjSref: { title: 'Midjourney · Style reference', url: 'https://docs.midjourney.com/docs/style-reference' },
  qwenEdit: { title: 'Qwen-Image-Edit-2509', url: 'https://huggingface.co/Qwen/Qwen-Image-Edit-2509' },
  picotrex: { title: 'PicoTrex · Awesome-Nano-Banana-images', url: 'https://github.com/PicoTrex/Awesome-Nano-Banana-images' },
  youmindNbp: { title: 'YouMind · awesome-nano-banana-pro-prompts', url: 'https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts' },
  evolink: { title: 'Evolink · awesome-gpt-image-2 prompts', url: 'https://github.com/Evolink-AI/awesome-gpt-image-2-API-Prompts' },
  seedreamCases: { title: 'StevenQi7 · Awesome-Seedream-Four-Images', url: 'https://github.com/StevenQi7/Awesome-Seedream-Four-Images' },
  jamez: { title: 'jamez-bondos · awesome-gpt4o-images (CC BY 4.0)', url: 'https://github.com/jamez-bondos/awesome-gpt4o-images' },
}

/** An example image hosted by its source collection: shown with credit, never bundled */
function hosted(url: string, caption: string, credit: string, sourceUrl: string, license: string, date?: string): BuiltinReference {
  return { url, caption, credit, sourceUrl, license, date }
}
const FF = (n: number) => `https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/data/images/case${n}.jpg`
const FF_PAGE = 'https://github.com/freestylefly/awesome-gpt-image-2'
const FF_LICENSE = 'Repo: MIT; imagen de la comunidad (crédito al autor en X)'
const GOOGLE_DOCS = 'https://ai.google.dev/gemini-api/docs/image-generation'
const GOOGLE_LICENSE = 'CC BY 4.0 (Google AI for Developers)'
const DEEPMIND_PAGE = 'https://deepmind.google/models/gemini-image/flash/'
const DEEPMIND_LICENSE = '© Google; enlazado desde la página oficial'
const EVO = (path: string) => `https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main/images/${path}/output.jpg`
const EVO_LICENSE = 'Repo: CC0 1.0; imagen de un post de terceros'
const YOUMIND_LICENSE = 'Repo: CC BY 4.0; recopilado de la comunidad'
const SEEDREAM_LICENSE = 'Repo: Apache-2.0 / CC BY 4.0 (en conflicto); imagen de un post de terceros'

const REF_MODELS = ['nano-banana', 'gpt-image', 'seedream', 'flux', 'qwen-image']

export const IMAGE_RESEARCH_PROMPTS: BuiltinPrompt[] = [
  // ─── Personajes ──────────────────────────────────────────────
  {
    id: 'of:img-character-turnaround',
    name: 'Character sheet: turnaround y hoja de diseño',
    kind: 'image',
    category: 'character',
    description: 'Hoja de modelo del personaje (frente, 3/4, perfil, espalda + detalles) sobre fondo neutro. Es la referencia maestra que después se adjunta a cada imagen o video para que el personaje no cambie.',
    tags: ['character sheet', 'hoja de personaje', 'turnaround', 'model sheet', 'personaje', 'consistencia', 'vistas', 'diseño de personaje', 'mascota'],
    models: [...REF_MODELS, 'ideogram'],
    types: ['character-sheet', 'consistency'],
    template:
      'Character design sheet of {{character}}, for a {{purpose}}. Layout: {{views}}, evenly spaced and labeled, plus a close-up of {{detail}}. ' +
      'Same character in every view: identical face, hairstyle, proportions, outfit and colors. Neutral pose, even soft studio lighting, plain {{background}} background. {{style}}.',
    variables: [
      V.character,
      { name: 'purpose', description: 'Para qué es (ayuda al modelo a elegir el formato)', example: 'animated brand campaign' },
      { name: 'views', description: 'Vistas a incluir', example: 'front view, three-quarter view, side profile and back view in one row' },
      { name: 'detail', description: 'Detalle a ampliar', example: 'the face and the silver hoop earrings' },
      { name: 'background', description: 'Fondo', example: 'light grey' },
      { ...V.style, example: 'clean 3D render, soft subsurface skin, Pixar-like proportions' },
    ],
    guidance: [
      'Si ya existe una foto/ilustración del personaje, adjúntala como referencia y escribe "the character from image 1".',
      'Guarda la descripción del personaje (su "biblia") y pégala palabra por palabra en cada prompt posterior; incluye marcas pequeñas (cicatriz, lunar, accesorio).',
      'Midjourney V7: usa la hoja como --oref con --ow ~100–400 (más alto = más fiel). Ideogram Character acepta una foto de referencia.',
      'Si la identidad deriva tras muchas ediciones, empieza de cero con la hoja original en vez de encadenar ediciones.',
    ],
    aspectRatios: ['16:9', '3:2'],
    references: [hosted(FF(439), 'Hoja de personaje: frente, perfil, espalda, paleta y detalles (GPT Image 2)', 'freestylefly · awesome-gpt-image-2 (caso 439)', FF_PAGE, FF_LICENSE, '2026-05-17'), hosted(FF(512), 'Character sheet de producción 16:9 (GPT Image 2)', 'freestylefly · awesome-gpt-image-2 (caso 512)', FF_PAGE, FF_LICENSE, '2026-06-29'), hosted('https://ai.google.dev/static/gemini-api/docs/images/man_in_white_glasses_looking_right.jpg', 'Consistencia de personaje: vista 360 (Nano Banana, docs oficiales)', 'Google AI for Developers', GOOGLE_DOCS, GOOGLE_LICENSE, '2026-10')],
    sources: [S.google, S.openai, S.seedream, S.ideogramChar, S.picotrex],
  },
  {
    id: 'of:img-expression-sheet',
    name: 'Character sheet: expresiones y poses (grilla 3×3)',
    kind: 'image',
    category: 'character',
    description: 'Nueve viñetas del mismo personaje con distintas emociones y acciones. Sirve para stickers, reacciones en redes o para tener expresiones listas antes de animar.',
    tags: ['expresiones', 'expression sheet', 'stickers', 'poses', 'emociones', 'grilla', '3x3', 'character sheet', 'mascota'],
    models: [...REF_MODELS],
    types: ['character-sheet', 'consistency', 'social'],
    template:
      'A 3×3 grid of nine panels of the same character: {{character}}. Each panel shows one expression or action: {{expressions}}. ' +
      'Identical face, hair, outfit and colors in all nine; {{style}}; each figure with a clean white outline on a {{background}} background, evenly spaced, no text.',
    variables: [
      V.character,
      { name: 'expressions', description: 'Las 9 emociones/acciones', example: 'bored, laughing, winking, surprised, thumbs up, eating, worried, crying, furious' },
      { ...V.style, example: 'chibi sticker style, bold lines, flat cel shading' },
      { name: 'background', description: 'Fondo', example: 'solid black' },
    ],
    guidance: [
      'Funciona mejor con la hoja de turnaround o una foto como referencia.',
      'Para recortar stickers, pide fondo liso de un color que no aparezca en el personaje.',
    ],
    aspectRatios: ['1:1'],
    references: [hosted('https://cms-assets.youmind.com/media/1790322685750_etehov_HS7hLOFW8AAwly6.jpg', 'Hoja de diseño de criatura con poses y expresiones (GPT Image 2)', 'YouMind', 'https://github.com/YouMind-OpenLab/awesome-gpt-image-2', YOUMIND_LICENSE, '2026-09-23'), { file: 'expression-sheet-chibi.jpg', caption: 'Nueve expresiones del mismo personaje (GPT-4o, 2025)', credit: '@jamez-bondos · idea de @leon_yuan2001', sourceUrl: 'https://github.com/jamez-bondos/awesome-gpt4o-images/tree/main/cases/21', license: 'CC BY 4.0', date: '2025-05' }],
    sources: [S.openai, S.jamez],
  },
  {
    id: 'of:img-character-new-scene',
    name: 'Mismo personaje en una escena nueva (identidad bloqueada)',
    kind: 'image',
    category: 'character',
    description: 'Lleva al personaje (o a una persona real con su permiso) de la hoja de referencia a una escena nueva, declarando la referencia como guía exclusiva de identidad.',
    tags: ['mismo personaje', 'consistencia', 'identidad', 'referencia', 'retrato', 'escena', 'campaña', 'serie'],
    models: REF_MODELS,
    types: ['consistency', 'photorealism', 'ads'],
    template:
      'Use image 1 as the exclusive reference for the person\'s identity: face, bone structure, proportions, skin tone and hair stay exactly the same. ' +
      '{{character}} is now {{action}} in {{setting}}, wearing {{outfit}}. {{camera}}, {{lighting}}. {{style}}. Natural skin texture, realistic proportions.',
    variables: [
      V.character,
      { name: 'action', description: 'Acción en la nueva escena', example: 'laughing while ordering at a street-food stall' },
      { ...V.setting, example: 'a night market in Bangkok' },
      { name: 'outfit', description: 'Vestuario (igual al de la hoja, salvo que cambie a propósito)', example: 'the same mustard raincoat' },
      { name: 'camera', description: 'Cámara y lente', example: 'Medium shot, 50mm lens at f/1.8' },
      { name: 'lighting', description: 'Luz', example: 'warm string lights and neon signs' },
      { ...V.style, example: 'candid editorial photography, Kodak Portra 400 look' },
    ],
    guidance: [
      'Nombra la referencia siempre igual ("image 1", "the woman from image 1").',
      'Una sola variación por imagen (escena o vestuario), no las dos a la vez si la identidad es crítica.',
      'No uses fotos de personas reales sin su consentimiento.',
    ],
    aspectRatios: ['4:5', '9:16', '3:2'],
    references: [hosted(EVO('portrait_case297'), 'Retrato con identidad bloqueada por referencia (GPT Image 2)', '@john_my07 vía Evolink', 'https://github.com/Evolink-AI/awesome-gpt-image-2-API-Prompts', EVO_LICENSE, '2026')],
    sources: [S.openai, S.google, S.evolink],
  },
  {
    id: 'of:img-character-card',
    name: 'Carta de personaje / mascota de marca',
    kind: 'image',
    category: 'character',
    description: 'El personaje presentado como carta coleccionable con nombre, título y atributos. Útil para presentar mascotas de marca, embajadores o personajes de una serie.',
    tags: ['carta', 'trading card', 'mascota', 'personaje', 'presentación', 'rpg', 'brand mascot', 'tipografía'],
    models: ['nano-banana', 'gpt-image', 'seedream', 'ideogram'],
    types: ['character-sheet', 'typography', 'brand'],
    template:
      'Collectible character card for {{character}}. Ornate {{frame}} frame; a banner at the top reads "{{title}}"; the character stands in the center in a confident pose, {{style}}, ' +
      'surrounded by {{props}}. A name plate reads "{{name}}". At the bottom, three stat bars labeled "{{stat1}}", "{{stat2}}" and "{{stat3}}". Crisp, perfectly spelled text.',
    variables: [
      V.character,
      { name: 'frame', description: 'Marco', example: 'copper and navy' },
      { name: 'title', description: 'Título superior', example: 'MASTER BARISTA' },
      { ...V.style, example: 'stylized 3D render, warm rim light' },
      { name: 'props', description: 'Elementos alrededor', example: 'floating coffee beans and glowing latte-art icons' },
      { name: 'name', description: 'Nombre', example: 'Lumen' },
      { name: 'stat1', description: 'Atributo 1', example: 'AROMA +9' },
      { name: 'stat2', description: 'Atributo 2', example: 'SPEED +7' },
      { name: 'stat3', description: 'Atributo 3', example: 'GOOD VIBES +10' },
    ],
    guidance: ['Textos cortos y entre comillas; revisa la ortografía y regenera si falla.'],
    aspectRatios: ['2:3', '3:4'],
    references: [hosted(FF(512), 'Character sheet de producción (GPT Image 2)', 'freestylefly · awesome-gpt-image-2 (caso 512)', FF_PAGE, FF_LICENSE, '2026-06-29'), { file: 'character-card.jpg', caption: 'Personaje como carta coleccionable con atributos (GPT-4o, 2025)', credit: '@jamez-bondos · idea de @berryxia_ai', sourceUrl: 'https://github.com/jamez-bondos/awesome-gpt4o-images/tree/main/cases/44', license: 'CC BY 4.0', date: '2025-05' }],
    sources: [S.openai, S.ideogramText, S.jamez],
  },

  // ─── Producto ────────────────────────────────────────────────
  {
    id: 'of:img-product-reference-sheet',
    name: 'Product sheet: biblia de continuidad del producto',
    kind: 'image',
    category: 'product',
    description: 'Varias vistas del MISMO producto en una sola hoja editorial. Se genera una vez a partir de la foto real y se usa como referencia en todas las piezas de la campaña.',
    tags: ['product sheet', 'producto', 'vistas', 'consistencia', 'packaging', 'continuidad', 'catálogo', 'referencia'],
    models: REF_MODELS,
    types: ['product', 'consistency', 'character-sheet'],
    template:
      'Product reference sheet for {{product}} from image 1, a visual continuity bible for a campaign. Show it {{views}} in a clean labeled editorial grid on a neutral {{background}} studio background. ' +
      'Keep the label, logo, shape, proportions, materials and colors exactly as in the reference; do not redesign, restyle or add variants. Even three-point softbox lighting, true-to-life color, sharp detail.',
    variables: [
      { ...V.product, example: 'the amber glass bottle of cold brew' },
      { name: 'views', description: 'Vistas', example: 'from the front, back, left side, three-quarter angle, top-down, plus a macro of the label' },
      { name: 'background', description: 'Fondo', example: 'warm grey' },
    ],
    guidance: [
      'Parte SIEMPRE de una foto real del producto: el texto solo no conserva etiquetas.',
      'GPT Image: input_fidelity high cuando el proveedor lo permita; fondo transparente para recortes.',
    ],
    aspectRatios: ['3:2', '16:9', '1:1'],
    references: [hosted('https://cdn.sanity.io/images/2gpum2i6/production/74e39922edc637d5f33df40891b967177e4ab9a2-1120x1408.png', 'FLUX.2: el mismo producto en cualquier contexto', 'Black Forest Labs', 'https://bfl.ai/models/flux-2', '© Black Forest Labs; enlazado desde la página oficial', '2025-11')],
    sources: [S.bflProduct, S.openai, S.youmindNbp],
  },
  {
    id: 'of:img-product-from-reference-ad',
    name: 'Anuncio con el producto real de la referencia',
    kind: 'image',
    category: 'advertising',
    description: 'Pone el producto exacto de la foto de referencia en una escena publicitaria nueva, con invariantes explícitas para que no cambie etiqueta ni forma. El brief creativo va dentro del prompt.',
    tags: ['anuncio', 'producto real', 'referencia', 'packshot', 'campaña', 'key visual', 'ads', 'etiqueta', 'logo'],
    models: REF_MODELS,
    types: ['ads', 'product', 'consistency'],
    template:
      'An advertising image for {{brand}}, aimed at {{audience}}, with a {{mood}} vibe. This {{product_noun}} from image 1 {{placement}} on {{surface}}, {{setting}}. ' +
      '{{lighting}}; {{camera}}; focus on {{hero_detail}}. Keep the label, logo, shape, proportions, materials and colors exactly as in image 1; do not redesign it. ' +
      'Realistic reflections and contact shadows matching the scene light.',
    variables: [
      V.brand, V.audience, V.mood,
      { name: 'product_noun', description: 'Cómo nombrar el producto (sin pronombres)', example: 'coffee bag' },
      { name: 'placement', description: 'Cómo está colocado', example: 'stands upright, slightly turned toward camera' },
      { name: 'surface', description: 'Superficie', example: 'a rough slate counter' },
      { ...V.setting, example: 'beside a steaming pour-over in early morning light' },
      { name: 'lighting', description: 'Luz', example: 'Low warm sunlight through a window, soft fill from the right' },
      { name: 'camera', description: 'Cámara', example: '85mm, f/4, eye level' },
      { name: 'hero_detail', description: 'Detalle protagonista', example: 'the embossed copper logo' },
    ],
    guidance: [
      'Usa la misma palabra para el producto en todos los prompts ("this coffee bag").',
      'Para el claim, escríbelo entre comillas y pide que aparezca una sola vez.',
      'Con FLUX la proporción "auto" sale de la primera imagen: pon la escena base primero.',
    ],
    aspectRatios: ['4:5', '1:1', '9:16'],
    references: [hosted(FF(358), 'Key visual con splash de bebida energética ficticia (GPT Image 2)', 'freestylefly · awesome-gpt-image-2 (caso 358)', FF_PAGE, FF_LICENSE, '2026-04-28'), hosted('https://lh3.googleusercontent.com/bMqF1dm4wFO9M82Gdkpbf8QhwzSMQHarpcBumU88Nh2HgTL4xvDxMgdJnx9tExvRgxSpUtrs47pwv1RbPZnxeYnx0bIq87e0ZA8mXv5gocYiS-acPg=w1440-h810-n-nu', 'Bolso sobre columna de terrazo (Nano Banana 2)', 'Google DeepMind', DEEPMIND_PAGE, DEEPMIND_LICENSE, '2026-02')],
    sources: [S.bflProduct, S.openai, S.googleCloud, S.picotrex],
  },
  {
    id: 'of:img-multi-reference-composition',
    name: 'Composición con varias referencias (personaje + producto + lugar)',
    kind: 'image',
    category: 'advertising',
    description: 'Combina imágenes con un rol cada una (quién, qué, dónde, estilo) y verbos de relación concretos. La forma más fiable de juntar talento, producto y locación aprobados.',
    tags: ['multi referencia', 'varias imágenes', 'composición', 'personaje', 'producto', 'locación', 'combinar', 'consistencia'],
    models: REF_MODELS,
    types: ['consistency', 'ads'],
    template:
      'The {{subject}} from image 1 {{relation}} the {{product}} from image 2 in the {{place}} from image 3{{style_clause}}. {{action}}. ' +
      'Keep the identity of the {{subject}}, the exact design of the {{product}} and the architecture of the {{place}}. Match lighting, perspective, scale and shadows across all elements. {{camera}}.',
    variables: [
      { name: 'subject', description: 'Sujeto de la imagen 1 (sin pronombres)', example: 'woman with the short black bob' },
      { name: 'relation', description: 'Verbo de relación', example: 'holds' },
      { name: 'product', description: 'Producto de la imagen 2', example: 'amber cold-brew bottle' },
      { name: 'place', description: 'Lugar de la imagen 3', example: 'rooftop terrace' },
      { name: 'style_clause', description: 'Opcional: ", in the style of image 4"', example: ', in the color grade of image 4', optional: true },
      { name: 'action', description: 'Acción', example: 'She leans on the railing at sunset and raises the bottle in a toast' },
      { name: 'camera', description: 'Cámara', example: 'Medium-wide shot, 35mm, golden hour' },
    ],
    guidance: [
      'Nunca "combina estas imágenes" ni "usa el estilo de la otra": asigna un rol por imagen.',
      'Límites: Nano Banana Pro ~6 objetos + 5 personajes + 3 estilos; FLUX.2 hasta 8; Qwen Edit rinde mejor con 1–3.',
    ],
    aspectRatios: ['4:5', '16:9', '9:16'],
    references: [hosted('https://ai.google.dev/static/gemini-api/docs/images/office-group-photo.jpeg', 'Varias personas de referencia en una sola foto (Nano Banana, docs oficiales)', 'Google AI for Developers', GOOGLE_DOCS, GOOGLE_LICENSE, '2026-10'), hosted('https://lh3.googleusercontent.com/IcN0mlePiiqgBW-Vp5dL7qMqntYI8ZPUIg2C2rsyHtmuXxJgwD27yFfpg4c5BJ6AeK1G67DT-IPW_mN0p6bdzs1qFaaWpV2xfE65wcpHm6d1_hPpXok=w1440-h810-n-nu', '14 personajes de fieltro combinados en una escena (Nano Banana 2)', 'Google DeepMind', DEEPMIND_PAGE, DEEPMIND_LICENSE, '2026-02'), hosted('https://cdn.sanity.io/images/2gpum2i6/production/4c9d116ad290ca493f22b10e001afa9e9cb469c0-1120x736.png', 'Composición de 6 referencias (FLUX.2)', 'Black Forest Labs', 'https://bfl.ai/models/flux-2', '© Black Forest Labs; enlazado desde la página oficial', '2025-11')],
    sources: [S.bflMulti, S.googleCloud, S.openai, S.picotrex],
  },

  // ─── Estilo / marca ──────────────────────────────────────────
  {
    id: 'of:img-brand-style-lock',
    name: 'Bloqueo de estilo de marca (paleta hex + referencia)',
    kind: 'image',
    category: 'style',
    description: 'Mantiene una identidad visual en toda la serie: separa lo que se queda (paleta, textura, luz, trazo) de lo que cambia (el sujeto), con colores en hex atados a objetos.',
    tags: ['estilo', 'marca', 'branding', 'paleta', 'hex', 'style reference', 'identidad visual', 'consistencia', 'merch'],
    models: [...REF_MODELS, 'ideogram', 'midjourney'],
    types: ['style-reference', 'brand', 'consistency'],
    template:
      'Keep the visual style of image 1: {{style_traits}}. Change only the subject: {{subject}}. ' +
      'Brand colors: {{hex_colors}}. {{composition}}. No extra elements beyond the subject; background {{background}}.',
    variables: [
      { name: 'style_traits', description: 'Rasgos de estilo a conservar', example: 'flat vector shapes, 2px rounded line weight, soft grain texture, top-left light' },
      { name: 'subject', description: 'Nuevo sujeto', example: 'a tote bag, a paper cup and a cap with the logo, as a flat lay' },
      { name: 'hex_colors', description: 'Colores hex atados a objetos', example: 'the bag is #1F3A2E, the cup sleeve is #E8C07D, accents #F4EFE6' },
      { name: 'composition', description: 'Encuadre', example: 'Top-down, evenly spaced, generous margins' },
      { name: 'background', description: 'Fondo', example: 'off-white #F4EFE6' },
    ],
    guidance: [
      'Midjourney: --sref <url o código> con --sw 0–1000 (100 por defecto); el código mantiene el look entre tiradas.',
      'FLUX.2 no tiene negative prompt: describe lo que quieres en positivo.',
      'Para plantillas que se repiten, un prompt en JSON (FLUX.2, Ideogram 4) mantiene los campos fijos.',
    ],
    aspectRatios: ['1:1', '4:5', '16:9'],
    references: [hosted('https://raw.githubusercontent.com/StevenQi7/Awesome-Seedream-Four-Images/main/cases/12/after.jpg', 'Set de merch con una paleta fija a partir de un logo', '@OdysseAI_ vía StevenQi7', 'https://github.com/StevenQi7/Awesome-Seedream-Four-Images', SEEDREAM_LICENSE, '2025-09')],
    sources: [S.bflHex, S.openai, S.mjSref, S.seedream, S.seedreamCases],
  },

  // ─── Storyboard ──────────────────────────────────────────────
  {
    id: 'of:img-storyboard-sheet',
    name: 'Storyboard en una hoja (grilla de viñetas)',
    kind: 'image',
    category: 'storyboard',
    description: 'Todas las viñetas de una escena o spot en una sola imagen: estilo global y personaje arriba, después un beat concreto por viñeta. Base para aprobar la historia antes de generar video.',
    tags: ['storyboard', 'viñetas', 'grilla', 'paneles', 'guion gráfico', 'escena', 'spot', 'planificación', 'shot list'],
    models: ['nano-banana', 'gpt-image', 'seedream'],
    types: ['storyboard', 'consistency', 'multi-shot'],
    template:
      '{{style}} storyboard sheet, {{grid}} grid of panels with thin white gutters, consistent character: {{character}}. ' +
      'Panel 1: {{p1}}. Panel 2: {{p2}}. Panel 3: {{p3}}. Panel 4: {{p4}}. Panel 5: {{p5}}. Panel 6: {{p6}}. ' +
      'Same character, wardrobe, palette and lighting logic in every panel; each panel framed as a film shot. No text on the images.',
    variables: [
      { ...V.style, example: 'Cinematic photoreal, muted teal-and-amber grade' },
      { name: 'grid', description: 'Grilla', example: '2×3' },
      V.character,
      { name: 'p1', description: 'Viñeta 1: plano + acción', example: 'wide shot, she enters a dark lighthouse with a lantern' },
      { name: 'p2', description: 'Viñeta 2', example: 'close-up of her hand on a rusted spiral railing' },
      { name: 'p3', description: 'Viñeta 3', example: 'low angle, she climbs the stairs, light spilling from above' },
      { name: 'p4', description: 'Viñeta 4', example: 'over-the-shoulder, she finds an old logbook on a desk' },
      { name: 'p5', description: 'Viñeta 5', example: 'extreme close-up of her eyes reading by lantern light' },
      { name: 'p6', description: 'Viñeta 6', example: 'wide exterior, the lighthouse beam turns on over a stormy sea' },
    ],
    guidance: [
      'Un beat visual concreto por viñeta (plano + acción + lugar).',
      'Con texto: diálogos entre comillas por viñeta; sin texto: dilo explícito.',
      'Después genera cada viñeta aprobada en alta como frame inicial de su video.',
    ],
    aspectRatios: ['16:9', '3:2'],
    references: [hosted('https://cms-assets.youmind.com/media/1788591091473_7f611z_HRZCZUlaMAAu2-k.png', 'Storyboard cinematográfico de varias viñetas (Nano Banana Pro)', '@SheBuildsAI_ vía YouMind', 'https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts', YOUMIND_LICENSE, '2026-09'), hosted(FF(347), 'Hoja 4×4 de desglose de movimiento (GPT Image 2)', 'freestylefly · awesome-gpt-image-2 (caso 347)', FF_PAGE, FF_LICENSE, '2026-04-27'), hosted('https://ai.google.dev/static/gemini-api/docs/images/comic_panel.jpg', 'Viñetas de cómic (Nano Banana, docs oficiales)', 'Google AI for Developers', GOOGLE_DOCS, GOOGLE_LICENSE, '2026-10')],
    sources: [S.openai, S.google, S.youmindNbp],
  },
  {
    id: 'of:img-ad-storyboard-keyframes',
    name: 'Storyboard de comercial de producto (9 keyframes)',
    kind: 'image',
    category: 'storyboard',
    description: 'Una foto del producto se convierte en una hoja de 9 keyframes de un spot vertical, con vocabulario de planos y el mismo producto en todas. Ideal para presentar el spot al cliente antes de animarlo.',
    tags: ['storyboard', 'comercial', 'tvc', 'keyframes', 'producto', 'spot', 'anuncio', 'ecommerce', 'shot list'],
    models: ['nano-banana', 'gpt-image', 'seedream'],
    types: ['storyboard', 'ads', 'product', 'consistency'],
    template:
      'A 3×3 storyboard sheet for a {{duration}}-second vertical commercial for {{brand}} featuring this {{product_noun}} from image 1, unchanged in every frame. ' +
      'Frames in order: {{frames}}. Each frame labeled with its number and a small camera-move icon; consistent {{palette}} palette and lighting; photoreal product, clean thin gutters.',
    variables: [
      { name: 'duration', description: 'Duración del spot', example: '15' },
      V.brand,
      { name: 'product_noun', description: 'Cómo nombrar el producto', example: 'maple syrup bottle' },
      { name: 'frames', description: 'Los 9 planos', example: '1 extreme macro of syrup drop, 2 push-in on the label, 3 pancakes stack, 4 pour in slow motion, 5 hand reaches, 6 family table wide, 7 child smiling close-up, 8 hero bottle low angle, 9 end card with logo' },
      V.palette,
    ],
    guidance: [
      'Dos pasos funcionan mejor: primero el hero shot del producto, luego la hoja de keyframes usándolo como referencia.',
      'Cada keyframe aprobado puede ser el start frame del clip correspondiente.',
    ],
    aspectRatios: ['1:1', '4:5'],
    references: [hosted('https://cms-assets.youmind.com/media/1788849672027_lytnc6_HRlyjBWaIAER5_L.jpg', 'Storyboard de comercial en 8 viñetas con timecodes y cámara (Nano Banana Pro)', '@Strength04_X vía YouMind', 'https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts', YOUMIND_LICENSE, '2026-09-07'), hosted('https://cms-assets.youmind.com/media/1788764296518_gnohn9_HRhHsR9bsAA2PD-.jpg', 'Storyboard de comercial de yogur en 8 viñetas (Nano Banana Pro)', 'YouMind', 'https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts', YOUMIND_LICENSE, '2026-09-06'), hosted(EVO('poster_case160'), 'Storyboard de 9 viñetas que conserva el producto (GPT Image 2)', '@Magncsans vía Evolink', 'https://github.com/Evolink-AI/awesome-gpt-image-2-API-Prompts', EVO_LICENSE, '2026')],
    sources: [S.openai, S.evolink, S.youmindNbp],
  },
  {
    id: 'of:img-seedream-series',
    name: 'Serie de imágenes consistentes en una sola llamada (Seedream)',
    kind: 'image',
    category: 'storyboard',
    description: 'Seedream genera varias imágenes coherentes si el prompt pide "una serie" o un número de imágenes. Para cómics, secuencias, packs de stickers o variantes de campaña.',
    tags: ['seedream', 'serie', 'secuencia', 'cómic', 'set', 'múltiples imágenes', 'consistencia', 'storyboard'],
    models: ['seedream'],
    types: ['storyboard', 'consistency', 'multi-shot'],
    template:
      'Generate a series of {{count}} images in {{style}}, starring the {{subject}} from image 1 with consistent character continuity: {{beats}}. Same palette and lighting across the set.',
    variables: [
      { name: 'count', description: 'Cuántas imágenes', example: '4' },
      { ...V.style, example: 'a warm crayon children\'s-book style' },
      { name: 'subject', description: 'Sujeto de la referencia', example: 'boy with the red cap' },
      { name: 'beats', description: 'Qué pasa en cada imagen, en orden', example: 'he finds a stray puppy in the rain; he dries it with a towel at home; they share breakfast; they run together in the park' },
    ],
    guidance: ['Activa la salida múltiple del modelo si el proveedor lo pide (p. ej. max_images en extra_params).'],
    aspectRatios: ['1:1', '4:3'],
    references: [hosted('https://raw.githubusercontent.com/StevenQi7/Awesome-Seedream-Four-Images/main/cases/4/after.jpg', 'Serie de cómics con el mismo personaje', '@aiwarts vía StevenQi7', 'https://github.com/StevenQi7/Awesome-Seedream-Four-Images', SEEDREAM_LICENSE, '2025-09')],
    sources: [S.seedream, S.seedreamCases],
  },
  {
    id: 'of:img-cinematic-contact-sheet',
    name: 'Contact sheet cinematográfico de una escena',
    kind: 'image',
    category: 'storyboard',
    description: 'Nueve fotogramas de la misma escena desde ángulos distintos, con emulación de película. Explora cobertura y luz de una escena antes de elegir planos.',
    tags: ['contact sheet', 'cobertura', 'fotogramas', 'cinematográfico', 'película', 'ángulos', 'escena', 'storyboard'],
    models: ['nano-banana', 'gpt-image', 'seedream'],
    types: ['storyboard', 'photorealism', 'consistency'],
    template:
      'A 3×3 cinematic contact sheet of one continuous scene: {{scene}}. Nine different frames of the same moment and the same people: {{coverage}}. ' +
      'Consistent wardrobe, set dressing and light across all frames; {{film}} film emulation, natural grain, thin black frame borders.',
    variables: [
      { name: 'scene', description: 'La escena', example: 'a family dinner in a small apartment, Sunday evening, warm lamps' },
      { name: 'coverage', description: 'Ángulos/planos', example: 'wide master, two-shots, over-the-shoulder, close-ups of hands passing dishes, a child laughing, insert of the window' },
      { name: 'film', description: 'Película', example: 'Kodak Portra 400' },
    ],
    guidance: ['Útil para elegir el plano que luego se genera en alta o se anima.'],
    aspectRatios: ['1:1', '3:2'],
    references: [hosted('https://cms-assets.youmind.com/media/1788676673943_9krm5d_HRcrK6SbcAApp-f.jpg', 'Contact sheet 3×3 de una escena familiar (Nano Banana Pro)', '@SheBuildsAI_ vía YouMind', 'https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts', YOUMIND_LICENSE, '2026-09')],
    sources: [S.openai, S.youmindNbp],
  },

  // ─── Edición ─────────────────────────────────────────────────
  {
    id: 'of:img-edit-change-only',
    name: 'Edición: cambiar solo X, mantener todo lo demás',
    kind: 'image',
    category: 'editing',
    description: 'Patrón de edición de todos los modelos con referencia: verbo fuerte + objetivo nombrado sin pronombres + nuevo estado + lista explícita de lo que no cambia.',
    tags: ['editar', 'edición', 'cambiar', 'reemplazar', 'quitar', 'agregar', 'inpainting', 'vestuario', 'retoque'],
    models: [...REF_MODELS],
    types: ['editing', 'consistency'],
    template:
      '{{verb}} {{target}} {{change}}. Keep everything else exactly the same: {{keep}}.',
    variables: [
      { name: 'verb', description: 'Add / Remove / Replace / Change', example: 'Replace' },
      { name: 'target', description: 'Qué, nombrado con precisión (sin "eso", "ella")', example: 'the blue denim jacket of the woman with the short black bob' },
      { name: 'change', description: 'El nuevo estado', example: 'with the camel wool coat from image 2' },
      { name: 'keep', description: 'Lista de lo que se conserva', example: 'her face and identity, pose, expression, hairstyle, background, lighting and shadows, camera angle and framing' },
    ],
    guidance: [
      'Un cambio por pasada; repite la lista de "keep" en cada iteración.',
      'Cambios grandes: hazlos en pasos.',
      'Para zonas difíciles, dibuja un recuadro de color sobre la imagen y nómbralo ("inside the red box").',
      'Si la identidad se degrada tras varias ediciones, vuelve a la imagen original.',
    ],
    aspectRatios: [],
    references: [hosted('https://ai.google.dev/static/gemini-api/docs/images/fashion_ecommerce_shot.png', 'Prenda de una imagen puesta en la modelo de otra (Nano Banana, docs oficiales)', 'Google AI for Developers', GOOGLE_DOCS, GOOGLE_LICENSE, '2026-10')],
    sources: [S.openai, S.bflEdit, S.seedream, S.google, S.picotrex],
  },
  {
    id: 'of:img-edit-text-replace',
    name: 'Edición de texto en imagen (reemplazar palabra)',
    kind: 'image',
    category: 'editing',
    description: 'Cambia un texto existente (cartel, envase, póster) conservando tipografía, color y material. Sintaxis directa que entienden FLUX Kontext, Qwen Edit y Nano Banana.',
    tags: ['texto', 'editar texto', 'reemplazar', 'cartel', 'etiqueta', 'traducir', 'tipografía', 'packaging'],
    models: ['flux', 'qwen-image', 'nano-banana', 'gpt-image', 'seedream'],
    types: ['editing', 'typography'],
    template:
      'Replace \'{{old_text}}\' with \'{{new_text}}\' on the {{surface}}. Keep the same font, weight, color, size, perspective and material; change nothing else.',
    variables: [
      { name: 'old_text', description: 'Texto actual exacto', example: 'SUMMER SALE' },
      { name: 'new_text', description: 'Texto nuevo', example: 'WINTER DEALS' },
      { name: 'surface', description: 'Dónde está', example: 'shop window sign' },
    ],
    guidance: ['Textos de largo similar se editan mejor; palabras raras, deletréalas.', 'Qwen Image Edit es fuerte en texto chino/inglés.'],
    aspectRatios: [],
    sources: [S.bflEdit, S.qwenEdit],
  },

  // ─── Texto / fotorrealismo ───────────────────────────────────
  {
    id: 'of:img-typography-poster',
    name: 'Póster con jerarquía tipográfica',
    kind: 'image',
    category: 'advertising',
    description: 'Póster con título grande y subtítulo menor, cada texto entre comillas, con estilo de letra, color y posición. Para eventos, promociones, destinos y lanzamientos.',
    tags: ['póster', 'poster', 'tipografía', 'texto', 'título', 'afiche', 'vector', 'evento', 'promoción', 'viaje'],
    models: ['nano-banana', 'gpt-image', 'ideogram', 'seedream', 'qwen-image', 'flux'],
    types: ['typography', 'ads', 'brand'],
    template:
      'A {{style}} poster. At the top, a large title "{{title}}" in {{title_font}}, color {{title_color}}; below it a smaller subtitle "{{subtitle}}" in {{subtitle_font}}. ' +
      'Illustration: {{illustration}}. Palette: {{palette}}. Generous margins, clear reading order: title, subtitle, image.',
    variables: [
      { ...V.style, example: 'mid-century flat vector travel' },
      { name: 'title', description: 'Título (corto)', example: 'SANTIAGO' },
      { name: 'title_font', description: 'Estilo de letra (describe, no nombres de archivo)', example: 'bold rounded serif capitals' },
      { name: 'title_color', description: 'Color (hex si es de marca)', example: '#FFF1C9' },
      { name: 'subtitle', description: 'Subtítulo', example: 'CHILE' },
      { name: 'subtitle_font', description: 'Estilo subtítulo', example: 'spaced-out geometric sans' },
      { name: 'illustration', description: 'Ilustración', example: 'the Andes at sunset behind the city skyline and a cable car' },
      { ...V.palette, example: 'teal, saffron and terracotta' },
    ],
    guidance: [
      'Texto entre comillas y al principio del prompt; los textos largos agrégalos luego como capa.',
      'Ideogram: describe el estilo de letra; ignora pesos tipo ::1 o --ar en el texto.',
      'Seedream: title "Texto" (con comillas), no titled Texto.',
    ],
    aspectRatios: ['2:3', '3:4', '9:16'],
    references: [hosted(FF(511), 'Póster tipográfico de viaje con el nombre de la ciudad (GPT Image 2)', 'freestylefly · awesome-gpt-image-2 (caso 511)', FF_PAGE, FF_LICENSE, '2026-06-30'), hosted('https://cms-assets.youmind.com/media/1789717708670_l9g6hd_HSaRCE7aEAARvTd.jpg', 'Póster tipográfico de festival (GPT Image 2)', 'YouMind', 'https://github.com/YouMind-OpenLab/awesome-gpt-image-2', YOUMIND_LICENSE, '2026-09-17')],
    sources: [S.ideogramText, S.openai, S.bflType, S.seedream],
  },
  {
    id: 'of:img-photoreal-candid',
    name: 'Fotorrealismo creíble (cámara, película, imperfecciones)',
    kind: 'image',
    category: 'style',
    description: 'Realismo de foto real en lugar de "8k masterpiece": equipo concreto, película, luz y pequeñas imperfecciones. Para UGC estático, lifestyle y retratos que no parezcan IA.',
    tags: ['fotorrealismo', 'realista', 'foto real', 'candid', 'película', 'kodak', 'ugc', 'lifestyle', 'retrato', 'natural'],
    models: ['nano-banana', 'gpt-image', 'seedream', 'flux', 'qwen-image', 'midjourney'],
    types: ['photorealism', 'ugc', 'social'],
    template:
      'Photorealistic {{shot}} of {{subject}} {{action}} in {{setting}}. Shot on {{camera}}, {{film}}. {{lighting}}. ' +
      'Real texture: visible skin pores, slight fabric wear, {{imperfection}}. Casual, unposed framing; sharp focus on the eyes.',
    variables: [
      { name: 'shot', description: 'Tipo de plano', example: 'candid medium shot' },
      { name: 'subject', description: 'Sujeto', example: 'a barista in her 30s with freckles and a grey apron' },
      { name: 'action', description: 'Acción', example: 'laughing while wiping the counter' },
      { ...V.setting, example: 'a small neighborhood café at closing time' },
      { name: 'camera', description: 'Cámara/lente', example: 'a 35mm rangefinder, 40mm lens at f/2' },
      { name: 'film', description: 'Película/época', example: 'Kodak Portra 400, slight grain' },
      { name: 'lighting', description: 'Luz', example: 'Soft window light from the left, warm practical lamp behind' },
      { name: 'imperfection', description: 'Imperfección creíble', example: 'a little motion blur on her hand and uneven exposure near the window' },
    ],
    guidance: [
      'Evita listas tipo "8k, masterpiece, best quality, ultra-detailed": ninguna guía oficial las recomienda.',
      'Describe en positivo ("sharp focus throughout"), sobre todo en FLUX e Ideogram 4 que no usan negativos.',
      'Caras muy pequeñas salen mal: encuadra más cerca.',
    ],
    aspectRatios: ['4:5', '3:2', '9:16'],
    references: [hosted(FF(383), 'Candid nocturno estilo iPhone con motion blur (GPT Image 2)', 'freestylefly · awesome-gpt-image-2 (caso 383)', FF_PAGE, FF_LICENSE, '2026-05-04'), hosted('https://lh3.googleusercontent.com/AU8Urqk87CjEM7YnonKRVxCfmicoeYjPvxkjyXI4xoPKyOoqLF5Csh1D2VSqP5ghuNAf4NC44i0gWub3crswRbeLEkZPVgv9Oo-3v9pEXXQmVlbZ-Q=w1440-h810-n-nu', 'Retrato en escalera amarilla (Nano Banana 2)', 'Google DeepMind', DEEPMIND_PAGE, DEEPMIND_LICENSE, '2026-02')],
    sources: [S.bflPhoto, S.openai, S.googleCloud, S.ideogramFix, S.flux2],
  },
  {
    id: 'of:img-comic-panels',
    name: 'Cómic de dos viñetas con diálogo',
    kind: 'image',
    category: 'storyboard',
    description: 'Tira corta con el mismo personaje, una acción por viñeta y los diálogos entre comillas. Para piezas de redes con humor o explicar un beneficio en dos tiempos (antes / después).',
    tags: ['cómic', 'manga', 'viñetas', 'tira', 'diálogo', 'humor', 'redes', 'globo de texto'],
    models: ['nano-banana', 'gpt-image', 'seedream'],
    types: ['storyboard', 'typography', 'social', 'consistency'],
    template:
      'A two-panel vertical {{style}} comic starring {{character}}. Panel 1: {{panel1}}; speech bubble: "{{line1}}". ' +
      'Panel 2: {{panel2}}; speech bubble: "{{line2}}". Same character design, outfit and colors in both panels, clean lettering.',
    variables: [
      { ...V.style, example: 'warm Japanese manga' },
      V.character,
      { name: 'panel1', description: 'Viñeta 1', example: 'she stares sadly at a cold cup of instant coffee' },
      { name: 'line1', description: 'Diálogo 1 (corto)', example: 'Another sad Monday…' },
      { name: 'panel2', description: 'Viñeta 2', example: 'she sips from a Lumen cup, sparkles around her' },
      { name: 'line2', description: 'Diálogo 2', example: 'Okay, Monday, let\'s go!' },
    ],
    guidance: ['Escribe los diálogos en el idioma final y nómbralo si no es inglés ("Spanish text").'],
    aspectRatios: ['2:3', '9:16'],
    sources: [S.openai, S.google],
  },
  {
    id: 'of:img-midjourney-refs',
    name: 'Midjourney: consistencia con --oref y --sref',
    kind: 'image',
    category: 'style',
    description: 'Parámetros de Midjourney para fijar personaje u objeto (--oref, V7) y estilo (--sref, V7/V8). Útil si el equipo trabaja con Midjourney fuera de Openfield.',
    tags: ['midjourney', 'oref', 'sref', 'cref', 'consistencia', 'estilo', 'personaje', 'parámetros'],
    models: ['midjourney'],
    types: ['consistency', 'style-reference', 'character-sheet'],
    template:
      '{{scene}} --oref {{character_ref_url}} --ow {{omni_weight}} --sref {{style_ref}} --sw {{style_weight}} --ar {{aspect}} --v 7',
    variables: [
      { name: 'scene', description: 'Escena en prosa', example: 'the explorer crouching by a campfire in a snowy pine forest at dusk, cinematic' },
      { name: 'character_ref_url', description: 'URL de la hoja de personaje', example: 'https://…/sheet.png' },
      { name: 'omni_weight', description: '--ow 0–1000 (25 restilizar · 100 normal · ~400 máxima fidelidad)', example: '150' },
      { name: 'style_ref', description: 'URL o código de estilo', example: '2894718' },
      { name: 'style_weight', description: '--sw 0–1000', example: '200' },
      { name: 'aspect', description: 'Proporción', example: '16:9' },
    ],
    guidance: [
      '--oref es solo V7; V8 usa --edit con hasta 4 imágenes. --cref es V6/Niji 6.',
      'Referencias frontales, limpias y con luz pareja funcionan mejor; no pases de ~400 en --ow.',
    ],
    aspectRatios: ['16:9', '2:3', '1:1'],
    sources: [S.mjSref],
  },
]
