import { describe, it, expect } from 'vitest'
import { detectRemote } from '../../../server/scrapers/utils.js'

describe('detectRemote', () => {
  it('returns "remote" for "Remote"', () => {
    expect(detectRemote('Remote')).toBe('remote')
  })

  it('returns "remote" for location containing flexible', () => {
    expect(detectRemote('Flexible / Remote')).toBe('remote')
  })

  it('returns "hybrid" for location containing hybrid', () => {
    expect(detectRemote('New York, NY – Hybrid')).toBe('hybrid')
  })

  it('returns "onsite" for regular city/state location', () => {
    expect(detectRemote('San Francisco, CA')).toBe('onsite')
  })

  it('returns "onsite" for empty string', () => {
    expect(detectRemote('')).toBe('onsite')
  })

  it('is case-insensitive', () => {
    expect(detectRemote('REMOTE')).toBe('remote')
    expect(detectRemote('HYBRID')).toBe('hybrid')
  })

  it('prefers "remote" over "hybrid" when both keywords appear', () => {
    // "remote" check comes first in the code
    expect(detectRemote('Remote or Hybrid')).toBe('remote')
  })

  it('handles undefined (default param)', () => {
    expect(detectRemote()).toBe('onsite')
  })
})
