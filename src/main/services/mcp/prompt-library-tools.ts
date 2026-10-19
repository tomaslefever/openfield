import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'
import { getAssetManager } from '../asset-manager'
import { resolveAssetFile } from '../asset-file'
import { notifyAssetsChanged } from '../../ipc/assets'
import {
  PROMPT_CATEGORIES,
  MODEL_TAGS,
  PROMPT_TYPES,
  markLibraryConsulted,
  searchLibraryPrompts,
  getLibraryPrompt,
  getPromptReferences,
  fillPrompt,
  createUserPrompt,
  updateUserPrompt,
  deleteUserPrompt,
  findUserPrompt,
  notifyPromptsChanged,
  type LibraryPrompt,
  type PromptInput,
  type PromptReferenceData,
} from '../prompt-library'
import { requireAsset } from './generation-tools'
import { type McpTool, ToolInputError, ToolContent, READ_ONLY, EDIT, CREATE, DESTRUCTIVE, str, num, optStr } from './types'

const CATEGORY_LIST = Object.entries(PROMPT_CATEGORIES).map(([id, label]) => `${id} (${label})`).join(', ')
const MODEL_LIST = Object.keys(MODEL_TAGS).join(', ')
const TYPE_LIST = Object.keys(PROMPT_TYPES).join(', ')
/** Inline reference previews above this size are skipped (base64 chars, ~1.5 MB of image) */
const MAX_INLINE_REF = 2_000_000
const MAX_SAVED_REFS = 6
const MAX_REF_BYTES = 10 * 1024 * 1024

function requirePrompt(id: string): LibraryPrompt {
  const p = getLibraryPrompt(id)
  if (!p) throw new ToolInputError(`Prompt '${id}' not found. Use search_prompt_library to find prompt ids.`)
  return p
}

function requireUserPrompt(id: string): any {
  if (id.startsWith('of:')) {
    throw new ToolInputError(`'${id}' is an Openfield built-in template and is read-only. Save an adapted copy with save_library_prompt instead.`)
  }
  const row = findUserPrompt(id)
  if (!row) throw new ToolInputError(`Prompt '${id}' not found in this workspace's library. Use search_prompt_library to find prompt ids.`)
  return row
}

function summary(p: LibraryPrompt & { score?: number }) {
  return {
    id: p.id,
    source: p.source,
    name: p.name,
    kind: p.kind,
    category: p.category,
    description: p.description,
    tags: p.tags,
    models: p.models,
    types: p.types,
    review: p.review.status,
    ...(p.review.note ? { reviewNote: p.review.note } : {}),
    variables: p.variables.map((v) => v.name),
    referenceCount: p.referenceCount,
    ...(p.aspectRatios.length ? { aspectRatios: p.aspectRatios } : {}),
    ...(p.durationSeconds ? { durationSeconds: p.durationSeconds } : {}),
    preview: p.prompt.length > 220 ? `${p.prompt.slice(0, 217)}…` : p.prompt,
  }
}

function tagsArg(v: any): string[] | undefined {
  if (v === undefined) return undefined
  if (!Array.isArray(v)) throw new ToolInputError('tags must be an array of strings')
  return v.filter((t) => typeof t === 'string' && t.trim()).map((t: string) => t.trim())
}

function slugsArg(v: any, allowed: Record<string, unknown>, field: string): string[] | undefined {
  const list = tagsArg(v)
  if (!list) return undefined
  const bad = list.filter((t) => !(t in allowed))
  if (bad.length) throw new ToolInputError(`Unknown ${field}: ${bad.join(', ')}. Use: ${Object.keys(allowed).join(', ')}`)
  return list
}

function kindArg(v: any): 'image' | 'video' | undefined {
  if (v === undefined) return undefined
  if (v !== 'image' && v !== 'video') throw new ToolInputError(`kind must be 'image' or 'video'`)
  return v
}

