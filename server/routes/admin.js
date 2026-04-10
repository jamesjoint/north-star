import { Router } from 'express'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { sendApprovalEmail } from '../email.js'
import { auth } from '../auth.js'

const router = Router()
router.use(requireAdmin)

// Waitlist — list pending users
router.get('/waitlist', async (req, res) => {
  const { rows } = await req.pool.query(
    `SELECT id, email, "createdAt" FROM "user" WHERE status = 'pending' ORDER BY "createdAt" ASC`
  )
  res.json(rows)
})

// Approve a waitlisted user
router.post('/waitlist/:userId/approve', async (req, res) => {
  const { rows } = await req.pool.query(
    `UPDATE "user" SET status = 'active', "updatedAt" = now() WHERE id = $1 AND status = 'pending' RETURNING email`,
    [req.params.userId]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Pending user not found' })
  // Send a magic link directly so the user can log in from the approval email
  auth.api.signInMagicLink({
    body: { email: rows[0].email, callbackURL: process.env.BETTER_AUTH_URL || 'http://localhost:3001' },
    headers: new Headers({ host: new URL(process.env.BETTER_AUTH_URL || 'http://localhost:3001').host }),
  }).catch(() => {
    // Fall back to the generic approval email if magic link generation fails
    sendApprovalEmail({ to: rows[0].email }).catch(err =>
      console.error('[approve] fallback email failed:', err.message)
    )
  })
  res.json({ ok: true })
})

// Reject / remove from waitlist
router.delete('/waitlist/:userId', async (req, res) => {
  await req.pool.query(`DELETE FROM "user" WHERE id = $1 AND status = 'pending'`, [req.params.userId])
  res.status(204).end()
})

// List all active users with last login
router.get('/users', async (req, res) => {
  const { rows } = await req.pool.query(
    `SELECT u.id, u.email, u.role, u.status, u."createdAt",
            MAX(s."createdAt") AS last_login_at
     FROM "user" u
     LEFT JOIN session s ON s."userId" = u.id
     WHERE u.status != 'pending'
     GROUP BY u.id
     ORDER BY u."createdAt" DESC`
  )
  res.json(rows)
})

// Update user status (active ↔ deactivated)
router.patch('/users/:userId', async (req, res) => {
  const { status } = req.body
  if (!['active', 'deactivated'].includes(status)) {
    return res.status(400).json({ error: 'status must be "active" or "deactivated"' })
  }
  await req.pool.query(
    `UPDATE "user" SET status = $1, "updatedAt" = now() WHERE id = $2`,
    [status, req.params.userId]
  )
  res.json({ ok: true })
})

// Scoring queue — per-user stats
router.get('/scoring', async (req, res) => {
  // Active users with profiles
  const { rows: users } = await req.pool.query(
    `SELECT u.id, u.email,
            p.onboarding_done,
            COUNT(j.id) FILTER (WHERE js.job_id IS NULL)::int AS unscored,
            COUNT(js.job_id)::int AS scored,
            MAX(js.scored_at) AS last_scored_at
     FROM "user" u
     LEFT JOIN profiles p ON p.user_id = u.id
     LEFT JOIN jobs j ON j.deleted = false
     LEFT JOIN job_scores js ON js.job_id = j.id AND js.user_id = u.id
     WHERE u.status = 'active'
     GROUP BY u.id, u.email, p.onboarding_done
     ORDER BY u.email`
  )
  res.json(users)
})

export default router
