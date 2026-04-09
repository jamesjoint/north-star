import { auth, fromNodeHeaders } from '../auth.js'

export async function requireAuth(req, res, next) {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
    if (!session) return res.status(401).json({ error: 'Unauthorized' })
    if (session.user.status === 'pending') {
      return res.status(403).json({ error: 'Account pending approval' })
    }
    if (session.user.status === 'deactivated') {
      return res.status(403).json({ error: 'Account deactivated' })
    }
    req.user = session.user
    req.session = session
    next()
  } catch (err) {
    console.error('[requireAuth]', err.message)
    res.status(500).json({ error: 'Auth check failed' })
  }
}
