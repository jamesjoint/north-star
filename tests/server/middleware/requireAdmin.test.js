import { describe, it, expect, vi } from 'vitest'
import { requireAdmin } from '../../../server/middleware/requireAdmin.js'

function makeRes() {
  const res = { statusCode: null, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

describe('requireAdmin', () => {
  it('calls next() for admin user', () => {
    const req = { user: { id: 1, role: 'admin' } }
    const res = makeRes()
    const next = vi.fn()
    requireAdmin(req, res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBeNull()
  })

  it('returns 403 for non-admin user', () => {
    const req = { user: { id: 2, role: 'user' } }
    const res = makeRes()
    const next = vi.fn()
    requireAdmin(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body).toMatchObject({ error: 'Admin only' })
  })

  it('returns 403 when req.user is null', () => {
    const req = { user: null }
    const res = makeRes()
    const next = vi.fn()
    requireAdmin(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
  })

  it('returns 403 when req.user is undefined', () => {
    const req = {}
    const res = makeRes()
    const next = vi.fn()
    requireAdmin(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
  })
})
