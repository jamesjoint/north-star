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

test('marks job as remote when job_is_remote is true', async () => {
  const axios = (await import('axios')).default
  const remoteJob = { ...MOCK_JOB, job_is_remote: true, job_city: 'New York', job_state: 'NY' }
  axios.get = vi.fn().mockResolvedValue({ data: { data: [remoteJob] } })
  const { scrape } = await import('../../../server/scrapers/jsearch.js?t=' + Date.now())
  const jobs = await scrape()
  expect(jobs[0].remote).toBe('remote')
})

test('skips jobs without a url', async () => {
  const axios = (await import('axios')).default
  const noUrl = { ...MOCK_JOB, job_apply_link: null }
  axios.get = vi.fn().mockResolvedValue({ data: { data: [noUrl, MOCK_JOB] } })
  const { scrape } = await import('../../../server/scrapers/jsearch.js?t=' + Date.now())
  const jobs = await scrape()
  // only the one with a url should be returned
  expect(jobs).toHaveLength(1)
  expect(jobs[0].url).toBe(MOCK_JOB.job_apply_link)
})

test('handles empty data array from API', async () => {
  const axios = (await import('axios')).default
  axios.get = vi.fn().mockResolvedValue({ data: { data: [] } })
  const { scrape } = await import('../../../server/scrapers/jsearch.js?t=' + Date.now())
  const jobs = await scrape()
  expect(jobs).toEqual([])
})

test('continues after a query throws an error', async () => {
  const axios = (await import('axios')).default
  // First query fails, rest return the mock job (all same url → deduped to 1)
  axios.get = vi.fn()
    .mockRejectedValueOnce(new Error('network error'))
    .mockResolvedValue({ data: { data: [MOCK_JOB] } })
  const { scrape } = await import('../../../server/scrapers/jsearch.js?t=' + Date.now())
  const jobs = await scrape()
  // 4 successful queries, all returning the same job → 1 result
  expect(jobs).toHaveLength(1)
})

test('sets posted_at to null when job_posted_at_datetime_utc is absent', async () => {
  const axios = (await import('axios')).default
  const noDate = { ...MOCK_JOB, job_posted_at_datetime_utc: null }
  axios.get = vi.fn().mockResolvedValue({ data: { data: [noDate] } })
  const { scrape } = await import('../../../server/scrapers/jsearch.js?t=' + Date.now())
  const jobs = await scrape()
  expect(jobs[0].posted_at).toBeNull()
})
