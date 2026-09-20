import type { IpcContext } from './context'
import { readSetting } from './helpers'
import { OpenfieldApiClient } from '../services/kie'
import { ReplicateApiClient } from '../services/replicate'
import { FalApiClient } from '../services/fal'
import { MachgenApiClient } from '../services/machgen'

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

    const machgenKey = readSetting('machgenApiKey')
    if (machgenKey) {
      try {
        const client = new MachgenApiClient(machgenKey)
        const acc = await client.getAccount()
        if (acc && typeof acc.balance_micros === 'number') {
          const dollars = acc.balance_micros / 1_000_000
          balances.push({
            provider: 'machgen',
            label: 'MachGen',
            kind: 'dollars',
            value: dollars,
            url: 'https://www.machgen.ai',
          })
        }
      } catch { /* key invalid or offline */ }
    }

    const elevenLabsKey = readSetting('elevenlabsApiKey')
    if (elevenLabsKey) {
      try {
        const res = await fetch('https://api.elevenlabs.io/v1/user', {
          headers: { 'xi-api-key': elevenLabsKey },
        })
        if (res.ok) {
          const user = await res.json()
          const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || 'Connected'
          balances.push({
            provider: 'elevenlabs',
            label: 'ElevenLabs',
            kind: 'account',
            value: name,
            url: 'https://elevenlabs.io/app/settings/api-keys',
          })
        }
      } catch { /* key invalid or offline */ }
    }

    const higgsfieldKey = readSetting('higgsfieldApiKey')
    if (higgsfieldKey) {
      balances.push({
        provider: 'higgsfield',
        label: 'Higgsfield AI',
        kind: 'account',
        value: 'Connected',
        url: 'https://console.higgsfield.ai',
      })
    }

    return balances
  })
}
