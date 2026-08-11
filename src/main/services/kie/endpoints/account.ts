import type { OpenfieldApiClient } from '../client'
import type { KieAccountResponse } from '../types'

/**
 * GET /api/v1/chat/credit
 * Returns the account's remaining credits.
 */
export async function getAccountCredits(client: OpenfieldApiClient): Promise<number> {
  const res = await client.request<KieAccountResponse>('/api/v1/chat/credit')
  return res.data
}
