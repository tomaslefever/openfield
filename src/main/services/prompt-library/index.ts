import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app, BrowserWindow } from 'electron'
import { getRawDb } from '../../db'
import { getActiveWorkspaceId } from '../workspace-service'
import {
  BUILTIN_PROMPTS,
  PROMPT_CATEGORIES,
  MODEL_TAGS,
  PROMPT_TYPES,
  getBuiltinPrompt,
  type BuiltinPrompt,
  type PromptKind,
  type PromptVariable,
  type PromptSourceLink,
} from './builtin'

export { PROMPT_CATEGORIES, MODEL_TAGS, PROMPT_TYPES, type PromptKind, type PromptVariable }

/** workspace_id of user prompts saved for every workspace (never NULL: the workspace backfill would claim it) */
export const GLOBAL_SCOPE = '__global__'

/** openfield = ships with the app (read-only); workspace = active workspace only; global = every workspace */
export type PromptSource = 'openfield' | 'workspace' | 'global'

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface PromptReferenceData {
  id: string
  base64: string
  mime: string
  type: 'image' | 'video'
  name: string
}

/** A reference as listed (no payload): built-ins carry their file path and credit */
export interface PromptReferenceInfo {
  name: string
  type: 'image' | 'video'
  /** Bundled file */
  path?: string
  /** Example hosted by the source */
  url?: string
  caption?: string
  credit?: string
  sourceUrl?: string
  license?: string
  date?: string
}

export interface LibraryPrompt {
  id: string
  source: PromptSource
  name: string
  kind: PromptKind
  category: string
  description: string
  tags: string[]
  models: string[]
  types: string[]
  prompt: string
  variables: PromptVariable[]
  guidance: string[]
  aspectRatios: string[]
  durationSeconds?: number
  referenceCount: number
  references: PromptReferenceInfo[]
  sources: PromptSourceLink[]
  review: { status: ReviewStatus; note: string; updatedAt?: number }
  createdAt?: number
  updatedAt?: number
}

export interface PromptInput {
  name?: string
  prompt?: string
  kind?: PromptKind
  category?: string
  description?: string
  tags?: string[]
  models?: string[]
  types?: string[]
  references?: PromptReferenceData[]
  /** true = every workspace, false = the active one. Only read on create and when explicitly changed. */
  global?: boolean
}

const VAR_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g

function parseJson<T>(v: any, def: T): T {
  if (typeof v !== 'string' || !v) return def
  try { return JSON.parse(v) } catch { return def }
}

/** Variables a user prompt declares by writing {{name}} in its text */
export function detectVariables(prompt: string): PromptVariable[] {
  const seen = new Set<string>()
  const vars: PromptVariable[] = []
  for (const m of prompt.matchAll(VAR_RE)) {
    if (seen.has(m[1])) continue
    seen.add(m[1])
    vars.push({ name: m[1], description: '', example: '' })
  }
  return vars
}

// ─── Built-in reference files ─────────────────────────────────────────────────

let refDir: string | null | undefined
/** resources/prompt-library, next to the app in dev and under resourcesPath when packaged */
function builtinRefDir(): string | null {
  if (refDir !== undefined) return refDir
  const candidates = [
    path.join(app.getAppPath(), 'resources', 'prompt-library'),
    path.join(process.resourcesPath || '', 'resources', 'prompt-library'),
  ]
  refDir = candidates.find((d) => fs.existsSync(d)) || null
  return refDir
}

