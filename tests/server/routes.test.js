import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { createPool, upsertJob } from '../../server/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(path.join(__dirname, '../../server/db/schema.sql'), 'utf8')

function signedCookie(token) {
  const sig = createHmac('sha256', process.env.BETTER_AUTH_SECRET).update(token).digest('base64')
  return `${token}.${sig}`
}

let createApp, pool, sessionCookie

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
  await pool.query('DELETE FROM session')
  await pool.query('DELETE FROM "user"')

  // Create an active test user + session for authenticated routes
  const userId = crypto.randomUUID()
  const token = crypto.randomUUID()
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1,'','test@example.com',true,'user','active')`,
    [userId]
  )
  await pool.query(
    `INSERT INTO session (id, "expiresAt", token, "userId") VALUES ($1,$2,$3,$4)`,
    [crypto.randomUUID(), new Date(Date.now() + 86400000), token, userId]
  )
  sessionCookie = `better-auth.session_token=${signedCookie(token)}`
})

const SAMPLE_JOB = {
  title: 'Product Manager', company: 'Acme', location: 'NYC',
  remote: 'hybrid', url: 'https://x.com/1', source: 'test',
  posted_at: '2026-03-28', description: 'Great role'
}

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
})

describe('POST /api/refresh', () => {
  test('returns 202 and triggers pipeline', async () => {
    const mockPipeline = vi.fn().mockResolvedValue({ scraped: 0, scored: 0 })
    const app = createApp(pool, mockPipeline)
    const res = await request(app).post('/api/refresh').set('Cookie', sessionCookie)
    expect(res.status).toBe(202)
    expect(mockPipeline).toHaveBeenCalledOnce()
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
})
