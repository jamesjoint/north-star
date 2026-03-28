import { describe, test, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'

vi.mock('axios')

describe('themuse scraper', () => {
  beforeEach(() => vi.clearAllMocks())

  test('maps API response to job shape', async () => {
    axios.get.mockResolvedValue({
      data: {
        results: [
          {
            name: 'Head of Product',
            company: { name: 'StartupCo' },
            locations: [{ name: 'New York, NY' }],
            refs: { landing_page: 'https://www.themuse.com/jobs/startupco/head-of-product' },
            publication_date: '2026-03-27T00:00:00Z',
            contents: '<p>Lead product at a fast-growing startup.</p>',
          }
        ],
        total: 1,
        page_count: 1,
      }
    })

    const { scrape } = await import('../../../server/scrapers/themuse.js')
    const jobs = await scrape()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      title: 'Head of Product',
      company: 'StartupCo',
      location: 'New York, NY',
      source: 'themuse',
    })
    expect(jobs[0].url).toContain('themuse.com')
  })
})
