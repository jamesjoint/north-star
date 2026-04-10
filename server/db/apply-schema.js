// Applies schema.sql to the configured DATABASE_URL.
// Idempotent — uses IF NOT EXISTS throughout.
// Run as a Railway releaseCommand before every deploy.
import { configDotenv } from 'dotenv'
configDotenv({ override: true })

import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createPool } from '../db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const pool = createPool()
  const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  await pool.query(schema)
  console.log('[apply-schema] Schema applied.')

  // Bootstrap admin user on fresh deployments
  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail) {
    const adminId = crypto.randomUUID()
    const { rowCount } = await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, status, "createdAt", "updatedAt")
       VALUES ($1, '', $2, true, 'admin', 'active', now(), now())
       ON CONFLICT (email) DO NOTHING`,
      [adminId, adminEmail]
    )
    if (rowCount > 0) {
      console.log(`[apply-schema] Admin user created: ${adminEmail}`)
    } else {
      console.log(`[apply-schema] Admin user already exists: ${adminEmail}`)
    }
  } else {
    console.log('[apply-schema] ADMIN_EMAIL not set — skipping admin bootstrap.')
  }

  await pool.end()
  console.log('[apply-schema] Done.')
}

main().catch(err => { console.error('[apply-schema] Failed:', err.message); process.exit(1) })
