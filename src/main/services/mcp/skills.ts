import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { type McpTool, ToolInputError, ToolContent, READ_ONLY, str, num, optStr } from './types'

/**
 * Writing skills the bridge serves to agents: method documents (resources/skills/*.md) that
 * tell an agent HOW to write a piece, as opposed to the prompt library's per-shot templates.
 * They are exposed three ways so every MCP client can reach them: the get_skill /
 * short_drama_ideas tools, skill:// resources and MCP prompts.
 *
 * The .md files are kept verbatim from their source; OPENFIELD_NOTES maps their Higgsfield
 * vocabulary onto Openfield's models and tools.
 */

export const SKILL_IDS = ['short-drama-screenwriter', 'seedance-2-5-prompt-writer', 'ugc-reel-creator'] as const
export type SkillId = (typeof SKILL_IDS)[number]

const SKILL_TITLES: Record<SkillId, string> = {
  'short-drama-screenwriter': 'Short Drama Screenwriter',
  'seedance-2-5-prompt-writer': 'Seedance 2.5 Prompt Writer',
  'ugc-reel-creator': 'UGC Reel Creator',
}

const IDEA_BANK_HEADING = 'Idea bank'

/**
 * The user's fixed character-sheet layout: Nano-Banana 2.1,
 * 16:9, 4K, the user's photos of the character attached as references. {{brief}} is the character.
 */
export const CHARACTER_SHEET_PROMPT =
  'Layout 4 views: a head-and-shoulders portrait, a full-body front view, a full-body side view plus a three-quarter standing view, ' +
  'on a plain gray background, soft even studio light. Same face, body, hair and outfit in every view. ' +
  'Photorealistic, natural skin texture, 85mm look. Keep the character at the same scale in the three full-body views. {{brief}}'

/** Reels / videos with characters: what becomes a reference and how a clip uses its first frame */
export const CHARACTER_VIDEO_RULES = [
  'REFERENCES AS ELEMENTS: in any reel or video with characters, every recurring character (people, animals, mascots) gets a character sheet BEFORE any shot: ' +
    `generate it with Nano-Banana-2.1 (MachGen), aspect_ratio 16:9, resolution 4K, the user's photos of the character as reference_asset_ids, and this exact prompt with {{brief}} filled in: "${CHARACTER_SHEET_PROMPT}" ` +
    '(for animals, "hair and outfit" means fur, markings, collar and harness). Every location gets an empty view of the place and every object that must look the same in every shot (product, logo, bag, vehicle) gets its own image. ' +
    'Save them as references, not as loose images: tag them in the library (e.g. "<name>,character-sheet") with update_assets. The user\'s layout above wins over any library character-sheet template.',
  'FIRST FRAME AS A REFERENCE (preferred): always generate each shot\'s first frame (an image made from the character, location and object references) and have the user validate it, then make the video in reference mode with that frame as ONE MORE reference next to the character sheets, location and objects of the shot. ' +
    'This is the preferred route because the video keeps seeing the character sheets and location, so identity and brand details stay consistent. ' +
    'Pinning the frame as the start frame (FF / image-to-video) is still allowed: use it when the user asks, when the model has no reference mode, or when a shot must open on that exact frame. ' +
    'generate: pass the frame in reference_asset_ids together with the sheets, location and objects (first frame first), not in start_frame_asset_id, and name them in the prompt in that load order (image 1 = the first frame: match its framing, people and light; image 2 = the character sheet…). ' +
    'With references and no start/end frame, generate runs MachGen video models in reference mode (R2V) when the model supports it.',
].join('\n')

