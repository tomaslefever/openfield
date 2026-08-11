// Rebuild DB: export surviving data to a fresh DB
const path = require('path')
const fs = require('fs')

async function main() {
  const initSqlJs = require('sql.js')
  const SQL = await initSqlJs()

  const dbPath = path.join(process.env.APPDATA || '', 'kie-studio-desktop', 'kie-studio', 'database.sqlite')
  const backupPath = dbPath + '.backup'

  if (!fs.existsSync(dbPath)) { console.log('DB not found'); process.exit(1) }

  const stat = fs.statSync(dbPath)
  console.log('Old DB size:', (stat.size / 1024 / 1024).toFixed(2), 'MB')

  // Backup
  fs.copyFileSync(dbPath, backupPath)
  console.log('Backup saved to:', backupPath)

  const buffer = fs.readFileSync(dbPath)
  const db = new SQL.Database(buffer)

  // Create fresh DB
  const newDb = new SQL.Database()

  // Copy schema
  const schema = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  for (const row of schema[0]?.values || []) {
    newDb.run(row[0])
  }

  // Copy data from safe tables only (skip tasks, logs)
  const safeTables = ['assets', 'elements', 'storyboards', 'storyboard_scenes', 'storyboard_transitions', 'settings', 'projects', 'workflows', 'local_models']
  for (const table of safeTables) {
    try {
      const cols = db.exec(`PRAGMA table_info('${table}')`)
      if (!cols[0]?.values?.length) continue
      const colNames = cols[0].values.map(v => v[1])
      const data = db.exec(`SELECT * FROM "${table}"`)
      if (!data[0]?.values?.length) continue

      const insertSql = `INSERT INTO "${table}" (${colNames.map(c => `"${c}"`).join(',')}) VALUES (${colNames.map(() => '?').join(',')})`
      const stmt = newDb.prepare(insertSql)
      for (const row of data[0].values) {
        stmt.run(row)
      }
      stmt.free()
      console.log(`  ${table}: ${data[0].values.length} rows`)
    } catch (err) {
      console.log(`  ${table}: SKIPPED (${err.message.slice(0, 100)})`)
    }
  }

  db.close()

  // Save fresh DB
  const newData = newDb.export()
  fs.writeFileSync(dbPath, Buffer.from(newData))
  newDb.close()

  const newStat = fs.statSync(dbPath)
  console.log('New DB size:', (newStat.size / 1024 / 1024).toFixed(6), 'MB')
  console.log('Done. Restart the app.')
}

main().catch(console.error)
