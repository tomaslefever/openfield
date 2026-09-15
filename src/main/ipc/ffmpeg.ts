import type { IpcContext } from './context'
import { getFFmpeg } from '../services/ffmpeg'

export function registerFfmpegHandlers({ handle }: IpcContext) {
  handle('ffmpeg:probe', async (_e, filePath: string) => {
    return getFFmpeg().probe(filePath)
  })

  handle('ffmpeg:thumbnail', async (_e, filePath: string, time?: number) => {
    const ffmpeg = getFFmpeg()
    const thumbPath = await ffmpeg.generateThumbnail(filePath, { time })
    const buffer = await require('fs/promises').readFile(thumbPath)
    await ffmpeg.cleanupTemp(thumbPath)
    return buffer.toString('base64')
  })

  handle('ffmpeg:concat', async (_e, inputPaths: string[], outputPath: string) => {
    return getFFmpeg().concatVideos(inputPaths, outputPath)
  })

  handle('ffmpeg:assembleDrama', async (_e, options: any) => {
    return getFFmpeg().assembleDramaVideo(options)
  })
}
