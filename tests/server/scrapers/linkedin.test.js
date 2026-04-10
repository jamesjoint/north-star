import { describe, it, expect } from 'vitest'
import { parse } from '../../../server/scrapers/linkedin.js'

const baseElement = {
  title: 'Product Manager',
  companyName: 'TechCorp',
  formattedLocation: 'New York, NY',
  applyUrl: 'https://linkedin.com/jobs/view/123',
  listedAt: 1712534400000, // 2024-04-08T00:00:00Z
  description: { text: 'Job description here' },
}

describe('linkedin parse', () => {
  it('extracts standard fields', () => {
    const [job] = parse([baseElement])
    expect(job).toMatchObject({
      title: 'Product Manager',
      company: 'TechCorp',
      location: 'New York, NY',
      url: 'https://linkedin.com/jobs/view/123',
      source: 'linkedin',
      description: 'Job description here',
    })
  })

  it('formats listedAt timestamp to YYYY-MM-DD', () => {
    const [job] = parse([baseElement])
    expect(job.posted_at).toBe('2024-04-08')
  })

  it('sets posted_at to null when listedAt is absent', () => {
    const [job] = parse([{ ...baseElement, listedAt: undefined }])
    expect(job.posted_at).toBeNull()
  })

  it('falls back to position when title is missing', () => {
    const [job] = parse([{ ...baseElement, title: '', position: 'Head of Product' }])
    expect(job.title).toBe('Head of Product')
  })

  it('falls back to company.name when companyName is missing', () => {
    const [job] = parse([{ ...baseElement, companyName: '', company: { name: 'StartupCo' } }])
    expect(job.company).toBe('StartupCo')
  })

  it('builds LinkedIn URL from entityUrn when applyUrl is missing', () => {
    const el = { ...baseElement, applyUrl: '', entityUrn: 'urn:li:job:987654' }
    const [job] = parse([el])
    expect(job.url).toBe('https://www.linkedin.com/jobs/view/987654/')
  })

  it('falls back to location when formattedLocation is missing', () => {
    const [job] = parse([{ ...baseElement, formattedLocation: '', location: 'Boston, MA' }])
    expect(job.location).toBe('Boston, MA')
  })

  it('defaults location to "New York, NY" when both location fields are missing', () => {
    const [job] = parse([{ ...baseElement, formattedLocation: '', location: '' }])
    expect(job.location).toBe('New York, NY')
  })

  it('detects remote from workplaceType', () => {
    const [job] = parse([{ ...baseElement, workplaceType: 'Remote', formattedLocation: 'San Francisco, CA' }])
    expect(job.remote).toBe('remote')
  })

  it('detects remote from formattedLocation when workplaceType absent', () => {
    const [job] = parse([{ ...baseElement, formattedLocation: 'Remote' }])
    expect(job.remote).toBe('remote')
  })

  it('filters out entries without a title', () => {
    const result = parse([{ ...baseElement, title: '', position: '' }])
    expect(result).toHaveLength(0)
  })

  it('filters out entries without a url', () => {
    const result = parse([{ ...baseElement, applyUrl: '', entityUrn: '' }])
    expect(result).toHaveLength(0)
  })

  it('returns empty array for empty elements', () => {
    expect(parse([])).toEqual([])
  })

  it('handles missing description gracefully', () => {
    const [job] = parse([{ ...baseElement, description: null }])
    expect(job.description).toBe('')
  })
})
