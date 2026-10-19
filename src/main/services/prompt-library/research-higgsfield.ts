/**
 * Higgsfield-equivalent templates. Higgsfield is Openfield's quality benchmark: each template
 * deconstructs one of its apps or presets (public API docs at docs.higgsfield.ai, its MIT
 * skills repo, its public catalogs and blog) and reproduces it with prompts for cheaper models
 * available in Openfield. Wording is ours; Higgsfield images are linked (© Higgsfield), not bundled.
 */
import { type BuiltinPrompt, type BuiltinReference } from './types'

const HF = {
  influencerApi: { title: 'Higgsfield API · AI Influencer trait catalog (public)', url: 'https://api.higgsfield.ai/models/higgsfield/ai-influencer/options' },
  influencer: { title: 'Higgsfield · AI Influencer', url: 'https://higgsfield.ai/ai-influencer' },
  cinema: { title: 'Higgsfield API · Cinema Studio 4.0 schema', url: 'https://docs.higgsfield.ai/docs/models/cinema-studio-4/generate.md' },
  cinemaBlog: { title: 'Higgsfield · Cinema Studio 4.0 (Aug 2026)', url: 'https://higgsfield.ai/blog/cinema-studio-4-0' },
  cameraBlog: { title: 'Higgsfield · AI video camera control (Oct 2026)', url: 'https://higgsfield.ai/blog/ai-video-camera-control' },
  cameraControls: { title: 'Higgsfield · Camera Controls (65 presets)', url: 'https://higgsfield.ai/camera-controls' },
  skills: { title: 'higgsfield-ai/skills (MIT) · prompt engineering, marketing modes, workflows', url: 'https://github.com/higgsfield-ai/skills' },
  soul: { title: 'Higgsfield API · Soul 2.0', url: 'https://docs.higgsfield.ai/docs/models/soul-2/generate.md' },
  soulId: { title: 'Higgsfield API · Soul ID', url: 'https://docs.higgsfield.ai/docs/models/soul-id/create-character.md' },
  marketing: { title: 'Higgsfield API · Marketing Studio', url: 'https://docs.higgsfield.ai/docs/models/marketing-studio-image/generate-and-edit.md' },
  ads: { title: 'Higgsfield API · Ads Studio (Sep 2026)', url: 'https://docs.higgsfield.ai/docs/models/ads-studio/generate.md' },
  katana: { title: 'Higgsfield · Katana (Oct 2026)', url: 'https://higgsfield.ai/blog/higgsfield-katana' },
  changelog: { title: 'Higgsfield · Changelog', url: 'https://higgsfield.ai/creator-hub/changelog' },
}

const HF_LICENSE = '© Higgsfield; enlazado desde su sitio'
function hf(url: string, caption: string, sourceUrl: string, date?: string): BuiltinReference {
  return { url, caption, credit: 'Higgsfield', sourceUrl, license: HF_LICENSE, date }
}
const motion = (id: string) => `https://static.higgsfield.ai/${id}.webp`
const CAMERA_PAGE = 'https://higgsfield.ai/camera-controls'

/**
 * Higgsfield's 65 camera presets, grouped, each as one sentence a video model follows.
 * Our own phrasing of what each preset does on screen.
 */
