import type { ReplicateApiClient } from '../client'
import type { Account } from '../types'

/**
 * GET /account
 * Returns the authenticated account (username, type).
 */
export async function getAccount(client: ReplicateApiClient): Promise<Account> {
  return client.request<Account>('/account')
}