/** Library assets → references stored inside the prompt (base64, like the app's own Prompt Library) */
async function assetsToReferences(ids: any): Promise<PromptReferenceData[]> {
  if (!Array.isArray(ids)) throw new ToolInputError('reference_asset_ids must be an array of asset ids')
  if (ids.length > MAX_SAVED_REFS) throw new ToolInputError(`At most ${MAX_SAVED_REFS} references per prompt`)
  const refs: PromptReferenceData[] = []
  for (const raw of ids) {
    const asset = requireAsset(str(raw))
    if (asset.type !== 'image' && asset.type !== 'video') throw new ToolInputError(`Asset '${asset.id}' is ${asset.type}; only images and videos can be prompt references`)
    const file = resolveAssetFile(asset.id)
    if (!file) throw new ToolInputError(`Asset '${asset.id}' has no local file yet (still generating or failed)`)
    const stat = await fs.stat(file.path)
    if (stat.size > MAX_REF_BYTES) throw new ToolInputError(`Asset '${asset.id}' is ${(stat.size / 1048576).toFixed(1)} MB; references are limited to 10 MB`)
    refs.push({
      id: crypto.randomUUID(),
      base64: (await fs.readFile(file.path)).toString('base64'),
      mime: file.mime || asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/png'),
      type: asset.type,
      name: asset.fileName || path.basename(file.path),
    })
  }
  return refs
}

