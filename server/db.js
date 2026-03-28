import Database from 'better-sqlite3'
import crypto from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DB_PATH = process.env.DB_PATH || path.join(__dirname, '../jobs.db')

export function openDb(dbPath = DEFAULT_DB_PATH) {
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      company TEXT,
      location TEXT,
      remote TEXT DEFAULT 'unknown',
      url TEXT NOT NULL,
      source TEXT NOT NULL,
      posted_at TEXT,
      description TEXT,
      score_aggregate REAL,
      score_dimensions TEXT,
      fetched_at TEXT NOT NULL,
      seen INTEGER DEFAULT 0
    )
  `)
  return db
}

export function makeId(source, url) {
  return crypto.createHash('sha256').update(source + url).digest('hex').slice(0, 16)
}

export function upsertJob(db, job) {
  const id = makeId(job.source, job.url)
  db.prepare(`
    INSERT INTO jobs (id, title, company, location, remote, url, source, posted_at, description, fetched_at, seen)
    VALUES (@id, @title, @company, @location, @remote, @url, @source, @posted_at, @description, @fetched_at, 0)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      company = excluded.company,
      location = excluded.location,
      remote = excluded.remote,
      posted_at = excluded.posted_at,
      description = excluded.description,
      fetched_at = excluded.fetched_at
      -- score_aggregate and score_dimensions intentionally excluded: preserved across re-scrapes
  `).run({ ...job, id, fetched_at: new Date().toISOString() })
  return id
}

function deserializeRow(row) {
  if (!row) return row
  return {
    ...row,
    score_dimensions: row.score_dimensions ? JSON.parse(row.score_dimensions) : null
  }
}

export function updateScore(db, id, scoreAggregate, scoreDimensions) {
  db.prepare(`
    UPDATE jobs SET score_aggregate = ?, score_dimensions = ? WHERE id = ?
  `).run(scoreAggregate, JSON.stringify(scoreDimensions), id)
}

export function getAllJobs(db) {
  return db.prepare(`
    SELECT * FROM jobs ORDER BY score_aggregate DESC NULLS LAST, fetched_at DESC
  `).all().map(deserializeRow)
}

export function getJobById(db, id) {
  return deserializeRow(db.prepare('SELECT * FROM jobs WHERE id = ?').get(id))
}

export function markSeen(db, id) {
  db.prepare('UPDATE jobs SET seen = 1 WHERE id = ?').run(id)
}
