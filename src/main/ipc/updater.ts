import type { IpcContext } from './context'
import { checkForUpdates, downloadUpdate, quitAndInstall, getUpdateState } from '../services/updater'

export function registerUpdaterHandlers({ handle }: IpcContext) {
  handle('updater:check', () => checkForUpdates())
  handle('updater:download', () => downloadUpdate())
  handle('updater:install', () => quitAndInstall())
  handle('updater:state', () => getUpdateState())
}
