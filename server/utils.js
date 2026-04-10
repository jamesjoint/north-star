/**
 * Strips markdown code fences and extracts the first JSON object from a string.
 * Handles responses from Claude that may include preamble text or ` ```json ` fences.
 */
export function extractJSON(text) {
  const stripped = text.replace(/```json|```/g, '')
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  const clean = start !== -1 && end !== -1 ? stripped.slice(start, end + 1) : stripped.trim()
  return JSON.parse(clean)
}
