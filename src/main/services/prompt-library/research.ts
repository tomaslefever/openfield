import type { BuiltinPrompt } from './types'
import { IMAGE_RESEARCH_PROMPTS } from './research-image'
import { VIDEO_RESEARCH_PROMPTS } from './research-video'
import { HIGGSFIELD_PROMPTS } from './research-higgsfield'

/** Templates distilled from the official prompting guides and community collections */
export const RESEARCH_PROMPTS: BuiltinPrompt[] = [...HIGGSFIELD_PROMPTS, ...IMAGE_RESEARCH_PROMPTS, ...VIDEO_RESEARCH_PROMPTS]
