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
import { registerMarketplaceHandlers } from './marketplace'
import { registerModelsHandlers } from './models'
import { registerLocalModelsHandlers } from './local-models'
import { registerBridgeHandlers } from './bridge'
import { registerReplicateHandlers } from './replicate'
import { registerFalHandlers } from './fal'
import { registerBalancesHandlers } from './balances'
import { registerUpdaterHandlers } from './updater'

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
  registerMarketplaceHandlers(ctx)
  registerModelsHandlers(ctx)
  registerLocalModelsHandlers(ctx)
  registerBridgeHandlers(ctx)
  registerReplicateHandlers(ctx)
  registerFalHandlers(ctx)
  registerBalancesHandlers(ctx)
  registerUpdaterHandlers(ctx)
}
