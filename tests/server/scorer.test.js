import { describe, test, expect, vi, beforeEach } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'

vi.mock('@anthropic-ai/sdk')

const MOCK_PROFILE = {
  background: 'Experienced product leader with BD background in regulated industries.',
  weights: {
    core_mechanism: 1, product_depth: 1, regulated_complexity: 1,
    bd_track_record: 1, mba_preference: 1, domain_gap: 1, gap_bridgeability: 1
  }
}

const MOCK_SCORE_RESPONSE = {
  dimensions: {
    core_mechanism: { score: 8, reasoning: 'Role needs cross-functional influence.' },
    product_depth: { score: 7, reasoning: 'Owns a product line.' },
    regulated_complexity: { score: 9, reasoning: 'Fintech is highly regulated.' },
    bd_track_record: { score: 6, reasoning: 'Deal-closing mentioned.' },
    mba_preference: { score: 5, reasoning: 'MBA preferred but not required.' },
    domain_gap: { score: 4, reasoning: 'No crypto background.' },
    gap_bridgeability: { score: 7, reasoning: 'Crypto is learnable from fintech base.' },
  },
  aggregate: 999,
  summary: 'Strong fit on influence and regulated complexity. Domain gap in crypto is bridgeable.'
}

describe('scoreJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: JSON.stringify(MOCK_SCORE_RESPONSE) }]
          })
        }
      }
    })
  })

  test('returns parsed dimensions, aggregate, and summary', async () => {
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    const result = await scoreJob(
      { title: 'PM', description: 'Lead product at a crypto startup.' },
      MOCK_PROFILE
    )
    expect(result.dimensions.core_mechanism.score).toBe(8)
    expect(result.aggregate).toBeCloseTo(6.57, 2)
    expect(result.summary).toContain('influence')
  })

  test('strips markdown code fences before parsing', async () => {
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: '```json\n' + JSON.stringify(MOCK_SCORE_RESPONSE) + '\n```' }]
          })
        }
      }
    })
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    const result = await scoreJob({ title: 'PM', description: 'desc' }, MOCK_PROFILE)
    expect(result.dimensions.core_mechanism.score).toBe(8)
  })

  test('strips fences when Claude adds preamble text before the fence', async () => {
    const preamble = 'Here is the evaluation:\n\n'
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: preamble + '```json\n' + JSON.stringify(MOCK_SCORE_RESPONSE) + '\n```' }]
          })
        }
      }
    })
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    const result = await scoreJob({ title: 'PM', description: 'desc' }, MOCK_PROFILE)
    expect(result.dimensions.core_mechanism.score).toBe(8)
  })

  test('handles plain JSON response with no fences', async () => {
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: JSON.stringify(MOCK_SCORE_RESPONSE) }]
          })
        }
      }
    })
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    const result = await scoreJob({ title: 'PM', description: 'desc' }, MOCK_PROFILE)
    expect(result.dimensions.core_mechanism.score).toBe(8)
  })

  test('recalculates aggregate using profile weights', async () => {
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    const heavyWeights = { ...MOCK_PROFILE, weights: {
      core_mechanism: 2, product_depth: 1, regulated_complexity: 1,
      bd_track_record: 1, mba_preference: 1, domain_gap: 1, gap_bridgeability: 1
    }}
    const result = await scoreJob(
      { title: 'PM', description: 'desc' },
      heavyWeights
    )
    const dims = MOCK_SCORE_RESPONSE.dimensions
    const expected = (
      dims.core_mechanism.score * 2 +
      dims.product_depth.score * 1 +
      dims.regulated_complexity.score * 1 +
      dims.bd_track_record.score * 1 +
      dims.mba_preference.score * 1 +
      dims.domain_gap.score * 1 +
      dims.gap_bridgeability.score * 1
    ) / 8
    expect(result.aggregate).toBeCloseTo(expected, 2)
  })
})
