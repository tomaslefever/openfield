const path = require('path')
const fs = require('fs')

async function main() {
  const initSqlJs = require('sql.js')
  const SQL = await initSqlJs()

  const dbPath = path.join(process.env.APPDATA || '', 'kie-studio-desktop', 'kie-studio', 'database.sqlite')
  const buffer = fs.readFileSync(dbPath)
  const db = new SQL.Database(buffer)

  // Check asset column sizes
  console.log('Assets large columns:')
  const cols = ['prompt', 'parameters', 'tags', 'negative_prompt']
  for (const col of cols) {
    const res = db.exec(`SELECT max(length(${col})), avg(length(${col})), sum(length(${col})) FROM assets WHERE ${col} IS NOT NULL AND ${col} != ''`)
    if (res[0]?.values[0]) {
      const [max, avg, sum] = res[0].values[0]
      console.log(`  ${col}: max=${(max/1024).toFixed(1)}KB, avg=${Math.round(avg||0)}B, total=${((sum||0)/1024/1024).toFixed(2)}MB`)
    }
  }

  // Check specific large rows
  const large = db.exec("SELECT id, type, file_name, length(parameters) as sz FROM assets WHERE length(parameters) > 10000 ORDER BY length(parameters) DESC LIMIT 5")
  if (large[0]?.values) {
    console.log('\nTop 5 assets by parameters size:')
    for (const r of large[0].values) {
      console.log(`  ${r[0].slice(0,8)}... ${r[1]} ${r[2]}  params=${(r[3]/1024).toFixed(1)}KB`)
    }
  }

  // Check prompt size 
  const largePrompts = db.exec("SELECT id, type, length(prompt) as sz FROM assets WHERE length(prompt) > 1000 ORDER BY length(prompt) DESC LIMIT 5")
  if (largePrompts[0]?.values) {
    console.log('\nTop 5 assets by prompt size:')
    for (const r of largePrompts[0].values) {
      console.log(`  ${r[0].slice(0,8)}... ${r[1]}  prompt=${(r[2]/1024).toFixed(1)}KB`)
    }
  }

  db.close()
}
main().catch(console.error)
