import { BrowserWindow } from 'electron'
import {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  renameWorkspace,
  updateWorkspaceColor,
  updateWorkspaceConfig,
  deleteWorkspace,
  getActiveWorkspaceId,
  getDefaultWorkspaceId,
  setActiveWorkspaceId,
  ensureWorkspaceDirs,
  type Workspace,
} from '../workspace-service'
import { type McpTool, ToolInputError, READ_ONLY, EDIT, CREATE, DESTRUCTIVE, str, optStr } from './types'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Tells the open windows that the workspace list or the active workspace changed */
function notifyWorkspacesChanged(payload: { activeId?: string; enter?: boolean } = {}) {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send('workspaces:changed', payload) } catch {}
  }
}

/** A workspace by id, or by its exact name (case-insensitive) */
function resolveWorkspace(ref: string): Workspace {
  const byId = getWorkspace(ref)
  if (byId) return byId
  const matches = listWorkspaces().filter((w) => w.name.trim().toLowerCase() === ref.trim().toLowerCase())
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) throw new ToolInputError(`${matches.length} workspaces are named '${ref}'. Pass the id instead: ${matches.map((w) => w.id).join(', ')}`)
  throw new ToolInputError(`Workspace '${ref}' not found. Call list_workspaces to see them.`)
}

function summarize(ws: Workspace) {
  return {
    id: ws.id,
    name: ws.name,
    color: ws.color,
    archived: ws.isArchived,
    active: ws.id === getActiveWorkspaceId(),
    default: ws.id === getDefaultWorkspaceId(),
    stats: ws.stats,
    createdAt: ws.createdAt,
    updatedAt: ws.updatedAt,
  }
}

function activate(id: string) {
  setActiveWorkspaceId(id)
  notifyWorkspacesChanged({ activeId: id, enter: true })
}

function color(v: any): string | undefined {
  const c = optStr(v)
  if (c && !HEX_COLOR.test(c)) throw new ToolInputError(`color must be a hex color like #6366f1, got '${c}'`)
  return c
}

export function getWorkspaceTools(): McpTool[] {
  return [
    {
      name: 'list_workspaces',
      title: 'List workspaces',
      description: 'List every workspace (project) with its id, name, color, asset counts and which one is active. Library, elements, storyboards and generations always belong to the active workspace.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: READ_ONLY,
      handler: async () => {
        const workspaces = listWorkspaces().map(summarize)
        return { activeId: getActiveWorkspaceId(), count: workspaces.length, workspaces }
      },
    },
    {
      name: 'get_workspace',
      title: 'Get workspace',
      description: 'Get one workspace by id or exact name, including its saved composer defaults (config).',
      inputSchema: {
        type: 'object',
        properties: { workspace: { type: 'string', description: 'Workspace id or exact name' } },
        required: ['workspace'],
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      handler: async (args) => {
        const ws = resolveWorkspace(str(args.workspace))
        return { ...summarize(ws), config: ws.config }
      },
    },
    {
      name: 'create_workspace',
      title: 'Create workspace',
      description: 'Create a new, empty workspace. With activate: true the app switches to it right away, so the next generations, imports and elements land there.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          color: { type: 'string', description: 'Hex color, e.g. #6366f1' },
          activate: { type: 'boolean', description: 'Switch the app to the new workspace. Default false' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      annotations: CREATE,
      handler: async (args) => {
        const ws = createWorkspace(str(args.name).trim(), color(args.color))
        await ensureWorkspaceDirs(ws.id)
        if (args.activate === true) activate(ws.id)
        else notifyWorkspacesChanged()
        return summarize(getWorkspace(ws.id)!)
      },
    },
    {
      name: 'update_workspace',
      title: 'Update workspace',
      description: 'Rename a workspace, change its color and/or merge keys into its config (composer defaults such as "image:model").',
      inputSchema: {
        type: 'object',
        properties: {
          workspace: { type: 'string', description: 'Workspace id or exact name' },
          name: { type: 'string' },
          color: { type: 'string', description: 'Hex color, e.g. #6366f1' },
          config: { type: 'object', description: 'Keys merged into the existing config' },
        },
        required: ['workspace'],
        additionalProperties: false,
      },
      annotations: EDIT,
      handler: async (args) => {
        const ws = resolveWorkspace(str(args.workspace))
        const name = optStr(args.name)?.trim()
        const c = color(args.color)
        if (!name && !c && !args.config) throw new ToolInputError('Nothing to update: pass name, color and/or config')
        if (name) renameWorkspace(ws.id, name)
        if (c) updateWorkspaceColor(ws.id, c)
        if (args.config && typeof args.config === 'object' && !Array.isArray(args.config)) updateWorkspaceConfig(ws.id, args.config)
        notifyWorkspacesChanged()
        const updated = getWorkspace(ws.id)!
        return { ...summarize(updated), config: updated.config }
      },
    },
    {
      name: 'set_active_workspace',
      title: 'Switch workspace',
      description: 'Make a workspace the active one and open it in the app. Everything the other tools read or create (assets, elements, storyboards, Content Studio pieces) belongs to the active workspace.',
      inputSchema: {
        type: 'object',
        properties: { workspace: { type: 'string', description: 'Workspace id or exact name' } },
        required: ['workspace'],
        additionalProperties: false,
      },
      annotations: EDIT,
      handler: async (args) => {
        const ws = resolveWorkspace(str(args.workspace))
        await ensureWorkspaceDirs(ws.id)
        activate(ws.id)
        return summarize(getWorkspace(ws.id)!)
      },
    },
    {
      name: 'delete_workspace',
      title: 'Delete workspace',
      description: 'Permanently delete a workspace with ALL its assets (files included), elements, storyboards, projects and tasks. Cannot be undone. Only call it when the user explicitly asked to delete that workspace; confirm_name must repeat its exact name.',
      inputSchema: {
        type: 'object',
        properties: {
          workspace: { type: 'string', description: 'Workspace id or exact name' },
          confirm_name: { type: 'string', description: 'The exact name of the workspace, as a safety check' },
        },
        required: ['workspace', 'confirm_name'],
        additionalProperties: false,
      },
      annotations: DESTRUCTIVE,
      handler: async (args) => {
        const ws = resolveWorkspace(str(args.workspace))
        if (str(args.confirm_name) !== ws.name) throw new ToolInputError(`confirm_name must be exactly '${ws.name}'`)
        const result = await deleteWorkspace(ws.id)
        if (!result.ok) throw new ToolInputError(result.error || 'Could not delete the workspace')
        notifyWorkspacesChanged({ activeId: getActiveWorkspaceId() })
        return { deleted: ws.id, name: ws.name, activeId: getActiveWorkspaceId() }
      },
    },
  ]
}
