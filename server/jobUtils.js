/**
 * Applies an age-based score penalty to a job.
 * Jobs posted more than 30 days ago have their score reduced by 2, floored at 1.
 *
 * @param {object} job - job object with score_aggregate, posted_at, fetched_at
 * @param {number} now - current timestamp in ms (Date.now())
 * @returns {object} - job with updated score_aggregate (or unchanged if not penalized)
 */
export function applyAgePenalty(job, now) {
  if (!job.score_aggregate) return job
  const dateStr = job.posted_at || (job.fetched_at && new Date(job.fetched_at).toISOString().slice(0, 10))
  if (!dateStr) return job
  const ageDays = (now - new Date(dateStr).getTime()) / 86_400_000
  if (ageDays > 30) {
    return { ...job, score_aggregate: Math.max(1, +(job.score_aggregate - 2).toFixed(2)) }
  }
  return job
}
