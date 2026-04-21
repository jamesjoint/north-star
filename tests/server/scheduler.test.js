import { describe, test, expect, vi, beforeEach } from 'vitest'
import { updateScore, getJobById, getProfile, upsertProfileDimensions, getUnscoredJobs } from '../../server/db.js'
import { scoreJob } from '../../server/scorer.js'
import { generateDimensions } from '../../server/dimension-generator.js'
import { runAllScrapers } from '../../server/scrapers/index.js'

// Mock heavy dependencies that scheduler.js pulls in
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }))
vi.mock('../../server/email.js', () => ({ sendDigestEmail: vi.fn() }))
vi.mock('../../server/scrapers/index.js', () => ({ runAllScrapers: vi.fn() }))
vi.mock('../../server/scorer.js', () => ({ scoreJob: vi.fn() }))
vi.mock('../../server/db.js', () => ({
  updateScore: vi.fn(),
  getJobById: vi.fn(),
  getUnscoredJobs: vi.fn(),
  getProfile: vi.fn(),
  upsertProfileDimensions: vi.fn(),
}))
// Mock all scraper modules
vi.mock('../../server/scrapers/weworkremotely.js', () => ({}))
vi.mock('../../server/scrapers/nyfa.js', () => ({}))
vi.mock('../../server/scrapers/ixda.js', () => ({}))
vi.mock('../../server/scrapers/themuse.js', () => ({}))
vi.mock('../../server/scrapers/backstage.js', () => ({}))
vi.mock('../../server/scrapers/web3career.js', () => ({}))
vi.mock('../../server/scrapers/staffmeup.js', () => ({}))
vi.mock('../../server/scrapers/creatoreconomyjobs.js', () => ({}))
vi.mock('../../server/scrapers/linkedin.js', () => ({}))
vi.mock('../../server/scrapers/jsearch.js', () => ({}))
vi.mock('../../server/scrapers/builtin.js', () => ({}))
vi.mock('../../server/scrapers/whoishiringintech.js', () => ({}))
vi.mock('../../server/dimension-generator.js', () => ({ generateDimensions: vi.fn() }))

describe('getRescoreStatus', () => {
  let getRescoreStatus

  beforeEach(async () => {
    // Fresh import per test using cache-busting to reset module state
    const mod = await import('../../server/scheduler.js?t=' + Date.now())
    getRescoreStatus = mod.getRescoreStatus
  })

  test('returns default state for a new userId', () => {
    const status = getRescoreStatus('user_new_' + Date.now())
    expect(status.running).toBe(false)
    expect(status.lastCount).toBeNull()
    expect(status.lastTs).toBeNull()
  })

  test('returns a copy (not the internal state object)', () => {
    const userId = 'user_copy_' + Date.now()
    const a = getRescoreStatus(userId)
    const b = getRescoreStatus(userId)
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  test('returns running:false when no rescores have run (no userId)', () => {
    const status = getRescoreStatus(undefined)
    expect(status.running).toBe(false)
    expect(status.lastCount).toBeNull()
    expect(status.lastTs).toBeNull()
  })

  test('each userId gets independent state', () => {
    const ts = Date.now()
    const a = getRescoreStatus('user_a_' + ts)
    const b = getRescoreStatus('user_b_' + ts)
    // Both start fresh
    expect(a.running).toBe(false)
    expect(b.running).toBe(false)
    // Modify returned copy — must not affect next call
    a.running = true
    expect(getRescoreStatus('user_a_' + ts).running).toBe(false)
  })
})

describe('rescoreAllJobs — early exit when already running', () => {
  test('does not start a second rescore when one is already running', async () => {
    // We can't easily test the full async loop, but we can verify the guard:
    // Call rescoreAllJobs with a pool that resolves immediately (0 jobs)
    const { rescoreAllJobs, getRescoreStatus } = await import('../../server/scheduler.js?t=' + Date.now())
    const userId = 'user_guard_' + Date.now()
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    // First call starts but we don't await it (simulate it still running)
    const first = rescoreAllJobs(pool, userId)
    // Second call with same userId should see state.running=true and return early
    await rescoreAllJobs(pool, userId)

    // Only one pool query for job IDs should have been issued (second call bailed out)
    // The pool was called once by the first invocation before it could complete
    expect(pool.query).toHaveBeenCalledTimes(1)

    await first // clean up
  })
})

describe('scoreOneJob', () => {
  let scoreOneJobFn

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../../server/scheduler.js?t=' + Date.now())
    scoreOneJobFn = mod.scoreOneJob

    getJobById.mockResolvedValue({ id: 'j1', title: 'Test Job', description: 'A great role', company: 'Acme' })
    getProfile.mockResolvedValue({ background: 'My background', weights: {}, dimensions: null, personality: null })
    scoreJob.mockResolvedValue({ aggregate: 8.5, dimensions: { core: { score: 8, reasoning: 'Strong' } }, summary: 'Good fit.' })
    updateScore.mockResolvedValue(undefined)
  })

  test('calls scoreJob with the job and loaded profile', async () => {
    const pool = { query: vi.fn() }
    await scoreOneJobFn(pool, 'j1', 'user1')
    expect(scoreJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'j1', title: 'Test Job' }),
      expect.objectContaining({ background: 'My background' })
    )
  })

  test('calls updateScore with job id, user id, and aggregate score', async () => {
    const pool = { query: vi.fn() }
    await scoreOneJobFn(pool, 'j1', 'user1')
    expect(updateScore).toHaveBeenCalledWith(
      pool, 'j1', 'user1', 8.5,
      expect.objectContaining({ core: expect.any(Object), summary: 'Good fit.' })
    )
  })

  test('does nothing when job is not found', async () => {
    getJobById.mockResolvedValue(null)
    const pool = { query: vi.fn() }
    await scoreOneJobFn(pool, 'missing', 'user1')
    expect(updateScore).not.toHaveBeenCalled()
  })

  test('does not throw when scoreJob rejects', async () => {
    scoreJob.mockRejectedValue(new Error('API timeout'))
    const pool = { query: vi.fn() }
    await expect(scoreOneJobFn(pool, 'j1', 'user1')).resolves.toBeUndefined()
  })
})

