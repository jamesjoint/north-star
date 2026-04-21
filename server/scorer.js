import Anthropic from '@anthropic-ai/sdk'
import { extractJSON } from './utils.js'

// ── Default dimensions (generic fallback) ────────────────────────────────────

const DEFAULT_DIMENSIONS = {
  role_alignment: {
    label: 'Role Alignment',
    description: 'ROLE ALIGNMENT: How well does the role\'s title and scope match the candidate\'s target roles? Score 10 for an exact title match with identical scope. Score 7 for a closely related title with overlapping responsibilities. Score 4 for a tangential role where some skills transfer. Score 1 for a role with no meaningful overlap to the candidate\'s stated targets.',
    weight: 1.5,
  },
  level_fit: {
    label: 'Level Fit',
    description: 'LEVEL FIT: Does the seniority level of the role match what the candidate is targeting? Score 10 for an exact level match. Score 7 if the role is one level above or below the target. Score 4 if the role is two levels away. Score 1 if the role is dramatically above or below the candidate\'s stated level.',
    weight: 1.5,
  },
  sector_fit: {
    label: 'Sector Fit',
    description: 'SECTOR FIT: How well does the role\'s industry align with the candidate\'s target sectors? Score 10 for an exact sector match. Score 7 for an adjacent sector with strong transferability. Score 4 for a different sector where core skills still apply. Score 1 for a sector completely outside the candidate\'s stated interests.',
    weight: 1,
  },
  skills_match: {
    label: 'Skills Match',
    description: 'SKILLS MATCH: How well does the candidate\'s background cover the role\'s stated requirements? Score 10 if the candidate meets all key requirements. Score 7 if the candidate meets most requirements with minor gaps. Score 4 if the candidate meets roughly half the requirements. Score 1 if the candidate lacks most stated requirements.',
    weight: 1,
  },
  growth_potential: {
    label: 'Growth Potential',
    description: 'GROWTH POTENTIAL: Does this role offer meaningful career growth from the candidate\'s current position? Score 10 for a role that clearly advances scope, title, or compensation. Score 7 for lateral growth into a new domain. Score 4 for a role at the same level with limited new exposure. Score 1 for a step backward in title or responsibility.',
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

  const targetsLines = [
    profile.target_level?.length ? `Level: ${profile.target_level.join(', ')}` : null,
    profile.target_roles ? `Roles: ${profile.target_roles}` : null,
    profile.target_sectors ? `Sectors: ${profile.target_sectors}` : null,
  ].filter(Boolean)
  const targetsSection = targetsLines.length > 0
    ? `\nCandidate targets:\n${targetsLines.map(l => `- ${l}`).join('\n')}\n`
    : ''

  const systemPrompt = `You are a job-fit evaluator. Assess the job listing against the candidate profile using exactly ${dimKeys.length} dimensions.

Candidate background:
${profile.background}
${personalityBlock ? `\nPersonality context:\n${personalityBlock}\n` : ''}${targetsSection}
Dimensions to score (each 1–10):
${dimKeys.map(k => `- ${k}: ${dimensions[k].description || dimensions[k]}`).join('\n')}

Respond ONLY with valid JSON. No preamble, no backticks.
{
  "dimensions": {
    ${dimKeys.map(k => `"${k}": { "score": <1-10>, "reasoning": "<one sentence>" }`).join(',\n    ')}
  },
  "summary": "<2-3 sentence overall fit summary — do NOT include a numeric score. Write at a Gunning Fog Index of 7: short sentences (under 18 words), plain words, avoid jargon and polysyllabic words.>"
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
