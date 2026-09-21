import * as fs from 'fs/promises';
import * as syncFs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawn, execSync } from 'child_process';
import { getRawDb } from '../db';
import { getActiveWorkspaceId, workspaceAssetSubDir } from './workspace-service';

export interface MediaInfo {
  format: string;
  duration: number;
  size: number;
  bitrate: number;
  streams: Array<{
    index: number;
    codec: string;
    codecType: 'video' | 'audio' | 'subtitle';
    width?: number;
    height?: number;
    fps?: number;
    bitrate?: number;
    sampleRate?: number;
    channels?: number;
  }>;
}

export interface ExportOptions {
  outputPath: string;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  bitrate?: string;
  audioBitrate?: string;
  preset?: string;
  speed?: number;
}

export interface ThumbnailOptions {
  time?: number;
  width?: number;
  height?: number;
  quality?: number;
}

function formatSrtTimestamp(sec: number): string {
  const totalMs = Math.max(0, Math.floor(sec * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export class FFmpegService {
  private ffmpegPath: string;
  private ffprobePath: string;

constructor(ffmpegPath?: string) {
    try {
      const ffmpegStatic = require('ffmpeg-static');
      const ffprobeStatic = require('ffprobe-static');
      this.ffmpegPath = ffmpegPath || (typeof ffmpegStatic === 'string' ? ffmpegStatic : ffmpegStatic?.path) || 'ffmpeg';
      this.ffprobePath = (typeof ffprobeStatic === 'string' ? ffprobeStatic : ffprobeStatic?.path) || 'ffprobe';
    } catch {
      this.ffmpegPath = ffmpegPath || 'ffmpeg';
      this.ffprobePath = 'ffprobe';
    }
  }

  async probe(inputPath: string): Promise<MediaInfo> {
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        inputPath,
      ];

      const proc = spawn(this.ffprobePath, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) reject(new Error(`ffprobe failed: ${stderr}`));

        try {
          const data = JSON.parse(stdout);
          const info: MediaInfo = {
            format: data.format?.format_name || 'unknown',
            duration: parseFloat(data.format?.duration || '0'),
            size: parseInt(data.format?.size || '0', 10),
            bitrate: parseInt(data.format?.bit_rate || '0', 10),
            streams: (data.streams || []).map((s: any) => ({
              index: s.index,
              codec: s.codec_name,
              codecType: s.codec_type === 'video' ? 'video'
                : s.codec_type === 'audio' ? 'audio' : 'subtitle',
              width: s.width,
              height: s.height,
              fps: parseFloat(s.r_frame_rate?.split('/')[0]) / parseFloat(s.r_frame_rate?.split('/')[1]) || undefined,
              bitrate: parseInt(s.bit_rate || '0', 10),
              sampleRate: parseInt(s.sample_rate || '0', 10),
              channels: s.channels,
            })),
          };
          resolve(info);
        } catch (e) {
          reject(new Error('Failed to parse ffprobe output'));
        }
      });

      proc.on('error', reject);
    });
  }

  async generateThumbnail(inputPath: string, options: ThumbnailOptions = {}): Promise<string> {
    const time = options.time || 0;
    const width = options.width || 320;
    const height = options.height || -1;
    const quality = options.quality || 2;

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfield-thumb-'));
    const thumbPath = path.join(tmpDir, `${crypto.randomUUID()}.jpg`);

    return new Promise((resolve, reject) => {
      const args = [
        '-ss', String(time),
        '-i', inputPath,
        '-vframes', '1',
        '-vf', `scale=${width}:${height}`,
        '-q:v', String(quality),
        '-y', thumbPath,
      ];

      const proc = spawn(this.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) resolve(thumbPath);
        else reject(new Error(`Thumbnail generation failed: ${stderr}`));
      });

      proc.on('error', reject);
    });
  }

  async generateSpriteSheet(inputPath: string, cols: number = 5, rows: number = 5): Promise<string> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfield-sprite-'));
    const outputPath = path.join(tmpDir, `sprite_${crypto.randomUUID()}.jpg`);
    const totalFrames = cols * rows;

    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-vf', `fps=1/t:${totalFrames},scale=160:90,tile=${cols}x${rows}`,
        '-q:v', '3',
        '-y', outputPath,
      ];

      const proc = spawn(this.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) resolve(outputPath);
        else reject(new Error(`Sprite sheet generation failed: ${stderr}`));
      });

      proc.on('error', reject);
    });
  }

  async exportVideo(inputPath: string, options: ExportOptions): Promise<string> {
    const outputPath = options.outputPath;
    const codec = options.codec || 'libx264';
    const fps = options.fps;
    const bitrate = options.bitrate || '5M';
    const audioBitrate = options.audioBitrate || '192k';
    const preset = options.preset || 'medium';

    return new Promise((resolve, reject) => {
      const args = ['-i', inputPath];

      if (options.width && options.height) {
        args.push('-vf', `scale=${options.width}:${options.height}:force_original_aspect_ratio=decrease,pad=${options.width}:${options.height}:(ow-iw)/2:(oh-ih)/2`);
      }

      args.push('-c:v', codec);
      args.push('-b:v', bitrate);
      args.push('-preset', preset);
      args.push('-c:a', 'aac');
      args.push('-b:a', audioBitrate);
      args.push('-y', outputPath);

      if (fps) {
        args.splice(1, 0, '-r', String(fps));
      }

      const proc = spawn(this.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) resolve(outputPath);
        else reject(new Error(`Export failed: ${stderr}`));
      });

      proc.on('error', reject);
    });
  }

  async concatVideos(inputPaths: string[], outputPath: string): Promise<string> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfield-concat-'));
    const fileListPath = path.join(tmpDir, 'files.txt');

    const content = inputPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    await fs.writeFile(fileListPath, content, 'utf-8');

    return new Promise((resolve, reject) => {
      const args = [
        '-f', 'concat',
        '-safe', '0',
        '-i', fileListPath,
        '-c', 'copy',
        '-y', outputPath,
      ];

      const proc = spawn(this.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        fs.unlink(fileListPath).catch(() => {});
        if (code === 0) resolve(outputPath);
        else reject(new Error(`Concat failed: ${stderr}`));
      });

      proc.on('error', reject);
    });
  }

  async speedChange(inputPath: string, speed: number, outputPath: string, preservePitch: boolean = true): Promise<string> {
    return new Promise((resolve, reject) => {
      const atempo = Math.max(0.5, Math.min(speed, 2.0));
      const args = ['-i', inputPath];

      if (preservePitch) {
        args.push('-af', `atempo=${atempo}`);
        if (speed > 2.0 || speed < 0.5) {
          args[args.length - 1] = `atempo=${Math.sqrt(atempo)},atempo=${Math.sqrt(atempo)}`;
        }
      } else {
        args.push('-vf', `setpts=${1 / speed}*PTS`);
        args.push('-af', `atempo=${atempo}`);
      }

      args.push('-y', outputPath);

      const proc = spawn(this.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) resolve(outputPath);
        else reject(new Error(`Speed change failed: ${stderr}`));
      });

      proc.on('error', reject);
    });
  }

  async addAudio(inputPath: string, audioPath: string, outputPath: string, volume: number = 0.5): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-i', audioPath,
        '-filter_complex', `[1:a]volume=${volume}[a1];[0:a][a1]amix=inputs=2:duration=first`,
        '-c:v', 'copy',
        '-y', outputPath,
      ];

      const proc = spawn(this.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) resolve(outputPath);
        else reject(new Error(`Add audio failed: ${stderr}`));
      });

      proc.on('error', reject);
    });
  }

  async extractAudio(inputPath: string, outputPath: string, format: string = 'mp3'): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-vn',
        '-acodec', format === 'mp3' ? 'libmp3lame' : 'aac',
        '-y', outputPath,
      ];

      const proc = spawn(this.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) resolve(outputPath);
        else reject(new Error(`Extract audio failed: ${stderr}`));
      });

      proc.on('error', reject);
    });
  }

  async applyEffect(inputPath: string, effect: string, outputPath: string): Promise<string> {
    const effects: Record<string, string> = {
      grayscale: 'colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3',
      sepia: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
      invert: 'negate',
      blur: 'boxblur=10:1',
      sharpen: 'unsharp=5:5:1.0:5:5:0.0',
      edge: 'edgedetect',
      emboss: 'emboss',
    };

    const filter = effects[effect];
    if (!filter) throw new Error(`Unknown effect: ${effect}`);

    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-vf', filter,
        '-y', outputPath,
      ];

      const proc = spawn(this.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) resolve(outputPath);
        else reject(new Error(`Effect application failed: ${stderr}`));
      });

      proc.on('error', reject);
    });
  }

  async trim(inputPath: string, start: number, duration: number, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '-ss', String(start),
        '-i', inputPath,
        '-t', String(duration),
        '-c', 'copy',
        '-y', outputPath,
      ];

      const proc = spawn(this.ffmpegPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) resolve(outputPath);
        else reject(new Error(`Trim failed: ${stderr}`));
      });

      proc.on('error', reject);
    });
  }

  async assembleDramaVideo(options: {
    videoPaths?: string[];
    shots?: Array<{
      videoPath?: string;
      videoUrl?: string;
      videoAssetId?: string;
      audioPath?: string;
      audioUrl?: string;
      audioAssetId?: string;
      dialogue?: string;
      speaker?: string;
      duration?: number;
    }>;
    title?: string;
    aspectRatio?: string;
    outputPath?: string;
    width?: number;
    height?: number;
    fps?: number;
    dialogueAudios?: Array<{ path: string; offsetSec?: number; volume?: number }>;
    bgMusicPath?: string;
    bgMusicVolume?: number;
    subtitlesSrt?: string;
    includeSubtitles?: boolean;
    workspaceId?: string;
  }): Promise<{ success: boolean; outputPath: string; duration?: number; assetId?: string; error?: string }> {
    const raw = getRawDb();
    const resolvedShots: Array<{
      videoPath: string;
      dialogue?: string;
      speaker?: string;
      duration?: number;
    }> = [];

    const resolveLocalPath = (filePath?: string, fileUrl?: string, assetId?: string): string | undefined => {
      if (filePath && syncFs.existsSync(filePath)) return filePath;
      if (fileUrl && fileUrl.startsWith('file://')) {
        const decoded = decodeURIComponent(fileUrl.replace(/^file:\/\/\/?/, '')).replace(/^\/([a-zA-Z]:)/, '$1');
        if (syncFs.existsSync(decoded)) return decoded;
      }
      if (assetId) {
        try {
          const asset = raw.prepare('SELECT local_path FROM assets WHERE id = ?').get(assetId) as any;
          if (asset?.local_path && syncFs.existsSync(asset.local_path)) return asset.local_path;
        } catch {}
      }
      return undefined;
    };

    if (options.shots && Array.isArray(options.shots) && options.shots.length > 0) {
      for (const s of options.shots) {
        const vPath = resolveLocalPath(s.videoPath, s.videoUrl, s.videoAssetId);
        if (vPath) {
          resolvedShots.push({
            videoPath: vPath,
            dialogue: s.dialogue,
            speaker: s.speaker,
            duration: s.duration,
          });
        }
      }
    } else if (options.videoPaths && options.videoPaths.length > 0) {
      for (const vp of options.videoPaths) {
        const resolved = resolveLocalPath(vp);
        if (resolved) {
          resolvedShots.push({ videoPath: resolved });
        }
      }
    }

    if (resolvedShots.length === 0) {
      throw new Error('No video clips provided for assembly');
    }

    // Determine target dimensions
    let targetWidth = options.width;
    let targetHeight = options.height;

    if (!targetWidth || !targetHeight) {
      const ratio = options.aspectRatio || '9:16';
      switch (ratio) {
        case '16:9':
          targetWidth = 1920; targetHeight = 1080; break;
        case '9:16':
          targetWidth = 1080; targetHeight = 1920; break;
        case '1:1':
          targetWidth = 1080; targetHeight = 1080; break;
        case '4:3':
          targetWidth = 1440; targetHeight = 1080; break;
        case '3:4':
          targetWidth = 1080; targetHeight = 1440; break;
        case '21:9':
          targetWidth = 2560; targetHeight = 1080; break;
        default:
          targetWidth = 1080; targetHeight = 1920; break;
      }
    }

    const fps = options.fps || 30;

    let finalOutputPath = options.outputPath;
    if (!finalOutputPath) {
      const safeTitle = (options.title || 'microserie').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') || 'microserie';
      const wsId = options.workspaceId || getActiveWorkspaceId();
      const videosDir = workspaceAssetSubDir('video', wsId);
      await fs.mkdir(videosDir, { recursive: true });
      finalOutputPath = path.join(videosDir, `${safeTitle}_assembled_${Date.now()}.mp4`).replace(/\\/g, '/');
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openfield-drama-'));

    try {
      // 1. Normalize each video clip
      const normalizedPaths: string[] = [];
      let totalTime = 0;
      const srtEntries: string[] = [];
      let srtIndex = 1;

      for (let i = 0; i < resolvedShots.length; i++) {
        const shot = resolvedShots[i];
        const normalizedClip = path.join(tmpDir, `norm_${i}_${crypto.randomUUID().slice(0, 8)}.mp4`);
        const info = await this.probe(shot.videoPath).catch(() => null);
        const clipDuration = info?.duration || shot.duration || 5;
        const hasVideoAudio = info?.streams?.some(s => s.codecType === 'audio') ?? false;

        // Collect subtitle
        if (options.includeSubtitles && shot.dialogue && shot.dialogue.trim()) {
          const startTime = formatSrtTimestamp(totalTime + 0.1);
          const endTime = formatSrtTimestamp(totalTime + Math.max(0.5, clipDuration - 0.1));
          const line = shot.speaker ? `${shot.speaker}: ${shot.dialogue.trim()}` : shot.dialogue.trim();
          srtEntries.push(`${srtIndex++}\n${startTime} --> ${endTime}\n${line}\n`);
        }
        totalTime += clipDuration;

        const vf = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}`;

        await new Promise<void>((resolve, reject) => {
          let args: string[];

          if (hasVideoAudio) {
            // Keep native video audio
            args = [
              '-i', shot.videoPath,
              '-filter_complex', `[0:v]${vf}[v];[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a]`,
              '-map', '[v]',
              '-map', '[a]',
              '-c:v', 'libx264',
              '-preset', 'fast',
              '-pix_fmt', 'yuv420p',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-y', normalizedClip,
            ];
          } else {
            // Silent audio track fallback so concat stream matches
            args = [
              '-i', shot.videoPath,
              '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
              '-filter_complex', `[0:v]${vf}[v]`,
              '-map', '[v]',
              '-map', '1:a',
              '-c:v', 'libx264',
              '-preset', 'fast',
              '-pix_fmt', 'yuv420p',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-shortest',
              '-y', normalizedClip,
            ];
          }

          const proc = spawn(this.ffmpegPath, args);
          let stderr = '';
          proc.stderr.on('data', (d) => { stderr += d.toString(); });
          proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Normalization of clip ${i + 1} failed: ${stderr}`));
          });
          proc.on('error', reject);
        });

        normalizedPaths.push(normalizedClip);
      }

      // 2. Concat normalized clips
      const concatVideoPath = path.join(tmpDir, `concat_${crypto.randomUUID().slice(0, 8)}.mp4`);
      const fileListPath = path.join(tmpDir, 'concat_list.txt');
      const concatContent = normalizedPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
      await fs.writeFile(fileListPath, concatContent, 'utf-8');

      await new Promise<void>((resolve, reject) => {
        const args = [
          '-f', 'concat',
          '-safe', '0',
          '-i', fileListPath,
          '-c', 'copy',
          '-y', concatVideoPath,
        ];
        const proc = spawn(this.ffmpegPath, args);
        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Concat failed: ${stderr}`));
        });
        proc.on('error', reject);
      });

      let currentVideo = concatVideoPath;

      // 3. Background music if provided
      if (options.bgMusicPath && syncFs.existsSync(options.bgMusicPath)) {
        const audioMergedPath = path.join(tmpDir, `audio_${crypto.randomUUID().slice(0, 8)}.mp4`);
        await new Promise<void>((resolve) => {
          const bgVol = options.bgMusicVolume ?? 0.25;
          const args = [
            '-i', currentVideo,
            '-stream_loop', '-1',
            '-i', options.bgMusicPath!,
            '-filter_complex', `[0:a][1:a]amix=inputs=2:duration=first:weights=1.0 ${bgVol}[a]`,
            '-map', '0:v',
            '-map', '[a]',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-y', audioMergedPath,
          ];
          const proc = spawn(this.ffmpegPath, args);
          let stderr = '';
          proc.stderr.on('data', (d) => { stderr += d.toString(); });
          proc.on('close', (code) => {
            if (code === 0) currentVideo = audioMergedPath;
            else console.warn('[FFmpeg] BG music merge warning:', stderr);
            resolve();
          });
          proc.on('error', () => resolve());
        });
      }

      // 4. Subtitles burning
      const srtText = options.subtitlesSrt || (srtEntries.length > 0 ? srtEntries.join('\n') : null);
      if (srtText && srtText.trim()) {
        const srtPath = path.join(tmpDir, 'subtitles.srt');
        await fs.writeFile(srtPath, srtText, 'utf-8');
        const subtitledPath = path.join(tmpDir, `subtitled_${crypto.randomUUID().slice(0, 8)}.mp4`);

        await new Promise<void>((resolve) => {
          const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
          const vf = `subtitles='${escapedSrt}':force_style='FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=1,MarginV=45'`;
          const args = [
            '-i', currentVideo,
            '-vf', vf,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-c:a', 'copy',
            '-y', subtitledPath,
          ];
          const proc = spawn(this.ffmpegPath, args);
          let stderr = '';
          proc.stderr.on('data', (d) => { stderr += d.toString(); });
          proc.on('close', (code) => {
            if (code === 0) currentVideo = subtitledPath;
            else console.warn('[FFmpeg] Subtitles burn warning:', stderr);
            resolve();
          });
          proc.on('error', () => resolve());
        });
      }

      // 5. Final output
      await fs.mkdir(path.dirname(finalOutputPath), { recursive: true });
      await fs.copyFile(currentVideo, finalOutputPath);

      // 6. Register asset
      const assetId = crypto.randomUUID();
      const wsId = options.workspaceId || getActiveWorkspaceId();
      const fileName = path.basename(finalOutputPath);
      try {
        raw.prepare(`INSERT INTO assets (id, type, file_path, local_path, file_name, mime_type, model_used, prompt, parameters, credits_used, workspace_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          assetId, 'video', `assets/videos/${fileName}`, finalOutputPath, fileName, 'video/mp4',
          'ffmpeg-assembly', options.title || '', JSON.stringify({ shotCount: resolvedShots.length, duration: totalTime, aspectRatio: options.aspectRatio }),
          0, wsId, Date.now(), Date.now()
        );
      } catch {}

      return {
        success: true,
        outputPath: finalOutputPath,
        duration: totalTime,
        assetId,
      };
    } finally {
      this.cleanupTemp(tmpDir).catch(() => {});
    }
  }

  async cleanupTemp(path: string) {
    try {
      const stat = await fs.stat(path);
      if (stat.isDirectory()) {
        await fs.rm(path, { recursive: true, force: true });
      } else {
        await fs.unlink(path);
      }
    } catch {
    }
  }
}

let ffmpegInstance: FFmpegService | null = null;

export function getFFmpeg(ffmpegPath?: string): FFmpegService {
  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpegService(ffmpegPath);
  }
  return ffmpegInstance;
}
