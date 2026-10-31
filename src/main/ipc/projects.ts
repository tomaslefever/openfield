import * as crypto from 'crypto'
import * as path from 'path'
import { app, BrowserWindow, dialog } from 'electron'
import type { IpcContext } from './context'
import { getActiveWorkspaceId } from '../services/workspace-service'
import { assetModelLookup, cancelActiveExport, detectVoices, findMontage, planAutoDucking, saveFromUi, startExport, type MontageDoc } from '../services/montage-service'
import { createMontageFromLayout, findLayout, listLayouts } from '../services/montage-layouts'

export function registerProjectsHandlers({ raw, handle }: IpcContext) {
  handle('projects:list', () => {
    const wsId = getActiveWorkspaceId()
    return raw.prepare('SELECT * FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC').all(wsId)
  })

  handle('projects:get', (_e, id: string) => {
    return raw.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  })

  handle('projects:create', (_e, name: string) => {
    const id = crypto.randomUUID()
    const now = Date.now()
    const wsId = getActiveWorkspaceId()
    const timelineData = JSON.stringify({
      tracks: [
        { id: 'track-video-1', type: 'video', clips: [], locked: false, visible: true, muted: false },
        { id: 'track-audio-1', type: 'audio', clips: [], locked: false, visible: true, muted: false },
      ],
      duration: 0, fps: 30, width: 1920, height: 1080,
    })
    raw.prepare('INSERT INTO projects (id, name, timeline_data, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, timelineData, wsId, now, now)
    return raw.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  })

  handle('projects:update', (_e, id: string, data: any) => {
    // Montage timelines go through the montage service (revisions shared with the MCP tools)
    if (data?.timelineData?.kind === 'montage') {
      const res = saveFromUi(id, data.timelineData, typeof data.baseRev === 'number' ? data.baseRev : undefined, data.name || undefined)
      const row = raw.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any
      return res.ok ? { ...row, rev: res.rev } : { ...row, ...res }
    }
    const now = Date.now()
    raw.prepare('UPDATE projects SET name = COALESCE(?, name), timeline_data = COALESCE(?, timeline_data), updated_at = ? WHERE id = ?')
      .run(data.name || null, data.timelineData ? JSON.stringify(data.timelineData) : null, now, id)
    return raw.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  })

  handle('projects:delete', (_e, id: string) => {
    raw.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return true
  })

  /** Renders a montage project to MP4. Without outputPath, asks for one with a save dialog. */
  handle('projects:export', async (event, id: string, outputPath?: string) => {
    const rec = findMontage(id)
    if (!rec) return { ok: false, error: 'El proyecto no es un montaje' }

    let dest = outputPath
    if (!dest) {
      const win = BrowserWindow.fromWebContents(event.sender)
      const safeName = String(rec.name || 'Montaje').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Montaje'
      const result = await dialog.showSaveDialog(win!, {
        title: 'Exportar montaje',
        defaultPath: path.join(app.getPath('videos'), `${safeName}.mp4`),
        filters: [{ name: 'Video MP4', extensions: ['mp4'] }],
      })
      if (result.canceled || !result.filePath) return { ok: false, canceled: true }
      dest = result.filePath
    }
    if (!dest.toLowerCase().endsWith('.mp4')) dest += '.mp4'

    // Shares the one-export-at-a-time lock and the progress events with MCP exports
    let started
    try {
      started = startExport(id, dest)
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Error al exportar' }
    }
    const job = await started.done
    if (job.status === 'completed') return { ok: true, path: dest }
    return { ok: false, error: job.error || 'Error al exportar', canceled: job.status === 'cancelled' }
  })

  /** Which clips/tracks of a montage doc are voices, from their library assets (TTS); the doc is not saved */
  handle('projects:detectVoices', (_e, doc: MontageDoc) => {
    if (doc?.kind !== 'montage' || !Array.isArray(doc.clips)) return { voiceTracks: [], voiceClips: [] }
    return detectVoices(structuredClone(doc), assetModelLookup())
  })

  /** What the Timeline's Autoducking button would mark and duck; the doc is not saved */
  handle('projects:planAutoDucking', (_e, doc: MontageDoc) => {
    if (doc?.kind !== 'montage' || !Array.isArray(doc.clips)) return { ok: false, reason: 'no-voices', voiceTracks: [], voiceClips: [], backgroundTracks: [] }
    return planAutoDucking(doc, assetModelLookup())
  })

  /** Layout presets for "Nuevo montaje desde plantilla" */
  handle('projects:layouts', () => listLayouts().map((l) => ({ name: l.name, description: l.description, builtIn: !!l.builtIn, vertical: l.aspect < 1 })))

  /** A new montage built from a layout (never touches existing montages) */
  handle('projects:createFromLayout', (_e, layoutName: string, name?: string) => {
    try {
      const { record } = createMontageFromLayout(String(name || ''), findLayout(String(layoutName)), 'ui')
      return { ok: true, id: record.id, name: record.name }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'No se pudo crear el montaje' }
    }
  })

  handle('projects:exportCancel', () => {
    cancelActiveExport()
    return true
  })
}
