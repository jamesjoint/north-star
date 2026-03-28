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
