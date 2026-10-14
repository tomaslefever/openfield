import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Compact update pill for the window title bar; hidden unless an update is downloading or ready */
export function RestartToUpdateButton() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'downloading' | 'downloaded'>('idle')
  const [downloadProgress, setDownloadProgress] = useState<number>(0)
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const api = (window as any).electronAPI

    const checkForUpdatesOnStartup = async () => {
      try {
        if (!api?.updater) return

        // 1. Check if an update was already downloaded or active in background
        const currentState = await api.updater.state().catch(() => null)
        if (!mounted) return

        if (currentState?.downloadedUpdate || currentState?.status === 'downloaded') {
          setStatus('downloaded')
          if (currentState.version) setVersion(currentState.version)
          return
        }

        if (currentState?.status === 'downloading') {
          setStatus('downloading')
          if (currentState.version) setVersion(currentState.version)
        }

        // 2. Query for updates each time the app starts
        const checkRes = await api.updater.check().catch(() => null)
        if (!mounted) return

        if (checkRes?.state === 'downloaded') {
          setStatus('downloaded')
          if (checkRes.version) setVersion(checkRes.version)
        }
      } catch (err) {
        console.warn('[RestartToUpdate] Error checking updates on startup:', err)
      }
    }

    checkForUpdatesOnStartup()

    // 3. Listen to live updates from the updater service
    const unsubStatus = api?.on?.('update:status', (event: any) => {
      if (!mounted || !event) return
      switch (event.state) {
        case 'available':
          setStatus('downloading')
          if (event.version) setVersion(event.version)
          break
        case 'downloaded':
          setStatus('downloaded')
          if (event.version) setVersion(event.version)
          break
        case 'not-available':
        case 'error':
          setStatus((prev) => (prev === 'downloaded' ? prev : 'idle'))
          break
      }
    })

    const unsubProgress = api?.on?.('update:progress', (p: any) => {
      if (!mounted || !p) return
      setStatus('downloading')
      if (typeof p.percent === 'number') {
        setDownloadProgress(Math.round(p.percent))
      }
    })

    // Dev mode simulation helper: window.__simulateUpdate(true/false) or localStorage
    const handleDevSim = (e: any) => {
      if (!mounted) return
      const enable = e.detail !== false
      setStatus(enable ? 'downloaded' : 'idle')
      if (enable) setVersion('0.1.6-dev')
    }
    window.addEventListener('openfield:simulate-update', handleDevSim)
    if (typeof window !== 'undefined') {
      ;(window as any).__simulateUpdate = (enable = true) => {
        window.dispatchEvent(new CustomEvent('openfield:simulate-update', { detail: enable }))
      }
      if (localStorage.getItem('openfield_dev_simulate_update') === 'true') {
        setStatus('downloaded')
        setVersion('0.1.6-dev')
      }
    }

    return () => {
      mounted = false
      unsubStatus?.()
      unsubProgress?.()
      window.removeEventListener('openfield:simulate-update', handleDevSim)
    }
  }, [])

  // Only show when an update is downloading or ready to restart
  if (status !== 'downloading' && status !== 'downloaded') {
    return null
  }

  const isDownloaded = status === 'downloaded'

  const handleRestart = () => {
    if (!isDownloaded) return
    const api = (window as any).electronAPI
    if (api?.updater?.install) {
      api.updater.install()
    }
  }

  const tooltipText = isDownloaded
    ? version
      ? `Restart to Update (v${version})`
      : 'Restart to Update'
    : downloadProgress > 0
      ? `Downloading update (${downloadProgress}%)`
      : 'Downloading update...'

  return (
    <button
      type="button"
      title={tooltipText}
      onClick={handleRestart}
      disabled={!isDownloaded}
      className={cn(
        'app-no-drag flex h-6 items-center gap-1.5 rounded-pill border px-2.5 text-[11.5px] font-medium transition-colors',
        isDownloaded
          ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 hover:text-emerald-300 active:scale-[0.98]'
          : 'cursor-wait border-hairline bg-surface-900 text-ink-muted'
      )}
    >
      <RefreshCw size={12} className={cn('shrink-0', !isDownloaded && 'animate-spin')} />
      <span className="whitespace-nowrap">
        {isDownloaded
          ? 'Restart to Update'
          : downloadProgress > 0
            ? `Updating... ${downloadProgress}%`
            : 'Downloading update...'}
      </span>
      {isDownloaded && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
      )}
    </button>
  )
}
