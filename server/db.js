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
      SELECT j.*, js.score_aggregate, js.score_dimensions, js.coherence_signal
      FROM jobs j
      LEFT JOIN job_scores js ON js.job_id = j.id AND js.user_id = $1
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
      SELECT j.*, js.score_aggregate, js.score_dimensions, js.coherence_signal
      FROM jobs j
      LEFT JOIN job_scores js ON js.job_id = j.id AND js.user_id = $2
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

export async function updateTrackerEntry(pool, entryId, userId, updates) {
  const allowed = ['status', 'follow_up_date', 'notes', 'applied_date']
  const fields = [], values = []
  for (const key of allowed) {
    if (key in updates) {
      fields.push(`${key} = $${fields.length + 1}`)
      values.push(updates[key])
    }
  }
  if (!fields.length) return
  fields.push(`updated_at = now()`)
  values.push(entryId, userId)
  await pool.query(
    `UPDATE tracker_entries SET ${fields.join(', ')} WHERE id = $${values.length - 1} AND user_id = $${values.length}`,
    values
  )
}

function deserialize(row) {
  if (!row) return row
  return {
    ...row,
    score_dimensions: row.score_dimensions
      ? (typeof row.score_dimensions === 'string' ? JSON.parse(row.score_dimensions) : row.score_dimensions)
      : null
  }
}
