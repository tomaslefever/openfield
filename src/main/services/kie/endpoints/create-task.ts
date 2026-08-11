import type { OpenfieldApiClient } from '../client'
import type { KieTaskResponse } from '../types'

/**
 * POST /api/v1/jobs/createTask
 * Creates a generation task and returns the KIE task id.
 */
export async function createTask(
  client: OpenfieldApiClient,
  model: string,
  input: Record<string, any>,
  callBackUrl?: string
): Promise<string> {
  const body: Record<string, any> = { model, input }
  if (callBackUrl) body.callBackUrl = callBackUrl

  const res = await client.request<KieTaskResponse>('/api/v1/jobs/createTask', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return res.data.taskId
}
