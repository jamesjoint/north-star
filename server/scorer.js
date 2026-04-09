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
  core_mechanism: 'CONNECTOR FIT: Does this role require cross-domain synthesis as its core function — bridging technical and creative/commercial stakeholders, not single-lane execution? Ashley is a connector, not an executor. Score 10 for roles where synthesis across domains IS the job: creator partnerships, chief of staff, brand strategy, BD roles translating between creative and business worlds, GenAI at the intersection of creative industries. Score 7 for roles with meaningful cross-functional scope but some execution focus. Score 4 for general PM or ops roles with incidental stakeholder management. Score 1 for invisible execution roles (pure IC delivery, no strategic surface), roles locked into one lane (only technical, only operational), or roles requiring engineering/ML as the primary skill.',
  product_depth: 'DAILY TEXTURE: Will the day-to-day work be meaningfully engaging — not just an impressive title but real texture? Ashley needs visible contribution and work at the intersection of systems thinking and creative/human domains. Score 10 for roles with direct creative/cultural/human dimension: creator relationships, editorial decisions, building new programs, cultural verticals (media, fashion, wellness, food, music). Score 7 for complex consumer products with clear human impact. Score 4 for enterprise or B2B products where the daily work is primarily internal or operational. Score 1 for pure process management, procurement, supply chain, or maintenance of stable systems with no mandate to build.',
  regulated_complexity: 'STRUCTURAL INTEGRITY: Does this organization have enough structure to support a reciprocal working relationship? Ashley has a recurring pattern of entering under-structured systems, applying significant stabilizing energy, and absorbing disproportionate cost when the system fails to hold. This dimension selects for containers with structural integrity. Score 10 for established organizations with clear comp bands, defined reporting lines, documented processes, and leadership tenure — people have actually stayed. Score 7 for mature startups or growth-stage companies with explicit scope, reasonable structure, and meaningful equity or authority commensurate with complexity. Score 4 for early-stage environments with clear mandates and honest framing. Score 1 for red flags: vague or inflated JD language, "wear many hats" as selling point without equity/authority, no defined team structure, early-stage chaos framed as opportunity, a role that seems to need inventing before it can be performed, or "hustle" substituting for institutional structure.',
  bd_track_record: 'VISIBILITY: Will Ashley\'s contribution be legible — externally-facing, partner-facing, or otherwise visible? She needs to see her fingerprints on outcomes. Score 10 for roles with clear external scope: BD/partnerships, creator relations, publisher-facing, client/talent-facing, or roles where outcomes are directly attributable. Score 7 for cross-functional roles where impact is measurable and credited. Score 4 for internal product or ops roles where contribution is real but credit is diffuse. Score 1 for support or execution roles where contribution is invisible by design.',
  mba_preference: 'PIONEERING VS. MAINTENANCE: Is this role building something new, or managing steady state? Ashley needs pioneering work — she is energized by building and atrophies in maintenance mode. Score 10 for roles explicitly building a new program, launching a new vertical, or defining a function from scratch. Score 7 for roles in growth or expansion mode with clear mandate to build. Score 4 for roles that mix building and maintenance, or where the new/pioneering scope is a portion of the work. Score 1 for roles managing an established, stable function with no mandate to build, or where "innovation" is cosmetic language on a maintenance job.',
  domain_gap: 'SECTOR ALIGNMENT: How well does the role\'s industry align with Ashley\'s target sectors? Ashley targets industries both from experience and from personal passion — both count equally. Score 10 for: creator economy, newsletter/publishing platforms, lifestyle partnerships, cultural media, music, podcasting, sports, entertainment, the arts (museums, galleries, public/private art funds, artist-adjacent orgs), art sales (auction houses, art marketplaces, art advisory, art finance, art sale adjacent). Score 7 for: fintech, healthcare, healthtech, or GenAI at the intersection of creative industries — she has direct experience and is actively targeting these. Score 4 for adjacent consumer platforms (DTC, wellness, food delivery, streaming). Score 1 for generic big-tech PM, B2B SaaS, enterprise roles with no creator/culture angle, procurement, supply chain, TikTok Shop, Walmart, engineering-first, or data science-first roles.',
  gap_bridgeability: 'GAP BRIDGEABILITY: Even where a gap exists, how easily can Ashley bridge it given her connector profile and track record? Score 10 if the gap is surface-level (learning a specific platform or vertical). Score 7 if the gap requires domain learning but her transferable skills (cross-domain synthesis, relationships, regulated complexity, Wharton MBA, ceramics/maker credibility) cover the core. Score 4 if the gap requires 2+ years of hard-to-fake experience (e.g. running a creator program at scale, deep music industry relationships). Score 1 if the gap is structural and non-negotiable (requires engineering degree, ML expertise, or deep technical background she does not have).',
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
    model: 'claude-haiku-4-5-20251001',
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
