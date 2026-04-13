import { Router } from 'express'
import { auth, db, fromNodeHeaders } from '../auth.js'
import { sendWaitlistConfirmationEmail } from '../email.js'

const router = Router()

// In-memory cooldown: email → timestamp of last send
const COOLDOWN_MS = 5 * 60 * 1000
const lastSent = new Map()

// Unified login entry point — always returns 200 to prevent email enumeration.
// Handles: admin auto-approve, new user signup, cooldown, magic link send.
router.post('/request-link', async (req, res) => {
  const raw = req.body?.email
  if (!raw || typeof raw !== 'string' || !raw.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' })
  }
  const email = raw.toLowerCase().trim()

  // Always respond immediately — never reveal whether the email exists or is eligible
  res.json({ ok: true })

  const now = Date.now()

  try {
    // ── Auto-approve admin email ────────────────────────────────────────────
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim()
    if (adminEmail && email === adminEmail) {
      const existing = await db.findOne({ model: 'user', where: [{ field: 'email', value: email }] })
      if (!existing) {
        await db.create({
          model: 'user',
          forceAllowId: true,
          data: {
            id: crypto.randomUUID(),
            name: '',
            email,
            emailVerified: true,
            role: 'admin',
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        })
        console.log(`[request-link] Created admin user: ${email}`)
      } else if (existing.status !== 'active') {
        await req.pool.query(
          `UPDATE "user" SET status = 'active', role = 'admin', "updatedAt" = now() WHERE email = $1`,
          [email]
        )
        console.log(`[request-link] Auto-approved admin: ${email}`)
      }
    }

    // ── Look up user ────────────────────────────────────────────────────────
    const user = await db.findOne({ model: 'user', where: [{ field: 'email', value: email }] })

    if (!user) {
      // New user — add to waitlist
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
      console.log(`[request-link] New user added to waitlist: ${email}`)
      sendWaitlistConfirmationEmail({ to: email }).catch(err =>
        console.error('[request-link] waitlist email failed:', err.message)
      )
      return
    }

    if (user.status !== 'active') {
      console.log(`[request-link] User ${email} is ${user.status} — not sending magic link`)
      return
    }

    // ── Cooldown check ──────────────────────────────────────────────────────
    const last = lastSent.get(email)
    if (last && now - last < COOLDOWN_MS) {
      console.log(`[request-link] Cooldown active for ${email} — skipping send (${Math.round((COOLDOWN_MS - (now - last)) / 1000)}s remaining)`)
      return
    }
    lastSent.set(email, now)

    // ── Send magic link via better-auth HTTP endpoint ───────────────────────
    console.log(`[request-link] Sending magic link to ${email}`)
    const baseUrl = process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 3001}`
    const mlRes = await fetch(`${baseUrl}/api/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const mlBody = await mlRes.json().catch(() => ({}))
    if (!mlRes.ok) {
      console.error(`[request-link] better-auth returned ${mlRes.status}:`, JSON.stringify(mlBody))
    } else {
      console.log(`[request-link] Magic link sent to ${email}`)
    }
  } catch (err) {
    console.error(`[request-link] Error for ${email}:`, err.message, err.stack)
  }
})

// Self-signup — kept for backwards compatibility
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
