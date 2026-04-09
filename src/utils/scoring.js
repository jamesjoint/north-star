const DIMS = [
  'core_mechanism', 'gap_bridgeability', 'bd_track_record', 'product_depth',
  'regulated_complexity', 'mba_preference', 'domain_gap',
]

/**
 * Replicates server/scorer.js computeAggregate.
 * scoreDimensions: { core_mechanism: { score, reasoning }, ..., summary: "..." }
 * weights: { core_mechanism: 3.5, ... }
 * Returns null if no dimension scores exist.
 */
export function computeAggregate(scoreDimensions, weights) {
  if (!scoreDimensions) return null
  let total = 0
  let weightSum = 0
  for (const dim of DIMS) {
    const score = scoreDimensions[dim]?.score
    if (score == null) continue
    const w = weights[dim] ?? 1
    total += score * w
    weightSum += w
  }
  if (weightSum === 0) return null
  return Math.round((total / weightSum) * 100) / 100
}
