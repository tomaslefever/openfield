import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import { app } from 'electron'

export interface EndpointSummary {
  service: string
  endpoint: string
  fileName: string
  filePath: string
  hasExample: boolean
  examplePath?: string
  description?: string
  exportedFunctions: string[]
}

export interface ServiceSummary {
  name: string
  directory: string
  hasEndpointsDir: boolean
  endpoints: EndpointSummary[]
  hasModels: boolean
  modelsCount?: number
  hasTypes: boolean
}

export interface EndpointDetails {
  service: string
  endpoint: string
  filePath: string
  description: string
  jsDoc: string
  exportedFunctions: Array<{
    name: string
    signature: string
    params: string[]
    returnType: string
  }>
  paramTypes?: Record<string, string>
  relevantInterfaces?: Array<{
    name: string
    code: string
  }>
  associatedModels?: any[]
  example?: {
    type: 'file' | 'jsdoc' | 'synthesized'
    content: string
    filePath?: string
  }
  sourceCode?: string
}

// Service/endpoint names come straight from MCP clients and end up in filesystem paths.
const SAFE_NAME = /^[a-z0-9][a-z0-9_.-]*$/i

function assertSafeName(kind: string, value: string): void {
  if (!SAFE_NAME.test(value) || value.includes('..')) {
    throw new Error(`Invalid ${kind} name: '${value}'`)
  }
}

/**
 * Packaged builds only ship the tsc output (dist/main/services/*.js), so every source lookup
 * accepts the compiled .js file when the .ts one is not there. tsc keeps JSDoc comments.
 */
function resolveSourceFile(dir: string, baseName: string): string | null {
  for (const ext of ['.ts', '.js']) {
    const p = path.join(dir, baseName + ext)
    if (fs.existsSync(p)) return p
  }
  return null
}

const isEndpointFile = (f: string) =>
  /\.(ts|js)$/.test(f) && !/\.example\.(ts|js)$/.test(f) && !f.endsWith('.d.ts')

/**
 * Resolves the root directory where service source code lives.
 * Prioritizes `src/main/services` so comments, TypeScript types, and JSDoc are preserved.
 */
export function getServicesDir(): string {
  const candidates: string[] = []

  try {
    if (typeof app?.getAppPath === 'function') {
      candidates.push(path.join(app.getAppPath(), 'src', 'main', 'services'))
    }
  } catch {}

  candidates.push(
    path.join(process.cwd(), 'src', 'main', 'services'),
    path.resolve(__dirname, '../../src/main/services'),
    path.resolve(__dirname, '..')
  )

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate
    }
  }

  return path.resolve(__dirname, '..')
}

/**
 * Exported functions of a source file. TypeScript sources use `export function`; the compiled
 * CommonJS output of packaged builds declares a plain function and assigns `exports.name = name`.
 */
