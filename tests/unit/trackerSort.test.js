import { describe, it, expect } from 'vitest'
import { sortTrackerJobs } from '../../src/utils/trackerSort.js'

const jobs = [
  { id: 1, company: 'Zenith',   score_aggregate: 8.5, applied_date: '2026-03-01', follow_up_date: '2026-03-10' },
  { id: 2, company: 'Acme',     score_aggregate: 5.0, applied_date: '2026-03-20', follow_up_date: null },
  { id: 3, company: 'Moonbeam', score_aggregate: null, applied_date: null,        follow_up_date: '2026-03-05' },
  { id: 4, company: 'Beta',     score_aggregate: 9.2, applied_date: '2026-04-01', follow_up_date: '2026-04-15' },
]

describe('sortTrackerJobs – applied_desc (default)', () => {
  it('sorts most recent applied_date first', () => {
    const result = sortTrackerJobs(jobs, 'applied_desc')
    expect(result.map(j => j.id)).toEqual([4, 2, 1, 3])
  })

  it('puts nulls last', () => {
    const result = sortTrackerJobs(jobs, 'applied_desc')
    expect(result[result.length - 1].applied_date).toBeNull()
  })

  it('uses applied_desc when sortKey is unknown', () => {
    const result = sortTrackerJobs(jobs, 'bogus_key')
    expect(result.map(j => j.id)).toEqual([4, 2, 1, 3])
  })

  it('two nulls stay stable (return 0)', () => {
    const twoNulls = [
      { id: 'a', applied_date: null },
      { id: 'b', applied_date: null },
    ]
    const result = sortTrackerJobs(twoNulls, 'applied_desc')
    expect(result.map(j => j.id)).toEqual(['a', 'b'])
  })
})

describe('sortTrackerJobs – score_desc', () => {
  it('sorts highest score first', () => {
    const result = sortTrackerJobs(jobs, 'score_desc')
    expect(result[0].id).toBe(4) // 9.2
    expect(result[1].id).toBe(1) // 8.5
    expect(result[2].id).toBe(2) // 5.0
  })

  it('puts null scores last', () => {
    const result = sortTrackerJobs(jobs, 'score_desc')
    expect(result[result.length - 1].score_aggregate).toBeNull()
  })
})

describe('sortTrackerJobs – company_asc', () => {
  it('sorts alphabetically by company', () => {
    const result = sortTrackerJobs(jobs, 'company_asc')
    expect(result.map(j => j.company)).toEqual(['Acme', 'Beta', 'Moonbeam', 'Zenith'])
  })

  it('handles missing company gracefully', () => {
    const withMissing = [{ id: 1, company: 'Beta' }, { id: 2, company: '' }, { id: 3, company: 'Alpha' }]
    const result = sortTrackerJobs(withMissing, 'company_asc')
    expect(result[0].company).toBe('')
    expect(result[1].company).toBe('Alpha')
    expect(result[2].company).toBe('Beta')
  })
})

describe('sortTrackerJobs – followup_asc', () => {
  it('sorts soonest follow_up_date first', () => {
    const result = sortTrackerJobs(jobs, 'followup_asc')
    // id 3 = 2026-03-05, id 1 = 2026-03-10, id 4 = 2026-04-15, id 2 = null
    expect(result[0].id).toBe(3)
    expect(result[1].id).toBe(1)
    expect(result[2].id).toBe(4)
  })

  it('puts null follow_up_date last', () => {
    const result = sortTrackerJobs(jobs, 'followup_asc')
    expect(result[result.length - 1].follow_up_date).toBeNull()
  })

  it('two nulls stay stable', () => {
    const twoNulls = [
      { id: 'x', follow_up_date: null },
      { id: 'y', follow_up_date: null },
    ]
    const result = sortTrackerJobs(twoNulls, 'followup_asc')
    expect(result.map(j => j.id)).toEqual(['x', 'y'])
  })
})

describe('sortTrackerJobs – general', () => {
  it('does not mutate the input array', () => {
    const input = [...jobs]
    sortTrackerJobs(input, 'company_asc')
    expect(input.map(j => j.id)).toEqual(jobs.map(j => j.id))
  })

  it('handles empty array', () => {
    expect(sortTrackerJobs([], 'applied_desc')).toEqual([])
  })

  it('handles single-element array', () => {
    const result = sortTrackerJobs([{ id: 1, applied_date: '2026-01-01' }], 'applied_desc')
    expect(result).toHaveLength(1)
  })

  it('returns stable copy — original array is unchanged for all sort modes', () => {
    const input = [...jobs]
    const original = input.map(j => j.id)
    sortTrackerJobs(input, 'score_desc')
    sortTrackerJobs(input, 'company_asc')
    sortTrackerJobs(input, 'followup_asc')
    expect(input.map(j => j.id)).toEqual(original)
  })
})
