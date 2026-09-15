import { shell, dialog, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
const archiver = require('archiver')
import type { IpcContext } from './context'
import { getAssetManager } from '../services/asset-manager'
import { getActiveWorkspaceId } from '../services/workspace-service'

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

    let defaultName = asset.file_name || asset.fileName || path.basename(rawPath)
    if (!path.extname(defaultName)) defaultName += path.extname(rawPath) || '.bin'

    const win = event.sender ? BrowserWindow.fromWebContents(event.sender) : undefined
    const result = await dialog.showSaveDialog(win!, {
      title: 'Save asset as',
      defaultPath: defaultName,
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }

    try {
      if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
        const resp = await fetch(rawPath)
        if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` }
        await fs.promises.writeFile(result.filePath, Buffer.from(await resp.arrayBuffer()))
      } else {
        let cleanPath = rawPath
        if (cleanPath.startsWith('file:///')) cleanPath = cleanPath.slice(8)
        else if (cleanPath.startsWith('file://')) cleanPath = cleanPath.slice(7)
        else if (cleanPath.startsWith('asset://localhost/')) cleanPath = cleanPath.slice('asset://localhost/'.length)
        cleanPath = cleanPath.replace(/[?#].*$/, '')
        if (cleanPath.includes('%')) {
          try { cleanPath = decodeURIComponent(cleanPath) } catch {}
        }
        await fs.promises.copyFile(path.normalize(cleanPath), result.filePath)
      }
      return { ok: true, path: result.filePath }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to save file' }
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

    try {
      const manager = getAssetManager()
      const usedNames = new Set<string>()
      const entriesToArchive: Array<{ name: string; buffer: Buffer }> = []

      for (const id of ids) {
        const asset = manager.getAsset(id) as any
        if (!asset) continue

        const rawPath =
          asset.local_path ||
          asset.localPath ||
          (asset.file_path && !asset.file_path.startsWith('__error__') ? asset.file_path : null) ||
          (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : null)
        if (!rawPath) continue

        const fileName = asset.file_name || asset.fileName
        const mimeType = asset.mime_type || asset.mimeType

        // Clean path if needed
        let cleanPath = rawPath
        if (cleanPath.startsWith('file:///')) {
          cleanPath = cleanPath.slice(8)
        } else if (cleanPath.startsWith('file://')) {
          cleanPath = cleanPath.slice(7)
        } else if (cleanPath.startsWith('asset://localhost/')) {
          cleanPath = cleanPath.slice('asset://localhost/'.length)
        }
        cleanPath = cleanPath.replace(/[?#].*$/, '')
        if (cleanPath.includes('%')) {
          try { cleanPath = decodeURIComponent(cleanPath) } catch {}
        }

        // Determine base filename and extension
        let baseName = fileName || (cleanPath ? path.basename(cleanPath) : `asset_${id}`)
        let ext = path.extname(baseName)
        if (!ext && mimeType) {
          const mimeExtMap: Record<string, string> = {
            'image/png': '.png',
            'image/jpeg': '.jpg',
            'image/webp': '.webp',
            'image/gif': '.gif',
            'video/mp4': '.mp4',
            'video/webm': '.webm',
            'video/quicktime': '.mov',
            'audio/mpeg': '.mp3',
            'audio/wav': '.wav',
            'audio/ogg': '.ogg',
            'audio/flac': '.flac',
          }
          ext = mimeExtMap[mimeType] || ''
          if (ext && !baseName.toLowerCase().endsWith(ext)) {
            baseName += ext
          }
        }

        // Sanitize filename for ZIP entries (remove characters invalid in zip / Windows filesystems)
        let sanitized = baseName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
        if (!sanitized) sanitized = `asset_${id}${ext || '.bin'}`

        // Deduplicate entry name inside the zip
        let finalName = sanitized
        let counter = 1
        const parsed = path.parse(sanitized)
        while (usedNames.has(finalName.toLowerCase())) {
          finalName = `${parsed.name}_${counter}${parsed.ext || ext}`
          counter++
        }
        usedNames.add(finalName.toLowerCase())

        // Read buffer from remote URL or local file
        if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
          try {
            const resp = await fetch(cleanPath)
            if (resp.ok) {
              const buf = Buffer.from(await resp.arrayBuffer())
              entriesToArchive.push({ name: finalName, buffer: buf })
            }
          } catch (fetchErr) {
            console.error(`[AssetManager] Failed to fetch remote asset ${id}:`, fetchErr)
          }
        } else {
          try {
            const normalizedLocal = path.normalize(cleanPath)
            const buf = await fs.promises.readFile(normalizedLocal)
            entriesToArchive.push({ name: finalName, buffer: buf })
          } catch (fileErr) {
            console.error(`[AssetManager] Failed to read local asset ${id} at ${cleanPath}:`, fileErr)
          }
        }
      }

      if (entriesToArchive.length === 0) {
        return { ok: false, error: 'No se pudieron leer los archivos de los assets seleccionados' }
      }

      // Write to ZIP using archiver
      await new Promise<void>((resolve, reject) => {
        const outputStream = fs.createWriteStream(zipFilePath)
        const archive = archiver('zip', {
          zlib: { level: 6 },
        })

        outputStream.on('close', () => resolve())
        outputStream.on('error', (err: any) => reject(err))
        archive.on('warning', (err: any) => {
          if (err.code === 'ENOENT') {
            console.warn('[AssetManager] Archive warning:', err)
          } else {
            reject(err)
          }
        })
        archive.on('error', (err: any) => reject(err))

        archive.pipe(outputStream)

        for (const entry of entriesToArchive) {
          archive.append(entry.buffer, { name: entry.name })
        }

        archive.finalize().catch(reject)
      })

      return { ok: true, path: zipFilePath, count: entriesToArchive.length }
    } catch (err: any) {
      console.error('[AssetManager] Failed to export zip:', err)
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
    let clean = raw
    if (clean.startsWith('file:///')) clean = clean.slice(8)
    else if (clean.startsWith('file://')) clean = clean.slice(7)
    else if (clean.startsWith('asset://localhost/')) clean = clean.slice('asset://localhost/'.length)
    clean = clean.replace(/[?#].*$/, '')
    const decoded = clean.includes('%') ? decodeURIComponent(clean) : clean
    const filePath = path.normalize(decoded)
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