function extractExportedFunctions(source: string): EndpointDetails['exportedFunctions'] {
  const toEntry = (name: string, rawParams: string, returnType: string) => {
    const paramsStr = rawParams.trim()
    return {
      name,
      signature: `${name}(${paramsStr}): ${returnType}`,
      params: paramsStr ? paramsStr.split(',').map(p => p.trim()).filter(Boolean) : [],
      returnType,
    }
  }

  const fns: EndpointDetails['exportedFunctions'] = []
  const tsRegex = /export\s+(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)(?::\s*([^{]+))?/g
  for (const m of source.matchAll(tsRegex)) {
    fns.push(toEntry(m[1], m[2], (m[3] || 'void').trim()))
  }
  if (fns.length > 0) return fns

  for (const m of source.matchAll(/exports\.([a-zA-Z0-9_]+)\s*=\s*\1;/g)) {
    const decl = source.match(new RegExp(`function\\s+${m[1]}\\s*\\(([^)]*)\\)`))
    fns.push(toEntry(m[1], decl?.[1] || '', 'unknown'))
  }
  return fns
}

/**
 * Discovers all services and their endpoints dynamically from the filesystem.
 */
export async function listServices(): Promise<ServiceSummary[]> {
  const servicesDir = getServicesDir()
  const entries = await fsp.readdir(servicesDir, { withFileTypes: true })
  const services: ServiceSummary[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const serviceName = entry.name
    if (serviceName === 'mcp') continue // Skip MCP itself

    const servicePath = path.join(servicesDir, serviceName)
    const endpointsDir = path.join(servicePath, 'endpoints')
    const hasEndpointsDir = fs.existsSync(endpointsDir)
    const hasModels = Boolean(resolveSourceFile(servicePath, 'models') || resolveSourceFile(servicePath, 'catalog'))
    const hasTypes = Boolean(resolveSourceFile(servicePath, 'types'))

    let endpoints: EndpointSummary[] = []

    if (hasEndpointsDir) {
      endpoints = await scanEndpointsDir(serviceName, endpointsDir)
    }

    // Check models count if available
    let modelsCount = 0
    if (hasModels) {
      try {
        const models = await getServiceModels(serviceName)
        modelsCount = Array.isArray(models) ? models.length : (models?.total || 0)
      } catch {}
    }

    services.push({
      name: serviceName,
      directory: servicePath,
      hasEndpointsDir,
      endpoints,
      hasModels,
      modelsCount,
      hasTypes,
    })
  }

  // Also include storyboard if present as a service
  const storyboardFile = resolveSourceFile(servicesDir, 'storyboard-service')
  if (storyboardFile) {
    services.push({
      name: 'storyboard',
      directory: servicesDir,
      hasEndpointsDir: false,
      endpoints: [
        {
          service: 'storyboard',
          endpoint: 'storyboard-service',
          fileName: path.basename(storyboardFile),
          filePath: storyboardFile,
          hasExample: fs.existsSync(path.join(servicesDir, '..', '..', '..', 'docs', 'STORYBOARD_API.md')),
          examplePath: path.join(servicesDir, '..', '..', '..', 'docs', 'STORYBOARD_API.md'),
          description: 'Storyboard management, scene sequencing, video generation, and transition queues',
          exportedFunctions: [
            'listBoards', 'getBoard', 'createBoard', 'updateBoard', 'deleteBoard',
            'createScene', 'updateScene', 'deleteScene', 'getScene', 'reorderScenes',
            'createTransition', 'getTransition', 'deleteTransition', 'updateTransition',
            'generateSceneImage', 'generateSceneVideo', 'generateTransition', 'getTask'
          ],
        }
      ],
      hasModels: false,
      hasTypes: false,
    })
  }

  return services
}

/**
 * Scans an endpoints directory for TypeScript files and their examples.
 */
async function scanEndpointsDir(serviceName: string, endpointsDir: string): Promise<EndpointSummary[]> {
  const files = await fsp.readdir(endpointsDir)
  const summaries: EndpointSummary[] = []

  // One entry per endpoint even when both .ts and compiled .js are present (.ts wins)
  const byName = new Map<string, string>()
  for (const f of files.filter(isEndpointFile)) {
    const name = f.replace(/\.(ts|js)$/, '')
    if (!byName.has(name) || f.endsWith('.ts')) byName.set(name, f)
  }

  for (const [endpointName, file] of byName) {
    const filePath = path.join(endpointsDir, file)
    const exampleFile = [`${endpointName}.example.ts`, `${endpointName}.example.json`, `${endpointName}.example.js`]
      .find(f => files.includes(f))
    const examplePath = exampleFile ? path.join(endpointsDir, exampleFile) : undefined

    let description = ''
    const exportedFunctions: string[] = []

    try {
      const content = await fsp.readFile(filePath, 'utf8')
      const docMatch = content.match(/\/\*\*([\s\S]*?)\*\//)
      if (docMatch) {
        description = docMatch[1]
          .split('\n')
          .map(line => line.replace(/^\s*\*\s?/, '').trim())
          .filter(Boolean)
          .join(' ')
      }

      exportedFunctions.push(...extractExportedFunctions(content).map(f => f.name))
    } catch {}

    summaries.push({
      service: serviceName,
      endpoint: endpointName,
      fileName: file,
      filePath,
      hasExample: Boolean(examplePath),
      examplePath,
      description,
      exportedFunctions,
    })
  }

  return summaries
}

/**
 * Reads and parses an endpoint in real-time, returning live documentation,
 * types, models, examples, and optionally the source code.
 */
export async function getEndpointDetails(
  serviceName: string,
  endpointName: string,
  includeSource = false
): Promise<EndpointDetails> {
  assertSafeName('service', serviceName)
  assertSafeName('endpoint', endpointName)

  const servicesDir = getServicesDir()
  let endpointPath: string | null
  let servicePath: string

  if (serviceName === 'storyboard') {
    servicePath = servicesDir
    endpointPath = resolveSourceFile(servicesDir, 'storyboard-service')
  } else {
    servicePath = path.join(servicesDir, serviceName)
    endpointPath = resolveSourceFile(path.join(servicePath, 'endpoints'), endpointName)
  }

  if (!endpointPath) {
    throw new Error(`Endpoint '${endpointName}' not found in service '${serviceName}'. Use list_endpoints to see the available ones.`)
  }

  // Read the endpoint source code fresh from disk
  const sourceCode = await fsp.readFile(endpointPath, 'utf8')

  // Extract main JSDoc comment
  let description = ''
  let jsDoc = ''
  const jsDocMatches = sourceCode.match(/\/\*\*([\s\S]*?)\*\//g)
  if (jsDocMatches && jsDocMatches.length > 0) {
    jsDoc = jsDocMatches[0]
    description = jsDocMatches[0]
      .replace(/\/\*\*|\*\//g, '')
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .filter(l => l && !l.startsWith('@'))
      .join(' ')
  }

  // Extract exported functions with signatures and params
  const exportedFunctions = extractExportedFunctions(sourceCode)

  // Extract relevant types from service types.ts
  const relevantInterfaces: Array<{ name: string; code: string }> = []
  const typesPath = resolveSourceFile(servicePath, 'types')
  if (typesPath) {
    try {
      const typesSource = await fsp.readFile(typesPath, 'utf8')
      const interfaceMatches = typesSource.matchAll(/export\s+(?:interface|type)\s+([a-zA-Z0-9_]+)[\s\S]*?(?=\nexport|\n\/\*\*|$)/g)
      for (const im of interfaceMatches) {
        const typeName = im[1]
        // If type is referenced in the endpoint file
        if (sourceCode.includes(typeName)) {
          relevantInterfaces.push({
            name: typeName,
            code: im[0].trim(),
          })
        }
      }
    } catch {}
  }

  // Extract associated models if applicable
  let associatedModels: any[] = []
  try {
    associatedModels = await getServiceModels(serviceName, endpointName)
  } catch {}

  // Check for examples
  let example: EndpointDetails['example'] | undefined

  // 1. Check for adjacent .example.ts / .example.json (or compiled .example.js) file
  const examplePath = ['.example.ts', '.example.json', '.example.js']
    .map(ext => path.join(path.dirname(endpointPath!), endpointName + ext))
    .find(p => fs.existsSync(p))

  if (examplePath) {
    example = {
      type: 'file',
      content: await fsp.readFile(examplePath, 'utf8'),
      filePath: examplePath,
    }
  } else {
    // 2. Check for @example in JSDoc
    const exampleTagMatch = sourceCode.match(/@example([\s\S]*?)(?=(?:\s*\*\s*@|\*\/))/i)
    if (exampleTagMatch) {
      const cleanedExample = exampleTagMatch[1]
        .split('\n')
        .map(l => l.replace(/^\s*\*\s?/, ''))
        .join('\n')
        .trim()
      example = {
        type: 'jsdoc',
        content: cleanedExample,
      }
    } else {
      // 3. Synthesize a practical example
      example = {
        type: 'synthesized',
        content: synthesizeEndpointExample(serviceName, endpointName, exportedFunctions, relevantInterfaces, associatedModels),
      }
    }
  }

  return {
    service: serviceName,
    endpoint: endpointName,
    filePath: endpointPath,
    description: description || `Endpoint '${endpointName}' in service '${serviceName}'`,
    jsDoc,
    exportedFunctions,
    relevantInterfaces,
    associatedModels,
    example,
    sourceCode: includeSource ? sourceCode : undefined,
  }
}

/**
 * Retrieves the live models or catalog for a service.
 */
const MEDIA_TYPES = ['image', 'video', 'audio'] as const
type MediaType = typeof MEDIA_TYPES[number]

/** Media type of a catalog entry: explicit `type`, or inferred from MachGen-style task codes. */
function modelMediaType(m: any): MediaType | undefined {
  if (MEDIA_TYPES.includes(m?.type)) return m.type
  const tasks: string[] = Array.isArray(m?.supportedTasks) ? m.supportedTasks : []
  if (tasks.some(t => /^(T2V|I2V|R2V|FFLF|EXTEND)$/.test(t))) return 'video'
  if (tasks.some(t => /^(T2I|I2I)$/.test(t))) return 'image'
  if (tasks.some(t => /^(T2S|T2D|T2SFX|T2M)$/.test(t))) return 'audio'
  return undefined
}

// Catalogs are imported as modules (not read from disk) so they also work in packaged builds,
// where only the compiled .js ships and the existence checks on .ts files would always fail.
const CATALOG_LOADERS: Record<string, () => Promise<any[]>> = {
  fal: async () => (await import('../fal/catalog')).FAL_MODELS || [],
  replicate: async () => (await import('../replicate/catalog')).REPLICATE_MODELS || [],
  machgen: async () => (await import('../machgen/catalog')).MACHGEN_MODELS || [],
  apimart: async () => (await import('../apimart/catalog')).APIMART_MODELS || [],
  klingai: async () => (await import('../kling/catalog')).KLING_MODELS || [],
}

/**
 * Retrieves the live models or catalog for a service. `typeFilter` narrows to image/video/audio;
 * any other value (e.g. an endpoint name like "predictions") is ignored.
 */
export async function getServiceModels(serviceName: string, typeFilter?: string): Promise<any> {
  const filter = MEDIA_TYPES.find(t => t === typeFilter)

  if (serviceName === 'kie') {
    const kieModels = await import('../kie/models')
    const byType: Record<MediaType, readonly any[]> = {
      image: kieModels.IMAGE_MODELS || [],
      video: kieModels.VIDEO_MODELS || [],
      audio: kieModels.AUDIO_MODELS || [],
    }
    if (filter) return byType[filter]
    return {
      ...byType,
      total: byType.image.length + byType.video.length + byType.audio.length,
    }
  }

  const loader = CATALOG_LOADERS[serviceName]
  if (!loader) return []
  const models = await loader()
  return filter ? models.filter(m => modelMediaType(m) === filter) : models
}

/**
 * Synthesizes a practical usage example when no explicit example file or @example tag exists.
 */
function synthesizeEndpointExample(
  serviceName: string,
  endpointName: string,
  exportedFunctions: EndpointDetails['exportedFunctions'],
  relevantInterfaces: EndpointDetails['relevantInterfaces'],
  associatedModels: any
): string {
  const fn = exportedFunctions[0]?.name || endpointName
  const modelSample = Array.isArray(associatedModels) && associatedModels.length > 0
    ? associatedModels[0]?.id || 'default-model'
    : 'default-model'

  let payloadExample = '{\n  prompt: "A cinematic 4k shot",\n  model: "' + modelSample + '"\n}'
  if (relevantInterfaces && relevantInterfaces.length > 0) {
    const primaryInterface = relevantInterfaces[0]
    payloadExample = `// Conforms to ${primaryInterface.name}\n${payloadExample}`
  }

  return `// Example usage for ${serviceName} / ${endpointName}
import { ${fn} } from './endpoints/${endpointName}'

const params = ${payloadExample}

// Invoke endpoint
const result = await ${fn}(client, params)
console.log('Result:', result)
`
}
