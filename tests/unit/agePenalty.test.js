import { describe, it, expect } from 'vitest'
import { applyAgePenalty } from '../../server/jobUtils.js'

const NOW = new Date('2026-04-09T12:00:00Z').getTime()

function makeJob(overrides = {}) {
  return {
    id: '1',
    title: 'PM',
    score_aggregate: 8.0,
    posted_at: null,
    fetched_at: null,
    ...overrides,
  }
}

describe('applyAgePenalty', () => {
  it('returns job unchanged when score_aggregate is null', () => {
    const job = makeJob({ score_aggregate: null, posted_at: '2025-12-01' })
    expect(applyAgePenalty(job, NOW)).toBe(job)
  })

  it('returns job unchanged when score_aggregate is 0', () => {
    const job = makeJob({ score_aggregate: 0, posted_at: '2025-12-01' })
    expect(applyAgePenalty(job, NOW)).toBe(job)
  })

  it('returns job unchanged when no date is available', () => {
    const job = makeJob({ score_aggregate: 7.5 })
    expect(applyAgePenalty(job, NOW)).toBe(job)
  })

  it('does not penalize a job posted 10 days ago', () => {
    const tenDaysAgo = new Date(NOW - 10 * 86_400_000).toISOString().slice(0, 10)
    const job = makeJob({ score_aggregate: 8.0, posted_at: tenDaysAgo })
    const result = applyAgePenalty(job, NOW)
    expect(result.score_aggregate).toBe(8.0)
    expect(result).toBe(job) // same reference — unchanged
  })

  it('penalizes a job posted 31 days ago by -2', () => {
    const thirtyOneDaysAgo = new Date(NOW - 31 * 86_400_000).toISOString().slice(0, 10)
    const job = makeJob({ score_aggregate: 8.0, posted_at: thirtyOneDaysAgo })
    const result = applyAgePenalty(job, NOW)
    expect(result.score_aggregate).toBe(6.0)
  })

  it('floors penalty at 1 (never below 1)', () => {
    const oldDate = '2025-01-01'
    const job = makeJob({ score_aggregate: 2.5, posted_at: oldDate })
    const result = applyAgePenalty(job, NOW)
    expect(result.score_aggregate).toBe(1)
  })

  it('does not go below 1 for very old jobs with low score', () => {
    const veryOld = '2024-01-01'
    const job = makeJob({ score_aggregate: 1.5, posted_at: veryOld })
    const result = applyAgePenalty(job, NOW)
    expect(result.score_aggregate).toBe(1)
  })

  it('uses fetched_at as fallback when posted_at is null', () => {
    const oldFetchedAt = new Date(NOW - 60 * 86_400_000).toISOString()
    const job = makeJob({ score_aggregate: 7.0, fetched_at: oldFetchedAt })
    const result = applyAgePenalty(job, NOW)
    expect(result.score_aggregate).toBe(5.0)
  })

  it('prefers posted_at over fetched_at', () => {
    const recentPosted = new Date(NOW - 5 * 86_400_000).toISOString().slice(0, 10)
    const oldFetched = new Date(NOW - 60 * 86_400_000).toISOString()
    const job = makeJob({ score_aggregate: 7.0, posted_at: recentPosted, fetched_at: oldFetched })
    const result = applyAgePenalty(job, NOW)
    // recent posted_at → no penalty
    expect(result.score_aggregate).toBe(7.0)
  })

  it('returns a new object (does not mutate the original)', () => {
    const oldDate = '2025-01-01'
    const job = makeJob({ score_aggregate: 8.0, posted_at: oldDate })
    const result = applyAgePenalty(job, NOW)
    expect(result).not.toBe(job)
    expect(job.score_aggregate).toBe(8.0) // original unchanged
    expect(result.score_aggregate).toBe(6.0)
  })
})
