import { createContext } from './context'
import { registerSettingsHandlers } from './settings'
import { registerAssetsHandlers } from './assets'
import { registerOpenfieldHandlers } from './openfield'
import { registerProjectsHandlers } from './projects'
import { registerElementsHandlers } from './elements'
import { registerStoryboardHandlers } from './storyboard'
import { registerFfmpegHandlers } from './ffmpeg'
import { registerWindowHandlers } from './window'
import { registerTasksHandlers } from './tasks'
import { registerWorkflowsHandlers } from './workflows'
import { registerLogsHandlers } from './logs'
import { registerAppHandlers } from './app'
import { registerBridgeHandlers } from './bridge'
import { registerReplicateHandlers } from './replicate'
import { registerFalHandlers } from './fal'
import { registerMachgenHandlers } from './machgen'
import { registerHiggsfieldHandlers } from './higgsfield'
import { registerBalancesHandlers } from './balances'
import { registerElevenLabsHandlers } from './elevenlabs'
import { registerUpdaterHandlers } from './updater'
import { registerWorkspacesHandlers } from './workspaces'
import { registerPromptsHandlers } from './prompts'
import { registerDramaIpcHandlers } from './drama'

export function registerIpcHandlers() {
  const ctx = createContext()
  registerSettingsHandlers(ctx)
  registerAssetsHandlers(ctx)
  registerOpenfieldHandlers(ctx)
  registerProjectsHandlers(ctx)
  registerElementsHandlers(ctx)
  registerStoryboardHandlers(ctx)
  registerFfmpegHandlers(ctx)
  registerWindowHandlers(ctx)
  registerTasksHandlers(ctx)
  registerWorkflowsHandlers(ctx)
  registerLogsHandlers(ctx)
  registerAppHandlers(ctx)
  registerBridgeHandlers(ctx)
  registerReplicateHandlers(ctx)
  registerFalHandlers(ctx)
  registerMachgenHandlers(ctx)
  registerHiggsfieldHandlers(ctx)
  registerBalancesHandlers(ctx)
  registerElevenLabsHandlers(ctx)
  registerUpdaterHandlers(ctx)
  registerWorkspacesHandlers(ctx)
  registerPromptsHandlers(ctx)
  registerDramaIpcHandlers()
}
