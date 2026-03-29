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
  core_mechanism: 'Is this role fundamentally about relationship-building, creator/talent partnerships, or cross-functional influence without direct authority? Score 10 for creator partnerships, lifestyle partnerships, chief of staff, or creator solutions roles. Score 5 for generic PM or ops roles with some stakeholder management. Score 2 for roles requiring engineering authority or large team management.',
  product_depth: 'Does this role involve a consumer product in creator economy, media, lifestyle, wellness, food, or cultural verticals? Score 10 if the product serves creators, publishers, or lifestyle audiences (newsletter platform, streaming, media brand, DTC). Score 5 for healthtech or fintech products similar to her background. Score 2 for B2B SaaS, enterprise software, supply chain, or procurement products.',
  regulated_complexity: 'Does the candidate\'s FDA/GLP-1 healthtech and fintech regulatory experience transfer meaningfully? Score 9 if in regulated health or financial services. Score 6 for any compliance-heavy or legally complex environment. Score 3 for pure media/tech where regulation is minimal. Do not penalize for lack of regulation — this is a nice-to-have, not a requirement.',
  bd_track_record: 'Does this role require closing partnerships, managing creator/talent/publisher relationships, or driving BD deals? Score 10 if partnerships or BD is the primary job function. Score 7 if relationship management with external partners is a significant component. Score 3 for pure product or operational roles where BD is incidental. Score 1 for roles with no external relationship component.',
  mba_preference: 'Does the role explicitly value or require an MBA? Score 9 if MBA is required or strongly preferred. Score 6 if preferred or listed under qualifications. Score 3 if not mentioned. Score 1 if the role explicitly does not require advanced degrees or is junior-level.',
  domain_gap: 'How well does Ashley\'s background match the role\'s core domain? Score 10 for creator economy, newsletter/publishing, lifestyle partnerships, cultural media, or adjacent spaces. Score 7 for adjacent consumer platforms (streaming, DTC, wellness). Score 5 for fintech/healthtech (her background). Score 3 for generic big-tech PM, B2B SaaS, or enterprise roles with no creator/culture angle. Score 1 for procurement, supply chain, TikTok Shop, Walmart, engineering-first, or data science-first roles.',
  gap_bridgeability: 'Even where a gap exists, how easily can Ashley bridge it given her skills and background? Score 10 if the gap is surface-level (learning a specific platform or vertical she doesn\'t know yet). Score 7 if the gap requires some domain learning but her transferable skills (relationships, cross-functional leadership, regulated complexity) cover the core. Score 4 if the gap requires 2+ years of hard-to-fake experience (e.g. running a creator program, managing talent agents). Score 1 if the gap is structural and non-negotiable (requires engineering degree, ML expertise, or deep technical background she does not have).',
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
    const raw = response.content[0].text
    // Strip backtick fences, then pull out the outermost {...} to drop any preamble text
    const stripped = raw.replace(/```json|```/g, '')
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    const clean = start !== -1 && end !== -1 ? stripped.slice(start, end + 1) : stripped.trim()
    parsed = JSON.parse(clean)
  } catch (e) {
    const preview = response.content[0]?.text?.slice(0, 200)
    throw new Error(`Scorer: invalid JSON from Claude: ${e.message} | raw: ${preview}`)
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
