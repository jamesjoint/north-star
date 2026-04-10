import { describe, it, expect } from 'vitest'
import { parse } from '../../../server/scrapers/builtin.js'

function makeJobCard({ title, href, company, remoteText, location }) {
  return `
    <div data-id="job-card">
      <a data-id="job-card-title" href="${href}">${title}</a>
      <span data-id="company-title">${company}</span>
      <div class="d-flex">
        <div class="d-flex gap-sm">
          <i class="fa-house-building"></i>
          <span class="font-barlow">${remoteText}</span>
        </div>
      </div>
      <div class="d-flex">
        <div class="d-flex gap-sm">
          <i class="fa-location-dot"></i>
          <span class="font-barlow">${location}</span>
        </div>
      </div>
    </div>
  `
}

const remoteCard = makeJobCard({
  title: 'Product Manager',
  href: '/jobs/123',
  company: 'TechCorp',
  remoteText: 'Remote',
  location: 'United States',
})

const hybridCard = makeJobCard({
  title: 'Business Analyst',
  href: 'https://builtin.com/jobs/456',
  company: 'StartupCo',
  remoteText: 'Remote or Hybrid',
  location: 'Austin, TX',
})

const onsiteCard = makeJobCard({
  title: 'Operations Lead',
  href: '/jobs/789',
  company: 'OldCo',
  remoteText: 'In-Office',
  location: 'Chicago, IL',
})

const unknownRemoteCard = makeJobCard({
  title: 'Strategy Manager',
  href: '/jobs/999',
  company: 'MysteryInc',
  remoteText: '',
  location: 'Seattle, WA',
})

describe('builtin parse', () => {
  it('extracts title, company, location, and source', () => {
    const jobs = parse(`<html><body>${remoteCard}</body></html>`)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      title: 'Product Manager',
      company: 'TechCorp',
      location: 'United States',
      source: 'builtin',
    })
  })

  it('detects remote work environment', () => {
    const [job] = parse(`<html><body>${remoteCard}</body></html>`)
    expect(job.remote).toBe('remote')
  })

  it('detects hybrid when both remote and hybrid appear in remoteText', () => {
    const [job] = parse(`<html><body>${hybridCard}</body></html>`)
    expect(job.remote).toBe('hybrid')
  })

  it('detects onsite for in-office', () => {
    const [job] = parse(`<html><body>${onsiteCard}</body></html>`)
    expect(job.remote).toBe('onsite')
  })

  it('detects onsite for "on-site" remoteText', () => {
    const card = makeJobCard({ title: 'PM', href: '/jobs/1', company: 'Co', remoteText: 'On-Site', location: 'NYC' })
    const [job] = parse(`<html><body>${card}</body></html>`)
    expect(job.remote).toBe('onsite')
  })

  it('sets remote to "unknown" when work env is not recognizable', () => {
    const [job] = parse(`<html><body>${unknownRemoteCard}</body></html>`)
    expect(job.remote).toBe('unknown')
  })

  it('prepends BASE URL for relative hrefs', () => {
    const [job] = parse(`<html><body>${remoteCard}</body></html>`)
    expect(job.url).toBe('https://builtin.com/jobs/123')
  })

  it('keeps absolute hrefs as-is', () => {
    const [job] = parse(`<html><body>${hybridCard}</body></html>`)
    expect(job.url).toBe('https://builtin.com/jobs/456')
  })

  it('parses multiple job cards', () => {
    const html = `<html><body>${remoteCard}${onsiteCard}</body></html>`
    expect(parse(html)).toHaveLength(2)
  })

  it('skips cards without title', () => {
    const noTitle = makeJobCard({ title: '', href: '/jobs/000', company: 'NoName', remoteText: 'Remote', location: 'Remote' })
    expect(parse(`<html><body>${noTitle}</body></html>`)).toHaveLength(0)
  })

  it('skips cards without href', () => {
    const html = `
      <html><body>
        <div data-id="job-card">
          <a data-id="job-card-title">Title Only No Href</a>
          <span data-id="company-title">Corp</span>
        </div>
      </body></html>`
    expect(parse(html)).toHaveLength(0)
  })

  it('returns empty array for unrecognized HTML', () => {
    expect(parse('<html><body><p>nothing</p></body></html>')).toEqual([])
  })

  it('sets posted_at to null and description to empty string', () => {
    const [job] = parse(`<html><body>${remoteCard}</body></html>`)
    expect(job.posted_at).toBeNull()
    expect(job.description).toBe('')
  })
})
