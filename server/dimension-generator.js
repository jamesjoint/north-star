import Anthropic from '@anthropic-ai/sdk'
import { extractJSON } from './utils.js'

export async function generateDimensions(background, profile = {}) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const personalityLines = []
  if (profile.personality) {
    const p = profile.personality
    if (p.mbti) personalityLines.push(`Myers-Briggs: ${p.mbti}`)
    if (p.enneagram) personalityLines.push(`Enneagram: ${p.enneagram}`)
    if (p.disc) personalityLines.push(`DiSC: ${p.disc}`)
    if (p.strengths?.length) personalityLines.push(`CliftonStrengths top 5: ${p.strengths.join(', ')}`)
    if (p.sun_sign) personalityLines.push(`Sun sign: ${p.sun_sign}`)
    if (p.moon_sign) personalityLines.push(`Moon sign: ${p.moon_sign}`)
    if (p.rising_sign) personalityLines.push(`Rising sign: ${p.rising_sign}`)
  }

  const targetsLines = [
    profile.target_level?.length ? `Target level: ${profile.target_level.join(', ')}` : null,
    profile.target_roles ? `Target roles: ${profile.target_roles}` : null,
    profile.target_sectors ? `Target sectors: ${profile.target_sectors}` : null,
  ].filter(Boolean)

  const extraContext = [
    personalityLines.length
      ? `Personality context (let this shape which dimensions matter most — e.g. high-D DiSC should emphasise autonomy and impact; INFJ should emphasise mission and meaning):\n${personalityLines.join('\n')}`
      : null,
    targetsLines.length
      ? `Stated targets (dimensions must reflect these specifically — always include a seniority/level dimension when target level is provided):\n${targetsLines.join('\n')}`
      : null,
  ].filter(Boolean).join('\n\n')

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: `You are a job-fit dimension designer. Given a candidate's professional background, generate 5–8 scoring dimensions that a job-scoring model will use to evaluate job listings against this specific person.

Rules:
- Each dimension captures a distinct, high-signal aspect of fit that matters for THIS candidate.
- Rubrics must be concrete: say what earns a 10, a 7, a 4, and a 1 — not vague adjectives.
- Keys must be snake_case, 2–4 words, globally unique.
- Weights: 1.5 for 2–3 most critical dimensions, 1.0 for standard, 0.5 for secondary signals.
- Do not include generic dimensions like "years_of_experience" or "salary_range".

Respond ONLY with valid JSON. No preamble, no explanation, no backticks.

{
  "dimensions": {
    "<key>": {
      "label": "<short human-readable name, 2–4 words>",
      "description": "<concrete scoring rubric — 4–6 sentences covering the full 1–10 range>",
      "weight": <number>
    }
  }
}`,
    messages: [{
      role: 'user',
      content: `Candidate background:\n\n${background}${extraContext ? `\n\n${extraContext}` : ''}\n\nGenerate 5–8 scoring dimensions for this candidate.`,
    }],
  })

  const parsed = extractJSON(response.content[0].text)
  return parsed.dimensions
}
