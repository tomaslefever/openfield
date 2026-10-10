import { EventEmitter } from 'events'
import * as crypto from 'crypto'
import { getRawDb } from '../db'
import { getTaskWorkspace } from './workspace-service'

/**
 * Recovery of generations left in "processing" whose local polling loop died (app restart,
 * crash, network drop) while the provider kept working on the job.
 *
 * Every provider queue implements RecoverableQueue and calls registerRecoverableProvider()
 * at module load. reconcileAllProviders() then checks each stuck task once against its
 * provider: completed → the queue's own success path downloads and assigns the asset;
 * failed → the task is marked failed (never resubmitted, which would charge again);
 * still running → polling resumes in the background.
 *
 * Adding a provider: implement checkRemote/completeRemote on its queue, make `processing`
 * and `processQueue` public, and register it with its `tasks.provider` value.
 */

export type RemoteTaskStatus =
  | { state: 'completed'; result: any }
  | { state: 'failed'; error: string }
  | { state: 'running'; detail?: string; progress?: number }

export interface RecoverableQueue extends EventEmitter {
  /** Task ids this session is actively driving (submit/poll loop running). */
  readonly processing: Set<string>
  /** Starts pending tasks. */
  processQueue(): void | Promise<void>
  /** One status check of the provider job. Throws on network/auth errors (task is left as is). */
  checkRemote(task: any, externalId: string): Promise<RemoteTaskStatus>
  /** The queue's normal success path: download the output, assign the asset, emit task:completed. */
  completeRemote(task: any, result: any, externalId: string): Promise<void>
  /** Submits a new generation (used by the manual retry of a failed one). */
  enqueue(type: string, payload: any): Promise<string>
}

export interface ReconcileResult {
  checked: number
  completed: number
  failed: number
  resumed: number
}

/**
 * Marks a failed/cancelled task's placeholder asset with `__error__:<message>` so the grid shows
 * the error instead of a perpetual "generating" card (the user can delete it from there).
 * Only touches placeholders that never received a file.
 */
export function markPlaceholderFailed(taskId: string, message: string) {
  try {
    getRawDb().prepare(
      `UPDATE assets SET file_path = ?, updated_at = ?
       WHERE task_id = ? AND (file_path IS NULL OR file_path = '') AND (local_path IS NULL OR local_path = '')`
    ).run(`__error__:${message || 'Generation failed'}`, Date.now(), taskId)
  } catch (err: any) {
    console.warn('[TaskRecovery] Could not mark placeholder as failed:', err?.message)
  }
}

/** Thrown by a poll loop when the provider itself reports the job failed (vs. network/API errors). */
export class RemoteJobFailedError extends Error {}

/**
 * Automatic retries never resubmit a generation (that charges again). They only resume a job the
 * provider already accepted whose polling broke (network drop, timeout); any other failure —
 * submission failed, or the provider reported the job as failed — fails the task and waits for
 * the user's manual retry.
 */
export function canAutoResume(taskId: string, err?: unknown): boolean {
  if (err instanceof RemoteJobFailedError) return false
  try {
    const row = getRawDb().prepare('SELECT external_id, request_id, prediction_id, openfield_task_id FROM tasks WHERE task_id = ?').get(taskId) as any
    return !!(row?.externalId || row?.requestId || row?.predictionId || row?.openfieldTaskId)
  } catch {
    return false
  }
}

/**
 * Call before handing an error to the retry logic. A job the provider failed is forgotten, so
 * the retry submits a fresh one; any other error (e.g. "fetch failed" while polling) keeps the
 * job id, so the retry resumes polling that same job instead of resubmitting and paying twice.
 */
export function forgetFailedJob(taskId: string, err: unknown) {
  if (!(err instanceof RemoteJobFailedError)) return
  try {
    getRawDb().prepare('UPDATE tasks SET request_id = NULL, external_id = NULL WHERE task_id = ?').run(taskId)
  } catch {}
}

const POLL_INTERVAL_MS = 3000
const MAX_CONSECUTIVE_ERRORS = 5

const providers = new Map<string, () => RecoverableQueue | null>()

/** `provider` is the value stored in tasks.provider. `getQueue` returns null when unconfigured. */
export function registerRecoverableProvider(provider: string, getQueue: () => RecoverableQueue | null) {
  providers.set(provider, getQueue)
}

/** The configured queue of a provider (`tasks.provider` value), or null. */
export function getProviderQueue(provider: string): RecoverableQueue | null {
  try { return providers.get(provider)?.() || null } catch { return null }
}

/** First non-empty API key among the given settings keys. */
export function readApiKey(...keys: string[]): string | null {
  for (const key of keys) {
    try {
      const row = getRawDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
      if (!row?.value) continue
      let value: any
      try { value = JSON.parse(row.value) } catch { value = row.value }
      if (typeof value === 'string' && value.trim()) return value
    } catch {}
  }
  return null
}

