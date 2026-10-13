import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Loader, Sparkles } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { ProviderLogo } from '../icons/ProviderLogos'
import { VIDEO_MODELS, calcVideoCost, cleanModelName, type ModelPricing } from '../../lib/models'
import { useProvidersStore, isModelConfigured, PROVIDER_DEFS } from '../../stores/providers-store'
import { srcUrl } from '../../services/file-url'

/** Grok Upscale (KIE): re-runs a completed grok-imagine task, so it only applies to those videos */
const GROK_UPSCALE: ModelPricing = {
  name: 'Grok Upscale', category: 'Grok', unit: 'video', provider: 'kie',
  t2vId: 'grok-imagine/upscale', prices: [{ resolution: '1080p', cost: 0 }],
}

/** Video models that take one source video and return it upscaled */
function upscaleModels(sourceModel: string): ModelPricing[] {
  const models = VIDEO_MODELS.filter(m =>
    m.t2vId === 'philz1337x/crystal-video-upscaler' ||
    (m.t2vId?.endsWith('/upscale') && m.durationFromInputVideo))
  return sourceModel.startsWith('grok-imagine') ? [GROK_UPSCALE, ...models] : models
}

function providerLabel(id: string) {
  return PROVIDER_DEFS.find(p => p.id === id)?.label || id
}

/** Length of the source video in seconds, read from its metadata (0 when it can't be read) */
function probeDuration(src: string): Promise<number> {
  return new Promise(resolve => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    const done = (secs: number) => { v.removeAttribute('src'); v.load(); resolve(Number.isFinite(secs) ? secs : 0) }
    v.onloadedmetadata = () => done(v.duration)
    v.onerror = () => done(0)
    v.src = srcUrl(src) || src
  })
}

function estimate(model: ModelPricing, secs: number) {
  if (!secs || model === GROK_UPSCALE) return null
  const resolution = model.prices[0]?.resolution
  const cost = model.durationFromInputVideo
    ? calcVideoCost(model, { resolution, inputVideoSeconds: secs })
    : calcVideoCost(model, { resolution, requestedSeconds: Math.ceil(secs) })
  return cost.totalCredits > 0 ? cost : null
}

/**
 * Quick upscale of a finished video from the asset modal: a dropdown with every video upscaler
 * (Topaz on MachGen, Crystal on Replicate, Grok Upscale on KIE for Grok videos) and its provider.
 * Picking one asks for an inline confirmation; confirming queues a new task with this video as the
 * source (the result lands as a new asset).
 */
