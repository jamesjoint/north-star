import { test, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from '../../../server/scrapers/staffmeup.js'

const fixture = readFileSync(path.join(process.cwd(), 'tests/fixtures/staffmeup.html'), 'utf8')

test('parse extracts staffmeup job fields', () => {
  const jobs = parse(fixture)
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    title: 'Partnerships Manager',
    company: 'MediaCo',
    source: 'staffmeup',
  })
})

test('parse detects hybrid location', () => {
  const html = `<div class="jobs-container"><div class="job-card"><h3 class="job-title"><a href="https://app.staffmeup.com/jobs/foo">Foo</a></h3><div class="company">X</div><div class="location">Hybrid NYC</div><div class="description"></div></div></div>`
  const [job] = parse(html)
  expect(job.remote).toBe('hybrid')
})

test('returns empty array for unrecognized HTML', () => {
  expect(parse('<html></html>')).toEqual([])
})

test('skips items missing title or href', () => {
  const html = `<div class="jobs-container">
    <div class="job-card">
      <h3 class="job-title"><a href="/jobs/abc">  </a></h3>
    </div>
  </div>`
  expect(parse(html)).toHaveLength(0)
})

test('prepends staffmeup base for relative hrefs', () => {
  const html = `<div class="jobs-container">
    <div class="job-card">
      <h3 class="job-title"><a href="/jobs/pm-123">PM Role</a></h3>
      <div class="company">Acme</div>
      <div class="location">Remote</div>
      <div class="description"></div>
    </div>
  </div>`
  const jobs = parse(html)
  expect(jobs[0].url).toBe('https://app.staffmeup.com/jobs/pm-123')
})

test('extracts description text', () => {
  const html = `<div class="jobs-container">
    <div class="job-card">
      <h3 class="job-title"><a href="https://app.staffmeup.com/jobs/1">PM</a></h3>
      <div class="company">Acme</div>
      <div class="description">Lead partnerships across media verticals.</div>
    </div>
  </div>`
  const jobs = parse(html)
  expect(jobs[0].description).toBe('Lead partnerships across media verticals.')
})
