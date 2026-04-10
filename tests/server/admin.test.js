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

function signedCookie(token) {
  const sig = createHmac('sha256', process.env.BETTER_AUTH_SECRET).update(token).digest('base64')
  return `${token}.${sig}`
}

async function seedUser(pool, { role = 'user', status = 'active', email } = {}) {
  const userId = crypto.randomUUID()
  const token = crypto.randomUUID()
  const userEmail = email || `${role}-${userId.slice(0, 8)}@example.com`
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1,'',$2,true,$3,$4)`,
    [userId, userEmail, role, status]
  )
  await pool.query(
    `INSERT INTO session (id, "expiresAt", token, "userId") VALUES ($1,$2,$3,$4)`,
    [crypto.randomUUID(), new Date(Date.now() + 86400000), token, userId]
  )
  return { userId, cookie: `better-auth.session_token=${signedCookie(token)}` }
}

let pool, app
beforeAll(async () => {
  pool = createPool(process.env.DATABASE_URL_TEST)
  await pool.query(schema)
  app = createApp(pool)
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
})

describe('GET /api/admin/waitlist', () => {
  it('returns 403 for non-admin', async () => {
    const { cookie } = await seedUser(pool, { role: 'user' })
    const res = await request(app).get('/api/admin/waitlist').set('Cookie', cookie)
    expect(res.status).toBe(403)
  })

  it('returns pending users', async () => {
    const { cookie } = await seedUser(pool, { role: 'admin' })
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1,'','waitlist@example.com',false,'user','pending')`,
      [crypto.randomUUID()]
    )
    const res = await request(app).get('/api/admin/waitlist').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].email).toBe('waitlist@example.com')
  })
})

describe('POST /api/admin/waitlist/:userId/approve', () => {
  it('returns 403 for non-admin', async () => {
    const { cookie } = await seedUser(pool, { role: 'user' })
    const res = await request(app).post('/api/admin/waitlist/someid/approve').set('Cookie', cookie)
    expect(res.status).toBe(403)
  })

  it('approves a pending user', async () => {
    const { cookie } = await seedUser(pool, { role: 'admin' })
    const pendingId = crypto.randomUUID()
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1,'','approve@example.com',false,'user','pending')`,
      [pendingId]
    )
    const res = await request(app)
      .post(`/api/admin/waitlist/${pendingId}/approve`)
      .set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const { rows } = await pool.query(`SELECT status FROM "user" WHERE id = $1`, [pendingId])
    expect(rows[0].status).toBe('active')
  })

  it('returns 404 for non-pending user', async () => {
    const { cookie, userId } = await seedUser(pool, { role: 'admin' })
    const res = await request(app)
      .post(`/api/admin/waitlist/${userId}/approve`)
      .set('Cookie', cookie)
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/admin/waitlist/:userId', () => {
  it('returns 403 for non-admin', async () => {
    const { cookie } = await seedUser(pool, { role: 'user' })
    const res = await request(app).delete('/api/admin/waitlist/someid').set('Cookie', cookie)
    expect(res.status).toBe(403)
  })

  it('removes a pending user', async () => {
    const { cookie } = await seedUser(pool, { role: 'admin' })
    const pendingId = crypto.randomUUID()
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1,'','reject@example.com',false,'user','pending')`,
      [pendingId]
    )
    const res = await request(app)
      .delete(`/api/admin/waitlist/${pendingId}`)
      .set('Cookie', cookie)
    expect(res.status).toBe(204)

    const { rows } = await pool.query(`SELECT * FROM "user" WHERE id = $1`, [pendingId])
    expect(rows).toHaveLength(0)
  })

  it('returns 204 silently for non-existent user id', async () => {
    const { cookie } = await seedUser(pool, { role: 'admin' })
    const res = await request(app)
      .delete(`/api/admin/waitlist/${crypto.randomUUID()}`)
      .set('Cookie', cookie)
    expect(res.status).toBe(204)
  })

  it('does not delete an active user (only deletes pending)', async () => {
    const { cookie } = await seedUser(pool, { role: 'admin' })
    const { userId: activeId } = await seedUser(pool, { role: 'user', email: 'active-nodelete@example.com' })
    const res = await request(app)
      .delete(`/api/admin/waitlist/${activeId}`)
      .set('Cookie', cookie)
    expect(res.status).toBe(204)
    const { rows } = await pool.query(`SELECT id FROM "user" WHERE id = $1`, [activeId])
    expect(rows).toHaveLength(1)
  })
})

describe('GET /api/admin/users', () => {
  it('returns 403 for non-admin', async () => {
    const { cookie } = await seedUser(pool, { role: 'user' })
    const res = await request(app).get('/api/admin/users').set('Cookie', cookie)
    expect(res.status).toBe(403)
  })

  it('returns all non-pending users', async () => {
    const { cookie } = await seedUser(pool, { role: 'admin', email: 'admin2@example.com' })
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1,'','active2@example.com',true,'user','active')`,
      [crypto.randomUUID()]
    )
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1,'','pending3@example.com',false,'user','pending')`,
      [crypto.randomUUID()]
    )
    const res = await request(app).get('/api/admin/users').set('Cookie', cookie)
    expect(res.status).toBe(200)
    // Should include active users but not pending
    const emails = res.body.map(u => u.email)
    expect(emails).toContain('active2@example.com')
    expect(emails).not.toContain('pending3@example.com')
  })
})

