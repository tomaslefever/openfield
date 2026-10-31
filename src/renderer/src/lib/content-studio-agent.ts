import { useShortDramaStore } from '../stores/short-drama-store'
import { useAppStore } from '../stores/app-store'

/**
 * Runs Content Studio steps requested by the MCP bridge with the app's own store logic, so an
 * agent-driven piece is built exactly as the UI builds it (prompts, references, lip-sync audio).
 * The main process gates which step may run; this side only executes and reports task ids.
 */

type Kind = 'character' | 'scenario' | 'prop' | 'keyframe' | 'voice' | 'video'

interface Command {
  id: string
  action: 'flush' | 'reload' | 'refreshList' | 'open' | 'generate' | 'assemble' | 'listVoices'
  args?: any
}

const store = () => useShortDramaStore.getState()

async function ensureOpen(projectId: string) {
  if (store().id !== projectId) await store().openProject(projectId)
  if (store().id !== projectId) throw new Error(`No se pudo abrir el proyecto ${projectId} en Content Studio`)
}

/** The task id each item records once its generation is dispatched */
function taskIdOf(kind: Kind, id: string): string | undefined {
  const s = store()
  if (kind === 'character') return s.characters.find((c) => c.id === id)?.taskId
  if (kind === 'scenario') return s.scenarios.find((c) => c.id === id)?.taskId
  if (kind === 'prop') return s.props.find((c) => c.id === id)?.taskId
  const shot = s.shots.find((sh) => sh.id === id)
  if (kind === 'keyframe') return shot?.keyframeTaskId
  if (kind === 'video') return shot?.videoTaskId
  return undefined
}

async function generate(projectId: string, kind: Kind, ids: string[]) {
  await ensureOpen(projectId)
  const s = store()
  const results: Array<{ id: string; taskId?: string; status: string; error?: string }> = []

  for (const id of ids) {
    try {
      if (kind === 'character') await s.generateCharacterImage(id)
      else if (kind === 'scenario') await s.generateScenarioImage(id)
      else if (kind === 'prop') await s.generatePropImage(id)
      else if (kind === 'keyframe') await s.generateShotKeyframe(id)
      else if (kind === 'video') await s.generateShotVideo(id)
      else if (kind === 'voice') {
        // ElevenLabs answers synchronously: the shot holds its audio when this returns
        await s.generateShotVoice(id)
        const shot = store().shots.find((sh) => sh.id === id)
        results.push({ id, status: shot?.audioStatus || 'unknown' })
        continue
      }
      results.push({ id, taskId: taskIdOf(kind, id), status: 'dispatched' })
    } catch (err: any) {
      results.push({ id, status: 'failed', error: err?.message || String(err) })
    }
  }
  await store().saveCurrentProject()
  return results
}

async function run(cmd: Command): Promise<any> {
  const a = cmd.args || {}
  switch (cmd.action) {
    case 'flush':
      // Persist pending edits of the open project before the main process writes it
      if (store().id === a.projectId) {
        await store().saveCurrentProject()
        return { open: true }
      }
      return { open: false }
    case 'reload':
      if (store().id === a.projectId && store().viewMode === 'editor') await store().openProject(a.projectId)
      await store().fetchProjectsList('all')
      return { ok: true }
    case 'refreshList':
      await store().fetchProjectsList('all')
      return { ok: true }
    case 'open':
      await ensureOpen(a.projectId)
      useAppStore.getState().setPage('contentStudio')
      return { ok: true }
    case 'generate':
      return generate(a.projectId, a.kind, a.ids || [])
    case 'assemble':
      await ensureOpen(a.projectId)
      await store().assembleFinalEpisode(a.options)
      return store().finalVideo
    case 'listVoices':
      return (window as any).electronAPI?.elevenlabs?.voices?.(a)
    default:
      throw new Error(`Acción desconocida: ${(cmd as any).action}`)
  }
}

let installed = false

export function installContentStudioAgent() {
  const api = (window as any).electronAPI?.contentStudioAgent
  if (installed || !api?.onCommand) return
  installed = true
  api.onCommand(async (cmd: Command) => {
    try {
      api.reply({ id: cmd.id, ok: true, result: await run(cmd) })
    } catch (err: any) {
      api.reply({ id: cmd.id, ok: false, error: err?.message || String(err) })
    }
  })
}
