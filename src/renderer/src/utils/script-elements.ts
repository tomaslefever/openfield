import type { StoryboardElementType } from '../stores/storyboard-store'

export const ELEMENT_TYPE_CONFIG: Record<StoryboardElementType, {
  label: string
  plural: string
  color: string
  bg: string
  border: string
}> = {
  character: { label: 'Personaje', plural: 'Personajes', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  scenario: { label: 'Locación', plural: 'Locaciones', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  object: { label: 'Objeto', plural: 'Objetos', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
}

const TYPE_BY_PREFIX: Record<string, StoryboardElementType> = {
  char: 'character',
  scn: 'scenario',
  obj: 'object',
}

const TYPE_BY_LIST: Record<string, StoryboardElementType> = {
  personaje: 'character',
  personajes: 'character',
  character: 'character',
  characters: 'character',
  locacion: 'scenario',
  locaciones: 'scenario',
  escenario: 'scenario',
  escenarios: 'scenario',
  location: 'scenario',
  locations: 'scenario',
  scenarios: 'scenario',
  objeto: 'object',
  objetos: 'object',
  object: 'object',
  objects: 'object',
}

export interface ExtractedElement {
  name: string
  type: StoryboardElementType
  description: string
}

function cleanName(raw: string): string {
  return raw.replace(/[#*`_]/g, '').trim()
}

export function extractScriptElements(script: string): ExtractedElement[] {
  const found: ExtractedElement[] = []
  const seen = new Set<string>()

  const push = (name: string, type: StoryboardElementType, description: string) => {
    const n = cleanName(name)
    if (!n || n.length > 60) return
    const key = `${type}:${n.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    found.push({ name: n, type, description: description.trim().slice(0, 200) })
  }

  const lines = script.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // @char:Name / @scn:Name / @obj:Name mentions
    const mentions = line.matchAll(/@(char|scn|obj):([A-Za-zÁ-Úá-úÑñ0-9 _.-]+)/g)
    for (const m of mentions) {
      const type = TYPE_BY_PREFIX[m[1].toLowerCase()]
      if (type) push(m[2], type, '')
    }

    // Dialogue: ALL-CAPS NAME: line
    const dialogue = line.match(/^\s*([A-ZÁ-ÚÑ][A-ZÁ-ÚÑ0-9\s'.-]{1,40}):\s*(.+)\s*$/)
    if (dialogue && !line.trimStart().startsWith('#') && !line.trimStart().startsWith('>') && !line.trimStart().startsWith('-') && !line.trimStart().startsWith('*') && !/^\s*\d+\./.test(line)) {
      push(dialogue[1], 'character', dialogue[2])
    }

    // Slugline: INT./EXT. location
    const slug = line.match(/^\s*(?:INT\.?|EXT\.?|INT\/EXT\.?|INT-EXT\.?)[\s–—-]+(.+)$/i)
    if (slug) {
      push(slug[1].replace(/[.,;:]$/, ''), 'scenario', line.trim())
    }

    // Typed list sections: ## Personajes / ### Locaciones / - Objeto: name
    const listHeader = line.match(/^#{1,4}\s*(personaje|personajes|character|characters|locacion|locaciones|escenario|escenarios|location|locations|scenarios|objeto|objetos|object|objects)\s*:?\s*$/i)
    if (listHeader) {
      const type = TYPE_BY_LIST[listHeader[1].toLowerCase()]
      if (!type) continue
      let j = i + 1
      while (j < lines.length) {
        const next = lines[j]
        if (/^#{1,4}\s/.test(next)) break
        const item = next.match(/^\s*[-*•]\s*(.+)$/) || next.match(/^\s*(\d+\.\s*)(.+)$/)
        const raw = item ? item[2] : next.trim()
        if (!raw) { j++; continue }
        const sep = raw.match(/^(.*?)(?:\s+[—–-]\s+|\s+\(|\s*:\s*)(.*)$/)
        push(sep ? sep[1] : raw, type, sep ? sep[2] : '')
        j++
      }
    }
  }

  return found
}

export interface ScriptScene {
  title: string
  shotCount: number
  description: string
}

export function parseScriptScenes(script: string): ScriptScene[] {
  const scenes: ScriptScene[] = []
  let current: ScriptScene | null = null

  for (const line of script.split('\n')) {
    if (line.startsWith('## ')) {
      current = { title: line.slice(3).trim() || `Escena ${scenes.length + 1}`, shotCount: 0, description: '' }
      scenes.push(current)
    } else if (line.startsWith('### ')) {
      if (current) current.shotCount += 1
    } else if (line.startsWith('#### ')) {
      // nested take — ignore
    } else if (line.startsWith('##')) {
      current = { title: line.slice(2).trim() || `Escena ${scenes.length + 1}`, shotCount: 0, description: '' }
      scenes.push(current)
    } else if (current && line.trim() && !line.trimStart().startsWith('#') && !current.description) {
      current.description = line.trim().slice(0, 300)
    }
  }

  return scenes
}
