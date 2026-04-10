import { test, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from '../../../server/scrapers/weworkremotely.js'

const fixture = readFileSync(
  path.join(process.cwd(), 'tests/fixtures/weworkremotely.html'), 'utf8'
)

test('parse extracts job fields from HTML', () => {
  const jobs = parse(fixture)
  expect(jobs).toHaveLength(2)
  expect(jobs[0]).toMatchObject({
    title: 'Product Manager',
    company: 'Acme Corp',
    remote: 'remote',
    source: 'weworkremotely',
  })
  expect(jobs[0].url).toMatch(/^https:\/\/weworkremotely\.com/)
})

test('returns empty array for unrecognized HTML', () => { expect(parse('<html></html>')).toEqual([]) })

test('skips items with no href or href="#"', () => {
  const html = `<section class="jobs"><ul>
    <li><a href="#"><span class="title">Phantom</span><span class="company">Ghost Inc</span></a></li>
    <li><a href="/jobs/abc"><span class="title">Real Job</span><span class="company">Acme</span></a></li>
  </ul></section>`
  const jobs = parse(html)
  expect(jobs).toHaveLength(1)
  expect(jobs[0].title).toBe('Real Job')
})

test('skips items with empty title', () => {
  const html = `<section class="jobs"><ul>
    <li><a href="/jobs/abc"><span class="title">  </span><span class="company">Acme</span></a></li>
  </ul></section>`
  const jobs = parse(html)
  expect(jobs).toHaveLength(0)
})

test('uses absolute href when it already starts with http', () => {
  const html = `<section class="jobs"><ul>
    <li><a href="https://external.com/job/1"><span class="title">Remote PM</span><span class="company">Acme</span></a></li>
  </ul></section>`
  const jobs = parse(html)
  expect(jobs[0].url).toBe('https://external.com/job/1')
})

test('prepends BASE to relative href', () => {
  const html = `<section class="jobs"><ul>
    <li><a href="/jobs/abc"><span class="title">PM</span><span class="company">Acme</span></a></li>
  </ul></section>`
  const jobs = parse(html)
  expect(jobs[0].url).toBe('https://weworkremotely.com/jobs/abc')
})

test('falls back to "Remote" when region is empty', () => {
  const html = `<section class="jobs"><ul>
    <li><a href="/jobs/abc"><span class="title">PM</span><span class="company">Acme</span><span class="region"></span></a></li>
  </ul></section>`
  const jobs = parse(html)
  expect(jobs[0].location).toBe('Remote')
})
