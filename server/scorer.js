import Anthropic from '@anthropic-ai/sdk'
import { extractJSON } from './utils.js'

// ── Default dimensions (Ashley-specific fallback) ─────────────────────────────

const DEFAULT_DIMENSIONS = {
  core_mechanism: {
    label: 'Connector Fit',
    description: 'CONNECTOR FIT: Does this role require cross-domain synthesis as its core function — bridging technical and creative/commercial stakeholders, not single-lane execution? Score 10 for roles where synthesis across domains IS the job: creator partnerships, chief of staff, brand strategy, BD roles translating between creative and business worlds. Score 7 for roles with meaningful cross-functional scope but some execution focus. Score 4 for general PM or ops roles with incidental stakeholder management. Score 1 for invisible execution roles locked into one lane.',
    weight: 1,
  },
  product_depth: {
    label: 'Daily Texture',
    description: 'DAILY TEXTURE: Will the day-to-day work be meaningfully engaging at the intersection of systems thinking and creative/human domains? Score 10 for roles with direct creative/cultural/human dimension: creator relationships, editorial decisions, building new programs, cultural verticals (media, fashion, wellness, food, music). Score 7 for complex consumer products with clear human impact. Score 4 for enterprise or B2B where daily work is primarily internal. Score 1 for pure process management or maintenance of stable systems.',
    weight: 1,
  },
  regulated_complexity: {
    label: 'Structural Integrity',
    description: 'STRUCTURAL INTEGRITY: Does this organization have enough structure to support a reciprocal working relationship? Score 10 for established organizations with clear comp bands, defined reporting lines, and leadership tenure. Score 7 for mature startups with explicit scope and reasonable structure. Score 4 for early-stage environments with clear mandates and honest framing. Score 1 for red flags: vague JD language, "wear many hats" without equity, no defined team structure, or "hustle" substituting for institutional structure.',
    weight: 1,
  },
  bd_track_record: {
    label: 'Visibility',
    description: 'VISIBILITY: Will contribution be legible — externally-facing, partner-facing, or otherwise attributable? Score 10 for roles with clear external scope: BD/partnerships, creator relations, client/talent-facing, or where outcomes are directly credited. Score 7 for cross-functional roles where impact is measurable and credited. Score 4 for internal roles where contribution is real but credit is diffuse. Score 1 for support or execution roles where contribution is invisible by design.',
    weight: 1,
  },
  mba_preference: {
    label: 'Pioneering',
    description: 'PIONEERING VS. MAINTENANCE: Is this role building something new, or managing steady state? Score 10 for roles explicitly building a new program, launching a vertical, or defining a function from scratch. Score 7 for roles in growth or expansion mode with clear mandate to build. Score 4 for roles that mix building and maintenance. Score 1 for roles managing an established, stable function with no mandate to build, or where "innovation" is cosmetic language on a maintenance job.',
    weight: 1,
  },
  domain_gap: {
    label: 'Domain Fit',
    description: 'SECTOR ALIGNMENT: How well does the role\'s industry align with the candidate\'s target sectors? Score 10 for creator economy, publishing platforms, lifestyle partnerships, cultural media, music, sports, entertainment, the arts. Score 7 for fintech, healthtech, or GenAI at the intersection of creative industries. Score 4 for adjacent consumer platforms. Score 1 for generic big-tech PM, B2B SaaS, enterprise roles with no creator/culture angle.',
    weight: 1,
  },
  gap_bridgeability: {
    label: 'Gap Bridgeability',
    description: 'GAP BRIDGEABILITY: Even where a gap exists, how easily can the candidate bridge it? Score 10 if the gap is surface-level (learning a specific platform or vertical). Score 7 if the gap requires domain learning but transferable skills cover the core. Score 4 if the gap requires 2+ years of hard-to-fake experience. Score 1 if the gap is structural and non-negotiable (requires engineering degree, ML expertise, or deep technical background the candidate does not have).',
    weight: 1,
  },
}

