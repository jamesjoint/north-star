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

async function seedUser(pool, { role = 'user', status = 'active' } = {}) {
  const userId = crypto.randomUUID()
  const token = crypto.randomUUID()
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1,'',$2,true,$3,$4)`,
    [userId, `${role}@example.com`, role, status]
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

describe('POST /api/invites (admin only)', () => {
  it('returns 403 for non-admin user', async () => {
    const { cookie } = await seedUser(pool, { role: 'user' })
    const res = await request(app).post('/api/invites').set('Cookie', cookie).send({})
    expect(res.status).toBe(403)
  })

  it('creates an invite and returns code + url', async () => {
    const { userId, cookie } = await seedUser(pool, { role: 'admin' })
    const res = await request(app).post('/api/invites').set('Cookie', cookie).send({ expiresInDays: 3 })
    expect(res.status).toBe(201)
    expect(res.body.code).toBeTruthy()
    expect(res.body.url).toContain(res.body.code)

    const { rows } = await pool.query(`SELECT * FROM app_invites WHERE code = $1`, [res.body.code])
    expect(rows[0].created_by).toBe(userId)
    expect(rows[0].used_by).toBeNull()
  })
})

describe('GET /api/invites (admin only)', () => {
  it('returns 403 for non-admin', async () => {
    const { cookie } = await seedUser(pool, { role: 'user' })
    const res = await request(app).get('/api/invites').set('Cookie', cookie)
    expect(res.status).toBe(403)
  })

  it('lists all invites', async () => {
    const { userId, cookie } = await seedUser(pool, { role: 'admin' })
    await pool.query(
      `INSERT INTO app_invites (code, created_by, expires_at) VALUES ($1,$2,$3)`,
      ['testcode', userId, new Date(Date.now() + 86400000)]
    )
    const res = await request(app).get('/api/invites').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].code).toBe('testcode')
  })
})

describe('DELETE /api/invites/:code (admin only)', () => {
  it('revokes an unused invite', async () => {
    const { userId, cookie } = await seedUser(pool, { role: 'admin' })
    await pool.query(
      `INSERT INTO app_invites (code, created_by, expires_at) VALUES ($1,$2,$3)`,
      ['delcode', userId, new Date(Date.now() + 86400000)]
    )
    const res = await request(app).delete('/api/invites/delcode').set('Cookie', cookie)
    expect(res.status).toBe(204)

    const { rows } = await pool.query(`SELECT * FROM app_invites WHERE code = 'delcode'`)
    expect(rows).toHaveLength(0)
  })

  it('does not delete a used invite', async () => {
    const { userId, cookie } = await seedUser(pool, { role: 'admin' })
    await pool.query(
      `INSERT INTO app_invites (code, created_by, used_by, expires_at) VALUES ($1,$2,$3,$4)`,
      ['usedcode', userId, userId, new Date(Date.now() + 86400000)]
    )
    await request(app).delete('/api/invites/usedcode').set('Cookie', cookie)
    const { rows } = await pool.query(`SELECT * FROM app_invites WHERE code = 'usedcode'`)
    expect(rows).toHaveLength(1)
  })
})

describe('POST /api/invites/:code/redeem (public)', () => {
  it('returns 400 for missing email', async () => {
    const res = await request(app).post('/api/invites/anycode/redeem').send({})
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown code', async () => {
    const res = await request(app).post('/api/invites/notacode/redeem').send({ email: 'a@b.com' })
    expect(res.status).toBe(404)
  })

  it('returns 409 for already-used invite', async () => {
    const { userId } = await seedUser(pool, { role: 'admin' })
    await pool.query(
      `INSERT INTO app_invites (code, created_by, used_by, expires_at) VALUES ($1,$2,$3,$4)`,
      ['usedcode2', userId, userId, new Date(Date.now() + 86400000)]
    )
    const res = await request(app).post('/api/invites/usedcode2/redeem').send({ email: 'new@b.com' })
    expect(res.status).toBe(409)
  })

  it('returns 410 for expired invite', async () => {
    const { userId } = await seedUser(pool, { role: 'admin' })
    await pool.query(
      `INSERT INTO app_invites (code, created_by, expires_at) VALUES ($1,$2,$3)`,
      ['expcode', userId, new Date(Date.now() - 1000)]
    )
    const res = await request(app).post('/api/invites/expcode/redeem').send({ email: 'new@b.com' })
    expect(res.status).toBe(410)
  })

  it('creates a new active user and marks invite used', async () => {
    const { userId } = await seedUser(pool, { role: 'admin' })
    await pool.query(
      `INSERT INTO app_invites (code, created_by, expires_at) VALUES ($1,$2,$3)`,
      ['freshcode', userId, new Date(Date.now() + 86400000)]
    )
    const res = await request(app).post('/api/invites/freshcode/redeem').send({ email: 'invited@b.com' })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('active')

    const { rows } = await pool.query(`SELECT status FROM "user" WHERE email = 'invited@b.com'`)
    expect(rows[0].status).toBe('active')

    const { rows: inv } = await pool.query(`SELECT used_by FROM app_invites WHERE code = 'freshcode'`)
    expect(inv[0].used_by).toBeTruthy()
  })

  it('activates an existing pending user', async () => {
    const { userId } = await seedUser(pool, { role: 'admin' })
    // Seed a pending user with a unique email
    const pendingId = crypto.randomUUID()
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1,'','pending2@b.com',false,'user','pending')`,
      [pendingId]
    )
    await pool.query(
      `INSERT INTO app_invites (code, created_by, expires_at) VALUES ($1,$2,$3)`,
      ['activatecode', userId, new Date(Date.now() + 86400000)]
    )
    const res = await request(app).post('/api/invites/activatecode/redeem').send({ email: 'pending2@b.com' })
    expect(res.status).toBe(201)

    const { rows } = await pool.query(`SELECT status FROM "user" WHERE email = 'pending2@b.com'`)
    expect(rows[0].status).toBe('active')
  })
})
