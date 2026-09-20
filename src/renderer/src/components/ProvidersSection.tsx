import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Check, Loader, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { ProviderLogo } from './icons/ProviderLogos'

interface ProviderStatus {
  provider: 'kie' | 'replicate' | 'fal' | 'hf' | 'elevenlabs' | 'machgen' | 'higgsfield'
  label: string
  kind: 'credits' | 'account' | 'dollars' | 'token'
  value?: number | string
  url?: string
}

interface ProviderDef {
  id: ProviderStatus['provider']
  label: string
  description: string
  icon: React.ReactNode
  keyName: string
  keyPlaceholder: string
  helperUrl?: string
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'machgen',
    label: 'MachGen',
    description: 'Dollar balance via MachGen API',
    icon: <ProviderLogo provider="machgen" size={18} />,
    keyName: 'machgenApiKey',
    keyPlaceholder: 'MGA_... (MachGen API key)',
    helperUrl: 'https://www.machgen.ai',
  },
  {
    id: 'higgsfield',
    label: 'Higgsfield AI',
    description: 'Seedance 2.0 via Higgsfield API',
    icon: <ProviderLogo provider="higgsfield" size={18} />,
    keyName: 'higgsfieldApiKey',
    keyPlaceholder: 'KEY_ID:KEY_SECRET (Higgsfield key)',
    helperUrl: 'https://console.higgsfield.ai',
  },
  {
    id: 'kie',
    label: 'KIE.ai',
    description: 'Credits balance via KIE API',
    icon: <ProviderLogo provider="kie" size={18} />,
    keyName: 'openfieldApiKey',
    keyPlaceholder: 'Enter your KIE.ai API key',
    helperUrl: 'https://app.kie.ai',
  },
  {
    id: 'replicate',
    label: 'Replicate',
    description: 'Account username via Replicate API',
    icon: <ProviderLogo provider="replicate" size={18} className="text-surface-100" />,
    keyName: 'replicateApiKey',
    keyPlaceholder: 'r8_... (Replicate token)',
    helperUrl: 'https://replicate.com/account/api-tokens',
  },
  {
    id: 'fal',
    label: 'fal.ai',
    description: 'Dollar balance via fal.ai API',
    icon: <ProviderLogo provider="fal" size={18} />,
    keyName: 'falApiKey',
    keyPlaceholder: 'FAL_KEY (fal.ai key)',
    helperUrl: 'https://fal.ai/dashboard/keys',
  },
  {
    id: 'hf',
    label: 'HuggingFace',
    description: 'Token for gated models (FLUX...)',
    icon: <ProviderLogo provider="hf" size={18} />,
    keyName: 'hfToken',
    keyPlaceholder: 'hf_... (HuggingFace token)',
    helperUrl: 'https://huggingface.co/settings/tokens',
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    description: 'AI voice synthesis (TTS)',
    icon: <ProviderLogo provider="elevenlabs" size={18} className="text-surface-100" />,
    keyName: 'elevenlabsApiKey',
    keyPlaceholder: 'sk_... (ElevenLabs API key)',
    helperUrl: 'https://elevenlabs.io/app/settings/api-keys',
  },
]

