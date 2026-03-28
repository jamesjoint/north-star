import { describe, test, expect } from 'vitest'
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
