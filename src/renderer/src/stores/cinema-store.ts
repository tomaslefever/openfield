import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { extractDurationFromText } from './short-drama-store'

export type ElementType = 'character' | 'object' | 'scenario'
export type ShotType = 'extreme-close-up' | 'close-up' | 'medium-close-up' | 'medium' | 'medium-long' | 'long' | 'extreme-long' | 'two-shot' | 'over-the-shoulder' | 'point-of-view' | 'dutch-angle' | 'aerial' | 'tracking' | 'panning' | 'static'

export const SHOT_TYPE_LABELS: Record<ShotType, string> = {
  'extreme-close-up': 'Extreme Close-Up',
  'close-up': 'Close-Up',
  'medium-close-up': 'Medium Close-Up',
  'medium': 'Medium Shot',
  'medium-long': 'Medium Long Shot',
  'long': 'Long Shot',
  'extreme-long': 'Extreme Long Shot',
  'two-shot': 'Two Shot',
  'over-the-shoulder': 'Over the Shoulder',
  'point-of-view': 'Point of View',
  'dutch-angle': 'Dutch Angle',
  'aerial': 'Aerial / Drone',
  'tracking': 'Tracking Shot',
  'panning': 'Panning Shot',
  'static': 'Static',
}

export type ScriptType = 'spot' | 'short' | 'feature' | 'free'

export const SCRIPT_TYPE_LABELS: Record<ScriptType, string> = {
  spot: 'Spot Publicitario',
  short: 'Cortometraje',
  feature: 'Largometraje',
  free: 'Idea Libre',
}

export const GENRES = [
  'Drama', 'Comedia', 'Terror / Suspenso', 'Ciencia Ficción', 'Acción / Aventura',
  'Fantasía', 'Romance', 'Documental', 'Thriller', 'Experimental', 'Animación', 'Musical',
] as const

export const TONES = [
  'Épico / Grandioso', 'Íntimo / Personal', 'Oscuro / Noir', 'Ligero / Divertido',
  'Melancólico', 'Tensión constante', 'Surrealista', 'Realista / Crudo', 'Poético',
] as const

export const VISUAL_STYLES = [
  'Cinematográfico clásico', 'High contrast / Noir', 'Desaturado / Frío', 'Cálido / Dorado',
  'Vibrante / Saturado', 'Pastel / Suave', 'Found footage', 'Minimalista / Limpio',
] as const

export const AUDIENCES = [
  'General', 'Infantil', 'Adolescente', 'Adulto', 'Familiar', 'Nicho / Arte',
] as const

export type ProjectPhase = 'concept' | 'characters' | 'script' | 'storyboard' | 'editor'

export const PHASE_LABELS: Record<ProjectPhase, string> = {
  concept: 'Concepto',
  characters: 'Personajes',
  script: 'Guión',
  storyboard: 'Storyboard',
  editor: 'Editor',
}

export interface ProjectConfig {
  phase: ProjectPhase
  scriptType: ScriptType
  genre: string
  tone: string
  visualStyle: string
  targetDurationMin: number
  language: string
  logline: string
  audience: string
  theme: string
  storySummary: string
}

export const DEFAULT_CONFIG: ProjectConfig = {
  phase: 'concept',
  scriptType: 'free',
  genre: 'Drama',
  tone: 'Realista / Crudo',
  visualStyle: 'Cinematográfico clásico',
  targetDurationMin: 5,
  language: 'Español',
  logline: '',
  audience: 'General',
  theme: '',
  storySummary: '',
}

export interface ScriptVersion {
  id: string
  content: string
  label: string
  timestamp: number
}

export interface CinemaProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface ScriptScene {
  id: string
  title: string
  description: string
  order: number
  duration?: number
}

export interface ScriptShot {
  id: string
  sceneId: string
  description: string
  order: number
  duration?: number
}

export interface CinemaElement {
  id: string
  name: string
  type: ElementType
  description: string
  stylesheet: string
  voiceId: string
  imageBase64: string
}

export interface StoryboardShot {
  id: string
  sceneId: string
  description: string
  prompt: string
  shotType: ShotType
  characterIds: string[]
  objectIds: string[]
  scenarioIds: string[]
  generatedImageBase64: string
  generatedVideoPath: string
  isGenerating: boolean
}

