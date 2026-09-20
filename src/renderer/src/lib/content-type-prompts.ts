export type DramaContentType =
  | 'microdrama'
  | 'ugc'
  | 'tvc'
  | 'ads'
  | 'reels'
  | 'try_on'
  | 'unboxing'
  | 'libre'
  | 'faceless'

export interface ContentTypeInfo {
  id: DramaContentType
  label: string
  shortLabel: string
  tagline: string
  description: string
  defaultAspectRatio: string
  defaultShotsCount: number
  badgeColor: string
  badgeBg: string
  badgeBorder: string
  genres: string[]
  tones: string[]
  defaultVisualStyle: string
  examplePremises: string[]
  inputPlaceholder: string
}

export const CONTENT_TYPES_CONFIG: Record<DramaContentType, ContentTypeInfo> = {
  microdrama: {
    id: 'microdrama',
    label: 'Microdrama',
    shortLabel: 'Microdrama',
    tagline: 'Ficción serializada con alta tensión y cliffhangers',
    description: 'Microserie vertical cinematográfica estructurada en arcos dramáticos con revelaciones y cliffhangers en cada episodio.',
    defaultAspectRatio: '9:16',
    defaultShotsCount: 4,
    badgeColor: 'text-amber-400',
    badgeBg: 'bg-amber-500/10',
    badgeBorder: 'border-amber-500/30',
    genres: [
      'Drama de Suspenso',
      'Romance & Tensión',
      'Ciencia Ficción Cyberpunk',
      'Misterio & Crimen',
      'Acción & Venganza',
      'Terror Psicológico',
      'Fantasía Oscura',
    ],
    tones: [
      'Cinematográfico y Misterioso',
      'Tenso y Emocional',
      'Oscuro y Agobiante',
      'Épico y Grandioso',
      'Rápido y Dinámico',
    ],
    defaultVisualStyle: 'Fotorealismo cinematográfico, iluminación dramática de claroscuro, 8k, lente anamórfico',
    examplePremises: [
      'Un detective privado descubre que el sospechoso de un crimen es en realidad un viajero del tiempo que intenta evitar una catástrofe.',
      'Una heredera millonaria finge su propia desaparición para desenmascarar a los traidores dentro de su propia familia.',
      'Dos científicos en una estación submarina escuchan una señal inteligente proveniente de la fosa más profunda del océano.',
      'Un espía retirado recibe una llamada con una clave que solo su difunta esposa conocía.',
    ],
    inputPlaceholder: 'Escribe la premisa dramática de tu microserie... (ej: Una mujer descubre que su prometido es en realidad el agente encubierto que arrestó a su hermano...)',
  },

  ugc: {
    id: 'ugc',
    label: 'UGC (User Generated Content)',
    shortLabel: 'UGC',
    tagline: 'Video selfie orgánico, testimonio y recomendación auténtica',
    description: 'Contenido estilo creador en primera persona con tono espontáneo, reacciones genuinas, demostración cercana y recomendación creíble.',
    defaultAspectRatio: '9:16',
    defaultShotsCount: 4,
    badgeColor: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/10',
    badgeBorder: 'border-emerald-500/30',
    genres: [
      'Testimonio Real / Storytime',
      'Problema & Solución Cotidiana',
      'Hack / Tip Recomendado',
      'Rutina Diaria (GRWM / Daily Vlog)',
      'Comparativa Honesta de Producto',
    ],
    tones: [
      'Espontáneo y Cercano',
      'Entusiasta y Convincente',
      'Conversacional y Casual',
      'Sorprendido y Revelador',
      'Directo y Sin Filtros',
    ],
    defaultVisualStyle: 'Grabado con smartphone en mano, iluminación natural de ventana, estética UGC limpia y realista, plano frontal selfie',
    examplePremises: [
      'Creadora cuenta cómo logró solucionar sus noches de insomnio con un difusor de aromaterapia inteligente mientras muestra su rutina.',
      'Joven profesional muestra su transformación de espacio de trabajo usando un organizador magnético ergonómico.',
      'Un aficionado al café comparte el truco definitivo para hacer espresso cremoso en casa con una cafetera portátil.',
      'Storytime sobre cómo una app de finanzas personales le ayudó a ahorrar para su primer viaje a Japón.',
    ],
    inputPlaceholder: 'Escribe la idea o testimonio UGC... (ej: Creador muestra cómo una crema facial natural eliminó el brillo de su piel en 3 días...)',
  },

  tvc: {
    id: 'tvc',
    label: 'TVC (Commercial)',
    shortLabel: 'TVC',
    tagline: 'Spot publicitario cinematográfico de alta gama para marcas',
    description: 'Comercial con fotografía y dirección de arte premium, narrativa emocional de marca, iluminación de estudio y locución en off memorable.',
    defaultAspectRatio: '16:9',
    defaultShotsCount: 4,
    badgeColor: 'text-sky-400',
    badgeBg: 'bg-sky-500/10',
    badgeBorder: 'border-sky-500/30',
    genres: [
      'Lujo & Sofisticación',
      'Automotriz & Potencia',
      'Aspiracional & Lifestyle',
      'Tecnología e Innovación',
      'Bebidas & Gastronomía Gourmet',
      'Moda & Alta Costura',
    ],
    tones: [
      'Elegante y Aspiracional',
      'Épico e Inspirador',
      'Poético y Cinematográfico',
      'Vanguardista y Tecnológico',
      'Cálido y Humano',
    ],
    defaultVisualStyle: 'Cinematografía de cine comercial de 35mm, iluminación publicitaria de estudio de tres puntos, gradación de color ARRI Alexa, 8k',
    examplePremises: [
      'Un reloj de lujo diseñado para exploradores resiste las condiciones extremas de un ascenso nocturno en los Alpes suizos.',
      'Un nuevo vehículo eléctrico deportivo atraviesa paisajes costeros al atardecer mientras la narración reflexiona sobre el futuro del movimiento.',
      'Una fragancia artesanal evoca recuerdos de lluvia en las calles de París con destellos dorados y cámara lenta elegante.',
      'Una marca de audio premium muestra a una chelista tocando en una azotea solitaria rodeada de la vibración de la ciudad.',
    ],
    inputPlaceholder: 'Escribe el concepto del spot comercial... (ej: Campaña para una marca de café de especialidad que celebra los pequeños rituales matutinos...)',
  },

  ads: {
    id: 'ads',
    label: 'ADS (Performance Ads)',
    shortLabel: 'ADS',
    tagline: 'Anuncio de alta conversión: Hook -> Problema -> Solución -> CTA',
    description: 'Video publicitario digital optimizado para performance: detiene el scroll en 2 segundos, agita el problema, demuestra la solución y remata con un CTA contundente.',
    defaultAspectRatio: '9:16',
    defaultShotsCount: 4,
    badgeColor: 'text-rose-400',
    badgeBg: 'bg-rose-500/10',
    badgeBorder: 'border-rose-500/30',
    genres: [
      'Direct-to-Consumer (E-commerce)',
      'SaaS & Apps Digitales',
      'Salud & Bienestar',
      'Cursos & Educación Online',
      'Servicios Locales & Profesionales',
    ],
    tones: [
      'Enérgico y de Alta Conversión',
      'Urgente y Persuasivo',
      'Directo al Beneficio',
      'Disruptivo e Impactante',
    ],
    defaultVisualStyle: 'Iluminación publicitaria digital brillante, cortes limpios de alto impacto, colores saturados y planos enfocados en el producto',
    examplePremises: [
      'Anuncio para auriculares con cancelación de ruido activa: muestra el caos ruidoso de una oficina que se silencia al instante al colocárselos.',
      'Ad de software de gestión: emprendedor estresado con montañas de papeles encuentra la solución en un clic en su tablet.',
      'Campaña para zapatillas ergonómicas: visualiza el impacto articular al correr y el alivio inmediato de la amortiguación de nube.',
      'Promoción de suscripción de comida saludable: compara el tiempo perdido cocinando vs platos gourmet listos en 5 minutos.',
    ],
    inputPlaceholder: 'Escribe el objetivo y propuesta de valor de tu anuncio... (ej: Anuncio para una app de meditación que combate el estrés laboral en 3 minutos...)',
  },

  reels: {
    id: 'reels',
    label: 'Reels (Hooks styles)',
    shortLabel: 'Reels Hooks',
    tagline: 'Video viral de alta retención con gancho magnético en los primeros 3s',
    description: 'Contenido dinámico para TikTok, Instagram Reels y YouTube Shorts diseñado con ganchos de interrupción de patrón y ritmo acelerado.',
    defaultAspectRatio: '9:16',
    defaultShotsCount: 4,
    badgeColor: 'text-purple-400',
    badgeBg: 'bg-purple-500/10',
    badgeBorder: 'border-purple-500/30',
    genres: [
      'Dato Curioso / Revelación ("Nadie te dice esto")',
      'Mito vs Realidad',
      'Comparativa de Shock',
      'Hack Secreto / Truco Rápido',
      'Reto Viral / Experimento',
    ],
    tones: [
      'Hipnótico y Rápido',
      'Intrigante y Sorprendente',
      'Vibrante y Dinámico',
      'Provocador y Cautivador',
    ],
    defaultVisualStyle: 'Estética viral moderna, colores de alto contraste, movimientos de cámara envolventes (push-in, whip pan), iluminación nítida de estudio vertical',
    examplePremises: [
      'El misterio detrás de por qué los aviones nunca vuelan en línea recta sobre el océano Pacífico explicado visualmente.',
      'Tres cosas comunes en tu cocina que están arruinando el filo de tus cuchillos sin que te des cuenta.',
      'El experimento psicológico de los 3 segundos que demuestra cómo capturar la atención de cualquier persona.',
      'Por qué las grandes cadenas de comida usan el color rojo en sus logos explicado en 15 segundos.',
    ],
    inputPlaceholder: 'Escribe la idea viral o gancho de tu Reel... (ej: El error que comete el 90% de las personas al cargar su teléfono y cómo evitarlo...)',
  },

  try_on: {
    id: 'try_on',
    label: 'Try On',
    shortLabel: 'Try On',
    tagline: 'Modelado de moda, catálogo textil, pasarela y giros 360°',
    description: 'Showcase editorial de moda y calzado enfocado en el calce de prendas, movimiento de telas, siluetas, textura textil y estilismo de catálogo.',
    defaultAspectRatio: '9:16',
    defaultShotsCount: 4,
    badgeColor: 'text-pink-400',
    badgeBg: 'bg-pink-500/10',
    badgeBorder: 'border-pink-500/30',
    genres: [
      'Streetwear Urbano',
      'Alta Costura / Gala',
      'Ropa Deportiva & Athleisure',
      'Minimalismo & Casual Chic',
      'Abrigos & Temporada Invierno',
      'Accesorios & Joyería',
    ],
    tones: [
      'Editorial y Sofisticado',
      'Trendy y Fresco',
      'Minimalista y Elegante',
      'Audaz y Vanguardista',
    ],
    defaultVisualStyle: 'Fotografía editorial de pasarela y lookbook, iluminación ciclorama suave de estudio, colores de tela precisos, 8k',
    examplePremises: [
      'Modelo luciendo un abrigo oversize de lana beige en un entorno urbano minimalista con giros que muestran la caída y el forro interior.',
      'Colección deportiva de compresión negra: modelo realizando movimientos dinámicos para resaltar la flexibilidad y transpirabilidad del tejido.',
      'Vestido de noche de seda esmeralda: modelado elegante en salón clásico con primer plano macro de las costuras y drapeado.',
      'Conjunto streetwear unisex con chaqueta técnica impermeable y pantalones cargo en estudio con iluminación neón sutil.',
    ],
    inputPlaceholder: 'Escribe la prenda o colección de moda a modelar... (ej: Vestido de lino veraniego color terracota con escote en espalda y caída fluida...)',
  },

  unboxing: {
    id: 'unboxing',
    label: 'Unboxing',
    shortLabel: 'Unboxing',
    tagline: 'Apertura de empaque, planos macro táctiles y review de producto',
    description: 'Experiencia visual y táctil de desempaquetado: apertura de sellos, revelación del producto, planos macro de texturas y primeras impresiones.',
    defaultAspectRatio: '9:16',
    defaultShotsCount: 4,
    badgeColor: 'text-teal-400',
    badgeBg: 'bg-teal-500/10',
    badgeBorder: 'border-teal-500/30',
    genres: [
      'Tecnología & Gadgets',
      'Cosmética & Skincare',
      'Sneakers & Calzado Coleccionable',
      'Joyería & Relojería',
      'Gaming & Periféricos',
      'Alimentos Gourmet & Packaging Artesanal',
    ],
    tones: [
      'Satisfactorio y Táctil (ASMR Visual)',
      'Curioso y Revelador',
      'Elegante y Meticuloso',
      'Entusiasta y Detallado',
    ],
    defaultVisualStyle: 'Plano cenital y ángulo 45°, mesa de roble o mármol limpia, iluminación suave de escritorio con profundidad de campo baja (bokeh), macro 8k',
    examplePremises: [
      'Apertura de una caja negra mate con sellos holográficos que revela una cámara mirrorless vintage con cuerpo de magnesio.',
      'Desempaquetado de una edición limitada de zapatillas deportivas con papel de seda protector y detalles bordados en primer plano.',
      'Unboxing de un set de cuidado facial de lujo con frascos de cristal esmerilado y dosificador dorado.',
      'Apertura de un teclado mecánico custom con switches lubricados y keycaps artesanales sobre un escritorio minimalista.',
    ],
    inputPlaceholder: 'Escribe el producto o paquete a desempaquetar... (ej: Unboxing de unos auriculares inalámbricos de aluminio pulido en caja ecológica...)',
  },

  libre: {
    id: 'libre',
    label: 'Libre / Personalizado',
    shortLabel: 'Libre',
    tagline: 'Estructura libre guiada por tus propias directivas',
    description: 'Define tus propias instrucciones para estructurar la extracción del contenido, personajes, escenas y la redacción de los prompts.',
    defaultAspectRatio: '16:9',
    defaultShotsCount: 4,
    badgeColor: 'text-cyan-400',
    badgeBg: 'bg-cyan-500/10',
    badgeBorder: 'border-cyan-500/30',
    genres: [
      'Libre / Personalizado',
      'Documental & Ensayo',
      'Ficción & Cine',
      'Educativo / Tutorial',
      'Musical / Videoclip',
      'Animación & Estilizado',
      'Experimental',
    ],
    tones: [
      'Personalizado (Según Guía)',
      'Cinematográfico y Reflexivo',
      'Dinámico e Informativo',
      'Poético y Emocional',
      'Técnico y Preciso',
    ],
    defaultVisualStyle: 'Estilo cinematográfico personalizado según las directivas del usuario, alta definición 8k',
    examplePremises: [
      'Video documental sobre la exploración de las profundidades marinas con estilo visual de National Geographic.',
      'Video ensayo reflexivo sobre la relación entre inteligencia artificial y creatividad humana.',
      'Cápsula explicativa sobre computación cuántica con animaciones abstractas 3D y planos futuristas.',
      'Cortometraje narrativo experimental sobre un astronauta que recuerda su infancia en la Tierra.',
    ],
    inputPlaceholder: 'Escribe la idea, premisa, guión o texto base para tu contenido libre... (ej: Documental sobre la arquitectura subterránea de civilizaciones antiguas...)',
  },

  faceless: {
    id: 'faceless',
    label: 'Faceless / Canal Automatizado',
    shortLabel: 'Faceless',
    tagline: 'Videos narrados sin rostros para YouTube, TikTok y Reels',
    description: 'Contenido dinámico basado en b-roll cinematográfico, gráficos, planos macro de objetos, entornos atmosféricos y narración en off (V.O.), sin mostrar caras de personas.',
    defaultAspectRatio: '9:16',
    defaultShotsCount: 4,
    badgeColor: 'text-violet-400',
    badgeBg: 'bg-violet-500/10',
    badgeBorder: 'border-violet-500/30',
    genres: [
      'Misterios & Curiosidades',
      'Finanzas & Negocios',
      'Ciencia & Espacio',
      'Desarrollo Personal / Estoicismo',
      'Historia & Geopolítica',
      'Terror & Creepypasta',
      'Tecnología & IA',
    ],
    tones: [
      'Intrigante y Envolvente',
      'Épico y Cinematográfico',
      'Didáctico y Dinámico',
      'Oscuro y Misterioso',
      'Inspirador y Firme',
    ],
    defaultVisualStyle: 'Metraje cinematográfico b-roll, 8k, iluminación dramática de claroscuro, planos macro detallados, tomas aéreas y texturas atmosféricas, sin rostros',
    examplePremises: [
      'Las 3 paradojas temporales más aterradoras de la física cuántica explicadas con metáforas visuales y planos macro.',
      'Cómo un error tipográfico en 1631 provocó la bancarrota de una de las familias más poderosas de Europa.',
      'El experimento psicológico prohibido de los años 70 que reveló la verdadera naturaleza de la conformidad humana.',
      'Las 4 leyes del dinero que la clase alta enseña a sus hijos y que nunca se explican en las escuelas.',
    ],
    inputPlaceholder: 'Escribe la premisa o guion de tu video faceless... (ej: El misterio de la señal WOW y por qué los radiotelescopios no han vuelto a escuchar nada igual...)',
  },
}

