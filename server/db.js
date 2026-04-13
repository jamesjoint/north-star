import pg from 'pg'
import crypto from 'crypto'

const { Pool } = pg

export function createPool(connectionString = process.env.DATABASE_URL) {
  return new Pool({ connectionString })
}

export function makeId(source, url) {
  return crypto.createHash('sha256').update(source + url).digest('hex').slice(0, 16)
}

export async function upsertJob(pool, job) {
  const id = makeId(job.source, job.url)
  const { rows } = await pool.query('SELECT deleted FROM jobs WHERE id = $1', [id])
  if (rows[0]?.deleted) return null
  await pool.query(`
    INSERT INTO jobs (id, title, company, location, remote, url, source, posted_at, description, fetched_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
    ON CONFLICT (id) DO UPDATE SET
      title       = EXCLUDED.title,
      company     = EXCLUDED.company,
      location    = EXCLUDED.location,
      remote      = EXCLUDED.remote,
      posted_at   = EXCLUDED.posted_at,
      description = EXCLUDED.description,
      fetched_at  = now()
  `, [id, job.title, job.company, job.location, job.remote, job.url, job.source, job.posted_at, job.description])
  return id
}

export async function insertManualJob(pool, { title, company, location, url, description }) {
  const trimmedUrl = url.trim()
  const { rows } = await pool.query('SELECT id FROM jobs WHERE url = $1 LIMIT 1', [trimmedUrl])
  if (rows[0]) {
    await pool.query(
      'UPDATE jobs SET description = $1 WHERE id = $2',
      [(description || '').trim(), rows[0].id]
    )
    return rows[0].id
  }
  const id = makeId('manual', trimmedUrl)
  const l = (location || '').toLowerCase()
  const remote = l.includes('remote') || l.includes('flexible') ? 'remote'
    : l.includes('hybrid') ? 'hybrid'
    : l ? 'onsite' : 'unknown'
  await pool.query(`
    INSERT INTO jobs (id, title, company, location, remote, url, source, description, fetched_at)
    VALUES ($1,$2,$3,$4,$5,$6,'manual',$7,now())
  `, [id, title.trim(), (company || '').trim(), (location || '').trim(), remote, trimmedUrl, (description || '').trim()])
  return id
}

export async function getAllJobs(pool, userId = null) {
  let query, params = []
  if (userId) {
    query = `
      SELECT j.*,
             js.score_aggregate, js.score_dimensions, js.coherence_signal,
             te.status, te.notes, te.follow_up_date, te.applied_date,
             te.salary_range, te.direct_link, te.board_id, te.id AS entry_id
      FROM jobs j
      LEFT JOIN job_scores js ON js.job_id = j.id AND js.user_id = $1
      LEFT JOIN tracker_entries te ON te.job_id = j.id AND te.user_id = $1
      WHERE j.deleted = false
      ORDER BY js.score_aggregate DESC NULLS LAST, j.fetched_at DESC
    `
    params = [userId]
  } else {
    query = `SELECT * FROM jobs WHERE deleted = false ORDER BY fetched_at DESC`
  }
  const { rows } = await pool.query(query, params)
  return rows.map(deserialize)
}

export async function getJobById(pool, id, userId = null) {
  let row
  if (userId) {
    const { rows } = await pool.query(`
      SELECT j.*,
             js.score_aggregate, js.score_dimensions, js.coherence_signal,
             te.status, te.notes, te.follow_up_date, te.applied_date,
             te.salary_range, te.direct_link, te.board_id, te.id AS entry_id
      FROM jobs j
      LEFT JOIN job_scores js ON js.job_id = j.id AND js.user_id = $2
      LEFT JOIN tracker_entries te ON te.job_id = j.id AND te.user_id = $2
      WHERE j.id = $1
    `, [id, userId])
    row = rows[0]
  } else {
    const { rows } = await pool.query('SELECT * FROM jobs WHERE id = $1', [id])
    row = rows[0]
  }
  return row ? deserialize(row) : null
}

export async function getUnscoredJobs(pool, userId = null) {
  if (userId) {
    const { rows } = await pool.query(`
      SELECT j.id FROM jobs j
      LEFT JOIN job_scores js ON js.job_id = j.id AND js.user_id = $1
      WHERE j.deleted = false AND js.job_id IS NULL
    `, [userId])
    return rows.map(r => r.id)
  }
  const { rows } = await pool.query(`SELECT id FROM jobs WHERE deleted = false`)
  return rows.map(r => r.id)
}

export async function updateScore(pool, jobId, userId, scoreAggregate, scoreDimensions, coherenceSignal = null) {
  await pool.query(`
    INSERT INTO job_scores (job_id, user_id, score_aggregate, score_dimensions, coherence_signal, scored_at)
    VALUES ($1, $2, $3, $4, $5, now())
    ON CONFLICT (job_id, user_id) DO UPDATE SET
      score_aggregate  = EXCLUDED.score_aggregate,
      score_dimensions = EXCLUDED.score_dimensions,
      coherence_signal = EXCLUDED.coherence_signal,
      scored_at        = now()
  `, [jobId, userId, scoreAggregate, JSON.stringify(scoreDimensions), coherenceSignal])
}

export async function markDeleted(pool, id) {
  await pool.query('UPDATE jobs SET deleted = true WHERE id = $1', [id])
}

export async function updateJobDescription(pool, id, description) {
  await pool.query(
    'UPDATE jobs SET description = $1 WHERE id = $2',
    [description.trim(), id]
  )
}

// ── Boards ────────────────────────────────────────────────────────────────────