const OPENFIELD_NOTES: Record<SkillId, string> = {
  'short-drama-screenwriter': [
    '## Openfield notes (read first)',
    '',
    'This skill was written for Higgsfield. In Openfield the same package is built with generate (images and clips) and a timeline (timeline_* tools):',
    '',
    '- **Idea bank:** call short_drama_ideas (filter by engine, starred_only, query) instead of reading the whole bank.',
    '- **Story, cast, continuity, scenes:** write the full screenplay of the output template (logline, cast with a voice description per character, locations, props, clip breakdown), show it to the user and wait for their approval before generating anything.',
    '- **Asset prompts → references:** characters, locations and story props become library images made with generate and tagged with update_assets (e.g. "Lucy,character-sheet", "CastingRoom,location"), never untagged loose images. The character sheet follows the user\'s layout below, NOT Step 4\'s sheet (no blank face). Each location is the empty three-quarter location view. Model mapping: Soul 2.0 → "Soul Image 2.0 (Higgsfield)" or "Nano-Banana-2.1 (MachGen)"; GPT Image 2 → "GPT Image 2"; Seedream 5.0 edit → "Seedream 5 Pro I2I"; Soul Cinema → "Soul Cinema (Higgsfield)". A changed look (hair down, new outfit) is its own tagged sheet, e.g. "Lucy (hair down)". Face / outfit option rounds can be run with generate count: 4.',
    '- **Clips:** one video per clip of 4–30 s (Seedance 2.5 range). Generate its first frame (FIRST FRAME AND SPATIAL BLOCKING) as an image, have the user validate it, then generate the clip with the full Seedance 2.5 prompt and the frame plus the clip\'s character sheets, location and props in reference_asset_ids (reference mode). Use start_frame_asset_id only when the user asks or the clip must open on that exact frame. Write every clip prompt with the seedance-2-5-prompt-writer skill (get_skill).',
    '- **Video model:** "Seedance 2.5 (MachGen)" is the cheapest route (draft 480p for review takes, then the final). Two voice routes: let Seedance speak the lines with the voice description repeated in each prompt (the skill\'s method), or make the lines with voice_generate / cloned_voice_generate and pass each line\'s audio in reference_asset_ids as the clip\'s lip-sync reference.',
    '- **@references:** in the prompts, name references in reference_asset_ids load order (@image1, @image2 …) and only the ones on screen in that clip.',
    '- **Generate and revise:** a failed take gets one targeted change in its prompt and a regeneration of that clip only (recreate_generation with overrides).',
    '- **Delivery:** assemble the approved clips in order on a timeline (timeline_create, timeline_add_clips, captions if wanted) and export it with timeline_export. Talk to the user in their language; prompts stay in English.',
    '',
    CHARACTER_VIDEO_RULES,
  ].join('\n'),
  'seedance-2-5-prompt-writer': [
    '## Openfield notes (read first)',
    '',
    '- Openfield models: "Seedance 2.5 (MachGen)" (T2V / I2V / R2V, 4–30 s, 480p/720p/1080p, aspect 16:9 9:16 1:1 4:3 3:4; I2V follows the input frame), also "Seedance 2.5 (Fal)", "Seedance 2.5 (APIMart)" and "Seedance 2.5 (Higgsfield)".',
    '- @tags: with generate, references are passed as reference_asset_ids in load order, so name them @image1 @image2 … in that order unless the user named them.',
    '- Before writing, also check the prompt library (search_prompt_library with model "seedance") for a matching template and adapt it inside this block structure.',
    '- Preferred: the first frame is attached as a reference (reference mode) rather than pinned as the start frame: list it in ACTIVE REFERENCES as the composition of the opening frame ("@image1: the first frame, match its framing, positions and light") next to the character sheets and location. Pinning it as the start frame (I2V) stays allowed when the user asks or the shot must open on that exact frame.',
    '',
    CHARACTER_VIDEO_RULES,
  ].join('\n'),
  'ugc-reel-creator': [
    '## Openfield notes (read first)',
    '',
    '- Tools: generate (images and videos), wait_for_tasks, get_asset, import_asset, update_assets (tags, favorites), preview_assets, timeline_* (edit and export). Call search_prompt_library before the first generate (e.g. query "ugc smartphone handheld", model "nano-banana").',
    '- Model ids: images "Nano-Banana-2.1" with provider "machgen"; UGC videos "MiniMax-H3" with provider "machgen" (reference mode when references are attached and no start/end frame); dialogue or long takes "Seedance-2.5" (write those prompts with get_skill("seedance-2-5-prompt-writer")).',
    '- Build the reel with generate + timeline; for a longer piece with dialogue follow get_skill("short-drama-screenwriter").',
    '',
    CHARACTER_VIDEO_RULES,
  ].join('\n'),
}

