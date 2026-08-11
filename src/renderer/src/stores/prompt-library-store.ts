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

interface PromptLibraryState {
  entries: PromptEntry[]
  selectedId: string | null

  addEntry: (entry: Omit<PromptEntry, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateEntry: (id: string, updates: Partial<PromptEntry>) => void
  removeEntry: (id: string) => void
  selectEntry: (id: string | null) => void
  addReference: (entryId: string, ref: PromptReference) => void
  removeReference: (entryId: string, refId: string) => void
}

export const usePromptLibraryStore = create<PromptLibraryState>((set) => ({
  entries: [],
  selectedId: null,

  addEntry: (entry) => set((s) => ({
    entries: [...s.entries, {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }],
  })),

  updateEntry: (id, updates) => set((s) => ({
    entries: s.entries.map(e =>
      e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e
    ),
  })),

  removeEntry: (id) => set((s) => ({
    entries: s.entries.filter(e => e.id !== id),
    selectedId: s.selectedId === id ? null : s.selectedId,
  })),

  selectEntry: (id) => set({ selectedId: id }),

  addReference: (entryId, ref) => set((s) => ({
    entries: s.entries.map(e =>
      e.id === entryId
        ? { ...e, references: [...e.references, ref], updatedAt: Date.now() }
        : e
    ),
  })),

  removeReference: (entryId, refId) => set((s) => ({
    entries: s.entries.map(e =>
      e.id === entryId
        ? { ...e, references: e.references.filter(r => r.id !== refId), updatedAt: Date.now() }
        : e
    ),
  })),
}))
