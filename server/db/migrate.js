// One-time migration: read from local SQLite jobs.db → write to PostgreSQL
// Prerequisites: npm install --save-dev better-sqlite3
// Run once: node server/db/migrate.js
import { configDotenv } from 'dotenv'
configDotenv({ override: true })

import BetterSqlite3 from 'better-sqlite3'
import { createPool } from '../db.js'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const sqlitePath = process.env.SQLITE_DB_PATH || path.join(__dirname, '../../jobs.db')
  const sqlite = new BetterSqlite3(sqlitePath, { readonly: true })
  const pool = createPool()

  // Apply schema first (idempotent — IF NOT EXISTS)
  const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  await pool.query(schema)

  // Migrate jobs (excluding user-specific fields — scores and tracker move to per-user tables)
  const jobs = sqlite.prepare('SELECT * FROM jobs WHERE deleted = 0 OR deleted IS NULL').all()
  console.log(`Migrating ${jobs.length} jobs...`)
  for (const job of jobs) {
    await pool.query(`
      INSERT INTO jobs (id, title, company, location, remote, url, source, posted_at, description, fetched_at, deleted)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false)
      ON CONFLICT (id) DO NOTHING
    `, [
      job.id, job.title, job.company, job.location,
      job.remote || 'unknown', job.url, job.source,
      job.posted_at, job.description,
      job.fetched_at || new Date().toISOString(),
    ])
  }

  // Create the admin user
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) throw new Error('Set ADMIN_EMAIL in .env before running migration')

  const adminId = crypto.randomUUID()
  await pool.query(`
    INSERT INTO "user" (id, name, email, "emailVerified", role, status)
    VALUES ($1, 'Ashley', $2, true, 'admin', 'active')
    ON CONFLICT (email) DO NOTHING
  `, [adminId, adminEmail])

  // Use the actual row id (ON CONFLICT DO NOTHING means a pre-existing row won't be overwritten)
  const { rows: adminRows } = await pool.query(`SELECT id FROM "user" WHERE email = $1`, [adminEmail])
  const actualAdminId = adminRows[0].id

  // Seed admin's profile from profile.json
  const profilePath = new URL('../../server/profile.json', import.meta.url).pathname
  const fileProfile = JSON.parse(readFileSync(profilePath, 'utf8'))
  await pool.query(
    `INSERT INTO profiles (user_id, background, weights, onboarding_done, updated_at)
     VALUES ($1, $2, $3::jsonb, true, now())
     ON CONFLICT (user_id) DO NOTHING`,
    [actualAdminId, fileProfile.background, JSON.stringify(fileProfile.weights)]
  )
  console.log('Admin profile seeded.')

  // Migrate scores → job_scores
  const scored = jobs.filter(j => j.score_aggregate != null)
  console.log(`Migrating ${scored.length} scores...`)
  for (const job of scored) {
    await pool.query(`
      INSERT INTO job_scores (job_id, user_id, score_aggregate, score_dimensions, scored_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (job_id, user_id) DO NOTHING
    `, [job.id, actualAdminId, job.score_aggregate, job.score_dimensions])
  }

  // Create a default board and migrate tracker entries
  const boardId = crypto.randomUUID()
  await pool.query(`
    INSERT INTO boards (id, user_id, name) VALUES ($1, $2, 'My Job Search')
    ON CONFLICT DO NOTHING
  `, [boardId, actualAdminId])

  const tracked = jobs.filter(j => j.status && j.status !== 'none')
  console.log(`Migrating ${tracked.length} tracker entries...`)
  for (const job of tracked) {
    await pool.query(`
      INSERT INTO tracker_entries (id, board_id, user_id, job_id, status, notes, follow_up_date, applied_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (job_id, user_id) DO NOTHING
    `, [
      crypto.randomUUID(), boardId, actualAdminId, job.id,
      job.status, job.notes,
      job.follow_up_date || null,
      job.applied_date || null,
    ])
  }

  sqlite.close()
  await pool.end()
  console.log('Migration complete.')
}

migrate().catch(err => { console.error(err); process.exit(1) })
