import type { IpcContext } from './context'
import {
  STORYBOARD_STYLES,
  listBoards,
  getBoard,
  createBoard,
  updateBoardName,
  updateBoard,
  deleteBoard,
  createScene,
  updateScene,
  setSceneAsset,
  deleteScene,
  reorderScenes,
  createTransition,
  deleteTransition,
  updateTransition,
  generateSceneImage,
  generateSceneVideo,
  generateTransition,
} from '../services/storyboard-service'

export function registerStoryboardHandlers({ handle }: IpcContext) {
  handle('storyboard:listStyles', async () => STORYBOARD_STYLES.map(s => ({ id: s.id, name: s.name, description: s.description, suffix: s.suffix })))

  handle('storyboard:list', async () => listBoards())

  handle('storyboard:get', async (_e, id: string) => getBoard(id))

  handle('storyboard:create', async (_e, name: string, style?: string) => createBoard(name, style))

  handle('storyboard:delete', async (_e, id: string) => deleteBoard(id))

  handle('storyboard:updateName', async (_e, id: string, name: string) => updateBoardName(id, name))

  handle('storyboard:updateSettings', async (_e, id: string, settings: any) => updateBoard(id, settings))

  handle('storyboard:createScene', async (_e, storyboardId: string, data: any) => createScene(storyboardId, data))

  handle('storyboard:updateScene', async (_e, id: string, data: any) => updateScene(id, data))

  handle('storyboard:setSceneAsset', async (_e, sceneId: string, type: 'image' | 'video', assetId: string) => setSceneAsset(sceneId, type, assetId))

  handle('storyboard:deleteScene', async (_e, id: string) => deleteScene(id))

  handle('storyboard:reorderScenes', async (_e, storyboardId: string, sceneIds: string[]) => reorderScenes(storyboardId, sceneIds))

  handle('storyboard:createTransition', async (_e, data: any) => createTransition(data))

  handle('storyboard:deleteTransition', async (_e, id: string) => deleteTransition(id))

  handle('storyboard:updateTransition', async (_e, id: string, data: any) => updateTransition(id, data))

  handle('storyboard:generateSceneImage', async (_e, sceneId: string, params: any) => generateSceneImage(sceneId, params))

  handle('storyboard:generateSceneVideo', async (_e, sceneId: string, params: any) => generateSceneVideo(sceneId, params))

  handle('storyboard:generateTransition', async (_e, transitionId: string, params: any) => generateTransition(transitionId, params))
}
