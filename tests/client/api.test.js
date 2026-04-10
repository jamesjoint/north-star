import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchCurrentUser, AuthExpiredError,
  signup, signOut, sendMagicLink,
  fetchJobs, fetchJob, patchJob, createJob, deleteJob, patchJobDescription, triggerRefresh,
  fetchProfile, patchBackground, patchWeights, patchPersonality, patchDimensions, regenerateDimensions, fetchRescoreStatus,
  fetchInvites, createInvite, revokeInvite, redeemInvite,
  fetchWaitlist, approveUser, rejectUser, fetchAdminUsers, deactivateUser, reactivateUser, fetchScoringQueue,
  fetchBoards, createBoardApi, updateBoardApi, deleteBoardApi,
} from '../../src/api.js'

// Helper to mock global fetch with a given response
function mockFetch(status, body = {}) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  delete global.fetch
})

describe('AuthExpiredError', () => {
  test('is an Error subclass with name "AuthExpiredError"', () => {
    const err = new AuthExpiredError()
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AuthExpiredError')
    expect(err.message).toBe('auth_expired')
  })
})

describe('fetchCurrentUser', () => {
  test('returns user JSON on 200', async () => {
    mockFetch(200, { email: 'alice@example.com', role: 'user' })
    const user = await fetchCurrentUser()
    expect(user.email).toBe('alice@example.com')
  })

  test('returns null when session is not found (401)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    })
    const user = await fetchCurrentUser()
    expect(user).toBeNull()
  })

  test('throws on server error (non-401 non-200)', async () => {
    mockFetch(500)
    await expect(fetchCurrentUser()).rejects.toThrow('Failed to fetch user')
  })
})

describe('apiFetch — auth:expired event', () => {
  test('dispatches auth:expired event and throws AuthExpiredError on 401 for protected endpoints', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    })

    let eventFired = false
    window.addEventListener('auth:expired', () => { eventFired = true }, { once: true })

    await expect(fetchJobs()).rejects.toBeInstanceOf(AuthExpiredError)
    expect(eventFired).toBe(true)
  })

  test('does not dispatch auth:expired for /auth/ endpoints returning 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    })

    let eventFired = false
    window.addEventListener('auth:expired', () => { eventFired = true }, { once: true })

    const user = await fetchCurrentUser()
    expect(user).toBeNull()
    expect(eventFired).toBe(false)
  })
})

// ─── Auth endpoints ───────────────────────────────────────────────────────────

describe('signup', () => {
  test('POSTs to /api/auth/signup with email', async () => {
    mockFetch(200, { ok: true })
    await signup('alice@example.com')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/auth/signup')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body).email).toBe('alice@example.com')
  })
})

describe('sendMagicLink', () => {
  test('POSTs to magic-link endpoint with email', async () => {
    mockFetch(200, { ok: true })
    await sendMagicLink('alice@example.com')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('magic-link')
    expect(JSON.parse(opts.body).email).toBe('alice@example.com')
  })
})

describe('signOut', () => {
  test('POSTs to sign-out endpoint', async () => {
    mockFetch(200, {})
    await signOut()
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('sign-out')
    expect(opts.method).toBe('POST')
  })
})

// ─── Jobs endpoints ───────────────────────────────────────────────────────────

describe('fetchJobs', () => {
  test('GETs /api/jobs and returns array', async () => {
    mockFetch(200, [{ id: 'j1' }])
    const jobs = await fetchJobs()
    expect(jobs).toEqual([{ id: 'j1' }])
  })

  test('throws on non-200', async () => {
    mockFetch(500)
    await expect(fetchJobs()).rejects.toThrow('Failed to fetch jobs')
  })
})

describe('fetchJob', () => {
  test('GETs /api/jobs/:id', async () => {
    mockFetch(200, { id: 'j1', title: 'PM' })
    const job = await fetchJob('j1')
    expect(job.id).toBe('j1')
    const [url] = global.fetch.mock.calls[0]
    expect(url).toContain('/jobs/j1')
  })

  test('throws on non-200', async () => {
    mockFetch(404)
    await expect(fetchJob('j1')).rejects.toThrow('Failed to fetch job j1')
  })
})

