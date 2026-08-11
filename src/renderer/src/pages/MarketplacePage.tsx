import { useEffect, useState } from 'react'
import { Package, Download, CheckCircle, HardDrive, Search, X, Loader2, Link, ArrowDown, Clock, RefreshCw } from 'lucide-react'

interface ModelInfo {
  id: string
  displayName: string
  description: string
  pipelineTag: string
  license: string
  minVram: number | null
  downloads: number
  siblings?: Array<{ filename: string; size: number }>
  downloadFilter?: string[]
  status?: string
  errorMessage?: string | null
}

interface InstallState {
  installed: ModelInfo[]
  totalSize: number
}

interface DownloadProgress {
  modelId: string
  progress: number
  bytesDownloaded: number
  totalBytes: number
  speedBytesPerSec: number
  etaSeconds: number
  status: string
}

const ENGINE_OPTIONS = [
  { value: 'diffusers', label: 'Diffusers (Image)', pipelineTag: 'text-to-image' as const },
  { value: 'ltx_video', label: 'LTX Video', pipelineTag: 'text-to-video' as const },
  { value: 'kokoro', label: 'Kokoro (TTS)', pipelineTag: 'text-to-speech' as const },
  { value: 'piper', label: 'Piper (TTS)', pipelineTag: 'text-to-speech' as const },
]

