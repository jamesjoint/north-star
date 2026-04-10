import { describe, it, expect } from 'vitest'
import { cleanPersonality } from '../../src/utils/personality.js'

describe('cleanPersonality', () => {
  it('returns empty object for empty input', () => {
    expect(cleanPersonality({})).toEqual({})
  })

  it('removes keys with null values', () => {
    const result = cleanPersonality({ mbti: null, enneagram: '3w4' })
    expect(result).not.toHaveProperty('mbti')
    expect(result.enneagram).toBe('3w4')
  })

  it('removes keys with empty string values', () => {
    const result = cleanPersonality({ mbti: '', disc: 'DC' })
    expect(result).not.toHaveProperty('mbti')
    expect(result.disc).toBe('DC')
  })

  it('removes keys with whitespace-only values', () => {
    const result = cleanPersonality({ mbti: '   ', disc: 'DC' })
    expect(result).not.toHaveProperty('mbti')
    expect(result.disc).toBe('DC')
  })

  it('removes keys with undefined values', () => {
    const result = cleanPersonality({ mbti: undefined, disc: 'DC' })
    expect(result).not.toHaveProperty('mbti')
  })

  it('keeps non-empty string values', () => {
    const result = cleanPersonality({ mbti: 'INTJ', enneagram: '3w4' })
    expect(result.mbti).toBe('INTJ')
    expect(result.enneagram).toBe('3w4')
  })

  it('converts comma-separated strengths string to array', () => {
    const result = cleanPersonality({ strengths: 'Strategic, Activator, Relator' })
    expect(result.strengths).toEqual(['Strategic', 'Activator', 'Relator'])
  })

  it('trims whitespace from each strength', () => {
    const result = cleanPersonality({ strengths: ' Strategic ,  Activator , Relator  ' })
    expect(result.strengths).toEqual(['Strategic', 'Activator', 'Relator'])
  })

  it('caps strengths at 5 items', () => {
    const result = cleanPersonality({ strengths: 'A, B, C, D, E, F, G' })
    expect(result.strengths).toHaveLength(5)
    expect(result.strengths).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('filters out empty parts from strengths string', () => {
    const result = cleanPersonality({ strengths: 'Strategic,,Activator' })
    expect(result.strengths).toEqual(['Strategic', 'Activator'])
  })

  it('keeps strengths array unchanged (already an array)', () => {
    const arr = ['Strategic', 'Activator']
    const result = cleanPersonality({ strengths: arr })
    expect(result.strengths).toBe(arr)
  })

  it('handles full personality object', () => {
    const p = {
      mbti: 'ENFJ',
      enneagram: '2w3',
      disc: '',
      sun_sign: 'Aries',
      moon_sign: null,
      rising_sign: 'Scorpio',
      strengths: 'Ideation, Futuristic, Strategic',
    }
    const result = cleanPersonality(p)
    expect(result.mbti).toBe('ENFJ')
    expect(result.enneagram).toBe('2w3')
    expect(result).not.toHaveProperty('disc')
    expect(result.sun_sign).toBe('Aries')
    expect(result).not.toHaveProperty('moon_sign')
    expect(result.rising_sign).toBe('Scorpio')
    expect(result.strengths).toEqual(['Ideation', 'Futuristic', 'Strategic'])
  })

  it('does not mutate the input object', () => {
    const p = { mbti: 'INTJ', strengths: 'A, B, C' }
    cleanPersonality(p)
    expect(p.strengths).toBe('A, B, C')
  })
})
