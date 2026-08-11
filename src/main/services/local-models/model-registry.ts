import { getRawDb, getModelsDir as getAppModelsDir } from '../../db'
import * as fs from 'fs'
import * as path from 'path'
import { InstalledModel, PipelineTag, ModelStatus } from './types'

function getModelsDir(): string {
  return getAppModelsDir()
}

export class ModelRegistry {
  list(filters?: { pipelineTag?: PipelineTag; status?: ModelStatus }): InstalledModel[] {
    const db = getRawDb()
    let sql = 'SELECT * FROM local_models WHERE 1=1'
    const params: any[] = []
    if (filters?.pipelineTag) { sql += ' AND pipeline_tag = ?'; params.push(filters.pipelineTag) }
    if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status) }
    return db.prepare(sql).all(...params) as unknown as InstalledModel[]
  }

  get(id: string): InstalledModel | null {
    const db = getRawDb()
    return db.prepare('SELECT * FROM local_models WHERE id = ?').get(id) as unknown as InstalledModel || null
  }

  listByPipeline(): Record<PipelineTag, InstalledModel[]> {
    const all = this.list()
    return {
      'text-to-image': all.filter(m => m.pipelineTag === 'text-to-image'),
      'text-to-video': all.filter(m => m.pipelineTag === 'text-to-video'),
      'text-to-speech': all.filter(m => m.pipelineTag === 'text-to-speech'),
    }
  }

  isInstalled(id: string): boolean {
    return this.get(id) !== null
  }

  getTotalSize(): number {
    const db = getRawDb()
    const row = db.prepare('SELECT COALESCE(SUM(size_bytes), 0) as total FROM local_models WHERE status = ?').get('ready') as any
    return row ? Number(row.total) : 0
  }

  add(model: Omit<InstalledModel, 'installedAt' | 'lastUsedAt' | 'status' | 'downloadProgress' | 'errorMessage'>): void {
    const db = getRawDb()
    db.prepare(`
      INSERT INTO local_models (id, pipeline_tag, display_name, description, version, size_bytes, path, installed_at, license, min_vram, engine, status, download_progress)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', 0)
    `).run(
      model.id, model.pipelineTag, model.displayName, model.description,
      model.version, model.sizeBytes, model.path, Date.now(),
      model.license, model.minVram, model.engine
    )
    db.saveSync()
  }

  updateDownloadProgress(id: string, progress: number): void {
    const db = getRawDb()
    db.prepare('UPDATE local_models SET download_progress = ?, status = ? WHERE id = ?')
      .run(progress, progress >= 100 ? 'ready' : 'downloading', id)
    db.saveSync()
  }

  markDownloading(id: string): void {
    const db = getRawDb()
    db.prepare('UPDATE local_models SET status = ?, download_progress = 0 WHERE id = ?').run('downloading', id)
    db.saveSync()
  }

  markReady(id: string): void {
    const db = getRawDb()
    db.prepare('UPDATE local_models SET status = ?, download_progress = 100 WHERE id = ?').run('ready', id)
    db.saveSync()
  }

  markError(id: string, error: string): void {
    const db = getRawDb()
    db.prepare('UPDATE local_models SET status = ?, error_message = ? WHERE id = ?').run('error', error, id)
    db.saveSync()
  }

  reset(id: string): void {
    const db = getRawDb()
    db.prepare('UPDATE local_models SET status = ?, error_message = NULL, download_progress = 0 WHERE id = ?').run('ready', id)
    db.saveSync()
  }

  touch(id: string): void {
    const db = getRawDb()
    db.prepare('UPDATE local_models SET last_used_at = ? WHERE id = ?').run(Date.now(), id)
    db.saveSync()
  }

  uninstall(id: string): void {
    const model = this.get(id)
    const db = getRawDb()
    if (model?.path && fs.existsSync(model.path)) {
      fs.rmSync(model.path, { recursive: true, force: true })
    }
    db.prepare('DELETE FROM local_models WHERE id = ?').run(id)
    db.saveSync()
  }
}

let registryInstance: ModelRegistry | null = null

export function getModelRegistry(): ModelRegistry {
  if (!registryInstance) registryInstance = new ModelRegistry()
  return registryInstance
}
