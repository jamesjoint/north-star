import { describe, it, expect } from 'vitest'
import { isRelevant, isUS, parseBodyText } from '../../../server/scrapers/whoishiringintech.js'

describe('isRelevant', () => {
  it('returns true for empty functions list (keep unknown)', () => {
    expect(isRelevant([])).toBe(true)
  })

  it('returns true for null functions', () => {
    expect(isRelevant(null)).toBe(true)
  })

  it('returns true for relevant function (Product)', () => {
    expect(isRelevant(['Product'])).toBe(true)
  })

  it('returns true for relevant function (Business Development)', () => {
    expect(isRelevant(['Business Development'])).toBe(true)
  })

  it('returns true for partially matching function (Growth contains Strategy-adjacent)', () => {
    expect(isRelevant(['Growth'])).toBe(true)
  })

  it('returns false for irrelevant functions only', () => {
    expect(isRelevant(['Engineering', 'Design'])).toBe(false)
  })

  it('returns true if at least one function is relevant', () => {
    expect(isRelevant(['Engineering', 'Product'])).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isRelevant(['product'])).toBe(true)
    expect(isRelevant(['SALES'])).toBe(true)
  })
})

describe('isUS', () => {
  it('returns true for null country (keep unknown)', () => {
    expect(isUS(null)).toBe(true)
  })

  it('returns true for undefined country', () => {
    expect(isUS(undefined)).toBe(true)
  })

  it('returns true for "United States"', () => {
    expect(isUS('United States')).toBe(true)
  })

  it('returns true for "US"', () => {
    expect(isUS('US')).toBe(true)
  })

  it('returns true for "USA"', () => {
    expect(isUS('USA')).toBe(true)
  })

  it('returns false for Canada', () => {
    expect(isUS('Canada')).toBe(false)
  })

  it('returns false for United Kingdom', () => {
    expect(isUS('United Kingdom')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isUS('united states')).toBe(true)
    expect(isUS('us')).toBe(true)
  })
})

describe('parseBodyText', () => {
  // Minimal valid body text structure matching the airtable format:
  // numbered list section: index\nCompanyName
  // then a "Status" header
  // then data lines: jobsUrl, optional glassdoor, functions, country, state, workEnv
  function makeBodyText(companies) {
    const listSection = companies
      .map((c, i) => `${i + 1}\n${c.name}`)
      .join('\n')

    const dataSection = companies.map(c => {
      const lines = []
      if (c.url) lines.push(c.url)
      if (c.functions) lines.push(...c.functions)
      if (c.country) lines.push(c.country)
      if (c.state) lines.push(c.state)
      if (c.workEnv) lines.push(c.workEnv)
      return lines.join('\n')
    }).join('\n')

    return `${listSection}\nStatus\n${dataSection}`
  }

  it('returns empty array for text without Status header', () => {
    const text = '1\nAcme\nhttps://acme.com/jobs'
    const result = parseBodyText(text)
    expect(result).toEqual([{ name: 'Acme' }])
  })

  it('parses a single company with all fields', () => {
    const text = makeBodyText([{
      name: 'TechCorp',
      url: 'https://techcorp.com/jobs',
      functions: ['Product', 'Engineering'],
      country: 'United States',
      state: 'California',
      workEnv: 'Remote',
    }])
    const result = parseBodyText(text)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      name: 'TechCorp',
      url: 'https://techcorp.com/jobs',
      functions: ['Product', 'Engineering'],
      country: 'United States',
      state: 'California',
      workEnv: 'Remote',
    })
  })

  it('parses multiple companies', () => {
    const text = makeBodyText([
      { name: 'Alpha', url: 'https://alpha.com/jobs', functions: ['Product'] },
      { name: 'Beta', url: 'https://beta.com/jobs', functions: ['Sales'] },
    ])
    const result = parseBodyText(text)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Alpha')
    expect(result[1].name).toBe('Beta')
  })

  it('filters out companies without a jobs URL', () => {
    const text = makeBodyText([
      { name: 'HasURL', url: 'https://example.com/jobs' },
      { name: 'NoURL' },
    ])
    const result = parseBodyText(text)
    expect(result.map(c => c.name)).toEqual(['HasURL'])
  })

  it('does not duplicate companies appearing in multiple snapshots', () => {
    // Same numbered entry appearing twice should be deduplicated by companyNameSet
    const text = '1\nAcme\n1\nAcme\nStatus\nhttps://acme.com/jobs'
    const result = parseBodyText(text)
    expect(result.filter(c => c.name === 'Acme')).toHaveLength(1)
  })

  it('returns empty array for empty string', () => {
    expect(parseBodyText('')).toEqual([])
  })
})
