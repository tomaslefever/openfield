const path = require('path')
const fs = require('fs')

async function main() {
  const initSqlJs = require('sql.js')
  const SQL = await initSqlJs()
  const dbPath = path.join(process.env.APPDATA || '', 'kie-studio-desktop', 'kie-studio', 'database.sqlite')

  if (!fs.existsSync(dbPath)) { console.log('DB not found'); process.exit(1) }

  const buffer = fs.readFileSync(dbPath)
  const db = new SQL.Database(buffer)
  const stat = fs.statSync(dbPath)
  console.log(`DB: ${(stat.size / 1024).toFixed(1)} KB, ${stat.size / 1024 / 1024 < 1 ? 'small' : (stat.size / 1024 / 1024).toFixed(1) + ' MB'}`)

  // Get all tables
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'run_logs'")
  let totalBase64 = 0
  let totalLong = 0

  for (const t of (tables[0]?.values || [])) {
    const name = t[0]
    const cols = db.exec(`PRAGMA table_info('${name}')`)
    if (!cols[0]?.values?.length) continue

    const textCols = cols[0].values.filter(v => v[2].toUpperCase().includes('TEXT')).map(v => v[1])

    for (const col of textCols) {
      try {
        // Check for base64-like content (long alphanumeric strings with = padding)
        const res = db.exec(`
          SELECT count(*), max(length(${col})), sum(length(${col}))
          FROM "${name}"
          WHERE ${col} IS NOT NULL
            AND ${col} != ''
            AND length(${col}) > 1000
        `)
        if (res[0]?.values[0]) {
          const [count, max, total] = res[0].values[0]
          if (count > 0) {
            const totalKB = ((total || 0) / 1024).toFixed(1)
            const maxKB = ((max || 0) / 1024).toFixed(1)
            console.log(`  ${name}.${col}: ${count} rows with >1KB, max=${maxKB}KB, total=${totalKB}KB`)

            // Check if it looks like base64
            if (max > 100 && max < 10000 && count > 0) {
              const sample = db.exec(`SELECT ${col} FROM "${name}" WHERE length(${col}) > 100 AND length(${col}) < 1000 LIMIT 1`)
              const txt = sample[0]?.values[0]?.[0] || ''
              if (/^[A-Za-z0-9+/=\s]+$/.test(txt) && txt.length > 100) {
                console.log(`    ⚠ LOOKS LIKE BASE64!`)
              }
            }

            if (Number(max) > 100000) totalLong += Number(total || 0)
            if (Number(max) > 100) totalBase64 += Number(total || 0)
          }
        }
      } catch(e) {}
    }
  }

  console.log(`\nTotal large text: ${(totalBase64 / 1024 / 1024).toFixed(2)} MB`)
  if (totalBase64 < 1024 * 1024) console.log('DB is clean ✓')
  db.close()
}
main().catch(e => { console.error(e); process.exit(1) })
