import { shell, dialog, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import type { IpcContext } from './context'
import { getAssetManager } from '../services/asset-manager'

export function registerAssetsHandlers({ handle }: IpcContext) {
  handle('assets:list', (_e, query?: any) => getAssetManager().queryAssets(query || {}))

  handle('assets:get', (_e, id: string) => getAssetManager().getAsset(id))

  handle('assets:delete', (_e, id: string) => getAssetManager().deleteAsset(id))

  handle('assets:toggleFavorite', (_e, id: string) => getAssetManager().toggleFavorite(id))

  handle('assets:updateTags', (_e, id: string, tags: string[]) => getAssetManager().updateTags(id, tags))

  handle('assets:deleteMultiple', (_e, ids: string[]) => getAssetManager().deleteAssets(ids))

  handle('assets:addTagsMultiple', (_e, ids: string[], tags: string[]) => getAssetManager().addTagsMultiple(ids, tags))

  handle('assets:readBase64', async (_e, ids: string[]) => getAssetManager().readAssetsBase64(ids))

  handle('assets:refresh', (_e, id: string) => getAssetManager().refreshAsset(id))

  handle('assets:downloadToLocal', (_e, id: string) => getAssetManager().downloadToLocal(id))

  handle('assets:saveAs', async (event, id: string) => {
    const asset = getAssetManager().getAsset(id) as any
    if (!asset) return { ok: false, error: 'Asset not found' }
    const rawPath = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') ? asset.filePath : null)
    if (!rawPath) return { ok: false, error: 'No file available for this asset' }

    let defaultName = asset.fileName || path.basename(rawPath)
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
        await fs.writeFile(result.filePath, Buffer.from(await resp.arrayBuffer()))
      } else {
        await fs.copyFile(rawPath, result.filePath)
      }
      return { ok: true, path: result.filePath }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to save file' }
    }
  })

  handle('assets:showInFolder', (_e, id: string) => {
    const asset = getAssetManager().getAsset(id) as any
    if (!asset) return false
    const raw = asset.localPath || (asset.filePath && !asset.filePath.startsWith('__error__') && !asset.filePath.startsWith('http') ? asset.filePath : null)
    if (!raw) return false
    const decoded = raw.includes('%') ? decodeURIComponent(raw) : raw
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

  handle('assets:import', async (_e, filePaths: string[]) => {
    const manager = getAssetManager()
    const results = []
    for (const fp of filePaths) {
      const ext = fp.toLowerCase().split('.').pop() || ''
      const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv']
      const audioExts = ['mp3', 'wav', 'ogg', 'flac']
      let type: 'image' | 'video' | 'audio' = 'image'
      if (videoExts.includes(ext)) type = 'video'
      else if (audioExts.includes(ext)) type = 'audio'
      try { results.push(await manager.importFile(fp, type)) } catch {}
    }
    return results
  })

  handle('assets:importBase64', async (_e, base64: string, mime: string, fileName: string) => {
    return getAssetManager().importBase64(base64, mime, fileName || 'image.png')
  })

  handle('assets:saveRef', async (_e, base64: string, mime: string, name: string) => {
    // Save reference image as a persistent binary asset
    const result = await getAssetManager().importBase64(base64, mime, name || 'ref.png')
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
