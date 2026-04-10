import { describe, it, expect } from 'vitest'
import { computeStats, convRate } from '../../src/utils/stats.js'

// Fixed "now" for deterministic date tests
const NOW = new Date('2026-04-08T12:00:00Z')

function job(overrides = {}) {
  return { id: 'j1', status: 'Applied', applied_date: null, ...overrides }
}

describe('computeStats', () => {
  it('returns zeros for empty job list', () => {
    const stats = computeStats([], NOW)
    expect(stats.appliedCount).toBe(0)
    expect(stats.interviewingCount).toBe(0)
    expect(stats.offerCount).toBe(0)
    expect(stats.appliedThisWeek).toBe(0)
    expect(stats.appliedThisMonth).toBe(0)
    expect(stats.byStatus).toEqual({})
  })

  it('counts jobs by status correctly', () => {
    const jobs = [
      job({ status: 'Applied' }),
      job({ id: 'j2', status: 'Applied' }),
      job({ id: 'j3', status: 'Interviewing' }),
      job({ id: 'j4', status: 'Offer' }),
      job({ id: 'j5', status: 'Saved' }),
    ]
    const stats = computeStats(jobs, NOW)
    expect(stats.appliedCount).toBe(2)
    expect(stats.interviewingCount).toBe(1)
    expect(stats.offerCount).toBe(1)
    expect(stats.byStatus['Saved']).toBe(1)
  })

  it('excludes jobs with null or "none" status', () => {
    const jobs = [
      job({ status: null }),
      job({ id: 'j2', status: 'none' }),
      job({ id: 'j3', status: 'Applied' }),
    ]
    const stats = computeStats(jobs, NOW)
    expect(stats.appliedCount).toBe(1)
  })

  it('counts appliedThisWeek correctly', () => {
    const jobs = [
      // Within the last 7 days
      job({ id: 'j1', applied_date: '2026-04-06' }), // 2 days ago
      job({ id: 'j2', applied_date: '2026-04-08' }), // today
      // Older than 7 days
      job({ id: 'j3', applied_date: '2026-03-28' }), // 11 days ago
      // No applied_date
      job({ id: 'j4', applied_date: null }),
    ]
    const stats = computeStats(jobs, NOW)
    expect(stats.appliedThisWeek).toBe(2)
  })

  it('includes a job applied exactly 7 days ago in appliedThisWeek', () => {
    // NOW = 2026-04-08; weekAgo = 2026-04-01 (7 * 86400s back)
    const jobs = [job({ applied_date: '2026-04-01' })]
    expect(computeStats(jobs, NOW).appliedThisWeek).toBe(1)
  })

  it('excludes a job applied 8 days ago from appliedThisWeek', () => {
    const jobs = [job({ applied_date: '2026-03-31' })]
    expect(computeStats(jobs, NOW).appliedThisWeek).toBe(0)
  })

  it('counts appliedThisMonth correctly', () => {
    const jobs = [
      job({ id: 'j1', applied_date: '2026-04-01' }),  // within 30 days
      job({ id: 'j2', applied_date: '2026-03-20' }),  // within 30 days (19 days ago)
      job({ id: 'j3', applied_date: '2026-03-01' }),  // more than 30 days ago
      job({ id: 'j4', applied_date: '2026-01-01' }),  // much older
    ]
    const stats = computeStats(jobs, NOW)
    expect(stats.appliedThisMonth).toBe(2)
  })

  it('includes a job applied exactly 30 days ago in appliedThisMonth', () => {
    // NOW = 2026-04-08; monthAgo = 2026-03-09 (30 * 86400s back)
    const jobs = [job({ applied_date: '2026-03-09' })]
    expect(computeStats(jobs, NOW).appliedThisMonth).toBe(1)
  })

  it('excludes a job applied 31 days ago from appliedThisMonth', () => {
    const jobs = [job({ applied_date: '2026-03-08' })]
    expect(computeStats(jobs, NOW).appliedThisMonth).toBe(0)
  })
})

describe('computeStats — status and tracking edge cases', () => {
  it('includes Expired jobs in byStatus', () => {
    const jobs = [
      job({ status: 'Applied' }),
      job({ id: 'j2', status: 'Expired' }),
      job({ id: 'j3', status: 'Passed' }),
    ]
    const stats = computeStats(jobs, NOW)
    expect(stats.byStatus['Expired']).toBe(1)
    expect(stats.byStatus['Passed']).toBe(1)
  })

  it('appliedThisWeek ignores jobs with applied_date but null status', () => {
    // status=null means untracked — should NOT be included in appliedThisWeek
    const jobs = [
      job({ status: null, applied_date: '2026-04-08' }),
    ]
    const stats = computeStats(jobs, NOW)
    expect(stats.appliedThisWeek).toBe(0)
  })

  it('appliedThisWeek counts Interviewing jobs that have applied_date', () => {
    // Someone who moved from Applied → Interviewing preserves their applied_date
    const jobs = [
      job({ id: 'j1', status: 'Interviewing', applied_date: '2026-04-07' }),
    ]
    const stats = computeStats(jobs, NOW)
    expect(stats.appliedThisWeek).toBe(1)
  })
})

describe('convRate', () => {
  it('returns em-dash when denominator is 0', () => {
    expect(convRate(0, 0)).toBe('—')
    expect(convRate(5, 0)).toBe('—')
  })

  it('returns 0% when numerator is 0', () => {
    expect(convRate(0, 10)).toBe('0%')
  })

  it('returns 100% when all applied got interviews', () => {
    expect(convRate(5, 5)).toBe('100%')
  })

  it('rounds to nearest percent', () => {
    expect(convRate(1, 3)).toBe('33%')
    expect(convRate(2, 3)).toBe('67%')
  })

  it('handles typical conversion rates', () => {
    expect(convRate(3, 10)).toBe('30%')
    expect(convRate(1, 7)).toBe('14%')
  })
})
