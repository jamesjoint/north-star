import { describe, it, expect } from 'vitest'
import { buildPersonalityBlock, computeAggregate } from '../../server/scorer.js'

describe('buildPersonalityBlock', () => {
  it('returns empty string for null input', () => {
    expect(buildPersonalityBlock(null)).toBe('')
  })

  it('returns empty string for non-object input', () => {
    expect(buildPersonalityBlock('INTJ')).toBe('')
    expect(buildPersonalityBlock(42)).toBe('')
  })

  it('returns empty string for empty object', () => {
    expect(buildPersonalityBlock({})).toBe('')
  })

  it('formats MBTI type', () => {
    const result = buildPersonalityBlock({ mbti: 'INTJ' })
    expect(result).toContain('Myers-Briggs: INTJ')
  })

  it('formats Enneagram type', () => {
    const result = buildPersonalityBlock({ enneagram: '3w4' })
    expect(result).toContain('Enneagram: 3w4')
  })

  it('formats DiSC type', () => {
    const result = buildPersonalityBlock({ disc: 'DC' })
    expect(result).toContain('DiSC: DC')
  })

  it('formats full astrology when all signs provided', () => {
    const result = buildPersonalityBlock({ sun_sign: 'Aries', moon_sign: 'Leo', rising_sign: 'Scorpio' })
    expect(result).toContain('Astrology:')
    expect(result).toContain('sun Aries')
    expect(result).toContain('moon Leo')
    expect(result).toContain('rising Scorpio')
  })

  it('formats partial astrology (sun only)', () => {
    const result = buildPersonalityBlock({ sun_sign: 'Cancer' })
    expect(result).toContain('Astrology: sun Cancer')
    expect(result).not.toContain('moon')
  })

  it('formats CliftonStrengths top 5', () => {
    const result = buildPersonalityBlock({ strengths: ['Ideation', 'Futuristic', 'Strategic', 'Activator', 'Input'] })
    expect(result).toContain('CliftonStrengths top 5: Ideation, Futuristic, Strategic, Activator, Input')
  })

  it('combines multiple fields with newlines', () => {
    const result = buildPersonalityBlock({ mbti: 'ENFJ', enneagram: '2w3' })
    const lines = result.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('Myers-Briggs')
    expect(lines[1]).toContain('Enneagram')
  })

  it('skips empty strengths array', () => {
    const result = buildPersonalityBlock({ strengths: [] })
    expect(result).toBe('')
  })

  it('formats partial astrology (moon and rising without sun)', () => {
    const result = buildPersonalityBlock({ moon_sign: 'Leo', rising_sign: 'Scorpio' })
    expect(result).toContain('Astrology:')
    expect(result).toContain('moon Leo')
    expect(result).toContain('rising Scorpio')
    expect(result).not.toContain('sun')
  })

  it('omits astrology line when all signs are falsy', () => {
    const result = buildPersonalityBlock({ sun_sign: '', moon_sign: null, rising_sign: undefined })
    expect(result).toBe('')
  })
})

describe('computeAggregate (server)', () => {
  it('returns null for empty dimensions', () => {
    expect(computeAggregate({}, {})).toBe(0)
  })

  it('returns null when all scores are null', () => {
    expect(computeAggregate({ a: { score: null } }, {})).toBe(null)
  })

  it('skips summary key', () => {
    const dims = { summary: 'some text', a: { score: 8 } }
    expect(computeAggregate(dims, {})).toBe(8)
  })

  it('computes simple average with equal weights', () => {
    const dims = { a: { score: 6 }, b: { score: 8 } }
    expect(computeAggregate(dims, {})).toBe(7)
  })

  it('computes weighted average', () => {
    const dims = { a: { score: 4 }, b: { score: 8 } }
    const weights = { a: 1, b: 3 }
    // (4*1 + 8*3) / 4 = 28/4 = 7
    expect(computeAggregate(dims, weights)).toBe(7)
  })

  it('accepts raw numeric dimension values', () => {
    const dims = { a: 5, b: 9 }
    expect(computeAggregate(dims, {})).toBe(7)
  })

  it('returns null when weightSum is 0 (all weights explicitly 0)', () => {
    const dims = { a: { score: 8 }, b: { score: 6 } }
    const weights = { a: 0, b: 0 }
    expect(computeAggregate(dims, weights)).toBe(null)
  })

  it('rounds to 2 decimal places', () => {
    const dims = { a: { score: 7 }, b: { score: 8 }, c: { score: 9 } }
    // (7+8+9)/3 = 8
    expect(computeAggregate(dims, {})).toBe(8)
    const dims2 = { a: { score: 7 }, b: { score: 8 }, c: { score: 10 } }
    // (7+8+10)/3 = 8.333...
    expect(computeAggregate(dims2, {})).toBe(8.33)
  })

  it('defaults missing weights to 1', () => {
    const dims = { a: { score: 6 }, b: { score: 10 } }
    // no weights provided — should default to 1 each
    expect(computeAggregate(dims, null)).toBe(8)
  })
})
