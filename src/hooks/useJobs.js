import { useState, useEffect, useCallback } from 'react'
import { fetchJobs, triggerRefresh } from '../api.js'

export function useJobs() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [filters, setFilters] = useState({
    sources: [],       // [] means all
    remote: 'all',     // 'all' | 'remote' | 'onsite' | 'hybrid'
    minScore: 0,
  })

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchJobs()
      setJobs(data)
      setLastRefreshed(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true)
      await triggerRefresh()
      // Poll for new results after a short delay (pipeline is async)
      setTimeout(() => load(), 5000)
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }, [load])

  const filteredJobs = jobs.filter(job => {
    if (filters.sources.length > 0 && !filters.sources.includes(job.source)) return false
    if (filters.remote !== 'all' && job.remote !== filters.remote) return false
    if (filters.minScore > 0 && (job.score_aggregate === null || job.score_aggregate < filters.minScore)) return false
    return true
  })

  return { jobs: filteredJobs, allJobs: jobs, loading, refreshing, error, lastRefreshed, filters, setFilters, refresh }
}
