import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { createPool, upsertJob, getOrCreateDefaultBoard } from '../../server/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(path.join(__dirname, '../../server/db/schema.sql'), 'utf8')

function signedCookie(token) {
  const sig = createHmac('sha256', process.env.BETTER_AUTH_SECRET).update(token).digest('base64')
  return `${token}.${sig}`
}

let createApp, pool, sessionCookie, testUserId

beforeAll(async () => {
  const mod = await import('../../server/index.js')
  createApp = mod.createApp
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
  await pool.query('DELETE FROM profiles')
  await pool.query('DELETE FROM session')
  await pool.query('DELETE FROM "user"')

  // Create an active test user + session for authenticated routes
  testUserId = crypto.randomUUID()
  const token = crypto.randomUUID()
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1,'','test@example.com',true,'user','active')`,
    [testUserId]
  )
  await pool.query(
    `INSERT INTO session (id, "expiresAt", token, "userId") VALUES ($1,$2,$3,$4)`,
    [crypto.randomUUID(), new Date(Date.now() + 86400000), token, testUserId]
  )
  sessionCookie = `better-auth.session_token=${signedCookie(token)}`
})

const SAMPLE_JOB = {
  title: 'Product Manager', company: 'Acme', location: 'NYC',
  remote: 'hybrid', url: 'https://x.com/1', source: 'test',
  posted_at: '2026-03-28', description: 'Great role'
}

describe('GET /api/health', () => {
  test('returns 200 ok without auth', async () => {
    const app = createApp(pool)
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})

describe('auth guard', () => {
  test('GET /api/jobs returns 401 without session', async () => {
    const app = createApp(pool)
    const res = await request(app).get('/api/jobs')
    expect(res.status).toBe(401)
  })

  test('GET /api/boards returns 401 without session', async () => {
    const app = createApp(pool)
    const res = await request(app).get('/api/boards')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/jobs', () => {
  test('returns empty array when no jobs', async () => {
    const app = createApp(pool)
    const res = await request(app).get('/api/jobs').set('Cookie', sessionCookie)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  test('returns jobs as array', async () => {
    await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    const res = await request(app).get('/api/jobs').set('Cookie', sessionCookie)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('Product Manager')
  })

  test('applies -2 age penalty to jobs posted > 30 days ago', async () => {
    const id = await upsertJob(pool, { ...SAMPLE_JOB, url: 'https://x.com/old', posted_at: '2025-01-01' })
    await pool.query(
      `INSERT INTO job_scores (job_id, user_id, score_aggregate, score_dimensions) VALUES ($1,$2,7.0,'{}')`,
      [id, testUserId]
    )
    const app = createApp(pool)
    const res = await request(app).get('/api/jobs').set('Cookie', sessionCookie)
    const job = res.body.find(j => j.id === id)
    expect(job.score_aggregate).toBe(5.0)  // 7.0 - 2 = 5.0
  })

  test('does not apply age penalty to jobs posted recently', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const id = await upsertJob(pool, { ...SAMPLE_JOB, url: 'https://x.com/new', posted_at: today })
    await pool.query(
      `INSERT INTO job_scores (job_id, user_id, score_aggregate, score_dimensions) VALUES ($1,$2,7.0,'{}')`,
      [id, testUserId]
    )
    const app = createApp(pool)
    const res = await request(app).get('/api/jobs').set('Cookie', sessionCookie)
    const job = res.body.find(j => j.id === id)
    expect(job.score_aggregate).toBe(7.0)  // unchanged
  })

  test('age penalty floor is 1 (never below 1)', async () => {
    const id = await upsertJob(pool, { ...SAMPLE_JOB, url: 'https://x.com/low', posted_at: '2025-01-01' })
    await pool.query(
      `INSERT INTO job_scores (job_id, user_id, score_aggregate, score_dimensions) VALUES ($1,$2,2.0,'{}')`,
      [id, testUserId]
    )
    const app = createApp(pool)
    const res = await request(app).get('/api/jobs').set('Cookie', sessionCookie)
    const job = res.body.find(j => j.id === id)
    expect(job.score_aggregate).toBe(1.0)  // max(1, 2.0 - 2) = 1
  })
})

describe('GET /api/jobs/:id', () => {
  test('returns 404 for unknown id', async () => {
    const app = createApp(pool)
    const res = await request(app).get('/api/jobs/unknownid').set('Cookie', sessionCookie)
    expect(res.status).toBe(404)
  })

  test('returns job by id', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    const res = await request(app).get(`/api/jobs/${id}`).set('Cookie', sessionCookie)
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Product Manager')
  })

  test('includes score_aggregate when user has scored the job', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    await pool.query(
      `INSERT INTO job_scores (job_id, user_id, score_aggregate, score_dimensions) VALUES ($1,$2,8.5,'{}')`,
      [id, testUserId]
    )
    const app = createApp(pool)
    const res = await request(app).get(`/api/jobs/${id}`).set('Cookie', sessionCookie)
    expect(res.status).toBe(200)
    expect(res.body.score_aggregate).toBe(8.5)
  })
})

describe('POST /api/jobs (manual add)', () => {
  test('creates job and returns 201', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .post('/api/jobs')
      .set('Cookie', sessionCookie)
      .send({ title: 'Designer', url: 'https://example.com/job/1', company: 'Acme' })
    expect(res.status).toBe(201)
    expect(res.body.title).toBe('Designer')
  })

  test('returns 400 when url is missing', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .post('/api/jobs')
      .set('Cookie', sessionCookie)
      .send({ title: 'Designer' })
    expect(res.status).toBe(400)
  })

  test('returns 400 when title is missing', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .post('/api/jobs')
      .set('Cookie', sessionCookie)
      .send({ url: 'https://example.com/job/notitle' })
    expect(res.status).toBe(400)
  })

  test('creates tracker entry when status is provided', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .post('/api/jobs')
      .set('Cookie', sessionCookie)
      .send({ title: 'Designer', url: 'https://example.com/job/2', company: 'Acme', status: 'Saved' })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('Saved')
  })

  test('does not create tracker entry when status is none', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .post('/api/jobs')
      .set('Cookie', sessionCookie)
      .send({ title: 'Designer', url: 'https://example.com/job/3', company: 'Acme', status: 'none' })
    expect(res.status).toBe(201)
    expect(res.body.status).toBeNull()
  })

  test('returns existing job when url already exists (deduplicates)', async () => {
    const app = createApp(pool)
    const first = await request(app)
      .post('/api/jobs')
      .set('Cookie', sessionCookie)
      .send({ title: 'Designer', url: 'https://example.com/job/dedup', company: 'Acme' })
    expect(first.status).toBe(201)

    const second = await request(app)
      .post('/api/jobs')
      .set('Cookie', sessionCookie)
      .send({ title: 'Designer v2', url: 'https://example.com/job/dedup', company: 'Acme', description: 'Updated desc' })
    expect(second.status).toBe(201)
    expect(second.body.id).toBe(first.body.id)
    expect(second.body.description).toBe('Updated desc')
  })
})

describe('PATCH /api/jobs/:id/description', () => {
  test('updates job description', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    const res = await request(app)
      .patch(`/api/jobs/${id}/description`)
      .set('Cookie', sessionCookie)
      .send({ description: 'Updated job description.' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const jobRes = await request(app).get(`/api/jobs/${id}`).set('Cookie', sessionCookie)
    expect(jobRes.body.description).toBe('Updated job description.')
  })

  test('returns 400 for missing description', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    const res = await request(app)
      .patch(`/api/jobs/${id}/description`)
      .set('Cookie', sessionCookie)
      .send({})
    expect(res.status).toBe(400)
  })
})

describe('POST /api/refresh', () => {
  test('returns 202 and triggers pipeline', async () => {
    const mockPipeline = vi.fn().mockResolvedValue({ scraped: 0, scored: 0 })
    const app = createApp(pool, mockPipeline)
    const res = await request(app).post('/api/refresh').set('Cookie', sessionCookie)
    expect(res.status).toBe(202)
    expect(mockPipeline).toHaveBeenCalledOnce()
  })

  test('returns 202 even when no pipeline configured', async () => {
    const app = createApp(pool) // no pipeline
    const res = await request(app).post('/api/refresh').set('Cookie', sessionCookie)
    expect(res.status).toBe(202)
  })
})

describe('DELETE /api/jobs/:id', () => {
  test('marks job as deleted', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    const res = await request(app).delete(`/api/jobs/${id}`).set('Cookie', sessionCookie)
    expect(res.status).toBe(204)
    const checkRes = await request(app).get('/api/jobs').set('Cookie', sessionCookie)
    expect(checkRes.body).toHaveLength(0)
  })

  test('returns 204 even for non-existent job id (idempotent)', async () => {
    const app = createApp(pool)
    const res = await request(app).delete('/api/jobs/does-not-exist').set('Cookie', sessionCookie)
    expect(res.status).toBe(204)
  })
})

describe('PATCH /api/jobs/:id (tracker)', () => {
  test('creates tracker entry and returns status in job', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    const res = await request(app)
      .patch(`/api/jobs/${id}`)
      .set('Cookie', sessionCookie)
      .send({ status: 'Applied' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('Applied')
    expect(res.body.applied_date).toBeTruthy()
  })

  test('updates notes on an existing entry', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'Saved' })
    const res = await request(app)
      .patch(`/api/jobs/${id}`)
      .set('Cookie', sessionCookie)
      .send({ notes: 'Great role' })
    expect(res.status).toBe(200)
    expect(res.body.notes).toBe('Great role')
    expect(res.body.status).toBe('Saved') // preserved
  })

  test('removes tracker entry when status is none', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'Saved' })
    const res = await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'none' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBeNull()
  })

  test('does not override existing applied_date when status is re-set to Applied', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    // First apply sets applied_date automatically
    await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'Applied' })
    const first = await request(app).get(`/api/jobs/${id}`).set('Cookie', sessionCookie)
    const originalDate = first.body.applied_date

    // Changing status away and back should not change the applied_date
    await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'Interviewing' })
    await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'Applied' })
    const second = await request(app).get(`/api/jobs/${id}`).set('Cookie', sessionCookie)
    expect(second.body.applied_date).toBe(originalDate)
  })

  test('accepts explicit applied_date', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    const res = await request(app)
      .patch(`/api/jobs/${id}`)
      .set('Cookie', sessionCookie)
      .send({ status: 'Applied', applied_date: '2026-01-15' })
    expect(res.status).toBe(200)
    expect(res.body.applied_date).toBe('2026-01-15')
  })

  test('sets follow_up_date', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'Applied' })
    const res = await request(app)
      .patch(`/api/jobs/${id}`)
      .set('Cookie', sessionCookie)
      .send({ follow_up_date: '2026-06-01' })
    expect(res.status).toBe(200)
    expect(res.body.follow_up_date).toBe('2026-06-01')
    expect(res.body.status).toBe('Applied')  // preserved
  })

  test('returns 404 for non-existent job id when status is none', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/jobs/does-not-exist')
      .set('Cookie', sessionCookie)
      .send({ status: 'none' })
    expect(res.status).toBe(404)
  })

  test('sets and retrieves salary_range', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'Applied' })
    const res = await request(app)
      .patch(`/api/jobs/${id}`)
      .set('Cookie', sessionCookie)
      .send({ salary_range: '$120k–$150k' })
    expect(res.status).toBe(200)
    expect(res.body.salary_range).toBe('$120k–$150k')
    expect(res.body.status).toBe('Applied')  // preserved
  })

  test('sets and retrieves direct_link', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    // Must have a tracker entry first
    await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'Applied' })
    const res = await request(app)
      .patch(`/api/jobs/${id}`)
      .set('Cookie', sessionCookie)
      .send({ direct_link: 'https://greenhouse.io/jobs/789' })
    expect(res.status).toBe(200)
    expect(res.body.direct_link).toBe('https://greenhouse.io/jobs/789')
    expect(res.body.status).toBe('Applied') // preserved
  })

  test('clears direct_link when sent as null', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'Applied', direct_link: 'https://example.com' })
    const res = await request(app)
      .patch(`/api/jobs/${id}`)
      .set('Cookie', sessionCookie)
      .send({ direct_link: null })
    expect(res.status).toBe(200)
    expect(res.body.direct_link).toBeNull()
  })

  test('GET /api/jobs returns persisted status after patch', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'Interviewing' })
    const listRes = await request(app).get('/api/jobs').set('Cookie', sessionCookie)
    const job = listRes.body.find(j => j.id === id)
    expect(job?.status).toBe('Interviewing')
  })

  test('moves job to a different board via board_id patch', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)

    // Create two boards and add job to first one
    const b1 = await request(app).post('/api/boards').set('Cookie', sessionCookie).send({ name: 'Board A' })
    const b2 = await request(app).post('/api/boards').set('Cookie', sessionCookie).send({ name: 'Board B' })
    await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'Saved', board_id: b1.body.id })

    // Move to second board
    const res = await request(app)
      .patch(`/api/jobs/${id}`)
      .set('Cookie', sessionCookie)
      .send({ board_id: b2.body.id })
    expect(res.status).toBe(200)
    expect(res.body.board_id).toBe(b2.body.id)

    // Board counts should reflect the move
    const boards = await request(app).get('/api/boards').set('Cookie', sessionCookie)
    const boardA = boards.body.find(b => b.id === b1.body.id)
    const boardB = boards.body.find(b => b.id === b2.body.id)
    expect(boardA.job_count).toBe(0)
    expect(boardB.job_count).toBe(1)
  })
})

describe('GET /api/boards', () => {
  test('returns empty array when no boards', async () => {
    const app = createApp(pool)
    const res = await request(app).get('/api/boards').set('Cookie', sessionCookie)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  test('returns board after creation', async () => {
    const app = createApp(pool)
    const post = await request(app)
      .post('/api/boards')
      .set('Cookie', sessionCookie)
      .send({ name: 'Dream Jobs', emoji: '⭐' })
    expect(post.status).toBe(201)
    expect(post.body.name).toBe('Dream Jobs')

    const get = await request(app).get('/api/boards').set('Cookie', sessionCookie)
    expect(get.body).toHaveLength(1)
    expect(get.body[0].name).toBe('Dream Jobs')
  })

  test('POST /api/boards returns 400 for missing name', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .post('/api/boards')
      .set('Cookie', sessionCookie)
      .send({})
    expect(res.status).toBe(400)
  })

  test('tracker entry is associated with auto-created default board', async () => {
    const id = await upsertJob(pool, SAMPLE_JOB)
    const app = createApp(pool)
    await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'Saved' })
    const boards = await request(app).get('/api/boards').set('Cookie', sessionCookie)
    expect(boards.body).toHaveLength(1)
    expect(boards.body[0].name).toBe('Default')
    expect(boards.body[0].job_count).toBe(1)
  })
})

describe('PATCH /api/boards/:id', () => {
  test('renames a board', async () => {
    const app = createApp(pool)
    const post = await request(app)
      .post('/api/boards')
      .set('Cookie', sessionCookie)
      .send({ name: 'Original', emoji: '📌' })
    const boardId = post.body.id

    const res = await request(app)
      .patch(`/api/boards/${boardId}`)
      .set('Cookie', sessionCookie)
      .send({ name: 'Renamed', emoji: '🌟' })
    expect(res.status).toBe(200)

    const boards = await request(app).get('/api/boards').set('Cookie', sessionCookie)
    expect(boards.body[0].name).toBe('Renamed')
    expect(boards.body[0].emoji).toBe('🌟')
  })
})

describe('DELETE /api/boards/:id', () => {
  test('returns 400 when deleting the only board', async () => {
    const app = createApp(pool)
    const post = await request(app)
      .post('/api/boards')
      .set('Cookie', sessionCookie)
      .send({ name: 'Only Board' })
    const res = await request(app)
      .delete(`/api/boards/${post.body.id}`)
      .set('Cookie', sessionCookie)
    expect(res.status).toBe(400)
  })

  test('deletes a board when another exists', async () => {
    const app = createApp(pool)
    const b1 = await request(app).post('/api/boards').set('Cookie', sessionCookie).send({ name: 'Board A' })
    const b2 = await request(app).post('/api/boards').set('Cookie', sessionCookie).send({ name: 'Board B' })

    const res = await request(app)
      .delete(`/api/boards/${b1.body.id}`)
      .set('Cookie', sessionCookie)
    expect(res.status).toBe(204)

    const boards = await request(app).get('/api/boards').set('Cookie', sessionCookie)
    expect(boards.body).toHaveLength(1)
    expect(boards.body[0].name).toBe('Board B')
  })
})

describe('GET /api/rescore-status', () => {
  test('returns running=false when no scoring is active', async () => {
    const app = createApp(pool)
    const res = await request(app).get('/api/rescore-status').set('Cookie', sessionCookie)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('running')
    expect(res.body.running).toBe(false)
  })
})

describe('GET /api/profile', () => {
  test('returns empty profile for new user', async () => {
    const app = createApp(pool)
    const res = await request(app).get('/api/profile').set('Cookie', sessionCookie)
    // Either returns profile from DB or falls back to file
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('weights')
  })

  test('PATCH /api/profile/background saves and marks onboarding_done', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/profile/background')
      .set('Cookie', sessionCookie)
      .send({ background: 'I have 10 years in partnerships.' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const profile = await request(app).get('/api/profile').set('Cookie', sessionCookie)
    expect(profile.body.background).toBe('I have 10 years in partnerships.')
    expect(profile.body.onboarding_done).toBe(true)
  })

  test('PATCH /api/profile/background returns 400 for missing body', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/profile/background')
      .set('Cookie', sessionCookie)
      .send({})
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/profile/personality', () => {
  test('saves personality data and returns it via GET', async () => {
    const app = createApp(pool)
    // Need a profile row first
    await request(app)
      .patch('/api/profile/background')
      .set('Cookie', sessionCookie)
      .send({ background: 'Background text.' })

    const res = await request(app)
      .patch('/api/profile/personality')
      .set('Cookie', sessionCookie)
      .send({ personality: { mbti: 'ENFP', enneagram: '7w8', sun_sign: 'Aries' } })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const profile = await request(app).get('/api/profile').set('Cookie', sessionCookie)
    expect(profile.body.personality.mbti).toBe('ENFP')
    expect(profile.body.personality.sun_sign).toBe('Aries')
  })

  test('returns 400 for missing body', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/profile/personality')
      .set('Cookie', sessionCookie)
      .send({})
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/profile/dimensions', () => {
  test('saves custom dimensions and returns them via GET', async () => {
    const app = createApp(pool)
    await request(app)
      .patch('/api/profile/background')
      .set('Cookie', sessionCookie)
      .send({ background: 'Background text.' })

    const dims = {
      creativity: { label: 'Creativity', description: 'How creative the role is.', weight: 1.5 },
      impact: { label: 'Impact', description: 'Scope of impact.', weight: 1 },
    }
    const res = await request(app)
      .patch('/api/profile/dimensions')
      .set('Cookie', sessionCookie)
      .send({ dimensions: dims })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const profile = await request(app).get('/api/profile').set('Cookie', sessionCookie)
    expect(profile.body.dimensions.creativity.label).toBe('Creativity')
  })

  test('returns 400 when a dimension is missing label', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/profile/dimensions')
      .set('Cookie', sessionCookie)
      .send({ dimensions: { foo: { description: 'no label here' } } })
    expect(res.status).toBe(400)
  })

  test('returns 400 when dimensions key is absent from body', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/profile/dimensions')
      .set('Cookie', sessionCookie)
      .send({})
    expect(res.status).toBe(400)
  })
})

describe('POST /api/profile/dimensions/regenerate', () => {
  test('returns 400 when no background set', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .post('/api/profile/dimensions/regenerate')
      .set('Cookie', sessionCookie)
    expect(res.status).toBe(400)
  })

  test('returns 200 when background exists (fires async, no await)', async () => {
    const app = createApp(pool)
    await request(app)
      .patch('/api/profile/background')
      .set('Cookie', sessionCookie)
      .send({ background: 'I work in partnerships and BD.' })
    const res = await request(app)
      .post('/api/profile/dimensions/regenerate')
      .set('Cookie', sessionCookie)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})

describe('PATCH /api/profile/weights (custom dim keys)', () => {
  test('accepts custom dimension keys after dimensions are saved', async () => {
    const app = createApp(pool)
    await request(app)
      .patch('/api/profile/background')
      .set('Cookie', sessionCookie)
      .send({ background: 'Background.' })
    await request(app)
      .patch('/api/profile/dimensions')
      .set('Cookie', sessionCookie)
      .send({ dimensions: {
        creativity: { label: 'Creativity', description: 'test', weight: 1 },
        impact:     { label: 'Impact',     description: 'test', weight: 1 },
      }})

    const res = await request(app)
      .patch('/api/profile/weights')
      .set('Cookie', sessionCookie)
      .send({ weights: { creativity: 2.5, impact: 3 } })
    expect(res.status).toBe(200)
  })

  test('rejects unknown keys when no custom dims exist', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/profile/weights')
      .set('Cookie', sessionCookie)
      .send({ weights: { totally_made_up_key: 2 } })
    expect(res.status).toBe(400)
  })

  test('accepts standard dimension keys', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/profile/weights')
      .set('Cookie', sessionCookie)
      .send({ weights: { core_mechanism: 3, gap_bridgeability: 1 } })
    expect(res.status).toBe(200)
  })

  test('returns 400 when weights key is absent from body', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/profile/weights')
      .set('Cookie', sessionCookie)
      .send({})
    expect(res.status).toBe(400)
  })

  test('returns 400 when weight value is negative', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/profile/weights')
      .set('Cookie', sessionCookie)
      .send({ weights: { core_mechanism: -1 } })
    expect(res.status).toBe(400)
  })

  test('returns 400 when weight value is not a number', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/profile/weights')
      .set('Cookie', sessionCookie)
      .send({ weights: { core_mechanism: 'high' } })
    expect(res.status).toBe(400)
  })

  test('partial update merges with existing weights', async () => {
    const app = createApp(pool)
    await request(app)
      .patch('/api/profile/weights')
      .set('Cookie', sessionCookie)
      .send({ weights: { core_mechanism: 3 } })
    await request(app)
      .patch('/api/profile/weights')
      .set('Cookie', sessionCookie)
      .send({ weights: { gap_bridgeability: 5 } })
    const profile = await request(app).get('/api/profile').set('Cookie', sessionCookie)
    expect(profile.body.weights.core_mechanism).toBe(3)
    expect(profile.body.weights.gap_bridgeability).toBe(5)
  })

  test('accepts weight value of 0 (valid — disables a dimension)', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/profile/weights')
      .set('Cookie', sessionCookie)
      .send({ weights: { core_mechanism: 0 } })
    expect(res.status).toBe(200)
  })
})

describe('multi-user isolation', () => {
  let userBCookie

  beforeEach(async () => {
    const userBId = crypto.randomUUID()
    const tokenB = crypto.randomUUID()
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1,'','userb@isolation.test',true,'user','active')`,
      [userBId]
    )
    await pool.query(
      `INSERT INTO session (id, "expiresAt", token, "userId") VALUES ($1,$2,$3,$4)`,
      [crypto.randomUUID(), new Date(Date.now() + 86400000), tokenB, userBId]
    )
    userBCookie = `better-auth.session_token=${signedCookie(tokenB)}`
  })

  test('User B does not see User A score for the same job', async () => {
    const app = createApp(pool)
    const id = await upsertJob(pool, SAMPLE_JOB)
    await pool.query(
      `INSERT INTO job_scores (job_id, user_id, score_aggregate, score_dimensions) VALUES ($1,$2,9.5,'{}')`,
      [id, testUserId]
    )

    const resA = await request(app).get('/api/jobs').set('Cookie', sessionCookie)
    expect(resA.body.find(j => j.id === id)?.score_aggregate).toBe(9.5)

    const resB = await request(app).get('/api/jobs').set('Cookie', userBCookie)
    expect(resB.body.find(j => j.id === id)?.score_aggregate).toBeNull()
  })

  test('User B boards are independent from User A boards', async () => {
    const app = createApp(pool)
    await request(app).post('/api/boards').set('Cookie', sessionCookie).send({ name: 'User A Board' })

    const resB = await request(app).get('/api/boards').set('Cookie', userBCookie)
    expect(resB.body).toEqual([])
  })

  test('User B tracker status is null for a job User A has tracked', async () => {
    const app = createApp(pool)
    const id = await upsertJob(pool, SAMPLE_JOB)
    await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'Applied' })

    const resA = await request(app).get('/api/jobs').set('Cookie', sessionCookie)
    expect(resA.body.find(j => j.id === id)?.status).toBe('Applied')

    const resB = await request(app).get('/api/jobs').set('Cookie', userBCookie)
    expect(resB.body.find(j => j.id === id)?.status).toBeNull()
  })

  test('User B profile is separate from User A profile', async () => {
    const app = createApp(pool)
    await request(app)
      .patch('/api/profile/background')
      .set('Cookie', sessionCookie)
      .send({ background: 'User A background' })

    const resB = await request(app).get('/api/profile').set('Cookie', userBCookie)
    expect(resB.body.background).not.toBe('User A background')
  })

  test('User B cannot rename User A board (no-op — board not found for user)', async () => {
    const app = createApp(pool)
    // User A creates a board
    const boardRes = await request(app)
      .post('/api/boards')
      .set('Cookie', sessionCookie)
      .send({ name: 'User A Private Board' })
    const boardId = boardRes.body.id

    // User B tries to patch it
    const res = await request(app)
      .patch(`/api/boards/${boardId}`)
      .set('Cookie', userBCookie)
      .send({ name: 'Hijacked' })
    // The patch should silently succeed (200) but not affect User A's board
    // because the WHERE clause includes user_id, so it's a no-op for User B
    const boardsA = await request(app).get('/api/boards').set('Cookie', sessionCookie)
    expect(boardsA.body.find(b => b.id === boardId)?.name).toBe('User A Private Board')
  })
})
