import type { IpcContext } from './context'
import {
  listUserPromptRows,
  listBuiltinPrompts,
  createUserPrompt,
  updateUserPrompt,
  deleteUserPrompt,
  rowToRenderer,
  setPromptReview,
  PROMPT_CATEGORIES,
  MODEL_TAGS,
  PROMPT_TYPES,
  type ReviewStatus,
} from '../services/prompt-library'

const REVIEW_STATUSES: ReviewStatus[] = ['pending', 'approved', 'rejected']

export function registerPromptsHandlers({ handle }: IpcContext) {
  handle('prompts:list', () => listUserPromptRows())

  // Openfield's built-in templates (read-only; references come with their file path)
  handle('prompts:builtin', () => listBuiltinPrompts())

  handle('prompts:taxonomy', () => ({ categories: PROMPT_CATEGORIES, models: MODEL_TAGS, types: PROMPT_TYPES }))

  handle('prompts:create', (_e, data: any) => rowToRenderer(createUserPrompt(data || {})))

  handle('prompts:update', (_e, id: string, data: any) => rowToRenderer(updateUserPrompt(id, data || {})))

  handle('prompts:delete', (_e, id: string) => {
    deleteUserPrompt(id)
    return true
  })

  // Review verdict on any library prompt, built-ins included
  handle('prompts:setReview', (_e, id: string, status: ReviewStatus, note?: string) => {
    if (!REVIEW_STATUSES.includes(status)) throw new Error(`Invalid review status '${status}'`)
    setPromptReview(id, status, typeof note === 'string' ? note : undefined)
    return true
  })
}
