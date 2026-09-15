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
    const hasModels = fs.existsSync(path.join(servicePath, 'models.ts')) || fs.existsSync(path.join(servicePath, 'catalog.ts'))
    const hasTypes = fs.existsSync(path.join(servicePath, 'types.ts'))

    let endpoints: EndpointSummary[] = []

    if (hasEndpointsDir) {
      endpoints = await scanEndpointsDir(serviceName, endpointsDir)
    }

    // Check models count if available
    let modelsCount = 0
    if (hasModels) {
      try {
        const models = await getServiceModels(serviceName)
        modelsCount = Array.isArray(models) ? models.length : (models?.models?.length || 0)
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
  const storyboardFile = path.join(servicesDir, 'storyboard-service.ts')
  if (fs.existsSync(storyboardFile)) {
    services.push({
      name: 'storyboard',
      directory: servicesDir,
      hasEndpointsDir: false,
      endpoints: [
        {
          service: 'storyboard',
          endpoint: 'storyboard-service',
          fileName: 'storyboard-service.ts',
          filePath: storyboardFile,
          hasExample: fs.existsSync(path.join(servicesDir, '..', '..', '..', 'docs', 'STORYBOARD_API.md')),
          examplePath: path.join(servicesDir, '..', '..', '..', 'docs', 'STORYBOARD_API.md'),
          description: 'Storyboard management, scene sequencing, video generation, and transition queues',
          exportedFunctions: [
            'listBoards', 'getBoard', 'createBoard', 'updateBoard', 'deleteBoard',
            'createScene', 'updateScene', 'deleteScene', 'getScene',
            'createTransition', 'deleteTransition', 'updateTransition',
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

  const endpointFiles = files.filter(f => f.endsWith('.ts') && !f.endsWith('.example.ts') && !f.endsWith('.d.ts'))

  for (const file of endpointFiles) {
    const endpointName = file.replace(/\.ts$/, '')
    const filePath = path.join(endpointsDir, file)
    const exampleFile = `${endpointName}.example.ts`
    const exampleJson = `${endpointName}.example.json`
    const hasExampleFile = files.includes(exampleFile)
    const hasExampleJson = files.includes(exampleJson)
    const examplePath = hasExampleFile
      ? path.join(endpointsDir, exampleFile)
      : hasExampleJson
      ? path.join(endpointsDir, exampleJson)
      : undefined

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

      const fnMatches = content.matchAll(/export\s+(?:async\s+)?function\s+([a-zA-Z0-9_]+)/g)
      for (const m of fnMatches) {
        exportedFunctions.push(m[1])
      }
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
  const servicesDir = getServicesDir()
  let endpointPath: string
  let servicePath: string

  if (serviceName === 'storyboard') {
    servicePath = servicesDir
    endpointPath = path.join(servicesDir, 'storyboard-service.ts')
  } else {
    servicePath = path.join(servicesDir, serviceName)
    endpointPath = path.join(servicePath, 'endpoints', `${endpointName}.ts`)
  }

  if (!fs.existsSync(endpointPath)) {
    throw new Error(`Endpoint '${endpointName}' in service '${serviceName}' not found at ${endpointPath}`)
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
  const exportedFunctions: EndpointDetails['exportedFunctions'] = []
  const fnRegex = /export\s+(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)(?::\s*([^\{]+))?/g
  let fnMatch: RegExpExecArray | null
  while ((fnMatch = fnRegex.exec(sourceCode)) !== null) {
    const fnName = fnMatch[1]
    const rawParams = fnMatch[2].trim()
    const returnType = (fnMatch[3] || 'void').trim()
    const params = rawParams
      ? rawParams.split(',').map(p => p.trim()).filter(Boolean)
      : []

    exportedFunctions.push({
      name: fnName,
      signature: `${fnName}(${rawParams}): ${returnType}`,
      params,
      returnType,
    })
  }

  // Extract relevant types from service types.ts
  const relevantInterfaces: Array<{ name: string; code: string }> = []
  const typesPath = path.join(servicePath, 'types.ts')
  if (fs.existsSync(typesPath)) {
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

  // 1. Check for adjacent .example.ts or .example.json file
  const exampleTsPath = path.join(path.dirname(endpointPath), `${endpointName}.example.ts`)
  const exampleJsonPath = path.join(path.dirname(endpointPath), `${endpointName}.example.json`)

  if (fs.existsSync(exampleTsPath)) {
    const exampleContent = await fsp.readFile(exampleTsPath, 'utf8')
    example = {
      type: 'file',
      content: exampleContent,
      filePath: exampleTsPath,
    }
  } else if (fs.existsSync(exampleJsonPath)) {
    const exampleContent = await fsp.readFile(exampleJsonPath, 'utf8')
    example = {
      type: 'file',
      content: exampleContent,
      filePath: exampleJsonPath,
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
export async function getServiceModels(serviceName: string, endpointFilter?: string): Promise<any> {
  const servicesDir = getServicesDir()
  const servicePath = path.join(servicesDir, serviceName)

  if (serviceName === 'kie') {
    const modelsPath = path.join(servicePath, 'models.ts')
    if (fs.existsSync(modelsPath)) {
      try {
        // Dynamically require/import or parse the models
        const kieModels = await import('../kie/models')
        const imageModels = kieModels.IMAGE_MODELS || []
        const videoModels = kieModels.VIDEO_MODELS || []
        const audioModels = kieModels.AUDIO_MODELS || []

        if (endpointFilter === 'video') return videoModels
        if (endpointFilter === 'image') return imageModels
        if (endpointFilter === 'audio') return audioModels

        return {
          image: imageModels,
          video: videoModels,
          audio: audioModels,
          total: imageModels.length + videoModels.length + audioModels.length,
        }
      } catch {
        // Fallback to text extraction if TS direct import fails in runtime
        const content = await fsp.readFile(modelsPath, 'utf8')
        return parseModelsFromSource(content, endpointFilter)
      }
    }
  }

  if (serviceName === 'fal') {
    const catalogPath = path.join(servicePath, 'catalog.ts')
    if (fs.existsSync(catalogPath)) {
      try {
        const falCatalog = await import('../fal/catalog')
        return falCatalog.FAL_MODELS || []
      } catch {
        const content = await fsp.readFile(catalogPath, 'utf8')
        return parseModelsFromSource(content, endpointFilter)
      }
    }
  }

  if (serviceName === 'replicate') {
    const catalogPath = path.join(servicePath, 'catalog.ts')
    if (fs.existsSync(catalogPath)) {
      try {
        const repCatalog = await import('../replicate/catalog')
        return repCatalog.REPLICATE_MODELS || []
      } catch {
        const content = await fsp.readFile(catalogPath, 'utf8')
        return parseModelsFromSource(content, endpointFilter)
      }
    }
  }

  return []
}

/**
 * Fallback regex parser for models when direct TS module loading is unavailable.
 */
function parseModelsFromSource(content: string, _filter?: string): any[] {
  const models: any[] = []
  const objMatches = content.matchAll(/\{\s*id:\s*['"]([^'"]+)['"],\s*name:\s*['"]([^'"]+)['"](?:,\s*cost:\s*([0-9.]+))?(?:,\s*category:\s*['"]([^'"]+)['"])?/g)
  for (const m of objMatches) {
    models.push({
      id: m[1],
      name: m[2],
      cost: m[3] ? parseFloat(m[3]) : undefined,
      category: m[4] || 'General',
    })
  }
  return models
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