export function MarketplacePage() {
  const [curated, setCurated] = useState<ModelInfo[]>([])
  const [installed, setInstalled] = useState<InstallState>({ installed: [], totalSize: 0 })
  const [loading, setLoading] = useState(true)

  // Add from URL state
  const [urlInput, setUrlInput] = useState('')
  const [preview, setPreview] = useState<ModelInfo | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')

  // Download state
  const [activeDownloads, setActiveDownloads] = useState<Map<string, DownloadProgress>>(new Map())
  const [completedDownloads, setCompletedDownloads] = useState<string[]>([])
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null)

  useEffect(() => {
    loadData()
    subscribeToProgress()
  }, [])

  // ─── Download progress listener ────────────────────

  function subscribeToProgress() {
    const cleanup = (window as any).electronAPI?.on?.('models:download:progress', (job: any) => {
      setActiveDownloads(prev => {
        const next = new Map(prev)
        if (job.status === 'completed') {
          next.delete(job.modelId)
          setCompletedDownloads(p => [...p.filter(id => id !== job.modelId), job.modelId])
          setTimeout(() => setCompletedDownloads(p => p.filter(id => id !== job.modelId)), 5000)
          loadData()
        } else if (job.status === 'error') {
          next.delete(job.modelId)
        } else {
          next.set(job.modelId, {
            modelId: job.modelId,
            progress: job.progress || 0,
            bytesDownloaded: job.bytesDownloaded || 0,
            totalBytes: job.totalBytes || 0,
            speedBytesPerSec: job.speedBytesPerSec || 0,
            etaSeconds: job.etaSeconds || 0,
            status: job.status || 'downloading',
          })
        }
        return next
      })
    })
    if (typeof cleanup === 'function') {
      // Cleanup not needed since page persists
    }
  }

  async function loadData() {
    try {
      const api = (window as any).electronAPI
      const curatedModels = await api.marketplace.getCurated()
      const installedModels = await api.models.list()
      const totalSize = await api.models.getTotalSize()
      setInstalled({ installed: installedModels || [], totalSize: totalSize || 0 })

      const models = [...(curatedModels || [])]
      for (const inst of (installedModels || [])) {
        if (!models.find(m => m.id === inst.id)) {
          models.push({
            id: inst.id,
            displayName: inst.displayName,
            description: inst.description || '',
            pipelineTag: inst.pipelineTag,
            license: inst.license || 'unknown',
            minVram: inst.minVram,
            downloads: 0,
            status: inst.status,
            errorMessage: inst.errorMessage,
          })
        } else {
          // Update status for curated models that are also installed
          const existing = models.find(m => m.id === inst.id)
          if (existing) {
            existing.status = inst.status
            existing.errorMessage = inst.errorMessage
          }
        }
      }
      setCurated(models)
    } catch (err) {
      console.error('Failed to load marketplace data:', err)
    } finally {
      setLoading(false)
    }
  }

  function isInstalled(id: string): boolean {
    return installed.installed.some(m => m.id === id && m.status === 'ready')
  }

  async function handleInstall(modelId: string) {
    try {
      const api = (window as any).electronAPI
      const curatedModel = curated.find(m => m.id === modelId)
      const options = curatedModel?.downloadFilter?.length
        ? { filter: curatedModel.downloadFilter }
        : undefined
      api.models.download(modelId, options).catch(() => {}).finally(() => loadData())
    } catch (err: any) {
      console.error('Download failed:', err)
    }
  }

  async function handleUninstall(modelId: string) {
    try {
      const api = (window as any).electronAPI
      await api.models.uninstall(modelId)
      loadData()
    } catch (err) {
      console.error('Uninstall failed:', err)
    }
  }

  async function handleRetry(modelId: string) {
    try {
      const api = (window as any).electronAPI
      await api.models.reset(modelId)
      loadData()
      api.models.download(modelId).catch(() => {}).finally(() => loadData())
    } catch (err) {
      console.error('Retry failed:', err)
    }
  }

  function handleCancelClick(modelId: string) {
    if (cancelConfirm === modelId) {
      handleCancel(modelId)
      setCancelConfirm(null)
    } else {
      setCancelConfirm(modelId)
      setTimeout(() => setCancelConfirm(null), 3000)
    }
  }

  async function handleCancel(modelId: string) {
    try {
      const api = (window as any).electronAPI
      await api.models.cancelDownload(modelId)
      loadData()
    } catch (err) {
      console.error('Cancel failed:', err)
    }
  }

  // ─── Add from URL ───────────────────────────────────

  function extractModelId(input: string): string | null {
    const match = input.match(/huggingface\.co\/([^/]+\/[^/?#]+)/)
    if (match) return match[1]
    if (/^[^/]+\/[^/]+$/.test(input.trim())) return input.trim()
    return null
  }

  async function handlePreviewUrl() {
    const modelId = extractModelId(urlInput)
    if (!modelId) {
      setPreviewError('Invalid URL. Use: https://huggingface.co/org/model-name or org/model-name')
      return
    }
    setPreviewLoading(true)
    setPreviewError('')
    setPreview(null)
    try {
      const api = (window as any).electronAPI
      const model = await api.marketplace.getModel(modelId)
      if (!model) { setPreviewError(`Model not found: ${modelId}`); return }
      setPreview(model as ModelInfo)
    } catch (err: any) {
      setPreviewError(err.message || 'Failed to fetch model info')
    } finally {
      setPreviewLoading(false)
    }
  }

  function cancelPreview() {
    setPreview(null)
    setPreviewError('')
    setUrlInput('')
  }

  async function handleAddAndDownload() {
    if (!preview) return
    handleInstall(preview.id)
    cancelPreview()
  }

  // ─── Formatting ─────────────────────────────────────

  function formatSize(bytes: number): string {
    if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(1)} GB`
    if (bytes >= 1024 ** 2) return `${(bytes / (1024 ** 2)).toFixed(0)} MB`
    return `${(bytes / 1024).toFixed(0)} KB`
  }

  function formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec >= 1024 ** 2) return `${(bytesPerSec / (1024 ** 2)).toFixed(1)} MB/s`
    if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
    return `${bytesPerSec.toFixed(0)} B/s`
  }

  function formatEta(seconds: number): string {
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
    if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`
    return `${Math.floor(seconds)}s`
  }

  function formatDownloads(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  function getTotalRepoSize(siblings?: Array<{ filename: string; size: number }>): string {
    if (!siblings || siblings.length === 0) return '?'
    return formatSize(siblings.reduce((sum, s) => sum + (s.size || 0), 0))
  }

  function shortName(id: string): string {
    return id.split('/').pop() || id
  }

  const pipelineLabels: Record<string, string> = {
    'text-to-image': 'Image Gen',
    'text-to-video': 'Video Gen',
    'text-to-speech': 'TTS',
  }

  const downloadList = Array.from(activeDownloads.values())
  const hasActiveDownloads = downloadList.length > 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-0">
        <div>
          <h1 className="text-2xl font-semibold text-surface-100">Model Marketplace</h1>
          <p className="text-sm text-surface-500 mt-1">
            Browse and install open-weight AI models from HuggingFace
          </p>
        </div>
        {installed.totalSize > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-800 text-xs text-surface-400">
            <HardDrive size={14} />
            <span>{formatSize(installed.totalSize)} by {installed.installed.length} model{installed.installed.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Add from URL bar */}
      <div className="px-6 pt-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Link size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handlePreviewUrl() }}
              placeholder="Paste HuggingFace URL or org/model-name..."
              className="w-full pl-9 pr-3 py-2 bg-surface-900 border border-surface-700 rounded-lg text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-primary-500"
            />
            {urlInput && (
              <button onClick={() => { setUrlInput(''); setPreview(null); setPreviewError('') }} className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={handlePreviewUrl}
            disabled={previewLoading || !urlInput.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-500 disabled:opacity-50 transition-colors"
          >
            {previewLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Get model
          </button>
        </div>
        {previewError && (
          <p className="text-xs text-red-400 mt-1.5">{previewError}</p>
        )}
      </div>

      {/* Preview card */}
      {preview && (
        <div className="px-6 pt-4">
          <div className="bg-surface-800 border border-primary-600/30 rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-medium text-surface-100">{preview.displayName}</h3>
                <p className="text-xs text-surface-500">{preview.id}</p>
              </div>
              <button onClick={cancelPreview} className="text-surface-500 hover:text-surface-300">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-surface-400 mb-3 line-clamp-2">{preview.description}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-surface-500 mb-4">
              <span>Files: {getTotalRepoSize(preview.siblings)}</span>
              {preview.downloads > 0 && <span>{formatDownloads(preview.downloads)} downloads</span>}
              {preview.license !== 'unknown' && <span className="capitalize">{preview.license}</span>}
            </div>
            <button
              onClick={handleAddAndDownload}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-primary-600 text-white hover:bg-primary-500 transition-colors"
            >
              <Download size={14} /> Download and install
            </button>
          </div>
        </div>
      )}

      {/* Download progress section */}
      {hasActiveDownloads && (
        <div className="px-6 pt-4 space-y-2">
          {downloadList.map(job => (
            <div key={job.modelId} className="bg-surface-800 border border-surface-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <ArrowDown size={14} className="text-primary-400 flex-shrink-0" />
                  <span className="text-xs font-medium text-surface-200 truncate">{shortName(job.modelId)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-surface-400 flex-shrink-0">
                    {job.progress.toFixed(0)}%
                  </span>
                  <button
                    onClick={() => handleCancelClick(job.modelId)}
                    className={`p-0.5 transition-colors flex-shrink-0 rounded ${
                      cancelConfirm === job.modelId
                        ? 'text-red-400 bg-red-500/10 px-1'
                        : 'text-surface-500 hover:text-red-400'
                    }`}
                    title={cancelConfirm === job.modelId ? 'Click again to cancel' : 'Cancel download'}
                  >
                    {cancelConfirm === job.modelId ? (
                      <span className="text-[10px] font-medium whitespace-nowrap">Cancel?</span>
                    ) : (
                      <X size={12} />
                    )}
                  </button>
                </div>
              </div>
              <div className="w-full h-1.5 bg-surface-900 rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(job.progress, 100)}%` }}
                />
              </div>
              <div className="flex items-center gap-3 text-[10px] text-surface-500">
                <span>{formatSize(job.bytesDownloaded)} / {formatSize(job.totalBytes)}</span>
                {job.speedBytesPerSec > 0 && <span>{formatSpeed(job.speedBytesPerSec)}</span>}
                {job.etaSeconds > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {formatEta(job.etaSeconds)} remaining
                  </span>
                )}
              </div>
            </div>
          ))}
          {downloadList.length > 1 && (() => {
            const totalBytes = downloadList.reduce((s, j) => s + j.totalBytes, 0)
            const totalDownloaded = downloadList.reduce((s, j) => s + j.bytesDownloaded, 0)
            const totalProgress = totalBytes > 0 ? (totalDownloaded / totalBytes) * 100 : 0
            return (
              <div className="bg-surface-800 border border-surface-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-surface-200">Total</span>
                  <span className="text-xs text-surface-400">{formatSize(totalDownloaded)} / {formatSize(totalBytes)}</span>
                </div>
                <div className="w-full h-2 bg-surface-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(totalProgress, 100)}%` }}
                  />
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Curated models grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {curated.map((model) => {
            const installed = isInstalled(model.id)
            const progress = activeDownloads.get(model.id)

            return (
              <div
                key={model.id}
                className="flex flex-col bg-surface-900 border border-surface-800 rounded-lg p-4 hover:border-surface-700 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-surface-100 truncate">
                      {model.displayName}
                    </h3>
                    <p className="text-xs text-surface-500 mt-0.5">{model.id}</p>
                  </div>
                  <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded bg-surface-800 text-surface-400 ml-2">
                    {pipelineLabels[model.pipelineTag] || model.pipelineTag}
                  </span>
                </div>

                <p className="text-xs text-surface-400 mb-3 line-clamp-2 flex-1">
                  {model.description}
                </p>

                <div className="flex items-center gap-3 text-xs text-surface-500 mb-4">
                  {model.minVram != null && <span>~{model.minVram} GB VRAM</span>}
                  {model.downloads > 0 && <span>{formatDownloads(model.downloads)} downloads</span>}
                  {model.license !== 'unknown' && <span className="capitalize">{model.license}</span>}
                </div>

                {/* In-card progress bar while downloading */}
                {progress && (
                  <div className="mb-3">
                    <div className="w-full h-1.5 bg-surface-800 rounded-full overflow-hidden mb-1">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(progress.progress, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-surface-500">
                      <span>{progress.progress.toFixed(0)}%</span>
                      {progress.speedBytesPerSec > 0 && <span>{formatSpeed(progress.speedBytesPerSec)}</span>}
                      {progress.etaSeconds > 0 && <span>{formatEta(progress.etaSeconds)} left</span>}
                      <button
                        onClick={() => handleCancelClick(model.id)}
                        className={`ml-auto transition-colors rounded ${
                          cancelConfirm === model.id
                            ? 'text-red-400 bg-red-500/10 px-1'
                            : 'text-surface-500 hover:text-red-400'
                        }`}
                        title={cancelConfirm === model.id ? 'Click again to cancel' : 'Cancel'}
                      >
                        {cancelConfirm === model.id ? (
                          <span className="text-[9px] font-medium whitespace-nowrap">Cancel?</span>
                        ) : (
                          <X size={10} />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    if (installed) handleUninstall(model.id)
                    else if (model.status === 'error') handleRetry(model.id)
                    else handleInstall(model.id)
                  }}
                  disabled={!!progress}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    installed
                      ? 'bg-surface-800 text-surface-300 hover:bg-red-900/30 hover:text-red-400 border border-surface-700'
                      : model.status === 'error'
                      ? 'bg-amber-900/30 text-amber-400 hover:bg-amber-900/50 border border-amber-800/30'
                      : 'bg-primary-600 text-white hover:bg-primary-500'
                  } disabled:opacity-50`}
                >
                  {progress ? (
                    <><Loader2 size={14} className="animate-spin" /> Downloading...</>
                  ) : installed ? (
                    <><CheckCircle size={14} /> Installed — Click to uninstall</>
                  ) : model.status === 'error' ? (
                    <><RefreshCw size={14} /> Retry download</>
                  ) : (
                    <><Download size={14} /> Install</>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {curated.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-surface-500">
            <Package size={48} className="mb-4 opacity-30" />
            <p className="text-sm">No curated models available</p>
            <p className="text-xs mt-1">Paste a HuggingFace URL above to add a model</p>
          </div>
        )}
      </div>
    </div>
  )
}
