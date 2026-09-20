import React, { useState } from 'react'
import {
  KeyRound,
  Check,
  Loader,
  ExternalLink,
  Zap,
  User,
  DollarSign,
  Cloud,
  AudioLines,
  Sparkles,
  RefreshCw,
  Eye,
  EyeOff,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  useProvidersStore,
  PROVIDER_DEFS,
  type ProviderDef,
  type ProviderStatus,
} from '../stores/providers-store'

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  machgen: <DollarSign size={18} />,
  higgsfield: <Sparkles size={18} />,
  kie: <Zap size={18} />,
  replicate: <User size={18} />,
  fal: <DollarSign size={18} />,
  hf: <Cloud size={18} />,
  elevenlabs: <AudioLines size={18} />,
}

export function ProvidersPage() {
  const {
    keys,
    configuredProviders,
    statuses,
    loaded,
    isRefreshing,
    refreshBalances,
    setKey,
    removeKey,
  } = useProvidersStore()

  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleStartEdit = (p: ProviderDef) => {
    setEditing(p.id)
    setDraft(keys[p.id] || '')
    setShowSecret(false)
    setError(null)
  }

  const handleCancelEdit = () => {
    setEditing(null)
    setDraft('')
    setShowSecret(false)
    setError(null)
  }

  const handleSaveKey = async (p: ProviderDef) => {
    const value = draft.trim()
    if (!value) return
    setSaving(p.id)
    setError(null)
    try {
      await setKey(p.id, p.keyName, value)
      setEditing(null)
      setDraft('')
      setShowSecret(false)
    } catch (err: any) {
      setError(err?.message || 'Failed to save API key')
    } finally {
      setSaving(null)
    }
  }

  const handleRemoveKey = async (p: ProviderDef) => {
    await removeKey(p.id, p.keyName)
    if (editing === p.id) {
      handleCancelEdit()
    }
  }

  const formatStatus = (s: ProviderStatus | null | undefined): string | null => {
    if (!s) return null
    if (s.kind === 'credits') return `${Number(s.value || 0).toLocaleString()} credits`
    if (s.kind === 'dollars') return `$${(s.value as number).toFixed(2)}`
    if (s.kind === 'account') return String(s.value || 'Connected')
    return 'Connected'
  }

  const configuredCount = Object.values(configuredProviders).filter(Boolean).length

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex-1 p-6 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-surface-800">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-accent-600/20 text-accent-400 border border-accent-500/20">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-surface-100 tracking-tight">Providers</h1>
                  <p className="text-xs text-surface-400 mt-0.5">
                    Configura tus credenciales de API para desbloquear y utilizar los modelos de cada proveedor.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs px-2.5 py-1 rounded-full bg-surface-800 text-surface-300 border border-surface-700 font-medium">
                {configuredCount} de {PROVIDER_DEFS.length} configurados
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshBalances()}
                disabled={isRefreshing}
                className="h-8 gap-1.5 text-xs bg-surface-900 border-surface-700 hover:bg-surface-800 text-surface-300"
              >
                <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-accent-400' : ''} />
                Refrescar saldos
              </Button>
            </div>
          </div>

          {/* Provider Cards List - Full Width Cards */}
          <div className="space-y-3.5">
            {PROVIDER_DEFS.map((p) => {
              const isConfigured = !!keys[p.id]
              const status = statuses[p.id]
              const statusText = formatStatus(status)
              const isEditing = editing === p.id

              return (
                <Card
                  key={p.id}
                  className="w-full bg-surface-900/90 border-surface-800/90 hover:border-surface-700/80 transition-all shadow-sm overflow-hidden"
                >
                  <CardContent className="p-5 flex flex-col gap-4">
                    {/* Main Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* Left: Icon, Name, Description */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-600/15 text-accent-400 border border-accent-500/20 shadow-inner">
                          {PROVIDER_ICONS[p.id] || <KeyRound size={18} />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-surface-100">{p.label}</h3>
                            {isConfigured ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                                <Check size={10} /> Conectado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-surface-800 px-2 py-0.5 text-[10px] font-medium text-surface-500">
                                No configurado
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-surface-400 mt-0.5">{p.description}</p>
                        </div>
                      </div>

                      {/* Right: Balance & Actions */}
                      <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
                        {isConfigured && statusText && (
                          <div className="flex items-center gap-1.5 rounded-lg bg-surface-950/80 border border-surface-800 px-3 py-1.5 text-xs text-surface-200">
                            <span className="text-[11px] text-surface-500">Saldo:</span>
                            <span className="font-semibold text-accent-400">{statusText}</span>
                          </div>
                        )}

                        {isConfigured ? (
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleStartEdit(p)}
                              className="h-8 text-xs bg-surface-800/80 hover:bg-surface-700 text-surface-200"
                            >
                              Cambiar clave
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveKey(p)}
                              className="h-8 px-2.5 text-xs text-surface-400 hover:text-red-400 hover:bg-red-500/10"
                              title="Desconectar proveedor"
                            >
                              <Trash2 size={13} />
                            </Button>
                            {p.helperUrl && (
                              <a
                                href={p.helperUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-2 text-surface-400 hover:text-accent-400 transition-colors"
                                title="Abrir consola del proveedor"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleStartEdit(p)}
                              className="h-8 text-xs bg-accent-600 hover:bg-accent-500 text-white font-medium gap-1.5 px-3.5"
                            >
                              <KeyRound size={13} /> Configurar
                            </Button>
                            {p.helperUrl && (
                              <a
                                href={p.helperUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-2 text-surface-400 hover:text-accent-400 transition-colors"
                                title="Obtener API Key"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Inline Editor Form */}
                    {isEditing && (
                      <div className="mt-2 pt-4 border-t border-surface-800/80 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-surface-300">
                            API Key / Token para {p.label}
                          </label>
                          {p.helperUrl && (
                            <a
                              href={p.helperUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-accent-400 hover:text-accent-300 flex items-center gap-1"
                            >
                              Obtener clave aquí <ExternalLink size={10} />
                            </a>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Input
                              type={showSecret ? 'text' : 'password'}
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              placeholder={p.keyPlaceholder}
                              className="h-9 text-xs bg-surface-950 border-surface-700 pr-9 font-mono"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveKey(p)
                                if (e.key === 'Escape') handleCancelEdit()
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowSecret(!showSecret)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
                              title={showSecret ? 'Ocultar' : 'Mostrar'}
                            >
                              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>

                          <Button
                            size="sm"
                            onClick={() => handleSaveKey(p)}
                            disabled={!draft.trim() || saving === p.id}
                            className="h-9 px-4 text-xs bg-accent-600 hover:bg-accent-500 text-white gap-1.5"
                          >
                            {saving === p.id ? (
                              <Loader size={13} className="animate-spin" />
                            ) : (
                              <Check size={13} />
                            )}
                            Guardar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleCancelEdit}
                            className="h-9 text-xs text-surface-400 hover:text-surface-200"
                          >
                            Cancelar
                          </Button>
                        </div>

                        {error && <p className="text-[11px] text-red-400">{error}</p>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {!loaded && (
            <div className="flex items-center justify-center py-8 text-surface-500 text-sm">
              <Loader size={16} className="animate-spin mr-2 text-accent-400" /> Cargando proveedores...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
