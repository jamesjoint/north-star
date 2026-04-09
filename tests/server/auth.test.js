import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { createApp } from '../../server/index.js'
import { createPool } from '../../server/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(path.join(__dirname, '../../server/db/schema.sql'), 'utf8')

// better-auth signs cookies as `${token}.${base64(HMAC-SHA256(token, secret))}`
function signedCookie(token) {
  const secret = process.env.BETTER_AUTH_SECRET
  const sig = createHmac('sha256', secret).update(token).digest('base64')
  return `${token}.${sig}`
}

let pool, app
beforeAll(async () => {
  pool = createPool(process.env.DATABASE_URL_TEST)
  await pool.query(schema)
  app = createApp(pool)
})
afterAll(() => pool.end())
beforeEach(async () => {
  await pool.query('DELETE FROM tracker_entries')
  await pool.query('DELETE FROM boards')
  await pool.query('DELETE FROM job_scores')
  await pool.query('DELETE FROM jobs')
  await pool.query('DELETE FROM app_invites')
  await pool.query('DELETE FROM verification')
  await pool.query('DELETE FROM account')
  await pool.query('DELETE FROM session')
  await pool.query('DELETE FROM "user"')
})

describe('GET /api/jobs (protected)', () => {
  it('returns 401 without a session', async () => {
    const res = await request(app).get('/api/jobs')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/signup', () => {
  it('creates a pending user', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'newuser@example.com' })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('pending')

    const { rows } = await pool.query(`SELECT * FROM "user" WHERE email = $1`, ['newuser@example.com'])
    expect(rows[0].status).toBe('pending')
    expect(rows[0].role).toBe('user')
  })

  it('returns 400 for missing email', async () => {
    const res = await request(app).post('/api/auth/signup').send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid email', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'notanemail' })
    expect(res.status).toBe(400)
  })

  it('returns 409 if email already registered', async () => {
    await request(app).post('/api/auth/signup').send({ email: 'dup@example.com' })
    const res = await request(app).post('/api/auth/signup').send({ email: 'dup@example.com' })
    expect(res.status).toBe(409)
  })
})

describe('GET /api/auth/me', () => {
  it('returns 401 without a session', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('returns user info with a valid session', async () => {
    const userId = crypto.randomUUID()
    const token = crypto.randomUUID()
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1,'','me@example.com',true,'user','active')`,
      [userId]
    )
    await pool.query(
      `INSERT INTO session (id, "expiresAt", token, "userId") VALUES ($1,$2,$3,$4)`,
      [crypto.randomUUID(), new Date(Date.now() + 86400000), token, userId]
    )
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `better-auth.session_token=${signedCookie(token)}`)
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('me@example.com')
    expect(res.body.role).toBe('user')
  })
})

describe('requireAuth — pending user blocked', () => {
  it('returns 403 for pending account', async () => {
    const userId = crypto.randomUUID()
    const token = crypto.randomUUID()
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1,'','pending@example.com',false,'user','pending')`,
      [userId]
    )
    await pool.query(
      `INSERT INTO session (id, "expiresAt", token, "userId") VALUES ($1,$2,$3,$4)`,
      [crypto.randomUUID(), new Date(Date.now() + 86400000), token, userId]
    )
    const res = await request(app)
      .get('/api/jobs')
      .set('Cookie', `better-auth.session_token=${signedCookie(token)}`)
    expect(res.status).toBe(403)
  })
})