export const HF_CAMERA_MOVES: Record<string, string> = {
  // Push / zoom
  'Dolly In': 'the camera glides steadily forward toward the subject, from medium shot to close-up',
  'Dolly Out': 'the camera glides steadily backward, revealing more of the surroundings',
  'Super Dolly In': 'a long, fast, perfectly smooth push from a wide shot all the way into an extreme close-up',
  'Super Dolly Out': 'a long, fast, smooth pull-back from an extreme close-up to a very wide shot',
  'Zoom In': 'a slow optical zoom in, the camera body stays still',
  'Zoom Out': 'a slow optical zoom out, the camera body stays still',
  'Crash Zoom In': 'an abrupt zoom-snap into the face in under half a second with motion blur, then hold',
  'Crash Zoom Out': 'an abrupt zoom-snap out from a close-up to a wide shot, then hold',
  'Rapid Zoom In': 'a fast, punchy zoom in that lands on the subject on the beat',
  'Rapid Zoom Out': 'a fast, punchy zoom out that reveals the setting',
  'YoYo Zoom': 'the zoom snaps in and back out twice, rhythmic, like a music-video beat',
  'Eyes In': 'a fast push-in that ends on an extreme close-up of the eyes',
  'Mouth In': 'a fast push into the open mouth that becomes the transition to the next scene',
  'Eating Zoom': 'a quick push toward the mouth as the subject takes a bite, food in sharp focus',
  // Dolly zoom
  'Dolly Zoom In': 'vertigo effect: the camera tracks backward while the lens zooms in, the subject keeps the same size and the background stretches away',
  'Dolly Zoom Out': 'reverse vertigo: the camera tracks forward while the lens zooms out, the background rushes in and compresses',
  // Orbit / rotation
  '360 Orbit': 'the camera circles a full 360° around the subject at constant height and distance',
  'Arc Left': 'the camera arcs about 90° to the left around the subject, keeping it centered',
  'Arc Right': 'the camera arcs about 90° to the right around the subject, keeping it centered',
  'Lazy Susan': 'the subject sits on an invisible turntable and rotates slowly while the camera stays still',
  '3D Rotation': 'the subject or product spins smoothly in place showing every side; the camera is locked',
  'Hero Cam': 'a fast low orbit that ends on a heroic low-angle frame as the light blooms behind the subject',
  'Glam': 'a high-speed orbit rendered in slow motion, hair and fabric flowing, glossy beauty light',
  'Bullet Time': 'the action freezes mid-moment (hair, debris, droplets suspended) while the camera sweeps 180° around at chest height, then motion resumes',
  // Vertical / aerial
  'Crane Up': 'the camera rises smoothly on a crane, revealing the scene from above',
  'Crane Down': 'the camera descends smoothly on a crane from a high angle down to eye level',
  'Crane Over The Head': 'the camera rises up and passes directly over the subject\'s head, ending top-down',
  'Jib up': 'a short, quick jib rise from waist height to above the subject',
  'Jib down': 'a short, quick jib drop from above the subject to waist height',
  'Tilt up': 'the camera stays in place and tilts up from the feet to the face or the sky',
  'Tilt Down': 'the camera stays in place and tilts down from the sky or face to the ground',
  'Aerial Pullback': 'the camera rises and pulls back fast until the subject is a dot in a vast landscape',
  'Overhead': 'a top-down camera follows the subject\'s path from directly above',
  // Lateral / tracking / rigs
  'Pan Left': 'the camera pivots left on a fixed tripod',
  'Pan Right': 'the camera pivots right on a fixed tripod',
  'Dolly Left': 'the camera slides sideways to the left on a track, parallax between foreground and background',
  'Dolly Right': 'the camera slides sideways to the right on a track, parallax between foreground and background',
  'Car Chasing': 'the camera races alongside or behind a moving car, low and close, road blurring',
  'Car Grip': 'the camera is clamped to the side of the car, the road rushing past in the background',
  'Road Rush': 'a low camera skims just above the road at high speed, asphalt streaking underneath',
  'Head Tracking': 'the frame is locked to the subject\'s head while the background slides past',
  'Double Dolly': 'the subject glides forward without walking, as if on the same moving platform as the camera',
  'Snorricam': 'the camera is rigidly rigged to the actor\'s chest facing them: face locked in the center while the world lurches and bobs behind with every step',
  'Buckle Up': 'a low angle looking up from beneath a glass floor as the subject walks over the camera',
  // Energy / texture
  'Handheld': 'documentary handheld camera with natural micro-shake and small reframes',
  'Wiggle': 'a slight playful shake combined with a smooth zoom or pan',
  'Whip Pan': 'a whip pan: the camera snaps sideways so fast the frame smears into motion blur, used as a transition',
  'Dutch Angle': 'the camera is tilted on its axis, horizon diagonal, uneasy tension',
  'Fisheye': 'an ultra-wide fisheye lens close to the subject, curved edges, exaggerated perspective',
  'Low Shutter': 'a slow shutter: moving lights and people streak with motion blur while the subject stays sharp',
  'Incline': 'the whole world is tilted, the subject leaning against an impossible slope',
  // Immersive
  'FPV Drone': 'a first-person drone flight, fast and fluid, diving and weaving through tight gaps',
  'Flying Cam Transition': 'the camera flies through the scene and carries the viewer into the next location',
  'Hyperlapse': 'a hyperlapse: the camera moves forward in big smooth jumps while time accelerates',
  'Through Object In': 'the camera starts behind a keyhole, window or foliage and pushes through it into the scene',
  'Through Object Out': 'the camera pulls back out through a keyhole, window or foliage, framing the scene inside it',
  'Object POV': 'the view from an object\'s point of view (a cup, a phone, a ball) as the subject interacts with it',
  'Robo Arm': 'a motion-control robot arm makes a very fast, precise sweep that decelerates into a perfect product hero frame, high-speed slow motion',
  'BTS': 'the camera pulls back to reveal the film crew, lights and set around the scene',
  // Time / focus / neutral
  'Timelapse Glam': 'a glamorous timelapse: the subject holds a pose while lights and crowds stream around them',
  'Timelapse Human': 'the subject stands frozen while the crowd streaks past in a timelapse',
  'Timelapse Landscape': 'a landscape timelapse: clouds race, light shifts from day to night',
  'Focus Change': 'a rack focus pulls from a foreground object to the subject\'s face',
  'Static': 'the camera holds completely still on a tripod',
  'General': 'natural, motivated camera movement chosen to suit the action',
}

const CAMERA_GUIDE = Object.entries(HF_CAMERA_MOVES).map(([name, sentence]) => `${name}: ${sentence}.`)

const CAMERA_TEMPLATE =
  '{{subject}} {{action}} in {{setting}}. Camera: {{move}}, {{speed}}, ending on {{end_frame}}. ' +
  'Only this camera move: {{exclusions}}. {{lens}}. {{lighting}}. No on-screen text.'

function cameraVars(move: string, endFrame: string) {
  return [
    { name: 'subject', description: 'Sujeto', example: 'A dancer in a red silk dress' },
    { name: 'action', description: 'Una sola acción', example: 'spins once and stops facing the camera' },
    { name: 'setting', description: 'Dónde', example: 'an empty concrete parking garage at night' },
    { name: 'move', description: 'El movimiento (ver lista de presets en la guía)', example: move },
    { name: 'speed', description: 'Ritmo (slow, steady, fast, accelerating, decelerating)', example: 'accelerating then easing out' },
    { name: 'end_frame', description: 'Encuadre final y si se mantiene', example: endFrame },
    { name: 'exclusions', description: 'Movimientos que NO deben ocurrir', example: 'no zoom, no pan, horizon level' },
    { name: 'lens', description: 'Lente/altura', example: '24mm at chest height' },
    { name: 'lighting', description: 'Luz', example: 'Hard sodium-vapor light, deep shadows' },
  ]
}

const CAMERA_MODELS = ['kling', 'seedance', 'wan', 'hailuo', 'veo']

