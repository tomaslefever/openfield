import * as fs from 'fs'
import * as path from 'path'
import { getRawDb, getModelsDir } from '../../db'
import { DownloadJob } from './types'
import { getModelRegistry } from './model-registry'

export class ModelDownloader {
  private active: Map<string, DownloadJob> = new Map()
  private controllers: Map<string, AbortController> = new Map()
  private maxConcurrent = 2

  private getHfToken(): string | null {
    try {
      const db = getRawDb()
      const row = db.prepare("SELECT value FROM settings WHERE key = 'hfToken'").get() as any
      if (row?.value) {
        const val = JSON.parse(row.value)
        return val || null
      }
    } catch {}
    return null
  }

  private defaultHeaders(): Record<string, string> {
    const token = this.getHfToken()
    if (token) return { Authorization: `Bearer ${token}` }
    return {}
  }
  private running = 0
  private queue: Array<{
    modelId: string
    options?: DownloadOptions
    resolve: (p: string) => void
    reject: (e: Error) => void
  }> = []

  async download(modelId: string, options?: DownloadOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ modelId, options, resolve, reject })
      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!
      this.running++
      this.runDownload(task.modelId, task.options)
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
          this.running--
          this.processQueue()
        })
    }
  }

  private async runDownload(modelId: string, options?: DownloadOptions): Promise<string> {
    const registry = getModelRegistry()
    const modelsDir = getModelsDir()
    const modelDir = path.join(modelsDir, modelId.replace(/\//g, '--'))

    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true })
    }

    const abortController = new AbortController()
    this.controllers.set(modelId, abortController)

    const job: DownloadJob = {
      modelId,
      bytesDownloaded: 0,
      totalBytes: 0,
      progress: 0,
      speedBytesPerSec: 0,
      etaSeconds: 0,
      status: 'downloading',
      errorMessage: null,
    }
    this.active.set(modelId, job)

    // Register in DB if not already
    if (!registry.isInstalled(modelId)) {
      const displayName = modelId.split('/').pop() || modelId
      registry.add({
        id: modelId,
        pipelineTag: 'text-to-image',
        displayName,
        description: '',
        version: 'latest',
        sizeBytes: 0,
        path: modelDir,
        license: '',
        minVram: 0,
        engine: 'diffusers',
      })
    }
    registry.markDownloading(modelId)

    try {
      // Get file list from HF API
      const filesUrl = `https://huggingface.co/api/models/${modelId}?blobs=true`
      const filesRes = await fetch(filesUrl, {
        signal: abortController.signal,
        headers: this.defaultHeaders(),
      })
      if (!filesRes.ok) throw new Error(`Failed to fetch model info: ${filesRes.status}`)
      const modelInfo = await filesRes.json()
      const siblings: Array<{ rfilename: string; size: number }> = modelInfo.siblings || []

      // Filter files if requested
      let filesToDownload = siblings
      if (options?.filter && options.filter.length > 0) {
        filesToDownload = siblings.filter(s =>
          options.filter!.some(pattern => {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\//g, '\\/') + '$')
            return regex.test(s.rfilename)
          })
        )
      }

      if (filesToDownload.length === 0) {
        filesToDownload = siblings
      }

      job.totalBytes = filesToDownload.reduce((sum, f) => sum + (f.size || 0), 0)
      job.bytesDownloaded = 0

      let previousFilesBytes = 0

      for (const file of filesToDownload) {
        const fileUrl = `https://huggingface.co/${modelId}/resolve/main/${file.rfilename}`
        const destPath = path.join(modelDir, file.rfilename)
        const fileSize = file.size || 0

        let lastFileBytes = 0
        let lastTime = Date.now()

        await this.downloadFile(
          fileUrl,
          destPath,
          fileSize,
          (fileBytes) => {
            job.bytesDownloaded = previousFilesBytes + fileBytes
            const now = Date.now()
            const elapsed = (now - lastTime) / 1000
            if (elapsed > 0.5) {
              const bytesSince = fileBytes - lastFileBytes
              job.speedBytesPerSec = bytesSince / elapsed
              if (job.totalBytes > 0 && job.speedBytesPerSec > 0) {
                job.etaSeconds = (job.totalBytes - job.bytesDownloaded) / job.speedBytesPerSec
              }
              job.progress = job.totalBytes > 0 ? Math.round((job.bytesDownloaded / job.totalBytes) * 100) : 0
              lastFileBytes = fileBytes
              lastTime = now
              options?.onProgress?.(job)
              registry.updateDownloadProgress(modelId, job.progress)
            }
          },
          abortController.signal
        )

        previousFilesBytes += fileSize
      }

      // Verify integrity by checking all files exist
      for (const file of filesToDownload) {
        const destPath = path.join(modelDir, file.rfilename)
        if (!fs.existsSync(destPath)) {
          throw new Error(`Missing file after download: ${file.rfilename}`)
        }
        if (file.size > 0) {
          const stat = fs.statSync(destPath)
          if (stat.size !== file.size) {
            throw new Error(`Size mismatch for ${file.rfilename}: expected ${file.size}, got ${stat.size}`)
          }
        }
      }

      job.status = 'completed'
      job.progress = 100
      options?.onProgress?.(job)
      options?.onComplete?.(modelId, modelDir)

      registry.markReady(modelId)
      this.active.delete(modelId)
      this.controllers.delete(modelId)
      return modelDir

    } catch (err: any) {
      if (err.name === 'AbortError') {
        job.status = 'cancelled'
        job.errorMessage = 'Download cancelled'
        registry.reset(modelId)
      } else {
        job.status = 'error'
        const msg = err.message || 'Download failed'
        job.errorMessage = msg
        registry.markError(modelId, msg)
      }
      options?.onError?.(modelId, job.errorMessage!)
      options?.onProgress?.(job)
      this.active.delete(modelId)
      this.controllers.delete(modelId)
      throw err
    }
  }

  private async downloadFile(
    url: string,
    destPath: string,
    expectedSize: number,
    onProgress: (downloaded: number) => void,
    signal: AbortSignal
  ): Promise<void> {
    const destDir = path.dirname(destPath)
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }

    // Check if file already exists and is complete
    let startByte = 0
    if (fs.existsSync(destPath) && expectedSize > 0) {
      const stat = fs.statSync(destPath)
      if (stat.size === expectedSize) {
        onProgress(expectedSize)
        return
      }
      if (stat.size < expectedSize) {
        startByte = stat.size
      } else {
        fs.unlinkSync(destPath)
      }
    }

    const headers: Record<string, string> = {}
    if (startByte > 0) {
      headers['Range'] = `bytes=${startByte}-`
    }

    const res = await fetch(url, { headers: { ...headers, ...this.defaultHeaders() }, signal })

    if (res.status !== 206 && res.status !== 200) {
      throw new Error(`HTTP ${res.status} for ${url}`)
    }

    const writeStream = fs.createWriteStream(destPath, {
      flags: startByte > 0 ? 'a' : 'w',
      highWaterMark: 1024 * 1024, // 1MB buffer
    })

    const reader = res.body!.getReader()
    let downloaded = startByte
    let lastProgress = startByte
    let lastTime = Date.now()
    const PROGRESS_INTERVAL_MS = 200
    const PROGRESS_INTERVAL_BYTES = 1024 * 512 // 512KB

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Accumulate write — don't await every chunk
        writeStream.write(value)
        downloaded += value.length

        // Throttle progress callback (max every 200ms or 512KB)
        if (
          Date.now() - lastTime >= PROGRESS_INTERVAL_MS ||
          downloaded - lastProgress >= PROGRESS_INTERVAL_BYTES
        ) {
          onProgress(downloaded)
          lastProgress = downloaded
          lastTime = Date.now()
        }

        if (signal.aborted) {
          reader.cancel()
          break
        }
      }
    } finally {
      writeStream.end()
      await new Promise<void>(resolve => writeStream.on('finish', resolve))
    }

    if (signal.aborted) return

    // Final progress
    onProgress(downloaded)
    if (expectedSize > 0 && downloaded !== expectedSize) {
      throw new Error(`Size mismatch: expected ${expectedSize}, got ${downloaded}`)
    }
  }

  cancel(modelId: string): void {
    const controller = this.controllers.get(modelId)
    if (controller) {
      controller.abort()
      this.controllers.delete(modelId)
    }
    // Remove from queue if pending
    const idx = this.queue.findIndex(t => t.modelId === modelId)
    if (idx >= 0) {
      const task = this.queue.splice(idx, 1)[0]
      task.reject(new Error('Download cancelled'))
    }
  }

  pause(modelId: string): void {
    this.cancel(modelId)
    // Re-queue would need state persistence — skip for MVP
  }

  resume(modelId: string, options?: DownloadOptions): Promise<string> {
    return this.download(modelId, options)
  }

  getActive(): DownloadJob[] {
    return Array.from(this.active.values())
  }
}

export interface DownloadOptions {
  filter?: string[]
  onProgress?: (job: DownloadJob) => void
  onComplete?: (modelId: string, path: string) => void
  onError?: (modelId: string, error: string) => void
}

let instance: ModelDownloader | null = null

export function getModelDownloader(): ModelDownloader {
  if (!instance) instance = new ModelDownloader()
  return instance
}
