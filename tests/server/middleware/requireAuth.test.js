import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockGetSession = vi.fn()

vi.mock('../../../server/auth.js', () => ({
  auth: {
    api: { getSession: (...args) => mockGetSession(...args) },
  },
  fromNodeHeaders: (headers) => headers,
}))

const { requireAuth } = await import('../../../server/middleware/requireAuth.js')

function makeRes() {
  const res = { statusCode: null, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requireAuth', () => {
  it('calls next() and attaches user for a valid active session', async () => {
    const session = { user: { id: 'u1', status: 'active', role: 'user' } }
    mockGetSession.mockResolvedValue(session)
    const req = { headers: {} }
    const res = makeRes()
    const next = vi.fn()
    await requireAuth(req, res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(req.user).toBe(session.user)
    expect(req.session).toBe(session)
    expect(res.statusCode).toBeNull()
  })

  it('returns 401 when session is null (no valid session cookie)', async () => {
    mockGetSession.mockResolvedValue(null)
    const req = { headers: {} }
    const res = makeRes()
    const next = vi.fn()
    await requireAuth(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(res.body).toMatchObject({ error: 'Unauthorized' })
  })

  it('returns 403 for pending account', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u2', status: 'pending', role: 'user' } })
    const req = { headers: {} }
    const res = makeRes()
    const next = vi.fn()
    await requireAuth(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body.error).toMatch(/pending/i)
  })

  it('returns 403 for deactivated account', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u3', status: 'deactivated', role: 'user' } })
    const req = { headers: {} }
    const res = makeRes()
    const next = vi.fn()
    await requireAuth(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body.error).toMatch(/deactivated/i)
  })

  it('returns 500 when getSession throws', async () => {
    mockGetSession.mockRejectedValue(new Error('Connection failed'))
    const req = { headers: {} }
    const res = makeRes()
    const next = vi.fn()
    await requireAuth(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatchObject({ error: 'Auth check failed' })
  })
})