function builtinReferences(p: BuiltinPrompt): PromptReferenceInfo[] {
  const dir = builtinRefDir()
  const out: PromptReferenceInfo[] = []
  for (const r of p.references || []) {
    const filePath = r.file && dir ? path.join(dir, r.file) : undefined
    if (r.file && (!filePath || !fs.existsSync(filePath))) continue
    if (!r.file && !r.url) continue
    const name = r.file || r.url!.split('/').pop()!.split('?')[0]
    out.push({
      name,
      type: /\.(mp4|webm|mov)$/i.test(name) ? 'video' : 'image',
      ...(filePath ? { path: filePath } : { url: r.url }),
      caption: r.caption,
      credit: r.credit,
      sourceUrl: r.sourceUrl,
      license: r.license,
      date: r.date,
    })
  }
  return out
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

function reviewsById(): Map<string, { status: ReviewStatus; note: string; updatedAt: number }> {
  const rows = getRawDb().prepare('SELECT * FROM prompt_reviews').all() as any[]
  return new Map(rows.map((r) => [r.promptId, { status: r.status as ReviewStatus, note: r.note || '', updatedAt: r.updatedAt }]))
}

export function setPromptReview(id: string, status: ReviewStatus, note?: string) {
  const raw = getRawDb()
  if (status === 'pending' && !note) {
    raw.prepare('DELETE FROM prompt_reviews WHERE prompt_id = ?').run(id)
    return
  }
  const prev = raw.prepare('SELECT note FROM prompt_reviews WHERE prompt_id = ?').get(id) as any
  raw.prepare('INSERT OR REPLACE INTO prompt_reviews (prompt_id, status, note, updated_at) VALUES (?, ?, ?, ?)')
    .run(id, status, note ?? prev?.note ?? '', Date.now())
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

type Reviews = ReturnType<typeof reviewsById>
const PENDING = { status: 'pending' as ReviewStatus, note: '' }

function fromBuiltin(p: BuiltinPrompt, reviews: Reviews): LibraryPrompt {
  const references = builtinReferences(p)
  return {
    id: p.id,
    source: 'openfield',
    name: p.name,
    kind: p.kind,
    category: p.category,
    description: p.description,
    tags: p.tags,
    models: p.models,
    types: p.types,
    prompt: p.template,
    variables: p.variables,
    guidance: p.guidance,
    aspectRatios: p.aspectRatios,
    durationSeconds: p.durationSeconds,
    referenceCount: references.length,
    references,
    sources: p.sources || [],
    review: reviews.get(p.id) || PENDING,
  }
}

function fromRow(row: any, reviews: Reviews): LibraryPrompt {
  const prompt = row.prompt || ''
  const refs = parseJson<PromptReferenceData[]>(row.refs, [])
  return {
    id: row.id,
    source: row.workspaceId === GLOBAL_SCOPE ? 'global' : 'workspace',
    name: row.name || '',
    kind: row.kind === 'video' ? 'video' : 'image',
    category: row.category || '',
    description: row.description || '',
    tags: parseJson<string[]>(row.tags, []),
    models: parseJson<string[]>(row.models, []),
    types: parseJson<string[]>(row.types, []),
    prompt,
    variables: detectVariables(prompt),
    guidance: [],
    aspectRatios: [],
    referenceCount: refs.length,
    references: refs.map((r) => ({ name: r.name, type: r.type })),
    sources: [],
    review: reviews.get(row.id) || PENDING,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Row shape the renderer's Prompt Library store already understands, plus the new fields */
export function rowToRenderer(row: any) {
  const review = reviewsById().get(row.id) || PENDING
  return {
    ...row,
    refs: undefined,
    references: parseJson<any[]>(row.refs, []),
    tags: parseJson<string[]>(row.tags, []),
    models: parseJson<string[]>(row.models, []),
    types: parseJson<string[]>(row.types, []),
    category: row.category || '',
    description: row.description || '',
    global: row.workspaceId === GLOBAL_SCOPE,
    review,
  }
}

function userRows(): any[] {
  return getRawDb()
    .prepare('SELECT * FROM prompts WHERE workspace_id = ? OR workspace_id = ? ORDER BY updated_at DESC')
    .all(getActiveWorkspaceId(), GLOBAL_SCOPE)
}

function userRow(id: string): any | undefined {
  const row = getRawDb().prepare('SELECT * FROM prompts WHERE id = ?').get(id)
  if (!row) return undefined
  // Prompts of another workspace are invisible from this one
  if (row.workspaceId !== GLOBAL_SCOPE && row.workspaceId !== getActiveWorkspaceId()) return undefined
  return row
}

export function listUserPromptRows(): any[] {
  return userRows().map(rowToRenderer)
}

export function listBuiltinPrompts(): LibraryPrompt[] {
  const reviews = reviewsById()
  return BUILTIN_PROMPTS.map((p) => fromBuiltin(p, reviews))
}

export function listLibraryPrompts(): LibraryPrompt[] {
  const reviews = reviewsById()
  return [...userRows().map((r) => fromRow(r, reviews)), ...BUILTIN_PROMPTS.map((p) => fromBuiltin(p, reviews))]
}

export function getLibraryPrompt(id: string): LibraryPrompt | undefined {
  const builtin = getBuiltinPrompt(id)
  if (builtin) return fromBuiltin(builtin, reviewsById())
  const row = userRow(id)
  return row ? fromRow(row, reviewsById()) : undefined
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4',
}

const MAX_REMOTE_REF_BYTES = 12 * 1024 * 1024

/** Downloads a source-hosted example image (only when an agent or the user asks for it) */
async function fetchRemoteRef(url: string): Promise<{ buffer: Buffer; mime: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const mime = (res.headers.get('content-type') || '').split(';')[0].trim()
  if (!mime.startsWith('image/')) throw new Error(`not an image (${mime || 'unknown type'})`)
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length > MAX_REMOTE_REF_BYTES) throw new Error('image too large')
  return { buffer, mime }
}

/**
 * The references with their payload: stored base64 for user prompts; for built-ins the bundled
 * file, or the source-hosted example downloaded on demand (skipped with a warning if it fails).
 */
export async function getPromptReferences(id: string): Promise<{ refs: PromptReferenceData[]; warnings: string[] }> {
  const builtin = getBuiltinPrompt(id)
  if (!builtin) {
    const row = userRow(id)
    return { refs: row ? parseJson<PromptReferenceData[]>(row.refs, []) : [], warnings: [] }
  }
  const refs: PromptReferenceData[] = []
  const warnings: string[] = []
  for (const r of builtinReferences(builtin)) {
    try {
      const { buffer, mime } = r.path
        ? { buffer: await fs.promises.readFile(r.path), mime: MIME_BY_EXT[path.extname(r.name).toLowerCase()] || 'image/jpeg' }
        : await fetchRemoteRef(r.url!)
      refs.push({ id: r.name, base64: buffer.toString('base64'), mime, type: r.type, name: r.name })
    } catch (err: any) {
      warnings.push(`${r.name}: could not load (${err?.message || err})`)
    }
  }
  return { refs, warnings }
}

// ─── Consultation tracking ────────────────────────────────────────────────────

let lastConsultedAt = 0

/** Called whenever an agent reads the library over MCP */
export function markLibraryConsulted() {
  lastConsultedAt = Date.now()
}

export function libraryConsultedWithin(ms: number): boolean {
  return Date.now() - lastConsultedAt < ms
}

// ─── Search ───────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'for', 'and', 'or', 'with', 'to', 'in', 'on', 'my', 'me', 'this', 'that',
  'un', 'una', 'unos', 'unas', 'el', 'la', 'los', 'las', 'de', 'del', 'para', 'por', 'y', 'o', 'con',
  'en', 'mi', 'mis', 'esta', 'este', 'esto', 'que', 'creame', 'crea', 'crear', 'hazme', 'haz', 'quiero',
  'necesito', 'make', 'create', 'need', 'want', 'marca', 'brand',
])

function tokens(q: string): string[] {
  return norm(q).split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

/** The model family slugs a concrete model id belongs to ("kling-video/v3/…" → ["kling"]) */
export function modelFamilies(model: string): string[] {
  const m = norm(model).replace(/[\s_]+/g, '-')
  const families = Object.keys(MODEL_TAGS).filter((slug) => m.includes(slug) || slug.includes(m))
  // Common aliases
  if (/gemini.*image|banana/.test(m) && !families.includes('nano-banana')) families.push('nano-banana')
  if (/kontext/.test(m) && !families.includes('flux')) families.push('flux')
  if (/minimax/.test(m) && !families.includes('hailuo')) families.push('hailuo')
  return families
}

export interface SearchOptions {
  query?: string
  kind?: PromptKind
  category?: string
  source?: PromptSource
  /** A model family slug or a concrete model id */
  model?: string
  type?: string
  includeRejected?: boolean
  limit?: number
}

/**
 * Keyword ranking over name, tags, types, models, category, description and prompt text,
 * accent- and case-insensitive. Simple suffix stripping lets "anuncios" hit the tag "anuncio".
 * Rejected prompts are hidden unless asked for; approved ones and the user's own rank higher.
 * With no query, everything that passes the filters comes back.
 */
export function searchLibraryPrompts(opts: SearchOptions): Array<LibraryPrompt & { score: number }> {
  const qTokens = tokens(opts.query || '')
  const category = opts.category ? norm(opts.category) : ''
  const type = opts.type ? norm(opts.type) : ''
  const families = opts.model ? modelFamilies(opts.model) : []
  const results: Array<LibraryPrompt & { score: number }> = []

  for (const p of listLibraryPrompts()) {
    if (opts.kind && p.kind !== opts.kind) continue
    if (opts.source && p.source !== opts.source) continue
    if (!opts.includeRejected && p.review.status === 'rejected') continue
    if (category && norm(p.category) !== category && norm(PROMPT_CATEGORIES[p.category as keyof typeof PROMPT_CATEGORIES] || '') !== category) continue
    if (type && !p.types.some((t) => norm(t) === type || norm(PROMPT_TYPES[t] || '') === type)) continue
    // Prompts with no model tags are model-agnostic
    if (opts.model && p.models.length && !p.models.some((m) => families.includes(m))) continue

    let score = 0
    if (qTokens.length) {
      const fields: Array<[string, number]> = [
        [norm(p.name), 5],
        [norm(`${p.tags.join(' ')} ${p.types.join(' ')} ${p.types.map((t) => PROMPT_TYPES[t] || '').join(' ')}`), 4],
        [norm(`${p.category} ${PROMPT_CATEGORIES[p.category as keyof typeof PROMPT_CATEGORIES] || ''}`), 3],
        [norm(`${p.description} ${p.models.join(' ')}`), 2],
        [norm(p.prompt), 1],
      ]
      for (const t of qTokens) {
        const stem = t.length > 4 ? t.replace(/(es|s)$/, '') : t
        for (const [text, weight] of fields) {
          if (text.includes(stem)) score += weight
        }
      }
      if (score === 0) continue
    }
    if (p.review.status === 'approved') score += 2
    // A user's own prompts outrank a generic template on a tie
    if (p.source !== 'openfield') score += 0.5
    results.push({ ...p, score })
  }

  results.sort((a, b) => b.score - a.score || (b.updatedAt || 0) - (a.updatedAt || 0))
  return results.slice(0, Math.max(1, Math.min(opts.limit ?? 10, 50)))
}

// ─── Filling ──────────────────────────────────────────────────────────────────

/**
 * Replaces {{variables}} with the given values. Optional variables left empty disappear;
 * required ones left empty stay as {{name}} and are reported in `missing`.
 */
export function fillPrompt(p: LibraryPrompt, values: Record<string, string>): { prompt: string; missing: string[] } {
  const optional = new Set(p.variables.filter((v) => v.optional).map((v) => v.name))
  const missing = new Set<string>()
  const filled = p.prompt.replace(VAR_RE, (whole, name: string) => {
    const v = values[name]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (optional.has(name)) return ''
    missing.add(name)
    return whole
  })
  return { prompt: filled.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim(), missing: [...missing] }
}

// ─── Writes (user prompts only) ───────────────────────────────────────────────

/** Tells the open windows to reload the Prompt Library */
export function notifyPromptsChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send('prompts:changed') } catch {}
  }
}

