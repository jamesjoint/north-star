import { test, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from '../../../server/scrapers/backstage.js'

const fixture = readFileSync(path.join(process.cwd(), 'tests/fixtures/backstage.html'), 'utf8')

test('parse extracts backstage job fields', () => {
  const jobs = parse(fixture)
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    title: 'Creative Producer',
    company: 'Production House',
    location: 'New York, NY',
    source: 'backstage',
  })
  expect(jobs[0].url).toContain('backstage.com')
})

test('returns empty array for unrecognized HTML', () => {
  expect(parse('<html></html>')).toEqual([])
})
