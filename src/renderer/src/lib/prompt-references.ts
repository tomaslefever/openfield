import type { BuiltinReference, PromptReference } from '../stores/prompt-library-store'
import { fileUrl } from '../services/file-url'

/** A reference ready to display: bundled file, source-hosted example or stored base64 */
export interface ViewerImage {
  src: string
  type: 'image' | 'video'
  caption?: string
  credit?: string
  sourceUrl?: string
  license?: string
  date?: string
}

export function builtinViewerImages(refs: BuiltinReference[]): ViewerImage[] {
  return refs
    .filter(r => r.path || r.url)
    .map(r => ({
      src: r.path ? fileUrl(r.path) : r.url!,
      type: r.type,
      caption: r.caption,
      credit: r.credit,
      sourceUrl: r.sourceUrl,
      license: r.license,
      date: r.date,
    }))
}

export function userViewerImages(refs: PromptReference[]): ViewerImage[] {
  return refs.map(r => ({ src: `data:${r.mime};base64,${r.base64}`, type: r.type, caption: r.name }))
}
