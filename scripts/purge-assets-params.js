const path = require('path')
const fs = require('fs')

async function main() {
  const initSqlJs = require('sql.js')
  const SQL = await initSqlJs()

  const dbPath = path.join(process.env.APPDATA || '', 'kie-studio-desktop', 'kie-studio', 'database.sqlite')
  const buffer = fs.readFileSync(dbPath)
  const db = new SQL.Database(buffer)

  // Clear huge parameters column (API debug data, not needed)
  db.run("UPDATE assets SET parameters = '{}' WHERE parameters IS NOT NULL AND parameters != '' AND parameters != '{}'")
  console.log('Cleared parameters column.')

  // Clear negative_prompt (unused)
  db.run("UPDATE assets SET negative_prompt = ''")

  // Truncate long prompts (keep first 500 chars)
  db.run("UPDATE assets SET prompt = substr(prompt, 1, 500) WHERE length(prompt) > 500")

  // Save and VACUUM
  let data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
  db.close()

  const buf2 = fs.readFileSync(dbPath)
  const db2 = new SQL.Database(buf2)
  db2.run('VACUUM')
  data = db2.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
  db2.close()

  const stat = fs.statSync(dbPath)
  console.log('New DB size:', (stat.size / 1024).toFixed(2), 'KB')
  console.log('Done.')
}
main().catch(console.error)
