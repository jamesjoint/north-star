/**
 * Return a hex colour for a numeric score (null → gray, ≥7 → green, ≥4 → yellow, else pink).
 */
export function scoreColor(s) {
  if (s == null) return '#c7c7cc'
  if (s >= 7) return '#1D6F42'
  if (s >= 4) return '#B07D00'
  return '#999'
}

/**
 * Safely parse a score_dimensions value that may be a JSON string or already an object.
 * Returns {} on failure.
 */
export function parseDimensions(raw) {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return {} }
  }
  return raw
}

/**
 * Replicates server/scorer.js computeAggregate.
 * scoreDimensions: { <key>: { score, reasoning }, ..., summary: "..." }
 * weights: { <key>: number, ... }
 * Returns null if no dimension scores exist.
 */
export function computeAggregate(scoreDimensions, weights) {
  if (!scoreDimensions) return null
  let total = 0
  let weightSum = 0
  for (const [key, val] of Object.entries(scoreDimensions)) {
    if (key === 'summary') continue
    const score = typeof val === 'object' ? val?.score : val
    if (score == null) continue
    const w = weights?.[key] ?? 1
    total += score * w
    weightSum += w
  }
  if (weightSum === 0) return null
  return Math.round((total / weightSum) * 100) / 100
}
