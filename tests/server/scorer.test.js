import { describe, test, expect, vi, beforeEach } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'

vi.mock('@anthropic-ai/sdk')

const MOCK_PROFILE = {
  background: 'Experienced product leader with BD background in regulated industries.',
  weights: {
    role_alignment: 1, level_fit: 1, sector_fit: 1, skills_match: 1, growth_potential: 1
  }
}

const MOCK_SCORE_RESPONSE = {
  dimensions: {
    role_alignment:   { score: 8, reasoning: 'Title aligns well with target.' },
    level_fit:        { score: 7, reasoning: 'One level above target.' },
    sector_fit:       { score: 9, reasoning: 'Fintech matches target sector.' },
    skills_match:     { score: 6, reasoning: 'Meets most requirements.' },
    growth_potential: { score: 5, reasoning: 'Some growth opportunity.' },
  },
  aggregate: 999,
  summary: 'Strong fit on role and sector. Some growth headroom available.'
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
    expect(result.dimensions.role_alignment.score).toBe(8)
    expect(result.aggregate).toBeCloseTo(7, 2)
    expect(result.summary).toContain('Strong fit')
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
    expect(result.dimensions.role_alignment.score).toBe(8)
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
    expect(result.dimensions.role_alignment.score).toBe(8)
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
    expect(result.dimensions.role_alignment.score).toBe(8)
  })

  test('recalculates aggregate using profile weights', async () => {
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    const heavyWeights = { ...MOCK_PROFILE, weights: {
      role_alignment: 2, level_fit: 1, sector_fit: 1, skills_match: 1, growth_potential: 1
    }}
    const result = await scoreJob(
      { title: 'PM', description: 'desc' },
      heavyWeights
    )
    const dims = MOCK_SCORE_RESPONSE.dimensions
    const expected = (
      dims.role_alignment.score * 2 +
      dims.level_fit.score * 1 +
      dims.sector_fit.score * 1 +
      dims.skills_match.score * 1 +
      dims.growth_potential.score * 1
    ) / 6
    expect(result.aggregate).toBeCloseTo(expected, 2)
  })
})
// APPENDED TESTS

describe('scoreJob — generic DEFAULT_DIMENSIONS', () => {
  test('generic DEFAULT_DIMENSIONS: system prompt uses role_alignment and level_fit, not Ashley-specific keys', async () => {
    vi.clearAllMocks()
    let capturedSystemPrompt
    const genericDimResponse = {
      dimensions: {
        role_alignment:   { score: 8, reasoning: 'Title matches target.' },
        level_fit:        { score: 7, reasoning: 'One level above target.' },
        sector_fit:       { score: 6, reasoning: 'Adjacent sector.' },
        skills_match:     { score: 9, reasoning: 'Meets most requirements.' },
        growth_potential: { score: 7, reasoning: 'Clear growth path.' },
      },
      summary: 'Strong overall fit with good growth potential.'
    }
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockImplementation(async (opts) => {
            capturedSystemPrompt = opts.system
            return { content: [{ text: JSON.stringify(genericDimResponse) }] }
          })
        }
      }
    })
    // Profile with no custom dimensions — forces fallback to DEFAULT_DIMENSIONS
    const profile = { background: 'Software engineer with 5 years experience.', weights: {} }
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    await scoreJob({ title: 'Senior Engineer', description: 'Build great things.' }, profile)
    expect(capturedSystemPrompt).toContain('role_alignment')
    expect(capturedSystemPrompt).toContain('level_fit')
    expect(capturedSystemPrompt).not.toContain('core_mechanism')
    expect(capturedSystemPrompt).not.toContain('mba_preference')
  })
})

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
    // Default dimensions map role_alignment → label: 'Role Alignment'
    expect(result.dimensions.role_alignment.label).toBe('Role Alignment')
    expect(result.dimensions.sector_fit.label).toBe('Sector Fit')
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

describe('targets context block in system prompt', () => {
  test('includes Candidate targets section when target fields are set', async () => {
    let capturedSystem = ''
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockImplementation(async ({ system }) => {
            capturedSystem = system
            return { content: [{ text: JSON.stringify(MOCK_SCORE_RESPONSE) }] }
          })
        }
      }
    })
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    await scoreJob(
      { title: 'PM', description: 'desc' },
      {
        ...MOCK_PROFILE,
        target_level: ['Senior IC', 'Manager'],
        target_roles: 'Head of Partnerships',
        target_sectors: 'creator economy',
      }
    )
    expect(capturedSystem).toContain('Candidate targets:')
    expect(capturedSystem).toContain('- Level: Senior IC, Manager')
    expect(capturedSystem).toContain('- Roles: Head of Partnerships')
    expect(capturedSystem).toContain('- Sectors: creator economy')
  })

  test('omits Candidate targets section when no target fields set', async () => {
    let capturedSystem = ''
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockImplementation(async ({ system }) => {
            capturedSystem = system
            return { content: [{ text: JSON.stringify(MOCK_SCORE_RESPONSE) }] }
          })
        }
      }
    })
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    await scoreJob({ title: 'PM', description: 'desc' }, MOCK_PROFILE)
    expect(capturedSystem).not.toContain('Candidate targets:')
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