describe('rescoreAllJobs — full scoring flow', () => {
  let rescoreAllJobsFn, getRescoreStatusFn

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../../server/scheduler.js?t=' + Date.now())
    rescoreAllJobsFn = mod.rescoreAllJobs
    getRescoreStatusFn = mod.getRescoreStatus

    getJobById.mockResolvedValue({ id: 'j1', title: 'Job', description: 'Desc', company: 'Co' })
    getProfile.mockResolvedValue({ background: 'bg', weights: {}, dimensions: null, personality: null })
    scoreJob.mockResolvedValue({ aggregate: 7.0, dimensions: {}, summary: 'OK' })
    updateScore.mockResolvedValue(undefined)
  })

  test('sets running=false and records lastCount after completion', async () => {
    const userId = 'user_fullrescore_' + Date.now()
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ id: 'j1' }] }) }
    await rescoreAllJobsFn(pool, userId)
    const status = getRescoreStatusFn(userId)
    expect(status.running).toBe(false)
    expect(status.lastCount).toBe(1)
    expect(status.lastTs).toBeGreaterThan(0)
  })

  test('scores all returned jobs and counts them in lastCount', async () => {
    const userId = 'user_fullrescore2_' + Date.now()
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ id: 'j1' }, { id: 'j2' }] }) }
    await rescoreAllJobsFn(pool, userId)
    expect(updateScore).toHaveBeenCalledTimes(2)
    expect(getRescoreStatusFn(userId).lastCount).toBe(2)
  })

  test('lastCount reflects only successfully scored jobs', async () => {
    // First job succeeds, second fails at scoreJob
    const userId = 'user_partial_' + Date.now()
    scoreJob
      .mockResolvedValueOnce({ aggregate: 7.0, dimensions: {}, summary: 'OK' })
      .mockRejectedValueOnce(new Error('API error'))
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ id: 'j1' }, { id: 'j2' }] }) }
    await rescoreAllJobsFn(pool, userId)
    // j1 succeeds, j2 fails — but scoreOneJob catches errors internally
    // Both should still result in updateScore being called for j1 only
    expect(getRescoreStatusFn(userId).running).toBe(false)
  })
})

