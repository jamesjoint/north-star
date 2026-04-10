import { describe, test, expect } from 'vitest'
import { computeAggregate, scoreColor, parseDimensions } from '../../src/utils/scoring.js'

describe('computeAggregate', () => {
  test('returns null for null input', () => {
    expect(computeAggregate(null, {})).toBeNull()
  })

  test('returns null for undefined input', () => {
    expect(computeAggregate(undefined, {})).toBeNull()
  })

  test('returns null for empty dimensions object', () => {
    // No valid dimension scores → weightSum stays 0 → null
    expect(computeAggregate({}, {})).toBeNull()
  })

  test('returns null when all weights are 0', () => {
    const dims = { a: { score: 8 }, b: { score: 6 } }
    expect(computeAggregate(dims, { a: 0, b: 0 })).toBeNull()
  })

  test('uniform weights give simple average', () => {
    const dims = { a: { score: 8 }, b: { score: 6 } }
    expect(computeAggregate(dims, { a: 1, b: 1 })).toBe(7)
  })

  test('higher weight amplifies that dimension', () => {
    const dims = { a: { score: 10 }, b: { score: 5 } }
    // a weight=2, b weight=1 → (10*2 + 5*1) / 3 = 25/3 ≈ 8.33
    expect(computeAggregate(dims, { a: 2, b: 1 })).toBeCloseTo(8.33, 1)
  })

  test('missing weight defaults to 1', () => {
    const dims = { a: { score: 8 }, b: { score: 4 } }
    expect(computeAggregate(dims, {})).toBe(6)
  })

  test('ignores summary key', () => {
    const dims = { a: { score: 8 }, b: { score: 4 }, summary: 'Great role' }
    expect(computeAggregate(dims, {})).toBe(6)
  })

  test('handles raw numeric values alongside object values', () => {
    const dims = { a: 8, b: { score: 4 } }
    expect(computeAggregate(dims, {})).toBe(6)
  })

  test('skips dimensions with null score', () => {
    const dims = { a: { score: 8 }, b: { score: null }, c: { score: 4 } }
    expect(computeAggregate(dims, {})).toBe(6)
  })

  test('single dimension returns that score', () => {
    expect(computeAggregate({ only: { score: 7.5 } }, {})).toBe(7.5)
  })

  test('rounds to 2 decimal places', () => {
    // (10 + 7) / 3 = 5.666...
    const dims = { a: { score: 10 }, b: { score: 7 }, c: { score: 0 } }
    const result = computeAggregate(dims, {})
    expect(result).toBe(5.67)
  })

  test('score of 0 is counted (not skipped like null)', () => {
    // 0 is a valid score — (0+10)/2 = 5, not just 10
    const dims = { a: { score: 0 }, b: { score: 10 } }
    expect(computeAggregate(dims, {})).toBe(5)
  })

  test('fractional weights work correctly', () => {
    // a*1.5 + b*0.5 / 2 = (8*1.5 + 4*0.5) / 2 = (12+2)/2 = 7
    const dims = { a: { score: 8 }, b: { score: 4 } }
    expect(computeAggregate(dims, { a: 1.5, b: 0.5 })).toBe(7)
  })
})

describe('scoreColor', () => {
  test('returns gray for null', () => {
    expect(scoreColor(null)).toBe('#c7c7cc')
  })

  test('returns gray for undefined', () => {
    expect(scoreColor(undefined)).toBe('#c7c7cc')
  })

  test('returns green for score >= 7', () => {
    expect(scoreColor(7)).toBe('#A0CB3B')
    expect(scoreColor(10)).toBe('#A0CB3B')
    expect(scoreColor(7.5)).toBe('#A0CB3B')
  })

  test('returns yellow for score >= 4 and < 7', () => {
    expect(scoreColor(4)).toBe('#FAB71F')
    expect(scoreColor(6.9)).toBe('#FAB71F')
    expect(scoreColor(5)).toBe('#FAB71F')
  })

  test('returns pink for score < 4', () => {
    expect(scoreColor(3.9)).toBe('#EC5298')
    expect(scoreColor(0)).toBe('#EC5298')
    expect(scoreColor(1)).toBe('#EC5298')
  })

  test('boundary at exactly 7', () => {
    expect(scoreColor(6.99)).toBe('#FAB71F')
    expect(scoreColor(7)).toBe('#A0CB3B')
  })

  test('boundary at exactly 4', () => {
    expect(scoreColor(3.99)).toBe('#EC5298')
    expect(scoreColor(4)).toBe('#FAB71F')
  })
})

describe('parseDimensions', () => {
  test('returns {} for null', () => {
    expect(parseDimensions(null)).toEqual({})
  })

  test('returns {} for undefined', () => {
    expect(parseDimensions(undefined)).toEqual({})
  })

  test('returns {} for empty string', () => {
    expect(parseDimensions('')).toEqual({})
  })

  test('parses a JSON string', () => {
    const raw = JSON.stringify({ a: { score: 8 }, summary: 'Good fit' })
    const result = parseDimensions(raw)
    expect(result.a).toEqual({ score: 8 })
    expect(result.summary).toBe('Good fit')
  })

  test('returns object as-is when already an object', () => {
    const obj = { a: { score: 8 } }
    expect(parseDimensions(obj)).toBe(obj)
  })

  test('returns {} for invalid JSON string', () => {
    expect(parseDimensions('not json {')).toEqual({})
  })

  test('summary is accessible from parsed string', () => {
    const raw = JSON.stringify({ summary: 'Great role for you' })
    expect(parseDimensions(raw).summary).toBe('Great role for you')
  })

  test('returns {} for whitespace-only string', () => {
    expect(parseDimensions('   ')).toEqual({})
  })

  test('parsed string with nested score objects is fully accessible', () => {
    const raw = JSON.stringify({
      core_mechanism: { score: 8, reasoning: 'Great connector.' },
      gap_bridgeability: { score: 7, reasoning: 'Learnable gap.' },
    })
    const result = parseDimensions(raw)
    expect(result.core_mechanism.score).toBe(8)
    expect(result.core_mechanism.reasoning).toBe('Great connector.')
    expect(result.gap_bridgeability.score).toBe(7)
  })
})
