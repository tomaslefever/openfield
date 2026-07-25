import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

let SQL: any = null
let dbInstance: any = null

function toCamel(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    result[camelKey] = obj[key]
  }
  return result
}

export class DbWrapper {
  db: any
  private dbPath: string
  private dirty = false

  constructor(db: any, dbPath: string) {
    this.db = db
    this.dbPath = dbPath
  }

  prepare(sql: string): StmtWrapper {
    const stmt = this.db.prepare(sql)
    return new StmtWrapper(stmt, this, () => { this.dirty = true })
  }

  exec(sql: string) {
    this.dirty = true
    this.db.exec(sql)
  }

  run(sql: string, ...params: any[]) {
    this.dirty = true
    this.db.run(sql, params)
  }

  get(sql: string, ...params: any[]): Record<string, any> | null {
    const stmt = this.db.prepare(sql)
    if (params.length > 0 && params[0] !== undefined) {
      stmt.bind(params)
    }
    if (stmt.step()) {
      const obj = stmt.getAsObject()
      stmt.free()
      return toCamel(obj as any)
    }
    stmt.free()
    return null
  }

  all(sql: string, ...params: any[]): Record<string, any>[] {
    const stmt = this.db.prepare(sql)
    if (params.length > 0 && params[0] !== undefined) {
      stmt.bind(params)
    }
    const results: Record<string, any>[] = []
    while (stmt.step()) {
      results.push(toCamel(stmt.getAsObject() as any))
    }
    stmt.free()
    return results
  }

  save() {
    if (!this.dirty) return
    try {
      const data = this.db.export()
      const buffer = Buffer.from(data)
      fs.writeFileSync(this.dbPath, buffer)
      this.dirty = false
    } catch {}
  }

  saveSync() { this.save() }

  close() {
    this.save()
    this.db.close()
  }
}

export class StmtWrapper {
  private stmt: any
  private parent: DbWrapper
  private onWrite: () => void

  constructor(stmt: any, parent: DbWrapper, onWrite: () => void) {
    this.stmt = stmt
    this.parent = parent
    this.onWrite = onWrite
  }

  run(...params: any[]): { changes: number; lastInsertRowid: number } {
    this.onWrite()
    this.stmt.reset()
    if (params.length > 0 && params[0] !== undefined) {
      this.stmt.bind(params)
    }
    this.stmt.step()

    const row = this.parent.get('SELECT last_insert_rowid() as id')
    return { changes: 1, lastInsertRowid: row ? Number(row.id) : 0 }
  }

  get(...params: any[]): Record<string, any> | undefined {
    if (params.length > 0 && params[0] !== undefined) {
      this.stmt.bind(params)
    }
    if (this.stmt.step()) {
      const obj = this.stmt.getAsObject()
      this.stmt.free()
      return toCamel(obj as any)
    }
    this.stmt.free()
    return undefined
  }

  all(...params: any[]): Record<string, any>[] {
    if (params.length > 0 && params[0] !== undefined) {
      this.stmt.bind(params)
    }
    const results: Record<string, any>[] = []
    while (this.stmt.step()) {
      results.push(toCamel(this.stmt.getAsObject() as any))
    }
    this.stmt.free()
    return results
  }
}

export async function initDatabase(): Promise<DbWrapper> {
  if (dbInstance) return dbInstance

  if (!SQL) {
    const initSqlJs = require('sql.js')
    SQL = await initSqlJs({
      locateFile: (file: string) => {
        const cwdPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
        if (fs.existsSync(cwdPath)) return cwdPath
        return file
      },
    })
  }

  const userDataPath = app.getPath('userData')
  const dbDir = path.join(userDataPath, 'kie-studio')
  const dbPath = path.join(dbDir, 'database.sqlite')

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  const assetsDir = path.join(dbDir, 'assets')
  fs.mkdirSync(path.join(assetsDir, 'images'), { recursive: true })
  fs.mkdirSync(path.join(assetsDir, 'videos'), { recursive: true })
  fs.mkdirSync(path.join(assetsDir, 'audio'), { recursive: true })

  let db: any
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  dbInstance = new DbWrapper(db, dbPath)
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
    `CREATE TABLE IF NOT EXISTS kie_tasks (
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
  ]

  for (const sql of tables) {
    try { raw.exec(sql) } catch {}
  }

  // Migration: add local_path column for downloaded files
  try { raw.exec('ALTER TABLE assets ADD COLUMN local_path TEXT') } catch {}

  // Migration: add kie_task_id column to kie_tasks
  try { raw.exec('ALTER TABLE kie_tasks ADD COLUMN kie_task_id TEXT') } catch {}

  const now = Date.now()
  const seed = raw.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
  seed.run('kieApiKey', '', now)
  seed.run('theme', '"dark"', now)
  seed.run('language', '"en"', now)
  seed.run('defaultImageModel', '"flux-pro"', now)
  seed.run('defaultVideoModel', '"kling-v1"', now)

  raw.save()
}

export function getAssetsDir() {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'kie-studio', 'assets').replace(/\\/g, '/')
}

export function getAssetSubDir(type: 'image' | 'video' | 'audio') {
  const subDirs = { image: 'images', video: 'videos', audio: 'audio' }
  return path.join(getAssetsDir(), subDirs[type]).replace(/\\/g, '/')
}
