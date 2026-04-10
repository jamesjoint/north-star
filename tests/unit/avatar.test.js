import { describe, it, expect } from 'vitest'
import { avatarColor, initials, companyInitials, companyHue, companyBg } from '../../src/utils/avatar.js'

const VALID_COLORS = ['#30C5FF', '#A0CB3B', '#FAB71F', '#EC5298', '#AF88FF', '#FF8C42']

describe('avatarColor', () => {
  it('returns one of the 6 defined colors', () => {
    expect(VALID_COLORS).toContain(avatarColor('user@example.com'))
  })

  it('returns the same color for the same email', () => {
    expect(avatarColor('alice@example.com')).toBe(avatarColor('alice@example.com'))
  })

  it('returns different colors for different emails (most of the time)', () => {
    // Not guaranteed but highly likely with 6 colors
    const colors = new Set(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com', 'f@x.com'].map(avatarColor))
    expect(colors.size).toBeGreaterThan(1)
  })

  it('handles empty string without throwing', () => {
    expect(VALID_COLORS).toContain(avatarColor(''))
  })
})

describe('initials', () => {
  it('returns two uppercase letters from dot-separated name', () => {
    expect(initials('john.doe@example.com')).toBe('JD')
  })

  it('returns two uppercase letters from underscore-separated name', () => {
    expect(initials('jane_smith@example.com')).toBe('JS')
  })

  it('returns two uppercase letters from hyphen-separated name', () => {
    expect(initials('anna-lee@example.com')).toBe('AL')
  })

  it('returns first two chars for single-part name', () => {
    expect(initials('alice@example.com')).toBe('AL')
  })

  it('returns single char uppercased for single-letter name', () => {
    expect(initials('a@example.com')).toBe('A')
  })

  it('handles empty string', () => {
    expect(initials('')).toBe('')
  })
})

describe('companyInitials', () => {
  it('returns first two chars uppercased for single-word name', () => {
    expect(companyInitials('Acme')).toBe('AC')
  })

  it('returns first letter of each word for multi-word name', () => {
    expect(companyInitials('Acme Corp')).toBe('AC')
    expect(companyInitials('New York Times')).toBe('NY')
  })

  it('collapses multiple spaces between words', () => {
    expect(companyInitials('Acme  Corp')).toBe('AC')
  })

  it('handles all-caps name', () => {
    expect(companyInitials('IBM')).toBe('IB')
  })

  it('returns empty string for null', () => {
    expect(companyInitials(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(companyInitials(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(companyInitials('')).toBe('')
  })

  it('trims leading/trailing whitespace before splitting', () => {
    expect(companyInitials('  Acme  ')).toBe('AC')
  })
})

describe('companyHue', () => {
  it('returns a number between 0 and 359', () => {
    const hue = companyHue('Acme')
    expect(hue).toBeGreaterThanOrEqual(0)
    expect(hue).toBeLessThan(360)
  })

  it('is deterministic — same name always returns same hue', () => {
    expect(companyHue('Acme')).toBe(companyHue('Acme'))
    expect(companyHue('Moonbeam Inc')).toBe(companyHue('Moonbeam Inc'))
  })

  it('returns different hues for different names (most of the time)', () => {
    const hues = ['Acme', 'Beta', 'Zephyr', 'Moonbeam', 'Stardust'].map(companyHue)
    expect(new Set(hues).size).toBeGreaterThan(1)
  })

  it('handles empty string without throwing', () => {
    expect(() => companyHue('')).not.toThrow()
    const hue = companyHue('')
    expect(hue).toBeGreaterThanOrEqual(0)
    expect(hue).toBeLessThan(360)
  })
})

describe('companyBg', () => {
  it('returns a valid hsl() string', () => {
    const bg = companyBg('Acme')
    expect(bg).toMatch(/^hsl\(\d+, 50%, 32%\)$/)
  })

  it('is deterministic — same name returns same bg', () => {
    expect(companyBg('Acme')).toBe(companyBg('Acme'))
  })

  it('falls back to "Unknown" for null/undefined', () => {
    expect(companyBg(null)).toBe(companyBg('Unknown'))
    expect(companyBg(undefined)).toBe(companyBg('Unknown'))
  })

  it('returns different backgrounds for different names', () => {
    expect(companyBg('Acme')).not.toBe(companyBg('Zephyr'))
  })
})
