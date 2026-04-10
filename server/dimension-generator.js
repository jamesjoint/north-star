import Anthropic from '@anthropic-ai/sdk'
import { extractJSON } from './utils.js'

/**
 * Given a candidate's background text, ask Claude to generate
 * 5-8 personalised scoring dimensions for job evaluation.
 *
 * Returns an object keyed by dimension id:
 * {
 *   "<snake_case_key>": {
 *     "label": "Human-readable name",
 *     "description": "Scoring guidance (what earns 10 / 7 / 4 / 1)",
 *     "weight": 1.0   // 1.5 for most important, 0.5 for secondary
 *   }, ...
 * }
 */
export async function generateDimensions(background) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
      content: `Candidate background:\n\n${background}\n\nGenerate 5–8 scoring dimensions for this candidate.`,
    }],
  })

  const parsed = extractJSON(response.content[0].text)
  return parsed.dimensions
}
