import type { OpenfieldApiClient } from '../client'
import type { KieTaskDetailResponse } from '../types'

/**
 * GET /api/v1/jobs/recordInfo?taskId=...
 * Returns the current state of a generation task.
 */
export async function getTaskDetail(
  client: OpenfieldApiClient,
  taskId: string
): Promise<KieTaskDetailResponse['data']> {
  const res = await client.request<KieTaskDetailResponse>(`/api/v1/jobs/recordInfo?taskId=${taskId}`)
  return res.data
}

/**
 * Polls getTaskDetail until the task reaches 'success' or 'fail'.
 */
export async function waitForCompletion(
  client: OpenfieldApiClient,
  taskId: string,
  onProgress?: (state: string, progress?: number) => void
): Promise<KieTaskDetailResponse['data']> {
  while (true) {
    const detail = await getTaskDetail(client, taskId)
    onProgress?.(detail.state, detail.progress)

    if (detail.state === 'success') return detail
    if (detail.state === 'fail') throw new Error(detail.failMsg || 'Generation failed')

    await new Promise(r => setTimeout(r, 3000))
  }
}
