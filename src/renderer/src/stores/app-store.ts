import { create } from 'zustand'

export type Page = 'image' | 'video' | 'audio' | 'library' | 'elements' | 'workflows' | 'editor' | 'cinema' | 'settings' | 'logs' | 'marketplace' | 'apps' | 'promptLibrary' | 'storyboard'

export interface TaskNotification {
  taskId: string
  message: string
  type: 'progress' | 'completed' | 'failed'
  creditsUsed?: number
}

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

interface AppState {
  currentPage: Page
  sidebarCollapsed: boolean
  tasks: TaskNotification[]
  theme: 'dark' | 'light' | 'system'
  creditBalance: number | null
  lastGeneration: { credits: number; model: string; prompt: string } | null
  composerPayload: ComposerPayload | null

  setPage: (page: Page) => void
  toggleSidebar: () => void
  addTask: (task: TaskNotification) => void
  removeTask: (taskId: string) => void
  setTheme: (theme: 'dark' | 'light' | 'system') => void
  setCreditBalance: (balance: number) => void
  setLastGeneration: (gen: { credits: number; model: string; prompt: string }) => void
  setComposerPayload: (payload: ComposerPayload | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'image',
  sidebarCollapsed: false,
  tasks: [],
  theme: 'dark',
  creditBalance: null,
  lastGeneration: null,
  composerPayload: null,

  setPage: (page) => set({ currentPage: page }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks.filter(t => t.taskId !== task.taskId), task] })),
  removeTask: (taskId) => set((state) => ({ tasks: state.tasks.filter(t => t.taskId !== taskId) })),
  setTheme: (theme) => set({ theme }),
  setCreditBalance: (balance) => set({ creditBalance: balance }),
  setLastGeneration: (gen) => set({ lastGeneration: gen }),
  setComposerPayload: (payload) => set({ composerPayload: payload }),
}))