// ── Shared helpers ────────────────────────────────────────────────────────────

export function computeAggregate(dimensions, weights) {
  const keys = Object.keys(dimensions).filter(k => k !== 'summary')
  if (!keys.length) return 0
  let total = 0
  let weightSum = 0
  for (const key of keys) {
    const score = typeof dimensions[key] === 'object' ? dimensions[key].score : dimensions[key]
    if (score == null) continue
    const w = weights?.[key] ?? 1
    total += score * w
    weightSum += w
  }
  return weightSum === 0 ? null : Math.round((total / weightSum) * 100) / 100
}

// ── Personality block builder ─────────────────────────────────────────────────

export function buildPersonalityBlock(personality) {
  if (!personality || typeof personality !== 'object') return ''
  const lines = []
  if (personality.mbti) lines.push(`Myers-Briggs: ${personality.mbti}`)
  if (personality.enneagram) lines.push(`Enneagram: ${personality.enneagram}`)
  if (personality.disc) lines.push(`DiSC: ${personality.disc}`)
  if (personality.sun_sign || personality.moon_sign || personality.rising_sign) {
    const astro = [
      personality.sun_sign && `sun ${personality.sun_sign}`,
      personality.moon_sign && `moon ${personality.moon_sign}`,
      personality.rising_sign && `rising ${personality.rising_sign}`,
    ].filter(Boolean).join(', ')
    lines.push(`Astrology: ${astro}`)
  }
  if (personality.strengths?.length) lines.push(`CliftonStrengths top 5: ${personality.strengths.join(', ')}`)
  return lines.join('\n')
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function scoreJob(job, profile) {
  // Use custom dimensions if the profile has them; fall back to defaults
  const customDims = profile.dimensions && Object.keys(profile.dimensions).length >= 3
    ? profile.dimensions
    : null
  const dimensions = customDims || DEFAULT_DIMENSIONS
  const dimKeys = Object.keys(dimensions)

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const personalityBlock = buildPersonalityBlock(profile.personality)

  const systemPrompt = `You are a job-fit evaluator. Assess the job listing against the candidate profile using exactly ${dimKeys.length} dimensions.

Candidate background:
${profile.background}
${personalityBlock ? `\nPersonality context:\n${personalityBlock}\n` : ''}
Dimensions to score (each 1–10):
${dimKeys.map(k => `- ${k}: ${dimensions[k].description || dimensions[k]}`).join('\n')}

Respond ONLY with valid JSON. No preamble, no backticks.
{
  "dimensions": {
    ${dimKeys.map(k => `"${k}": { "score": <1-10>, "reasoning": "<one sentence>" }`).join(',\n    ')}
  },
  "summary": "<2-3 sentence overall fit summary — do NOT include a numeric score>"
}`

  const userPrompt = `Job title: ${job.title}\n\nJob description:\n${job.description || '(no description provided)'}`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  })

  let parsed
  try {
    parsed = extractJSON(response.content[0].text)
  } catch (e) {
    const preview = response.content[0]?.text?.slice(0, 200)
    throw new Error(`Scorer: invalid JSON from Claude: ${e.message} | raw: ${preview}`)
  }

  // Build weights map: custom dims carry their own weight; defaults use profile.weights or 1
  const weightsMap = {}
  for (const k of dimKeys) {
    weightsMap[k] = customDims
      ? (profile.weights?.[k] ?? dimensions[k].weight ?? 1)
      : (profile.weights?.[k] ?? 1)
  }

  // Enrich each dimension with its label so JobDetail can display it correctly
  const enriched = {}
  for (const [k, v] of Object.entries(parsed.dimensions)) {
    enriched[k] = dimensions[k]?.label ? { ...v, label: dimensions[k].label } : v
  }

  const aggregate = computeAggregate(enriched, weightsMap)
  return { dimensions: enriched, aggregate, summary: parsed.summary }
}
