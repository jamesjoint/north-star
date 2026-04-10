import { describe, it, expect } from 'vitest'
import { formatRelativeDate, localDateStr } from '../../src/utils/date.js'

const NOW = new Date('2026-04-09T15:00:00') // local time (no Z)

describe('formatRelativeDate', () => {
  it('returns empty string for null', () => {
    expect(formatRelativeDate(null, NOW)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(formatRelativeDate(undefined, NOW)).toBe('')
  })

  it('returns "today" for today\'s date', () => {
    expect(formatRelativeDate('2026-04-09', NOW)).toBe('today')
  })

  it('returns "yesterday" for 1 day ago', () => {
    expect(formatRelativeDate('2026-04-08', NOW)).toBe('yesterday')
  })

  it('returns "N days ago" for 2–6 days ago', () => {
    expect(formatRelativeDate('2026-04-07', NOW)).toBe('2 days ago')
    expect(formatRelativeDate('2026-04-04', NOW)).toBe('5 days ago')
    expect(formatRelativeDate('2026-04-03', NOW)).toBe('6 days ago')
  })

  it('returns "1 week ago" for exactly 7 days ago', () => {
    expect(formatRelativeDate('2026-04-02', NOW)).toBe('1 week ago')
  })

  it('returns "N weeks ago" for 2–3 weeks ago', () => {
    expect(formatRelativeDate('2026-03-26', NOW)).toBe('2 weeks ago')
    expect(formatRelativeDate('2026-03-19', NOW)).toBe('3 weeks ago')
  })

  it('returns "1 month ago" for 30–59 days ago', () => {
    expect(formatRelativeDate('2026-03-10', NOW)).toBe('1 month ago')
  })

  it('returns "N months ago" for 2–11 months ago', () => {
    // 2026-04-09 - 2026-02-07 = 61 days → Math.floor(61/30) = 2 → "2 months ago"
    expect(formatRelativeDate('2026-02-07', NOW)).toBe('2 months ago')
    expect(formatRelativeDate('2025-07-09', NOW)).toBe('9 months ago')
  })

  it('returns "1 year ago" for 365–729 days ago', () => {
    expect(formatRelativeDate('2025-04-09', NOW)).toBe('1 year ago')
  })

  it('returns "N years ago" for 2+ years ago', () => {
    expect(formatRelativeDate('2024-04-09', NOW)).toBe('2 years ago')
  })

  it('returns date string for future dates', () => {
    expect(formatRelativeDate('2026-04-15', NOW)).toBe('2026-04-15')
  })

  it('handles ISO datetime strings by extracting the date part', () => {
    expect(formatRelativeDate('2026-04-09T08:00:00Z', NOW)).toBe('today')
  })

  it('returns the input string for invalid dates', () => {
    expect(formatRelativeDate('not-a-date', NOW)).toBe('not-a-date')
  })

  it('uses new Date() when now is not provided (smoke test)', () => {
    const result = formatRelativeDate('2024-01-01')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('localDateStr', () => {
  it('formats a Date as YYYY-MM-DD in local time', () => {
    // Use a fixed date to avoid timezone sensitivity
    const d = new Date(2026, 3, 9) // April 9 2026 local time
    expect(localDateStr(d)).toBe('2026-04-09')
  })

  it('zero-pads month and day', () => {
    const d = new Date(2026, 0, 5) // January 5 2026
    expect(localDateStr(d)).toBe('2026-01-05')
  })

  it('handles end of year', () => {
    const d = new Date(2025, 11, 31) // December 31 2025
    expect(localDateStr(d)).toBe('2025-12-31')
  })
})

describe('formatRelativeDate — range boundaries', () => {
  // NOW = 2026-04-09 for all boundary tests

  it('returns "1 week ago" for exactly 13 days ago (boundary before 2 weeks)', () => {
    // 13 < 14 → "1 week ago"
    expect(formatRelativeDate('2026-03-27', NOW)).toBe('1 week ago')
  })

  it('returns "2 weeks ago" for exactly 14 days ago', () => {
    // 14 is not < 14, falls to "N weeks ago"; Math.floor(14/7)=2
    expect(formatRelativeDate('2026-03-26', NOW)).toBe('2 weeks ago')
  })

  it('returns "4 weeks ago" for 29 days ago (boundary before 1 month)', () => {
    // 29 < 30 → "N weeks ago"; Math.floor(29/7)=4
    expect(formatRelativeDate('2026-03-11', NOW)).toBe('4 weeks ago')
  })

  it('returns "1 month ago" for exactly 30 days ago', () => {
    // 30 is not < 30, falls to "1 month ago" (30 < 60)
    expect(formatRelativeDate('2026-03-10', NOW)).toBe('1 month ago')
  })

  it('returns "1 month ago" for 59 days ago (boundary before 2 months)', () => {
    // 59 < 60 → "1 month ago"
    // 2026-04-09 minus 59 days = 2026-02-09
    expect(formatRelativeDate('2026-02-09', NOW)).toBe('1 month ago')
  })

  it('returns "2 months ago" for exactly 60 days ago', () => {
    // 60 is not < 60, falls to "N months ago"; Math.floor(60/30)=2
    // 2026-04-09 minus 60 days = 2026-02-08
    expect(formatRelativeDate('2026-02-08', NOW)).toBe('2 months ago')
  })

  it('returns "1 year ago" for exactly 365 days ago', () => {
    // 365 is not < 365, falls to "1 year ago" (365 < 730)
    // 2026-04-09 minus 365 days = 2025-04-09
    expect(formatRelativeDate('2025-04-09', NOW)).toBe('1 year ago')
  })

  it('returns "1 year ago" for 729 days ago (boundary before 2 years)', () => {
    // 729 < 730 → "1 year ago"
    // 2026-04-09 minus 729 days = 2024-04-11 (approx)
    const d729 = new Date(Date.UTC(2026, 3, 9) - 729 * 86_400_000)
    const str = d729.toISOString().slice(0, 10)
    expect(formatRelativeDate(str, NOW)).toBe('1 year ago')
  })

  it('returns "2 years ago" for exactly 730 days ago', () => {
    // 730 is not < 730, falls to "N years ago"; Math.floor(730/365)=2
    const d730 = new Date(Date.UTC(2026, 3, 9) - 730 * 86_400_000)
    const str = d730.toISOString().slice(0, 10)
    expect(formatRelativeDate(str, NOW)).toBe('2 years ago')
  })
})
