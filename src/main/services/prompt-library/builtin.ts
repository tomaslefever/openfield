/**
 * Openfield's built-in prompt library: curated, read-only templates that ship with the app.
 * Agents (MCP) search them as references and adapt them to the user's brief; the Prompt
 * Library app shows them under "Openfield" and can copy one into the user's own library.
 *
 * Templates are written in English (image/video models follow it best) with {{variable}}
 * placeholders; names, descriptions and guidance are in Spanish for the UI.
 */

import {
  type BuiltinPrompt,
  V,
  ALL_IMAGE_MODELS as IMG,
  ALL_VIDEO_MODELS as VID,
} from './types'
import { RESEARCH_PROMPTS } from './research'

export * from './types'

const TEXT_MODELS = ['nano-banana', 'gpt-image', 'seedream', 'ideogram', 'qwen-image']
const DIALOGUE_MODELS = ['veo', 'sora', 'kling', 'seedance']

const CORE_PROMPTS: BuiltinPrompt[] = [
  // ─── Publicidad ──────────────────────────────────────────────
  {
    id: 'of:ad-hero-product',
    name: 'Anuncio: key visual de producto (hero)',
    kind: 'image',
    category: 'advertising',
    description: 'Imagen principal de campaña: el producto como protagonista absoluto, con escenografía y luz de estudio publicitario. Punto de partida para casi cualquier "anuncio para mi marca".',
    tags: ['anuncio', 'ad', 'campaña', 'key visual', 'hero', 'producto', 'marca', 'publicidad', 'banner'],
    models: IMG,
    types: ['ads', 'product', 'photorealism'],
    template:
      'High-end advertising key visual for {{brand}}. {{product}} stands as the hero, centered and slightly low-angle so it feels iconic, on {{setting}}. ' +
      'Sculpted studio lighting: soft key light from the left, crisp rim light tracing the silhouette, gentle reflection on the surface below. ' +
      'Color palette of {{palette}}; mood {{mood}}. Shallow depth of field, clean negative space above the product for a headline. ' +
      'Shot on a medium-format camera, 100mm macro lens, ultra-sharp label and material detail, commercial retouching, no clutter.',
    variables: [V.brand, V.product, { ...V.setting, example: 'a polished travertine plinth with a soft gradient backdrop' }, V.palette, V.mood],
    guidance: [
      'Describe el producto real con materiales y colores concretos; si hay foto del producto, úsala como referencia y repite su descripción en el prompt.',
      'Deja espacio negativo si el anuncio llevará texto superpuesto; no pidas texto dentro de la imagen salvo que el modelo lo renderice bien.',
      'Para formatos verticales (9:16) sube el producto al tercio inferior y deja el espacio arriba.',
    ],
    references: [{ url: 'https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/data/images/case532.jpg', caption: 'Campaña de limonada ficticia en 6 piezas (GPT Image 2)', credit: 'freestylefly · awesome-gpt-image-2 (caso 532)', sourceUrl: 'https://github.com/freestylefly/awesome-gpt-image-2', license: 'Repo: MIT; imagen de la comunidad (crédito al autor en X)', date: '2026-08-22' }],
    aspectRatios: ['4:5', '1:1', '9:16', '16:9'],
  },
  {
    id: 'of:ad-lifestyle',
    name: 'Anuncio lifestyle con personas',
    kind: 'image',
    category: 'advertising',
    description: 'El producto en uso real dentro de la vida del público objetivo. Ideal para campañas de redes que buscan identificación más que vitrina.',
    tags: ['anuncio', 'lifestyle', 'personas', 'uso', 'campaña', 'redes', 'ad', 'aspiracional'],
    models: IMG,
    types: ['ads', 'photorealism'],
    template:
      'Lifestyle advertising photograph for {{brand}}. {{talent}} naturally uses {{product}} in {{setting}}, a candid in-between moment, not posed. ' +
      'The product is clearly visible and in focus, label facing camera. Natural window light with warm bounce, {{palette}} tones in wardrobe and props. ' +
      'Feels {{mood}}, made for {{audience}}. 35mm lens, f/2, editorial color grading, authentic skin texture, subtle film grain.',
    variables: [V.brand, V.talent, V.product, V.setting, V.palette, V.mood, V.audience],
    guidance: [
      'Elige una acción concreta (servir, abrir, aplicar) en vez de "sosteniendo el producto".',
      'Los colores de marca funcionan mejor en vestuario y utilería que en el fondo completo.',
      'Si la marca tiene un personaje recurrente, usa su Element/referencia para mantener el rostro.',
    ],
    aspectRatios: ['4:5', '9:16', '1:1'],
  },
  {
    id: 'of:ad-poster-headline',
    name: 'Póster publicitario con titular',
    kind: 'image',
    category: 'advertising',
    description: 'Pieza tipo afiche o banner con el titular escrito dentro de la imagen. Usar con modelos que renderizan texto bien (Nano Banana, Seedream, GPT Image, Ideogram).',
    tags: ['poster', 'afiche', 'banner', 'titular', 'texto', 'tipografía', 'anuncio', 'oferta', 'promo'],
    models: TEXT_MODELS,
    types: ['ads', 'typography'],
    template:
      'Bold advertising poster for {{brand}}. Large headline text reading exactly "{{headline}}" in a clean modern sans-serif, perfectly spelled, top third of the frame. ' +
      '{{product}} below the headline, dramatically lit, with {{setting}}. Background color blocks in {{palette}}. ' +
      'Small brand wordmark "{{brand}}" at the bottom. {{cta}} Graphic, high-contrast, {{mood}}, award-winning print ad layout with generous margins.',
    variables: [V.brand, V.headline, V.product, { ...V.setting, example: 'floating coffee beans and a soft steam swirl' }, V.palette, V.mood, { ...V.cta, description: 'Botón o texto de CTA; escribe la frase completa, p. ej. \'A pill-shaped button that reads "Shop now".\'', example: 'A pill-shaped button that reads "Shop now".' }],
    guidance: [
      'Escribe el texto exacto entre comillas y mantenlo corto (máx. ~6 palabras): los modelos fallan con frases largas.',
      'Revisa la ortografía del resultado; si falla, regenera con count: 4 y elige.',
      'Para ofertas, pon el precio o descuento como titular y el producto como apoyo.',
    ],
    references: [{ url: 'https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/data/images/case355.jpg', caption: 'Póster con lettering protagonista (GPT Image 2)', credit: 'freestylefly · awesome-gpt-image-2 (caso 355)', sourceUrl: 'https://github.com/freestylefly/awesome-gpt-image-2', license: 'Repo: MIT; imagen de la comunidad (crédito al autor en X)', date: '2026-04-27' }],
    aspectRatios: ['4:5', '9:16', '1:1', '16:9'],
  },
  {
    id: 'of:ad-luxury-dark',
    name: 'Anuncio premium / lujo en clave baja',
    kind: 'image',
    category: 'advertising',
    description: 'Estética de alta gama: fondo oscuro, luz dura y precisa, reflejos controlados. Perfumes, relojes, licores, joyería, tecnología premium.',
    tags: ['lujo', 'premium', 'luxury', 'oscuro', 'perfume', 'reloj', 'joyería', 'licor', 'anuncio', 'elegante'],
    models: IMG,
    types: ['ads', 'product'],
    template:
      'Luxury advertising photograph for {{brand}}: {{product}} on a dark reflective surface against a deep black-to-{{palette}} gradient. ' +
      'Low-key lighting with a single hard spotlight from above and a thin strip light carving the edges; precise specular highlights, controlled reflections, ' +
      'a few drifting particles of {{accent}} in the air. Minimal, {{mood}}, timeless. 90mm lens, f/8, razor-sharp, luxury magazine back-cover quality.',
    variables: [V.brand, V.product, { ...V.palette, example: 'deep emerald' }, { name: 'accent', description: 'Detalle atmosférico', example: 'gold dust' }, { ...V.mood, example: 'mysterious and seductive' }],
    guidance: [
      'Menos es más: un solo objeto, una sola fuente de luz dominante.',
      'Si el producto es transparente (vidrio, perfume), pide "backlit glass glowing" para que no se pierda en el negro.',
    ],
    aspectRatios: ['4:5', '1:1', '9:16'],
  },
  {
    id: 'of:ad-problem-solution',
    name: 'Anuncio problema → solución (split)',
    kind: 'image',
    category: 'advertising',
    description: 'Composición dividida que contrasta el antes (problema) y el después (con el producto). Útil para performance marketing y comparativas.',
    tags: ['antes y después', 'before after', 'comparación', 'problema', 'solución', 'split', 'performance', 'anuncio'],
    models: IMG,
    types: ['ads'],
    template:
      'Split-screen advertising image for {{brand}}, divided vertically down the middle. Left half: {{problem}}, desaturated cool tones, flat light. ' +
      'Right half: {{solution}} thanks to {{product}}, which is clearly visible, vibrant {{palette}} tones, warm bright light. ' +
      'Same framing and subject on both sides so the contrast reads instantly. Clean commercial photography, {{mood}}.',
    variables: [
      V.brand,
      { name: 'problem', description: 'La situación sin el producto', example: 'a tired person slumped over a laptop at 7am with a cold cup of instant coffee' },
      { name: 'solution', description: 'La misma situación resuelta', example: 'the same person energized and smiling, sipping a fresh pour-over' },
      V.product, V.palette, { ...V.mood, example: 'optimistic and energetic' },
    ],
    guidance: [
      'Mantén sujeto, encuadre y fondo iguales en ambos lados; solo cambia luz, color y actitud.',
      'Evita afirmaciones médicas o de resultados exagerados en anuncios de salud o belleza.',
    ],
    aspectRatios: ['1:1', '4:5', '16:9'],
  },

  // ─── Producto ────────────────────────────────────────────────
  {
    id: 'of:product-packshot',
    name: 'Packshot e-commerce fondo limpio',
    kind: 'image',
    category: 'product',
    description: 'Foto de catálogo / tienda online: producto aislado, fondo limpio, luz uniforme y fiel al color real.',
    tags: ['packshot', 'ecommerce', 'catálogo', 'fondo blanco', 'tienda', 'marketplace', 'producto', 'amazon', 'mercadolibre'],
    models: IMG,
    types: ['product', 'consistency'],
    template:
      'Professional e-commerce packshot of {{product}} by {{brand}}, centered, three-quarter view, on a seamless {{background}} background. ' +
      'Even softbox lighting from both sides, soft natural contact shadow beneath, true-to-life colors, every texture and label detail sharp. ' +
      'No props, no text, no reflections on the backdrop. 85mm lens, f/11, studio product photography.',
    variables: [V.product, V.brand, { name: 'background', description: 'Color de fondo', example: 'pure white' }],
    guidance: [
      'Con foto real del producto como referencia, el modelo conserva mejor etiqueta y forma; pide "keep the label identical to the reference".',
      'Para marketplaces suele exigirse fondo blanco puro y producto ocupando ~85% del cuadro.',
    ],
    aspectRatios: ['1:1', '4:5'],
  },
  {
    id: 'of:product-splash',
    name: 'Producto con splash dinámico',
    kind: 'image',
    category: 'product',
    description: 'Producto congelado en el tiempo con líquido, fruta o ingredientes salpicando alrededor. Bebidas, cosmética, snacks.',
    tags: ['splash', 'líquido', 'bebida', 'dinámico', 'ingredientes', 'fruta', 'freeze', 'producto', 'refresco', 'jugo'],
    models: IMG,
    types: ['product', 'ads'],
    template:
      'Dynamic high-speed product photograph: {{product}} by {{brand}} in mid-air, surrounded by a crown splash of {{liquid}} and flying {{ingredients}}, frozen at 1/10000s. ' +
      'Backlit droplets glowing, crisp edges, vivid {{palette}} background gradient. Energetic and fresh, {{mood}}. Studio strobe lighting, ultra-detailed, commercial beverage ad style.',
    variables: [
      V.product, V.brand,
      { name: 'liquid', description: 'El líquido que salpica', example: 'cold brew coffee' },
      { name: 'ingredients', description: 'Elementos que vuelan', example: 'roasted coffee beans and ice cubes' },
      { ...V.palette, example: 'copper to deep brown' }, { ...V.mood, example: 'bold and refreshing' },
    ],
    guidance: [
      'Los ingredientes deben ser los reales del producto (sabor, notas) para que el anuncio sea honesto.',
      'Funciona muy bien como imagen inicial para un video corto de 5 s con cámara lenta.',
    ],
    references: [{ url: 'https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/data/images/case358.jpg', caption: 'Splash de bebida energética ficticia (GPT Image 2)', credit: 'freestylefly · awesome-gpt-image-2 (caso 358)', sourceUrl: 'https://github.com/freestylefly/awesome-gpt-image-2', license: 'Repo: MIT; imagen de la comunidad (crédito al autor en X)', date: '2026-04-28' }],
    aspectRatios: ['4:5', '9:16', '1:1'],
  },
  {
    id: 'of:product-flatlay',
    name: 'Flat lay de producto con props',
    kind: 'image',
    category: 'product',
    description: 'Vista cenital ordenada con el producto y objetos que cuentan su historia. Instagram, newsletters, kits y packs.',
    tags: ['flat lay', 'cenital', 'top view', 'composición', 'props', 'instagram', 'kit', 'producto'],
    models: IMG,
    types: ['product', 'social'],
    template:
      'Overhead flat lay photograph of {{product}} by {{brand}}, arranged with {{props}} on {{surface}}. ' +
      'Balanced asymmetric composition with intentional negative space, items slightly overlapping, soft diffused daylight from one side with gentle shadows. ' +
      'Color story of {{palette}}, {{mood}}. Shot straight down, 50mm, editorial styling.',
    variables: [
      V.product, V.brand,
      { name: 'props', description: 'Objetos de acompañamiento', example: 'a ceramic cup, a pour-over kettle, scattered beans and a linen napkin' },
      { name: 'surface', description: 'Superficie', example: 'a warm oak table' },
      V.palette, V.mood,
    ],
    guidance: ['Elige 3–5 props con relación directa al uso del producto; más ensucia la composición.'],
    aspectRatios: ['1:1', '4:5'],
  },

  // ─── Gastronomía ─────────────────────────────────────────────
  {
    id: 'of:food-hero-dish',
    name: 'Plato hero para restaurante',
    kind: 'image',
    category: 'food',
    description: 'Foto apetitosa de un plato para carta digital, delivery o redes de un restaurante.',
    tags: ['comida', 'food', 'plato', 'restaurante', 'carta', 'menú', 'delivery', 'gastronomía', 'apetitoso'],
    models: IMG,
    types: ['food', 'product'],
    template:
      'Appetizing food photograph of {{dish}} served at {{restaurant}}, plated on {{plate}}, 45-degree angle, the hero bite closest to camera. ' +
      'Natural side light with soft shadows, glistening textures, visible steam, fresh garnish. Background: {{setting}}, softly blurred. ' +
      'Warm, {{mood}}, true-to-life colors, 100mm macro, f/2.8, professional restaurant menu photography.',
    variables: [
      { name: 'dish', description: 'El plato con sus ingredientes visibles', example: 'a grilled salmon fillet with charred lemon, crushed baby potatoes and dill butter' },
      { name: 'restaurant', description: 'Nombre o tipo de restaurante', example: 'a modern Peruvian bistro' },
      { name: 'plate', description: 'Vajilla', example: 'a handmade matte grey ceramic plate' },
      { ...V.setting, example: 'a dark walnut table with a glass of white wine' },
      { ...V.mood, example: 'cozy and generous' },
    ],
    guidance: [
      'Nombra ingredientes que se ven, no los que van dentro: el modelo dibuja lo que lees.',
      'Para cartas digitales usa el mismo ángulo, vajilla y fondo en todos los platos para que la carta se vea coherente.',
      'No muestres porciones o ingredientes que el plato real no tiene.',
    ],
    aspectRatios: ['4:5', '1:1', '4:3'],
  },

  // ─── Belleza / Moda ──────────────────────────────────────────
  {
    id: 'of:beauty-texture',
    name: 'Cosmética: producto + textura',
    kind: 'image',
    category: 'beauty',
    description: 'Producto de skincare o maquillaje junto a un swatch de su textura. Clásico de marcas de belleza.',
    tags: ['cosmética', 'skincare', 'belleza', 'beauty', 'textura', 'swatch', 'crema', 'serum', 'maquillaje'],
    models: IMG,
    types: ['ads', 'product'],
    template:
      'Beauty advertising image for {{brand}}: {{product}} beside an elegant swatch of its {{texture}} smeared across {{surface}}. ' +
      'Soft diffused top light, delicate highlights on the texture, {{palette}} pastel set with a few {{accents}}. Clean, fresh, {{mood}}. ' +
      'Macro 100mm, f/5.6, high-end skincare campaign aesthetic, flawless retouching.',
    variables: [
      V.brand,
      { ...V.product, example: 'a frosted glass dropper bottle of vitamin C serum' },
      { name: 'texture', description: 'Cómo es la textura', example: 'silky translucent orange gel' },
      { name: 'surface', description: 'Superficie', example: 'a smooth sand-colored stone' },
      { ...V.palette, example: 'peach and soft beige' },
      { name: 'accents', description: 'Elementos de apoyo', example: 'orange slices and water droplets' },
      { ...V.mood, example: 'radiant and clean' },
    ],
    guidance: ['El color de la textura debe coincidir con el producto real.'],
    aspectRatios: ['4:5', '1:1', '9:16'],
  },
  {
    id: 'of:fashion-editorial',
    name: 'Editorial de moda',
    kind: 'image',
    category: 'fashion',
    description: 'Imagen de campaña de moda con modelo, look completo y locación. Lookbooks, lanzamientos de colección.',
    tags: ['moda', 'fashion', 'editorial', 'lookbook', 'modelo', 'ropa', 'colección', 'campaña'],
    models: IMG,
    types: ['fashion', 'ads'],
    template:
      'Fashion campaign photograph for {{brand}}. {{talent}} wears {{outfit}}, striking a confident {{pose}} in {{setting}}. ' +
      'Full-body framing with the garment details readable: fabric texture, fit and drape. {{light}}. Color palette {{palette}}, {{mood}}. ' +
      'Shot on 35mm film look, 50mm lens, editorial magazine quality.',
    variables: [
      V.brand, V.talent,
      { name: 'outfit', description: 'Prendas exactas', example: 'an oversized camel wool coat over a cream turtleneck and wide black trousers' },
      { name: 'pose', description: 'Pose o acción', example: 'mid-stride walk' },
      { ...V.setting, example: 'a brutalist concrete staircase' },
      { name: 'light', description: 'Luz', example: 'Low golden-hour sun with long shadows' },
      V.palette, { ...V.mood, example: 'effortless and powerful' },
    ],
    guidance: ['Para varias imágenes de una misma colección fija talento, locación y luz y cambia solo el outfit.'],
    aspectRatios: ['4:5', '9:16', '2:3'],
  },

  // ─── Inmobiliaria ────────────────────────────────────────────
  {
    id: 'of:real-estate-interior',
    name: 'Interior inmobiliario',
    kind: 'image',
    category: 'real-estate',
    description: 'Ambiente interior luminoso y amplio para venta o arriendo de propiedades, proyectos o showrooms.',
    tags: ['inmobiliaria', 'real estate', 'interior', 'departamento', 'casa', 'arquitectura', 'propiedad', 'living'],
    models: IMG,
    types: ['real-estate', 'photorealism'],
    template:
      'Architectural interior photograph of {{space}} in {{property}}. Wide-angle 16mm, vertical lines perfectly straight, eye level at 1.2 m. ' +
      'Bright natural daylight from large windows balanced with warm interior lamps, {{style}} furniture, {{palette}} materials. ' +
      'Spacious, uncluttered, {{mood}}. HDR-balanced exposure, professional real estate listing photography.',
    variables: [
      { name: 'space', description: 'Ambiente', example: 'an open-plan living and dining room' },
      { name: 'property', description: 'Propiedad o proyecto', example: 'a 12th-floor apartment overlooking the city' },
      { name: 'style', description: 'Estilo de decoración', example: 'mid-century modern' },
      { ...V.palette, example: 'oak, white plaster and sage green' },
      { ...V.mood, example: 'airy and welcoming' },
    ],
    guidance: ['Si existe foto real del espacio, úsala como referencia y pide conservar la arquitectura; no inventes vistas o metros que la propiedad no tiene.'],
    aspectRatios: ['16:9', '4:3', '4:5'],
  },

  // ─── Video ───────────────────────────────────────────────────
  {
    id: 'of:video-product-reveal',
    name: 'Video comercial: reveal de producto',
    kind: 'video',
    category: 'advertising',
    description: 'Clip publicitario corto (5–10 s) donde el producto aparece con un movimiento de cámara cinematográfico. Funciona mejor partiendo del key visual como frame inicial.',
    tags: ['video', 'comercial', 'anuncio', 'reveal', 'producto', 'cinematográfico', 'tvc', 'spot', 'ad'],
    models: VID,
    types: ['ads', 'image-to-video', 'camera-motion'],
    template:
      'Cinematic product commercial for {{brand}}. The camera starts close on {{detail}} and slowly pulls back and orbits to reveal {{product}} standing on {{setting}}. ' +
      '{{motion}}. Lighting glides across the surface, catching highlights. {{palette}} tones, {{mood}}. ' +
      'Smooth gimbal movement, shallow depth of field, 24fps film look, premium TV commercial quality. No text on screen.',
    variables: [
      V.brand,
      { name: 'detail', description: 'Primer plano inicial', example: 'the embossed logo on the bag' },
      V.product,
      { ...V.setting, example: 'a travertine plinth' },
      { name: 'motion', description: 'Elemento en movimiento', example: 'Coffee beans tumble down in slow motion around it' },
      V.palette, V.mood,
    ],
    guidance: [
      'Genera primero la imagen con "Anuncio: key visual de producto" y úsala como start frame: el producto queda fiel.',
      'Un solo movimiento de cámara por clip; para un spot más largo encadena varios clips en el Timeline.',
      'Añade el texto/CTA después en el Timeline (captions) en vez de pedírselo al modelo de video.',
    ],
    aspectRatios: ['9:16', '16:9', '1:1'],
    references: [{ url: 'https://pbs.twimg.com/amplify_video_thumb/2106319331823165440/img/HRw0Mc4qjR1ZtqNR.jpg', caption: 'Spot de producto con diseño bloqueado por referencia', credit: 'Soulful Ai vía YouMind', sourceUrl: 'https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts', license: 'Repo: CC BY 4.0; recopilado de la comunidad', date: '2026-10-03' }],
    durationSeconds: 5,
  },
  {
    id: 'of:video-ugc-testimonial',
    name: 'UGC: testimonio selfie',
    kind: 'video',
    category: 'ugc',
    description: 'Video estilo creador de contenido grabado con el teléfono, hablando a cámara sobre el producto. El formato que más convierte en TikTok / Reels Ads.',
    tags: ['ugc', 'testimonio', 'selfie', 'creador', 'influencer', 'tiktok', 'reels', 'review', 'reseña', 'talking head'],
    models: DIALOGUE_MODELS,
    types: ['ugc', 'ads', 'dialogue'],
    template:
      'Authentic UGC-style vertical video filmed on a smartphone front camera. {{talent}} in {{setting}} holds {{product}} by {{brand}} up to the lens and talks excitedly to camera, ' +
      'saying: "{{line}}". Handheld micro-shake, natural window light, slightly imperfect framing, real skin texture, casual {{mood}} energy. ' +
      'Looks like an organic TikTok, not an ad.',
    variables: [
      { ...V.talent, example: 'a friendly woman in her mid-20s in an oversized hoodie' },
      { ...V.setting, example: 'her messy-but-cozy bedroom' },
      V.product, V.brand,
      { name: 'line', description: 'Frase hablada (corta, 1–2 oraciones)', example: 'Okay, this is the only coffee that actually gets me out of bed.' },
      { ...V.mood, example: 'genuine and upbeat' },
    ],
    guidance: [
      'El guion debe sonar hablado: frases cortas, primera persona, sin jerga de marketing.',
      'Para lip-sync real genera la voz primero (ElevenLabs) y úsala como referencia de audio en un modelo con soporte.',
      'Abre con un hook en los primeros 2 segundos (ver plantilla "Hook para reels").',
    ],
    aspectRatios: ['9:16'],
    durationSeconds: 8,
  },
  {
    id: 'of:video-unboxing',
    name: 'UGC: unboxing en primera persona',
    kind: 'video',
    category: 'ugc',
    description: 'Manos abriendo el empaque y descubriendo el producto en POV. Lanzamientos, e-commerce, packs y regalos.',
    tags: ['unboxing', 'ugc', 'pov', 'empaque', 'packaging', 'manos', 'lanzamiento', 'ecommerce'],
    models: VID,
    types: ['ugc', 'product'],
    template:
      'First-person POV unboxing video. Hands open {{packaging}} from {{brand}} on {{setting}}, peel back the tissue paper and lift out {{product}}, turning it slowly toward the camera. ' +
      'Close, intimate framing, soft natural light, satisfying tactile sounds implied by deliberate movements. {{mood}}. Vertical smartphone footage, UGC style.',
    variables: [
      { name: 'packaging', description: 'El empaque', example: 'a kraft box with a copper foil logo' },
      V.brand,
      { ...V.setting, example: 'a light wooden desk' },
      V.product,
      { ...V.mood, example: 'curious and delighted' },
    ],
    guidance: ['Usa como referencia fotos reales del empaque y del producto para que coincidan.'],
    aspectRatios: ['9:16'],
    durationSeconds: 8,
  },
  {
    id: 'of:video-social-hook',
    name: 'Hook para reels (primeros 3 s)',
    kind: 'video',
    category: 'social',
    description: 'Apertura visual que detiene el scroll: algo inesperado ocurre con el producto en el primer segundo. Se pone al inicio de un reel o anuncio.',
    tags: ['hook', 'reels', 'tiktok', 'shorts', 'scroll', 'viral', 'apertura', 'redes', 'social'],
    models: VID,
    types: ['social', 'ads'],
    template:
      'Scroll-stopping opening shot, vertical. {{hook_action}} with {{product}} by {{brand}}, happening in the very first second. ' +
      'Snappy camera movement ({{camera}}), bold {{palette}} colors, high contrast, punchy and {{mood}}. Fast-paced, social-first, no slow build-up.',
    variables: [
      { name: 'hook_action', description: 'Lo inesperado que pasa', example: 'A coffee bag drops from above and explodes into a cloud of beans that freeze mid-air' },
      V.product, V.brand,
      { name: 'camera', description: 'Movimiento de cámara', example: 'a quick crash zoom' },
      { ...V.palette, example: 'saturated orange and black' },
      { ...V.mood, example: 'surprising and playful' },
    ],
    guidance: [
      'El hook debe entenderse sin sonido y sin texto.',
      'Clips de 3–5 s; luego continúa con el cuerpo del anuncio en el Timeline.',
    ],
    aspectRatios: ['9:16'],
    durationSeconds: 5,
  },
  {
    id: 'of:video-food-cinematic',
    name: 'Video gastronómico cinematográfico',
    kind: 'video',
    category: 'food',
    description: 'Plano de comida en movimiento: vapor, salsa cayendo, queso estirándose. Para redes y pantallas de restaurantes.',
    tags: ['comida', 'food', 'video', 'restaurante', 'slow motion', 'cámara lenta', 'gastronomía', 'menú'],
    models: VID,
    types: ['food', 'image-to-video'],
    template:
      'Cinematic food video, slow motion. {{action}} on {{dish}}, the camera slowly pushes in at a 45-degree angle. ' +
      'Steam rising, glistening textures, warm side light, dark moody background of {{setting}}. Mouth-watering, {{mood}}. 120fps slow motion look, macro detail, food commercial quality.',
    variables: [
      { name: 'action', description: 'Lo que ocurre', example: 'Rich chocolate sauce is poured' },
      { name: 'dish', description: 'El plato', example: 'a warm molten lava cake with a scoop of vanilla ice cream' },
      { ...V.setting, example: 'a candlelit bistro table' },
      { ...V.mood, example: 'indulgent' },
    ],
    guidance: ['Parte de una foto real del plato como start frame para no inventar la presentación.'],
    aspectRatios: ['9:16', '1:1', '16:9'],
    durationSeconds: 5,
  },
  {
    id: 'of:video-logo-reveal',
    name: 'Cierre de marca / logo reveal',
    kind: 'video',
    category: 'brand',
    description: 'Plano final de un spot donde aparece el logo o el producto con la marca. Se usa como último clip de cualquier anuncio.',
    tags: ['logo', 'reveal', 'cierre', 'endcard', 'marca', 'branding', 'sting', 'outro', 'final'],
    models: VID,
    types: ['brand', 'ads'],
    template:
      'Elegant brand end card for {{brand}}. {{transition}} resolves into the {{brand}} logo centered on a clean {{palette}} background, with {{product}} settling into frame below it. ' +
      'Subtle light sweep across the logo, minimal and {{mood}}. Static locked-off camera at the end, leaving the final second still for the CTA.',
    variables: [
      V.brand,
      { name: 'transition', description: 'Cómo llega al logo', example: 'Swirling coffee steam' },
      V.palette, V.product, { ...V.mood, example: 'confident and warm' },
    ],
    guidance: [
      'Los modelos de video deforman logos: usa la imagen del logo como start/end frame o superpón el logo real en el Timeline.',
    ],
    aspectRatios: ['9:16', '16:9', '1:1'],
    durationSeconds: 5,
  },
]

/**
 * Every template ships with a reference Openfield generated from it (Nano Banana 2.1, 1K) in
 * resources/prompt-library/gen-<id>.jpg, so the library is complete offline and in every release.
 */
function withGeneratedReference(p: BuiltinPrompt): BuiltinPrompt {
  return {
    ...p,
    references: [
      {
        file: `gen-${p.id.replace(/^of:/, '')}.jpg`,
        caption: 'Referencia generada por Openfield a partir de esta plantilla (Nano Banana 2.1, 1K)',
        credit: 'Openfield',
        license: 'Openfield',
        date: '2026-10-19',
      },
      ...(p.references || []),
    ],
  }
}

export const BUILTIN_PROMPTS: BuiltinPrompt[] = [...RESEARCH_PROMPTS, ...CORE_PROMPTS].map(withGeneratedReference)

const BY_ID = new Map(BUILTIN_PROMPTS.map((p) => [p.id, p]))

export function getBuiltinPrompt(id: string): BuiltinPrompt | undefined {
  return BY_ID.get(id)
}
