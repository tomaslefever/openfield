import { create } from 'zustand'

export type ElementKind = 'avatar' | 'character' | 'environment' | 'object'

export interface StudioElement {
  id: string
  name: string
  kind: ElementKind
  description: string
  tags: string[]
  imageBase64: string
  imageAssetId: string
  prompt: string
  voiceId: string
  referenceImages: string[]
  referenceAssetIds: string[]
  poseRef: string
  poseAssetId: string
  poseTaskId: string
  moodboardTaskId: string
  videoRef: string
  videoAssetId: string
  hdriRef: string
  hdriAssetId: string
  style: string
  properties: Record<string, string>
  createdAt: number
  updatedAt: number
}

export const KIND_CONFIG: Record<ElementKind, { label: string; icon: string; color: string }> = {
  avatar: { label: 'Avatar', icon: 'user-circle', color: 'text-violet-400' },
  character: { label: 'Personaje', icon: 'user', color: 'text-blue-400' },
  environment: { label: 'Entorno', icon: 'mountain', color: 'text-emerald-400' },
  object: { label: 'Objeto', icon: 'box', color: 'text-amber-400' },
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

function api() {
  return (window as any).electronAPI?.elements
}

interface ElementsState {
  elements: StudioElement[]
  loaded: boolean

  loadElements: () => Promise<void>
  addElement: (el: Omit<StudioElement, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateElement: (id: string, updates: Partial<StudioElement>) => void
  deleteElement: (id: string) => void
}

export const useElementsStore = create<ElementsState>()((set, _get) => ({
  elements: [],
  loaded: false,

  loadElements: async () => {
    const elApi = api()
    if (!elApi) {
      set({ loaded: true })
      return
    }
    try {
      const rows = await elApi.list()
      if (rows && Array.isArray(rows)) {
        const elements = rows as StudioElement[]
        // Load base64 from assets for display
        const assetIds = new Set<string>()
        for (const el of elements) {
          if (el.imageAssetId) assetIds.add(el.imageAssetId)
          if (el.poseAssetId) assetIds.add(el.poseAssetId)
          if (el.videoAssetId) assetIds.add(el.videoAssetId)
          if (el.hdriAssetId) assetIds.add(el.hdriAssetId)
          for (const aid of el.referenceAssetIds || []) assetIds.add(aid)
        }
        if (assetIds.size > 0) {
          try {
            const api = (window as any).electronAPI
            const results = await api?.assets.readBase64(Array.from(assetIds))
            if (results?.length) {
              const map = new Map(results.map((r: any) => [r.id, r.base64]))
              for (const el of elements) {
                if (el.imageAssetId && map.has(el.imageAssetId)) (el as any).imageBase64 = map.get(el.imageAssetId)!
                if (el.poseAssetId && map.has(el.poseAssetId)) (el as any).poseRef = map.get(el.poseAssetId)!
                if (el.videoAssetId && map.has(el.videoAssetId)) (el as any).videoRef = map.get(el.videoAssetId)!
                if (el.hdriAssetId && map.has(el.hdriAssetId)) (el as any).hdriRef = map.get(el.hdriAssetId)!
                ;(el as any).referenceImages = ((el as any).referenceAssetIds || []).map((aid: string) => map.get(aid) || '')
              }
            }
          } catch (err) { console.warn('[ElementsStore] Failed to load asset base64:', err) }
        }
        set({ elements, loaded: true })
      } else {
        set({ loaded: true })
      }
    } catch (err) {
      console.error('[ElementsStore] Failed to load elements from DB:', err)
      set({ loaded: true })
    }
  },

  addElement: (el) => {
    const id = uid()
    const now = Date.now()
    const element: StudioElement = {
      id,
      name: el.name,
      kind: el.kind,
      description: el.description || '',
      tags: el.tags || [],
      imageBase64: el.imageBase64 || '',
      imageAssetId: el.imageAssetId || '',
      prompt: el.prompt || '',
      voiceId: el.voiceId || '',
      referenceImages: el.referenceImages || [],
      referenceAssetIds: (el as any).referenceAssetIds || [],
      poseRef: el.poseRef || '',
      poseAssetId: (el as any).poseAssetId || '',
      poseTaskId: el.poseTaskId || '',
      moodboardTaskId: el.moodboardTaskId || '',
      videoRef: el.videoRef || '',
      videoAssetId: (el as any).videoAssetId || '',
      hdriRef: el.hdriRef || '',
      hdriAssetId: (el as any).hdriAssetId || '',
      style: el.style || '',
      properties: el.properties || {},
      createdAt: now,
      updatedAt: now,
    }
    set((s) => ({ elements: [...s.elements, element] }))

    api()?.create({ ...element, id }).catch((err: any) => {
      console.error('[ElementsStore] Failed to persist element to DB:', err)
    })
  },

  updateElement: (id, updates) => {
    set((s) => ({
      elements: s.elements.map((e) =>
        e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e,
      ),
    }))

    api()?.update(id, updates).catch((err: any) => {
      console.error('[ElementsStore] Failed to update element in DB:', err)
    })
  },

  deleteElement: (id) => {
    set((s) => ({
      elements: s.elements.filter((e) => e.id !== id),
    }))

    api()?.delete(id).catch((err: any) => {
      console.error('[ElementsStore] Failed to delete element from DB:', err)
    })
  },
}))
