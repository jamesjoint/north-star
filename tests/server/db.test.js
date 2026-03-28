import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { openDb, makeId, upsertJob, updateScore, getAllJobs, getJobById, markSeen } from '../../server/db.js'

const JOB = {
  title: 'Product Manager',
  company: 'Acme',
  location: 'New York, NY',
  remote: 'hybrid',
  url: 'https://example.com/job/1',
  source: 'weworkremotely',
  posted_at: '2026-03-28',
  description: 'Build great products'
}

describe('makeId', () => {
  test('returns same hash for same source+url', () => {
    expect(makeId('linkedin', 'https://x.com/1')).toBe(makeId('linkedin', 'https://x.com/1'))
  })
  test('returns different hash for different url', () => {
    expect(makeId('linkedin', 'https://x.com/1')).not.toBe(makeId('linkedin', 'https://x.com/2'))
  })
})

describe('upsertJob', () => {
  let db
  beforeEach(() => { db = openDb(':memory:') })
  afterEach(() => { db.close() })

  test('inserts a new job and returns its id', () => {
    const id = upsertJob(db, JOB)
    expect(typeof id).toBe('string')
    expect(id.length).toBe(16)
  })

  test('getJobById returns inserted job with seen=0', () => {
    const id = upsertJob(db, JOB)
    const row = getJobById(db, id)
    expect(row.title).toBe('Product Manager')
    expect(row.company).toBe('Acme')
    expect(row.seen).toBe(0)
    expect(row.score_aggregate).toBeNull()
  })

  test('re-upserting same url updates title but preserves score', () => {
    const id = upsertJob(db, JOB)
    updateScore(db, id, 7.5, { core_mechanism: { score: 8, reasoning: 'good' } })
    upsertJob(db, { ...JOB, title: 'Senior PM' })
    const row = getJobById(db, id)
    expect(row.title).toBe('Senior PM')
    expect(row.score_aggregate).toBe(7.5)
  })
})

describe('getAllJobs', () => {
  let db
  beforeEach(() => { db = openDb(':memory:') })
  afterEach(() => { db.close() })

  test('returns jobs sorted by score_aggregate descending, nulls last', () => {
    const id1 = upsertJob(db, { ...JOB, url: 'https://x.com/1', title: 'Low' })
    const id2 = upsertJob(db, { ...JOB, url: 'https://x.com/2', title: 'Unscored' })
    const id3 = upsertJob(db, { ...JOB, url: 'https://x.com/3', title: 'High' })
    updateScore(db, id1, 3.0, {})
    updateScore(db, id3, 9.0, {})
    const jobs = getAllJobs(db)
    expect(jobs[0].title).toBe('High')
    expect(jobs[1].title).toBe('Low')
    expect(jobs[2].title).toBe('Unscored')
  })
})

describe('markSeen', () => {
  let db
  beforeEach(() => { db = openDb(':memory:') })
  afterEach(() => { db.close() })

  test('sets seen to 1', () => {
    const id = upsertJob(db, JOB)
    expect(getJobById(db, id).seen).toBe(0)
    markSeen(db, id)
    expect(getJobById(db, id).seen).toBe(1)
  })
})
