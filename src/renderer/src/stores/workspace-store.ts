import { create } from 'zustand'

export interface Workspace {
  id: string
  name: string
  color: string
  config: Record<string, any>
  isArchived: boolean
  createdAt: number
  updatedAt: number
}

interface WorkspaceState {
  workspaces: Workspace[]
  activeId: string | null
  loaded: boolean

  load: () => Promise<void>
  create: (name: string, color?: string) => Promise<Workspace | null>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<{ ok: boolean; error?: string }>
  duplicate: (id: string) => Promise<void>
  setActive: (id: string) => Promise<void>
  updateConfig: (id: string, config: Record<string, any>) => Promise<void>
}

function api() {
  return (window as any).electronAPI?.workspaces
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeId: null,
  loaded: false,

  load: async () => {
    const a = api()
    if (!a) { set({ loaded: true }); return }
    try {
      const [list, active] = await Promise.all([a.list(), a.getActive()])
      set({
        workspaces: Array.isArray(list) ? list : [],
        activeId: typeof active === 'string' && active ? active : (list?.[0]?.id || null),
        loaded: true,
      })
    } catch (err) {
      console.error('[WorkspaceStore] Failed to load workspaces:', err)
      set({ loaded: true })
    }
  },

  create: async (name, color) => {
    const a = api()
    if (!a) return null
    try {
      const ws = await a.create(name, color)
      if (ws) {
        // Optimistic insert so every subscriber (sidebar selector, bulk bar)
        // sees the new project immediately, then resync from main.
        set((s) => ({
          workspaces: s.workspaces.some((w) => w.id === ws.id)
            ? s.workspaces
            : [...s.workspaces, ws],
        }))
      }
      get().load().catch(() => {})
      return ws
    } catch (err) {
      console.error('[WorkspaceStore] Failed to create workspace:', err)
      return null
    }
  },

  rename: async (id, name) => {
    await api()?.rename(id, name)
    await get().load()
  },

  remove: async (id) => {
    const a = api()
    if (!a) return { ok: false, error: 'No API' }
    try {
      const result = await a.delete(id)
      if (result?.ok) {
        const state = get()
        if (state.activeId === id) {
          const active = await a.getActive()
          set({ activeId: active })
        }
      }
      await get().load()
      return result || { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message }
    }
  },

  duplicate: async (id) => {
    const ws = await api()?.duplicate(id)
    if (ws) {
      await get().load()
      if (ws.id) await get().setActive(ws.id)
    }
  },

  setActive: async (id) => {
    const a = api()
    if (!a) return
    await a.setActive(id)
    set({ activeId: id })
  },

  updateConfig: async (id, config) => {
    const ws = await api()?.updateConfig(id, config)
    if (ws) {
      set((s) => ({
        workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, config: ws.config } : w)),
      }))
    }
  },
}))

export function activeWorkspaceConfig(): Record<string, any> {
  const { workspaces, activeId } = useWorkspaceStore.getState()
  return workspaces.find((w) => w.id === activeId)?.config || {}
}
