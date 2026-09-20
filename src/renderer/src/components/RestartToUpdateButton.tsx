import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { SidebarMenuItem, SidebarMenuButton, useSidebar } from './ui/sidebar'
import { cn } from '@/lib/utils'

interface RestartToUpdateButtonProps {
  collapsed?: boolean
}

export function RestartToUpdateButton({ collapsed: propCollapsed }: RestartToUpdateButtonProps) {
  const sidebar = useSidebar()
  const collapsed = propCollapsed !== undefined ? propCollapsed : sidebar.state === 'collapsed'

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
    <SidebarMenuItem className={collapsed ? 'flex justify-center' : ''}>
      <SidebarMenuButton
        tooltip={tooltipText}
        onClick={handleRestart}
        disabled={!isDownloaded}
        className={cn(
          'relative gap-3 rounded-[8px] text-[13.5px] font-medium transition-all cursor-pointer',
          collapsed ? '!size-10 !p-0 justify-center' : 'px-2.5 py-2',
          isDownloaded
            ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 hover:text-emerald-300 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)] active:scale-[0.98]'
            : 'bg-accent-500/10 text-accent-400 border border-accent-500/20 cursor-wait'
        )}
      >
        <div className="relative flex items-center justify-center shrink-0">
          <RefreshCw
            size={16}
            className={cn(
              'shrink-0 transition-transform',
              !isDownloaded ? 'animate-spin text-accent-400' : 'text-emerald-400'
            )}
          />
          {isDownloaded && collapsed && (
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          )}
        </div>

        {!collapsed && (
          <div className="flex items-center justify-between flex-1 min-w-0">
            <span className="truncate">
              {isDownloaded
                ? 'Restart to Update'
                : downloadProgress > 0
                  ? `Updating... ${downloadProgress}%`
                  : 'Downloading update...'}
            </span>
            {isDownloaded && (
              <span className="flex h-2 w-2 relative flex-shrink-0 ml-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            )}
          </div>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
