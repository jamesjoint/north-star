import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { createPool, getJobById } from '../../../server/db.js'
import { runAllScrapers } from '../../../server/scrapers/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(path.join(__dirname, '../../../server/db/schema.sql'), 'utf8')

let pool
beforeAll(async () => {
  pool = createPool(process.env.DATABASE_URL_TEST)
  await pool.query(schema)
})
afterAll(() => pool.end())
beforeEach(async () => {
  await pool.query('DELETE FROM job_scores')
  await pool.query('DELETE FROM tracker_entries')
  await pool.query('DELETE FROM boards')
  await pool.query('DELETE FROM jobs')
})

const makeJob = (url) => ({
  title: 'PM', company: 'X', location: 'NYC', remote: 'remote',
  url, source: 'test', posted_at: null, description: 'desc'
})

describe('runAllScrapers', () => {
  test('persists jobs from all scrapers', async () => {
    const scrapers = [
      { scrape: async () => [makeJob('https://a.com/1')] },
      { scrape: async () => [makeJob('https://b.com/1')] },
    ]
    const ids = await runAllScrapers(pool, scrapers)
    expect(ids).toHaveLength(2)
  })

  test('deduplicates same url from two scrapers with same source', async () => {
    const job = makeJob('https://a.com/1')
    const scrapers = [
      { scrape: async () => [job] },
      { scrape: async () => [job] },
    ]
    const ids = await runAllScrapers(pool, scrapers)
    expect(ids).toHaveLength(1)
  })

  test('continues running remaining scrapers when one throws', async () => {
    const scrapers = [
      { scrape: async () => { throw new Error('network error') } },
      { scrape: async () => [makeJob('https://c.com/1')] },
    ]
    const ids = await runAllScrapers(pool, scrapers)
    expect(ids).toHaveLength(1)
  })

  test('returns new job ids only (skips already-existing ids)', async () => {
    const job = makeJob('https://a.com/1')
    const scrapers = [{ scrape: async () => [job] }]
    const first = await runAllScrapers(pool, scrapers)
    const second = await runAllScrapers(pool, scrapers)
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(0) // already in db
  })
})
