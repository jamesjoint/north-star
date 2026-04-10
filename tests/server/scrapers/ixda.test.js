import { test, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from '../../../server/scrapers/ixda.js'

const fixture = readFileSync(
  path.join(process.cwd(), 'tests/fixtures/ixda.html'), 'utf8'
)

test('parse extracts job fields from HTML', () => {
  const jobs = parse(fixture)
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    title: 'Head of Product',
    company: 'Design Co',
    source: 'ixda',
  })
  expect(jobs[0].url).toMatch(/^https:\/\//)
})

test('parse detects hybrid location', () => {
  const html = `<div class="jobs-list">
    <div class="job-item">
      <h2 class="job-title"><a href="https://ixda.org/jobs/bar">Bar Job</a></h2>
      <span class="company">Y Inc</span>
      <span class="location">Hybrid NYC</span>
      <div class="description">desc</div>
    </div>
  </div>`
  const [job] = parse(html)
  expect(job.remote).toBe('hybrid')
})

test('returns empty array for unrecognized HTML', () => { expect(parse('<html></html>')).toEqual([]) })

test('skips items without title or href', () => {
  const html = `<div class="jobs-list">
    <div class="job-item">
      <h2 class="job-title"><a href="/jobs/abc">  </a></h2>
      <span class="company">Acme</span>
    </div>
  </div>`
  expect(parse(html)).toHaveLength(0)
})

test('prepends ixda.org for relative hrefs', () => {
  const html = `<div class="jobs-list">
    <div class="job-item">
      <h2 class="job-title"><a href="/jobs/xyz">UX Lead</a></h2>
      <span class="company">Design Co</span>
      <span class="location">Remote</span>
    </div>
  </div>`
  const jobs = parse(html)
  expect(jobs[0].url).toBe('https://ixda.org/jobs/xyz')
})

test('extracts description from .description element', () => {
  const html = `<div class="jobs-list">
    <div class="job-item">
      <h2 class="job-title"><a href="https://ixda.org/jobs/1">UX Designer</a></h2>
      <span class="company">Agency</span>
      <div class="description">Create engaging experiences.</div>
    </div>
  </div>`
  const jobs = parse(html)
  expect(jobs[0].description).toBe('Create engaging experiences.')
})
