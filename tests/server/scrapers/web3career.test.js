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
