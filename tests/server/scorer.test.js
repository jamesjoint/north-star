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
// APPENDED TESTS

describe('scoreJob — additional edge cases', () => {
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

  test('enriches dimension objects with their label from dimension definitions', async () => {
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    const result = await scoreJob({ title: 'PM', description: 'desc' }, MOCK_PROFILE)
    // Default dimensions map core_mechanism → label: 'Connector Fit'
    expect(result.dimensions.core_mechanism.label).toBe('Connector Fit')
    expect(result.dimensions.domain_gap.label).toBe('Domain Fit')
  })

  test('uses custom dimensions from profile when 3+ keys are present', async () => {
    const customDimResponse = {
      dimensions: {
        creativity:   { score: 9, reasoning: 'Highly creative.' },
        impact:       { score: 7, reasoning: 'Clear impact.' },
        culture_fit:  { score: 8, reasoning: 'Great values match.' },
      },
      summary: 'Strong creative fit.'
    }
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: JSON.stringify(customDimResponse) }]
          })
        }
      }
    })
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    const profileWithDims = {
      ...MOCK_PROFILE,
      dimensions: {
        creativity:  { label: 'Creativity',  description: 'Creative capacity', weight: 1 },
        impact:      { label: 'Impact',      description: 'Business impact',   weight: 1 },
        culture_fit: { label: 'Culture Fit', description: 'Values alignment',  weight: 1 },
      }
    }
    const result = await scoreJob({ title: 'PM', description: 'desc' }, profileWithDims)
    expect(result.dimensions.creativity.score).toBe(9)
    expect(result.dimensions.creativity.label).toBe('Creativity')
    expect(result.aggregate).toBe(8) // (9+7+8)/3
  })

  test('falls back to "(no description provided)" when job has no description', async () => {
    let capturedPrompt
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockImplementation(async (opts) => {
            capturedPrompt = opts.messages[0].content
            return { content: [{ text: JSON.stringify(MOCK_SCORE_RESPONSE) }] }
          })
        }
      }
    })
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    await scoreJob({ title: 'PM', description: null }, MOCK_PROFILE)
    expect(capturedPrompt).toContain('(no description provided)')
  })
})

describe('scoreJob — error handling and personality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('throws a descriptive error when Claude returns unparseable JSON', async () => {
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: 'This is definitely not JSON, sorry!' }]
          })
        }
      }
    })
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    await expect(scoreJob({ title: 'PM', description: 'desc' }, MOCK_PROFILE))
      .rejects.toThrow('Scorer: invalid JSON from Claude')
  })

  test('includes personality block in system prompt when profile has personality', async () => {
    let capturedSystemPrompt
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockImplementation(async (opts) => {
            capturedSystemPrompt = opts.system
            return { content: [{ text: JSON.stringify(MOCK_SCORE_RESPONSE) }] }
          })
        }
      }
    })
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    const profileWithPersonality = {
      ...MOCK_PROFILE,
      personality: { mbti: 'INTJ', enneagram: '5w4' },
    }
    await scoreJob({ title: 'PM', description: 'desc' }, profileWithPersonality)
    expect(capturedSystemPrompt).toContain('Myers-Briggs: INTJ')
    expect(capturedSystemPrompt).toContain('Enneagram: 5w4')
    expect(capturedSystemPrompt).toContain('Personality context')
  })

  test('does not include personality section when personality is null', async () => {
    let capturedSystemPrompt
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockImplementation(async (opts) => {
            capturedSystemPrompt = opts.system
            return { content: [{ text: JSON.stringify(MOCK_SCORE_RESPONSE) }] }
          })
        }
      }
    })
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    await scoreJob({ title: 'PM', description: 'desc' }, { ...MOCK_PROFILE, personality: null })
    expect(capturedSystemPrompt).not.toContain('Personality context')
  })

  test('custom dim weights use dimension.weight as fallback when profile.weights is absent', async () => {
    const customDimResponse = {
      dimensions: {
        creativity: { score: 8, reasoning: 'Creative' },
        impact:     { score: 6, reasoning: 'Impact' },
        culture:    { score: 10, reasoning: 'Culture' },
      },
      summary: 'Good fit.'
    }
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: JSON.stringify(customDimResponse) }]
          })
        }
      }
    })
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    const profileWithCustomDims = {
      background: 'Creative professional.',
      weights: {}, // no per-dim weights
      dimensions: {
        creativity: { label: 'Creativity', description: 'Creative capacity', weight: 2 },
        impact:     { label: 'Impact',     description: 'Business impact',   weight: 1 },
        culture:    { label: 'Culture',    description: 'Culture alignment', weight: 1 },
      }
    }
    const result = await scoreJob({ title: 'Designer', description: 'desc' }, profileWithCustomDims)
    // With weights 2,1,1: (8*2 + 6*1 + 10*1) / 4 = 32/4 = 8
    expect(result.aggregate).toBe(8)
  })
})

