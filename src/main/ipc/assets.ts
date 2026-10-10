import { shell, dialog, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
function createZipArchive(options: any) {
  const archiverModule = require('archiver')
  if (typeof archiverModule.ZipArchive === 'function') {
    return new archiverModule.ZipArchive(options)
  }
  if (typeof archiverModule === 'function') {
    return archiverModule('zip', options)
  }
  if (typeof archiverModule.default === 'function') {
    return archiverModule.default('zip', options)
  }
  if (typeof archiverModule.create === 'function') {
    return archiverModule.create('zip', options)
  }
  throw new Error('Could not instantiate ZipArchive from archiver package')
}
import type { IpcContext } from './context'
import { getAssetManager } from '../services/asset-manager'
import { getActiveWorkspaceId } from '../services/workspace-service'
import { makePlayableAudio } from '../services/asset-file'
import { readExportSettings, exportExtension, exportDialogFilter, imageFormatFromName, prepareExportFile, downloadToTemp, removeTemp } from '../services/asset-export'

// Notifies all renderer windows that the asset set changed (imports, moves,
// orphans adopted) so open grids refresh.
export function notifyAssetsChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send('assets:changed') } catch {}
  }
}

// Notifies all renderer windows that a specific asset had metadata updated
// (e.g. favorite toggled, tags updated) so grids update the item in place
// without losing pagination or wiping the list.
export function notifyAssetUpdated(asset: any) {
  if (!asset) return
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send('assets:updated', asset) } catch {}
  }
}

