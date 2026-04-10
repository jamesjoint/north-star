import { test, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from '../../../server/scrapers/backstage.js'

const fixture = readFileSync(path.join(process.cwd(), 'tests/fixtures/backstage.html'), 'utf8')

test('parse extracts backstage job fields', () => {
  const jobs = parse(fixture)
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    title: 'Creative Producer',
    company: 'Production House',
    location: 'New York, NY',
    source: 'backstage',
  })
  expect(jobs[0].url).toContain('backstage.com')
})

test('returns empty array for unrecognized HTML', () => {
  expect(parse('<html></html>')).toEqual([])
})

test('skips items without title', () => {
  const html = `<div class="job-listing-item">
    <a class="job-listing-link" href="/jobs/abc">
      <span class="job-listing-name">  </span>
      <span class="job-listing-company">Acme</span>
    </a>
  </div>`
  expect(parse(html)).toHaveLength(0)
})

test('skips items without href', () => {
  const html = `<div class="job-listing-item">
    <a class="job-listing-link">
      <span class="job-listing-name">PM</span>
      <span class="job-listing-company">Acme</span>
    </a>
  </div>`
  expect(parse(html)).toHaveLength(0)
})

test('prepends backstage.com base for relative hrefs', () => {
  const html = `<div class="job-listing-item">
    <a class="job-listing-link" href="/jobs/xyz">
      <span class="job-listing-name">Director</span>
      <span class="job-listing-company">Studio</span>
      <span class="job-listing-location">Remote</span>
    </a>
  </div>`
  const jobs = parse(html)
  expect(jobs[0].url).toBe('https://www.backstage.com/jobs/xyz')
})

test('detects remote from location text', () => {
  const html = `<div class="job-listing-item">
    <a class="job-listing-link" href="/jobs/abc">
      <span class="job-listing-name">PM</span>
      <span class="job-listing-company">Acme</span>
      <span class="job-listing-location">Remote (US)</span>
    </a>
  </div>`
  const jobs = parse(html)
  expect(jobs[0].remote).toBe('remote')
})