export async function getBoards(pool, userId) {
  const { rows } = await pool.query(
    `SELECT b.*, COUNT(te.id)::int AS job_count
     FROM boards b
     LEFT JOIN tracker_entries te ON te.board_id = b.id
     WHERE b.user_id = $1
     GROUP BY b.id
     ORDER BY b.created_at ASC`,
    [userId]
  )
  return rows
}

export async function getOrCreateDefaultBoard(pool, userId) {
  const { rows } = await pool.query(
    `SELECT id FROM boards WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [userId]
  )
  if (rows[0]) return rows[0].id
  const id = crypto.randomUUID()
  await pool.query(
    `INSERT INTO boards (id, user_id, name) VALUES ($1, $2, 'Default')`,
    [id, userId]
  )
  return id
}

export async function createBoard(pool, userId, name, emoji = null) {
  const id = crypto.randomUUID()
  await pool.query(
    `INSERT INTO boards (id, user_id, name, emoji) VALUES ($1, $2, $3, $4)`,
    [id, userId, name.trim(), emoji]
  )
  return id
}

export async function updateBoard(pool, boardId, userId, { name, emoji }) {
  const fields = [], values = []
  if (name !== undefined) { fields.push(`name = $${fields.length + 1}`); values.push(name.trim()) }
  if (emoji !== undefined) { fields.push(`emoji = $${fields.length + 1}`); values.push(emoji) }
  if (!fields.length) return
  values.push(boardId, userId)
  await pool.query(
    `UPDATE boards SET ${fields.join(', ')} WHERE id = $${values.length - 1} AND user_id = $${values.length}`,
    values
  )
}

export async function deleteBoard(pool, boardId, userId) {
  // Prevent deleting if it's the user's only board
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM boards WHERE user_id = $1`, [userId]
  )
  if (rows[0].cnt <= 1) throw new Error('Cannot delete your only board')
  await pool.query(`DELETE FROM boards WHERE id = $1 AND user_id = $2`, [boardId, userId])
}

// ── Tracker entries ────────────────────────────────────────────────────────────

export async function upsertTrackerEntry(pool, jobId, userId, boardId, updates) {
  const id = crypto.randomUUID()
  const allowed = ['status', 'follow_up_date', 'notes', 'applied_date', 'board_id', 'salary_range', 'direct_link']
  // Build the ON CONFLICT update clause only for fields explicitly provided
  const setClauses = allowed
    .filter(k => k in updates)
    .map(k => `${k} = EXCLUDED.${k}`)
  setClauses.push('updated_at = now()')
  // Determine values for INSERT
  const status        = updates.status        ?? 'Saved'
  const notes         = updates.notes         ?? null
  const follow_up     = updates.follow_up_date ?? null
  const applied_date  = updates.applied_date   ?? null
  const salary_range  = updates.salary_range   ?? null
  const direct_link   = updates.direct_link    ?? null
  await pool.query(
    `INSERT INTO tracker_entries (id, board_id, user_id, job_id, status, notes, follow_up_date, applied_date, salary_range, direct_link)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (job_id, user_id) DO UPDATE SET ${setClauses.join(', ')}`,
    [id, boardId, userId, jobId, status, notes, follow_up, applied_date, salary_range, direct_link]
  )
}

export async function removeTrackerEntry(pool, jobId, userId) {
  await pool.query(
    `DELETE FROM tracker_entries WHERE job_id = $1 AND user_id = $2`,
    [jobId, userId]
  )
}

// ── Per-user profiles ─────────────────────────────────────────────────────────

export async function getProfile(pool, userId) {
  const { rows } = await pool.query(`SELECT * FROM profiles WHERE user_id = $1`, [userId])
  return rows[0] || null
}

export async function upsertProfileWeights(pool, userId, weights) {
  await pool.query(
    `INSERT INTO profiles (user_id, weights, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET weights = $2::jsonb, updated_at = now()`,
    [userId, JSON.stringify(weights)]
  )
}

export async function upsertProfileBackground(pool, userId, background) {
  await pool.query(
    `INSERT INTO profiles (user_id, background, onboarding_done, updated_at)
     VALUES ($1, $2, true, now())
     ON CONFLICT (user_id) DO UPDATE SET background = $2, onboarding_done = true, updated_at = now()`,
    [userId, background]
  )
}

export async function upsertProfilePersonality(pool, userId, personality) {
  await pool.query(
    `INSERT INTO profiles (user_id, personality, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET personality = $2::jsonb, updated_at = now()`,
    [userId, JSON.stringify(personality)]
  )
}

export async function upsertProfileDimensions(pool, userId, dimensions) {
  await pool.query(
    `INSERT INTO profiles (user_id, dimensions, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET dimensions = $2::jsonb, updated_at = now()`,
    [userId, JSON.stringify(dimensions)]
  )
}

export async function seedAdminProfile(pool, userId, { background, weights }) {
  await pool.query(
    `INSERT INTO profiles (user_id, background, weights, onboarding_done, updated_at)
     VALUES ($1, $2, $3::jsonb, true, now())
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, background, JSON.stringify(weights)]
  )
}

function toDateStr(val) {
  if (!val) return val
  if (typeof val === 'string') return val.slice(0, 10)
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  return val
}

function deserialize(row) {
  if (!row) return row
  return {
    ...row,
    score_dimensions: row.score_dimensions
      ? (typeof row.score_dimensions === 'string' ? JSON.parse(row.score_dimensions) : row.score_dimensions)
      : null,
    follow_up_date: toDateStr(row.follow_up_date),
    applied_date:   toDateStr(row.applied_date),
  }
}
