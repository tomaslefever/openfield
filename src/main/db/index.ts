import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { DatabaseSync, type StatementSync } from 'node:sqlite'

let dbInstance: DbWrapper | null = null

function toCamel(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    result[camelKey] = obj[key]
  }
  return result
}

export class DbWrapper {
  db: DatabaseSync
  private dbPath: string

  constructor(db: DatabaseSync, dbPath: string) {
    this.db = db
    this.dbPath = dbPath
  }

  prepare(sql: string): StmtWrapper {
    const stmt = this.db.prepare(sql)
    return new StmtWrapper(stmt)
  }

  exec(sql: string) {
    this.db.exec(sql)
  }

  run(sql: string, ...params: any[]) {
    this.db.prepare(sql).run(...params)
  }

  get(sql: string, ...params: any[]): Record<string, any> | null {
    const stmt = this.db.prepare(sql)
    if (params.length > 0 && params[0] !== undefined) {
      const row = stmt.get(...params)
      return row ? toCamel(row as Record<string, any>) : null
    }
    const row = stmt.get()
    return row ? toCamel(row as Record<string, any>) : null
  }

  all(sql: string, ...params: any[]): Record<string, any>[] {
    const stmt = this.db.prepare(sql)
    if (params.length > 0 && params[0] !== undefined) {
      return (stmt.all(...params) as Record<string, any>[]).map(toCamel)
    }
    return (stmt.all() as Record<string, any>[]).map(toCamel)
  }

  // Writes are persisted to disk immediately (WAL). These exist for API
  // compatibility with the previous in-memory engine.
  save() { /* no-op: every write is already durable */ }

  saveSync() { /* no-op: every write is already durable */ }

  flush(): Promise<void> {
    return Promise.resolve()
  }

  close() {
    this.db.close()
  }
}

export class StmtWrapper {
  private stmt: StatementSync

  constructor(stmt: StatementSync) {
    this.stmt = stmt
  }

  run(...params: any[]): { changes: number; lastInsertRowid: number } {
    const runParams = params.length > 0 && params[0] !== undefined ? params : []
    const res = runParams.length > 0 ? this.stmt.run(...runParams) : this.stmt.run()
    const toNum = (v: number | bigint): number => Number(v)
    return { changes: toNum(res.changes), lastInsertRowid: toNum(res.lastInsertRowid) }
  }

  get(...params: any[]): Record<string, any> | undefined {
    let row: any
    if (params.length > 0 && params[0] !== undefined) {
      row = this.stmt.get(...params)
    } else {
      row = this.stmt.get()
    }
    return row ? toCamel(row as Record<string, any>) : undefined
  }

  all(...params: any[]): Record<string, any>[] {
    let rows: any[]
    if (params.length > 0 && params[0] !== undefined) {
      rows = this.stmt.all(...params) as any[]
    } else {
      rows = this.stmt.all() as any[]
    }
    return rows.map(toCamel)
  }
}

export async function initDatabase(): Promise<DbWrapper> {
  if (dbInstance) return dbInstance

  const dbDir = getUserDataDir()
  const dbPath = path.join(dbDir, 'database.sqlite')

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  // Remove stale temp file from an interrupted save (legacy engine)
  try {
    const tmpPath = dbPath + '.tmp'
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
  } catch {}

  const assetsDir = path.join(dbDir, 'assets')
  fs.mkdirSync(path.join(assetsDir, 'images'), { recursive: true })
  fs.mkdirSync(path.join(assetsDir, 'videos'), { recursive: true })
  fs.mkdirSync(path.join(assetsDir, 'audio'), { recursive: true })

  const modelsDir = path.join(dbDir, 'models')
  fs.mkdirSync(modelsDir, { recursive: true })

  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = FULL')
  db.exec('PRAGMA busy_timeout = 5000')

  dbInstance = new DbWrapper(db, dbPath)

  // Migrate legacy data to openfield folder for consistency
  const userDataPath = app.getPath('userData')
  const newDir = path.join(userDataPath, 'openfield')
  const oldSubDir = path.join(userDataPath, 'kie-studio')
  const legacyDir = path.join(path.dirname(userDataPath), 'kie-studio-desktop', 'kie-studio')
  const sourceDir = fs.existsSync(oldSubDir) ? oldSubDir : fs.existsSync(legacyDir) ? legacyDir : null
  if (sourceDir && !fs.existsSync(newDir) && sourceDir !== newDir) {
    try {
      fs.cpSync(sourceDir, newDir, { recursive: true })
      console.log('[DB] Migrated data from', sourceDir, 'to', newDir)
    } catch (err) {
      console.error('[DB] Migration copy failed, will keep using', sourceDir, err)
    }
  }

  return dbInstance
}

export function getRawDb(): DbWrapper {
  if (!dbInstance) throw new Error('Database not initialized. Call initDatabase() first.')
  return dbInstance
}

export function getDatabase() { return getRawDb() }

