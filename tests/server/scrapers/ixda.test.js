import { describe, test, expect } from 'vitest'
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