describe('patchJob', () => {
  test('PATCHes /api/jobs/:id with updates', async () => {
    mockFetch(200, { id: 'j1', status: 'Applied' })
    const result = await patchJob('j1', { status: 'Applied' })
    expect(result.status).toBe('Applied')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/jobs/j1')
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body)).toEqual({ status: 'Applied' })
  })

  test('throws on non-200', async () => {
    mockFetch(400)
    await expect(patchJob('j1', {})).rejects.toThrow('Failed to update job j1')
  })
})

describe('createJob', () => {
  test('POSTs to /api/jobs with data', async () => {
    mockFetch(201, { id: 'j3', title: 'New Job' })
    const job = await createJob({ title: 'New Job', url: 'https://example.com' })
    expect(job.id).toBe('j3')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/jobs')
    expect(opts.method).toBe('POST')
  })

  test('throws on non-200', async () => {
    mockFetch(400)
    await expect(createJob({})).rejects.toThrow('Failed to add job')
  })
})

describe('deleteJob', () => {
  test('DELETEs /api/jobs/:id', async () => {
    mockFetch(200, {})
    await deleteJob('j1')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/jobs/j1')
    expect(opts.method).toBe('DELETE')
  })

  test('throws on non-200', async () => {
    mockFetch(404)
    await expect(deleteJob('j1')).rejects.toThrow('Failed to delete job j1')
  })
})

describe('patchJobDescription', () => {
  test('PATCHes /api/jobs/:id/description', async () => {
    mockFetch(200, {})
    await patchJobDescription('j1', 'Updated description')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/jobs/j1/description')
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body).description).toBe('Updated description')
  })

  test('throws on non-200', async () => {
    mockFetch(400)
    await expect(patchJobDescription('j1', 'bad')).rejects.toThrow('Failed to update description')
  })
})

describe('triggerRefresh', () => {
  test('POSTs to /api/refresh', async () => {
    mockFetch(200, { ok: true })
    await triggerRefresh()
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/refresh')
    expect(opts.method).toBe('POST')
  })
})

// ─── Profile endpoints ────────────────────────────────────────────────────────

describe('fetchProfile', () => {
  test('GETs /api/profile and returns data', async () => {
    mockFetch(200, { background: 'PM with 10 years experience' })
    const profile = await fetchProfile()
    expect(profile.background).toBe('PM with 10 years experience')
  })

  test('throws on non-200', async () => {
    mockFetch(500)
    await expect(fetchProfile()).rejects.toThrow('Failed to fetch profile')
  })
})

describe('patchBackground', () => {
  test('PATCHes /api/profile/background with text', async () => {
    mockFetch(200, { background: 'New text' })
    await patchBackground('New text')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/profile/background')
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body).background).toBe('New text')
  })

  test('throws on non-200', async () => {
    mockFetch(400)
    await expect(patchBackground('bad')).rejects.toThrow('Failed to save background')
  })
})

describe('patchWeights', () => {
  test('PATCHes /api/profile/weights', async () => {
    const weights = { core_mechanism: 2 }
    mockFetch(200, { weights })
    await patchWeights(weights)
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/profile/weights')
    expect(JSON.parse(opts.body).weights).toEqual(weights)
  })

  test('throws on non-200', async () => {
    mockFetch(400)
    await expect(patchWeights({})).rejects.toThrow('Failed to save weights')
  })
})

describe('patchPersonality', () => {
  test('PATCHes /api/profile/personality', async () => {
    mockFetch(200, {})
    await patchPersonality({ strengths: ['strategy'] })
    const [url] = global.fetch.mock.calls[0]
    expect(url).toContain('/profile/personality')
  })

  test('throws on non-200', async () => {
    mockFetch(400)
    await expect(patchPersonality({})).rejects.toThrow('Failed to save personality')
  })
})

