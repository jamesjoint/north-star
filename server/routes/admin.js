import { Router } from 'express'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { sendApprovalEmail } from '../email.js'

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
  sendApprovalEmail({ to: rows[0].email }).catch(err =>
    console.error('[approve] email failed:', err.message)
  )
  res.json({ ok: true })
})

// Reject / remove from waitlist
router.delete('/waitlist/:userId', async (req, res) => {
  await req.pool.query(`DELETE FROM "user" WHERE id = $1 AND status = 'pending'`, [req.params.userId])
  res.status(204).end()
})

// List all active users
router.get('/users', async (req, res) => {
  const { rows } = await req.pool.query(
    `SELECT id, email, role, status, "createdAt" FROM "user" WHERE status != 'pending' ORDER BY "createdAt" DESC`
  )
  res.json(rows)
})

// Deactivate a user
router.patch('/users/:userId', async (req, res) => {
  const { status } = req.body
  if (status !== 'deactivated') return res.status(400).json({ error: 'Only "deactivated" status allowed' })
  await req.pool.query(
    `UPDATE "user" SET status = 'deactivated', "updatedAt" = now() WHERE id = $1`,
    [req.params.userId]
  )
  res.json({ ok: true })
})

export default router