export const HIGGSFIELD_PROMPTS: BuiltinPrompt[] = [
  // ─── Personajes ──────────────────────────────────────────────
  {
    id: 'of:hf-ai-influencer-sheet',
    name: 'AI Influencer: personaje por rasgos (equivalente Higgsfield)',
    kind: 'image',
    category: 'character',
    description:
      'Reproduce el AI Influencer de Higgsfield (oct. 2026): el personaje se define con rasgos cerrados (género, origen, edad, piel, cuerpo, ojos, rostro, pelo, rasgos distintivos, estética, accesorios) + un brief + hasta 3 prendas de referencia, y sale como hoja retrato + cuerpo entero. Con Nano Banana 2 / Seedream 5 cuesta una fracción.',
    tags: ['ai influencer', 'influencer', 'avatar', 'higgsfield', 'personaje', 'character sheet', 'rasgos', 'embajador', 'modelo virtual', 'ugc'],
    models: ['nano-banana', 'seedream', 'gpt-image', 'flux'],
    types: ['character-sheet', 'consistency', 'ugc'],
    template:
      'Character reference sheet of an original virtual influencer for {{brand_use}}. ' +
      'Identity: {{gender}}, {{origin}} origin, {{age}} adult, {{skin_tone}} skin, {{height}} height, {{body_type}} build with {{proportions}}. ' +
      'Face: {{head_shape}}, {{eye_shape}} {{eye_color}} eyes, {{facial_features}}; {{facial_hair}}. Hair: {{hair_color}} {{hairstyle}}. Distinctive: {{distinctive}}. ' +
      'Style: {{aesthetic}} aesthetic, wearing {{outfit}}, accessories: {{accessories}}. ' +
      'Layout: a head-and-shoulders portrait and a full-body front view side by side, plus a three-quarter view, on a plain white background, soft even studio light. ' +
      'Same face, body, hair and outfit in every view. Photorealistic, natural skin texture, 85mm look. {{brief}}',
    variables: [
      { name: 'brand_use', description: 'Para qué marca o uso', example: 'a specialty coffee brand\'s social media' },
      { name: 'gender', description: 'Género (Female, Male, Trans woman, Trans man, Non-binary)', example: 'female' },
      { name: 'origin', description: 'Origen (African, East Asian, European, Indian, Middle Eastern, Latin American)', example: 'Latin American' },
      { name: 'age', description: 'Edad (adult, mature, senior)', example: 'young' },
      { name: 'skin_tone', description: 'Tono de piel (porcelain, fair, light, olive, tan, brown, deep brown, ebony)', example: 'olive' },
      { name: 'height', description: 'Altura (average, tall, very tall)', example: 'average' },
      { name: 'body_type', description: 'Cuerpo (slim, athletic, muscular, curvy, heavy…)', example: 'athletic' },
      { name: 'proportions', description: 'Hasta 2 proporciones (long limbs, short legs, broad shoulders, tiny waist)', example: 'long limbs' },
      { name: 'head_shape', description: 'Forma del rostro (oval, round, square, heart-shaped, long face)', example: 'heart-shaped face' },
      { name: 'eye_shape', description: 'Forma de ojos (almond, round, hooded, monolid, upturned, downturned, large)', example: 'almond' },
      { name: 'eye_color', description: 'Color de ojos', example: 'hazel' },
      { name: 'facial_features', description: 'Hasta 4 rasgos (freckles, dimples, high cheekbones, full lips, thick eyebrows, beauty mark…)', example: 'light freckles, dimples and thick eyebrows' },
      { name: 'facial_hair', description: 'Vello facial (clean-shaven, stubble, full beard…)', example: 'clean-shaven' },
      { name: 'hairstyle', description: 'Peinado (short, long, buzz cut, braids, afro, mullet…)', example: 'long wavy hair' },
      { name: 'hair_color', description: 'Color de pelo', example: 'dark brown' },
      { name: 'distinctive', description: 'Hasta 2 rasgos distintivos (heterochromia, septum ring, stacked ear piercings, scar across the brow…)', example: 'stacked ear piercings' },
      { name: 'aesthetic', description: 'Estética (retro, sporty, Y2K, goth, suits, streetstyle, casual, theatre)', example: 'streetstyle' },
      { name: 'outfit', description: 'Vestuario (o "the clothing from images 2–4")', example: 'an oversized cream knit sweater, wide black trousers and white sneakers' },
      { name: 'accessories', description: 'Hasta 3 (glasses, headphones, jewelry, hat, bag)', example: 'thin gold hoops and a canvas tote bag' },
      { name: 'brief', description: 'Brief libre de personalidad/contexto', example: 'Warm, curious, always mid-laugh; feels like a friend who works at the café.', optional: true },
    ],
    guidance: [
      'Así lo descompone Higgsfield: categorías cerradas con máximo por categoría (proporciones ≤2, rasgos faciales ≤4, distintivos ≤2, accesorios ≤3) + brief de hasta 4.000 caracteres + foto de identidad opcional + hasta 3 prendas de referencia + semilla.',
      'Pipeline Higgsfield → Openfield: hoja retrato + cuerpo entero (Nano Banana 2 / Seedream 5) → animación con motion transfer (Kling 3.0 Motion Control o un clip de referencia de 3–30 s).',
      'Con foto de identidad: adjúntala como image 1 y añade "use image 1 as the exclusive reference for the face". Prendas: images 2–4 con su rol.',
      'Guarda la línea Identity / Face / Hair / Distinctive como biblia del personaje y pégala igual en cada prompt de la campaña.',
      'Equivalente a Soul ID sin entrenar: un pack de 3–5 recortes de cara como referencias en cada generación.',
    ],
    aspectRatios: ['16:9', '3:2'],
    references: [hf('https://static.higgsfield.ai/ai-influencer/design-update/2026-10-02/sidebar/average.webp', 'AI Influencer: tipo de personaje "Average"', 'https://higgsfield.ai/ai-influencer', '2026-10-02')],
    sources: [HF.influencerApi, HF.influencer, HF.soulId, HF.skills],
  },

  // ─── Cinema Studio ───────────────────────────────────────────
  {
    id: 'of:hf-cinema-studio-director',
    name: 'Cinema Studio: plano dirigido por controles (equivalente Higgsfield)',
    kind: 'video',
    category: 'storyboard',
    description:
      'Reproduce Cinema Studio 4.0 (ago. 2026): los controles de dirección (género, época, cámara, lente, apertura, luz, paleta, ritmo y movimiento) se traducen a frases fijas antes de la escena. Higgsfield lo corre sobre Seedance 2.5; en Openfield, Seedance 2.5 por MachGen/KIE a menos de la mitad del costo.',
    tags: ['cinema studio', 'higgsfield', 'cinematográfico', 'director', 'género', 'lente', 'anamórfico', 'época', 'paleta', 'escena', 'seedance'],
    models: ['seedance', 'kling', 'veo', 'wan'],
    types: ['camera-motion', 'storyboard', 'photorealism', 'consistency'],
    template:
      '{{genre}} film, {{era}}. Shot on {{camera_model}} with {{lens}}, {{aperture}}. Light: {{light}}. Color palette: {{palette}}. Pacing: {{pacing}}. ' +
      'Camera: {{camera_move}}. Scene: {{scene}} {{references}}',
    variables: [
      { name: 'genre', description: 'Género: epic, drama, noir, comedy, horror, action', example: 'A noir' },
      { name: 'era', description: 'Época: 1960s, 1980s, 1990s, 2000s, 2020s (con vestuario y utilería de época)', example: '1980s film stock, period wardrobe and props' },
      { name: 'camera_model', description: 'Cámara: modern digital, 35mm film, 8mm film, DV camcorder', example: '35mm film' },
      { name: 'lens', description: 'Lente: clean sharp · anamorphic (oval bokeh, horizontal flare) · vintage anamorphic · warm vintage diffusion · halation (red glow on highlights)', example: 'anamorphic glass: horizontal blue streak flares, oval bokeh, mild barrel distortion' },
      { name: 'aperture', description: 'Apertura: wide open f/1.4 shallow focus · f/4 · f/11 deep focus', example: 'wide open at f/1.4, shallow focus' },
      { name: 'light', description: 'Luz: silhouette · practicals · window · overhead fall · contre-jour · soft cross', example: 'practical lamps only, pools of warm light in darkness' },
      { name: 'palette', description: 'Paleta con nombre evocador', example: 'neon rain at midnight: magenta and cyan reflections on wet asphalt' },
      { name: 'pacing', description: 'Ritmo: calm (una toma continua) · dynamic · chaotic (cortes cada 1–2 s) · single shot', example: 'one unhurried continuous take, no cuts' },
      { name: 'camera_move', description: 'Un movimiento (ver of:hf-camera-move-library)', example: 'slow dolly in from medium shot to close-up' },
      { name: 'scene', description: 'Solo la escena: quién, qué hace, dónde, emoción', example: 'A detective in a wet trench coat lights a cigarette under a flickering street sign and stares at an apartment window, tense and exhausted.' },
      { name: 'references', description: 'Opcional: roles de referencias ("<<<image_1>>> is the detective")', example: 'The detective is the man from image 1.', optional: true },
    ],
    guidance: [
      'Así funciona en Higgsfield: cada control es un campo aparte y el prompt describe solo la escena; si omites un control, "el director" lo elige. Aquí cada control es una frase fija que va antes de la escena.',
      'Orden recomendado por Higgsfield: género, cámara, lente, apertura, color y ritmo primero; la escena después.',
      'Borrador barato primero (Seedance 2.5 a 480p), luego 720p/1080p solo de la toma elegida: es su "Draft Mode".',
      'Hasta 30 imágenes, 10 videos y 10 audios de referencia en Cinema Studio; en Openfield, nombra cada referencia con su rol.',
    ],
    aspectRatios: ['16:9', '21:9', '9:16'],
    durationSeconds: 8,
    references: [hf('https://cdn.sanity.io/images/s479xw3z/production/d4654a3b63a38a78a11689b592b36e78b9ea6b1a-1280x714.jpg?w=1280&fm=jpg&q=85', 'Cinema Studio 4.0', 'https://higgsfield.ai/blog/cinema-studio-4-0', '2026-08-12')],
    sources: [HF.cinema, HF.cinemaBlog, HF.skills],
  },

  // ─── Cámara ──────────────────────────────────────────────────
  {
    id: 'of:hf-camera-move-library',
    name: 'Presets de cámara Higgsfield (65 movimientos) en un prompt',
    kind: 'video',
    category: 'style',
    description:
      'Los 65 presets de Camera Controls de Higgsfield convertidos en una frase que cualquier modelo de video sigue. Elige el movimiento de la guía y pégalo en {{move}}. Estructura de su guía de cámara (oct. 2026): velocidad, trayectoria y encuadre final, y excluir los movimientos que compiten.',
    tags: ['cámara', 'presets', 'higgsfield', 'camera controls', 'dolly', 'zoom', 'orbit', 'crane', 'fpv', 'snorricam', 'bullet time', 'whip pan', 'movimiento'],
    models: CAMERA_MODELS,
    types: ['camera-motion', 'image-to-video'],
    template: CAMERA_TEMPLATE,
    variables: cameraVars('the camera glides steadily forward toward the subject, from medium shot to close-up', 'a tight close-up of her face, held for one second'),
    guidance: [
      'Un movimiento por clip, con números (grados, metros, focal) y el encuadre final; repite la misma redacción en todos los planos de la serie.',
      'En imagen a video no re-describas el frame: solo sujeto + movimiento de cámara.',
      'Modelos baratos que siguen bien los presets: Kling 2.5 Turbo / Wan 3.0 (push, zoom, pan), Kling 3.0 / Seedance 2.5 (dolly zoom, órbitas, bullet time; genera 2 tomas), Hailuo (física, velocidad).',
      ...CAMERA_GUIDE,
    ],
    aspectRatios: ['9:16', '16:9'],
    durationSeconds: 5,
    references: [hf('https://cdn.sanity.io/images/s479xw3z/production/e09c1e38bac0d2a17406a4e0a2eaef29d7366dcc-3840x2160.jpg?w=1280&fm=jpg&q=85', 'Guía de control de cámara de Higgsfield', 'https://higgsfield.ai/blog/ai-video-camera-control', '2026-10-09')],
    sources: [HF.cameraControls, HF.cameraBlog, HF.skills],
  },
  {
    id: 'of:hf-bullet-time',
    name: 'Bullet Time (preset Higgsfield)',
    kind: 'video',
    category: 'style',
    description: 'La acción se congela a mitad de movimiento mientras la cámara rodea al sujeto, y luego se reanuda. Para saltos, golpes, splashes de producto y momentos "wow" en redes.',
    tags: ['bullet time', 'congelado', 'freeze', 'orbit', 'matrix', 'higgsfield', 'acción', 'wow', 'deporte'],
    models: ['kling', 'seedance', 'hailuo', 'veo'],
    types: ['camera-motion', 'ads', 'social'],
    template: CAMERA_TEMPLATE,
    variables: cameraVars(HF_CAMERA_MOVES['Bullet Time'], 'the subject\'s profile, then action resumes'),
    guidance: ['Elige un instante con elementos suspendidos (agua, polvo, pelo, confeti): es lo que vende el efecto.', 'Kling 3.0 o Seedance 2.5; genera 2 tomas y elige.'],
    aspectRatios: ['9:16', '16:9'],
    durationSeconds: 5,
    references: [hf(motion('855c5272-8f39-48b7-a362-e1337590387f'), 'Preset Bullet Time', CAMERA_PAGE)],
    sources: [HF.cameraControls],
  },
  {
    id: 'of:hf-snorricam',
    name: 'Snorricam (preset Higgsfield)',
    kind: 'video',
    category: 'style',
    description: 'Cámara atada al pecho del actor: la cara queda fija al centro y el mundo se mueve detrás. Transmite tensión, euforia o desorientación; muy usado en videoclips y anuncios de moda.',
    tags: ['snorricam', 'body cam', 'cámara al pecho', 'higgsfield', 'videoclip', 'tensión', 'moda'],
    models: ['kling', 'seedance', 'wan'],
    types: ['camera-motion', 'social'],
    template: CAMERA_TEMPLATE,
    variables: cameraVars(HF_CAMERA_MOVES['Snorricam'], 'her face still centered as she stops'),
    guidance: ['Pide que el sujeto camine o corra: el efecto necesita movimiento del cuerpo.'],
    aspectRatios: ['9:16', '16:9'],
    durationSeconds: 5,
    references: [hf(motion('893cb65f-c528-40aa-83d8-c5aeb2bfe59f'), 'Preset Snorricam', CAMERA_PAGE)],
    sources: [HF.cameraControls],
  },
  {
    id: 'of:hf-robo-arm-product',
    name: 'Robo Arm: barrido de brazo robótico a hero de producto',
    kind: 'video',
    category: 'advertising',
    description: 'Movimiento de motion control muy rápido y preciso que frena justo en el encuadre hero del producto, en cámara lenta. El look de los comerciales de bebidas, tecnología y cosmética.',
    tags: ['robo arm', 'motion control', 'producto', 'comercial', 'hero', 'higgsfield', 'slow motion', 'anuncio', 'packshot'],
    models: ['kling', 'seedance', 'veo', 'hailuo'],
    types: ['camera-motion', 'ads', 'product'],
    template: CAMERA_TEMPLATE,
    variables: [
      ...cameraVars(HF_CAMERA_MOVES['Robo Arm'], 'a centered hero frame of the product, label facing camera, held').map((v) =>
        v.name === 'subject' ? { ...v, example: 'The amber cold-brew bottle from image 1' }
          : v.name === 'action' ? { ...v, example: 'stands still as ice cubes and coffee splash around it' }
          : v.name === 'setting' ? { ...v, example: 'a glossy black studio set with a thin rim light' } : v),
    ],
    guidance: ['Usa el packshot real como start frame para que la etiqueta no cambie.', 'Describe que el producto queda quieto: solo se mueve la cámara.'],
    aspectRatios: ['9:16', '16:9', '1:1'],
    durationSeconds: 5,
    references: [hf(motion('6fef255d-cdd6-4463-b025-a42646866c1c'), 'Preset Robo Arm', CAMERA_PAGE)],
    sources: [HF.cameraControls],
  },
  {
    id: 'of:hf-dolly-zoom',
    name: 'Dolly Zoom / vértigo (preset Higgsfield)',
    kind: 'video',
    category: 'style',
    description: 'El sujeto mantiene su tamaño mientras el fondo se estira o se comprime: el efecto Vértigo para revelaciones, miedo o un "momento de comprensión".',
    tags: ['dolly zoom', 'vertigo', 'vértigo', 'zolly', 'revelación', 'higgsfield', 'cine', 'tensión'],
    models: ['kling', 'seedance', 'veo'],
    types: ['camera-motion'],
    template: CAMERA_TEMPLATE,
    variables: cameraVars(HF_CAMERA_MOVES['Dolly Zoom In'], 'his face the same size but the corridor stretched far behind him'),
    guidance: ['Los modelos baratos fallan a menudo este efecto: Kling 3.0 o Seedance 2.5 y 2 tomas.', 'Un pasillo o calle con líneas de fuga hace el efecto más evidente.'],
    aspectRatios: ['16:9', '9:16'],
    durationSeconds: 5,
    references: [hf(motion('114245a3-93fb-434a-9299-44ca9e4656a3'), 'Preset Dolly Zoom In', CAMERA_PAGE)],
    sources: [HF.cameraControls],
  },
  {
    id: 'of:hf-crash-zoom',
    name: 'Crash Zoom (preset Higgsfield)',
    kind: 'video',
    category: 'social',
    description: 'Zoom brusco a la cara en menos de medio segundo con motion blur y luego quieto. Un hook de reels y un golpe cómico o dramático.',
    tags: ['crash zoom', 'zoom brusco', 'hook', 'reels', 'comedia', 'higgsfield', 'impacto'],
    models: ['kling', 'wan', 'seedance', 'hailuo'],
    types: ['camera-motion', 'social'],
    template: CAMERA_TEMPLATE,
    variables: cameraVars(HF_CAMERA_MOVES['Crash Zoom In'], 'an extreme close-up of his shocked eyes, held'),
    guidance: ['Ideal en los primeros 2 s de un reel; combínalo con una reacción exagerada.'],
    aspectRatios: ['9:16'],
    durationSeconds: 4,
    references: [hf(motion('1cc27a2b-3b89-44d4-a7f9-d583454a8960'), 'Preset Crash Zoom In', CAMERA_PAGE)],
    sources: [HF.cameraControls],
  },
  {
    id: 'of:hf-fpv-drone',
    name: 'FPV Drone (preset Higgsfield)',
    kind: 'video',
    category: 'style',
    description: 'Vuelo en primera persona rápido y fluido que se mete por espacios estrechos. Para recorridos de locales, inmobiliaria, eventos y aperturas espectaculares.',
    tags: ['fpv', 'drone', 'dron', 'recorrido', 'inmobiliaria', 'evento', 'higgsfield', 'vuelo'],
    models: ['kling', 'seedance', 'veo', 'hailuo'],
    types: ['camera-motion', 'real-estate', 'ads'],
    template: CAMERA_TEMPLATE,
    variables: cameraVars(HF_CAMERA_MOVES['FPV Drone'], 'the bar counter where the bartender raises a glass'),
    guidance: ['Describe la ruta (entra por la puerta, cruza el salón, baja la escalera) para que el vuelo tenga sentido.'],
    aspectRatios: ['16:9', '9:16'],
    durationSeconds: 5,
    references: [hf(motion('244dc358-abee-426c-8966-b735978421b3'), 'Preset FPV Drone', CAMERA_PAGE)],
    sources: [HF.cameraControls],
  },

  // ─── Soul (imagen) ───────────────────────────────────────────
  {
    id: 'of:hf-soul-styles',
    name: 'Estilos Soul (fotografía de moda/UGC, equivalente Higgsfield)',
    kind: 'image',
    category: 'style',
    description:
      'El "look" de Higgsfield Soul (fotos que parecen tomadas con cámara/teléfono real) como diccionario de estilos que se añade al prompt. Con Seedream 5 Lite o Nano Banana 2.1 a ~$0.02–0.045 por imagen.',
    tags: ['soul', 'higgsfield', 'estilo', 'flash', 'digicam', 'y2k', 'selfie', 'ugc', 'moda', 'editorial', 'instagram', 'film'],
    models: ['seedream', 'nano-banana', 'gpt-image', 'flux'],
    types: ['style-reference', 'photorealism', 'ugc', 'fashion'],
    template: '{{subject}} {{action}} in {{setting}}, wearing {{outfit}}. Style: {{soul_style}}. {{palette}}',
    variables: [
      { name: 'subject', description: 'Sujeto (o "the woman from image 1")', example: 'A 25-year-old woman with a messy bun and silver rings' },
      { name: 'action', description: 'Acción/pose', example: 'laughing mid-sentence with a drink in hand' },
      { name: 'setting', description: 'Lugar', example: 'a crowded rooftop party at night' },
      { name: 'outfit', description: 'Vestuario', example: 'a black slip dress and a vintage leather jacket' },
      { name: 'soul_style', description: 'Frase de estilo (ver diccionario en la guía)', example: 'a 2000s compact digital camera with harsh on-camera flash, slight noise, blown highlights and an orange date stamp in the corner' },
      { name: 'palette', description: 'Opcional: paleta (equivalente a Soul HEX)', example: 'Color grade: candy pink and soft cream.', optional: true },
    ],
    guidance: [
      '0.5 Selfie: ultra-wide 0.5x front-camera selfie at arm\'s length, stretched near limbs, phone HDR.',
      'Digital Camera: 2000s compact camera, harsh on-camera flash, slight noise, orange date stamp.',
      'Subtle Flash: soft fill flash mixed with natural ambient light.',
      'Flash Editorial: direct hard flash, glossy magazine contrast, dark falloff.',
      'Retro BW: high-grain black-and-white film, deep blacks, soft halation.',
      'Y2K Studio: glossy early-2000s studio portrait, chrome and pastel backdrop, frosted lip gloss.',
      'Street Photography: candid 35mm street shot, passers-by in the frame, natural daylight.',
      'Theatrical Light: single hard spotlight, dramatic shadows, stage-like black background.',
      'Old Smartphone: early smartphone photo, soft focus, muted colors, JPEG artifacts.',
      'Frutiger Aero: glossy mid-2000s aqua aesthetic, bubbles, sky blue and grass green.',
      'Así funciona Soul: preset (style_id) + fuerza del estilo + realce automático del prompt + personaje (Soul ID). Para replicar el realce, describe cámara y luz concretas en vez de adjetivos.',
    ],
    aspectRatios: ['4:5', '9:16', '3:4'],
    sources: [HF.soul, HF.skills],
  },

  // ─── Marketing / Ads ─────────────────────────────────────────
  {
    id: 'of:hf-ugc-marketing-video',
    name: 'Video UGC de marketing por modo (equivalente Marketing Studio)',
    kind: 'video',
    category: 'ugc',
    description:
      'Reproduce los modos de video de Marketing Studio (UGC, how-to, unboxing, product showcase, review, TV spot, try-on): avatar + producto + hook + escenario + beats cronometrados + CTA. Pipeline barato: frame inicial con Nano Banana 2 → Kling 3.0 / Seedance 2.5 con audio.',
    tags: ['ugc', 'marketing studio', 'higgsfield', 'hook', 'cta', 'avatar', 'unboxing', 'review', 'how to', 'tv spot', 'try on', 'anuncio'],
    models: ['kling', 'seedance', 'veo', 'sora'],
    types: ['ugc', 'ads', 'dialogue', 'image-to-video'],
    template:
      'Vertical {{mode}} video, smartphone realism. The person from image 2 holds the {{product}} from image 1 naturally in {{setting}}.\n' +
      '0–2s: looks into the lens and says "{{hook}}".\n' +
      '2–{{t_mid}}s: {{beats}}\n' +
      '{{t_mid}}–{{t_end}}s: smiles and says "{{cta}}".\n' +
      'Natural handheld framing, real skin texture, product label sharp and unchanged. No subtitles, no on-screen text.',
    variables: [
      { name: 'mode', description: 'Modo: UGC testimonial · how-to · unboxing · product showcase · product review · TV spot · virtual try-on', example: 'UGC testimonial' },
      { name: 'product', description: 'Producto (image 1)', example: 'coffee bag' },
      { name: 'setting', description: 'Escenario', example: 'a sunny kitchen in the morning' },
      { name: 'hook', description: 'Hook de 0–2 s (≈5 palabras)', example: 'Stop buying bitter coffee.' },
      { name: 't_mid', description: 'Segundo en que termina el cuerpo', example: '10' },
      { name: 'beats', description: '2–3 beats de beneficio con acción y frase', example: 'opens the bag, smells it and says "it actually smells like chocolate"; brews a cup and takes a sip.' },
      { name: 't_end', description: 'Duración total', example: '13' },
      { name: 'cta', description: 'CTA', example: 'Link\'s in my bio.' },
    ],
    guidance: [
      'Orden de referencias como en Higgsfield: producto primero (image 1), persona después (image 2).',
      'Habla a ~2,5 palabras por segundo: un spot de 13 s soporta ~30 palabras.',
      'Hook y escenario no aplican a "product showcase" ni "TV spot": ahí la cámara y el producto mandan.',
      'Click-to-Ad en Higgsfield: toma imágenes, nombre, beneficios y precio de la URL del producto. En Openfield, el agente puede leer la página y llenar estas variables.',
    ],
    aspectRatios: ['9:16'],
    durationSeconds: 13,
    references: [hf('https://cdn.sanity.io/images/s479xw3z/production/5423b472152f296023d9cbc18343c7cccbe5ea77-5504x3072.webp?w=1280&fm=jpg&q=85', 'Higgsfield MCP para marketers', 'https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-connect-higgsfield-to-ai-agent')],
    sources: [HF.marketing, HF.skills],
  },
  {
    id: 'of:hf-product-photoshoot',
    name: 'Product Photoshoot por modo (equivalente Higgsfield)',
    kind: 'image',
    category: 'product',
    description:
      'Los 10 modos de Product Photoshoot de Higgsfield (sobre GPT Image 2): packshot, escena lifestyle, close-up con persona, pin de moodboard, hero banner, carrusel, pack de creatividades, try-on, conceptual y restyle. Pregunta 4 cosas: cantidad, mood, canal y colores de marca.',
    tags: ['product photoshoot', 'higgsfield', 'producto', 'packshot', 'lifestyle', 'banner', 'carrusel', 'moodboard', 'try on', 'ecommerce'],
    models: ['gpt-image', 'nano-banana', 'seedream', 'flux'],
    types: ['product', 'ads', 'consistency'],
    template:
      '{{mode_sentence}} The {{product}} from image 1, exactly as in the reference (label, logo, shape, materials, colors). ' +
      'Mood: {{mood}}. Made for {{channel}}. Brand colors {{brand_colors}} in props and background. {{lighting}}. Photoreal commercial quality.',
    variables: [
      { name: 'mode_sentence', description: 'Frase del modo (ver guía)', example: 'A lifestyle scene: the product in use on a weekend breakfast table, a hand reaching for it.' },
      { name: 'product', description: 'Producto', example: 'coffee bag' },
      { name: 'mood', description: 'Mood', example: 'warm, slow Sunday morning' },
      { name: 'channel', description: 'Canal (define formato)', example: 'an Instagram feed post' },
      { name: 'brand_colors', description: 'Colores de marca (hex)', example: '#1F3A2E and #E8C07D' },
      { name: 'lighting', description: 'Luz', example: 'Soft morning window light from the left' },
    ],
    guidance: [
      'product_shot: clean studio packshot, seamless background, soft shadow.',
      'lifestyle_scene: the product in use in a real, styled environment.',
      'closeup_product_with_person: a close-up of hands or face interacting with the product.',
      'moodboard_pin (2:3): an aesthetic Pinterest-style composition around the product.',
      'hero_banner: wide banner with negative space for headline on one side.',
      'social_carousel: N slides with ONE locked visual system (same light, palette, angle family).',
      'ad_creative_pack: variations that change preset, light, angle and palette, never the product.',
      'virtual_model_tryout: the product worn or held by a model (image 2).',
      'conceptual_product: a surreal or symbolic scene that tells the product\'s idea.',
      'restyle: same product and composition in a new art direction.',
      'Regla de Higgsfield: el agente no escribe el prompt libre; arma el prompt desde el modo y las 4 respuestas. Replícalo llenando estas variables.',
    ],
    aspectRatios: ['1:1', '4:5', '2:3', '16:9'],
    sources: [HF.skills, HF.marketing],
  },
  {
    id: 'of:hf-ads-studio-concepts',
    name: 'Ads Studio: brief → conceptos → piezas (equivalente Higgsfield)',
    kind: 'image',
    category: 'advertising',
    description:
      'Reproduce Ads Studio (sep. 2026): primero un LLM escribe 1–8 conceptos de anuncio desde el brief o la web de la marca, después se renderiza cada concepto. Esta plantilla es el prompt de render de UN concepto. Higgsfield usa GPT Image 2.5 (~$0.084/imagen).',
    tags: ['ads studio', 'higgsfield', 'conceptos', 'anuncio', 'brief', 'creatividades', 'dtc', 'performance', 'variantes'],
    models: ['gpt-image', 'nano-banana', 'seedream', 'ideogram'],
    types: ['ads', 'typography', 'product'],
    template:
      'Ad creative for {{brand}} ({{niche}}), aimed at {{audience}}, in {{language}}. Concept: {{concept}}. ' +
      'Visual: {{visual}}. Headline text exactly "{{headline}}" in {{type_style}}, placed {{placement}}. ' +
      'Product from image 1 unchanged. Brand palette {{palette}}. Layout: {{layout}}.',
    variables: [
      { name: 'brand', description: 'Marca', example: 'Lumen Coffee' },
      { name: 'niche', description: 'Nicho', example: 'specialty coffee subscriptions' },
      { name: 'audience', description: 'Público', example: 'remote workers 25–40' },
      { name: 'language', description: 'Idioma del texto', example: 'Spanish' },
      { name: 'concept', description: 'Idea del concepto (1 frase)', example: 'Your 9am meeting deserves better coffee' },
      { name: 'visual', description: 'Qué se ve', example: 'a laptop video call on a desk, the cup of coffee glowing like a hero in the foreground' },
      { name: 'headline', description: 'Titular corto', example: 'Tu reunión de las 9 merece más' },
      { name: 'type_style', description: 'Estilo tipográfico', example: 'bold condensed sans-serif, off-white' },
      { name: 'placement', description: 'Dónde va el texto', example: 'top left over clean negative space' },
      { name: 'palette', description: 'Paleta', example: '#1F3A2E, #E8C07D, #F4EFE6' },
      { name: 'layout', description: 'Formato (headline, bullet points, us-vs-them, testimonial…)', example: 'headline + product hero' },
    ],
    guidance: [
      'Paso 1 (concepto): pide a un LLM N conceptos en JSON con concept, visual, headline, layout; varía ángulo y formato entre ellos.',
      'Paso 2 (render): una generación por concepto con esta plantilla. Paso 3: el usuario elige y se escalan los ganadores.',
      'Formatos DTC de Higgsfield: headline, bullet points, us-vs-them. El brand kit (logo, colores, tipografía, tono) se inyecta en cada concepto.',
    ],
    aspectRatios: ['4:5', '1:1', '9:16'],
    sources: [HF.ads, HF.skills],
  },

  // ─── Storyboard / edición ────────────────────────────────────
  {
    id: 'of:hf-popcorn-storyboard',
    name: 'Popcorn: storyboard de hasta 8 frames consistentes',
    kind: 'image',
    category: 'storyboard',
    description: 'Reproduce Popcorn de Higgsfield: prompt en 5 partes (sujeto, escenario, estilo, acción, atmósfera) con el estilo primero, hasta 4 referencias numeradas y hasta 8 frames que después se animan.',
    tags: ['popcorn', 'higgsfield', 'storyboard', 'frames', 'secuencia', 'consistencia', 'referencias'],
    models: ['nano-banana', 'seedream', 'gpt-image'],
    types: ['storyboard', 'consistency', 'multi-shot'],
    template:
      '{{style}}. {{count}} sequential frames of the same story, each a separate panel. Subject: {{subject}} (image 1{{extra_refs}}). Setting: {{setting}}. ' +
      'Frames: {{frames}}. Atmosphere: {{atmosphere}}. Same character, wardrobe, palette and light in every frame; no text.',
    variables: [
      { name: 'style', description: 'Estilo, primero', example: 'Cinematic 35mm photography, soft teal-and-amber grade' },
      { name: 'count', description: 'Cantidad (1–8)', example: '6' },
      { name: 'subject', description: 'Sujeto', example: 'the young chef with a red bandana' },
      { name: 'extra_refs', description: 'Otras referencias numeradas', example: ', the restaurant from image 2', optional: true },
      { name: 'setting', description: 'Escenario', example: 'a tiny ramen bar in Osaka at night' },
      { name: 'frames', description: 'Acción de cada frame', example: '1 ties the bandana, 2 slices green onions fast, 3 flames burst from the wok, 4 plates the ramen, 5 slides the bowl to a customer, 6 smiles wiping her hands' },
      { name: 'atmosphere', description: 'Atmósfera', example: 'steamy, warm, energetic' },
    ],
    guidance: ['Barato: una sola llamada a Nano Banana 2.1 con grilla de N viñetas y luego recortar, o N llamadas con las mismas referencias.', 'Cada frame aprobado es el start frame de su clip (ver of:video-first-last-frame).'],
    aspectRatios: ['16:9', '3:2'],
    sources: [HF.skills],
  },
  {
    id: 'of:hf-video-explainer-block',
    name: 'Bloque de video explicativo ilustrado (equivalente Explainer)',
    kind: 'video',
    category: 'style',
    description: 'Formato de bloques del Video Explainer de Higgsfield: el mismo STYLE y la misma imagen clave de estilo en todos los clips, una acción por escena, audio ambiente sin voz (la narración va aparte) y negativos.',
    tags: ['explainer', 'explicativo', 'ilustrado', 'animación', 'higgsfield', 'tutorial', 'faceless', 'educativo'],
    models: ['kling', 'seedance', 'veo', 'wan'],
    types: ['image-to-video', 'consistency', 'audio'],
    template:
      'STYLE REFERENCE: {{style}}, non-photorealistic, illustrated, not a photo, no live action. Match the style of image 1.\n' +
      'SCENE: {{scene}}\nMOTION: {{motion}}\nAUDIO: {{ambience}}; no voice.\nNEGATIVE: photorealism, live-action footage, text, captions, watermark.',
    variables: [
      { name: 'style', description: 'Descriptor de estilo (idéntico en todos los bloques)', example: 'flat 2D editorial illustration, thick outlines, paper grain, muted teal and coral' },
      { name: 'scene', description: 'Una acción por bloque', example: 'A coffee bean travels along a conveyor from a farm to a roaster.' },
      { name: 'motion', description: 'Movimiento', example: 'slow lateral pan following the bean' },
      { name: 'ambience', description: 'Audio ambiente', example: 'soft machinery hum and birdsong' },
    ],
    guidance: ['Narración aparte (voz TTS): 20–24 palabras por bloque de 10 s.', 'Adjunta la misma imagen de estilo a todos los clips para que el look no cambie.'],
    aspectRatios: ['16:9', '9:16'],
    durationSeconds: 10,
    sources: [HF.skills],
  },
  {
    id: 'of:hf-katana-reference-edit',
    name: 'Katana: re-edición desde un video de referencia',
    kind: 'video',
    category: 'editing',
    description:
      'Reproduce Katana (skill de Higgsfield para Claude, 8 oct. 2026): toma un edit de referencia (ritmo, planos, audio), coloca tus personajes/productos (hasta 5 fotos) en cada plano, regenera los planos y arma un MP4 con la misma duración. En Openfield: detección de planos + reference-to-video por plano (Seedance 2.5) + Timeline.',
    tags: ['katana', 'higgsfield', 'referencia', 'edit', 'remix', 'motion transfer', 'style transfer', 'aura farming', 'clipping', 'tendencia'],
    models: ['seedance', 'kling', 'wan'],
    types: ['editing', 'consistency', 'multi-shot'],
    template:
      'Recreate shot {{shot_number}} of the reference video (video 1): same framing, camera move, timing and energy. ' +
      'Replace {{replace}} with {{asset_roles}}. Keep {{keep}}. {{style_change}}',
    variables: [
      { name: 'shot_number', description: 'Número de plano del edit de referencia', example: '3' },
      { name: 'replace', description: 'Qué reemplazar', example: 'the dancer' },
      { name: 'asset_roles', description: 'Tus assets con su rol', example: 'the woman from image 1 wearing the jacket from image 2' },
      { name: 'keep', description: 'Qué conservar', example: 'the background, lighting, choreography and cut points' },
      { name: 'style_change', description: 'Opcional: cambio de estilo', example: 'Restyle the whole shot as cel-shaded anime.', optional: true },
    ],
    guidance: [
      'Pipeline: 1) dividir la referencia en planos (cortes) en el Timeline; 2) un clip por plano con la referencia como video 1 y tus fotos como images; 3) concatenar en el Timeline con el audio original.',
      'Si algo sale mal, regenera solo ese plano, como hace Katana con los follow-ups.',
      'Usa ediciones de referencia propias o con permiso; no copies piezas protegidas de otros creadores.',
    ],
    aspectRatios: ['9:16', '16:9'],
    durationSeconds: 5,
    references: [hf('https://cdn.sanity.io/images/s479xw3z/production/425689932af3e67815f4bd66355bc2b38744827e-2720x1530.png?w=1280&fm=jpg&q=85', 'Katana de Higgsfield', 'https://higgsfield.ai/blog/higgsfield-katana', '2026-10-08')],
    sources: [HF.katana, HF.changelog],
  },
]