// ─── Loading ─────────────────────────────────────────────────

interface Skill {
  id: SkillId
  title: string
  description: string
  body: string
  sections: { heading: string; text: string }[]
}

let skillDir: string | null | undefined
const cache = new Map<SkillId, Skill>()

/** resources/skills, next to the app in dev and under resourcesPath when packaged */
function skillsDir(): string | null {
  if (skillDir !== undefined) return skillDir
  const candidates = [
    path.join(app.getAppPath(), 'resources', 'skills'),
    path.join(process.resourcesPath || '', 'resources', 'skills'),
  ]
  skillDir = candidates.find((d) => fs.existsSync(d)) || null
  return skillDir
}

function parseSkill(id: SkillId, raw: string): Skill {
  const text = raw.replace(/\r\n/g, '\n')
  let body = text
  let description = ''
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/)
  if (fm) {
    body = text.slice(fm[0].length)
    // description is either inline or a folded block (description: >) running until the next key
    const lines = fm[1].split('\n')
    const start = lines.findIndex((l) => l.startsWith('description:'))
    if (start >= 0) {
      const end = lines.findIndex((l, i) => i > start && /^[\w-]+:/.test(l))
      description = [lines[start].replace(/^description:\s*>?/, ''), ...lines.slice(start + 1, end < 0 ? undefined : end)]
        .map((l) => l.trim()).filter(Boolean).join(' ')
    }
  }
  const sections: Skill['sections'] = []
  const parts = body.split(/^(?=## )/m)
  for (const part of parts) {
    const h = part.match(/^## (.+)\n/)
    if (h) sections.push({ heading: h[1].trim(), text: part.trim().replace(/\n+---$/, '') })
  }
  return { id, title: SKILL_TITLES[id], description, body: body.trim(), sections }
}

export function loadSkill(id: SkillId): Skill {
  const hit = cache.get(id)
  if (hit) return hit
  const dir = skillsDir()
  const file = dir ? path.join(dir, `${id}.md`) : ''
  if (!file || !fs.existsSync(file)) throw new Error(`Skill '${id}' is missing from resources/skills`)
  const skill = parseSkill(id, fs.readFileSync(file, 'utf8'))
  cache.set(id, skill)
  return skill
}

function skillId(v: any): SkillId {
  const id = str(v).trim().toLowerCase()
  if (!(SKILL_IDS as readonly string[]).includes(id)) {
    throw new ToolInputError(`Unknown skill '${v}'. Available: ${SKILL_IDS.join(', ')}`)
  }
  return id as SkillId
}

/** The text an agent works from: Openfield notes, then the skill (the screenwriter without its idea bank) */
export function skillText(id: SkillId, opts: { section?: string; includeIdeaBank?: boolean } = {}): string {
  const skill = loadSkill(id)
  const header = `# ${skill.title} (Openfield skill)\n\n${OPENFIELD_NOTES[id]}`
  if (opts.section) {
    const q = opts.section.toLowerCase()
    const found = skill.sections.filter((s) => s.heading.toLowerCase().includes(q))
    if (!found.length) {
      throw new ToolInputError(`No section matching '${opts.section}' in ${id}. Sections: ${skill.sections.map((s) => s.heading).join(' | ')}`)
    }
    return `${header}\n\n${found.map((s) => s.text).join('\n\n')}`
  }
  const body = opts.includeIdeaBank
    ? skill.body
    : skill.sections.some((s) => s.heading.startsWith(IDEA_BANK_HEADING))
      ? skill.body.split(/^## Idea bank/m)[0].trim() + '\n\n## Idea bank\n\n(100 premises: use short_drama_ideas to browse them.)'
      : skill.body
  return `${header}\n\n${body}`
}

// ─── Idea bank ───────────────────────────────────────────────

const ENGINES: Record<string, string> = {
  cinderella: 'Cinderella',
  love: 'Love against the odds',
  rivalry: 'Rivalry',
  hidden_identity: 'Hidden identity',
  turning_tables: 'Turning the tables',
}

interface Idea {
  number: number
  title: string
  starred: boolean
  engine: string
  premise: string
  feeling: string
  opens_on: string
}

let ideas: Idea[] | null = null

function ideaBank(): Idea[] {
  if (ideas) return ideas
  const bank = loadSkill('short-drama-screenwriter').sections.find((s) => s.heading.startsWith(IDEA_BANK_HEADING))
  const out: Idea[] = []
  let engine = ''
  for (const line of (bank?.text || '').split('\n')) {
    const h = line.match(/^### (.+)/)
    if (h) {
      const name = h[1].toLowerCase()
      engine = Object.keys(ENGINES).find((k) => name.startsWith(ENGINES[k].toLowerCase())) || ''
      continue
    }
    const m = line.match(/^(\d+)\.\s+(★\s+)?\*\*(.+?)\.?\*\*\s+(.+?)\s+\*Feeling:\*\s+(.+?)\s+\*Opens on:\*\s+(.+)$/)
    if (!m) continue
    out.push({ number: Number(m[1]), title: m[3], starred: !!m[2], engine, premise: m[4], feeling: m[5].replace(/\.$/, ''), opens_on: m[6].replace(/\.$/, '') })
  }
  ideas = out
  return out
}

// ─── Tools ───────────────────────────────────────────────────

export function getSkillTools(): McpTool[] {
  return [
    {
      name: 'get_skill',
      title: 'Get writing skill',
      description:
        'Read one of Openfield\'s writing skills, the method to follow before writing: "short-drama-screenwriter" (AI short dramas / micro-dramas / series episodes: idea scoring, four-part episode, cast and voices, character-sheet and location prompts, clip breakdown, generate-and-revise loop, output template) and "seedance-2-5-prompt-writer" (every Seedance 2.5 video prompt: block structure, references, FOV table, timed cuts, positive locks, checklist) and "ugc-reel-creator" (UGC reels / social videos with a recurring character and a brand: brief, character sheet and location references, phone-shot keyframes the user validates, videos in reference mode with first frame + character + location, timeline edit, cost report). ' +
        'Read the screenwriter before writing any short drama, the Seedance writer before writing any Seedance prompt and the UGC creator before any UGC reel or social video. section returns only the sections whose heading contains that text.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', enum: [...SKILL_IDS] },
          section: { type: 'string', description: 'e.g. "Step 6", "Output template", "OPTICS", "CHECKLIST"' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => {
        const id = skillId(args.name)
        return new ToolContent([{ type: 'text', text: skillText(id, { section: optStr(args.section) }) }])
      },
    },
    {
      name: 'short_drama_ideas',
      title: 'Short drama idea bank',
      description:
        'Browse the 100 original short-drama premises of the screenwriter skill: number, title, engine (cinderella, love, rivalry, hidden_identity, turning_tables), premise, the feeling underneath and the peak to open on. ★ starred ones are the strongest first episodes. ' +
        'With no idea from the user, score candidates with the skill\'s six criteria, pitch the top three and recommend one. #1 (Soul Angel) only when the user wants to recreate that episode.',
      inputSchema: {
        type: 'object',
        properties: {
          engine: { type: 'string', enum: Object.keys(ENGINES) },
          starred_only: { type: 'boolean' },
          query: { type: 'string', description: 'Words to match in title, premise, feeling or opening' },
          limit: { type: 'number', minimum: 1, description: 'Default 20' },
        },
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => {
        const words = str(args.query).toLowerCase().split(/\s+/).filter(Boolean)
        const list = ideaBank().filter((i) =>
          (!args.engine || i.engine === args.engine) &&
          (!args.starred_only || i.starred) &&
          words.every((w) => `${i.title} ${i.premise} ${i.feeling} ${i.opens_on}`.toLowerCase().includes(w)))
        const limit = Math.max(1, num(args.limit, 20))
        return { total: list.length, ideas: list.slice(0, limit) }
      },
    },
  ]
}

// ─── Resources and MCP prompts ───────────────────────────────

export function skillResources() {
  return SKILL_IDS.map((id) => ({
    uri: `skill://${id}`,
    name: id,
    title: `${SKILL_TITLES[id]} skill`,
    description: (() => { try { return loadSkill(id).description } catch { return SKILL_TITLES[id] } })(),
    mimeType: 'text/markdown',
  }))
}

export function readSkillResource(uri: string): string | null {
  const m = uri.match(/^skill:\/\/([^/?#]+)$/)
  if (!m || !(SKILL_IDS as readonly string[]).includes(m[1])) return null
  const id = m[1] as SkillId
  return skillText(id, { includeIdeaBank: true })
}

const PROMPTS = [
  {
    name: 'short_drama',
    title: 'Write a short drama episode',
    description: 'Write an AI short drama episode, from no idea to ready-to-generate references and clips, with the Short Drama Screenwriter and Seedance 2.5 Prompt Writer skills.',
    arguments: [
      { name: 'idea', description: 'The premise, or empty to pick from the idea bank', required: false },
      { name: 'format', description: 'Aspect ratio, e.g. 9:16 or 16:9', required: false },
      { name: 'length', description: 'Episode length, e.g. "2 min"', required: false },
    ],
  },
  {
    name: 'seedance_prompt',
    title: 'Write a Seedance 2.5 prompt',
    description: 'Turn a shot, scene or script beat into a single standalone Seedance 2.5 prompt.',
    arguments: [
      { name: 'shot', description: 'What happens in the shot or scene', required: true },
      { name: 'references', description: 'The @tags or assets available, if any', required: false },
    ],
  },
]

export function listSkillPrompts() {
  return PROMPTS
}

export function getSkillPrompt(name: string, args: Record<string, any>) {
  const message = (text: string) => ({ role: 'user', content: { type: 'text', text } })
  if (name === 'short_drama') {
    const brief = [
      'Write a short drama episode following the two skills below.',
      `Idea: ${str(args.idea).trim() || 'none yet: pick from the idea bank with short_drama_ideas (score, pitch the top three, recommend one).'}`,
      `Format: ${str(args.format).trim() || 'choose and state it'} · Length: ${str(args.length).trim() || 'about two minutes'}`,
      'Build it with generate and a timeline as the Openfield notes say, and stop for my approval after the script.',
    ].join('\n')
    return {
      description: PROMPTS[0].description,
      messages: [message(`${brief}\n\n${skillText('short-drama-screenwriter')}\n\n---\n\n${skillText('seedance-2-5-prompt-writer')}`)],
    }
  }
  if (name === 'seedance_prompt') {
    const shot = str(args.shot).trim()
    if (!shot) throw new ToolInputError('Missing required argument \'shot\'')
    const refs = str(args.references).trim()
    return {
      description: PROMPTS[1].description,
      messages: [message(`Write one Seedance 2.5 prompt for this shot following the skill below.\nShot: ${shot}${refs ? `\nReferences: ${refs}` : ''}\n\n${skillText('seedance-2-5-prompt-writer')}`)],
    }
  }
  return null
}