function logRun(taskId: string, step: string, message: string, level = 'info') {
  try {
    getRawDb().prepare('INSERT INTO run_logs (id, task_id, step, level, message, payload, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), taskId, step, level, message, null, getTaskWorkspace(taskId), Date.now())
  } catch {}
}

function externalIdOf(task: any): string | null {
  return task.externalId || task.requestId || task.predictionId || task.openfieldTaskId || null
}

function isStillProcessing(taskId: string): boolean {
  const row = getRawDb().prepare('SELECT status FROM tasks WHERE task_id = ?').get(taskId) as any
  return row?.status === 'processing'
}

function failTask(queue: RecoverableQueue, taskId: string, error: string) {
  const raw = getRawDb()
  logRun(taskId, 'failed', `Marked as failed after recovery: ${error}`, 'error')
  raw.prepare('UPDATE tasks SET status = ?, error_message = ?, updated_at = ? WHERE task_id = ?')
    .run('failed', error, Date.now(), taskId)
  markPlaceholderFailed(taskId, error)
  raw.save()
  queue.emit('task:failed', { taskId, error })
}

async function complete(queue: RecoverableQueue, task: any, result: any, externalId: string): Promise<boolean> {
  try {
    await queue.completeRemote(task, result, externalId)
    return true
  } catch (err: any) {
    // Output not retrievable right now: leave it processing so the next reconcile retries
    logRun(task.taskId, 'reconcile-error', `Could not finalize completed job: ${err?.message}`, 'warn')
    return false
  }
}

/** Keeps polling a job that was still running when reconciled. */
async function follow(queue: RecoverableQueue, task: any, externalId: string) {
  const taskId = task.taskId
  let errors = 0
  try {
    while (true) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
      if (!isStillProcessing(taskId)) return // canceled or finished elsewhere

      let status: RemoteTaskStatus
      try {
        status = await queue.checkRemote(task, externalId)
        errors = 0
      } catch (err: any) {
        if (++errors >= MAX_CONSECUTIVE_ERRORS) {
          logRun(taskId, 'reconcile-error', `Stopped polling after ${errors} errors: ${err?.message}`, 'warn')
          return
        }
        continue
      }

      if (status.state === 'completed') { await complete(queue, task, status.result, externalId); return }
      if (status.state === 'failed') { failTask(queue, taskId, status.error); return }

      queue.emit('task:progress', { taskId, state: status.detail, progress: status.progress })
      getRawDb().prepare('UPDATE tasks SET updated_at = ? WHERE task_id = ?').run(Date.now(), taskId)
    }
  } finally {
    queue.processing.delete(taskId)
    queue.processQueue()
  }
}

async function reconcileQueue(provider: string, queue: RecoverableQueue): Promise<ReconcileResult> {
  const result: ReconcileResult = { checked: 0, completed: 0, failed: 0, resumed: 0 }
  const stuck = getRawDb().prepare('SELECT * FROM tasks WHERE provider = ? AND status = ?').all(provider, 'processing') as any[]

  await Promise.all(stuck.map(async (task) => {
    const taskId = task.taskId
    const externalId = externalIdOf(task)
    // Driven by this session, or crashed before the provider assigned a job id (resubmitting
    // could charge twice, so those are left alone)
    if (!externalId || queue.processing.has(taskId)) return

    queue.processing.add(taskId)
    result.checked++
    let following = false
    try {
      const status = await queue.checkRemote(task, externalId)
      logRun(taskId, 'reconcile', `Remote status on reconcile: ${status.state}${status.state === 'running' && status.detail ? ` (${status.detail})` : ''}`)

      if (status.state === 'completed') {
        if (await complete(queue, task, status.result, externalId)) result.completed++
      } else if (status.state === 'failed') {
        failTask(queue, taskId, status.error)
        result.failed++
      } else {
        following = true
        result.resumed++
        void follow(queue, task, externalId)
      }
    } catch (err: any) {
      logRun(taskId, 'reconcile-error', `Could not check provider: ${err?.message}`, 'warn')
    } finally {
      if (!following) queue.processing.delete(taskId)
    }
  }))

  // Pending tasks only start from processQueue, which never ran if nothing was enqueued this session
  await queue.processQueue()
  return result
}

/** Reconciles stuck tasks of every registered, configured provider. */
export async function reconcileAllProviders(): Promise<Record<string, ReconcileResult>> {
  const out: Record<string, ReconcileResult> = {}
  await Promise.all([...providers.entries()].map(async ([provider, getQueue]) => {
    try {
      const queue = getQueue()
      if (queue) out[provider] = await reconcileQueue(provider, queue)
    } catch (err: any) {
      console.warn(`[TaskRecovery] ${provider} reconcile failed:`, err?.message)
    }
  }))
  return out
}
