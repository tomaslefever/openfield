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
  createTransition,
  deleteTransition,
  generateSceneImage,
  generateSceneVideo,
  generateTransition,
  getTask,
} from '../storyboard-service'

const PROTOCOL_VERSION = '2025-06-18'
const SERVER_NAME = 'openfield-storyboard-bridge'
const SERVER_VERSION = '0.1.0'

interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, any>
  handler: (args: any) => Promise<any>
}

function str(v: any, def = ''): string {
  return typeof v === 'string' ? v : def
}
function num(v: any, def = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : def
}

const TOOLS: McpTool[] = [
  {
    name: 'list_styles',
    description: 'List the visual styles available for storyboards: 3d-animation, realistic, charcoal, claymation, concept-sketch, anime, or a custom free-text style. Each style has a suffix that is automatically appended to scene prompts.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => ({
      styles: STORYBOARD_STYLES.map(s => ({ id: s.id, name: s.name, description: s.description, suffix: s.suffix })),
      custom: 'Any free-text style description is also accepted (e.g. "watercolor, soft pastels").',
    }),
  },
  {
    name: 'list_storyboards',
    description: 'List all storyboards with scene count and thumbnail path.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => ({ storyboards: listBoards() }),
  },
  {
    name: 'create_storyboard',
    description: 'Create a new storyboard. Optionally set its visual style (one of the preset ids from list_styles, or a custom free-text style). The style is stored on the board and automatically injected as a suffix into scene prompts.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Storyboard name' },
        style: { type: 'string', description: 'Style id (3d-animation, realistic, charcoal, claymation, concept-sketch, anime) or a custom style description' },
      },
      additionalProperties: false,
    },
    handler: async (args) => createBoard(str(args.name, 'Untitled Storyboard'), str(args.style)),
  },
  {
    name: 'get_storyboard',
    description: 'Get a storyboard with all its scenes (ordered) and transitions.',
    inputSchema: {
      type: 'object',
      properties: { storyboard_id: { type: 'string', description: 'Storyboard id' } },
      required: ['storyboard_id'],
      additionalProperties: false,
    },
    handler: async (args) => getBoard(str(args.storyboard_id)),
  },
  {
    name: 'update_storyboard',
    description: 'Update a storyboard name and/or style.',
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
    handler: async (args) => {
      const settings: any = {}
      if (args.name !== undefined) settings.name = str(args.name)
      if (args.style !== undefined) settings.style = str(args.style)
      updateBoard(str(args.storyboard_id), settings)
      return getBoard(str(args.storyboard_id))
    },
  },
  {
    name: 'delete_storyboard',
    description: 'Delete a storyboard and all its scenes and transitions.',
    inputSchema: {
      type: 'object',
      properties: { storyboard_id: { type: 'string' } },
      required: ['storyboard_id'],
      additionalProperties: false,
    },
    handler: async (args) => ({ deleted: deleteBoard(str(args.storyboard_id)) }),
  },
  {
    name: 'create_scene',
    description: 'Add a scene to a storyboard. If the board has a style, the style suffix is automatically appended to the prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        storyboard_id: { type: 'string' },
        description: { type: 'string', description: 'Narrative description of what happens (in the language the user is using)' },
        prompt: { type: 'string', description: 'Visual generation prompt in English (style suffix is auto-appended)' },
        aspect_ratio: { type: 'string', description: 'Aspect ratio (16:9, 9:16, 4:3, 1:1, 21:9). Default 1:1' },
        resolution: { type: 'string', description: 'Resolution (1K, 2K, 4K). Default 1K' },
      },
      required: ['storyboard_id'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const scene = createScene(str(args.storyboard_id), {
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
    description: 'Create multiple scenes at once from a script. Each scene needs a narrative description and a detailed visual prompt in English with technical camera/lens/lighting specs. The board style suffix is auto-appended to each prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        storyboard_id: { type: 'string' },
        scenes: {
          type: 'array',
          description: 'Scenes to create',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              prompt: { type: 'string', description: 'Visual generation prompt in English' },
            },
            required: ['description', 'prompt'],
          },
        },
      },
      required: ['storyboard_id', 'scenes'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const scenes = (Array.isArray(args.scenes) ? args.scenes : []).map((s: any) =>
        createScene(str(args.storyboard_id), { description: str(s.description), prompt: str(s.prompt) }),
      )
      return { created: scenes.length, scenes }
    },
  },
  {
    name: 'list_scenes',
    description: 'List the scenes of a storyboard with their descriptions and prompts.',
    inputSchema: {
      type: 'object',
      properties: { storyboard_id: { type: 'string' } },
      required: ['storyboard_id'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const board = getBoard(str(args.storyboard_id))
      return { scenes: board.scenes }
    },
  },
  {
    name: 'update_scene',
    description: "Update a scene's description, prompt, aspect ratio or resolution.",
    inputSchema: {
      type: 'object',
      properties: {
        scene_id: { type: 'string' },
        description: { type: 'string' },
        prompt: { type: 'string' },
        aspect_ratio: { type: 'string' },
        resolution: { type: 'string' },
      },
      required: ['scene_id'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const data: any = {}
      if (args.description !== undefined) data.description = str(args.description)
      if (args.prompt !== undefined) data.prompt = str(args.prompt)
      if (args.aspect_ratio !== undefined) data.aspectRatio = str(args.aspect_ratio)
      if (args.resolution !== undefined) data.resolution = str(args.resolution)
      updateScene(str(args.scene_id), data)
      return { scene: getScene(str(args.scene_id)) }
    },
  },
  {
    name: 'delete_scene',
    description: 'Delete a scene and any transitions referencing it.',
    inputSchema: {
      type: 'object',
      properties: { scene_id: { type: 'string' } },
      required: ['scene_id'],
      additionalProperties: false,
    },
    handler: async (args) => ({ deleted: deleteScene(str(args.scene_id)) }),
  },
  {
    name: 'create_transition',
    description: 'Create a transition between two scenes of a storyboard.',
    inputSchema: {
      type: 'object',
      properties: {
        storyboard_id: { type: 'string' },
        from_scene_id: { type: 'string' },
        to_scene_id: { type: 'string' },
        duration: { type: 'number', description: 'Seconds. Default 5' },
      },
      required: ['storyboard_id', 'from_scene_id', 'to_scene_id'],
      additionalProperties: false,
    },
    handler: async (args) => ({
      transition: createTransition({
        storyboardId: str(args.storyboard_id),
        fromSceneId: str(args.from_scene_id),
        toSceneId: str(args.to_scene_id),
        duration: num(args.duration, 5),
      }),
    }),
  },
  {
    name: 'delete_transition',
    description: 'Delete a transition.',
    inputSchema: {
      type: 'object',
      properties: { transition_id: { type: 'string' } },
      required: ['transition_id'],
      additionalProperties: false,
    },
    handler: async (args) => ({ deleted: deleteTransition(str(args.transition_id)) }),
  },
  {
    name: 'generate_scene_image',
    description: 'Queue image generation for a scene. Returns a task id — poll get_task for the status. The board style is auto-applied to the prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        scene_id: { type: 'string' },
        prompt: { type: 'string', description: 'Optional prompt override (style suffix auto-applied)' },
        model: { type: 'string', description: 'e.g. gpt-image-2-text-to-image, nano-banana-2, seedream-5-pro-text-to-image, flux2-pro-text-to-image, grok-imagine/text-to-image, imagen4-fast' },
        aspect_ratio: { type: 'string' },
        resolution: { type: 'string' },
      },
      required: ['scene_id'],
      additionalProperties: false,
    },
    handler: async (args) =>
      generateSceneImage(str(args.scene_id), {
        prompt: args.prompt !== undefined ? str(args.prompt) : undefined,
        model: str(args.model),
        aspectRatio: str(args.aspect_ratio),
        resolution: str(args.resolution),
      }),
  },
  {
    name: 'generate_scene_video',
    description: 'Queue image-to-video generation for a scene (requires the scene to have an image). Returns a task id — poll get_task for the status.',
    inputSchema: {
      type: 'object',
      properties: {
        scene_id: { type: 'string' },
        prompt: { type: 'string', description: 'Optional prompt override' },
        model: { type: 'string', description: 'e.g. kling-3.0/video, kling/v25-turbo-image-to-video-pro, seedance-2, pixverse-v6/image-to-video, wan-2-7-image-to-video' },
        duration: { type: 'number', description: 'Seconds. Default 5' },
      },
      required: ['scene_id'],
      additionalProperties: false,
    },
    handler: async (args) =>
      generateSceneVideo(str(args.scene_id), {
        prompt: args.prompt !== undefined ? str(args.prompt) : undefined,
        model: str(args.model),
        duration: num(args.duration, 5),
      }),
  },
  {
    name: 'generate_transition',
    description: 'Queue a transition video between two scenes (first frame to last frame). Returns a task id — poll get_task for the status.',
    inputSchema: {
      type: 'object',
      properties: {
        transition_id: { type: 'string' },
        prompt: { type: 'string' },
        model: { type: 'string', description: 'e.g. pixverse-v6/image-to-video, bytedance/seedance-2' },
        duration: { type: 'number' },
      },
      required: ['transition_id'],
      additionalProperties: false,
    },
    handler: async (args) =>
      generateTransition(str(args.transition_id), {
        prompt: str(args.prompt),
        model: str(args.model),
        duration: num(args.duration, 5),
      }),
  },
  {
    name: 'get_task',
    description: 'Get the status of a generation task. Statuses: pending, running, completed, failed, cancelled. When completed, result_asset_id can be fetched via assets (not exposed yet) — the UI shows the result automatically.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const task = getTask(str(args.task_id))
      if (!task) return { error: 'Task not found', taskId: str(args.task_id) }
      return { task }
    },
  },
]

