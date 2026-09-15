import { toast } from 'sonner'

export interface ExportZipResult {
  ok: boolean
  path?: string
  count?: number
  canceled?: boolean
  error?: string
}

/**
 * Reusable utility to export a list of asset IDs into a compressed ZIP file.
 * Handles loading toast feedback, error alerts, and success messages.
 *
 * @param assetIds Array of asset IDs to export
 * @param defaultZipName Optional suggested default name for the zip file
 */
export async function exportAssetsAsZip(
  assetIds: string[],
  defaultZipName?: string
): Promise<ExportZipResult> {
  if (!assetIds || assetIds.length === 0) {
    toast.error('No hay assets seleccionados para exportar')
    return { ok: false, error: 'No assets selected' }
  }

  const toastId = toast.loading(`Preparando exportación de ${assetIds.length} ${assetIds.length === 1 ? 'asset' : 'assets'}...`)

  try {
    const api = (window as any).electronAPI
    if (!api?.assets?.exportZip) {
      toast.error('La función de exportación no está disponible en este entorno', { id: toastId })
      return { ok: false, error: 'electronAPI.assets.exportZip is unavailable' }
    }

    const res: ExportZipResult = await api.assets.exportZip(assetIds, defaultZipName)

    if (res.canceled) {
      toast.dismiss(toastId)
      return res
    }

    if (res.ok) {
      const fileName = res.path ? res.path.split(/[\\/]/).pop() : 'archivo ZIP'
      toast.success('Assets exportados con éxito', {
        id: toastId,
        description: `${res.count || assetIds.length} assets guardados en ${fileName}`,
      })
      return res
    } else {
      toast.error('Error al exportar assets', {
        id: toastId,
        description: res.error || 'No se pudo generar el archivo ZIP',
      })
      return res
    }
  } catch (err: any) {
    console.error('[exportAssetsAsZip] Error:', err)
    toast.error('Error inesperado al exportar', {
      id: toastId,
      description: err?.message || 'Error desconocido al generar el archivo ZIP',
    })
    return { ok: false, error: err?.message || 'Unexpected error' }
  }
}
