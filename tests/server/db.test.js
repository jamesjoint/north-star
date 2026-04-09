import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import {
  createPool, makeId, upsertJob, insertManualJob, getAllJobs, getJobById,
  getUnscoredJobs, updateScore, markDeleted, updateJobDescription
} from '../../server/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(path.join(__dirname, '../../server/db/schema.sql'), 'utf8')

let pool
beforeAll(async () => {
  pool = createPool(process.env.DATABASE_URL_TEST)
  await pool.query(schema)
})
afterAll(() => pool.end())
beforeEach(async () => {
  await pool.query('DELETE FROM job_scores')
  await pool.query('DELETE FROM tracker_entries')
  await pool.query('DELETE FROM boards')
  await pool.query('DELETE FROM jobs')
  await pool.query('DELETE FROM app_invites')
  await pool.query('DELETE FROM verification')
  await pool.query('DELETE FROM account')
  await pool.query('DELETE FROM session')
  await pool.query('DELETE FROM "user"')
})

const sample = {
  title: 'Head of Partnerships',
  company: 'Acme',
  location: 'Remote',
  remote: 'remote',
  url: 'https://example.com/job/1',
  source: 'test',
  posted_at: '2026-01-01',
  description: 'Great role',
}

describe('makeId', () => {
  it('returns same hash for same source+url', () => {
    expect(makeId('test', 'https://x.com/1')).toBe(makeId('test', 'https://x.com/1'))
  })
  it('returns different hash for different url', () => {
    expect(makeId('test', 'https://x.com/1')).not.toBe(makeId('test', 'https://x.com/2'))
  })
})

describe('upsertJob', () => {
  it('inserts a job and returns its id', async () => {
    const id = await upsertJob(pool, sample)
    expect(typeof id).toBe('string')
    expect(id.length).toBe(16)
  })

  it('getJobById returns inserted job', async () => {
    const id = await upsertJob(pool, sample)
    const job = await getJobById(pool, id)
    expect(job.title).toBe('Head of Partnerships')
    expect(job.company).toBe('Acme')
  })

  it('does not re-add a deleted job', async () => {
    const id = await upsertJob(pool, sample)
    await markDeleted(pool, id)
    const id2 = await upsertJob(pool, sample)
    expect(id2).toBeNull()
  })

  it('re-upserting updates fields but preserves score_dimensions structure', async () => {
    const id = await upsertJob(pool, sample)
    const userId = 'user_upsert_test'
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'upsert@example.com', false) ON CONFLICT DO NOTHING`,
      [userId]
    )
    await updateScore(pool, id, userId, 7.5, { core_mechanism: { score: 8, reasoning: 'good' } })
    await upsertJob(pool, { ...sample, title: 'Senior Partnerships Lead' })
    const job = await getJobById(pool, id, userId)
    expect(job.title).toBe('Senior Partnerships Lead')
    expect(job.score_aggregate).toBe(7.5)
  })
})

describe('getAllJobs', () => {
  it('excludes deleted jobs', async () => {
    const id = await upsertJob(pool, sample)
    await markDeleted(pool, id)
    const jobs = await getAllJobs(pool)
    expect(jobs.find(j => j.id === id)).toBeUndefined()
  })

  it('returns jobs sorted by score descending when userId provided', async () => {
    const userId = 'user_sort_test'
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'sort@example.com', false) ON CONFLICT DO NOTHING`,
      [userId]
    )
    const id1 = await upsertJob(pool, { ...sample, url: 'https://x.com/1', title: 'Low' })
    const id2 = await upsertJob(pool, { ...sample, url: 'https://x.com/2', title: 'High' })
    await upsertJob(pool, { ...sample, url: 'https://x.com/3', title: 'Unscored' })
    await updateScore(pool, id1, userId, 3.0, {})
    await updateScore(pool, id2, userId, 9.0, {})
    const jobs = await getAllJobs(pool, userId)
    expect(jobs[0].title).toBe('High')
    expect(jobs[1].title).toBe('Low')
    expect(jobs[2].title).toBe('Unscored')
  })
})

describe('getUnscoredJobs', () => {
  it('returns ids of jobs with no score for a user', async () => {
    const userId = 'user_unscored_test'
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'unscored@example.com', false) ON CONFLICT DO NOTHING`,
      [userId]
    )
    const id1 = await upsertJob(pool, { ...sample, url: 'https://x.com/1' })
    const id2 = await upsertJob(pool, { ...sample, url: 'https://x.com/2' })
    await updateScore(pool, id1, userId, 7.5, {})
    const unscored = await getUnscoredJobs(pool, userId)
    expect(unscored).toEqual([id2])
  })

  it('returns all non-deleted job ids when no userId', async () => {
    await upsertJob(pool, { ...sample, url: 'https://x.com/1' })
    await upsertJob(pool, { ...sample, url: 'https://x.com/2' })
    const ids = await getUnscoredJobs(pool)
    expect(ids.length).toBe(2)
  })
})

describe('updateScore', () => {
  it('writes score to job_scores for a given user', async () => {
    const userId = 'user_score_test'
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'score@example.com', false) ON CONFLICT DO NOTHING`,
      [userId]
    )
    const id = await upsertJob(pool, sample)
    await updateScore(pool, id, userId, 8.5, { core_mechanism: { score: 9, reasoning: 'great' } })

    const jobWithScore = await getJobById(pool, id, userId)
    expect(jobWithScore.score_aggregate).toBe(8.5)
    expect(jobWithScore.score_dimensions.core_mechanism.score).toBe(9)

    // without userId, score fields are not returned
    const jobRaw = await getJobById(pool, id)
    expect(jobRaw.score_aggregate).toBeUndefined()
  })
})

describe('updateJobDescription', () => {
  it('updates description', async () => {
    const id = await upsertJob(pool, sample)
    await updateJobDescription(pool, id, 'Updated description')
    const job = await getJobById(pool, id)
    expect(job.description).toBe('Updated description')
  })
})

describe('insertManualJob', () => {
  it('creates a new job from manual input', async () => {
    const id = await insertManualJob(pool, {
      title: 'Designer',
      company: 'Studio',
      location: 'Remote',
      url: 'https://example.com/manual',
      description: 'Design work',
    })
    expect(typeof id).toBe('string')
    const job = await getJobById(pool, id)
    expect(job.title).toBe('Designer')
    expect(job.source).toBe('manual')
    expect(job.remote).toBe('remote')
  })

  it('updates description if url already exists', async () => {
    const url = 'https://example.com/existing'
    const id1 = await upsertJob(pool, { ...sample, url, source: 'test' })
    const id2 = await insertManualJob(pool, { title: 'Updated', url, description: 'New desc' })
    expect(id2).toBe(id1)
    const job = await getJobById(pool, id1)
    expect(job.description).toBe('New desc')
  })
})
