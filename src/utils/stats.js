/** Format a conversion rate as a percentage string, or '—' when denominator is 0. */
export function convRate(num, den) {
  return den === 0 ? '—' : `${Math.round((num / den) * 100)}%`
}

/**
 * Compute tracker statistics for a list of jobs.
 * Accepts an optional `now` Date for testability (defaults to current time).
 */
export function computeStats(jobs, now = new Date()) {
  function localDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  const tracked = jobs.filter(j => j.status && j.status !== 'none')
  const weekAgo  = localDate(new Date(now - 7  * 86_400_000))
  const monthAgo = localDate(new Date(now - 30 * 86_400_000))
  const byStatus = {}
  for (const j of tracked) byStatus[j.status] = (byStatus[j.status] || 0) + 1
  const appliedCount      = byStatus['Applied']      || 0
  const interviewingCount = byStatus['Interviewing'] || 0
  const offerCount        = byStatus['Offer']        || 0
  const appliedThisWeek   = tracked.filter(j => j.applied_date && j.applied_date >= weekAgo).length
  const appliedThisMonth  = tracked.filter(j => j.applied_date && j.applied_date >= monthAgo).length
  return { byStatus, appliedCount, interviewingCount, offerCount, appliedThisWeek, appliedThisMonth }
}
