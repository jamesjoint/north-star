import { describe, test, expect, vi, beforeEach } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'

vi.mock('@anthropic-ai/sdk')

const MOCK_DIMENSIONS = {
  dimensions: {
    bd_influence: {
      label: 'BD Influence',
      description: 'Scores how much the role relies on business development skills.',
      weight: 1.5,
    },
    product_ownership: {
      label: 'Product Ownership',
      description: 'Measures depth of product decision-making authority.',
      weight: 1.0,
    },
    cross_functional_scope: {
      label: 'Cross-Functional Scope',
      description: 'Evaluates the breadth of cross-team collaboration.',
      weight: 0.5,
    },
  },
}

describe('generateDimensions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Anthropic.mockImplementation(function () {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: JSON.stringify(MOCK_DIMENSIONS) }],
          }),
        },
      }
    })
  })

  test('returns parsed dimensions object keyed by dimension id', async () => {
    const { generateDimensions } = await import('../../server/dimension-generator.js?t=' + Date.now())
    const result = await generateDimensions('10 years BD experience at tech startups')
    expect(result).toHaveProperty('bd_influence')
    expect(result).toHaveProperty('product_ownership')
    expect(result).toHaveProperty('cross_functional_scope')
  })

  test('each dimension has label, description, and weight', async () => {
    const { generateDimensions } = await import('../../server/dimension-generator.js?t=' + Date.now())
    const result = await generateDimensions('Experienced product leader')
    expect(result.bd_influence.label).toBe('BD Influence')
    expect(result.bd_influence.weight).toBe(1.5)
    expect(typeof result.bd_influence.description).toBe('string')
  })

  test('passes background text to the API', async () => {
    let capturedMessages
    Anthropic.mockImplementation(function () {
      return {
        messages: {
          create: vi.fn().mockImplementation(async (opts) => {
            capturedMessages = opts.messages
            return { content: [{ text: JSON.stringify(MOCK_DIMENSIONS) }] }
          }),
        },
      }
    })
    const { generateDimensions } = await import('../../server/dimension-generator.js?t=' + Date.now())
    await generateDimensions('Strong BD background in SaaS')
    expect(capturedMessages[0].content).toContain('Strong BD background in SaaS')
  })

  test('strips json code fences before parsing', async () => {
    Anthropic.mockImplementation(function () {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: '```json\n' + JSON.stringify(MOCK_DIMENSIONS) + '\n```' }],
          }),
        },
      }
    })
    const { generateDimensions } = await import('../../server/dimension-generator.js?t=' + Date.now())
    const result = await generateDimensions('background text')
    expect(result).toHaveProperty('bd_influence')
  })

  test('throws when Claude returns unparseable response', async () => {
    Anthropic.mockImplementation(function () {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: 'Sorry, I cannot generate dimensions.' }],
          }),
        },
      }
    })
    const { generateDimensions } = await import('../../server/dimension-generator.js?t=' + Date.now())
    await expect(generateDimensions('background text')).rejects.toThrow()
  })

  test('returns dimensions keyed without the outer "dimensions" wrapper', async () => {
    const { generateDimensions } = await import('../../server/dimension-generator.js?t=' + Date.now())
    const result = await generateDimensions('background text')
    // Result should be the inner object (flat keys), not { dimensions: { ... } }
    expect(result).not.toHaveProperty('dimensions')
    expect(result.bd_influence).toHaveProperty('label')
    expect(result.bd_influence).toHaveProperty('description')
    expect(result.bd_influence).toHaveProperty('weight')
  })
})

describe('personality and targets in dimension generation', () => {
  test('includes personality and targets in user message when provided', async () => {
    let capturedMsg = ''
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockImplementation(async ({ messages }) => {
            capturedMsg = messages[0].content
            return { content: [{ text: JSON.stringify({ dimensions: { role_fit: { label: 'Role Fit', description: 'desc', weight: 1 } } }) }] }
          })
        }
      }
    })
    const { generateDimensions } = await import('../../server/dimension-generator.js?t=' + Date.now())
    await generateDimensions('Product manager background.', {
      personality: { mbti: 'INTJ', disc: 'Dominance (D)', strengths: ['Strategic', 'Activator'] },
      target_level: ['Senior IC'],
      target_roles: 'Head of Product',
      target_sectors: 'creator economy',
    })
    expect(capturedMsg).toContain('Myers-Briggs: INTJ')
    expect(capturedMsg).toContain('DiSC: Dominance (D)')
    expect(capturedMsg).toContain('CliftonStrengths top 5: Strategic, Activator')
    expect(capturedMsg).toContain('Target level: Senior IC')
    expect(capturedMsg).toContain('Target roles: Head of Product')
    expect(capturedMsg).toContain('Target sectors: creator economy')
  })

  test('works with no profile context — backward compatible', async () => {
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: JSON.stringify({ dimensions: { role_fit: { label: 'Role Fit', description: 'desc', weight: 1 } } }) }]
          })
        }
      }
    })
    const { generateDimensions } = await import('../../server/dimension-generator.js?t=' + Date.now())
    const result = await generateDimensions('Some background.')
    expect(result.role_fit).toBeDefined()
  })
})
