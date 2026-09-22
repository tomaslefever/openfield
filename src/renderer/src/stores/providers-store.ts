import { create } from 'zustand'
import type { ModelPricing } from '../lib/models'

export type ProviderId =
  | 'kie'
  | 'replicate'
  | 'fal'
  | 'elevenlabs'
  | 'machgen'
  | 'higgsfield'
  | 'local'
  | 'deepseek'
  | 'openai'
  | 'anthropic'
  | 'gemini'

export interface ProviderStatus {
  provider: ProviderId
  label: string
  kind: 'credits' | 'account' | 'dollars' | 'token'
  value?: number | string
  url?: string
}

export interface ProviderDef {
  id: ProviderId
  label: string
  description: string
  keyName: string
  keyPlaceholder: string
  helperUrl?: string
  category?: 'media' | 'llm'
}

export const PROVIDER_DEFS: ProviderDef[] = [
  // Generación Audiovisual (Video, Imagen, Audio)
  {
    id: 'machgen',
    label: 'MachGen',
    description: 'Dollar balance via MachGen API',
    keyName: 'machgenApiKey',
    keyPlaceholder: 'MGA_... (MachGen API key)',
    helperUrl: 'https://www.machgen.ai',
    category: 'media',
  },
  {
    id: 'higgsfield',
    label: 'Higgsfield AI',
    description: 'Seedance 2.0 via Higgsfield API',
    keyName: 'higgsfieldApiKey',
    keyPlaceholder: 'KEY_ID:KEY_SECRET (Higgsfield key)',
    helperUrl: 'https://console.higgsfield.ai',
    category: 'media',
  },
  {
    id: 'kie',
    label: 'KIE.ai',
    description: 'Credits balance via KIE API',
    keyName: 'openfieldApiKey',
    keyPlaceholder: 'Enter your KIE.ai API key',
    helperUrl: 'https://app.kie.ai',
    category: 'media',
  },
  {
    id: 'replicate',
    label: 'Replicate',
    description: 'Account username via Replicate API',
    keyName: 'replicateApiKey',
    keyPlaceholder: 'r8_... (Replicate token)',
    helperUrl: 'https://replicate.com/account/api-tokens',
    category: 'media',
  },
  {
    id: 'fal',
    label: 'fal.ai',
    description: 'Dollar balance via fal.ai API',
    keyName: 'falApiKey',
    keyPlaceholder: 'FAL_KEY (fal.ai key)',
    helperUrl: 'https://fal.ai/dashboard/keys',
    category: 'media',
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    description: 'AI voice synthesis (TTS)',
    keyName: 'elevenlabsApiKey',
    keyPlaceholder: 'sk_... (ElevenLabs API key)',
    helperUrl: 'https://elevenlabs.io/app/settings/api-keys',
    category: 'media',
  },
  // Modelos de Lenguaje (LLM)
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek V3 y razonamiento R1',
    keyName: 'deepseekApiKey',
    keyPlaceholder: 'sk-... (DeepSeek API key)',
    helperUrl: 'https://platform.deepseek.com/api_keys',
    category: 'llm',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o, GPT-4.5, o3-mini y modelos GPT',
    keyName: 'openaiApiKey',
    keyPlaceholder: 'sk-proj-... (OpenAI API key)',
    helperUrl: 'https://platform.openai.com/api-keys',
    category: 'llm',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Claude 3.7 Sonnet, Claude 3.5 Sonnet y Haiku',
    keyName: 'anthropicApiKey',
    keyPlaceholder: 'sk-ant-... (Anthropic API key)',
    helperUrl: 'https://console.anthropic.com/settings/keys',
    category: 'llm',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Gemini 2.5 Pro, 2.5 Flash y modelos Gemini',
    keyName: 'geminiApiKey',
    keyPlaceholder: 'AIza... (Gemini API key)',
    helperUrl: 'https://aistudio.google.com/app/apikey',
    category: 'llm',
  },
]

export function hasAnyConfiguredProvider(configured: Record<string, boolean>): boolean {
  return PROVIDER_DEFS.some((p) => Boolean(configured[p.id]))
}