describe('GET /api/admin/scoring', () => {
  it('returns 403 for non-admin', async () => {
    const { cookie } = await seedUser(pool, { role: 'user' })
    const res = await request(app).get('/api/admin/scoring').set('Cookie', cookie)
    expect(res.status).toBe(403)
  })

  it('returns per-user scoring stats', async () => {
    const { cookie } = await seedUser(pool, { role: 'admin', email: 'admin@example.com' })
    // Active user with a completed profile
    const { userId: u1 } = await seedUser(pool, { role: 'user', email: 'user1@example.com' })
    await pool.query(
      `INSERT INTO profiles (user_id, background, onboarding_done) VALUES ($1, 'bg', true)`,
      [u1]
    )
    // Insert a job and score it for u1
    const jobId = crypto.randomUUID()
    await pool.query(
      `INSERT INTO jobs (id, title, company, url, source, remote) VALUES ($1,'T','C','https://x.com','test','unknown')`,
      [jobId]
    )
    await pool.query(
      `INSERT INTO job_scores (job_id, user_id, score_aggregate, score_dimensions) VALUES ($1,$2,7.5,'{}')`,
      [jobId, u1]
    )

    const res = await request(app).get('/api/admin/scoring').set('Cookie', cookie)
    expect(res.status).toBe(200)
    const u1row = res.body.find(r => r.email === 'user1@example.com')
    expect(u1row).toBeTruthy()
    expect(u1row.scored).toBe(1)
    expect(u1row.unscored).toBe(0)
  })

  it('counts unscored jobs correctly', async () => {
    const { cookie } = await seedUser(pool, { role: 'admin', email: 'admin2@example.com' })
    const { userId: u1 } = await seedUser(pool, { role: 'user', email: 'unscored@example.com' })
    await pool.query(
      `INSERT INTO profiles (user_id, background, onboarding_done) VALUES ($1, 'bg', true)`,
      [u1]
    )
    // Two jobs, neither scored for u1
    await pool.query(`INSERT INTO jobs (id, title, company, url, source, remote) VALUES ('ja','T','C','https://a.com','test','unknown')`)
    await pool.query(`INSERT INTO jobs (id, title, company, url, source, remote) VALUES ('jb','T','C','https://b.com','test','unknown')`)

    const res = await request(app).get('/api/admin/scoring').set('Cookie', cookie)
    expect(res.status).toBe(200)
    const u1row = res.body.find(r => r.email === 'unscored@example.com')
    expect(u1row.scored).toBe(0)
    expect(u1row.unscored).toBe(2)
  })
})

describe('PATCH /api/admin/users/:userId', () => {
  it('returns 403 for non-admin', async () => {
    const { cookie } = await seedUser(pool, { role: 'user' })
    const res = await request(app)
      .patch('/api/admin/users/someid')
      .set('Cookie', cookie)
      .send({ status: 'deactivated' })
    expect(res.status).toBe(403)
  })

  it('deactivates a user', async () => {
    const { cookie } = await seedUser(pool, { role: 'admin' })
    const { userId: targetId } = await seedUser(pool, { role: 'user', email: 'target@example.com' })
    const res = await request(app)
      .patch(`/api/admin/users/${targetId}`)
      .set('Cookie', cookie)
      .send({ status: 'deactivated' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const { rows } = await pool.query(`SELECT status FROM "user" WHERE id = $1`, [targetId])
    expect(rows[0].status).toBe('deactivated')
  })

  it('returns 400 for invalid status', async () => {
    const { cookie } = await seedUser(pool, { role: 'admin' })
    const { userId: targetId } = await seedUser(pool, { role: 'user', email: 'target2@example.com' })
    const res = await request(app)
      .patch(`/api/admin/users/${targetId}`)
      .set('Cookie', cookie)
      .send({ status: 'banned' })
    expect(res.status).toBe(400)
  })

  it('reactivates a deactivated user', async () => {
    const { cookie } = await seedUser(pool, { role: 'admin' })
    const { userId: targetId } = await seedUser(pool, { role: 'user', email: 'reactivate@example.com' })
    // First deactivate
    await request(app)
      .patch(`/api/admin/users/${targetId}`)
      .set('Cookie', cookie)
      .send({ status: 'deactivated' })
    // Then reactivate
    const res = await request(app)
      .patch(`/api/admin/users/${targetId}`)
      .set('Cookie', cookie)
      .send({ status: 'active' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    const { rows } = await pool.query(`SELECT status FROM "user" WHERE id = $1`, [targetId])
    expect(rows[0].status).toBe('active')
  })
})
