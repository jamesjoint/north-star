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
  await pool.query('DELETE FROM app_invites')
  await pool.query('DELETE FROM verification')
  await pool.query('DELETE FROM account')
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
})

describe('GET /api/admin/users', () => {
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

describe('PATCH /api/admin/users/:userId', () => {
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
})
