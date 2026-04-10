import { describe, it, expect } from 'vitest'
import { dimLabel, pipelineForStatus, buildDimList } from '../../src/utils/jobDetail.js'

describe('dimLabel', () => {
  it('returns the human label for known default dimension keys', () => {
    expect(dimLabel('core_mechanism')).toBe('Connector Fit')
    expect(dimLabel('product_depth')).toBe('Daily Texture')
    expect(dimLabel('regulated_complexity')).toBe('Structural Integrity')
    expect(dimLabel('bd_track_record')).toBe('Visibility')
    expect(dimLabel('mba_preference')).toBe('Pioneering')
    expect(dimLabel('domain_gap')).toBe('Domain Fit')
    expect(dimLabel('gap_bridgeability')).toBe('Gap Bridgeability')
  })

  it('converts unknown snake_case key to Title Case', () => {
    expect(dimLabel('culture_fit')).toBe('Culture Fit')
    expect(dimLabel('leadership_potential')).toBe('Leadership Potential')
  })

  it('handles single-word key', () => {
    expect(dimLabel('creativity')).toBe('Creativity')
  })

  it('handles key with three parts', () => {
    expect(dimLabel('cross_functional_scope')).toBe('Cross Functional Scope')
  })
})

describe('pipelineForStatus', () => {
  it('returns correct stage for Saved', () => {
    const p = pipelineForStatus('Saved')
    expect(p.pct).toBe(0)
    expect(p.label).toBe('Saved')
    expect(p.next).toBe('Apply')
  })

  it('returns correct stage for Applied', () => {
    const p = pipelineForStatus('Applied')
    expect(p.pct).toBe(40)
    expect(p.label).toBe('Applied')
    expect(p.next).toBe('Phone Screen')
  })

  it('returns correct stage for Interviewing', () => {
    const p = pipelineForStatus('Interviewing')
    expect(p.pct).toBe(65)
  })

  it('returns correct stage for Offer', () => {
    const p = pipelineForStatus('Offer')
    expect(p.pct).toBe(88)
    expect(p.next).toBe('Decision')
  })

  it('returns correct stage for Passed (100%)', () => {
    const p = pipelineForStatus('Passed')
    expect(p.pct).toBe(100)
    expect(p.label).toBe('Closed')
    expect(p.next).toBe('—')
  })

  it('returns correct stage for Not Applying (0%)', () => {
    const p = pipelineForStatus('Not Applying')
    expect(p.pct).toBe(0)
    expect(p.next).toBe('—')
  })

  it('returns correct stage for Expired (100%)', () => {
    expect(pipelineForStatus('Expired').pct).toBe(100)
  })

  it('returns fallback for unknown status', () => {
    const p = pipelineForStatus('SomeUnknownStatus')
    expect(p.pct).toBe(0)
    expect(p.label).toBe('SomeUnknownStatus')
    expect(p.next).toBe('Apply')
  })

  it('returns fallback for null/undefined status', () => {
    const p = pipelineForStatus(null)
    expect(p.pct).toBe(0)
    expect(p.label).toBe('Saved')
  })

  it('returns correct stage for Outreach Sent', () => {
    const p = pipelineForStatus('Outreach Sent')
    expect(p.pct).toBe(20)
    expect(p.label).toBe('Outreach')
    expect(p.next).toBe('Follow Up')
  })
})

const FALLBACK = [
  { key: 'foo', label: 'Foo', description: 'Foo desc' },
  { key: 'bar', label: 'Bar', description: 'Bar desc' },
  { key: 'baz', label: 'Baz', description: 'Baz desc' },
]

describe('buildDimList', () => {
  it('returns defaults when profileDimensions is null', () => {
    expect(buildDimList(null, FALLBACK)).toBe(FALLBACK)
  })

  it('returns defaults when profileDimensions is undefined', () => {
    expect(buildDimList(undefined, FALLBACK)).toBe(FALLBACK)
  })

  it('returns defaults when profileDimensions has fewer than 3 keys', () => {
    expect(buildDimList({ a: { label: 'A', description: '' } }, FALLBACK)).toBe(FALLBACK)
    expect(buildDimList({ a: { label: 'A' }, b: { label: 'B' } }, FALLBACK)).toBe(FALLBACK)
  })

  it('uses profileDimensions when it has 3+ keys', () => {
    const profile = {
      x: { label: 'X Label', description: 'X desc' },
      y: { label: 'Y Label', description: 'Y desc' },
      z: { label: 'Z Label', description: 'Z desc' },
    }
    const result = buildDimList(profile, FALLBACK)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ key: 'x', label: 'X Label', description: 'X desc' })
    expect(result[1]).toEqual({ key: 'y', label: 'Y Label', description: 'Y desc' })
  })

  it('falls back label to key when dim.label is missing', () => {
    const profile = {
      alpha: { description: 'Alpha desc' },
      beta: {},
      gamma: { label: 'Gamma' },
    }
    const result = buildDimList(profile, FALLBACK)
    expect(result.find(d => d.key === 'alpha').label).toBe('alpha')
    expect(result.find(d => d.key === 'beta').label).toBe('beta')
  })

  it('falls back description to empty string when missing', () => {
    const profile = {
      a: { label: 'A' },
      b: { label: 'B' },
      c: {},
    }
    const result = buildDimList(profile, FALLBACK)
    expect(result.find(d => d.key === 'c').description).toBe('')
  })

  it('handles exactly 3 keys (boundary)', () => {
    const profile = {
      one: { label: '1', description: '' },
      two: { label: '2', description: '' },
      three: { label: '3', description: '' },
    }
    const result = buildDimList(profile, FALLBACK)
    expect(result).toHaveLength(3)
    expect(result).not.toBe(FALLBACK)
  })
})
