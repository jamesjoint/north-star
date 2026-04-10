import { describe, it, expect } from 'vitest'
import { applyFilters, isDefaultFilters, DEFAULT_FILTERS } from '../../src/utils/filters.js'

function job(overrides = {}) {
  return {
    id: 'j1',
    title: 'Product Manager',
    company: 'Acme',
    location: 'New York, NY',
    remote: 'hybrid',
    source: 'weworkremotely',
    score_aggregate: 7,
    status: null,
    description: 'Great role',
    posted_at: '2026-03-01',
    ...overrides,
  }
}

describe('applyFilters — filtering', () => {
  it('returns all jobs when filters are default', () => {
    const jobs = [job({ id: '1' }), job({ id: '2' })]
    expect(applyFilters(jobs, DEFAULT_FILTERS)).toHaveLength(2)
  })

  it('hides Expired jobs by default (showExpired=false)', () => {
    const jobs = [job({ status: 'Expired' }), job({ id: 'j2', status: 'Applied' })]
    const result = applyFilters(jobs, DEFAULT_FILTERS)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('j2')
  })

  it('shows Expired jobs when showExpired=true', () => {
    const jobs = [job({ status: 'Expired' }), job({ id: 'j2' })]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, showExpired: true })
    expect(result).toHaveLength(2)
  })

  it('shows Expired jobs when statusFilter is "Expired" even without showExpired', () => {
    const jobs = [job({ status: 'Expired' }), job({ id: 'j2', status: 'Applied' })]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, statusFilter: 'Expired' })
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('Expired')
  })

  it('filters by source chip', () => {
    const jobs = [job({ source: 'linkedin' }), job({ id: 'j2', source: 'nyfa' })]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, sources: ['linkedin'] })
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('linkedin')
  })

  it('filters by remote type', () => {
    const jobs = [job({ remote: 'remote' }), job({ id: 'j2', remote: 'onsite' })]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, remote: 'remote' })
    expect(result).toHaveLength(1)
    expect(result[0].remote).toBe('remote')
  })

  it('filters by minScore (excludes null scores when minScore > 0)', () => {
    const jobs = [
      job({ id: 'j1', score_aggregate: 8 }),
      job({ id: 'j2', score_aggregate: 4 }),
      job({ id: 'j3', score_aggregate: null }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, minScore: 6 })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('j1')
  })

  it('minScore=0 includes jobs with null score', () => {
    const jobs = [job({ score_aggregate: null })]
    expect(applyFilters(jobs, DEFAULT_FILTERS)).toHaveLength(1)
  })

  it('statusFilter="untracked" excludes jobs that have a status', () => {
    const jobs = [
      job({ id: 'j1', status: null }),
      job({ id: 'j2', status: 'Applied' }),
      job({ id: 'j3', status: 'Saved' }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, statusFilter: 'untracked' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('j1')
  })

  it('statusFilter="Applied" shows only Applied jobs', () => {
    const jobs = [
      job({ id: 'j1', status: 'Applied' }),
      job({ id: 'j2', status: 'Saved' }),
      job({ id: 'j3', status: null }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, statusFilter: 'Applied' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('j1')
  })

  it('location filter is case-insensitive substring match', () => {
    const jobs = [
      job({ id: 'j1', location: 'New York, NY' }),
      job({ id: 'j2', location: 'San Francisco, CA' }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, location: 'new york' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('j1')
  })

  it('query matches job title (case-insensitive)', () => {
    const jobs = [
      job({ id: 'j1', title: 'Product Manager', company: 'Acme' }),
      job({ id: 'j2', title: 'Software Engineer', company: 'Zephyr' }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, query: 'product' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('j1')
  })

  it('query matches company name', () => {
    const jobs = [
      job({ id: 'j1', company: 'Acme Corp' }),
      job({ id: 'j2', company: 'Zephyr Inc' }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, query: 'zephyr' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('j2')
  })

  it('empty query shows all jobs', () => {
    const jobs = [job({ id: 'j1' }), job({ id: 'j2' })]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, query: '' })
    expect(result).toHaveLength(2)
  })

  it('location filter returns empty array when no jobs match', () => {
    const jobs = [job({ id: 'j1', location: 'San Francisco, CA' })]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, location: 'new york' })
    expect(result).toHaveLength(0)
  })

  it('hideNoJD hides jobs with empty description', () => {
    const jobs = [
      job({ id: 'j1', description: 'Full JD here' }),
      job({ id: 'j2', description: '' }),
      job({ id: 'j3', description: '   ' }),
      job({ id: 'j4', description: null }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, hideNoJD: true })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('j1')
  })
})

describe('applyFilters — sorting', () => {
  it('score_desc sorts highest score first, nulls last', () => {
    const jobs = [
      job({ id: 'j1', score_aggregate: 5 }),
      job({ id: 'j2', score_aggregate: 9 }),
      job({ id: 'j3', score_aggregate: null }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, sort: 'score_desc' })
    expect(result.map(j => j.id)).toEqual(['j2', 'j1', 'j3'])
  })

  it('score_asc sorts lowest score first, nulls last', () => {
    const jobs = [
      job({ id: 'j1', score_aggregate: 5 }),
      job({ id: 'j2', score_aggregate: 9 }),
      job({ id: 'j3', score_aggregate: null }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, sort: 'score_asc' })
    expect(result.map(j => j.id)).toEqual(['j1', 'j2', 'j3'])
  })

  it('newest sorts most recent posted_at first', () => {
    const jobs = [
      job({ id: 'j1', posted_at: '2026-01-01' }),
      job({ id: 'j2', posted_at: '2026-03-15' }),
      job({ id: 'j3', posted_at: '2026-02-01' }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, sort: 'newest' })
    expect(result.map(j => j.id)).toEqual(['j2', 'j3', 'j1'])
  })

  it('oldest sorts oldest posted_at first', () => {
    const jobs = [
      job({ id: 'j1', posted_at: '2026-01-01' }),
      job({ id: 'j2', posted_at: '2026-03-15' }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, sort: 'oldest' })
    expect(result.map(j => j.id)).toEqual(['j1', 'j2'])
  })

  it('company_asc sorts alphabetically by company', () => {
    const jobs = [
      job({ id: 'j1', company: 'Zephyr' }),
      job({ id: 'j2', company: 'Acme' }),
      job({ id: 'j3', company: 'Meridian' }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, sort: 'company_asc' })
    expect(result.map(j => j.id)).toEqual(['j2', 'j3', 'j1'])
  })

  it('newest falls back to fetched_at when posted_at is null', () => {
    const jobs = [
      job({ id: 'j1', posted_at: null, fetched_at: '2026-01-01T12:00:00Z' }),
      job({ id: 'j2', posted_at: null, fetched_at: '2026-03-15T12:00:00Z' }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, sort: 'newest' })
    expect(result.map(j => j.id)).toEqual(['j2', 'j1'])
  })
})

describe('applyFilters — statusFilter edge cases', () => {
  it('statusFilter="untracked" keeps jobs with status=none', () => {
    const jobs = [
      job({ id: 'j1', status: 'none' }),
      job({ id: 'j2', status: null }),
      job({ id: 'j3', status: 'Saved' }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, statusFilter: 'untracked' })
    // status=none and status=null are both untracked
    expect(result.map(j => j.id).sort()).toEqual(['j1', 'j2'])
  })

  it('multiple sources filters to jobs matching any of them', () => {
    const jobs = [
      job({ id: 'j1', source: 'linkedin' }),
      job({ id: 'j2', source: 'nyfa' }),
      job({ id: 'j3', source: 'weworkremotely' }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, sources: ['linkedin', 'nyfa'] })
    expect(result.map(j => j.id).sort()).toEqual(['j1', 'j2'])
  })
})

describe('isDefaultFilters', () => {
  it('returns true when all filters are at their defaults', () => {
    expect(isDefaultFilters(DEFAULT_FILTERS)).toBe(true)
  })

  it('returns false when a source is active', () => {
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, sources: ['linkedin'] })).toBe(false)
  })

  it('returns false when remote is not "all"', () => {
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, remote: 'remote' })).toBe(false)
  })

  it('returns false when minScore > 0', () => {
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, minScore: 5 })).toBe(false)
  })

  it('returns false when showExpired is true', () => {
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, showExpired: true })).toBe(false)
  })

  it('returns false when sort is not score_desc', () => {
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, sort: 'newest' })).toBe(false)
  })

  it('returns false when statusFilter is not "all"', () => {
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, statusFilter: 'Applied' })).toBe(false)
  })

  it('returns false when query is non-empty', () => {
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, query: 'product' })).toBe(false)
  })

  it('returns false when hideNoJD is true', () => {
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, hideNoJD: true })).toBe(false)
  })

  it('returns false when location is non-empty', () => {
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, location: 'New York' })).toBe(false)
  })
})