describe('patchDimensions', () => {
  test('PATCHes /api/profile/dimensions', async () => {
    mockFetch(200, {})
    await patchDimensions({ leadership: { label: 'L', description: '', weight: 1 } })
    const [url] = global.fetch.mock.calls[0]
    expect(url).toContain('/profile/dimensions')
  })

  test('throws on non-200', async () => {
    mockFetch(400)
    await expect(patchDimensions({})).rejects.toThrow('Failed to save dimensions')
  })
})

describe('regenerateDimensions', () => {
  test('POSTs to /api/profile/dimensions/regenerate', async () => {
    mockFetch(200, { ok: true })
    await regenerateDimensions()
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/dimensions/regenerate')
    expect(opts.method).toBe('POST')
  })

  test('throws on non-200', async () => {
    mockFetch(400)
    await expect(regenerateDimensions()).rejects.toThrow('Failed to regenerate dimensions')
  })
})

describe('fetchRescoreStatus', () => {
  test('GETs /api/rescore-status', async () => {
    mockFetch(200, { running: false, lastTs: null })
    const status = await fetchRescoreStatus()
    expect(status.running).toBe(false)
    const [url] = global.fetch.mock.calls[0]
    expect(url).toContain('/rescore-status')
  })

  test('throws on non-200', async () => {
    mockFetch(500)
    await expect(fetchRescoreStatus()).rejects.toThrow('Failed to fetch rescore status')
  })
})

// ─── Invite endpoints ─────────────────────────────────────────────────────────

describe('fetchInvites', () => {
  test('GETs /api/invites', async () => {
    mockFetch(200, [{ code: 'abc123' }])
    const invites = await fetchInvites()
    expect(invites[0].code).toBe('abc123')
  })

  test('throws on non-200', async () => {
    mockFetch(403)
    await expect(fetchInvites()).rejects.toThrow('Failed to fetch invites')
  })
})

describe('createInvite', () => {
  test('POSTs to /api/invites with expiresInDays', async () => {
    mockFetch(201, { code: 'xyz' })
    const invite = await createInvite(7)
    expect(invite.code).toBe('xyz')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/invites')
    expect(JSON.parse(opts.body).expiresInDays).toBe(7)
  })

  test('defaults to 7 days', async () => {
    mockFetch(201, { code: 'xyz' })
    await createInvite()
    const [, opts] = global.fetch.mock.calls[0]
    expect(JSON.parse(opts.body).expiresInDays).toBe(7)
  })

  test('throws on non-200', async () => {
    mockFetch(400)
    await expect(createInvite()).rejects.toThrow('Failed to create invite')
  })
})

describe('revokeInvite', () => {
  test('DELETEs /api/invites/:code', async () => {
    mockFetch(200, {})
    await revokeInvite('abc123')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/invites/abc123')
    expect(opts.method).toBe('DELETE')
  })

  test('throws on non-200', async () => {
    mockFetch(400)
    await expect(revokeInvite('code')).rejects.toThrow('Failed to revoke invite')
  })
})

describe('redeemInvite', () => {
  test('POSTs to /api/invites/:code/redeem with email', async () => {
    mockFetch(200, { ok: true })
    await redeemInvite('abc123', 'alice@example.com')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/invites/abc123/redeem')
    expect(JSON.parse(opts.body).email).toBe('alice@example.com')
  })
})

// ─── Admin endpoints ──────────────────────────────────────────────────────────

describe('fetchWaitlist', () => {
  test('GETs /api/admin/waitlist', async () => {
    mockFetch(200, [{ id: 'u1' }])
    const list = await fetchWaitlist()
    expect(list[0].id).toBe('u1')
  })

  test('throws on non-200', async () => {
    mockFetch(403)
    await expect(fetchWaitlist()).rejects.toThrow('Failed to fetch waitlist')
  })
})

describe('approveUser', () => {
  test('POSTs to /api/admin/waitlist/:id/approve', async () => {
    mockFetch(200, { ok: true })
    await approveUser('u1')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/waitlist/u1/approve')
    expect(opts.method).toBe('POST')
  })

  test('throws on non-200', async () => {
    mockFetch(404)
    await expect(approveUser('u1')).rejects.toThrow('Failed to approve user')
  })
})

