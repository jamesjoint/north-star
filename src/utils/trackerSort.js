export function sortTrackerJobs(jobs, sortKey) {
  return [...jobs].sort((a, b) => {
    switch (sortKey) {
      case 'score_desc':
        return (b.score_aggregate ?? -1) - (a.score_aggregate ?? -1)
      case 'company_asc':
        return (a.company || '').localeCompare(b.company || '')
      case 'followup_asc': {
        if (!a.follow_up_date && !b.follow_up_date) return 0
        if (!a.follow_up_date) return 1
        if (!b.follow_up_date) return -1
        return a.follow_up_date.localeCompare(b.follow_up_date)
      }
      case 'applied_desc':
      default: {
        if (!a.applied_date && !b.applied_date) return 0
        if (!a.applied_date) return 1
        if (!b.applied_date) return -1
        return b.applied_date.localeCompare(a.applied_date)
      }
    }
  })
}
