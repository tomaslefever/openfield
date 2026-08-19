import { create } from 'zustand'

export interface PromptEntry {
  id: string
  name: string
  prompt: string
  kind: 'image' | 'video'
  references: PromptReference[]
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface PromptReference {
  id: string
  base64: string
  mime: string
  type: 'image' | 'video'
  name: string
}

function api() {
  return (window as any).electronAPI?.prompts
}

function toEntry(row: any): PromptEntry {
  return {
    id: row.id,
    name: row.name || '',
    prompt: row.prompt || '',
    kind: row.kind === 'video' ? 'video' : 'image',
    references: Array.isArray(row.references) ? row.references : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdAt: row.createdAt ?? row.created_at ?? Date.now(),
    updatedAt: row.updatedAt ?? row.updated_at ?? Date.now(),
  }
}

interface PromptLibraryState {
  entries: PromptEntry[]
  selectedId: string | null
  loaded: boolean

  loadEntries: () => Promise<void>
  addEntry: (entry: Omit<PromptEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<PromptEntry | null>
  updateEntry: (id: string, updates: Partial<PromptEntry>) => void
  removeEntry: (id: string) => void
  selectEntry: (id: string | null) => void
  addReference: (entryId: string, ref: PromptReference) => void
  removeReference: (entryId: string, refId: string) => void
}

export const usePromptLibraryStore = create<PromptLibraryState>((set, get) => ({
  entries: [],
  selectedId: null,
  loaded: false,

  loadEntries: async () => {
    const a = api()
    if (!a) { set({ loaded: true }); return }
    try {
      const rows = await a.list()
      set({ entries: (Array.isArray(rows) ? rows : []).map(toEntry), loaded: true })
    } catch (err) {
      console.error('[PromptLibrary] Failed to load prompts:', err)
      set({ loaded: true })
    }
  },

  addEntry: async (entry) => {
    const a = api()
    if (!a) return null
    try {
      const row = await a.create(entry)
      if (row) {
        const e = toEntry(row)
        set((s) => ({ entries: [...s.entries, e] }))
        return e
      }
    } catch (err) {
      console.error('[PromptLibrary] Failed to persist prompt:', err)
    }
    // Fallback to in-memory only when persistence is unavailable
    const e: PromptEntry = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((s) => ({ entries: [...s.entries, e] }))
    return e
  },

  updateEntry: (id, updates) => {
    const prev = get().entries.find(e => e.id === id)
    set((s) => ({
      entries: s.entries.map(e =>
        e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e
      ),
    }))
    const next = get().entries.find(e => e.id === id)
    const data: any = {}
    if (next && updates.name !== undefined) data.name = next.name
    if (next && updates.prompt !== undefined) data.prompt = next.prompt
    if (next && updates.kind !== undefined) data.kind = next.kind
    if (next && updates.tags !== undefined) data.tags = next.tags
    if (next && updates.references !== undefined) data.references = next.references
    api()?.update(id, data).catch((err: any) => {
      console.error('[PromptLibrary] Failed to update prompt:', err)
      if (prev) set((s) => ({ entries: s.entries.map(e => e.id === id ? prev : e) }))
    })
  },

  removeEntry: (id) => {
    const prev = get().entries
    set((s) => ({
      entries: s.entries.filter(e => e.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }))
    api()?.delete(id).catch((err: any) => {
      console.error('[PromptLibrary] Failed to delete prompt:', err)
      set({ entries: prev })
    })
  },

  selectEntry: (id) => set({ selectedId: id }),

  addReference: (entryId, ref) => {
    set((s) => ({
      entries: s.entries.map(e =>
        e.id === entryId
          ? { ...e, references: [...e.references, ref], updatedAt: Date.now() }
          : e
      ),
    }))
    const next = get().entries.find(e => e.id === entryId)
    if (next) api()?.update(entryId, { references: next.references }).catch(() => {})
  },

  removeReference: (entryId, refId) => {
    set((s) => ({
      entries: s.entries.map(e =>
        e.id === entryId
          ? { ...e, references: e.references.filter(r => r.id !== refId), updatedAt: Date.now() }
          : e
      ),
    }))
    const next = get().entries.find(e => e.id === entryId)
    if (next) api()?.update(entryId, { references: next.references }).catch(() => {})
  },
}))
