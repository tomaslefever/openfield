import { MarketplaceModel, MarketplaceSearchParams, MarketplaceSearchResult, CURATED_MODELS } from './types'

export class MarketplaceClient {
  private baseUrl = 'https://huggingface.co/api'

  async search(params: MarketplaceSearchParams): Promise<MarketplaceSearchResult> {
    const url = new URL(`${this.baseUrl}/models`)
    if (params.pipelineTag) url.searchParams.set('pipeline_tag', params.pipelineTag)
    if (params.query) url.searchParams.set('search', params.query)
    if (params.library) url.searchParams.set('library', params.library)
    if (params.sort === 'downloads') url.searchParams.set('sort', 'downloads')
    else if (params.sort === 'likes') url.searchParams.set('sort', 'likes')
    else if (params.sort === 'lastModified') url.searchParams.set('sort', 'lastModified')
    url.searchParams.set('direction', '-1')
    url.searchParams.set('limit', String(params.limit || 20))
    url.searchParams.set('full', 'false')

    try {
      const res = await fetch(url.toString())
      if (!res.ok) return { models: [], total: 0, hasMore: false }
      const models = await res.json() as any[]
      return {
        models: models.map(m => this.mapHfModel(m)),
        total: models.length,
        hasMore: models.length === (params.limit || 20),
      }
    } catch {
      return { models: [], total: 0, hasMore: false }
    }
  }

  async getModel(modelId: string): Promise<MarketplaceModel | null> {
    try {
      const res = await fetch(`${this.baseUrl}/models/${modelId}?blobs=true`)
      if (!res.ok) return null
      const raw = await res.json()
      return this.mapHfModel(raw)
    } catch {
      return null
    }
  }

  async getReadme(modelId: string): Promise<string> {
    try {
      const res = await fetch(`https://huggingface.co/${modelId}/resolve/main/README.md`)
      if (!res.ok) return ''
      return await res.text()
    } catch {
      return ''
    }
  }

  getCurated(): MarketplaceModel[] {
    return CURATED_MODELS
  }

  private mapHfModel(raw: any): MarketplaceModel {
    const cardData = raw.cardData || {}
    const nameFromId = raw.id.split('/').pop() || raw.id

    return {
      id: raw.id,
      pipelineTag: raw.pipeline_tag || 'text-to-image',
      displayName: raw.modelId || nameFromId,
      description: cardData.modelDescription || raw.description || '',
      author: raw.author || raw.id.split('/')[0] || 'unknown',
      downloads: raw.downloads || 0,
      likes: raw.likes || 0,
      license: cardData.license || 'unknown',
      tags: raw.tags || [],
      updatedAt: raw.lastModified || '',
      siblings: (raw.siblings || []).map((s: any) => ({
        filename: s.rfilename,
        size: s.size || 0,
      })),
      cardData,
      recommendedVariant: null,
      minVram: null,
    }
  }
}

let instance: MarketplaceClient | null = null

export function getMarketplaceClient(): MarketplaceClient {
  if (!instance) instance = new MarketplaceClient()
  return instance
}
