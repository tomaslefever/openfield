export interface FalModelCatalogEntry {
  id: string
  name: string
  category: string
  type: 'video'
  costPerSecond: number
  resolutions: string[]
  aspectRatios: string[]
  freeReferenceImages: number
  extraReferenceImageCost: number
}

export const FAL_MODELS: FalModelCatalogEntry[] = [
  {
    id: 'minimax/h3/reference-to-video',
    name: 'MiniMax H3',
    category: 'MiniMax',
    type: 'video',
    costPerSecond: 0.13,
    resolutions: ['768P', '2K', '4K'],
    aspectRatios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    freeReferenceImages: 5,
    extraReferenceImageCost: 0.08,
  },
]

export function getFalModel(modelId: string): FalModelCatalogEntry | undefined {
  return FAL_MODELS.find(m => m.id === modelId)
}

/**
 * Estimated cost: seconds × per-second price, plus the surcharge for
 * reference images beyond the free count.
 */
export function estimateFalCost(modelId: string, durationSeconds: number, referenceImageCount = 0): number {
  const model = getFalModel(modelId)
  if (!model) return 0
  const base = model.costPerSecond * Math.max(0, durationSeconds)
  const extraImages = Math.max(0, referenceImageCount - model.freeReferenceImages)
  return base + extraImages * model.extraReferenceImageCost
}
