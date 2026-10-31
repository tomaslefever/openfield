import { create } from 'zustand'

export interface PromptEntry {
  id: string
  name: string
  prompt: string
  kind: 'image' | 'video'
  references: PromptReference[]
  tags: string[]
  category?: string
  /** When to use it, in a sentence or two (read by agents over MCP) */
  description?: string
  /** Saved for every workspace instead of only the active one */
  global?: boolean
  /** Model families it was written for (e.g. nano-banana, kling) */
  models?: string[]
  /** Piece types (e.g. ads, storyboard, character-sheet) */
  types?: string[]
  review?: PromptReview
  createdAt: number
  updatedAt: number
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface PromptReview {
  status: ReviewStatus
  note: string
  updatedAt?: number
}

export interface BuiltinReference {
  name: string
  type: 'image' | 'video'
  /** Bundled file */
  path?: string
  /** Example image hosted by the source (shown with credit) */
  url?: string
  caption?: string
  credit?: string
  sourceUrl?: string
  license?: string
  date?: string
}

export interface PromptTaxonomy {
  categories: Record<string, string>
  models: Record<string, { label: string; kind: 'image' | 'video' }>
  types: Record<string, string>
}

/** A read-only template from Openfield's built-in library */
export interface BuiltinTemplate {
  id: string
  source: 'openfield'
  name: string
  kind: 'image' | 'video'
  category: string
  description: string
  tags: string[]
  prompt: string
  variables: { name: string; description: string; example: string; optional?: boolean }[]
  guidance: string[]
  aspectRatios: string[]
  durationSeconds?: number
  models: string[]
  types: string[]
  references: BuiltinReference[]
  sources: { title: string; url: string }[]
  review: PromptReview
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
    category: row.category || '',
    description: row.description || '',
    global: row.global === true,
    models: Array.isArray(row.models) ? row.models : [],
    types: Array.isArray(row.types) ? row.types : [],
    review: row.review || { status: 'pending', note: '' },
    createdAt: row.createdAt ?? row.created_at ?? Date.now(),
    updatedAt: row.updatedAt ?? row.updated_at ?? Date.now(),
  }
}

interface PromptLibraryState {
  entries: PromptEntry[]
  builtins: BuiltinTemplate[]
  taxonomy: PromptTaxonomy | null
  selectedId: string | null
  loaded: boolean

  loadEntries: () => Promise<void>
  loadBuiltins: (force?: boolean) => Promise<void>
  /** Review verdict on any prompt (built-in or own); agents prefer approved and skip rejected */
  setReview: (id: string, status: ReviewStatus, note?: string) => Promise<void>
  addEntry: (entry: Omit<PromptEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<PromptEntry | null>
  updateEntry: (id: string, updates: Partial<PromptEntry>) => void
  removeEntry: (id: string) => void
  selectEntry: (id: string | null) => void
  addReference: (entryId: string, ref: PromptReference) => void
  removeReference: (entryId: string, refId: string) => void
}

export const usePromptLibraryStore = create<PromptLibraryState>((set, get) => ({
  entries: [],
  builtins: [],
  taxonomy: null,
  selectedId: null,
  loaded: false,

  loadBuiltins: async (force = false) => {
    if (get().builtins.length && !force) return
    try {
      const [rows, taxonomy] = await Promise.all([api()?.builtin?.(), get().taxonomy ? null : api()?.taxonomy?.()])
      if (Array.isArray(rows)) set({ builtins: rows })
      if (taxonomy) set({ taxonomy })
    } catch (err) {
      console.error('[PromptLibrary] Failed to load Openfield templates:', err)
    }
  },

  setReview: async (id, status, note) => {
    const apply = (review: PromptReview) => set((s) => ({
      builtins: s.builtins.map(b => b.id === id ? { ...b, review } : b),
      entries: s.entries.map(e => e.id === id ? { ...e, review } : e),
    }))
    const prev = get().builtins.find(b => b.id === id)?.review || get().entries.find(e => e.id === id)?.review
    apply({ status, note: note ?? prev?.note ?? '', updatedAt: Date.now() })
    try {
      await api()?.setReview?.(id, status, note)
    } catch (err) {
      console.error('[PromptLibrary] Failed to save review:', err)
      if (prev) apply(prev)
    }
  },

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
    if (next && updates.category !== undefined) data.category = next.category
    if (next && updates.description !== undefined) data.description = next.description
    if (next && updates.global !== undefined) data.global = next.global
    if (next && updates.models !== undefined) data.models = next.models
    if (next && updates.types !== undefined) data.types = next.types
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
