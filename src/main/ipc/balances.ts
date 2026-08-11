import type { IpcContext } from './context'
import { readSetting } from './helpers'
import { OpenfieldApiClient } from '../services/kie'
import { ReplicateApiClient } from '../services/replicate'
import { FalApiClient } from '../services/fal'

export function registerBalancesHandlers({ handle }: IpcContext) {
  handle('balances:list', async () => {
    const balances: any[] = []

    const kieKey = readSetting('openfieldApiKey') || readSetting('kieApiKey')
    if (kieKey) {
      try {
        const credits = await new OpenfieldApiClient(kieKey).getAccountCredits()
        if (typeof credits === 'number' && credits >= 0) {
          balances.push({ provider: 'kie', label: 'KIE.ai', kind: 'credits', value: credits })
        }
      } catch { /* key invalid or offline */ }
    }

    const repKey = readSetting('replicateApiKey')
    if (repKey) {
      try {
        const acc = await new ReplicateApiClient(repKey).getAccount()
        if (acc?.username) {
          balances.push({
            provider: 'replicate',
            label: 'Replicate',
            kind: 'account',
            value: acc.username,
            url: 'https://replicate.com/account/billing',
          })
        }
      } catch { /* key invalid or offline */ }
    }

    const falKey = readSetting('falApiKey')
    if (falKey) {
      try {
        const client = new FalApiClient(falKey)
        const billing = await client.request<{ balance?: string; balance_cents?: number }>('/users/me/billing')
        if (billing && (billing.balance_cents != null || billing.balance != null)) {
          const dollars = billing.balance_cents != null
            ? billing.balance_cents / 100
            : parseFloat(billing.balance || '0')
          if (isFinite(dollars)) {
            balances.push({ provider: 'fal', label: 'fal.ai', kind: 'dollars', value: dollars })
          }
        }
      } catch { /* key invalid or offline */ }
    }

    return balances
  })
}
