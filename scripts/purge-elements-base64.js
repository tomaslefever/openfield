// Final cleanup: purge base64 payloads from tasks + VACUUM
const path = require('path')
const fs = require('fs')

async function main() {
  const initSqlJs = require('sql.js')
  const SQL = await initSqlJs()
  
  const dbPath = path.join(process.env.APPDATA || '', 'kie-studio-desktop', 'kie-studio', 'database.sqlite')
  if (!fs.existsSync(dbPath)) {
    console.log('DB not found:', dbPath)
    process.exit(1)
  }

  const stat = fs.statSync(dbPath)
  console.log('DB size:', (stat.size / 1024 / 1024).toFixed(2), 'MB')

  const buffer = fs.readFileSync(dbPath)
  const db = new SQL.Database(buffer)

  // Delete all task rows (they store base64 payloads)
  db.run("DELETE FROM kie_tasks")
  db.run("DELETE FROM openfield_tasks")
  db.run("DELETE FROM run_logs")
  console.log('Deleted tasks and logs.')

  // Save and reopen
  let data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
  db.close()

  // VACUUM
  const buf2 = fs.readFileSync(dbPath)
  const db2 = new SQL.Database(buf2)
  console.log('VACUUM...')
  db2.run('VACUUM')
  data = db2.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
  db2.close()

  const newStat = fs.statSync(dbPath)
  console.log('New DB size:', (newStat.size / 1024 / 1024).toFixed(2), 'MB')
  console.log('Done.')
}

main().catch(console.error)
