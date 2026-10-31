import * as http from 'http'
import {
  STORYBOARD_STYLES,
  getBridgePort,
  listBoards,
  getBoard,
  createBoard,
  updateBoard,
  deleteBoard,
  createScene,
  updateScene,
  deleteScene,
  getScene,
  reorderScenes,
  createTransition,
  deleteTransition,
  generateSceneImage,
  generateSceneVideo,
  generateTransition,
  getTask,
} from '../storyboard-service'
import {
  listServices,
  getEndpointDetails,
  getServiceModels,
} from './endpoint-inspector'
import { IMAGE_MODELS, VIDEO_MODELS } from '../kie/models'
import { getGenerationTools } from './generation-tools'
import { getContentStudioTools } from './content-studio-tools'
import { getWorkspaceTools } from './workspace-tools'
import { getPromptLibraryTools } from './prompt-library-tools'
import { getTimelineTools } from './timeline-tools'
import { getVoiceTools } from './voice-tools'
import { getLayoutTools } from './layout-tools'
import {
  type McpTool,
  ToolInputError,
  ToolContent,
  READ_ONLY,
  DESTRUCTIVE,
  EDIT,
  CREATE,
  GENERATE,
  str,
  num,
  optStr,
} from './types'

// Newest first: the first entry is what we answer with when the client asks for one we don't know.
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0]
const SERVER_NAME = 'openfield-storyboard-bridge'
const SERVER_VERSION = '0.4.0'
const MAX_BODY_BYTES = 4 * 1024 * 1024

// The bridge only listens on loopback, but a web page in the user's browser can still reach it
// (CSRF) or reach it through a rebound DNS name. Only loopback Hosts and Origins are accepted.
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i
const LOOPBACK_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i

const SCENE_ASPECT_RATIOS = ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9']
const SCENE_RESOLUTIONS = ['1K', '2K', '4K']

function requireBoard(storyboardId: string): any {
  try {
    return getBoard(storyboardId)
  } catch {
    throw new ToolInputError(`Storyboard '${storyboardId}' not found. Use list_storyboards to see the existing ones.`)
  }
}

function requireScene(sceneId: string): any {
  const scene = getScene(sceneId)
  if (!scene) throw new ToolInputError(`Scene '${sceneId}' not found. Use list_scenes to see a storyboard's scenes.`)
  return scene
}