describe('rejectUser', () => {
  test('DELETEs /api/admin/waitlist/:id', async () => {
    mockFetch(200, {})
    await rejectUser('u1')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/waitlist/u1')
    expect(opts.method).toBe('DELETE')
  })

  test('throws on non-200', async () => {
    mockFetch(404)
    await expect(rejectUser('u1')).rejects.toThrow('Failed to reject user')
  })
})

describe('fetchAdminUsers', () => {
  test('GETs /api/admin/users', async () => {
    mockFetch(200, [{ id: 'u3', email: 'active@example.com' }])
    const users = await fetchAdminUsers()
    expect(users[0].email).toBe('active@example.com')
  })

  test('throws on non-200', async () => {
    mockFetch(403)
    await expect(fetchAdminUsers()).rejects.toThrow('Failed to fetch users')
  })
})

describe('deactivateUser', () => {
  test('PATCHes /api/admin/users/:id with status deactivated', async () => {
    mockFetch(200, { ok: true })
    await deactivateUser('u3')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/admin/users/u3')
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body).status).toBe('deactivated')
  })

  test('throws on non-200', async () => {
    mockFetch(404)
    await expect(deactivateUser('u3')).rejects.toThrow('Failed to deactivate user')
  })
})

describe('reactivateUser', () => {
  test('PATCHes /api/admin/users/:id with status active', async () => {
    mockFetch(200, { ok: true })
    await reactivateUser('u3')
    const [, opts] = global.fetch.mock.calls[0]
    expect(JSON.parse(opts.body).status).toBe('active')
  })

  test('throws on non-200', async () => {
    mockFetch(404)
    await expect(reactivateUser('u3')).rejects.toThrow('Failed to reactivate user')
  })
})

describe('fetchScoringQueue', () => {
  test('GETs /api/admin/scoring', async () => {
    mockFetch(200, [])
    const queue = await fetchScoringQueue()
    expect(Array.isArray(queue)).toBe(true)
    const [url] = global.fetch.mock.calls[0]
    expect(url).toContain('/admin/scoring')
  })

  test('throws on non-200', async () => {
    mockFetch(403)
    await expect(fetchScoringQueue()).rejects.toThrow('Failed to fetch scoring queue')
  })
})

// ─── Board endpoints ──────────────────────────────────────────────────────────

describe('fetchBoards', () => {
  test('GETs /api/boards and returns array', async () => {
    mockFetch(200, [{ id: 'b1', name: 'My Board' }])
    const boards = await fetchBoards()
    expect(boards[0].id).toBe('b1')
  })

  test('throws on non-200', async () => {
    mockFetch(500)
    await expect(fetchBoards()).rejects.toThrow('Failed to fetch boards')
  })
})

describe('createBoardApi', () => {
  test('POSTs to /api/boards with name and emoji', async () => {
    mockFetch(201, { id: 'b2', name: 'New Board' })
    const board = await createBoardApi('New Board', '💼')
    expect(board.id).toBe('b2')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/boards')
    const body = JSON.parse(opts.body)
    expect(body.name).toBe('New Board')
    expect(body.emoji).toBe('💼')
  })

  test('throws on non-200', async () => {
    mockFetch(400)
    await expect(createBoardApi('x')).rejects.toThrow('Failed to create board')
  })
})

describe('updateBoardApi', () => {
  test('PATCHes /api/boards/:id with updates', async () => {
    mockFetch(200, {})
    await updateBoardApi('b1', { name: 'Renamed' })
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/boards/b1')
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body).name).toBe('Renamed')
  })

  test('throws on non-200', async () => {
    mockFetch(400)
    await expect(updateBoardApi('b1', {})).rejects.toThrow('Failed to update board')
  })
})

describe('deleteBoardApi', () => {
  test('DELETEs /api/boards/:id', async () => {
    mockFetch(200, {})
    await deleteBoardApi('b1')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/boards/b1')
    expect(opts.method).toBe('DELETE')
  })

  test('throws on non-200', async () => {
    mockFetch(400)
    await expect(deleteBoardApi('b1')).rejects.toThrow('Failed to delete board')
  })
})