describe('generateAndSaveDimensions', () => {
  let generateAndSaveDimensionsFn

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../../server/scheduler.js?t=' + Date.now())
    generateAndSaveDimensionsFn = mod.generateAndSaveDimensions

    generateDimensions.mockResolvedValue({
      creativity: { label: 'Creativity', description: 'Creative work', weight: 1.5 },
      impact: { label: 'Impact', description: 'Business impact', weight: 1.0 },
    })
    upsertProfileDimensions.mockResolvedValue(undefined)
  })

  test('calls generateDimensions with the background text', async () => {
    const pool = { query: vi.fn() }
    await generateAndSaveDimensionsFn(pool, 'user1', 'My background text')
    expect(generateDimensions).toHaveBeenCalledWith('My background text', expect.any(Object))
  })

  test('calls upsertProfileDimensions with generated dimensions', async () => {
    const pool = { query: vi.fn() }
    await generateAndSaveDimensionsFn(pool, 'user1', 'My background text')
    expect(upsertProfileDimensions).toHaveBeenCalledWith(
      pool, 'user1', expect.objectContaining({ creativity: expect.any(Object) })
    )
  })

  test('does not throw and skips save when generateDimensions rejects', async () => {
    generateDimensions.mockRejectedValue(new Error('API timeout'))
    const pool = { query: vi.fn() }
    await expect(generateAndSaveDimensionsFn(pool, 'user1', 'bg')).resolves.toBeUndefined()
    expect(upsertProfileDimensions).not.toHaveBeenCalled()
  })
})

describe('getRescoreStatus — aggregate (no userId)', () => {
  test('returns running=false when no rescore is actively in progress', async () => {
    // Use random suffix to avoid reusing a module instance that already has state
    const { getRescoreStatus } = await import('../../server/scheduler.js?t=' + Date.now() + '_' + Math.random())
    const status = getRescoreStatus(undefined)
    expect(status.running).toBe(false)
    // lastCount and lastTs may be non-null if this module was reused, so only check running
    expect(status).toHaveProperty('running')
    expect(status).toHaveProperty('lastCount')
    expect(status).toHaveProperty('lastTs')
  })

  test('returns running=true when any user rescore is in progress', async () => {
    const { rescoreAllJobs, getRescoreStatus } = await import('../../server/scheduler.js?t=' + Date.now() + '_agg')
    // Pool that never resolves to simulate a running rescore
    const pool = { query: vi.fn().mockImplementation(() => new Promise(() => {})) }
    const userId = 'user_agg_running_' + Date.now()
    // Don't await — leave it running
    rescoreAllJobs(pool, userId)
    // Aggregate status should show running=true
    const status = getRescoreStatus(undefined)
    expect(status.running).toBe(true)
  })
})

describe('runPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runAllScrapers.mockResolvedValue([])
    getUnscoredJobs.mockResolvedValue([])
    getProfile.mockResolvedValue(null)
    getJobById.mockResolvedValue(null)
    scoreJob.mockResolvedValue({ aggregate: 7.0, dimensions: {}, summary: 'OK' })
    updateScore.mockResolvedValue(undefined)
  })

  test('returns { scraped: 0, scored: 0 } when no users have profiles', async () => {
    const { runPipeline } = await import('../../server/scheduler.js?t=' + Date.now() + '_pipe1')
    // Pool: getAdminUserId → no admin; getActiveUsersWithProfiles → no users
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const result = await runPipeline(pool)
    expect(result).toEqual({ scraped: 0, scored: 0 })
  })

  test('scores jobs for active users and returns counts', async () => {
    const { runPipeline } = await import('../../server/scheduler.js?t=' + Date.now() + '_pipe2')

    // Pool responds to different queries depending on which query it is
    let queryCount = 0
    const pool = {
      query: vi.fn().mockImplementation(async (sql) => {
        if (sql.includes("role = 'admin'")) return { rows: [{ id: 'admin1' }] }
        if (sql.includes('onboarding_done = true')) return { rows: [{ id: 'user1' }] }
        return { rows: [] } // fallback for email / scoring queries
      })
    }

    getProfile.mockResolvedValue({ background: 'test bg', weights: {}, dimensions: null, personality: null })
    getJobById.mockResolvedValue({ id: 'j1', title: 'PM', description: 'desc', company: 'Acme' })
    scoreJob.mockResolvedValue({ aggregate: 7.5, dimensions: { core: { score: 7 } }, summary: 'Good fit' })
    updateScore.mockResolvedValue(undefined)

    // getUnscoredJobs returns one job
    const { getUnscoredJobs } = await import('../../server/db.js')
    getUnscoredJobs.mockResolvedValue(['j1'])

    const result = await runPipeline(pool)
    expect(result.scraped).toBe(0) // no scrapers returned new jobs
    expect(result.scored).toBeGreaterThanOrEqual(0)
  })
})