function cleanFilePath(rawPath: string): string {
  let clean = rawPath
  if (clean.startsWith('file:///')) clean = clean.slice(8)
  else if (clean.startsWith('file://')) clean = clean.slice(7)
  else if (clean.startsWith('asset://localhost/')) clean = clean.slice('asset://localhost/'.length)
  clean = clean.replace(/[?#].*$/, '')
  if (clean.includes('%')) {
    try { clean = decodeURIComponent(clean) } catch {}
  }
  if (process.platform === 'win32') {
    clean = clean.replace(/^\/([a-zA-Z]:)/, '$1')
  }
  return path.normalize(clean)
}

export function registerAssetsHandlers({ handle }: IpcContext) {
  handle('assets:list', (_e, query?: any) => getAssetManager().queryAssets(query || {}))

  handle('assets:get', (_e, id: string) => getAssetManager().getAsset(id))

  handle('assets:delete', (_e, id: string) => {
    const result = getAssetManager().deleteAsset(id)
    notifyAssetsChanged()
    return result
  })

  handle('assets:toggleFavorite', (_e, id: string) => {
    const result = getAssetManager().toggleFavorite(id)
    if (result) notifyAssetUpdated(result)
    return result
  })

  handle('assets:updateTags', (_e, id: string, tags: string[]) => {
    const result = getAssetManager().updateTags(id, tags)
    if (result) notifyAssetUpdated(result)
    return result
  })

  handle('assets:deleteMultiple', (_e, ids: string[]) => {
    const result = getAssetManager().deleteAssets(ids)
    notifyAssetsChanged()
    return result
  })

  handle('assets:archiveMultiple', (_e, ids: string[], archive: boolean = true) => {
    const result = getAssetManager().archiveAssets(ids, archive)
    notifyAssetsChanged()
    return result
  })

  handle('assets:archive', (_e, id: string, archive: boolean = true) => {
    const result = getAssetManager().archiveAsset(id, archive)
    if (result) notifyAssetUpdated(result)
    notifyAssetsChanged()
    return result
  })

  handle('assets:moveToWorkspace', async (_e, ids: string[], targetWorkspaceId: string) => {
    // No broadcast here: the moving window updates its grid in-place with a FLIP
    // animation, and a full reload would defeat that.
    return getAssetManager().moveAssetsToWorkspace(ids, targetWorkspaceId)
  })

  handle('assets:addTagsMultiple', (_e, ids: string[], tags: string[]) => getAssetManager().addTagsMultiple(ids, tags))

  handle('assets:readBase64', async (_e, ids: string[]) => getAssetManager().readAssetsBase64(ids))

  handle('assets:refresh', (_e, id: string) => getAssetManager().refreshAsset(id))

  handle('assets:downloadToLocal', (_e, id: string) => getAssetManager().downloadToLocal(id))

  handle('assets:saveAs', async (event, id: string) => {
    const asset = getAssetManager().getAsset(id) as any
    if (!asset) return { ok: false, error: 'Asset not found' }
    const rawPath =
      asset.local_path ||
      asset.localPath ||
      (asset.file_path && !asset.file_path.startsWith('__error__') ? asset.file_path : null) ||
      (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : null)
    if (!rawPath) return { ok: false, error: 'No file available for this asset' }

    // Extension = what the exported file will contain: images in the Settings format,
    // videos as MP4, audio as its real binary (the stored file_name may not match either)
    const settings = readExportSettings()
    const mime = asset.mimeType || asset.mime_type
    const isRemote = rawPath.startsWith('http://') || rawPath.startsWith('https://')
    const sourceHint = isRemote ? new URL(rawPath).pathname : cleanFilePath(rawPath)
    const ext = exportExtension(sourceHint, mime, asset.type, settings)
    const baseName = path.parse(asset.file_name || asset.fileName || path.basename(sourceHint)).name || `asset_${id}`

    const win = event.sender ? BrowserWindow.fromWebContents(event.sender) : undefined
    const result = await dialog.showSaveDialog(win!, {
      title: 'Save asset as',
      defaultPath: baseName + ext,
      filters: [exportDialogFilter(ext), { name: 'All Files', extensions: ['*'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }

    let dest = result.filePath
    if (!path.extname(dest)) dest += ext

    let downloaded: string | null = null
    let prepared: { path: string; temp: boolean } | null = null
    try {
      const source = isRemote ? (downloaded = await downloadToTemp(rawPath, mime)) : cleanFilePath(rawPath)
      // An image extension typed in the dialog wins over the Settings format
      prepared = await prepareExportFile(source, mime, asset.type, settings, imageFormatFromName(dest))
      await fs.promises.copyFile(prepared.path, dest)
      return { ok: true, path: dest }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to save file' }
    } finally {
      if (prepared?.temp) await removeTemp(prepared.path)
      if (downloaded) await removeTemp(downloaded)
    }
  })

  handle('assets:exportZip', async (event, ids: string[], defaultZipName?: string) => {
    if (!ids || ids.length === 0) return { ok: false, error: 'No assets selected' }

    const win = event.sender ? BrowserWindow.fromWebContents(event.sender) : undefined
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
    const suggestedName = defaultZipName || `openfield_assets_${dateStr}.zip`

    const result = await dialog.showSaveDialog(win!, {
      title: 'Export Assets as ZIP',
      defaultPath: suggestedName,
      filters: [
        { name: 'ZIP Archives', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (result.canceled || !result.filePath) return { ok: false, canceled: true }

    let zipFilePath = result.filePath
    if (!zipFilePath.toLowerCase().endsWith('.zip')) {
      zipFilePath += '.zip'
    }

    let outputStream: fs.WriteStream | null = null
    let archive: any = null

    try {
      const manager = getAssetManager()
      const usedNames = new Set<string>()

      // Create ZIP instance using createZipArchive helper supporting Archiver v8 ZipArchive
      archive = createZipArchive({
        zlib: { level: 6 },
      })

      outputStream = fs.createWriteStream(zipFilePath)

      const archivePromise = new Promise<void>((resolve, reject) => {
        let finished = false
        const done = () => {
          if (!finished) {
            finished = true
            resolve()
          }
        }
        outputStream!.on('close', done)
        outputStream!.on('finish', done)
        outputStream!.on('error', (err: any) => reject(err))
        archive.on('warning', (err: any) => {
          if (err.code === 'ENOENT') {
            console.warn('[AssetManager] Archive warning:', err)
          } else {
            reject(err)
          }
        })
        archive.on('error', (err: any) => reject(err))
      })

      archive.pipe(outputStream)

      let entriesCount = 0
      const exportSettings = readExportSettings()
      const temps: string[] = []

      for (const id of ids) {
        const asset = manager.getAsset(id) as any
        if (!asset) continue

        const fileName = asset.file_name || asset.fileName
        const mimeType = asset.mime_type || asset.mimeType

        // Check local path candidates
        const candidates = [
          asset.local_path,
          asset.localPath,
          asset.file_path,
          asset.filePath,
        ].filter(Boolean)

        let resolvedLocalFile: string | null = null
        for (const cand of candidates) {
          if (typeof cand === 'string' && !cand.startsWith('http://') && !cand.startsWith('https://') && !cand.startsWith('__error__')) {
            const cleaned = cleanFilePath(cand)
            try {
              if (fs.existsSync(cleaned) && fs.statSync(cleaned).isFile()) {
                resolvedLocalFile = cleaned
                break
              }
            } catch {}
          }
        }

        // Source file: local copy, or the remote URL downloaded to a temp file
        let source = resolvedLocalFile
        if (!source) {
          const remoteUrl = candidates.find(c => typeof c === 'string' && (c.startsWith('http://') || c.startsWith('https://')))
          if (remoteUrl) {
            try {
              source = await downloadToTemp(remoteUrl, mimeType)
              temps.push(source)
            } catch (fetchErr) {
              console.error(`[AssetManager] Failed to fetch remote asset ${id}:`, fetchErr)
            }
          }
        }
        if (!source) continue

        // Converted to the export format (images) / MP4 (videos); extension matches the content
        let prepared: { path: string; ext: string; temp: boolean }
        try {
          prepared = await prepareExportFile(source, mimeType, asset.type, exportSettings)
          if (prepared.temp) temps.push(prepared.path)
        } catch (convErr) {
          console.error(`[AssetManager] Failed to prepare asset ${id} for export:`, convErr)
          continue
        }
        const ext = prepared.ext
        const baseName = path.parse(fileName || path.basename(source)).name || `asset_${id}`

        // Sanitize filename for ZIP entries (remove characters invalid in zip / Windows filesystems)
        let sanitized = (baseName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || `asset_${id}`) + ext

        // Deduplicate entry name inside the zip
        let finalName = sanitized
        let counter = 1
        const parsed = path.parse(sanitized)
        while (usedNames.has(finalName.toLowerCase())) {
          finalName = `${parsed.name}_${counter}${ext}`
          counter++
        }
        usedNames.add(finalName.toLowerCase())

        archive.file(prepared.path, { name: finalName })
        entriesCount++
      }

      if (entriesCount === 0) {
        try { archive?.abort?.() } catch {}
        try { outputStream?.destroy() } catch {}
        try { if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath) } catch {}
        return { ok: false, error: 'No se pudieron leer los archivos de los assets seleccionados' }
      }

      await archive.finalize()
      await archivePromise
      for (const t of temps) await removeTemp(t)

      // Verify final file on disk
      try {
        const stat = fs.statSync(zipFilePath)
        if (stat.size === 0) {
          try { fs.unlinkSync(zipFilePath) } catch {}
          return { ok: false, error: 'El archivo ZIP generado está vacío (0 bytes)' }
        }
      } catch {
        return { ok: false, error: 'No se pudo verificar el archivo ZIP generado' }
      }

      return { ok: true, path: zipFilePath, count: entriesCount }
    } catch (err: any) {
      console.error('[AssetManager] Failed to export zip:', err)
      try { archive?.abort?.() } catch {}
      try { outputStream?.destroy() } catch {}
      try { if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath) } catch {}
      return { ok: false, error: err?.message || 'Failed to generate ZIP archive' }
    }
  })

  handle('assets:showInFolder', (_e, id: string) => {
    const asset = getAssetManager().getAsset(id) as any
    if (!asset) return false
    const raw =
      asset.local_path ||
      asset.localPath ||
      (asset.file_path && !asset.file_path.startsWith('__error__') && !asset.file_path.startsWith('http') ? asset.file_path : null) ||
      (asset.filePath && !asset.filePath.startsWith('__error__') && !asset.filePath.startsWith('http') ? asset.filePath : null)
    if (!raw) return false
    const filePath = cleanFilePath(raw)
    try {
      shell.showItemInFolder(filePath)
    } catch {
      // Fallback: open parent directory if file doesn't exist
      const dir = path.dirname(filePath)
      shell.openPath(dir)
    }
    return true
  })

  handle('assets:recent', (_e, limit?: number) => getAssetManager().getRecentAssets(limit || 20))

  handle('assets:tags', () => getAssetManager().getAllTags())

  handle('assets:stats', () => getAssetManager().getStorageStats())
  handle('assets:webpStats', () => getAssetManager().getWebpStats())
  handle('assets:convertAllToWebp', () => getAssetManager().convertAllImagesToWebp())
  handle('assets:fixBrokenVideos', () => getAssetManager().fixBrokenVideos())
  handle('assets:brokenVideoStats', () => getAssetManager().getBrokenVideoStats())
  handle('assets:scanOrphans', () => getAssetManager().scanOrphans())
  handle('assets:adoptOrphans', async (_e, workspaceId?: string) => {
    const result = await getAssetManager().adoptOrphans(workspaceId)
    if (result.imported > 0) notifyAssetsChanged()
    return result
  })

  handle('assets:import', async (_e, filePaths: string[]) => {
    const manager = getAssetManager()
    const wsId = getActiveWorkspaceId()
    const results = []
    for (const fp of filePaths) {
      const ext = fp.toLowerCase().split('.').pop() || ''
      const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv']
      const audioExts = ['mp3', 'wav', 'ogg', 'flac']
      let type: 'image' | 'video' | 'audio' = 'image'
      if (videoExts.includes(ext)) type = 'video'
      else if (audioExts.includes(ext)) type = 'audio'
      try { results.push(await manager.importFile(fp, type, wsId)) } catch {}
    }
    if (results.length > 0) notifyAssetsChanged()
    return results
  })

  handle('assets:importBase64', async (_e, base64: string, mime: string, fileName: string, workspaceId?: string, modelUsed?: string) => {
    const result = await getAssetManager().importBase64(base64, mime, fileName || 'image.png', {
      workspaceId: workspaceId || getActiveWorkspaceId(),
      modelUsed: modelUsed || undefined,
    })
    notifyAssetsChanged()
    return result
  })

  // Playable copy of an audio Chromium cannot decode (e.g. 32-bit float WAV), for previews
  handle('assets:playableAudio', async (_e, src: { path?: string; base64?: string; mime?: string }) => {
    try { return await makePlayableAudio(src || {}) } catch { return null }
  })

  handle('assets:saveRef', async (_e, base64: string, mime: string, name: string) => {
    // Save reference image as a persistent binary asset
    const result = await getAssetManager().importBase64(base64, mime, name || 'ref.png', { workspaceId: getActiveWorkspaceId() })
    // Read back base64 for immediate display
    const fs = require('fs/promises')
    try {
      const buf = await fs.readFile(result.filePath)
      return { ...result, base64: buf.toString('base64') }
    } catch {
      return result
    }
  })
}
