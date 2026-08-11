import type { IpcContext } from './context'
import { getMcpBridge } from '../services/mcp'
import { getBridgePort, isBridgeEnabled } from '../services/storyboard-service'

export function registerBridgeHandlers({ handle }: IpcContext) {
  handle('bridge:getStatus', async () => {
    const bridge = getMcpBridge()
    return {
      running: bridge.isRunning(),
      port: bridge.getPort(),
      enabled: isBridgeEnabled(),
      endpoint: `http://127.0.0.1:${bridge.getPort()}/mcp`,
      protocol: 'Model Context Protocol (streamable HTTP)',
    }
  })
}
