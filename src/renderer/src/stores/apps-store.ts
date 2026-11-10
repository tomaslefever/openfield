import { create } from 'zustand'

export type AppKind = 'storyboard' | 'ugc' | 'pipeline' | 'editor' | 'transition' | 'generator'

export interface AppComponentRef {
  componentId: string
  props?: Record<string, any>
  position?: { x: number; y: number; w: number; h: number }
}

export interface AppDefinition {
  id: string
  name: string
  description: string
  kind: AppKind
  icon: string
  category: 'creative' | 'marketing' | 'cinema' | 'social'
  tags: string[]
  components: AppComponentRef[]
  defaultParams: Record<string, any>
  previewUrl?: string
  isBuiltIn: boolean
  createdAt: number
}

export interface AppInstance {
  id: string
  appId: string
  name: string
  params: Record<string, any>
  state: Record<string, any>
  createdAt: number
  updatedAt: number
}

export const BUILTIN_APPS: AppDefinition[] = [
  {
    id: 'storyboard-studio',
    name: 'Storyboard Studio',
    description: 'Create cinematic storyboards with script-to-scene generation. Define scenes, characters, and camera angles to visualize your narrative.',
    kind: 'storyboard',
    icon: 'Clapperboard',
    category: 'cinema',
    tags: ['storyboard', 'cinema', 'scenes', 'narrative'],
    components: [
      { componentId: 'script-editor' },
      { componentId: 'storyboard-grid' },
      { componentId: 'prompt-composer', props: { mode: 'image' } },
    ],
    defaultParams: {
      aspectRatio: '16:9',
      resolution: '1K',
      sceneCount: 6,
      autoGenerate: true,
    },
    isBuiltIn: true,
    createdAt: Date.now(),
  },
  {
    id: 'ugc-creator',
    name: 'UGC Creator',
    description: 'Generate user-generated content style videos. Perfect for social media ads, testimonials, and authentic brand content.',
    kind: 'ugc',
    icon: 'Smartphone',
    category: 'social',
    tags: ['ugc', 'social', 'ads', 'marketing'],
    components: [
      { componentId: 'script-editor' },
      { componentId: 'element-selector' },
      { componentId: 'prompt-composer', props: { mode: 'video' } },
      { componentId: 'transition-timeline' },
    ],
    defaultParams: {
      duration: 15,
      fps: 24,
      platform: 'instagram',
      style: 'casual',
    },
    isBuiltIn: true,
    createdAt: Date.now(),
  },
  {
    id: 'image-pipeline',
    name: 'Image Pipeline',
    description: 'Batch image generation pipeline. Process multiple prompts with consistent style, resolution, and aspect ratio.',
    kind: 'pipeline',
    icon: 'Images',
    category: 'creative',
    tags: ['batch', 'pipeline', 'images', 'production'],
    components: [
      { componentId: 'prompt-list' },
      { componentId: 'pipeline-controls' },
      { componentId: 'prompt-composer', props: { mode: 'image' } },
      { componentId: 'result-grid' },
    ],
    defaultParams: {
      aspectRatio: '1:1',
      resolution: '1K',
      batchSize: 4,
      consistentStyle: true,
    },
    isBuiltIn: true,
    createdAt: Date.now(),
  },
  {
    id: 'character-designer',
    name: 'Character Designer',
    description: 'Design consistent characters across multiple shots. Define appearance, poses, and expressions with element reuse.',
    kind: 'generator',
    icon: 'UserRound',
    category: 'creative',
    tags: ['character', 'consistent', 'poses', 'elements'],
    components: [
      { componentId: 'element-creator' },
      { componentId: 'pose-generator' },
      { componentId: 'moodboard-viewer' },
      { componentId: 'prompt-composer', props: { mode: 'image' } },
    ],
    defaultParams: {
      aspectRatio: '3:4',
      resolution: '1K',
      poseCount: 4,
      characterKind: 'character',
    },
    isBuiltIn: true,
    createdAt: Date.now(),
  },
  {
    id: 'transition-lab',
    name: 'Transition Lab',
    description: 'Design and test video transitions between scenes. Create smooth cinematic transitions with frame interpolation.',
    kind: 'transition',
    icon: 'ArrowLeftRight',
    category: 'cinema',
    tags: ['transitions', 'video', 'cinematic', 'effects'],
    components: [
      { componentId: 'frame-selector' },
      { componentId: 'transition-timeline' },
      { componentId: 'prompt-composer', props: { mode: 'video' } },
      { componentId: 'preview-player' },
    ],
    defaultParams: {
      duration: 5,
      fps: 24,
      transitionType: 'smooth',
      frameCount: 2,
    },
    isBuiltIn: true,
    createdAt: Date.now(),
  },
  {
    id: 'social-studio',
    name: 'Social Studio',
    description: 'Multi-platform social media content creator. Generate optimized content for Instagram, TikTok, YouTube, and more.',
    kind: 'generator',
    icon: 'Share2',
    category: 'social',
    tags: ['social', 'multi-platform', 'content', 'ads'],
    components: [
      { componentId: 'platform-selector' },
      { componentId: 'script-editor' },
      { componentId: 'element-selector' },
      { componentId: 'prompt-composer', props: { mode: 'video' } },
    ],
    defaultParams: {
      platforms: ['instagram', 'tiktok'],
      duration: 30,
      fps: 30,
      verticalMode: true,
    },
    isBuiltIn: true,
    createdAt: Date.now(),
  },
]

