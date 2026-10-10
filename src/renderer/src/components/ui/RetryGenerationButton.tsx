import { useState } from 'react'
import { Loader, RotateCcw } from 'lucide-react'

/**
 * Manual retry of a failed generation. Queues never resubmit on their own; this sends a new
 * request with the stored parameters, which replaces the failed card (the grids reload via the
 * assets:changed broadcast).
 */
export function RetryGenerationButton({ assetId, variant = 'card', onRetried }: {
  assetId: string
  /** 'card' = compact, inside a grid error card; 'full' = detail view (sits on the black media stage) */
  variant?: 'card' | 'full'
  onRetried?: () => void
}) {
  const [state, setState] = useState<'idle' | 'sending'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation() // grid cards open the detail on click
    if (state === 'sending') return
    setState('sending')
    setError(null)
    try {
      await (window as any).electronAPI?.tasks?.retry(assetId)
      onRetried?.()
    } catch (err: any) {
      setState('idle')
      setError(String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }

  const icon = state === 'sending' ? <Loader size={variant === 'card' ? 11 : 14} className="animate-spin" /> : <RotateCcw size={variant === 'card' ? 11 : 14} />
  return (
    <div className="flex flex-col items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={handleClick}
        disabled={state === 'sending'}
        title="Envía de nuevo esta generación con los mismos parámetros"
        className={variant === 'card'
          ? 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium text-surface-100 bg-surface-800/90 hover:bg-surface-700 border border-surface-600 transition-colors disabled:opacity-60'
          : 'inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-black bg-white hover:bg-white/85 transition-colors disabled:opacity-60'}
      >
        {icon} Reintentar
      </button>
      {error && <span className={`text-[10px] max-w-[220px] leading-tight ${variant === 'full' ? 'text-red-300' : 'text-red-600 dark:text-red-300'}`}>{error}</span>}
    </div>
  )
}
