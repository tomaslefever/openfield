/* One-time DB slimming: strips base64 payloads stored by legacy queue code.
 * Run with the app closed for VACUUM, or with it open (WAL-safe) for row redaction only.
 * Usage: node scripts/slim-database.js [--vacuum]
 */
const { DatabaseSync } = require('node:sqlite')
const path = require('path')
const os = require('os')

const REDACT_LEN = 128
const BASE64_BODY_RE = /^[A-Za-z0-9+/=]+$/

function redactPayload(value, depth = 0) {
  if (value === null || value === undefined) return value
  const t = typeof value
  if (t === 'string') {
    if (value.length < REDACT_LEN) return value
    if (value.startsWith('data:')) return ''
    if (value.includes(' ') || value.includes('\n') || value.includes('\t') || value.includes('\r')) return value
    if (BASE64_BODY_RE.test(value)) return ''
    return value
  }
  if (t !== 'object') return value
  if (depth > 24) return value
  if (Array.isArray(value)) return value.map(v => redactPayload(v, depth + 1))
  const out = {}
  for (const k of Object.keys(value)) out[k] = redactPayload(value[k], depth + 1)
  return out
}

const dbPaths = [
  path.join(os.homedir(), 'AppData', 'Roaming', 'kie-studio-desktop', 'kie-studio', 'database.sqlite'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'kie-studio-desktop', 'openfield', 'database.sqlite'),
]

const doVacuum = process.argv.includes('--vacuum')

for (const dbPath of dbPaths) {
  const fs = require('fs')
  if (!fs.existsSync(dbPath)) { console.log(`SKIP (not found): ${dbPath}`); continue }
  console.log(`\n=== ${dbPath} ===`)
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 30000')

  const before = fs.statSync(dbPath).size

  const payloadTables = [
    ['tasks', 'task_id'], ['openfield_tasks', 'task_id'], ['replicate_tasks', 'task_id'],
    ['fal_tasks', 'task_id'], ['machgen_tasks', 'task_id'], ['higgsfield_tasks', 'task_id'],
    ['run_logs', 'id'],
  ]
  let slimmed = 0
  let freed = 0
  for (const [table, idCol] of payloadTables) {
    let ids = []
    try { ids = db.prepare(`SELECT ${idCol} AS rid FROM ${table} WHERE payload IS NOT NULL AND payload != ''`).all() } catch { continue }
    let t = 0
    for (const row of ids) {
      try {
        const cur = db.prepare(`SELECT payload FROM ${table} WHERE ${idCol} = ?`).get(row.rid)
        if (!cur || !cur.payload) continue
        const parsed = JSON.parse(cur.payload)
        const beforeS = JSON.stringify(parsed)
        const afterS = JSON.stringify(redactPayload(parsed))
        if (afterS !== beforeS) {
          db.prepare(`UPDATE ${table} SET payload = ? WHERE ${idCol} = ?`).run(afterS, row.rid)
          freed += beforeS.length - afterS.length
          t++
        }
      } catch {}
    }
    if (t) console.log(`  ${table}: ${t} rows slimmed`)
    slimmed += t
  }
  let a = 0
  try {
    const assetIds = db.prepare("SELECT id FROM assets WHERE parameters IS NOT NULL AND parameters != ''").all()
    for (const row of assetIds) {
      try {
        const cur = db.prepare('SELECT parameters FROM assets WHERE id = ?').get(row.id)
        if (!cur || !cur.parameters) continue
        const parsed = JSON.parse(cur.parameters)
        const beforeS = JSON.stringify(parsed)
        const afterS = JSON.stringify(redactPayload(parsed))
        if (afterS !== beforeS) {
          db.prepare('UPDATE assets SET parameters = ? WHERE id = ?').run(afterS, row.id)
          freed += beforeS.length - afterS.length
          a++
        }
      } catch {}
    }
  } catch {}
  if (a) console.log(`  assets.parameters: ${a} rows slimmed`)
  console.log(`  Total rows slimmed: ${slimmed + a}, freed ~${(freed / 1048576).toFixed(0)} MB of text`)

  if (doVacuum) {
    console.log('  VACUUM (this can take a minute)...')
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      db.exec('VACUUM')
    } catch (e) { console.log('  VACUUM failed (app may be running):', e.message) }
  }
  db.exec('PRAGMA wal_checkpoint(PASSIVE)')
  const after = fs.statSync(dbPath).size
  console.log(`  File size: ${(before / 1048576).toFixed(0)} MB -> ${(after / 1048576).toFixed(0)} MB`)
  db.close()
}
