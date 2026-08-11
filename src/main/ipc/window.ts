import { BrowserWindow } from 'electron'
import type { IpcContext } from './context'

export function registerWindowHandlers({ handle }: IpcContext) {
  handle('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
  handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) win.unmaximize(); else win?.maximize()
  })
  handle('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close())
  handle('window:isMaximized', (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() || false)
}
