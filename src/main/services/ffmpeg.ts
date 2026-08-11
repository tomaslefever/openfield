import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawn, execSync } from 'child_process';

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