export function getConfiguredProviderIds(configured: Record<string, boolean>): ProviderId[] {
  return PROVIDER_DEFS.filter((p) => Boolean(configured[p.id])).map((p) => p.id)
}

export function isModelConfigured(model: ModelPricing, configured: Record<string, boolean>): boolean {
  const provider = model.provider || 'kie'
  return !!configured[provider]
}

function buildInitialConfigured(): Record<string, boolean> {
  const res: Record<string, boolean> = {}
  PROVIDER_DEFS.forEach((p) => {
    res[p.id] = false
  })
  return res
}

interface ProvidersState {
  keys: Record<string, string>
  configuredProviders: Record<string, boolean>
  hasAnyProvider: boolean
  statuses: Record<string, ProviderStatus | null>
  loaded: boolean
  isRefreshing: boolean

  load: () => Promise<void>
  refreshBalances: () => Promise<void>
  setKey: (providerId: ProviderId, keyName: string, value: string) => Promise<void>
  removeKey: (providerId: ProviderId, keyName: string) => Promise<void>
}

export const useProvidersStore = create<ProvidersState>((set, get) => ({
  keys: {},
  configuredProviders: buildInitialConfigured(),
  hasAnyProvider: false,
  statuses: {},
  loaded: false,
  isRefreshing: false,

  load: async () => {
    try {
      const api = (window as any).electronAPI
      const settings = (await api?.settings?.getAll?.()) || {}

      const keys: Record<string, string> = {}
      PROVIDER_DEFS.forEach((p) => {
        if (settings[p.keyName]) keys[p.id] = settings[p.keyName]
      })
      if (!keys.kie && settings.kieApiKey) {
        keys.kie = settings.kieApiKey
      }

      const configured: Record<string, boolean> = {}
      PROVIDER_DEFS.forEach((p) => {
        const val = keys[p.id] || settings[p.keyName] || (p.id === 'kie' ? (settings.openfieldApiKey || settings.kieApiKey) : '')
        configured[p.id] = Boolean(val && String(val).trim())
      })

      const hasAny = hasAnyConfiguredProvider(configured)
      set({ keys, configuredProviders: configured, hasAnyProvider: hasAny, loaded: true })
      await get().refreshBalances()
    } catch (e) {
      console.warn('[providers-store] load error:', e)
      set({ loaded: true })
    }
  },

  refreshBalances: async () => {
    set({ isRefreshing: true })
    try {
      const api = (window as any).electronAPI
      const list: any[] = (await api?.balances?.list?.()) || []
      const map: Record<string, ProviderStatus | null> = {}
      list.forEach((b: any) => {
        if (b?.provider) map[b.provider] = b
      })
      set({ statuses: map, isRefreshing: false })
    } catch {
      set({ isRefreshing: false })
    }
  },

  setKey: async (providerId: ProviderId, keyName: string, value: string) => {
    const api = (window as any).electronAPI
    await api?.settings?.set?.(keyName, value)
    if (providerId === 'kie') {
      await api?.settings?.set?.('kieApiKey', value).catch(() => {})
    }

    set((state) => {
      const newKeys = { ...state.keys, [providerId]: value }
      const newConfigured = { ...state.configuredProviders, [providerId]: !!value.trim() }
      return {
        keys: newKeys,
        configuredProviders: newConfigured,
        hasAnyProvider: hasAnyConfiguredProvider(newConfigured),
      }
    })

    await get().refreshBalances()
  },

  removeKey: async (providerId: ProviderId, keyName: string) => {
    const api = (window as any).electronAPI
    await api?.settings?.set?.(keyName, '')
    if (providerId === 'kie') {
      await api?.settings?.set?.('kieApiKey', '').catch(() => {})
    }

    set((state) => {
      const newKeys = { ...state.keys }
      delete newKeys[providerId]
      const newConfigured = { ...state.configuredProviders, [providerId]: false }
      const newStatuses = { ...state.statuses, [providerId]: null }
      return {
        keys: newKeys,
        configuredProviders: newConfigured,
        hasAnyProvider: hasAnyConfiguredProvider(newConfigured),
        statuses: newStatuses,
      }
    })
  },
}))
