import { libraryConsultedWithin, markLibraryConsulted, searchLibraryPrompts, type PromptKind } from '../prompt-library'
import { ToolInputError } from './types'

/** How long one look at the prompt library covers the generations that follow */
const LIBRARY_CHECK_WINDOW_MS = 45 * 60 * 1000

/**
 * Agents must look at the prompt library before generating. The first generation without a
 * recent search_prompt_library / get_library_prompt call is refused once, with the closest
 * matches for its prompt; that refusal counts as the look, so calling again goes through
 * (for when the user dictated the exact prompt or nothing in the library fits).
 */
export function requireLibraryCheck(prompt: string, kind: PromptKind, model?: string) {
  if (libraryConsultedWithin(LIBRARY_CHECK_WINDOW_MS)) return
  markLibraryConsulted()
  let matches = searchLibraryPrompts({ query: prompt, kind, model, limit: 5 })
  // A model no template is tagged for (or an unknown id) must not hide the whole library
  if (!matches.length && model) matches = searchLibraryPrompts({ query: prompt, kind, limit: 5 })
  const list = matches.length
    ? matches.map((m) => `- ${m.id} · ${m.name} [${m.types.join(', ')}] — ${m.description}`).join('\n')
    : '(no close match for this prompt; try search_prompt_library with the kind of piece, e.g. "character sheet" or "ads")'
  throw new ToolInputError(
    'Not generated yet: check Openfield\'s prompt library first. Its templates are tuned for quality and consistency per model.\n' +
    `Closest library prompts for this request:\n${list}\n` +
    'Open one with get_library_prompt (variables to fill it, show_references to see the target look), adapt it to the brief and call generate with the adapted prompt. ' +
    'If the user dictated this exact prompt or none fits, call generate again unchanged and it will go through.'
  )
}
