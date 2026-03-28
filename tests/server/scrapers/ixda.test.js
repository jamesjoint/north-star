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
