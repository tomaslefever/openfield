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
        const dollars = await client.getBalance()
        if (dollars != null && isFinite(dollars)) {
          balances.push({
            provider: 'fal',
            label: 'fal.ai',
            kind: 'dollars',
            value: Math.round(dollars * 100) / 100,
            url: 'https://fal.ai/dashboard/billing',
          })
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

    const deepseekKey = readSetting('deepseekApiKey')
    if (deepseekKey) {
      try {
        const res = await fetch('https://api.deepseek.com/user/balance', {
          headers: { 'Authorization': `Bearer ${deepseekKey}` },
        })
        if (res.ok) {
          const data = await res.json()
          const info = data?.balance_infos?.[0]
          const totalBal = info?.total_balance
          balances.push({
            provider: 'deepseek',
            label: 'DeepSeek',
            kind: totalBal != null ? 'dollars' : 'account',
            value: totalBal != null ? parseFloat(totalBal) : 'Conectado',
            url: 'https://platform.deepseek.com/top_up',
          })
        } else {
          balances.push({
            provider: 'deepseek',
            label: 'DeepSeek',
            kind: 'account',
            value: 'Conectado',
            url: 'https://platform.deepseek.com',
          })
        }
      } catch {
        balances.push({
          provider: 'deepseek',
          label: 'DeepSeek',
          kind: 'account',
          value: 'Conectado',
          url: 'https://platform.deepseek.com',
        })
      }
    }

    const openaiKey = readSetting('openaiApiKey')
    if (openaiKey) {
      balances.push({
        provider: 'openai',
        label: 'OpenAI',
        kind: 'account',
        value: 'Conectado',
        url: 'https://platform.openai.com/usage',
      })
    }

    const anthropicKey = readSetting('anthropicApiKey')
    if (anthropicKey) {
      balances.push({
        provider: 'anthropic',
        label: 'Anthropic',
        kind: 'account',
        value: 'Conectado',
        url: 'https://console.anthropic.com/settings/billing',
      })
    }

    const geminiKey = readSetting('geminiApiKey')
    if (geminiKey) {
      balances.push({
        provider: 'gemini',
        label: 'Google Gemini',
        kind: 'account',
        value: 'Conectado',
        url: 'https://aistudio.google.com',
      })
    }

    const openrouterKey = readSetting('openrouterApiKey')
    if (openrouterKey) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/credits', {
          headers: { 'Authorization': `Bearer ${openrouterKey}` },
        })
        if (res.ok) {
          const json = await res.json()
          const totalCredits = json?.data?.total_credits
          const totalUsage = json?.data?.total_usage
          const remaining = (typeof totalCredits === 'number' && typeof totalUsage === 'number')
            ? Math.max(0, Math.round((totalCredits - totalUsage) * 100) / 100)
            : null

          balances.push({
            provider: 'openrouter',
            label: 'OpenRouter',
            kind: remaining != null ? 'dollars' : 'account',
            value: remaining != null ? remaining : 'Conectado',
            url: 'https://openrouter.ai/credits',
          })
        } else {
          balances.push({
            provider: 'openrouter',
            label: 'OpenRouter',
            kind: 'account',
            value: 'Conectado',
            url: 'https://openrouter.ai/credits',
          })
        }
      } catch {
        balances.push({
          provider: 'openrouter',
          label: 'OpenRouter',
          kind: 'account',
          value: 'Conectado',
          url: 'https://openrouter.ai/credits',
        })
      }
    }

    return balances
  })
}
