import { create } from 'zustand'

export type Page = 'image' | 'video' | 'library' | 'workflows' | 'editor' | 'cinema' | 'settings' | 'logs'

export interface TaskNotification {
  taskId: string
  message: string
  type: 'progress' | 'completed' | 'failed'
  creditsUsed?: number
}

interface AppState {
  currentPage: Page
  sidebarCollapsed: boolean
  tasks: TaskNotification[]
  theme: 'dark' | 'light' | 'system'
  creditBalance: number | null
  lastGeneration: { credits: number; model: string; prompt: string } | null

  setPage: (page: Page) => void
  toggleSidebar: () => void
  addTask: (task: TaskNotification) => void
  removeTask: (taskId: string) => void
  setTheme: (theme: 'dark' | 'light' | 'system') => void
  setCreditBalance: (balance: number) => void
  setLastGeneration: (gen: { credits: number; model: string; prompt: string }) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'image',
  sidebarCollapsed: false,
  tasks: [],
  theme: 'dark',
  creditBalance: null,
  lastGeneration: null,

  setPage: (page) => set({ currentPage: page }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks.filter(t => t.taskId !== task.taskId), task] })),
  removeTask: (taskId) => set((state) => ({ tasks: state.tasks.filter(t => t.taskId !== taskId) })),
  setTheme: (theme) => set({ theme }),
  setCreditBalance: (balance) => set({ creditBalance: balance }),
  setLastGeneration: (gen) => set({ lastGeneration: gen }),
}))
