import { Router } from 'express'
import { auth, db, fromNodeHeaders } from '../auth.js'
import { sendWaitlistConfirmationEmail } from '../email.js'

const router = Router()

// Self-signup — creates pending user, sends waitlist email
router.post('/signup', async (req, res) => {
  const { email } = req.body
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' })
  }

  const existing = await db.findOne({ model: 'user', where: [{ field: 'email', value: email }] })
  if (existing) return res.status(409).json({ error: 'Email already registered' })

  await db.create({
    model: 'user',
    forceAllowId: true,
    data: {
      id: crypto.randomUUID(),
      name: '',
      email,
      emailVerified: false,
      role: 'user',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  })

  sendWaitlistConfirmationEmail({ to: email }).catch(err =>
    console.error('[signup] waitlist email failed:', err.message)
  )

  res.status(201).json({ status: 'pending', message: "You're on the waitlist — we'll be in touch." })
})

// Current user info
router.get('/me', async (req, res) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  const { id, email, role, status } = session.user
  res.json({ id, email, role, status })
})

export default router
