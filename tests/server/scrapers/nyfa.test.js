import { test, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from '../../../server/scrapers/nyfa.js'

const fixture = readFileSync(
  path.join(process.cwd(), 'tests/fixtures/nyfa.html'), 'utf8'
)

test('parse extracts job fields from HTML', () => {
  const jobs = parse(fixture)
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    title: 'Product Director',
    company: 'Film Studio',
    source: 'nyfa',
  })
  expect(jobs[0].url).toMatch(/^https:\/\//)
})

test('parse detects hybrid location', () => {
  const html = `<div class="job-listings">
    <div class="job-listing">
      <h3 class="job-title"><a href="https://nyfa.org/jobs/foo">Foo Job</a></h3>
      <div class="company-name">X Corp</div>
      <div class="job-location">Hybrid - New York</div>
      <div class="job-description">desc</div>
    </div>
  </div>`
  const [job] = parse(html)
  expect(job.remote).toBe('hybrid')
})

test('returns empty array for unrecognized HTML', () => { expect(parse('<html></html>')).toEqual([]) })

test('falls back to "New York, NY" when location is empty', () => {
  const html = `<div class="job-listings">
    <div class="job-listing">
      <h3 class="job-title"><a href="https://nyfa.org/jobs/abc">Program Director</a></h3>
      <div class="company-name">Arts Corp</div>
      <div class="job-location"></div>
      <div class="job-description">desc</div>
    </div>
  </div>`
  const jobs = parse(html)
  expect(jobs[0].location).toBe('New York, NY')
})

test('prepends BASE for relative hrefs', () => {
  const html = `<div class="job-listings">
    <div class="job-listing">
      <h3 class="job-title"><a href="/jobs/xyz">PM</a></h3>
      <div class="company-name">Studio</div>
      <div class="job-location">Remote</div>
    </div>
  </div>`
  const jobs = parse(html)
  expect(jobs[0].url).toBe('https://www.nyfa.org/jobs/xyz')
})

test('includes job description text', () => {
  const html = `<div class="job-listings">
    <div class="job-listing">
      <h3 class="job-title"><a href="https://nyfa.org/jobs/abc">Director</a></h3>
      <div class="company-name">Corp</div>
      <div class="job-location">New York, NY</div>
      <div class="job-description">Lead the creative team.</div>
    </div>
  </div>`
  const jobs = parse(html)
  expect(jobs[0].description).toBe('Lead the creative team.')
})
