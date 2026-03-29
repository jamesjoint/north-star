import Anthropic from '@anthropic-ai/sdk'

const DIMENSIONS = [
  'core_mechanism',
  'product_depth',
  'regulated_complexity',
  'bd_track_record',
  'mba_preference',
  'domain_gap',
  'gap_bridgeability',
]

const DIMENSION_DESCRIPTIONS = {
  core_mechanism: 'Does the role run primarily on influence without authority? Score 10 if the job requires driving outcomes through persuasion, alignment, and coalition-building across teams with no direct reports.',
  product_depth: 'Is the person close to the product, owning a roadmap or specific surface? Score 10 if the role has clear product ownership.',
  regulated_complexity: 'Does the constraint-heavy environment (regulated industries, compliance, legal) experience transfer? Score 10 if the role is in a regulated domain.',
  bd_track_record: 'Is the deal-closing and partnership background a direct credential for this role, not just color? Score 10 if BD is the primary skill required.',
  mba_preference: 'Does the role explicitly prefer or require an MBA? Score 10 if MBA is mandatory, 5 if preferred, 1 if not mentioned.',
  domain_gap: 'What is the missing background the candidate lacks? Score 10 if there is no domain gap, 1 if the gap is large and central to the role.',
  gap_bridgeability: 'Is the identified domain gap learnable on the job, or is it structural? Score 10 if the gap is easily bridgeable, 1 if it is a hard blocker.',
}

export async function scoreJob(job, profile) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const systemPrompt = `You are a job-fit evaluator. You will assess a job listing against a candidate profile using exactly 7 dimensions.

Candidate background:
${profile.background}

Dimensions to score (each 1-10):
${DIMENSIONS.map(d => `- ${d}: ${DIMENSION_DESCRIPTIONS[d]}`).join('\n')}

Respond ONLY with valid JSON in this exact shape:
{
  "dimensions": {
    ${DIMENSIONS.map(d => `"${d}": { "score": <number 1-10>, "reasoning": "<one sentence>" }`).join(',\n    ')}
  },
  "aggregate": <weighted average, will be recalculated — just use equal weights here>,
  "summary": "<2-3 sentence overall fit summary>"
}`

  const userPrompt = `Job title: ${job.title}

Job description:
${job.description || '(no description provided)'}`

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  })

  let parsed
  try {
    let text = response.content[0].text.trim()
    if (text.startsWith('```')) {
      text = text.replace(/^```[\w]*\s*\r?\n/, '').replace(/\r?\n```\s*$/, '').trim()
    }
    parsed = JSON.parse(text)
  } catch (e) {
    throw new Error('Scorer: invalid JSON from Claude: ' + e.message)
  }
  const aggregate = computeAggregate(parsed.dimensions, profile.weights)

  return {
    dimensions: parsed.dimensions,
    aggregate,
    summary: parsed.summary,
  }
}

function computeAggregate(dimensions, weights) {
  let total = 0
  let weightSum = 0
  for (const dim of DIMENSIONS) {
    const w = weights[dim] ?? 1
    total += (dimensions[dim]?.score ?? 0) * w
    weightSum += w
  }
  return Math.round((total / weightSum) * 100) / 100
}
