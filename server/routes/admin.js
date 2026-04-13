import { Router } from 'express'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { sendApprovalEmail } from '../email.js'
import { Resend } from 'resend'

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
  // Send a magic link so the user can sign in directly from the approval email
  const approvedEmail = rows[0].email
  const baseUrl = process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 3001}`
  fetch(`${baseUrl}/api/auth/sign-in/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: approvedEmail }),
  }).then(r => r.json().catch(() => ({}))).then(body => {
    if (body?.error) {
      console.error('[approve] magic link failed, falling back to approval email:', JSON.stringify(body))
      return sendApprovalEmail({ to: approvedEmail })
    }
    console.log(`[approve] Magic link sent to ${approvedEmail}`)
  }).catch(err => {
    console.error('[approve] email failed:', err.message)
    sendApprovalEmail({ to: approvedEmail }).catch(() => {})
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

// Test email — admin-only, returns full Resend response for debugging
router.post('/test-email', async (req, res) => {
  const to = req.body?.to || req.user.email
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM || 'noreply@example.com'
  console.log(`[test-email] Attempting send to ${to} from ${from}, RESEND_API_KEY=${process.env.RESEND_API_KEY ? '***set***' : 'NOT SET'}`)
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: 'North Star — test email',
    html: '<p>This is a test email from North Star. If you received this, Resend is working.</p>',
  })
  if (error) {
    console.error('[test-email] Resend error:', JSON.stringify(error))
    return res.status(500).json({ ok: false, error })
  }
  console.log('[test-email] Sent ok:', JSON.stringify(data))
  res.json({ ok: true, data })
})

export default router
