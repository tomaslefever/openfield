import * as fs from 'fs/promises'
import * as path from 'path'
import { app, BrowserWindow, dialog } from 'electron'
import type { IpcContext } from './context'
import { getRawDb } from '../db'
import { hasFalKey } from '../services/voice-clone-service'
import { transcribeBase64, transcribeFile } from '../services/transcription-service'

/** Local path of a library asset (audio or video) */
export function assetMediaPath(assetId: string): string {
  const row = getRawDb().prepare('SELECT type, file_path, local_path FROM assets WHERE id = ?').get(assetId) as any
  if (!row) throw new Error(`Asset '${assetId}' not found`)
  if (row.type !== 'audio' && row.type !== 'video') throw new Error('Only audio and video assets can be transcribed')
  const file = row.localPath || row.filePath
  if (!file || /^https?:/i.test(file)) throw new Error('The asset has no local file yet')
  return file
}

/** Voice Studio → Transcribir: speech to text with fal Whisper, saved as .txt or .srt */
export function registerTranscriptionHandlers({ handle }: IpcContext) {
  handle('transcription:info', () => ({ configured: hasFalKey() }))
  handle('transcription:fromBase64', (_e, params) => transcribeBase64(params || {}))
  handle('transcription:fromAsset', (_e, assetId: string, language?: string) => transcribeFile(assetMediaPath(assetId), { language }))

  handle('transcription:save', async (event, params: { content: string; name?: string; format: 'txt' | 'srt' }) => {
    const content = String(params?.content || '')
    if (!content.trim()) return { ok: false, error: 'No hay texto para guardar' }
    const ext = params.format === 'srt' ? 'srt' : 'txt'
    const win = BrowserWindow.fromWebContents(event.sender)
    const safeName = String(params.name || 'Transcripción').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Transcripción'
    const result = await dialog.showSaveDialog(win!, {
      title: ext === 'srt' ? 'Guardar subtítulos' : 'Guardar transcripción',
      defaultPath: path.join(app.getPath('documents'), `${safeName}.${ext}`),
      filters: [ext === 'srt' ? { name: 'SubRip', extensions: ['srt'] } : { name: 'Texto', extensions: ['txt'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }
    const dest = result.filePath.toLowerCase().endsWith(`.${ext}`) ? result.filePath : `${result.filePath}.${ext}`
    // BOM so Notepad and players on Windows read accents correctly
    await fs.writeFile(dest, '﻿' + content, 'utf-8')
    return { ok: true, path: dest }
  })
}
