export const DEFAULT_FILTERS = {
  sources: [], remote: 'all', minScore: 0, showExpired: false,
  sort: 'score_desc', statusFilter: 'all', location: '', query: '', hideNoJD: false,
}

/** Returns true when no filters are active (all at their defaults). */
export function isDefaultFilters(filters) {
  return filters.sources.length === 0 && filters.remote === 'all' && filters.minScore === 0
    && !filters.showExpired && filters.sort === 'score_desc' && filters.statusFilter === 'all'
    && !filters.location && !filters.query && !filters.hideNoJD
}

/**
 * Pure filter + sort function for job lists.
 * Extracted from useJobs.js so it can be unit tested independently.
 */
export function applyFilters(jobs, filters) {
  const filtered = jobs.filter(job => {
    if (!filters.showExpired && filters.statusFilter !== 'Expired' && job.status === 'Expired') return false
    if (filters.sources.length > 0 && !filters.sources.includes(job.source)) return false
    if (filters.remote !== 'all' && job.remote !== filters.remote) return false
    if (filters.minScore > 0 && (job.score_aggregate == null || job.score_aggregate < filters.minScore)) return false
    if (filters.statusFilter === 'untracked' && job.status && job.status !== 'none') return false
    if (filters.statusFilter !== 'all' && filters.statusFilter !== 'untracked' && job.status !== filters.statusFilter) return false
    if (filters.location && !(job.location || '').toLowerCase().includes(filters.location.toLowerCase())) return false
    if (filters.query) {
      const q = filters.query.toLowerCase()
      const matchTitle = (job.title || '').toLowerCase().includes(q)
      const matchCompany = (job.company || '').toLowerCase().includes(q)
      if (!matchTitle && !matchCompany) return false
    }
    if (filters.hideNoJD && !job.description?.trim()) return false
    return true
  })

  return filtered.sort((a, b) => {
    switch (filters.sort) {
      case 'score_asc':
        return (a.score_aggregate ?? 11) - (b.score_aggregate ?? 11)
      case 'newest': {
        const da = a.posted_at || (a.fetched_at && a.fetched_at.slice(0, 10)) || ''
        const db_ = b.posted_at || (b.fetched_at && b.fetched_at.slice(0, 10)) || ''
        return db_.localeCompare(da)
      }
      case 'oldest': {
        const da = a.posted_at || (a.fetched_at && a.fetched_at.slice(0, 10)) || ''
        const db_ = b.posted_at || (b.fetched_at && b.fetched_at.slice(0, 10)) || ''
        return da.localeCompare(db_)
      }
      case 'company_asc':
        return (a.company || '').localeCompare(b.company || '')
      case 'score_desc':
      default:
        return (b.score_aggregate ?? -1) - (a.score_aggregate ?? -1)
    }
  })
}