function toolResult(result: any) {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    isError: false,
  }
}

function toolError(message: string) {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  }
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

  async start(): Promise<void> {
    if (this.running) return
    this.port = getBridgePort()

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res)
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
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Origin')

    const url = req.url || '/'

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
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

    const body = await this.readBody(req)

    let request: any
    try {
      request = JSON.parse(body)
    } catch {
      this.writeJson(res, 400, this.errorResponse(null, -32700, 'Parse error'))
      return
    }

    if (request?.jsonrpc !== '2.0' || typeof request?.method !== 'string') {
      this.writeJson(res, 400, this.errorResponse(request?.id ?? null, -32600, 'Invalid request'))
      return
    }

    const isNotification = request.id === undefined || request.id === null
    const response = await this.dispatch(request)

    if (isNotification) {
      res.writeHead(202, { 'Content-Type': 'application/json' })
      res.end()
      return
    }

    this.writeJson(res, 200, response)
  }

  private async dispatch(request: any): Promise<any> {
    const { method, params } = request
    const id = request.id ?? null
    const args = (params && typeof params === 'object' && !Array.isArray(params) ? params : {}) || {}

    // Notifications don't get a response
    if (id === null) {
      try {
        switch (method) {
          case 'notifications/initialized':
          case 'notifications/cancelled':
            return null
          default:
            return null
        }
      } catch { return null }
    }

    try {
      switch (method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
              instructions: [
                'This is the Openfield storyboard bridge. Use list_styles to see available visual styles.',
                'Scenes are created with a description (narrative, in the user language) and a prompt (visual, in English).',
                'The board style is automatically appended to scene prompts.',
                'Generation tools (generate_scene_image, generate_scene_video, generate_transition) are async: they return a task id and you must poll get_task until status is completed or failed.',
                'A storyboard_id is a UUID. Use list_storyboards to discover ids. Scene ids come from get_storyboard.',
              ].join('\n'),
            },
          }

        case 'notifications/initialized':
        case 'notifications/cancelled':
          return { jsonrpc: '2.0', id, result: {} }

        case 'ping':
          return { jsonrpc: '2.0', id, result: {} }

        case 'tools/list': {
          const tools = TOOLS.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          }))
          return { jsonrpc: '2.0', id, result: { tools } }
        }

        case 'tools/call': {
          const name = str(args.name)
          const toolArgs = (args.arguments && typeof args.arguments === 'object' ? args.arguments : {}) || {}
          const tool = TOOLS.find(t => t.name === name)
          if (!tool) {
            return {
              jsonrpc: '2.0',
              id,
              result: toolError(`Unknown tool: ${name}`),
            }
          }
          try {
            const result = await tool.handler(toolArgs)
            return { jsonrpc: '2.0', id, result: toolResult(result) }
          } catch (err: any) {
            return { jsonrpc: '2.0', id, result: toolError(err?.message || String(err)) }
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
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  private writeJson(res: http.ServerResponse, status: number, data: any): void {
    const payload = JSON.stringify(data)
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Access-Control-Allow-Origin': '*',
    })
    res.end(payload)
  }
}

let instance: McpBridgeServer | null = null

export function getMcpBridge(): McpBridgeServer {
  if (!instance) instance = new McpBridgeServer()
  return instance
}
