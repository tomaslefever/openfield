import * as fs from 'fs/promises'
import * as path from 'path'
import { app, BrowserWindow, dialog } from 'electron'
import type { IpcContext } from './context'
import { captionProviderStatus, generateAutocaptions, montageSrt, type AutocaptionRequest } from '../services/autocaptions'

/** Timeline autocaptions (Montage page) */
export function registerCaptionsHandlers({ handle }: IpcContext) {
  handle('captions:providers', () => captionProviderStatus())

  /** The renderer sends its live doc, so captions line up with unsaved edits */
  handle('captions:generate', async (_e, req: AutocaptionRequest) => {
    if (req?.doc?.kind !== 'montage' || !Array.isArray(req.doc.clips)) return { ok: false, error: 'El montaje no es válido' }
    try {
      return { ok: true, ...(await generateAutocaptions(req)) }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'No se pudieron generar los subtítulos' }
    }
  })

  /** Writes one caption track (or all of them) as .srt, asking where with a save dialog */
  handle('captions:exportSrt', async (event, doc: AutocaptionRequest['doc'], trackId: string | undefined, name: string) => {
    const srt = montageSrt(doc, trackId)
    if (!srt.trim()) return { ok: false, error: 'La pista no tiene subtítulos' }
    const win = BrowserWindow.fromWebContents(event.sender)
    const safeName = String(name || 'Subtítulos').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Subtítulos'
    const result = await dialog.showSaveDialog(win!, {
      title: 'Exportar subtítulos',
      defaultPath: path.join(app.getPath('videos'), `${safeName}.srt`),
      filters: [{ name: 'SubRip', extensions: ['srt'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }
    const dest = result.filePath.toLowerCase().endsWith('.srt') ? result.filePath : `${result.filePath}.srt`
    // BOM so players on Windows read accents correctly
    await fs.writeFile(dest, '﻿' + srt, 'utf-8')
    return { ok: true, path: dest }
  })
}