export function runMigrations() {
  const raw = getRawDb()
  const tables = [
    `CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, file_path TEXT NOT NULL, file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL, width INTEGER, height INTEGER, duration REAL, file_size INTEGER,
      prompt TEXT, negative_prompt TEXT, model_used TEXT NOT NULL, parameters TEXT,
      tags TEXT, is_favorite INTEGER DEFAULT 0, credits_used INTEGER, task_id TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, timeline_data TEXT NOT NULL,
      thumbnail_path TEXT, duration REAL, width INTEGER, height INTEGER, fps INTEGER DEFAULT 30,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS openfield_tasks (
      task_id TEXT PRIMARY KEY, status TEXT NOT NULL, type TEXT NOT NULL,
      payload TEXT NOT NULL, result_asset_id TEXT, error_message TEXT,
      progress INTEGER DEFAULT 0, credits_used INTEGER, retry_count INTEGER DEFAULT 0,
      started_at INTEGER, completed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, nodes TEXT NOT NULL,
      edges TEXT NOT NULL, viewport TEXT, is_template INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS run_logs (
      id TEXT PRIMARY KEY, task_id TEXT, step TEXT NOT NULL,
      level TEXT DEFAULT 'info', message TEXT, payload TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS local_models (
      id TEXT PRIMARY KEY,
      pipeline_tag TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT DEFAULT '',
      version TEXT NOT NULL,
      size_bytes INTEGER DEFAULT 0,
      path TEXT NOT NULL,
      installed_at INTEGER NOT NULL,
      last_used_at INTEGER,
      license TEXT DEFAULT '',
      min_vram REAL DEFAULT 0,
      engine TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      download_progress REAL DEFAULT 0,
      error_message TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS elements (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      description TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      image_base64 TEXT DEFAULT '',
      prompt TEXT DEFAULT '',
      voice_id TEXT DEFAULT '',
      reference_images TEXT DEFAULT '[]',
      pose_ref TEXT DEFAULT '',
      pose_task_id TEXT DEFAULT '',
      moodboard_task_id TEXT DEFAULT '',
      video_ref TEXT DEFAULT '',
      hdri_ref TEXT DEFAULT '',
      style TEXT DEFAULT '',
      properties TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS storyboards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      style TEXT DEFAULT '',
      script TEXT DEFAULT '',
      elements TEXT DEFAULT '[]',
      image_model_id TEXT,
      video_model_id TEXT,
      transition_model_id TEXT,
      default_duration INTEGER DEFAULT 5,
      default_aspect_ratio TEXT DEFAULT '16:9',
      default_resolution TEXT DEFAULT '1K',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS storyboard_scenes (
      id TEXT PRIMARY KEY,
      storyboard_id TEXT NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
      "order" INTEGER NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      prompt TEXT DEFAULT '',
      image_asset_id TEXT,
      video_asset_id TEXT,
      aspect_ratio TEXT DEFAULT '16:9',
      resolution TEXT DEFAULT '1K',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS storyboard_transitions (
      id TEXT PRIMARY KEY,
      storyboard_id TEXT NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE,
      from_scene_id TEXT NOT NULL,
      to_scene_id TEXT NOT NULL,
      duration INTEGER DEFAULT 5,
      video_asset_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS replicate_tasks (
      task_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      prediction_id TEXT,
      result_asset_id TEXT,
      error_message TEXT,
      progress INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS fal_tasks (
      task_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      request_id TEXT,
      result_asset_id TEXT,
      error_message TEXT,
      progress INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  ]

  for (const sql of tables) {
    try { raw.exec(sql) } catch (err: any) { console.warn('[DB] Migration table failed:', err?.message) }
  }

  // Migration: add local_path column for downloaded files
  try { raw.exec('ALTER TABLE assets ADD COLUMN local_path TEXT') } catch {}

  // Migration: add openfield_task_id column to openfield_tasks
  try { raw.exec('ALTER TABLE openfield_tasks ADD COLUMN openfield_task_id TEXT') } catch {}

  // Migration: add style column to storyboards
  try { raw.exec('ALTER TABLE storyboards ADD COLUMN style TEXT DEFAULT \'\'') } catch {}

  // Migration: add script column to storyboards
  try { raw.exec('ALTER TABLE storyboards ADD COLUMN script TEXT DEFAULT \'\'') } catch {}

  // Migration: add elements column to storyboards
  try { raw.exec('ALTER TABLE storyboards ADD COLUMN elements TEXT DEFAULT \'[]\'') } catch {}

  const now = Date.now()
  const seed = raw.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
  seed.run('openfieldApiKey', '', now)
  seed.run('theme', '"dark"', now)
  seed.run('language', '"en"', now)
  seed.run('defaultImageModel', '"flux-pro"', now)
  seed.run('defaultVideoModel', '"kling-v1"', now)
  seed.run('enableLocalModels', '"false"', now)
  seed.run('localModelsDir', '""', now)
  seed.run('pythonPath', '""', now)
  seed.run('localServerPort', '19876', now)
  seed.run('bridgePort', '19877', now)
  seed.run('enableBridge', '"true"', now)
  seed.run('localModelsDevice', '"cuda"', now)
  seed.run('localModelsPrecision', '"bf16"', now)
  seed.run('localModelsAutoUnloadSeconds', '300', now)
  seed.run('hfToken', '""', now)
  seed.run('replicateApiKey', '""', now)
  seed.run('falApiKey', '""', now)
}

export function getUserDataDir(): string {
  const userDataPath = app.getPath('userData')
  const legacyPaths = [
    path.join(userDataPath, 'kie-studio'),
    path.join(path.dirname(userDataPath), 'kie-studio-desktop', 'kie-studio'),
  ]
  for (const p of legacyPaths) {
    if (fs.existsSync(p)) return p
  }
  return path.join(userDataPath, 'openfield')
}

export function getAssetsDir() {
  return path.join(getUserDataDir(), 'assets').replace(/\\/g, '/')
}

export function getAssetSubDir(type: 'image' | 'video' | 'audio') {
  const subDirs = { image: 'images', video: 'videos', audio: 'audio' }
  return path.join(getAssetsDir(), subDirs[type]).replace(/\\/g, '/')
}

export function getModelsDir() {
  return path.join(getUserDataDir(), 'models')
}

export function getPiperDir() {
  return path.join(getUserDataDir(), 'piper')
}
