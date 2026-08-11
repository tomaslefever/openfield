import type { IpcContext } from './context'

export function registerAppHandlers({ handle }: IpcContext) {
  handle('app:isDev', () => process.env.NODE_ENV === 'development' || process.argv.includes('--dev'))
}
