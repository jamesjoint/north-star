import { test, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from '../../../server/scrapers/creatoreconomyjobs.js'

const fixture = readFileSync(path.join(process.cwd(), 'tests/fixtures/creatoreconomyjobs.html'), 'utf8')

test('parse extracts creatoreconomyjobs fields', () => {
  const jobs = parse(fixture)
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    title: 'Creator Partnerships Lead',
    company: 'CreatorPlatform',
    remote: 'remote',
    source: 'creatoreconomyjobs',
  })
})

test('returns empty array for unrecognized HTML', () => {
  expect(parse('<html></html>')).toEqual([])
})

test('skips items without title or href', () => {
  const html = `<div class="job-card">
    <a class="job-link" href="/jobs/x"><span class="job-title">  </span></a>
  </div>
  <div class="job-card">
    <a class="job-link"><span class="job-title">Real Job</span><span class="company">Acme</span></a>
  </div>`
  expect(parse(html)).toHaveLength(0)
})

test('prepends base URL for relative hrefs', () => {
  const html = `<div class="job-card">
    <a class="job-link" href="/jobs/creator-lead">
      <span class="job-title">Creator Lead</span>
      <span class="company">PlatformCo</span>
      <span class="location">Remote</span>
    </a>
  </div>`
  const jobs = parse(html)
  expect(jobs[0].url).toBe('https://creatoreconomyjobs.co/jobs/creator-lead')
})

test('extracts description text', () => {
  const html = `<div class="job-card">
    <a class="job-link" href="https://example.com/job/1">
      <span class="job-title">Creator PM</span>
      <span class="company">Corp</span>
      <span class="location">New York</span>
      <span class="description">Lead creator programs.</span>
    </a>
  </div>`
  const jobs = parse(html)
  expect(jobs[0].description).toBe('Lead creator programs.')
})