describe('applyFilters — sort edge cases', () => {
  it('oldest falls back to fetched_at when posted_at is null', () => {
    const jobs = [
      job({ id: 'j1', posted_at: null, fetched_at: '2026-01-01T12:00:00Z' }),
      job({ id: 'j2', posted_at: null, fetched_at: '2026-03-15T12:00:00Z' }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, sort: 'oldest' })
    expect(result.map(j => j.id)).toEqual(['j1', 'j2'])
  })

  it('oldest treats jobs with no date as earliest (sorted last in oldest view)', () => {
    // When neither posted_at nor fetched_at is present, date string is '' which sorts
    // alphabetically before any real date, so those jobs appear first in oldest sort
    const jobs = [
      job({ id: 'j1', posted_at: '2026-03-15', fetched_at: null }),
      job({ id: 'j2', posted_at: null, fetched_at: null }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, sort: 'oldest' })
    // '' < '2026-...' lexicographically, so j2 (no date) comes first in 'oldest'
    expect(result[0].id).toBe('j2')
    expect(result[1].id).toBe('j1')
  })

  it('score_desc falls back to -1 for null scores so nulls sort last', () => {
    const jobs = [
      job({ id: 'j1', score_aggregate: null }),
      job({ id: 'j2', score_aggregate: 3 }),
      job({ id: 'j3', score_aggregate: 9 }),
    ]
    const result = applyFilters(jobs, DEFAULT_FILTERS)
    expect(result[0].id).toBe('j3')
    expect(result[result.length - 1].id).toBe('j1')
  })

  it('score_asc uses 11 as sentinel for null scores so nulls sort last', () => {
    const jobs = [
      job({ id: 'j1', score_aggregate: null }),
      job({ id: 'j2', score_aggregate: 3 }),
      job({ id: 'j3', score_aggregate: 9 }),
    ]
    const result = applyFilters(jobs, { ...DEFAULT_FILTERS, sort: 'score_asc' })
    expect(result[0].id).toBe('j2')
    expect(result[result.length - 1].id).toBe('j1')
  })
})