/**
 * Generates an expert tailored System Prompt for the LLM breakdown based on Content Type
 */
export function getMasterSystemPrompt(
  contentType: DramaContentType,
  options: {
    shotsCount: number
    genre?: string
    tone?: string
    visualStyle?: string
    customPromptGuide?: string
  }
): string {
  const { shotsCount, genre = '', tone = '', visualStyle = '', customPromptGuide = '' } = options

  const customGuideDirective = customPromptGuide && customPromptGuide.trim()
    ? `\n- DIRECTIVAS ESPECÍFICAS DE LA GUÍA DEL USUARIO (MÁXIMA PRIORIDAD):\n"""\n${customPromptGuide.trim()}\n"""\n  * Cumple rigurosamente con todas las pautas de esta guía para estructurar la extracción del contenido, los personajes, las escenas y la redacción de cada prompt.\n`
    : ''

  const styleDirective = visualStyle && visualStyle.trim()
    ? `- ESTILO VISUAL COHERENTE OBLIGATORIO: "${visualStyle.trim()}"\n  * Aplica rigurosamente este estilo visual a TODOS los visualPrompts de personajes, locaciones, props y keyframePrompts de las tomas para garantizar una coherencia estética absoluta en toda la producción.`
    : `- ESTILO VISUAL COHERENTE OBLIGATORIO: "Fotorealismo cinematográfico, iluminación dramática de claroscuro, 8k"\n  * Aplica este estilo visual a todos los visualPrompts y keyframePrompts para mantener coherencia.`

  const isAutoShots = !shotsCount || shotsCount <= 0
  const shotsCountDirective = isAutoShots
    ? `- CANTIDAD DE ESCENAS / TOMAS AUTOMÁTICA: Analiza la premisa, guión o idea y define libremente la cantidad óptima de escenas y tomas que mejor desarrollen la narrativa (sin límite prefijado, el modelo decide la cantidad adecuada según la historia).`
    : `- Genera exactamente ${shotsCount} tomas.`

  const assetsDirectives = `
REGLAS OBLIGATORIAS PARA PERSONAJES, LOCACIONES Y PROPS:
- PERSONAJES (CASTING):
  * El visualPrompt de cada personaje humano DEBE comenzar obligatoriamente con: "professional reference pose sheet 3 views + 1", seguido del turnaround detallado con vistas frontal, lateral, trasera y 3/4 para garantizar consistencia visual y anatómica.
- LOCACIONES / ESCENARIOS (ESTRICTAMENTE SIN PERSONAS):
  * NUNCA incluyas personas, humanos, transeúntes, siluetas humanas ni multitudes en las locaciones. Los visualPrompts de escenarios deben describir única y exclusivamente arquitectura, naturaleza, espacio, iluminación y atmósfera. Añade siempre al final: "empty environment, completely unpopulated, no people, no humans".
- PROPS / OBJETOS CLAVE (FONDO AISLADO BLANCO O GRIS):
  * Los visualPrompts de props deben describir el objeto aislado en estudio sobre fondo blanco o gris neutro para evitar inferencias indeseadas del modelo generativo. NUNCA incluyas personas ni manos sosteniéndolo. Añade siempre al final: "isolated product shot on clean plain neutral grey studio background, studio lighting, centered, no humans, no hands, no people".
`

  const baseJsonSchema = `{
  "title": "Título llamativo e impactante en español",
  "logline": "Logline en español que resume el núcleo de la pieza",
  "characters": [
    {
      "name": "Nombre o rol del personaje/modelo/presentador (o Narrador / V.O. si es faceless)",
      "role": "Rol en la pieza (ej. Narrador V.O., Creador UGC, Protagonista, Modelo, Manos)",
      "visualPrompt": "professional reference pose sheet 3 views + 1, detailed photographic character turnaround description in English with front view, side view, back view and 3/4 view, distinctive facial features, hairstyle, clothing, age, lighting, cinematic style"
    }
  ],
  "scenarios": [
    {
      "name": "Nombre de la locación",
      "visualPrompt": "Detailed cinematic environment description in English with architectural style, lighting, mood, color palette, empty environment, completely unpopulated, no people, no humans"
    }
  ],
  "props": [
    {
      "name": "Nombre del producto u objeto clave",
      "description": "Propósito e importancia dentro de la pieza",
      "visualPrompt": "Detailed photographic item description in English, isolated on a clean plain neutral grey or white studio background, centered, studio lighting, high resolution macro texture, 8k, no humans, no hands, no people"
    }
  ],
  "shots": [
    {
      "order": 1,
      "sceneNumber": 1,
      "shotNumber": 1,
      "cameraMovement": "Tipo de plano (ej. Primer Plano Frontal Selfie, Plano Detalle Macro, Travelling Suave)",
      "characterNames": ["Nombre del personaje/modelo presente"],
      "scenarioName": "Nombre de la locación",
      "propNames": ["Nombre del producto/objeto presente"],
      "actionPrompt": "Desarrollo temporal y acción de la escena en español.",
      "dialogueText": "Línea de diálogo, locución o narración en español (vacío si no hay voz en esta toma)",
      "dialogueSpeaker": "Nombre del hablante (ej. Creador UGC, Carlos, Narrador V.O.)",
      "estimatedDuration": 5,
      "keyframePrompt": "Detailed photographic/cinematic description in English of the EXACT FIRST FRAME (Frame 0). Describe ONLY what is visible at the very opening second of the shot."
    }
  ]
}`

  const durationDirective = `- DURACIÓN DE LAS ESCENAS/TOMAS OBLIGATORIA: Si en el guión, premisa o texto del usuario se especifica la duración de cada escena o toma (por ejemplo: '5s', '8 seg', '10 segundos', '00:05', 'Duración: 6s', '6"'), DEBES extraer y fijar con exactitud esa duración en segundos (número entero) en el campo "estimatedDuration" de cada toma. Si no viene indicada en el guión, estima una duración adecuada en segundos (número entero, típicamente entre 4 y 10) basada en la acción visual y la longitud del diálogo.`

  switch (contentType) {
    case 'ugc':
      return `Eres un DIRECTOR CREATIVO DE UGC (User Generated Content) y Creador Top Viral de TikTok e Instagram Reels.
A partir de la idea del usuario, genera un desglose de video UGC auténtico, orgánico y de alta conversión en formato JSON estricto.

DIRECTIVAS ESPECÍFICAS DE UGC:
${styleDirective}
${durationDirective}
- Estructura recomendada:
  * Toma 1 (The Hook): Primer plano frontal selfie del creador hablando con energía a cámara en un entorno cotidiano (habitación, cocina, calle), expresando una duda o problema real.
  * Toma 2 (The Real Demo / Reaction): Demostración en primera persona (POV) o sosteniendo el producto frente a cámara, mostrando el uso real y una reacción facial espontánea de sorpresa o satisfacción.
  * Toma 3 (The Verdict & CTA): Creador recomendando con entusiasmo genuino el tip/producto y compartiendo la llamada a probarlo.
- Cámara: Smartphone en mano (handheld selfie), ligero movimiento natural, luz de ventana o aro de luz suave.
- Diálogo: Lenguaje coloquial, natural, enérgico ("No van a creer esto...", "Miren lo que encontré...").
${shotsCountDirective}
- keyframePrompt debe ser el FOTOGRAMA INICIAL (Frame 0) en inglés.
- actionPrompt debe describir el desarrollo de la toma en español.
- En los prompts incluye sonido ambiental (SFX) pero NUNCA música de fondo.

Esquema JSON estricto:
${baseJsonSchema}
Responde ÚNICAMENTE el bloque JSON.`

    case 'tvc':
      return `Eres un DIRECTOR DE CINE COMERCIAL y Publicidad de Lujo galardonado para marcas globales (Apple, Nike, Dior, Porsche).
A partir de la idea del usuario, genera un desglose de spot publicitario de televisión (TVC) de alta gama en formato JSON estricto.

DIRECTIVAS ESPECÍFICAS DE TVC:
${styleDirective}
${durationDirective}
- Estructura cinematográfica de marca:
  * Toma 1 (Worldbuilding & Atmosphere): Gran plano cinematográfico que establece una atmósfera visual deslumbrante y una emoción aspiracional.
  * Toma 2 (Human Connection): El protagonista en un momento cumbre de su vida o desafío personal.
  * Toma 3 (Hero Product / Climax): Plano majestuoso del producto con iluminación de estudio de 3 puntos, reflejos pulidos y cámara lenta elegante.
  * Toma 4 (Brand Tagline & Closing): Cierre aspiracional con locución en off (V.O.) memorable y profunda.
- Cámara: Movimientos suaves de grúa, dolly o gimbal, lentes anamórficos (16:9), paleta de color cinematográfica.
- Diálogo: Locución en off reflexiva, poética y memorable (Narrador V.O.).
${shotsCountDirective}
- keyframePrompt describe únicamente el Frame 0 en inglés.
- actionPrompt describe la acción en español.
- SFX diegéticos de alta fidelidad, estrictamente sin música de fondo.

Esquema JSON estricto:
${baseJsonSchema}
Responde ÚNICAMENTE el bloque JSON.`

    case 'ads':
      return `Eres un ESTRATEGA DE PERFORMANCE MARKETING y Director de Video Ads de Alta Conversión (Meta Ads, TikTok Ads, YouTube Shorts).
A partir de la idea del usuario, genera un desglose de anuncio publicitario de conversión directa en formato JSON estricto.

DIRECTIVAS ESPECÍFICAS DE PERFORMANCE ADS:
${styleDirective}
${durationDirective}
- Estructura Hook -> Pain -> Solution -> CTA:
  * Toma 1 (Pattern Interrupt Hook): Frena el scroll en los primeros 2 segundos con una pregunta visual provocadora o acción inesperada ("¿Sigues cometiendo este error?").
  * Toma 2 (Agitate the Pain Point): Visualización clara del problema o frustración del cliente.
  * Toma 3 (Product as Ultimate Solution): Demostración inmediata del producto resolviendo el problema con facilidad, resaltando beneficios tangibles.
  * Toma 4 (Direct CTA & Urgency): Llamado a la acción enérgico para comprar, descargar o probar ahora mismo.
- Cámara: Cortes dinámicos, planos medios y primeros planos de impacto, iluminación vibrante.
- Diálogo: Claro, persuasivo, directo al beneficio y llamado a la acción.
${shotsCountDirective}
- keyframePrompt (Frame 0 en inglés) y actionPrompt (español).
- Sin música de fondo (se añade en ensamble).

Esquema JSON estricto:
${baseJsonSchema}
Responde ÚNICAMENTE el bloque JSON.`

    case 'reels':
      return `Eres un ESTRATEGA DE RETENCIÓN y Creador Top Viral de Reels, TikToks y YouTube Shorts.
A partir de la idea del usuario, genera un desglose de video corto viral optimizado para máxima retención en formato JSON estricto.

DIRECTIVAS ESPECÍFICAS DE REELS (HOOKS STYLES):
${styleDirective}
${durationDirective}
- Estructura de Retención Viral:
  * Toma 1 (Magnetic Hook): Gancho visual o auditivo de shock o curiosidad irresistible en los primeros 3 segundos ("El secreto que nadie te cuenta sobre...").
  * Toma 2 (Rapid Story / Pattern Interrupt): Revelación rápida de información con cambio de ángulo dinámico para sostener la curva de retención al 100%.
  * Toma 3 (Punchline & Loopable Finish): Cierre con remate sorprendente o final diseñado para loopear fluidamente hacia el inicio.
- Cámara: Push-in veloz, whip pan, planos dinámicos, expresiones faciales vivas y expresivas.
${shotsCountDirective}
- keyframePrompt (Frame 0 en inglés) y actionPrompt (español).
- Sin música de fondo.

Esquema JSON estricto:
${baseJsonSchema}
Responde ÚNICAMENTE el bloque JSON.`

    case 'try_on':
      return `Eres un DIRECTOR DE FOTOGRAFÍA DE MODA, Pasarela y Campañas Editoriales de Alta Costura (Vogue, Zara, Balenciaga).
A partir de la idea del usuario, genera un desglose de showcase de moda / Try On en formato JSON estricto.

DIRECTIVAS ESPECÍFICAS DE TRY ON / FASHION:
${styleDirective}
${durationDirective}
- Estructura Fashion:
  * Toma 1 (Full Body Outfit Reveal): Plano de cuerpo entero del modelo luciendo la prenda completa caminando hacia la cámara en pasarela o estudio minimalista.
  * Toma 2 (Turnaround & Motion): Giro elegante de 180° o 360° mostrando la caída de la tela, silueta y calce posterior en movimiento.
  * Toma 3 (Macro Texture & Fabric Details): Primer plano macro de las costuras, textura del tejido, botones o detalles de confección de alta calidad.
  * Toma 4 (Styling & Pose Finale): Pose editorial final destacando el conjunto y accesorios.
- Cámara: Lentes de retrato 85mm, iluminación ciclorama softbox suave de estudio, fidelidad de color de la tela en 8k.
${shotsCountDirective}
- keyframePrompt (Frame 0 en inglés) y actionPrompt (español).
- Sin música de fondo.

Esquema JSON estricto:
${baseJsonSchema}
Responde ÚNICAMENTE el bloque JSON.`

    case 'unboxing':
      return `Eres un DIRECTOR DE CONTENIDO DE UNBOXING y Reviews Táctiles de Producto de Nueva Generación.
A partir de la idea del usuario, genera un desglose de desempaquetado sensorial y táctil en formato JSON estricto.

DIRECTIVAS ESPECÍFICAS DE UNBOXING:
${styleDirective}
${durationDirective}
- Estructura Unboxing:
  * Toma 1 (Packaging Arrival & First Touch): Plano cenital (top-down / 45°) de la caja sellada sobre mesa limpia, manos tocando el empaque y mostrando el branding.
  * Toma 2 (The Reveal & Peeling the Seal): Manos abriendo la caja y desprendiendo el precinto protector con placer táctil (ASMR visual).
  * Toma 3 (Product First Look & Macro Detail): Extracción del producto, primer plano macro en ángulo bajo mostrando acabados, materiales y primera impresión.
- Cámara: Enfoque macro en manos y producto, iluminación cálida de escritorio con fondo desenfocado (bokeh suave).
${shotsCountDirective}
- keyframePrompt (Frame 0 en inglés) y actionPrompt (español).
- Sonido foley diegético (crujido de cartón, despegue de cinta), sin música de fondo.

Esquema JSON estricto:
${baseJsonSchema}
Responde ÚNICAMENTE el bloque JSON.`

    case 'libre':
      const userGuideBlock = customPromptGuide && customPromptGuide.trim()
        ? `GUÍA Y DIRECTIVAS OBLIGATORIAS DEL USUARIO (MÁXIMA PRIORIDAD):
"""
${customPromptGuide.trim()}
"""
Debes seguir rigurosamente estas directivas para:
1. Extraer y estructurar los personajes, locaciones y props clave.
2. Definir el ritmo, tipo de planos, movimiento de cámara y acción de cada toma.
3. Redactar los keyframePrompts en inglés aplicando con precisión el formato y estilo visual dictado en la guía.`
        : `GUÍA POR DEFECTO:
Estructura el contenido de forma equilibrada y cinematográfica, extrayendo los personajes clave, locaciones y tomas coherentes con la idea del usuario.`

      return `Eres un DIRECTOR CREATIVO, GUIONISTA Y ESPECIALISTA EN PROMPT ENGINEERING AUDIOVISUAL de alto nivel.
A partir del texto, guión o idea proporcionada por el usuario, genera un desglose de producción audiovisual completo en formato JSON estricto, siguiendo las instrucciones de la guía.

${userGuideBlock}

DIRECTIVAS GENERALES:
${styleDirective}
${durationDirective}
${assetsDirectives}
${shotsCountDirective}
- Asegúrate de que los personajes, locaciones y objetos clave queden debidamente identificados con nombres consistentes.
- Para cada toma:
  * cameraMovement: Tipo de plano o ángulo (ej. Plano General, Primer Plano, Macro).
  * actionPrompt: Descripción precisa del desarrollo temporal de la toma en español.
  * dialogueText: Diálogo, locución o narración en off (vacío si no hay voz).
  * dialogueSpeaker: Nombre del personaje o narrador.
  * estimatedDuration: Duración exacta de la toma en segundos (número entero).
  * keyframePrompt: Prompt fotográfico/cinematográfico ultra-detallado en inglés para el FOTOGRAMA 0 (Frame 0), aplicando el estilo y directivas solicitadas en la guía.
- Sin música de fondo en los prompts.

Esquema JSON estricto:
${baseJsonSchema}
Responde ÚNICAMENTE el bloque JSON.`

    case 'faceless':
      return `Eres un GUIONISTA Y DIRECTOR AUDIOVISUAL experto en videos sin rostro ("Faceless Videos", YouTube Automation, TikTok/Reels virales y documentales de alta retención).
A partir de la idea o texto del usuario, genera un desglose audiovisual dinámico y cinemático en formato JSON estricto.

DIRECTIVAS ESPECÍFICAS DE FACELESS (CANAL AUTOMATIZADO):
${styleDirective}
${durationDirective}
${customGuideDirective}
${assetsDirectives}
- REGLA DE ORO DE FACELESS: NINGÚN ROSTRO HUMANO VISIBLE.
  * NO crees personajes humanos con rostros para el reparto principal.
  * Si la historia requiere un narrador en off, define en "characters" un único elemento: name: "Narrador", role: "Voz en Off (V.O.)".
  * Las tomas se componen exclusivamente de: B-roll cinematográfico de alta calidad, macrofotografía, entornos y locaciones atmosféricas (completamente vacías de personas), objetos y props clave aislados en estudio, gráficos conceptuales, documentos, pantallas, tecnología, o manos realizando una acción sin mostrar jamás caras.
- NARRACIÓN / LOCUCIÓN (V.O.):
  * Todo el texto hablado debe ser narración en off reflexiva, impactante y magnética.
  * En cada toma con audio, dialogueSpeaker DEBE ser "Narrador" o "V.O.".
${shotsCountDirective}
- keyframePrompt debe ser el FOTOGRAMA INICIAL (Frame 0) en inglés, con descripciones ultra detalladas de b-roll cinemático SIN ROSTROS HUMANOS.
- actionPrompt debe describir el desarrollo de la toma en español.
- Sin música de fondo.

Esquema JSON estricto:
${baseJsonSchema}
Responde ÚNICAMENTE el bloque JSON.`

    case 'microdrama':
    default:
      return `Eres un GUIONISTA Y SHOWRUNNER cinematográfico galardonado de microseries y dramas de alto impacto vertical (ShortMax, DramaBox, ReelShort).
A partir de la idea del usuario, genera un desglose dramático cinematográfico completo en formato JSON estricto.

DIRECTIVAS ESPECÍFICAS DE MICRODRAMA:
${styleDirective}
${durationDirective}
${customGuideDirective}
${assetsDirectives}
- Estructura de tensión dramática:
  * Tensión, conflictos entre personajes, secretos/traiciones, confrontaciones directas y cliffhanger en el último segundo.
- Cámara: Planos medios y primeros planos expresivos, iluminación dramática de claroscuro (chiaroscuro), lentes anamórficos.
- Diálogo: Líneas de diálogo incisivas con subtexto entre personajes.
${shotsCountDirective}
- keyframePrompt debe ser el FOTOGRAMA INICIAL (Frame 0) en inglés.
- actionPrompt debe describir el desarrollo de la toma en español.
- Sin música de fondo.

Esquema JSON estricto:
${baseJsonSchema}
Responde ÚNICAMENTE el bloque JSON.`
  }
}
