import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { openDb, getJobById } from '../../../server/db.js'
import { runAllScrapers } from '../../../server/scrapers/index.js'

const makeJob = (url) => ({
  title: 'PM', company: 'X', location: 'NYC', remote: 'remote',
  url, source: 'test', posted_at: null, description: 'desc'
})

describe('runAllScrapers', () => {
  let db
  beforeEach(() => { db = openDb(':memory:') })
  afterEach(() => { db.close() })

  test('persists jobs from all scrapers', async () => {
    const scrapers = [
      { scrape: async () => [makeJob('https://a.com/1')] },
      { scrape: async () => [makeJob('https://b.com/1')] },
    ]
    const ids = await runAllScrapers(db, scrapers)
    expect(ids).toHaveLength(2)
  })

  test('deduplicates same url from two scrapers with same source', async () => {
    const job = makeJob('https://a.com/1')
    const scrapers = [
      { scrape: async () => [job] },
      { scrape: async () => [job] },
    ]
    const ids = await runAllScrapers(db, scrapers)
    expect(ids).toHaveLength(1)
  })

  test('continues running remaining scrapers when one throws', async () => {
    const scrapers = [
      { scrape: async () => { throw new Error('network error') } },
      { scrape: async () => [makeJob('https://c.com/1')] },
    ]
    const ids = await runAllScrapers(db, scrapers)
    expect(ids).toHaveLength(1)
  })

  test('returns new job ids only (skips already-existing ids)', async () => {
    const job = makeJob('https://a.com/1')
    const scrapers = [{ scrape: async () => [job] }]
    const first = await runAllScrapers(db, scrapers)
    const second = await runAllScrapers(db, scrapers)
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(0) // already in db
  })
})
