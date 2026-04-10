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
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({
      title: 'Head of Product',
      company: 'StartupCo',
      location: 'New York, NY',
      source: 'themuse',
    })
    expect(jobs[0].url).toContain('themuse.com')
    expect(jobs[0].description).toBe('Lead product at a fast-growing startup.')
  })

  test('paginates correctly across multiple pages', async () => {
    axios.get
      .mockResolvedValueOnce({
        data: {
          results: [{ name: 'Job A', company: { name: 'Co A' }, locations: [{ name: 'NYC' }], refs: { landing_page: 'https://www.themuse.com/jobs/a' }, publication_date: null, contents: '' }],
          page_count: 2,
        }
      })
      .mockResolvedValueOnce({
        data: {
          results: [{ name: 'Job B', company: { name: 'Co B' }, locations: [{ name: 'Remote' }], refs: { landing_page: 'https://www.themuse.com/jobs/b' }, publication_date: null, contents: '' }],
          page_count: 2,
        }
      })
      // Second category pages (return empty to stop quickly)
      .mockResolvedValue({ data: { results: [], page_count: 1 } })

    const { scrape } = await import('../../../server/scrapers/themuse.js?p=' + Date.now())
    const jobs = await scrape()
    // Should have 2 jobs from first category (page 1 + page 2) + 0 from second
    expect(jobs.length).toBeGreaterThanOrEqual(2)
    expect(jobs.map(j => j.title)).toContain('Job A')
    expect(jobs.map(j => j.title)).toContain('Job B')
  })

  test('strips HTML tags from description', async () => {
    axios.get.mockResolvedValue({
      data: {
        results: [{
          name: 'PM',
          company: { name: 'Acme' },
          locations: [{ name: 'New York, NY' }],
          refs: { landing_page: 'https://www.themuse.com/jobs/1' },
          publication_date: null,
          contents: '<p>Lead product.</p><br><strong>Must have:</strong> 5+ years.',
        }],
        total: 1,
        page_count: 1,
      }
    })
    const { scrape } = await import('../../../server/scrapers/themuse.js?html=' + Date.now())
    const jobs = await scrape()
    expect(jobs[0].description).not.toContain('<p>')
    expect(jobs[0].description).toContain('Lead product.')
    expect(jobs[0].description).toContain('Must have:')
  })

  test('sets location to empty string when locations array is empty', async () => {
    axios.get.mockResolvedValue({
      data: {
        results: [{
          name: 'Remote PM',
          company: { name: 'Acme' },
          locations: [],
          refs: { landing_page: 'https://www.themuse.com/jobs/2' },
          publication_date: null,
          contents: '',
        }],
        total: 1,
        page_count: 1,
      }
    })
    const { scrape } = await import('../../../server/scrapers/themuse.js?locs=' + Date.now())
    const jobs = await scrape()
    expect(jobs[0].location).toBe('')
  })

  test('returns empty array when all pages are empty', async () => {
    axios.get.mockResolvedValue({ data: { results: [], page_count: 1 } })
    const { scrape } = await import('../../../server/scrapers/themuse.js?empty=' + Date.now())
    const jobs = await scrape()
    expect(jobs).toEqual([])
  })
})
