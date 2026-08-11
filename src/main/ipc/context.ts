import { ipcMain } from 'electron'
import { getRawDb } from '../db'
import type { DbWrapper } from '../db'

export interface IpcContext {
  raw: DbWrapper
  handle(channel: string, handler: (...args: any[]) => any): void
}

export function createContext(): IpcContext {
  const raw = getRawDb()
  function handle(channel: string, handler: (...args: any[]) => any) {
    try { ipcMain.removeHandler(channel) } catch {}
    ipcMain.handle(channel, handler)
  }
  return { raw, handle }
}