export function getPromptLibraryTools(): McpTool[] {
  return [
    {
      name: 'search_prompt_library',
      title: 'Search prompt library',
      description:
        'ALWAYS call this before writing any image or video generation prompt (ads, product shots, character sheets, storyboards, UGC, edits, reels…): Openfield\'s prompt library holds researched templates for visual quality and consistency, tagged by model family and piece type. ' +
        'It has Openfield\'s curated templates (source "openfield", ids "of:…") plus the prompts the user saved (source "workspace" or "global"); prompts the user rejected in review are hidden, approved ones rank first. ' +
        'Query in any language with the kind of piece wanted (e.g. "anuncio producto lujo", "character sheet", "storyboard 6 planos", "ugc testimonial"), and pass `model` with the model you will use so only prompts written for it come back. ' +
        'Open the best match with get_library_prompt and adapt it to the brief.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What kind of piece is needed. Omit to list everything (filters still apply).' },
          kind: { type: 'string', enum: ['image', 'video'] },
          category: { type: 'string', description: `Built-in categories: ${CATEGORY_LIST}. User prompts may use their own.` },
          source: { type: 'string', enum: ['openfield', 'workspace', 'global'], description: 'openfield = built-in templates; workspace / global = prompts the user saved' },
          model: { type: 'string', description: `Model family (${MODEL_LIST}) or the exact model id you will generate with` },
          type: { type: 'string', description: `Piece type: ${TYPE_LIST}` },
          include_rejected: { type: 'boolean', description: 'Also return prompts the user rejected in review. Default false' },
          limit: { type: 'number', description: 'Max results, default 8 (max 50)' },
        },
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => {
        markLibraryConsulted()
        const results = searchLibraryPrompts({
          query: optStr(args.query),
          kind: kindArg(args.kind),
          category: optStr(args.category),
          source: optStr(args.source) as any,
          model: optStr(args.model),
          type: optStr(args.type),
          includeRejected: args.include_rejected === true,
          limit: args.limit === undefined ? 8 : num(args.limit, 8),
        })
        return {
          count: results.length,
          prompts: results.map(summary),
          ...(results.length === 0 ? { hint: 'No match. Try a broader query (e.g. just "anuncio" or "video"), drop filters (model/type), or omit query to list everything.' } : {}),
        }
      },
    },
    {
      name: 'get_library_prompt',
      title: 'Get library prompt',
      description:
        'Open one prompt of the library: the full template with its {{variables}} (what each means plus an example value), adaptation guidance, the models and piece types it targets, suggested aspect ratios/duration, its visual references (with credit) and the guides it was distilled from. ' +
        'Pass `variables` to get it filled in (`filled`), with any still-missing required variable listed in `missing`. ' +
        'Treat the result as a reference: rewrite parts that do not fit the user\'s brand and brief rather than forcing them in. show_references: true also shows the prompt\'s saved reference images.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Prompt id from search_prompt_library' },
          variables: { type: 'object', description: 'Values for the template variables, e.g. { "brand": "Lumen Coffee", "product": "…" }', additionalProperties: { type: 'string' } },
          show_references: { type: 'boolean', description: 'Include the reference images inline, to see the look the template aims for. Default false' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => {
        markLibraryConsulted()
        const p = requirePrompt(str(args.id))
        const values = args.variables && typeof args.variables === 'object' && !Array.isArray(args.variables) ? args.variables : null
        const result: Record<string, any> = {
          ...summary(p),
          prompt: p.prompt,
          variables: p.variables,
          guidance: p.guidance,
          references: p.references.map(({ path: _p, ...r }) => r),
          sources: p.sources,
          preview: undefined,
        }
        if (values) {
          const { prompt, missing } = fillPrompt(p, values)
          result.filled = prompt
          result.missing = missing
        }
        if (p.referenceCount > 0) {
          result.referencesHint = 'These references show the target look. import_prompt_references turns them into library assets; pass them to generate as reference_asset_ids only when they should steer the result (a style or layout reference), never when they depict another brand\'s product or a real person.'
        }
        if (args.show_references !== true || p.referenceCount === 0) return result

        const { refs, warnings } = await getPromptReferences(p.id)
        if (warnings.length) result.referenceWarnings = warnings
        const content: any[] = [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        refs.forEach((ref, i) => {
          const label = `Reference #${i + 1} · ${ref.type} · ${ref.name}`
          if (ref.type !== 'image') content.push({ type: 'text', text: `${label} — video, no inline preview` })
          else if (ref.base64.length > MAX_INLINE_REF) content.push({ type: 'text', text: `${label} — too large to show inline; import it and use preview_assets` })
          else content.push({ type: 'text', text: label }, { type: 'image', data: ref.base64, mimeType: ref.mime || 'image/png' })
        })
        return new ToolContent(content, result)
      },
    },
    {
      name: 'import_prompt_references',
      title: 'Use prompt references',
      description: 'Import the reference images/videos saved with a library prompt into the active workspace library (deduplicated), so they can be passed to generate as reference_asset_ids. Returns the asset ids in order.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Prompt id' } },
        required: ['id'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => {
        const p = requirePrompt(str(args.id))
        const { refs, warnings } = await getPromptReferences(p.id)
        if (refs.length === 0) throw new ToolInputError(`Prompt '${p.name}' has no references${warnings.length ? ` that could be loaded: ${warnings.join('; ')}` : ''}`)
        const assets: Array<{ assetId: string; type: string; name: string }> = []
        for (const ref of refs) {
          const imported = await getAssetManager().importBase64(ref.base64, ref.mime, ref.name || `prompt-ref.${ref.type === 'video' ? 'mp4' : 'png'}`, { modelUsed: 'ref' })
          assets.push({ assetId: imported.id, type: imported.type, name: ref.name })
        }
        try { notifyAssetsChanged() } catch {}
        return { promptId: p.id, assets, reference_asset_ids: assets.map((a) => a.assetId), ...(warnings.length ? { warnings } : {}) }
      },
    },
    {
      name: 'save_library_prompt',
      title: 'Save prompt to library',
      description:
        'Save a prompt to the user\'s Prompt Library (shown in the app). Use it when the user asks to keep a prompt, or offer it after a result they liked. ' +
        'Write reusable parts as {{variables}} (e.g. {{brand}}, {{product}}) so the prompt works as a template next time. ' +
        'global: true keeps it in every workspace; default is the active workspace only. reference_asset_ids stores those library images/videos with it.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          prompt: { type: 'string' },
          kind: { type: 'string', enum: ['image', 'video'] },
          category: { type: 'string', description: `e.g. ${Object.keys(PROMPT_CATEGORIES).join(', ')}` },
          description: { type: 'string', description: 'When to use it, in one or two sentences' },
          tags: { type: 'array', items: { type: 'string' } },
          models: { type: 'array', items: { type: 'string' }, description: `Model families it was written for: ${MODEL_LIST}` },
          types: { type: 'array', items: { type: 'string' }, description: `Piece types: ${TYPE_LIST}` },
          global: { type: 'boolean', description: 'Available in every workspace. Default false' },
          reference_asset_ids: { type: 'array', items: { type: 'string' }, description: `Library assets to store as references (max ${MAX_SAVED_REFS})` },
        },
        required: ['name', 'prompt', 'kind'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => {
        const name = str(args.name).trim()
        const prompt = str(args.prompt).trim()
        if (!name || !prompt) throw new ToolInputError('name and prompt cannot be empty')
        const data: PromptInput = {
          name,
          prompt,
          kind: kindArg(args.kind),
          category: optStr(args.category),
          description: optStr(args.description),
          tags: tagsArg(args.tags),
          models: slugsArg(args.models, MODEL_TAGS, 'models'),
          types: slugsArg(args.types, PROMPT_TYPES, 'types'),
          global: args.global === true,
          references: args.reference_asset_ids ? await assetsToReferences(args.reference_asset_ids) : [],
        }
        const row = createUserPrompt(data)
        notifyPromptsChanged()
        return summary(requirePrompt(row.id))
      },
    },
    {
      name: 'update_library_prompt',
      title: 'Update library prompt',
      description: 'Edit a prompt the user saved (Openfield built-ins are read-only). Only the fields passed change; reference_asset_ids replaces the stored references; global moves it between this workspace and all workspaces.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          prompt: { type: 'string' },
          kind: { type: 'string', enum: ['image', 'video'] },
          category: { type: 'string' },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          models: { type: 'array', items: { type: 'string' } },
          types: { type: 'array', items: { type: 'string' } },
          global: { type: 'boolean' },
          reference_asset_ids: { type: 'array', items: { type: 'string' } },
        },
        required: ['id'],
        additionalProperties: false,
      },
      annotations: EDIT,
      handler: async (args) => {
        const row = requireUserPrompt(str(args.id))
        const data: PromptInput = {
          name: optStr(args.name)?.trim(),
          prompt: optStr(args.prompt)?.trim(),
          kind: kindArg(args.kind),
          category: typeof args.category === 'string' ? args.category : undefined,
          description: typeof args.description === 'string' ? args.description : undefined,
          tags: tagsArg(args.tags),
          models: slugsArg(args.models, MODEL_TAGS, 'models'),
          types: slugsArg(args.types, PROMPT_TYPES, 'types'),
          global: typeof args.global === 'boolean' ? args.global : undefined,
          references: args.reference_asset_ids ? await assetsToReferences(args.reference_asset_ids) : undefined,
        }
        if (Object.values(data).every((v) => v === undefined)) throw new ToolInputError('Nothing to update')
        updateUserPrompt(row.id, data)
        notifyPromptsChanged()
        return summary(requirePrompt(row.id))
      },
    },
    {
      name: 'delete_library_prompt',
      title: 'Delete library prompt',
      description: 'Permanently delete a prompt the user saved, with its references. Only when the user explicitly asks. Openfield built-ins cannot be deleted.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false,
      },
      annotations: DESTRUCTIVE,
      handler: async (args) => {
        const row = requireUserPrompt(str(args.id))
        deleteUserPrompt(row.id)
        notifyPromptsChanged()
        return { deleted: row.id, name: row.name }
      },
    },
  ]
}
