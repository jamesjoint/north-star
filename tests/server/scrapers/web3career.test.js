import { test, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from '../../../server/scrapers/web3career.js'

const fixture = readFileSync(path.join(process.cwd(), 'tests/fixtures/web3career.html'), 'utf8')

test('parse extracts web3career job fields', () => {
  const jobs = parse(fixture)
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    title: 'Web3 Product Manager',
    company: 'DAO Labs',
    remote: 'remote',
    source: 'web3career',
  })
})

test('returns empty array for unrecognized HTML', () => {
  expect(parse('<html></html>')).toEqual([])
})

test('skips items missing title or href', () => {
  const html = `<div class="job-card">
    <h2><a href="/jobs/abc">  </a></h2>
    <span class="company-name">Acme</span>
  </div>`
  expect(parse(html)).toHaveLength(0)
})

test('prepends base URL for relative hrefs', () => {
  const html = `<div class="job-card">
    <a class="job-title-link" href="/web3-pm-jobs">Web3 PM</a>
    <span class="company-name">DAO</span>
    <span class="job-location">Remote</span>
  </div>`
  const jobs = parse(html)
  expect(jobs[0].url).toBe('https://web3.career/web3-pm-jobs')
})

test('extracts description from .job-description element', () => {
  const html = `<div class="job-card">
    <a class="job-title-link" href="/jobs/pm-1">PM Role</a>
    <span class="company-name">Acme</span>
    <span class="job-description">Build the future of DeFi.</span>
  </div>`
  const jobs = parse(html)
  expect(jobs[0].description).toBe('Build the future of DeFi.')
})

test('sets description to empty string when element is absent', () => {
  const html = `<div class="job-card">
    <a class="job-title-link" href="/jobs/pm-2">PM Role 2</a>
    <span class="company-name">Acme</span>
  </div>`
  const jobs = parse(html)
  expect(jobs[0].description).toBe('')
})