export interface EditorClip {
  id: string
  label: string
  src: string
  type: 'video' | 'audio' | 'image'
  startTime: number
  duration: number
  track: number
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

interface CinemaState {
  projects: CinemaProject[]
  currentProjectId: string | null

  scripts: Record<string, string>
  scenes: Record<string, ScriptScene[]>
  shots: Record<string, ScriptShot[]>
  elements: Record<string, CinemaElement[]>
  storyboard: Record<string, StoryboardShot[]>
  editorClips: Record<string, EditorClip[]>

  scriptTypes: Record<string, ScriptType>
  scriptVersions: Record<string, ScriptVersion[]>
  projectConfigs: Record<string, ProjectConfig>

  currentProject: () => CinemaProject | null

  createProject: (name: string, config?: Partial<ProjectConfig>) => string
  deleteProject: (id: string) => void
  setCurrentProject: (id: string) => void
  renameProject: (id: string, name: string) => void
  updateProjectConfig: (projectId: string, config: Partial<ProjectConfig>) => void

  setScript: (projectId: string, content: string) => void
  parseScenes: (projectId: string) => void
  setScriptType: (projectId: string, type: ScriptType) => void
  saveScriptVersion: (projectId: string, label: string) => void
  restoreScriptVersion: (projectId: string, versionId: string) => void
  deleteScriptVersion: (projectId: string, versionId: string) => void

  addElement: (projectId: string, el: Omit<CinemaElement, 'id'>) => void
  updateElement: (projectId: string, id: string, updates: Partial<CinemaElement>) => void
  deleteElement: (projectId: string, id: string) => void

  addStoryboardShot: (projectId: string, shot: Omit<StoryboardShot, 'id'>) => void
  updateStoryboardShot: (projectId: string, id: string, updates: Partial<StoryboardShot>) => void
  deleteStoryboardShot: (projectId: string, id: string) => void

  addEditorClip: (projectId: string, clip: Omit<EditorClip, 'id'>) => void
  removeEditorClip: (projectId: string, id: string) => void
  updateEditorClip: (projectId: string, id: string, updates: Partial<EditorClip>) => void
  reorderEditorClips: (projectId: string, fromIndex: number, toIndex: number) => void
}

export const useCinemaStore = create<CinemaState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,
      scripts: {},
      scenes: {},
      shots: {},
      elements: {},
      storyboard: {},
      editorClips: {},
      scriptTypes: {},
      scriptVersions: {},
      projectConfigs: {},

      currentProject: () => {
        const { projects, currentProjectId } = get()
        return projects.find(p => p.id === currentProjectId) || null
      },

      createProject: (name: string, config?: Partial<ProjectConfig>) => {
        const id = uid()
        const now = Date.now()
        const project: CinemaProject = { id, name, createdAt: now, updatedAt: now }
        const mergedConfig: ProjectConfig = { ...DEFAULT_CONFIG, ...config }
        set(s => ({
          projects: [...s.projects, project],
          currentProjectId: id,
          scripts: { ...s.scripts, [id]: '' },
          scenes: { ...s.scenes, [id]: [] },
          shots: { ...s.shots, [id]: [] },
          elements: { ...s.elements, [id]: [] },
          storyboard: { ...s.storyboard, [id]: [] },
          editorClips: { ...s.editorClips, [id]: [] },
          scriptTypes: { ...s.scriptTypes, [id]: mergedConfig.scriptType },
          scriptVersions: { ...s.scriptVersions, [id]: [] },
          projectConfigs: { ...s.projectConfigs, [id]: mergedConfig },
        }))
        return id
      },

      deleteProject: (id: string) => {
        set(s => {
          const { [id]: _scr, ...restScripts } = s.scripts
          const { [id]: _scn, ...restScenes } = s.scenes
          const { [id]: _sht, ...restShots } = s.shots
          const { [id]: _el, ...restElements } = s.elements
          const { [id]: _sb, ...restStoryboard } = s.storyboard
          const { [id]: _ed, ...restEditor } = s.editorClips
          const { [id]: _st, ...restScriptTypes } = s.scriptTypes
          const { [id]: _sv, ...restScriptVersions } = s.scriptVersions
          const { [id]: _pc, ...restConfigs } = s.projectConfigs
          const remaining = s.projects.filter(p => p.id !== id)
          return {
            projects: remaining,
            currentProjectId: s.currentProjectId === id ? (remaining[0]?.id || null) : s.currentProjectId,
            scripts: restScripts,
            scenes: restScenes,
            shots: restShots,
            elements: restElements,
            storyboard: restStoryboard,
            editorClips: restEditor,
            scriptTypes: restScriptTypes,
            scriptVersions: restScriptVersions,
            projectConfigs: restConfigs,
          }
        })
      },

