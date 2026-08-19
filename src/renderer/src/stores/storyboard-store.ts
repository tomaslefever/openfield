import { create } from 'zustand'

export interface SceneShot {
  id: string
  order: number
  description: string
  prompt: string
  imageModelId: string
  imageBase64: string | null
  imageAssetId: string | null
  videoBase64: string | null
  videoAssetId: string | null
  aspectRatio: string
  resolution: string
  isGeneratingImage: boolean
  isGeneratingVideo: boolean
  createdAt: number
  updatedAt: number
}

export interface SceneTransition {
  id: string
  fromSceneId: string
  toSceneId: string
  duration: number
  videoBase64: string | null
  videoAssetId: string | null
  isGenerating: boolean
  createdAt: number
  updatedAt: number
}

export type StoryboardElementType = 'character' | 'scenario' | 'object'

export interface StoryboardElement {
  id: string
  name: string
  type: StoryboardElementType
  description: string
}

interface StoryboardState {
  boardId: string | null
  boardName: string
  style: string
  script: string
  elements: StoryboardElement[]
  scenes: SceneShot[]
  transitions: SceneTransition[]
  imageModelId: string
  videoModelId: string
  transitionModelId: string
  defaultDuration: number
  defaultAspectRatio: string
  defaultResolution: string
  loaded: boolean

  // Board management
  loadBoard: (id: string) => Promise<void>
  createBoard: (name: string, style?: string) => Promise<string>
  deleteBoard: (id: string) => Promise<void>
  setBoardName: (name: string) => void
  setStyle: (style: string) => void
  setScript: (script: string) => void
  setElements: (elements: StoryboardElement[]) => void
  addElements: (elements: Omit<StoryboardElement, 'id'>[]) => number
  removeElement: (id: string) => void
  saveSettings: () => void
  setImageModelId: (id: string) => void
  setVideoModelId: (id: string) => void
  setTransitionModelId: (id: string) => void
  setAspectRatio: (ar: string) => void
  setResolution: (res: string) => void

  // Scene actions
  addScene: () => Promise<string>
  updateScene: (id: string, updates: Partial<SceneShot>) => void
  removeScene: (id: string) => Promise<void>
  reorderScenes: (fromIndex: number, toIndex: number) => void
  duplicateScene: (id: string) => Promise<void>
  setSceneImage: (id: string, base64: string | null, assetId?: string | null) => void
  setSceneVideo: (id: string, base64: string | null, assetId?: string | null) => void

  // Transition actions
  addTransition: (fromSceneId: string, toSceneId: string) => void
  updateTransition: (id: string, updates: Partial<SceneTransition>) => void
  removeTransition: (id: string) => void

  // Clear
  clear: () => void
}

const api = () => (window as any).electronAPI?.storyboard

function toScene(row: any): SceneShot {
  return {
    id: row.id,
    order: row.order ?? 0,
    description: row.description || '',
    prompt: row.prompt || '',
    imageModelId: row.imageModelId ?? row.image_model_id ?? 'gpt-image-2-text-to-image',
    imageBase64: null,
    imageAssetId: row.imageAssetId ?? row.image_asset_id ?? null,
    videoBase64: null,
    videoAssetId: row.videoAssetId ?? row.video_asset_id ?? null,
    aspectRatio: row.aspectRatio ?? row.aspect_ratio ?? '1:1',
    resolution: row.resolution || '1K',
    isGeneratingImage: false,
    isGeneratingVideo: false,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  }
}

function toTransition(row: any): SceneTransition {
  return {
    id: row.id,
    fromSceneId: row.fromSceneId ?? row.from_scene_id,
    toSceneId: row.toSceneId ?? row.to_scene_id,
    duration: row.duration ?? 5,
    videoBase64: null,
    videoAssetId: row.videoAssetId ?? row.video_asset_id ?? null,
    isGenerating: false,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  }
}

function toElement(row: any): StoryboardElement {
  return {
    id: row.id,
    name: row.name || '',
    type: (row.type === 'scenario' || row.type === 'object' ? row.type : 'character'),
    description: row.description || '',
  }
}

