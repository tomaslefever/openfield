/**
 * Robust duration extractor for script headers, scene tags, and shot descriptions.
 * Detects patterns like:
 * - (5s), (5 seg), (5 segundos), (5 sec), (5")
 * - [10s], [10 seg], [8 segs]
 * - "Duración: 5s", "Duracion: 6 segundos"
 * - (00:05), 00:08, 01:15
 * - " - 5s", " - 8 seg"
 */
export function extractDurationFromText(text?: string): number | undefined {
  if (!text) return undefined

  // 1. mm:ss timecode format (e.g. (00:05), 00:08, [01:10])
  const timecodeMatch = text.match(/(?:^|[(\[\s–—-])(\d{1,2}):(\d{2})(?:[)\]\s–—-]|$)/)
  if (timecodeMatch) {
    const mins = parseInt(timecodeMatch[1], 10)
    const secs = parseInt(timecodeMatch[2], 10)
    const total = mins * 60 + secs
    if (total > 0 && total <= 300) return total
  }

  // 2. Explicit duration labels (e.g. "Duración: 5s", "Duracion estimada: 8 seg")
  const explicitMatch = text.match(/(?:duraci[oó]n|duration)(?:\s+estimada)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:s(?:eg(?:undo)?s?)?|sec(?:ond)?s?)?\b/i)
  if (explicitMatch) {
    const val = Math.round(parseFloat(explicitMatch[1]))
    if (val > 0 && val <= 300) return val
  }

  // 3. Bracketed/parenthesized duration (e.g. (5s), (5 seg), (5 segundos), [10s], [8 segs], (5"))
  const bracketMatch = text.match(/[(\[]\s*(\d+(?:\.\d+)?)\s*(?:s(?:eg(?:undo)?s?)?|sec(?:ond)?s?|")\s*[)\]]/i)
  if (bracketMatch) {
    const val = Math.round(parseFloat(bracketMatch[1]))
    if (val > 0 && val <= 300) return val
  }

  // 4. Inline duration with separator (e.g. " - 5s", " : 8 seg", " ~ 6s", " de 5 segundos")
  const inlineMatch = text.match(/(?:^|[\s–—:|~de])\s*(\d+(?:\.\d+)?)\s*(?:s(?:eg(?:undo)?s?)?|sec(?:ond)?s?|")(?:\s|[\),.;–—:]|$)/i)
  if (inlineMatch) {
    const val = Math.round(parseFloat(inlineMatch[1]))
    if (val > 0 && val <= 300) return val
  }

  return undefined
}
