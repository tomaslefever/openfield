import { create } from 'zustand'

export type Page = 'image' | 'video' | 'audio' | 'library' | 'elements' | 'workflows' | 'editor' | 'cinema' | 'settings' | 'logs' | 'marketplace' | 'apps' | 'promptLibrary' | 'storyboard'

export interface ComposerPayload {
  prompt: string
  model?: string
  aspectRatio?: string
  resolution?: string
  imageBase64?: string
  imageMime?: string
  imageRefs?: { base64: string; mime: string; name?: string; refType?: string }[]
  mode?: 'image' | 'video' | 'audio'
  duration?: number
  fps?: number
  sound?: boolean
  videoRefs?: { base64: string; mime: string; duration?: number }[]
  audioRefs?: { base64: string; mime: string }[]
  firstFrameBase64?: string
  lastFrameBase64?: string
  multiShots?: boolean
  multiPrompt?: { prompt: string; duration: number }[]
  provider?: 'kie' | 'replicate'
  voice?: string
  voiceLanguage?: string
}

export interface AssetSearch {
  query: string
  featured: boolean
  aspectRatio?: string | null
  types: { image: boolean; video: boolean; audio: boolean }
}

interface AppState {
  currentPage: Page
  sidebarCollapsed: boolean
  composerPayload: ComposerPayload | null
  assetSearch: AssetSearch

  setPage: (page: Page) => void
  toggleSidebar: () => void
  setComposerPayload: (payload: ComposerPayload | null) => void
  setAssetSearch: (search: Partial<AssetSearch>) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'image',
  sidebarCollapsed: false,
  composerPayload: null,
  assetSearch: { query: '', featured: false, types: { image: true, video: true, audio: true } },

  setPage: (page) => set({ currentPage: page }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setComposerPayload: (payload) => set({ composerPayload: payload }),
  setAssetSearch: (search) => set((state) => ({ assetSearch: { ...state.assetSearch, ...search } })),
}))
