import { Router } from 'express'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { auth, db } from '../auth.js'

// Public routes — mounted BEFORE requireAuth in index.js
export const publicInviteRouter = Router()

// Public: redeem invite (creates active account)
publicInviteRouter.post('/:code/redeem', async (req, res) => {
  const { email } = req.body
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' })

  const { rows } = await req.pool.query(`SELECT * FROM app_invites WHERE code = $1`, [req.params.code])
  const invite = rows[0]
  if (!invite) return res.status(404).json({ error: 'Invite not found' })
  if (invite.used_by) return res.status(409).json({ error: 'Invite already used' })
  if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'Invite expired' })

  const existing = await db.findOne({ model: 'user', where: [{ field: 'email', value: email }] })
  if (existing) {
    if (existing.status === 'pending' || existing.status === 'deactivated') {
      await req.pool.query(`UPDATE "user" SET status = 'active', "updatedAt" = now() WHERE id = $1`, [existing.id])
    }
  } else {
    await db.create({
      model: 'user',
      forceAllowId: true,
      data: {
        id: crypto.randomUUID(),
        name: '',
        email,
        emailVerified: false,
        role: 'user',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })
  }

  const { rows: userRows } = await req.pool.query(`SELECT id FROM "user" WHERE email = $1`, [email])
  await req.pool.query(`UPDATE app_invites SET used_by = $1 WHERE code = $2`, [userRows[0].id, invite.code])

  // Send magic link — fire and forget, don't fail if email is broken
  const appUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3001'
  auth.api.signInMagicLink({
    body: { email, callbackURL: appUrl },
    headers: new Headers({ host: new URL(appUrl).host }),
  }).catch(err => console.error('[redeem] magic link failed:', err.message))

  res.status(201).json({ status: 'active', message: 'Check your inbox for a sign-in link.' })
})

// Admin routes — mounted AFTER requireAuth in index.js
const adminRouter = Router()

adminRouter.post('/', requireAdmin, async (req, res) => {
  const { expiresInDays = 7 } = req.body
  const days = Number(expiresInDays)
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return res.status(400).json({ error: 'expiresInDays must be an integer between 1 and 365' })
  }
  const code = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  await req.pool.query(
    `INSERT INTO app_invites (code, created_by, expires_at) VALUES ($1, $2, $3)`,
    [code, req.user.id, expiresAt]
  )
  res.status(201).json({ code, expiresAt, url: `${process.env.BETTER_AUTH_URL}?invite=${code}` })
})

adminRouter.get('/', requireAdmin, async (req, res) => {
  const { rows } = await req.pool.query(
    `SELECT code, created_by, used_by, expires_at, created_at FROM app_invites ORDER BY created_at DESC`
  )
  res.json(rows)
})

adminRouter.delete('/:code', requireAdmin, async (req, res) => {
  await req.pool.query(`DELETE FROM app_invites WHERE code = $1 AND used_by IS NULL`, [req.params.code])
  res.status(204).end()
})

export default adminRouter
