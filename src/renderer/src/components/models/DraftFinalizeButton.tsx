import { useCallback, useEffect, useState } from 'react'
import { Check, ExternalLink, Loader, Sparkles } from 'lucide-react'

function parseParams(asset: any): any {
  try { return typeof asset?.parameters === 'string' ? JSON.parse(asset.parameters || '{}') : (asset?.parameters || {}) } catch { return {} }
}

/** True for a completed Seedance 2.5 (MachGen) 480p draft sample. */
export function isSeedanceDraft(asset: any, params: any): boolean {
  return params?.draft === true &&
    String(params?.model || asset?.modelUsed || '').includes('Seedance-2.5') &&
    !!(asset?.localPath || (asset?.filePath && !String(asset.filePath).startsWith('__error__')))
}

/**
 * Starts the 1080p final of a Seedance 2.5 draft: a new MachGen task (and a separate asset) that
 * reuses the sample's prompt, references, duration, aspect ratio, seed and audio. A draft gets a
 * single final. The state comes from flags on the draft asset itself — draftFinalTaskId (final
 * requested), draftFinalAssetId (final generated), draftFinalError (last final failed) — so the
 * button is never blocked by a missing status: no flag means it can be generated.
 */
export function DraftFinalizeButton({ asset, onOpenFinal, onQueued, className = '' }: {
  asset: any
  /** Opens the final asset (when it exists) */
  onOpenFinal?: (finalAssetId: string) => void
  /** The final was queued: the page reloads its grid so the new request shows up */
  onQueued?: () => void
  className?: string
}) {
  const [flags, setFlags] = useState<any>(() => parseParams(asset))
  // Locks the button as soon as it is clicked (before the flags round-trip); cleared on error
  const [requested, setRequested] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setFlags(parseParams(asset)) }, [asset])

  // Re-read the draft asset: its flags change when the final is queued, completes or fails
  const refresh = useCallback(async () => {
    try {
      const fresh = await (window as any).electronAPI?.assets?.get?.(asset.id)
      if (fresh) setFlags(parseParams(fresh))
    } catch {}
  }, [asset.id])

  useEffect(() => {
    const api = (window as any).electronAPI
    const offDone = api?.on?.('machgen:task:completed', refresh)
    const offFail = api?.on?.('machgen:task:failed', refresh)
    return () => { offDone?.(); offFail?.() }
  }, [refresh])

  const handleClick = async () => {
    if (requested) return
    setRequested(true)
    setSending(true)
    setError(null)
    try {
      await (window as any).electronAPI?.machgen?.finalizeDraft(asset.id)
      onQueued?.()
    } catch (err: any) {
      setRequested(false)
      setError(String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      await refresh()
      setSending(false)
    }
  }

  const finalAssetId: string | null = flags.draftFinalAssetId || null
  const status: 'none' | 'pending' | 'completed' = finalAssetId ? 'completed' : (flags.draftFinalTaskId || requested) ? 'pending' : 'none'
  if (status === 'completed') {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <span className="flex-1 flex items-center justify-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 py-1.5">
          <Check size={12} /> Final 1080p generado
        </span>
        {onOpenFinal && (
          <button onClick={() => onOpenFinal(finalAssetId!)} className="btn-ghost text-xs flex items-center gap-1.5">
            <ExternalLink size={12} /> Ver final
          </button>
        )}
      </div>
    )
  }

  const pending = status === 'pending'
  const failedBefore = status === 'none' && !!flags.draftFinalError
  return (
    <div className={className}>
      <button
        onClick={handleClick}
        disabled={sending || pending}
        title="Genera el video final en 1080p a partir de este draft (se cobra como un video normal de 1080p)"
        className="btn-ghost text-xs w-full justify-center flex items-center gap-1.5 text-amber-600 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200 disabled:opacity-60"
      >
        {sending || pending ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
        {pending ? 'Generando final 1080p…' : failedBefore ? 'Reintentar final 1080p' : 'Generar final 1080p'}
      </button>
      {failedBefore && !error && <p className="mt-1 text-[10px] text-red-600 dark:text-red-400 text-center">El final anterior falló: {String(flags.draftFinalError)}</p>}
      {error && <p className="mt-1 text-[10px] text-red-600 dark:text-red-400 text-center">{error}</p>}
    </div>
  )
}
