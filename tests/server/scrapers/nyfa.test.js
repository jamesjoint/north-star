import { describe, test, expect } from 'vitest'
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