export function createUserPrompt(data: PromptInput): any {
  const id = crypto.randomUUID()
  const now = Date.now()
  const scope = data.global ? GLOBAL_SCOPE : getActiveWorkspaceId()
  getRawDb().prepare(
    'INSERT INTO prompts (id, workspace_id, name, prompt, kind, refs, tags, models, types, category, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id, scope, data.name || 'Untitled', data.prompt || '', data.kind === 'video' ? 'video' : 'image',
    JSON.stringify(data.references || []), JSON.stringify(data.tags || []),
    JSON.stringify(data.models || []), JSON.stringify(data.types || []),
    data.category || '', data.description || '', now, now,
  )
  return getRawDb().prepare('SELECT * FROM prompts WHERE id = ?').get(id)
}

export function updateUserPrompt(id: string, data: PromptInput): any {
  const sets: string[] = ['updated_at = ?']
  const vals: any[] = [Date.now()]
  for (const key of ['name', 'prompt', 'kind', 'category', 'description'] as const) {
    if (data[key] !== undefined) { sets.push(`${key} = ?`); vals.push(data[key]) }
  }
  if (data.references !== undefined) { sets.push('refs = ?'); vals.push(JSON.stringify(data.references)) }
  for (const key of ['tags', 'models', 'types'] as const) {
    if (data[key] !== undefined) { sets.push(`${key} = ?`); vals.push(JSON.stringify(data[key])) }
  }
  if (data.global !== undefined) { sets.push('workspace_id = ?'); vals.push(data.global ? GLOBAL_SCOPE : getActiveWorkspaceId()) }
  vals.push(id)
  getRawDb().prepare(`UPDATE prompts SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  return getRawDb().prepare('SELECT * FROM prompts WHERE id = ?').get(id)
}

export function deleteUserPrompt(id: string) {
  getRawDb().prepare('DELETE FROM prompts WHERE id = ?').run(id)
  getRawDb().prepare('DELETE FROM prompt_reviews WHERE prompt_id = ?').run(id)
}

/** A user prompt visible from the active workspace, or undefined (built-ins are not user prompts) */
export function findUserPrompt(id: string): any | undefined {
  return userRow(id)
}
