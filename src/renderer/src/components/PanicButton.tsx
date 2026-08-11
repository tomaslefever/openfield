import { useEffect, useState } from 'react'
import { Zap, ZapOff } from 'lucide-react'

export function PanicButton() {
  const [status, setStatus] = useState<string>('stopped')
  const [killing, setKilling] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const check = () => {
      const api = (window as any).electronAPI
      api?.local?.serverStatus?.().then((s: any) => {
        setStatus(s?.status || 'stopped')
        setShow(s?.status === 'running')
      }).catch(() => setShow(false))
    }
    check()
    const interval = setInterval(check, 3000)
    return () => clearInterval(interval)
  }, [])

  async function handlePanic() {
    setKilling(true)
    try {
      const api = (window as any).electronAPI
      await api?.local?.serverPanic?.()
      setStatus('stopped')
      setShow(false)
    } catch {} finally {
      setKilling(false)
    }
  }

  if (!show) return null

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={handlePanic}
        disabled={killing}
        className="flex items-center gap-2 px-3 py-2 bg-red-600/90 hover:bg-red-500 text-white rounded-lg text-xs font-medium shadow-lg shadow-red-900/30 transition-all hover:scale-105 disabled:opacity-60 border border-red-400/30"
        title="Force stop local model server"
      >
        <ZapOff size={14} className={killing ? 'animate-pulse' : ''} />
        {killing ? 'Killing...' : 'Stop GPU'}
      </button>
    </div>
  )
}