export const useStoryboardStore = create<StoryboardState>((set, get) => ({
  boardId: null,
  boardName: 'Untitled Storyboard',
  style: '',
  script: '',
  elements: [],
  scenes: [],
  transitions: [],
  imageModelId: 'gpt-image-2-text-to-image',
  videoModelId: 'kling-3.0/video',
  transitionModelId: 'pixverse-v6/image-to-video',
  defaultDuration: 5,
  defaultAspectRatio: '1:1',
  defaultResolution: '1K',
  loaded: false,

  loadBoard: async (id) => {
    const a = api()
    if (!a) return
    try {
      const result = await a.get(id)
      if (!result) {
        get().clear()
        return
      }
      const scenes: SceneShot[] = (result.scenes || []).map(toScene)
      set({
        boardId: result.id,
        boardName: result.name || 'Untitled Storyboard',
        style: result.style || '',
        script: result.script || '',
        elements: (() => {
          try {
            const raw = typeof result.elements === 'string' ? JSON.parse(result.elements) : (result.elements || [])
            return (Array.isArray(raw) ? raw : []).map(toElement)
          } catch {
            return []
          }
        })(),
        scenes,
        transitions: (result.transitions || []).map(toTransition),
        imageModelId: result.imageModelId ?? result.image_model_id ?? 'gpt-image-2-text-to-image',
        videoModelId: result.videoModelId ?? result.video_model_id ?? 'kling-3.0/video',
        transitionModelId: result.transitionModelId ?? result.transition_model_id ?? 'pixverse-v6/image-to-video',
        defaultDuration: result.defaultDuration ?? result.default_duration ?? 5,
        defaultAspectRatio: result.defaultAspectRatio ?? result.default_aspect_ratio ?? '1:1',
        defaultResolution: result.defaultResolution ?? result.default_resolution ?? '1K',
        loaded: true,
      })
      const assets = (window as any).electronAPI?.assets
      const imageIds = scenes.filter(s => s.imageAssetId).map(s => s.imageAssetId as string)
      const videoIds = scenes.filter(s => s.videoAssetId).map(s => s.videoAssetId as string)
      if (assets && (imageIds.length > 0 || videoIds.length > 0)) {
        const results = await assets.readBase64([...imageIds, ...videoIds])
        if (results?.length) {
          const map = new Map<string, string>(results.map((r: any) => [r.id, r.base64]))
          set(s => ({
            scenes: s.scenes.map(sc => {
              if (sc.imageAssetId && map.has(sc.imageAssetId)) return { ...sc, imageBase64: map.get(sc.imageAssetId)! }
              if (sc.videoAssetId && map.has(sc.videoAssetId)) return { ...sc, videoBase64: map.get(sc.videoAssetId)! }
              return sc
            }),
          }))
        }
      }
    } catch (err) {
      console.warn('Failed to load storyboard:', err)
      get().clear()
    }
  },

  createBoard: async (name, style) => {
    const a = api()
    if (!a) return ''
    const board = await a.create(name || 'Untitled Storyboard', style || '')
    set({
      boardId: board.id,
      boardName: board.name,
      style: board.style || style || '',
      script: '',
      elements: [],
      scenes: [],
      transitions: [],
      loaded: true,
    })
    return board.id
  },

  deleteBoard: async (id) => {
    try {
      await api()?.delete(id)
    } catch (err) {
      console.warn('Failed to delete storyboard:', err)
    }
    get().clear()
  },

  setBoardName: (name) => {
    set({ boardName: name })
    const { boardId } = get()
    if (boardId) api()?.updateName(boardId, name)
  },

  setStyle: (style) => {
    set({ style })
    const { boardId } = get()
    if (boardId) api()?.updateSettings(boardId, { style })
  },

  setScript: (script) => {
    set({ script })
    const { boardId } = get()
    if (boardId) api()?.updateSettings(boardId, { script })
  },

  setElements: (elements) => {
    set({ elements })
    const { boardId } = get()
    if (boardId) api()?.updateSettings(boardId, { elements })
  },

  addElements: (els) => {
    const { boardId, elements } = get()
    const existing = new Set(elements.map(e => `${e.type}:${e.name.trim().toLowerCase()}`))
    const fresh = els.filter(e => !existing.has(`${e.type}:${e.name.trim().toLowerCase()}`))
    if (fresh.length === 0) return 0
    const next = [...elements, ...fresh.map(e => ({ ...e, id: crypto.randomUUID() }))]
    set({ elements: next })
    if (boardId) api()?.updateSettings(boardId, { elements: next })
    return fresh.length
  },

  removeElement: (id) => {
    const { boardId, elements } = get()
    const next = elements.filter(e => e.id !== id)
    set({ elements: next })
    if (boardId) api()?.updateSettings(boardId, { elements: next })
  },

  saveSettings: () => {
    const { boardId, imageModelId, videoModelId, transitionModelId, defaultDuration, defaultAspectRatio, defaultResolution } = get()
    if (boardId) {
      api()?.updateSettings(boardId, {
        imageModelId, videoModelId, transitionModelId, defaultDuration,
        defaultAspectRatio, defaultResolution,
      })
    }
  },

  setImageModelId: (imageModelId) => set({ imageModelId }),
  setVideoModelId: (videoModelId) => set({ videoModelId }),
  setTransitionModelId: (transitionModelId) => set({ transitionModelId }),
  setAspectRatio: (defaultAspectRatio) => set({ defaultAspectRatio }),

  setResolution: (defaultResolution) => set({ defaultResolution }),

  addScene: async () => {
    const { boardId, scenes, defaultAspectRatio, defaultResolution, imageModelId } = get()
    if (!boardId) return ''
    const result = await api()?.createScene(boardId, {
      description: '',
      prompt: '',
      aspectRatio: defaultAspectRatio,
      resolution: defaultResolution,
    })
    set(s => ({
      scenes: [...s.scenes, {
        id: result.id,
        order: s.scenes.length,
        description: '',
        prompt: '',
        imageModelId: imageModelId || 'gpt-image-2-text-to-image',
        imageBase64: null,
        imageAssetId: null,
        videoBase64: null,
        videoAssetId: null,
        aspectRatio: defaultAspectRatio,
        resolution: defaultResolution,
        isGeneratingImage: false,
        isGeneratingVideo: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
    }))
    return result.id
  },

  updateScene: (id, updates) => {
    const data: any = {}
    if (updates.description !== undefined) data.description = updates.description
    if (updates.prompt !== undefined) data.prompt = updates.prompt
    if (updates.aspectRatio !== undefined) data.aspectRatio = updates.aspectRatio
    if (updates.resolution !== undefined) data.resolution = updates.resolution
    api()?.updateScene(id, data)
    set(s => ({
      scenes: s.scenes.map(sc =>
        sc.id === id ? { ...sc, ...updates } : sc
      ),
    }))
  },

  removeScene: async (id) => {
    const { boardId } = get()
    await api()?.deleteScene(id)
    set(s => ({
      scenes: s.scenes
        .filter(sc => sc.id !== id)
        .map((sc, i) => ({ ...sc, order: i })),
      transitions: s.transitions.filter(
        t => t.fromSceneId !== id && t.toSceneId !== id
      ),
    }))
    // Persist reorder
    if (boardId) {
      const ids = get().scenes.map(s => s.id)
      api()?.reorderScenes(boardId, ids)
    }
  },

  reorderScenes: (fromIndex, toIndex) => {
    const { boardId } = get()
    set(s => {
      const scenes = [...s.scenes]
      const [moved] = scenes.splice(fromIndex, 1)
      scenes.splice(toIndex, 0, moved)
      return { scenes: scenes.map((sc, i) => ({ ...sc, order: i })) }
    })
    if (boardId) {
      const ids = get().scenes.map(s => s.id)
      api()?.reorderScenes(boardId, ids)
    }
  },

  duplicateScene: async (id) => {
    const state = get()
    if (!state.boardId) return
    const original = state.scenes.find(s => s.id === id)
    if (!original) return
    const idx = state.scenes.findIndex(s => s.id === id)
    const result = await api()?.createScene(state.boardId, {
      description: original.description,
      prompt: original.prompt,
      aspectRatio: original.aspectRatio,
      resolution: original.resolution,
    })
    // Reorder to put the duplicate right after the original
    const ids = get().scenes.map(s => s.id)
    ids.splice(idx + 1, 0, result.id)
    api()?.reorderScenes(state.boardId, ids)
    set(s => ({
      scenes: [
        ...s.scenes.slice(0, idx + 1),
        {
          id: result.id,
          order: idx + 1,
          description: original.description,
          prompt: original.prompt,
          imageBase64: null,
          imageAssetId: null,
          videoBase64: null,
          videoAssetId: null,
          imageModelId: original.imageModelId || 'gpt-image-2-text-to-image',
          aspectRatio: original.aspectRatio,
          resolution: original.resolution,
          isGeneratingImage: false,
          isGeneratingVideo: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        ...s.scenes.slice(idx + 1).map(sc => ({ ...sc, order: sc.order + 1 })),
      ],
    }))
  },

  setSceneImage: (id, base64, assetId = null) =>
    set(s => ({
      scenes: s.scenes.map(sc =>
        sc.id === id ? {
          ...sc,
          imageBase64: base64 ?? sc.imageBase64,
          imageAssetId: assetId ?? sc.imageAssetId,
          isGeneratingImage: false,
        } : sc
      ),
    })),

  setSceneVideo: (id, base64, assetId = null) =>
    set(s => ({
      scenes: s.scenes.map(sc =>
        sc.id === id ? {
          ...sc,
          videoBase64: base64 ?? sc.videoBase64,
          videoAssetId: assetId ?? sc.videoAssetId,
          isGeneratingVideo: false,
        } : sc
      ),
    })),

  addTransition: (fromSceneId, toSceneId) => {
    const { boardId, transitions, defaultDuration } = get()
    if (!boardId) return
    const existing = transitions.find(t => t.fromSceneId === fromSceneId && t.toSceneId === toSceneId)
    if (existing) return
    api()?.createTransition({ storyboardId: boardId, fromSceneId, toSceneId, duration: defaultDuration }).then((result: any) => {
      set(s => ({
        transitions: [...s.transitions, {
          id: result.id,
          fromSceneId,
          toSceneId,
          duration: defaultDuration,
          videoBase64: null,
          videoAssetId: null,
          isGenerating: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }],
      }))
    })
  },

  updateTransition: (id, updates) => {
    const data: any = {}
    if (updates.duration !== undefined) data.duration = updates.duration
    if (updates.videoAssetId !== undefined) data.videoAssetId = updates.videoAssetId
    api()?.updateTransition(id, data)
    set(s => ({
      transitions: s.transitions.map(t =>
        t.id === id ? { ...t, ...updates } : t
      ),
    }))
  },

  removeTransition: (id) => {
    api()?.deleteTransition(id)
    set(s => ({
      transitions: s.transitions.filter(t => t.id !== id),
    }))
  },

  clear: () => set({
    boardId: null,
    boardName: 'Untitled Storyboard',
    script: '',
    elements: [],
    scenes: [],
    transitions: [],
    loaded: false,
  }),
}))