export const KIND_LABELS: Record<AppKind, string> = {
  storyboard: 'Storyboard',
  ugc: 'UGC',
  pipeline: 'Pipeline',
  editor: 'Editor',
  transition: 'Transition',
  generator: 'Generator',
}

export const KIND_ICONS: Record<AppKind, string> = {
  storyboard: 'Clapperboard',
  ugc: 'Smartphone',
  pipeline: 'GitBranch',
  editor: 'Film',
  transition: 'ArrowLeftRight',
  generator: 'Wand2',
}

export const CATEGORY_LABELS: Record<string, string> = {
  creative: 'Creative',
  marketing: 'Marketing',
  cinema: 'Cinema',
  social: 'Social Media',
}

interface AppsState {
  builtInApps: AppDefinition[]
  customApps: AppDefinition[]
  instances: AppInstance[]
  selectedApp: AppDefinition | null
  activeInstance: AppInstance | null

  selectApp: (app: AppDefinition | null) => void
  createInstance: (appId: string) => string
  updateInstanceParams: (instanceId: string, params: Record<string, any>) => void
  removeInstance: (instanceId: string) => void
  setActiveInstance: (instance: AppInstance | null) => void
}

export const useAppsStore = create<AppsState>((set, get) => ({
  builtInApps: BUILTIN_APPS,
  customApps: [],
  instances: [],
  selectedApp: null,
  activeInstance: null,

  selectApp: (app) => set({ selectedApp: app }),

  createInstance: (appId) => {
    const app = [...get().builtInApps, ...get().customApps].find(a => a.id === appId)
    if (!app) return ''
    const id = crypto.randomUUID()
    const instance: AppInstance = {
      id,
      appId: app.id,
      name: `${app.name} #${get().instances.length + 1}`,
      params: { ...app.defaultParams },
      state: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set(s => ({ instances: [...s.instances, instance], activeInstance: instance }))
    return id
  },

  updateInstanceParams: (instanceId, params) =>
    set(s => ({
      instances: s.instances.map(i =>
        i.id === instanceId ? { ...i, params: { ...i.params, ...params }, updatedAt: Date.now() } : i
      ),
    })),

  removeInstance: (instanceId) =>
    set(s => ({
      instances: s.instances.filter(i => i.id !== instanceId),
      activeInstance: s.activeInstance?.id === instanceId ? null : s.activeInstance,
    })),

  setActiveInstance: (instance) => set({ activeInstance: instance }),
}))