      setCurrentProject: (id: string) => set({ currentProjectId: id }),

      renameProject: (id: string, name: string) => set(s => ({
        projects: s.projects.map(p => p.id === id ? { ...p, name, updatedAt: Date.now() } : p),
      })),

      setScript: (projectId: string, content: string) => {
        set(s => ({
          scripts: { ...s.scripts, [projectId]: content },
        }))
        get().parseScenes(projectId)
      },

      parseScenes: (projectId: string) => {
        const script = get().scripts[projectId] || ''
        const lines = script.split('\n')
        const parsedScenes: ScriptScene[] = []
        const parsedShots: ScriptShot[] = []
        let currentSceneId = ''
        let currentSceneTitle = ''
        let currentSceneDesc = ''
        let currentSceneDuration: number | undefined
        let sceneOrder = 0
        let shotOrder = 0

        for (const line of lines) {
          const sceneMatch = line.match(/^##\s+(.+)/)
          const shotMatch = line.match(/^###\s+(.+)/)

          if (sceneMatch || shotMatch) {
            if (currentSceneId && currentSceneTitle) {
              const sceneDur = currentSceneDuration || extractDurationFromText(currentSceneTitle) || extractDurationFromText(currentSceneDesc)
              parsedScenes.push({
                id: currentSceneId,
                title: currentSceneTitle,
                description: currentSceneDesc.trim(),
                order: sceneOrder,
                duration: sceneDur,
              })
              sceneOrder++
            }
            if (sceneMatch) {
              currentSceneId = uid()
              const rawTitle = sceneMatch[1].trim()
              currentSceneDuration = extractDurationFromText(rawTitle)
              currentSceneTitle = rawTitle
              currentSceneDesc = ''
              shotOrder = 0
            }
            if (shotMatch && currentSceneId) {
              const shotDesc = shotMatch[1].trim()
              const shotDur = extractDurationFromText(shotDesc)
              parsedShots.push({
                id: uid(),
                sceneId: currentSceneId,
                description: shotDesc,
                order: shotOrder,
                duration: shotDur,
              })
              shotOrder++
            }
          } else if (currentSceneId && line.trim()) {
            currentSceneDesc += (currentSceneDesc ? ' ' : '') + line.trim()
            if (!currentSceneDuration) {
              currentSceneDuration = extractDurationFromText(line.trim())
            }
          }
        }

        if (currentSceneId && currentSceneTitle) {
          const sceneDur = currentSceneDuration || extractDurationFromText(currentSceneTitle) || extractDurationFromText(currentSceneDesc)
          parsedScenes.push({
            id: currentSceneId,
            title: currentSceneTitle,
            description: currentSceneDesc.trim(),
            order: sceneOrder,
            duration: sceneDur,
          })
        }

        set(s => ({
          scenes: { ...s.scenes, [projectId]: parsedScenes },
          shots: { ...s.shots, [projectId]: parsedShots },
        }))
      },

      setScriptType: (projectId: string, type: ScriptType) => set(s => ({
        scriptTypes: { ...s.scriptTypes, [projectId]: type },
      })),

      updateProjectConfig: (projectId: string, config: Partial<ProjectConfig>) => set(s => {
        const existing = s.projectConfigs[projectId] || DEFAULT_CONFIG
        return {
          projectConfigs: { ...s.projectConfigs, [projectId]: { ...existing, ...config, scriptType: config.scriptType || existing.scriptType } },
          scriptTypes: config.scriptType ? { ...s.scriptTypes, [projectId]: config.scriptType } : s.scriptTypes,
        }
      }),

      saveScriptVersion: (projectId: string, label: string) => {
        const content = get().scripts[projectId] || ''
        if (!content.trim()) return
        const version: ScriptVersion = {
          id: uid(),
          content,
          label: label || `v${(get().scriptVersions[projectId]?.length || 0) + 1}`,
          timestamp: Date.now(),
        }
        set(s => ({
          scriptVersions: {
            ...s.scriptVersions,
            [projectId]: [...(s.scriptVersions[projectId] || []), version],
          },
        }))
      },

      restoreScriptVersion: (projectId: string, versionId: string) => {
        const versions = get().scriptVersions[projectId] || []
        const version = versions.find(v => v.id === versionId)
        if (!version) return
        set(s => ({
          scripts: { ...s.scripts, [projectId]: version.content },
        }))
        get().parseScenes(projectId)
      },

      deleteScriptVersion: (projectId: string, versionId: string) => set(s => ({
        scriptVersions: {
          ...s.scriptVersions,
          [projectId]: (s.scriptVersions[projectId] || []).filter(v => v.id !== versionId),
        },
      })),

      addElement: (projectId: string, el: Omit<CinemaElement, 'id'>) => set(s => ({
        elements: {
          ...s.elements,
          [projectId]: [...(s.elements[projectId] || []), { ...el, id: uid() }],
        },
      })),

      updateElement: (projectId: string, id: string, updates: Partial<CinemaElement>) => set(s => ({
        elements: {
          ...s.elements,
          [projectId]: (s.elements[projectId] || []).map(e => e.id === id ? { ...e, ...updates } : e),
        },
      })),

      deleteElement: (projectId: string, id: string) => set(s => ({
        elements: {
          ...s.elements,
          [projectId]: (s.elements[projectId] || []).filter(e => e.id !== id),
        },
        storyboard: {
          ...s.storyboard,
          [projectId]: (s.storyboard[projectId] || []).map(sb => ({
            ...sb,
            characterIds: sb.characterIds.filter(cid => cid !== id),
            objectIds: sb.objectIds.filter(oid => oid !== id),
            scenarioIds: sb.scenarioIds.filter(sid => sid !== id),
          })),
        },
      })),

      addStoryboardShot: (projectId: string, shot: Omit<StoryboardShot, 'id'>) => set(s => ({
        storyboard: {
          ...s.storyboard,
          [projectId]: [...(s.storyboard[projectId] || []), { ...shot, id: uid() }],
        },
      })),

      updateStoryboardShot: (projectId: string, id: string, updates: Partial<StoryboardShot>) => set(s => ({
        storyboard: {
          ...s.storyboard,
          [projectId]: (s.storyboard[projectId] || []).map(sb => sb.id === id ? { ...sb, ...updates } : sb),
        },
      })),

      deleteStoryboardShot: (projectId: string, id: string) => set(s => ({
        storyboard: {
          ...s.storyboard,
          [projectId]: (s.storyboard[projectId] || []).filter(sb => sb.id !== id),
        },
      })),

      addEditorClip: (projectId: string, clip: Omit<EditorClip, 'id'>) => set(s => ({
        editorClips: {
          ...s.editorClips,
          [projectId]: [...(s.editorClips[projectId] || []), { ...clip, id: uid() }],
        },
      })),

      removeEditorClip: (projectId: string, id: string) => set(s => ({
        editorClips: {
          ...s.editorClips,
          [projectId]: (s.editorClips[projectId] || []).filter(c => c.id !== id),
        },
      })),

      updateEditorClip: (projectId: string, id: string, updates: Partial<EditorClip>) => set(s => ({
        editorClips: {
          ...s.editorClips,
          [projectId]: (s.editorClips[projectId] || []).map(c => c.id === id ? { ...c, ...updates } : c),
        },
      })),

      reorderEditorClips: (projectId: string, fromIndex: number, toIndex: number) => set(s => {
        const clips = [...(s.editorClips[projectId] || [])]
        const [removed] = clips.splice(fromIndex, 1)
        clips.splice(toIndex, 0, removed)
        return {
          editorClips: { ...s.editorClips, [projectId]: clips },
        }
      }),
    }),
    {
      name: 'openfield-cinema-studio',
      version: 1,
      partialize: (state) => ({
        projects: state.projects,
        currentProjectId: state.currentProjectId,
        scripts: state.scripts,
        scenes: state.scenes,
        shots: state.shots,
        elements: state.elements,
        storyboard: state.storyboard,
        editorClips: state.editorClips,
        scriptTypes: state.scriptTypes,
        scriptVersions: state.scriptVersions,
        projectConfigs: state.projectConfigs,
      }),
    }
  )
)
