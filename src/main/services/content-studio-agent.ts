import { BrowserWindow, ipcMain } from 'electron'
import crypto from 'crypto'
import { getRawDb } from '../db'
import { getDramaProject } from '../ipc/drama'

/**
 * Agent-driven Content Studio: the MCP bridge asks the renderer (which owns the Content Studio
 * store and its generation logic) to run one step at a time, and this module decides which step
 * may run. A step only opens once every earlier stage is complete AND signed off by the user.
 */

export const STAGES = ['script', 'references', 'keyframes', 'voices', 'videos', 'final'] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_LABELS: Record<Stage, string> = {
  script: 'Guion y desglose de planos',
  references: 'Personajes, locaciones y objetos',
  keyframes: 'Keyframes de los planos',
  voices: 'Locuciones (ElevenLabs)',
  videos: 'Videos de los planos',
  final: 'Montaje final',
}

// ─── Renderer RPC ─────────────────────────────────────────────

const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()
let replyHandlerRegistered = false

function ensureReplyHandler() {
  if (replyHandlerRegistered) return
  replyHandlerRegistered = true
  ipcMain.removeHandler('content-studio:reply')
  ipcMain.handle('content-studio:reply', (_e, res: { id: string; ok: boolean; result?: any; error?: string }) => {
    const p = pending.get(res?.id)
    if (!p) return
    pending.delete(res.id)
    clearTimeout(p.timer)
    if (res.ok) p.resolve(res.result)
    else p.reject(new Error(res.error || 'Content Studio no pudo completar la acción'))
  })
}

/** Runs an action inside the app's Content Studio and resolves with its result */
export function runInStudio(action: string, args: any, timeoutMs = 60_000): Promise<any> {
  ensureReplyHandler()
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
  if (!win) return Promise.reject(new Error('La ventana de Openfield no está abierta: Content Studio no puede ejecutar el paso.'))
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Content Studio no respondió a "${action}" a tiempo`))
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    win.webContents.send('content-studio:command', { id, action, args })
  })
}

// ─── Stage approvals ──────────────────────────────────────────

export function getApprovals(projectId: string): Partial<Record<Stage, { approvedAt: number; note?: string }>> {
  const rows = getRawDb().prepare('SELECT stage, approved_at, note FROM drama_stage_approvals WHERE project_id = ?').all(projectId) as any[]
  const out: Partial<Record<Stage, { approvedAt: number; note?: string }>> = {}
  for (const r of rows) out[r.stage as Stage] = { approvedAt: r.approvedAt ?? r.approved_at, note: r.note || undefined }
  return out
}

export function setApproval(projectId: string, stage: Stage, note?: string) {
  getRawDb().prepare('INSERT OR REPLACE INTO drama_stage_approvals (project_id, stage, approved_at, note) VALUES (?, ?, ?, ?)')
    .run(projectId, stage, Date.now(), note || null)
}

/** Drops the sign-off of `stage` and of every later stage (their inputs changed) */
export function clearApprovalsFrom(projectId: string, stage: Stage) {
  const later = STAGES.slice(STAGES.indexOf(stage))
  const raw = getRawDb()
  for (const s of later) raw.prepare('DELETE FROM drama_stage_approvals WHERE project_id = ? AND stage = ?').run(projectId, s)
}

// ─── Stage status ─────────────────────────────────────────────

export interface StageStatus {
  stage: Stage
  label: string
  done: number
  total: number
  complete: boolean
  /** Nothing to do in this stage (e.g. no dialogue): it never blocks */
  skipped?: boolean
  approved: boolean
  missing?: string[]
}

const hasImage = (x: any) => !!(x.imageUrl || x.imageAssetId)
const hasDialogue = (sh: any) => !!(sh.dialogueText && String(sh.dialogueText).trim())

export function requireProject(projectId: string): any {
  const project = getDramaProject(projectId)
  if (!project) throw new Error(`Proyecto de Content Studio '${projectId}' no encontrado`)
  return project
}

export function stageStatuses(project: any): StageStatus[] {
  const approvals = getApprovals(project.id)
  const shots: any[] = project.shots || []
  const refs = [...(project.characters || []), ...(project.scenarios || []), ...(project.props || [])]
  const dialogueShots = shots.filter(hasDialogue)
  const usesTts = project.voiceSource !== 'video'
  const label = (sh: any) => `plano ${sh.order}`

  const make = (stage: Stage, done: number, total: number, missing: string[], skipped = false): StageStatus => {
    const complete = skipped || (total > 0 && done === total)
    return {
      stage,
      label: STAGE_LABELS[stage],
      done,
      total,
      complete,
      ...(skipped ? { skipped } : {}),
      approved: skipped || !!approvals[stage],
      ...(missing.length ? { missing: missing.slice(0, 20) } : {}),
    }
  }

  const scriptReady = !!(project.logline && String(project.logline).trim()) && shots.length > 0
  return [
    make('script', scriptReady ? 1 : 0, 1, scriptReady ? [] : ['logline y planos']),
    make('references', refs.filter(hasImage).length, refs.length, refs.filter((r) => !hasImage(r)).map((r) => r.name)),
    make('keyframes', shots.filter((sh) => sh.keyframeUrl || sh.keyframeAssetId).length, shots.length,
      shots.filter((sh) => !(sh.keyframeUrl || sh.keyframeAssetId)).map(label)),
    make('voices', dialogueShots.filter((sh) => sh.audioStatus === 'completed' && (sh.audioUrl || sh.audioAssetId)).length, dialogueShots.length,
      dialogueShots.filter((sh) => !(sh.audioStatus === 'completed' && (sh.audioUrl || sh.audioAssetId))).map(label),
      !usesTts || dialogueShots.length === 0),
    make('videos', shots.filter((sh) => sh.videoStatus === 'completed').length, shots.length,
      shots.filter((sh) => sh.videoStatus !== 'completed').map(label)),
    make('final', project.finalVideoPath || project.finalVideoAssetId ? 1 : 0, 1, []),
  ]
}

/**
 * Throws unless `stage` may run now: every earlier stage must be complete and approved by the
 * user. This is what keeps an agent from skipping steps (e.g. videos before the voices exist).
 */
export function assertStageOpen(project: any, stage: Stage) {
  const statuses = stageStatuses(project)
  for (const s of statuses.slice(0, STAGES.indexOf(stage))) {
    if (!s.complete) {
      throw new Error(`Etapa bloqueada: "${STAGE_LABELS[stage]}" necesita que "${s.label}" esté completa (${s.done}/${s.total}${s.missing ? `; falta: ${s.missing.join(', ')}` : ''}).`)
    }
    if (!s.approved) {
      throw new Error(`Etapa bloqueada: el usuario aún no aprueba "${s.label}". Muéstrale el resultado y, solo si lo aprueba explícitamente, llama a content_studio_approve_stage con stage "${s.stage}".`)
    }
  }
}

export function nextStep(statuses: StageStatus[]): string {
  for (const s of statuses) {
    if (!s.complete) return `Completar "${s.label}" (${s.done}/${s.total}).`
    if (!s.approved) return `Mostrar "${s.label}" al usuario y esperar su aprobación explícita antes de content_studio_approve_stage("${s.stage}").`
  }
  return 'Pieza terminada.'
}
