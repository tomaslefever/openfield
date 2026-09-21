import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
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
      tags TEXT, is_favorite INTEGER DEFAULT 0, is_archived INTEGER DEFAULT 0, credits_used INTEGER, task_id TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT DEFAULT '#6366f1',
      config TEXT DEFAULT '{}', is_archived INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, timeline_data TEXT NOT NULL,
      thumbnail_path TEXT, duration REAL, width INTEGER, height INTEGER, fps INTEGER DEFAULT 30,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT NOT NULL, prompt TEXT NOT NULL,
      kind TEXT DEFAULT 'image', refs TEXT DEFAULT '[]', tags TEXT DEFAULT '[]',
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
      default_aspect_ratio TEXT DEFAULT '1:1',
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
      aspect_ratio TEXT DEFAULT '1:1',
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
      workspace_id TEXT,
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
      workspace_id TEXT,
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
    `CREATE TABLE IF NOT EXISTS machgen_tasks (
      task_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      workspace_id TEXT,
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
    `CREATE TABLE IF NOT EXISTS higgsfield_tasks (
      task_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      workspace_id TEXT,
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
    `CREATE TABLE IF NOT EXISTS drama_projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      title TEXT NOT NULL,
      logline TEXT DEFAULT '',
      idea_prompt TEXT DEFAULT '',
      genre TEXT DEFAULT '',
      tone TEXT DEFAULT '',
      visual_style TEXT DEFAULT '',
      content_type TEXT DEFAULT 'microdrama',
      aspect_ratio TEXT DEFAULT '9:16',
      shots_count INTEGER DEFAULT 4,
      current_stage INTEGER DEFAULT 1,
      llm_model TEXT DEFAULT '',
      image_model TEXT DEFAULT '',
      image_resolution TEXT DEFAULT '1K',
      video_model TEXT DEFAULT '',
      video_resolution TEXT DEFAULT '720p',
      video_duration INTEGER DEFAULT 5,
      voice_model TEXT DEFAULT '',
      voice_id TEXT DEFAULT '',
      script_text TEXT DEFAULT '',
      final_video_asset_id TEXT,
      final_video_path TEXT,
      thumbnail_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS drama_characters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES drama_projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT DEFAULT '',
      visual_prompt TEXT DEFAULT '',
      voice_id TEXT DEFAULT '',
      image_asset_id TEXT,
      image_url TEXT,
      task_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS drama_scenarios (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES drama_projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      visual_prompt TEXT DEFAULT '',
      image_asset_id TEXT,
      image_url TEXT,
      task_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS drama_props (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES drama_projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      visual_prompt TEXT DEFAULT '',
      image_asset_id TEXT,
      image_url TEXT,
      task_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS drama_shots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES drama_projects(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      scene_number INTEGER DEFAULT 1,
      shot_number INTEGER NOT NULL,
      camera_movement TEXT DEFAULT '',
      character_names TEXT DEFAULT '[]',
      scenario_name TEXT DEFAULT '',
      prop_names TEXT DEFAULT '[]',
      action_prompt TEXT DEFAULT '',
      dialogue_text TEXT DEFAULT '',
      dialogue_speaker TEXT DEFAULT '',
      estimated_duration REAL DEFAULT 5,
      keyframe_prompt TEXT DEFAULT '',
      keyframe_asset_id TEXT,
      keyframe_url TEXT,
      keyframe_task_id TEXT,
      video_asset_id TEXT,
      video_local_path TEXT,
      video_url TEXT,
      video_task_id TEXT,
      video_status TEXT DEFAULT 'idle',
      video_progress INTEGER DEFAULT 0,
      audio_asset_id TEXT,
      audio_local_path TEXT,
      audio_url TEXT,
      audio_task_id TEXT,
      audio_status TEXT DEFAULT 'idle',
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

  // Migration: add prop_names column to drama_shots
  try { raw.exec("ALTER TABLE drama_shots ADD COLUMN prop_names TEXT DEFAULT '[]'") } catch {}

  // Migration: add content_type column to drama_projects
  try { raw.exec("ALTER TABLE drama_projects ADD COLUMN content_type TEXT DEFAULT 'microdrama'") } catch {}

  // Migration: add custom_prompt_guide column to drama_projects
  try { raw.exec("ALTER TABLE drama_projects ADD COLUMN custom_prompt_guide TEXT DEFAULT ''") } catch {}

  // Migration: add workspace_id column to drama_projects
  try { raw.exec('ALTER TABLE drama_projects ADD COLUMN workspace_id TEXT') } catch {}
  try { raw.exec('CREATE INDEX IF NOT EXISTS idx_drama_projects_workspace ON drama_projects(workspace_id)') } catch {}
  try {
    let defWsId = ''
    const settingRow = raw.prepare("SELECT value FROM settings WHERE key = 'defaultWorkspaceId'").get() as any
    if (settingRow?.value) {
      try { defWsId = JSON.parse(settingRow.value) } catch { defWsId = settingRow.value }
    }
    if (!defWsId) {
      const defaultWs = raw.prepare("SELECT id FROM workspaces WHERE name = 'Default' LIMIT 1").get() as any
        || raw.prepare('SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1').get() as any
      defWsId = defaultWs?.id || ''
    }
    if (defWsId) {
      raw.prepare("UPDATE drama_projects SET workspace_id = ? WHERE workspace_id IS NULL OR workspace_id = ''").run(defWsId)
    }
  } catch {}

  // Migration: add content_hash column for deduplicating reference images
  try { raw.exec('ALTER TABLE assets ADD COLUMN content_hash TEXT') } catch {}
  try { raw.exec('CREATE INDEX IF NOT EXISTS idx_assets_content_hash ON assets(content_hash)') } catch {}

  // Migration: add is_archived column for archiving assets
  try { raw.exec('ALTER TABLE assets ADD COLUMN is_archived INTEGER DEFAULT 0') } catch {}
  try { raw.exec('CREATE INDEX IF NOT EXISTS idx_assets_archived ON assets(is_archived)') } catch {}

  // Drama indexes
  try { raw.exec('CREATE INDEX IF NOT EXISTS idx_drama_characters_proj ON drama_characters(project_id)') } catch {}
  try { raw.exec('CREATE INDEX IF NOT EXISTS idx_drama_scenarios_proj ON drama_scenarios(project_id)') } catch {}
  try { raw.exec('CREATE INDEX IF NOT EXISTS idx_drama_props_proj ON drama_props(project_id)') } catch {}
  try { raw.exec('CREATE INDEX IF NOT EXISTS idx_drama_shots_proj ON drama_shots(project_id)') } catch {}
  try { raw.exec('CREATE INDEX IF NOT EXISTS idx_drama_projects_created ON drama_projects(created_at DESC)') } catch {}

  // Migration: mark persisted reference images (saved at enqueue time as 'upload') as
  // 'ref' so they stay out of library listings. An asset is a reference if its id appears
  // in any stored task payload or asset parameters (imageAssetId / firstFrameAssetId /
  // lastFrameAssetId / imageRefs[].assetId / videoRefs[].assetId / audioRefs[].assetId).
  try {
    const uploadCount = raw.prepare("SELECT count(*) as c FROM assets WHERE model_used = 'upload'").get()?.c || 0
    if (uploadCount > 0) {
      const refIds = new Set<string>()
      const scanForRefIds = (value: any) => {
        if (!value) return
        if (typeof value === 'string') {
          if (value.length > 0 && value.length < 1000000) {
            try { value = JSON.parse(value) } catch { return }
          } else { return }
        }
        if (Array.isArray(value)) { for (const item of value) scanForRefIds(item); return }
        if (typeof value !== 'object') return
        if (typeof value.imageAssetId === 'string') refIds.add(value.imageAssetId)
        if (typeof value.firstFrameAssetId === 'string') refIds.add(value.firstFrameAssetId)
        if (typeof value.lastFrameAssetId === 'string') refIds.add(value.lastFrameAssetId)
        for (const key of ['imageRefs', 'videoRefs', 'audioRefs']) {
          if (Array.isArray(value[key])) {
            for (const r of value[key]) {
              if (r && typeof r.assetId === 'string') refIds.add(r.assetId)
            }
          }
        }
        for (const v of Object.values(value)) scanForRefIds(v)
      }
      const paramRows = raw.all("SELECT parameters FROM assets WHERE parameters IS NOT NULL AND parameters != ''") as any[]
      for (const row of paramRows) { try { scanForRefIds(row.parameters) } catch {} }
      for (const table of ['openfield_tasks', 'replicate_tasks', 'fal_tasks']) {
        const payloadRows = raw.all(`SELECT payload FROM ${table} WHERE payload IS NOT NULL`) as any[]
        for (const row of payloadRows) { try { scanForRefIds(row.payload) } catch {} }
      }
      const now = Date.now()
      for (const id of refIds) {
        raw.prepare("UPDATE assets SET model_used = 'ref', updated_at = ? WHERE id = ? AND model_used = 'upload'").run(now, id)
      }
    }
  } catch (err: any) {
    console.warn('[DB] Ref-marking migration failed:', err?.message)
  }

  // Migration: add style column to storyboards
  try { raw.exec('ALTER TABLE storyboards ADD COLUMN style TEXT DEFAULT \'\'') } catch {}

  // Migration: add script column to storyboards
  try { raw.exec('ALTER TABLE storyboards ADD COLUMN script TEXT DEFAULT \'\'') } catch {}

  // Migration: add elements column to storyboards
  try { raw.exec('ALTER TABLE storyboards ADD COLUMN elements TEXT DEFAULT \'[]\'') } catch {}

  // ─── Workspaces migration ─────────────────────────────────────────
  // Every project-scoped table gets a workspace_id. Existing rows are assigned to
  // a "Default" workspace so the user keeps all their data.
  const workspaceTables = [
    'assets', 'elements', 'storyboards', 'workflows', 'projects',
    'openfield_tasks', 'replicate_tasks', 'fal_tasks', 'machgen_tasks', 'higgsfield_tasks', 'run_logs',
  ]
  for (const table of workspaceTables) {
    try { raw.exec(`ALTER TABLE ${table} ADD COLUMN workspace_id TEXT`) } catch {}
  }

  let defaultWorkspaceId = ''
  try {
    const existingDefault = raw.prepare("SELECT value FROM settings WHERE key = 'defaultWorkspaceId'").get() as any
    if (existingDefault?.value) {
      try { defaultWorkspaceId = JSON.parse(existingDefault.value) } catch { defaultWorkspaceId = existingDefault.value }
    }
    if (!defaultWorkspaceId) {
      const firstWs = raw.prepare('SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1').get() as any
      defaultWorkspaceId = firstWs?.id || ''
    }
    if (!defaultWorkspaceId) {
      defaultWorkspaceId = crypto.randomUUID()
      const nowWs = Date.now()
      raw.prepare(
        "INSERT INTO workspaces (id, name, color, config, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(defaultWorkspaceId, 'Default', '#6366f1', '{}', 0, nowWs, nowWs)
    }
    raw.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('defaultWorkspaceId', JSON.stringify(defaultWorkspaceId), Date.now())
    raw.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('activeWorkspaceId', JSON.stringify(defaultWorkspaceId), Date.now())
    for (const table of workspaceTables) {
      raw.prepare(`UPDATE ${table} SET workspace_id = ? WHERE workspace_id IS NULL`).run(defaultWorkspaceId)
      try { raw.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_workspace ON ${table}(workspace_id)`) } catch {}
    }
  } catch (err: any) {
    console.warn('[DB] Workspaces migration failed:', err?.message)
  }

  // Migration: image default aspect is now 1:1 (videos stay 16:9)
  try { raw.exec("UPDATE storyboards SET default_aspect_ratio = '1:1' WHERE default_aspect_ratio = '16:9'") } catch {}
  try { raw.exec("UPDATE storyboard_scenes SET aspect_ratio = '1:1' WHERE aspect_ratio = '16:9' AND image_asset_id IS NULL AND video_asset_id IS NULL") } catch {}

  const now = Date.now()
  const seed = raw.prepare('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
  seed.run('openfieldApiKey', '', now)
  seed.run('theme', '"dark"', now)
  seed.run('language', '"en"', now)
  seed.run('defaultImageModel', '"flux-pro"', now)
  seed.run('defaultVideoModel', '"kling-v1"', now)
  seed.run('bridgePort', '19877', now)
  seed.run('enableBridge', '"true"', now)
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

export function getWorkspacesDir() {
  return path.join(getUserDataDir(), 'workspaces')
}

// The default workspace keeps the legacy global assets dir so existing
// files don't need to be moved. New workspaces get their own folder.
export function getWorkspaceAssetsDir(workspaceId: string, isDefault: boolean) {
  if (isDefault) return getAssetsDir()
  return path.join(getWorkspacesDir(), workspaceId, 'assets').replace(/\\/g, '/')
}

export function getWorkspaceAssetSubDir(workspaceId: string, isDefault: boolean, type: 'image' | 'video' | 'audio') {
  const subDirs = { image: 'images', video: 'videos', audio: 'audio' }
  return path.join(getWorkspaceAssetsDir(workspaceId, isDefault), subDirs[type]).replace(/\\/g, '/')
}

export function getModelsDir() {
  return path.join(getUserDataDir(), 'models')
}

export function getPiperDir() {
  return path.join(getUserDataDir(), 'piper')
}