export function UpscaleVideoButton({ asset, src, params, onQueued }: {
  asset: any
  /** Local path or URL of the source video */
  src: string
  params: any
  /** The upscale was queued (the modal reloads the grid and closes) */
  onQueued?: () => void
}) {
  const configured = useProvidersStore(s => s.configuredProviders)
  const loaded = useProvidersStore(s => s.loaded)
  const load = useProvidersStore(s => s.load)
  const [open, setOpen] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [confirming, setConfirming] = useState<ModelPricing | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sourceModel = String(params?.model || asset.modelUsed || '')
  const models = useMemo(() => upscaleModels(sourceModel), [sourceModel])

  useEffect(() => { if (!loaded) load() }, [loaded, load])
  useEffect(() => {
    setConfirming(null); setError(null); setSending(false)
    let alive = true
    const fallback = Number(params?.duration) || 0
    setSeconds(fallback)
    if (src) probeDuration(src).then(secs => { if (alive && secs > 0) setSeconds(secs) })
    return () => { alive = false }
  }, [asset.id, src])

  const run = async (model: ModelPricing) => {
    const api = (window as any).electronAPI
    const provider = model.provider || 'kie'
    const modelId = model.t2vId!
    setSending(true)
    setError(null)
    try {
      const prompt = asset.prompt ? `Upscale: ${asset.prompt}` : 'Video upscale'
      if (model === GROK_UPSCALE) {
        await api?.openfield.upscaleVideo(asset.id, '1080p')
      } else {
        const ref: any = { assetId: asset.id, localPath: asset.localPath || undefined, mime: 'video/mp4', duration: seconds || undefined, base64: '' }
        // Replicate takes the video inline as a data URI
        if (provider === 'replicate') {
          const res = await api?.assets.readBase64([asset.id])
          ref.base64 = res?.[0]?.base64 || ''
          ref.mime = res?.[0]?.mime || 'video/mp4'
          if (!ref.base64) throw new Error('No se pudo leer el video de origen')
        }
        const payload = {
          mode: 'video', type: 'video', prompt, model: modelId, provider,
          resolution: model.prices[0]?.resolution, videoRefs: [ref],
        }
        if (provider === 'machgen') await api?.machgen.generate(payload)
        else if (provider === 'replicate') await api?.replicate.generate(payload)
        else throw new Error(`Proveedor no soportado: ${provider}`)
      }
      setConfirming(null)
      onQueued?.()
    } catch (err: any) {
      setError(String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setSending(false)
    }
  }

  if (confirming) {
    const provider = confirming.provider || 'kie'
    const cost = estimate(confirming, seconds)
    return (
      <div>
        <div className="flex items-center justify-between gap-2 min-h-8 rounded-lg bg-surface-soft border border-hairline pl-3 pr-1 py-1">
          <span className="flex items-center gap-2 min-w-0 text-meta text-ink-muted">
            <span className="shrink-0"><ProviderLogo provider={provider} size={14} /></span>
            <span className="truncate" title={`${cleanModelName(confirming.name)} · ${providerLabel(provider)}`}>
              ¿Upscale con <span className="text-ink">{cleanModelName(confirming.name)}</span>
              {cost ? <span className="tabular-nums"> · ${cost.totalDollars.toFixed(2)}</span> : null}?
            </span>
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => { setConfirming(null); setError(null) }} disabled={sending} className="btn-ghost text-xs">Cancelar</button>
            <button onClick={() => run(confirming)} disabled={sending} autoFocus
              className="btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-60">
              {sending && <Loader size={12} className="animate-spin" />} Confirmar
            </button>
          </div>
        </div>
        {error && <p className="mt-1 text-[10px] text-red-600 dark:text-red-400 text-center">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            title="Escalar este video con un modelo de upscale"
            className="btn-secondary w-full inline-flex items-center justify-center gap-1.5 text-xs disabled:opacity-60"
          >
            <Sparkles size={13} /> <span className="truncate">Upscale</span>
            <ChevronDown size={13} className="shrink-0 opacity-70" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-1.5"
          // Esc closes the dropdown only, not the asset modal behind it
          onEscapeKeyDown={(e) => e.stopPropagation()}
        >
          <p className="eyebrow px-2.5 pt-1.5 pb-1">Modelos de upscale</p>
          <ul role="menu" className="space-y-0.5">
            {models.map(model => {
              const provider = model.provider || 'kie'
              const available = isModelConfigured(model, configured)
              const cost = estimate(model, seconds)
              return (
                <li key={`${provider}:${model.t2vId}`}>
                  <button
                    role="menuitem"
                    disabled={!available}
                    onClick={() => { setOpen(false); setError(null); setConfirming(model) }}
                    title={available ? undefined : `Configura ${providerLabel(provider)} en Proveedores para usar este modelo`}
                    className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-soft disabled:opacity-45 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="shrink-0"><ProviderLogo provider={provider} size={16} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs text-ink truncate">{cleanModelName(model.name)}</span>
                      <span className="block text-meta text-ink-muted truncate">
                        {providerLabel(provider)}
                        {model.prices[0]?.resolution && model.prices[0].resolution !== 'video' ? ` · ${model.prices[0].resolution}` : ''}
                        {!available && ' · sin API key'}
                      </span>
                    </span>
                    {cost && (
                      <span className="shrink-0 text-meta text-ink-muted tabular-nums" title={`Estimado para ${Math.ceil(seconds)}s de video`}>
                        ${cost.totalDollars.toFixed(2)}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  )
}