function getTools(): McpTool[] {
  const dynamicImageModels = IMAGE_MODELS.map(m => m.id).join(', ')
  const dynamicVideoModels = VIDEO_MODELS.map(m => m.id).join(', ')
  const styleIds = STORYBOARD_STYLES.map(s => s.id).join(', ')

  return [
    // ─── Service introspection ─────────────────────────────────
    {
      name: 'list_services',
      title: 'List services',
      description: 'List all AI generation and media services (kie, fal, replicate, machgen, apimart, storyboard, …) with their endpoints, capabilities and model counts, discovered from the codebase.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: READ_ONLY,
      handler: async () => ({ services: await listServices() }),
    },
    {
      name: 'list_endpoints',
      title: 'List endpoints',
      description: 'List endpoints for a given service (e.g. "kie", "fal", "replicate", "storyboard") or across all services.',
      inputSchema: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Optional service name filter, e.g. "kie", "fal", "replicate", "storyboard"' },
        },
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => {
        const all = await listServices()
        if (args.service) {
          const found = all.find(s => s.name.toLowerCase() === str(args.service).toLowerCase())
          if (!found) throw new ToolInputError(`Service '${args.service}' not found. Available: ${all.map(s => s.name).join(', ')}`)
          return { service: found.name, endpoints: found.endpoints }
        }
        return { endpoints: all.flatMap(s => s.endpoints) }
      },
    },
    {
      name: 'get_endpoint',
      title: 'Get endpoint details',
      description: "Read an endpoint's documentation, exported functions, relevant TypeScript interfaces, supported models and example, live from disk. Optionally include the raw source.",
      inputSchema: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Service name, e.g. "kie", "fal", "replicate", "storyboard"' },
          endpoint: { type: 'string', description: 'Endpoint name as returned by list_endpoints, e.g. "video", "image", "audio"' },
          include_source: { type: 'boolean', description: 'Include the full source code of the endpoint (default false)' },
        },
        required: ['service', 'endpoint'],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => getEndpointDetails(str(args.service), str(args.endpoint), Boolean(args.include_source)),
    },
    {
      name: 'get_endpoint_example',
      title: 'Get endpoint example',
      description: 'Get the code example and sample payload for an endpoint (.example.ts / .example.json file, JSDoc @example tag, or a synthesized payload).',
      inputSchema: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Service name, e.g. "kie", "fal", "replicate"' },
          endpoint: { type: 'string', description: 'Endpoint name, e.g. "video", "image", "audio"' },
        },
        required: ['service', 'endpoint'],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => {
        const details = await getEndpointDetails(str(args.service), str(args.endpoint), false)
        return {
          service: details.service,
          endpoint: details.endpoint,
          description: details.description,
          example: details.example,
          relevantInterfaces: details.relevantInterfaces,
        }
      },
    },
    {
      name: 'get_service_models',
      title: 'Get service models',
      description: 'Get the live list of AI models, pricing and capabilities for a service from its catalog.',
      inputSchema: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Service name: "kie", "fal", "replicate", "machgen", "apimart", "klingai" or "pruna"' },
          type: { type: 'string', enum: ['image', 'video', 'audio'], description: 'Optional model type filter' },
        },
        required: ['service'],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => {
        const models = await getServiceModels(str(args.service), optStr(args.type))
        return { service: str(args.service), filter: optStr(args.type) || null, models }
      },
    },

    // ─── Storyboards ───────────────────────────────────────────
    {
      name: 'list_styles',
      title: 'List storyboard styles',
      description: `List the visual styles available for storyboards (${styleIds}), or use a custom free-text style. Each style has a suffix that is automatically appended to scene prompts.`,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: READ_ONLY,
      handler: async () => ({
        styles: STORYBOARD_STYLES.map(s => ({ id: s.id, name: s.name, description: s.description, suffix: s.suffix })),
        custom: 'Any free-text style description is also accepted (e.g. "watercolor, soft pastels").',
      }),
    },
    {
      name: 'list_storyboards',
      title: 'List storyboards',
      description: 'List the storyboards of the active workspace with scene count and thumbnail path.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: READ_ONLY,
      handler: async () => ({ storyboards: listBoards() }),
    },
    {
      name: 'create_storyboard',
      title: 'Create storyboard',
      description: `Create a new storyboard. Optionally set its visual style (${styleIds}, or a custom free-text style). The style is stored on the board and appended as a suffix to scene prompts.`,
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Storyboard name' },
          style: { type: 'string', description: 'Style id or a custom style description' },
        },
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => createBoard(str(args.name, 'Untitled Storyboard'), str(args.style)),
    },
    {
      name: 'get_storyboard',
      title: 'Get storyboard',
      description: 'Get a storyboard with all its scenes (ordered) and transitions.',
      inputSchema: {
        type: 'object',
        properties: { storyboard_id: { type: 'string', description: 'Storyboard id' } },
        required: ['storyboard_id'],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => requireBoard(str(args.storyboard_id)),
    },
    {
      name: 'update_storyboard',
      title: 'Update storyboard',
      description: 'Update a storyboard name and/or style. A new style only applies to scenes created afterwards.',
      inputSchema: {
        type: 'object',
        properties: {
          storyboard_id: { type: 'string' },
          name: { type: 'string', description: 'New name' },
          style: { type: 'string', description: 'New style id or custom description' },
        },
        required: ['storyboard_id'],
        additionalProperties: false,
      },
      annotations: EDIT,
      handler: async (args) => {
        const id = str(args.storyboard_id)
        requireBoard(id)
        const settings: any = {}
        if (args.name !== undefined) settings.name = str(args.name)
        if (args.style !== undefined) settings.style = str(args.style)
        updateBoard(id, settings)
        return getBoard(id)
      },
    },
    {
      name: 'delete_storyboard',
      title: 'Delete storyboard',
      description: 'Permanently delete a storyboard and all its scenes and transitions. Generated assets stay in the library.',
      inputSchema: {
        type: 'object',
        properties: { storyboard_id: { type: 'string' } },
        required: ['storyboard_id'],
        additionalProperties: false,
      },
      annotations: DESTRUCTIVE,
      handler: async (args) => {
        const id = str(args.storyboard_id)
        requireBoard(id)
        return { deleted: deleteBoard(id) }
      },
    },

    // ─── Scenes ────────────────────────────────────────────────
    {
      name: 'create_scene',
      title: 'Create scene',
      description: 'Add a scene at the end of a storyboard. If the board has a style, its suffix is appended to the prompt.',
      inputSchema: {
        type: 'object',
        properties: {
          storyboard_id: { type: 'string' },
          description: { type: 'string', description: 'Narrative description of what happens (in the language the user is using)' },
          prompt: { type: 'string', description: 'Visual generation prompt in English (style suffix is auto-appended)' },
          aspect_ratio: { type: 'string', enum: SCENE_ASPECT_RATIOS, description: 'Default 1:1' },
          resolution: { type: 'string', enum: SCENE_RESOLUTIONS, description: 'Default 1K' },
        },
        required: ['storyboard_id'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => {
        const boardId = str(args.storyboard_id)
        requireBoard(boardId)
        const scene = createScene(boardId, {
          description: str(args.description),
          prompt: str(args.prompt),
          aspectRatio: str(args.aspect_ratio, '1:1'),
          resolution: str(args.resolution, '1K'),
        })
        return { scene }
      },
    },
    {
      name: 'create_scenes',
      title: 'Create scenes in bulk',
      description: 'Append multiple scenes at once from a script. Each scene needs a narrative description and a detailed visual prompt in English with camera/lens/lighting specs. The board style suffix is appended to each prompt.',
      inputSchema: {
        type: 'object',
        properties: {
          storyboard_id: { type: 'string' },
          scenes: {
            type: 'array',
            description: 'Scenes to create, in order',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                prompt: { type: 'string', description: 'Visual generation prompt in English' },
                aspect_ratio: { type: 'string', enum: SCENE_ASPECT_RATIOS, description: 'Default 1:1' },
                resolution: { type: 'string', enum: SCENE_RESOLUTIONS, description: 'Default 1K' },
              },
              required: ['description', 'prompt'],
            },
          },
        },
        required: ['storyboard_id', 'scenes'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => {
        const boardId = str(args.storyboard_id)
        requireBoard(boardId)
        const scenes = (args.scenes as any[]).map((s: any) =>
          createScene(boardId, {
            description: str(s?.description),
            prompt: str(s?.prompt),
            aspectRatio: str(s?.aspect_ratio, '1:1'),
            resolution: str(s?.resolution, '1K'),
          }),
        )
        return { created: scenes.length, scenes }
      },
    },
    {
      name: 'list_scenes',
      title: 'List scenes',
      description: 'List the scenes of a storyboard, in order, with their descriptions, prompts and image/video asset ids.',
      inputSchema: {
        type: 'object',
        properties: { storyboard_id: { type: 'string' } },
        required: ['storyboard_id'],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => ({ scenes: requireBoard(str(args.storyboard_id)).scenes }),
    },
    {
      name: 'update_scene',
      title: 'Update scene',
      description: "Update a scene's description, prompt, aspect ratio or resolution. The prompt is stored as given (the style suffix is not re-applied).",
      inputSchema: {
        type: 'object',
        properties: {
          scene_id: { type: 'string' },
          description: { type: 'string' },
          prompt: { type: 'string' },
          aspect_ratio: { type: 'string', enum: SCENE_ASPECT_RATIOS },
          resolution: { type: 'string', enum: SCENE_RESOLUTIONS },
        },
        required: ['scene_id'],
        additionalProperties: false,
      },
      annotations: EDIT,
      handler: async (args) => {
        const id = str(args.scene_id)
        requireScene(id)
        const data: any = {}
        if (args.description !== undefined) data.description = str(args.description)
        if (args.prompt !== undefined) data.prompt = str(args.prompt)
        if (args.aspect_ratio !== undefined) data.aspectRatio = str(args.aspect_ratio)
        if (args.resolution !== undefined) data.resolution = str(args.resolution)
        updateScene(id, data)
        return { scene: getScene(id) }
      },
    },
    {
      name: 'reorder_scenes',
      title: 'Reorder scenes',
      description: 'Set the order of a storyboard\'s scenes. Pass every scene id of the board, in the new order.',
      inputSchema: {
        type: 'object',
        properties: {
          storyboard_id: { type: 'string' },
          scene_ids: { type: 'array', items: { type: 'string' }, description: 'All scene ids of the board, in the desired order' },
        },
        required: ['storyboard_id', 'scene_ids'],
        additionalProperties: false,
      },
      annotations: EDIT,
      handler: async (args) => {
        const boardId = str(args.storyboard_id)
        const board = requireBoard(boardId)
        const current = new Set<string>(board.scenes.map((s: any) => s.id))
        const ids = (args.scene_ids as any[]).map(v => str(v))
        const unique = new Set(ids)
        if (unique.size !== ids.length || ids.length !== current.size || ids.some(id => !current.has(id))) {
          throw new ToolInputError(`scene_ids must list each of the board's ${current.size} scene ids exactly once`)
        }
        reorderScenes(boardId, ids)
        return { scenes: getBoard(boardId).scenes }
      },
    },
    {
      name: 'delete_scene',
      title: 'Delete scene',
      description: 'Permanently delete a scene and any transitions referencing it.',
      inputSchema: {
        type: 'object',
        properties: { scene_id: { type: 'string' } },
        required: ['scene_id'],
        additionalProperties: false,
      },
      annotations: DESTRUCTIVE,
      handler: async (args) => {
        const id = str(args.scene_id)
        requireScene(id)
        return { deleted: deleteScene(id) }
      },
    },

    // ─── Transitions ───────────────────────────────────────────
    {
      name: 'create_transition',
      title: 'Create transition',
      description: 'Create a transition between two scenes of the same storyboard.',
      inputSchema: {
        type: 'object',
        properties: {
          storyboard_id: { type: 'string' },
          from_scene_id: { type: 'string' },
          to_scene_id: { type: 'string' },
          duration: { type: 'number', minimum: 1, description: 'Seconds. Default 5' },
        },
        required: ['storyboard_id', 'from_scene_id', 'to_scene_id'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => {
        const boardId = str(args.storyboard_id)
        requireBoard(boardId)
        for (const key of ['from_scene_id', 'to_scene_id']) {
          const scene = requireScene(str(args[key]))
          if (scene.storyboardId !== boardId) throw new ToolInputError(`${key} '${args[key]}' belongs to another storyboard`)
        }
        return {
          transition: createTransition({
            storyboardId: boardId,
            fromSceneId: str(args.from_scene_id),
            toSceneId: str(args.to_scene_id),
            duration: num(args.duration, 5),
          }),
        }
      },
    },
    {
      name: 'delete_transition',
      title: 'Delete transition',
      description: 'Permanently delete a transition.',
      inputSchema: {
        type: 'object',
        properties: { transition_id: { type: 'string' } },
        required: ['transition_id'],
        additionalProperties: false,
      },
      annotations: DESTRUCTIVE,
      handler: async (args) => ({ deleted: deleteTransition(str(args.transition_id)) }),
    },

    // ─── Generation (async, paid) ──────────────────────────────
    {
      name: 'generate_scene_image',
      title: 'Generate scene image',
      description: 'Queue image generation for a scene (uses API credits). Returns a task id — poll get_task until completed or failed. The board style is applied to the prompt.',
      inputSchema: {
        type: 'object',
        properties: {
          scene_id: { type: 'string' },
          prompt: { type: 'string', description: 'Optional prompt override (style suffix auto-applied)' },
          model: { type: 'string', description: 'Default gpt-image-2-text-to-image. Available: ' + dynamicImageModels },
          aspect_ratio: { type: 'string', enum: SCENE_ASPECT_RATIOS, description: "Default: the scene's" },
          resolution: { type: 'string', enum: SCENE_RESOLUTIONS, description: "Default: the scene's" },
        },
        required: ['scene_id'],
        additionalProperties: false,
      },
      annotations: GENERATE,
      handler: async (args) => {
        requireScene(str(args.scene_id))
        return generateSceneImage(str(args.scene_id), {
          prompt: optStr(args.prompt),
          model: optStr(args.model),
          aspectRatio: optStr(args.aspect_ratio),
          resolution: optStr(args.resolution),
        })
      },
    },
    {
      name: 'generate_scene_video',
      title: 'Generate scene video',
      description: "Queue image-to-video generation for a scene from its current image (uses API credits; the scene must have an image — run generate_scene_image first). Returns a task id — poll get_task.",
      inputSchema: {
        type: 'object',
        properties: {
          scene_id: { type: 'string' },
          prompt: { type: 'string', description: 'Optional prompt override' },
          model: { type: 'string', description: 'Default kling-3.0/video. Available: ' + dynamicVideoModels },
          duration: { type: 'number', minimum: 1, description: 'Seconds. Default 5' },
        },
        required: ['scene_id'],
        additionalProperties: false,
      },
      annotations: GENERATE,
      handler: async (args) => {
        const scene = requireScene(str(args.scene_id))
        if (!scene.imageAssetId) {
          throw new ToolInputError(`Scene '${scene.id}' has no image yet — run generate_scene_image and wait for it to complete first`)
        }
        return generateSceneVideo(scene.id, {
          prompt: optStr(args.prompt),
          model: optStr(args.model),
          duration: num(args.duration, 5),
        })
      },
    },
    {
      name: 'generate_transition',
      title: 'Generate transition video',
      description: 'Queue a transition video between two scenes, from the first scene\'s image to the second\'s (uses API credits; both scenes should have images). Returns a task id — poll get_task.',
      inputSchema: {
        type: 'object',
        properties: {
          transition_id: { type: 'string' },
          prompt: { type: 'string', description: 'Default "Smooth cinematic transition"' },
          model: { type: 'string', description: 'Default pixverse-v6/image-to-video. Must support first + last frame, e.g. pixverse-v6/image-to-video, bytedance/seedance-2' },
          duration: { type: 'number', minimum: 1, description: "Seconds. Default: the transition's duration" },
        },
        required: ['transition_id'],
        additionalProperties: false,
      },
      annotations: GENERATE,
      handler: async (args) =>
        generateTransition(str(args.transition_id), {
          prompt: optStr(args.prompt),
          model: optStr(args.model),
          duration: args.duration !== undefined ? num(args.duration, 5) : undefined,
        }),
    },
    {
      name: 'get_task',
      title: 'Get task status',
      description: 'Get the status of a generation task: pending, running, completed, failed or cancelled. When completed, the result is linked to its scene/transition automatically; pass result_asset_id to get_asset for the file path.',
      inputSchema: {
        type: 'object',
        properties: { task_id: { type: 'string' } },
        required: ['task_id'],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => {
        const task = getTask(str(args.task_id))
        if (!task) throw new ToolInputError(`Task '${args.task_id}' not found`)
        return { task }
      },
    },

    // ─── Library & playground generations ──────────────────────
    ...getGenerationTools(),

    // ─── Content Studio, one approved stage at a time ──────────
    ...getContentStudioTools(),

    // ─── Workspaces ────────────────────────────────────────────
    ...getWorkspaceTools(),

    // ─── Prompt library (Openfield templates + the user's saved prompts) ─
    ...getPromptLibraryTools(),

    // ─── Timeline (montage editing, live in the Timeline page) ─
    ...getTimelineTools(),
    ...getLayoutTools(),

    // ─── Voice lines (ElevenLabs) ───────────────────────────────
    ...getVoiceTools(),
  ]
}

/**
 * Minimal JSON-schema check for tool arguments: required keys, unknown keys, primitive types
 * and enums. Enough to give the model a precise error instead of a confusing downstream failure.
 */
function validateArgs(schema: Record<string, any>, args: Record<string, any>): string | null {
  const props: Record<string, any> = schema.properties || {}
  for (const key of schema.required || []) {
    const v = args[key]
    if (v === undefined || v === null || v === '') return `Missing required argument '${key}'`
  }
  for (const [key, value] of Object.entries(args)) {
    const spec = props[key]
    if (!spec) {
      if (schema.additionalProperties === false) return `Unknown argument '${key}'. Allowed: ${Object.keys(props).join(', ') || '(none)'}`
      continue
    }
    if (value === undefined || value === null) continue
    const actual = Array.isArray(value) ? 'array' : typeof value
    if (spec.type === 'number' && (actual !== 'number' || !Number.isFinite(value))) return `Argument '${key}' must be a number`
    if (spec.type !== 'number' && spec.type && spec.type !== actual) return `Argument '${key}' must be of type ${spec.type}`
    if (spec.enum && !spec.enum.includes(value)) return `Argument '${key}' must be one of: ${spec.enum.join(', ')}`
    if (spec.type === 'number' && spec.minimum !== undefined && value < spec.minimum) return `Argument '${key}' must be >= ${spec.minimum}`
    if (spec.type === 'array') {
      if (spec.minItems && value.length < spec.minItems) return `Argument '${key}' needs at least ${spec.minItems} item(s)`
      if (spec.items?.type === 'object') {
        for (let i = 0; i < value.length; i++) {
          const item = value[i]
          if (!item || typeof item !== 'object' || Array.isArray(item)) return `${key}[${i}] must be an object`
          const err = validateArgs(spec.items, item)
          if (err) return `${key}[${i}]: ${err}`
        }
      } else if (spec.items?.type && value.some((v: any) => typeof v !== spec.items.type)) {
        return `Every item of '${key}' must be of type ${spec.items.type}`
      }
    }
  }
  return null
}

function toolResult(result: any) {
  if (result instanceof ToolContent) {
    return {
      content: result.content,
      ...(result.structured ? { structuredContent: result.structured } : {}),
      isError: false,
    }
  }
  const isObject = result !== null && typeof result === 'object' && !Array.isArray(result)
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    ...(isObject ? { structuredContent: result } : {}),
    isError: false,
  }
}

function toolError(message: string) {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  }
}

const RESOURCE_TEMPLATES = [
  { uriTemplate: 'endpoint://{service}/{endpoint}', name: 'Endpoint documentation', description: 'Docs, parameters and interfaces of a service endpoint', mimeType: 'application/json' },
  { uriTemplate: 'example://{service}/{endpoint}', name: 'Endpoint example', description: 'Code example / sample payload of a service endpoint', mimeType: 'text/typescript' },
  { uriTemplate: 'source://{service}/{endpoint}', name: 'Endpoint source', description: 'Implementation source of a service endpoint', mimeType: 'text/typescript' },
  { uriTemplate: 'models://{service}', name: 'Model catalog', description: 'Live model catalog of a service', mimeType: 'application/json' },
]

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export class McpBridgeServer {
  private server: http.Server | null = null
  private port: number = getBridgePort()
  private running = false

  getPort(): number {
    return this.port
  }

  isRunning(): boolean {
    return this.running
  }

  async start(portOverride?: number): Promise<void> {
    if (this.running) return
    this.port = portOverride && portOverride > 0 ? portOverride : getBridgePort()

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch(err => {
        console.warn('[MCP Bridge] Request failed:', err?.message)
        if (!res.headersSent) this.writeJson(res, 500, this.errorResponse(null, -32603, 'Internal error'))
        else res.end()
      })
    })

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(this.port, '127.0.0.1', () => {
        this.running = true
        console.log(`[MCP Bridge] listening on http://127.0.0.1:${this.port}/mcp`)
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.server) return
    const server = this.server
    this.server = null
    this.running = false
    await new Promise<void>(resolve => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
    console.log('[MCP Bridge] stopped')
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const origin = req.headers.origin
    const host = req.headers.host || ''

    // DNS rebinding / cross-site protection (required by the MCP Streamable HTTP transport)
    if (!LOOPBACK_HOST.test(host) || (origin !== undefined && !LOOPBACK_ORIGIN.test(origin))) {
      this.writeJson(res, 403, { error: 'Forbidden: the bridge only accepts local clients' })
      return
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID')
    }

    const url = (req.url || '/').split('?')[0]

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (url === '/mcp' && req.method !== 'POST') {
      // No server-initiated SSE stream and no sessions: the transport spec says answer 405
      res.writeHead(405, { Allow: 'POST, OPTIONS' })
      res.end()
      return
    }

    if (req.method === 'GET') {
      if (url === '/health' || url === '/') {
        this.writeJson(res, 200, {
          status: 'running',
          name: SERVER_NAME,
          version: SERVER_VERSION,
          port: this.port,
          mcpEndpoint: '/mcp',
          protocol: PROTOCOL_VERSION,
          supportedProtocols: SUPPORTED_PROTOCOL_VERSIONS,
          styles: STORYBOARD_STYLES.map(s => s.id),
        })
        return
      }
      this.writeJson(res, 404, { error: 'Not found' })
      return
    }

    if (req.method !== 'POST' || url !== '/mcp') {
      this.writeJson(res, 404, { error: 'Not found' })
      return
    }

    let body: string
    try {
      body = await this.readBody(req)
    } catch (err: any) {
      const status = err instanceof HttpError ? err.status : 400
      this.writeJson(res, status, this.errorResponse(null, -32600, err?.message || 'Could not read request body'))
      return
    }

    let request: any
    try {
      request = JSON.parse(body)
    } catch {
      this.writeJson(res, 400, this.errorResponse(null, -32700, 'Parse error'))
      return
    }

    if (Array.isArray(request)) {
      this.writeJson(res, 400, this.errorResponse(null, -32600, 'JSON-RPC batches are not supported'))
      return
    }

    // A client response (to a server request we never send) or a notification: acknowledge, no body
    const isResponse = request && typeof request === 'object' && request.method === undefined && ('result' in request || 'error' in request)
    if (isResponse) {
      res.writeHead(202)
      res.end()
      return
    }

    if (request?.jsonrpc !== '2.0' || typeof request?.method !== 'string') {
      this.writeJson(res, 400, this.errorResponse(request?.id ?? null, -32600, 'Invalid request'))
      return
    }

    if (request.id === undefined || request.id === null) {
      // notifications/initialized, notifications/cancelled, … need no reply
      res.writeHead(202)
      res.end()
      return
    }

    this.writeJson(res, 200, await this.dispatch(request))
  }

  private async dispatch(request: any): Promise<any> {
    const { method, params } = request
    const id = request.id
    const args = params && typeof params === 'object' && !Array.isArray(params) ? params : {}
    const ok = (result: any) => ({ jsonrpc: '2.0', id, result })

    try {
      switch (method) {
        case 'initialize': {
          const requested = str(args.protocolVersion)
          return ok({
            protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false },
              resources: { listChanged: false, subscribe: false },
            },
            serverInfo: { name: SERVER_NAME, title: 'Openfield Storyboard Bridge', version: SERVER_VERSION },
            instructions: [
              'This is the Openfield AI & Storyboard bridge.',
              'Workspaces: everything below (library, elements, storyboards, Content Studio) belongs to the active workspace. list_workspaces / get_workspace read them; create_workspace (activate: true to switch to it), update_workspace, set_active_workspace and delete_workspace (permanent, only when the user explicitly asks) manage them.',
              'Service introspection: list_services, list_endpoints, get_endpoint, get_endpoint_example and get_service_models read live capabilities, types and docs from the app.',
              'Resources: endpoint://<service>/<endpoint> (docs), example://<service>/<endpoint> (examples), source://<service>/<endpoint> (source), models://<service> (model catalogs).',
              'Storyboard flow: create_storyboard → create_scenes → generate_scene_image per scene → generate_scene_video (needs the scene image) → create_transition / generate_transition.',
              'Content Studio (short films, microdramas): use the content_studio_* tools, never generate/import_asset, so the piece is built by the app itself. Stages run in order — script → references → keyframes → voices (ElevenLabs) → videos → final — and each one only opens after the user approved the previous one (content_studio_approve_stage, called only on the user\'s explicit approval). Voices always precede videos: the audio is each video\'s lip-sync reference.',
              'PROMPT LIBRARY FIRST: before writing ANY image or video prompt (generate, storyboard scenes, edits), call search_prompt_library with the kind of piece (ads, character sheet, storyboard, UGC, product, editing…) and the model you will use, then open the best match with get_library_prompt. The templates are researched for visual quality and consistency per model family. Use it as a reference — fill its {{variables}} from the brand, product and request of the user, follow its guidance and rewrite whatever does not fit; never paste it unchanged when the brief differs. For a series (campaign, storyboard, recurring character) start from the character-sheet / consistency templates and repeat the same character and style description in every prompt. Prompts the user approved in review rank first; user-saved prompts (source workspace/global) reflect their own style. generate refuses its first call without a recent library check. When the user likes a result or asks to keep a prompt, save_library_prompt (with {{variables}}, models and types).',
              'Playground / library: list_assets and get_asset find generations and the references each one used; generate creates new images/videos with reference_asset_ids or reuse_references_from (e.g. "latest" = the previous generation); recreate_generation re-runs one with optional overrides; update_assets / delete_assets / import_asset manage the library.',
              'To let the user choose between options: generate with count: 4, then wait_for_tasks with preview: true shows the results numbered #1..#4; use the chosen asset id as a reference next. preview_assets shows any existing assets the same way.',
              'Timeline (video editing): build montages with the timeline_* tools, never through the UI. timeline_create (aspect 9:16 for vertical) → timeline_add_clips with library asset ids (start/in/out/duration in seconds; omitted start appends) → timeline_update_clip / timeline_split_clip / timeline_remove_clips → timeline_add_captions or timeline_autocaptions (estimate_only first: it spends credits) → timeline_export (job) + timeline_export_status. timeline_get shows every id and time; edits show live in the app Timeline page (timeline_open to bring it up for review or screen recording). There are no transitions.',
              'generate, recreate_generation and generate_* spend the user\'s API credits and are async: they return task ids; use wait_for_tasks (or poll get_task) until they complete or fail.',
            ].join('\n'),
          })
        }

        case 'ping':
          return ok({})

        case 'tools/list':
          return ok({
            tools: getTools().map(t => ({
              name: t.name,
              title: t.title,
              description: t.description,
              inputSchema: t.inputSchema,
              ...(t.annotations ? { annotations: { title: t.title, ...t.annotations } } : {}),
            })),
          })

        case 'tools/call': {
          const name = str(args.name)
          const toolArgs = args.arguments && typeof args.arguments === 'object' && !Array.isArray(args.arguments) ? args.arguments : {}
          const tool = getTools().find(t => t.name === name)
          if (!tool) {
            return this.errorResponse(id, -32602, `Unknown tool: ${name}`)
          }
          const invalid = validateArgs(tool.inputSchema, toolArgs)
          if (invalid) return ok(toolError(`${name}: ${invalid}`))
          try {
            return ok(toolResult(await tool.handler(toolArgs)))
          } catch (err: any) {
            if (!(err instanceof ToolInputError)) console.warn(`[MCP Bridge] Tool ${name} failed:`, err?.message)
            return ok(toolError(err?.message || String(err)))
          }
        }

        case 'resources/list': {
          const services = await listServices()
          const resources: any[] = []

          for (const s of services) {
            if (s.hasModels) {
              resources.push({
                uri: `models://${s.name}`,
                name: `${s.name}-models`,
                title: `${s.name.toUpperCase()} Models Catalog`,
                description: `Live list of supported models, pricing, and options for ${s.name}`,
                mimeType: 'application/json',
              })
            }

            for (const ep of s.endpoints) {
              const base = `${s.name}/${ep.endpoint}`
              resources.push(
                {
                  uri: `endpoint://${base}`,
                  name: `${base}-docs`,
                  title: `${base} Endpoint Documentation`,
                  description: ep.description || `Documentation, parameters, and interfaces for ${base}`,
                  mimeType: 'application/json',
                },
                {
                  uri: `example://${base}`,
                  name: `${base}-example`,
                  title: `${base} Usage Example`,
                  description: `Code example and payload for ${base}`,
                  mimeType: 'text/typescript',
                },
                {
                  uri: `source://${base}`,
                  name: `${base}-source`,
                  title: `${base} Source Code`,
                  description: `Implementation of ${base}`,
                  mimeType: 'text/typescript',
                },
              )
            }
          }

          return ok({ resources })
        }

        case 'resources/templates/list':
          return ok({ resourceTemplates: RESOURCE_TEMPLATES })

        case 'resources/read': {
          const uri = str(args.uri)
          if (!uri) return this.errorResponse(id, -32602, 'Missing uri parameter')

          const match = uri.match(/^(endpoint|example|source|models):\/\/([^/]+)(?:\/(.+))?$/)
          if (!match) return this.errorResponse(id, -32602, `Invalid resource URI: ${uri}`)
          const [, scheme, service, endpoint] = match
          const contents = (mimeType: string, text: string) => ok({ contents: [{ uri, mimeType, text }] })

          try {
            if (scheme === 'models') {
              const models = await getServiceModels(service)
              if (Array.isArray(models) && models.length === 0) {
                return this.errorResponse(id, -32002, `Resource not found: no model catalog for '${service}'`)
              }
              return contents('application/json', JSON.stringify(models, null, 2))
            }

            if (!endpoint) return this.errorResponse(id, -32602, `Endpoint required in URI: ${uri}`)

            const details = await getEndpointDetails(service, endpoint, scheme === 'source')
            if (scheme === 'endpoint') return contents('application/json', JSON.stringify(details, null, 2))
            if (scheme === 'example') return contents('text/typescript', details.example?.content || '// No example found')
            return contents('text/typescript', details.sourceCode || '// Source unavailable')
          } catch (err: any) {
            return this.errorResponse(id, -32002, err?.message || `Resource not found: ${uri}`)
          }
        }

        default:
          return this.errorResponse(id, -32601, `Method not found: ${method}`)
      }
    } catch (err: any) {
      return this.errorResponse(id, -32603, err?.message || 'Internal error')
    }
  }

  private errorResponse(id: any, code: number, message: string) {
    return { jsonrpc: '2.0', id, error: { code, message } }
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let size = 0
      let tooLarge = false
      req.on('data', (c: Buffer) => {
        if (tooLarge) return // keep draining so the 413 can still be written on this socket
        size += c.length
        if (size > MAX_BODY_BYTES) {
          tooLarge = true
          chunks.length = 0
          reject(new HttpError(413, `Request body exceeds ${MAX_BODY_BYTES} bytes`))
          return
        }
        chunks.push(c)
      })
      req.on('end', () => { if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8')) })
      req.on('error', reject)
    })
  }

  private writeJson(res: http.ServerResponse, status: number, data: any): void {
    const payload = JSON.stringify(data)
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    })
    res.end(payload)
  }
}

let instance: McpBridgeServer | null = null

export function getMcpBridge(): McpBridgeServer {
  if (!instance) instance = new McpBridgeServer()
  return instance
}