export function ProvidersSection() {
  const api = () => (window as any).electronAPI
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus | null>>({})
  const [editing, setEditing] = useState<ProviderDef['id'] | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState<ProviderDef['id'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const refreshStatus = useCallback(async () => {
    try {
      const list: any[] = (await api()?.balances?.list?.()) || []
      const map: Record<string, ProviderStatus | null> = {}
      list.forEach((b: any) => { if (b?.provider) map[b.provider] = b })
      const settings: any = await api()?.settings?.getAll?.()
      if (settings?.hfToken) {
        map.hf = { provider: 'hf', label: 'HuggingFace', kind: 'token' }
      }
      setStatuses(map)
    } catch {
      /* offline */
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      const settings: any = await api()?.settings?.getAll?.()
      if (settings) {
        const k: Record<string, string> = {}
        PROVIDERS.forEach((p) => { if (settings[p.keyName]) k[p.id] = settings[p.keyName] })
        setKeys(k)
      }
      setLoaded(true)
      refreshStatus()
    })()
  }, [refreshStatus])

  const handleSave = async (p: ProviderDef) => {
    const value = draft.trim()
    if (!value) return
    setSaving(p.id)
    setError(null)
    try {
      await api()?.settings?.set(p.keyName, value)
      setKeys((prev) => ({ ...prev, [p.id]: value }))
      setEditing(null)
      setDraft('')
      await refreshStatus()
    } catch (err: any) {
      setError(err?.message || 'Failed to save API key')
    } finally {
      setSaving(null)
    }
  }

  const handleRemove = async (p: ProviderDef) => {
    await api()?.settings?.set(p.keyName, '')
    setKeys((prev) => {
      const next = { ...prev }
      delete next[p.id]
      return next
    })
    setStatuses((prev) => ({ ...prev, [p.id]: null }))
  }

  const handleConfigure = (p: ProviderDef) => {
    setEditing(p.id)
    setDraft(keys[p.id] || '')
    setError(null)
  }

  const formatStatus = (s: ProviderStatus | null | undefined): string | null => {
    if (!s) return null
    if (s.kind === 'credits') return `${Number(s.value || 0).toLocaleString()} credits`
    if (s.kind === 'dollars') return `$${(s.value as number).toFixed(2)}`
    if (s.kind === 'account') return String(s.value || 'Connected')
    return 'Connected'
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound size={16} className="text-accent-400" />
        <h2 className="text-sm font-semibold text-surface-100">Providers</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PROVIDERS.map((p) => {
          const configured = !!keys[p.id]
          const status = statuses[p.id]
          const statusText = formatStatus(status)
          return (
            <Card key={p.id} className="bg-surface-900 border-surface-800">
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-950 border border-surface-700/60 p-1 shadow-sm">
                    {p.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-surface-100 truncate">{p.label}</p>
                    <p className="text-[10px] text-surface-500 truncate">{p.description}</p>
                  </div>
                  {configured ? (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      <Check size={10} /> Connected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-surface-800 px-2 py-0.5 text-[10px] font-medium text-surface-500">
                      Not configured
                    </span>
                  )}
                </div>

                {configured && statusText && (
                  <div className="flex items-center justify-between rounded-lg bg-surface-950/60 border border-surface-800 px-3 py-2">
                    <span className="text-[11px] text-surface-500">Status</span>
                    <span className="text-xs font-medium text-surface-100">{statusText}</span>
                  </div>
                )}

                {editing === p.id ? (
                  <div className="flex flex-col gap-2">
                    <Input
                      type="password"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={p.keyPlaceholder}
                      className="h-8 text-xs bg-surface-950 border-surface-700"
                      autoFocus
                    />
                    {error && <p className="text-[10px] text-red-400">{error}</p>}
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => handleSave(p)}
                        disabled={!draft.trim() || saving === p.id}
                        className="h-7 text-xs"
                      >
                        {saving === p.id ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditing(null); setDraft(''); setError(null) }}
                        className="h-7 text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : configured ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleConfigure(p)}
                      className="h-7 text-xs"
                    >
                      Update key
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemove(p)}
                      className="h-7 text-xs text-surface-500 hover:text-red-400"
                    >
                      Disconnect
                    </Button>
                    {status?.url && (
                      <a
                        href={status.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto flex items-center gap-1 text-[10px] text-accent-400 hover:text-accent-300"
                      >
                        Dashboard <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleConfigure(p)}
                    className="h-7 w-full text-xs"
                  >
                    <KeyRound size={12} /> Configure
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {!loaded && (
        <div className="flex items-center justify-center py-4 text-surface-500">
          <Loader size={14} className="animate-spin mr-2" /> Loading providers...
        </div>
      )}
    </div>
  )
}
