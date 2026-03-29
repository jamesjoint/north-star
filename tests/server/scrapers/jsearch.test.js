import { test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('axios')

const MOCK_JOB = {
  job_title: 'Chief of Staff',
  employer_name: 'TechCorp',
  job_city: 'New York',
  job_state: 'NY',
  job_is_remote: false,
  job_apply_link: 'https://example.com/job/1',
  job_description: 'Lead cross-functional initiatives.',
  job_posted_at_datetime_utc: '2026-03-29T00:00:00.000Z',
}

beforeEach(() => { process.env.RAPIDAPI_KEY = 'test-key' })
afterEach(() => { delete process.env.RAPIDAPI_KEY; vi.clearAllMocks() })

test('maps API response fields to job shape and deduplicates across queries', async () => {
  const axios = (await import('axios')).default
  // All 5 queries return the same job — deduplication leaves 1 result
  axios.get = vi.fn().mockResolvedValue({ data: { data: [MOCK_JOB] } })
  const { scrape } = await import('../../../server/scrapers/jsearch.js?t=' + Date.now())
  const jobs = await scrape()
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    title: 'Chief of Staff',
    company: 'TechCorp',
    location: 'New York, NY',
    remote: 'onsite',
    source: 'jsearch',
    url: 'https://example.com/job/1',
    posted_at: '2026-03-29',
  })
  expect(axios.get).toHaveBeenCalledTimes(5)
})

test('returns empty array when RAPIDAPI_KEY is not set', async () => {
  delete process.env.RAPIDAPI_KEY
  const { scrape } = await import('../../../server/scrapers/jsearch.js?t=' + Date.now())
  const jobs = await scrape()
  expect(jobs).toEqual([])
})
