export interface McpToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export interface McpTool {
  name: string
  title: string
  description: string
  inputSchema: Record<string, any>
  annotations?: McpToolAnnotations
  handler: (args: any) => Promise<any>
}

/** Thrown by handlers for caller mistakes; reported as a tool error the model can act on. */
export class ToolInputError extends Error {}

/**
 * A handler result with its own MCP content blocks (e.g. images) instead of the default
 * JSON text dump. `structured` becomes structuredContent.
 */
export class ToolContent {
  constructor(public content: any[], public structured?: Record<string, any>) {}
}

export const READ_ONLY: McpToolAnnotations = { readOnlyHint: true, openWorldHint: false }
export const DESTRUCTIVE: McpToolAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
export const EDIT: McpToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
export const CREATE: McpToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
// Generation calls a paid external API
export const GENERATE: McpToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }

export function str(v: any, def = ''): string {
  return typeof v === 'string' ? v : def
}
export function num(v: any, def = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : def
}
export function optStr(v: any): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}
