import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchJobs, triggerRefresh, patchJob } from '../api.js'

export function useJobs() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [filters, setFilters] = useState({
    sources: [],
    remote: 'all',
    minScore: 0,
    showExpired: false,
  })

  const mountedRef = useRef(true)
  const timerIdRef = useRef(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimeout(timerIdRef.current)
    }
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchJobs()
      if (!mountedRef.current) return
      setJobs([...data].sort((a, b) => (b.score_aggregate ?? -1) - (a.score_aggregate ?? -1)))
      setLastRefreshed(new Date())
    } catch (err) {
      if (!mountedRef.current) return
      setError(err.message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true)
      await triggerRefresh()
      timerIdRef.current = setTimeout(async () => {
        await load()
        if (mountedRef.current) setRefreshing(false)
      }, 5000)
    } catch (err) {
      setError(err.message)
      setRefreshing(false)
    }
  }, [load])

  const filteredJobs = jobs.filter(job => {
    if (!filters.showExpired && job.status === 'Expired') return false
    if (filters.sources.length > 0 && !filters.sources.includes(job.source)) return false
    if (filters.remote !== 'all' && job.remote !== filters.remote) return false
    if (filters.minScore > 0 && (job.score_aggregate == null || job.score_aggregate < filters.minScore)) return false
    return true
  })

  const updateStatus = useCallback(async (id, updates) => {
    try {
      const updated = await patchJob(id, updates)
      setJobs(prev => prev.map(j => j.id === id ? { ...j, ...updated } : j))
    } catch (err) {
      console.error('[useJobs] updateStatus failed:', err.message)
    }
  }, [])

  return { jobs: filteredJobs, allJobs: jobs, loading, refreshing, error, lastRefreshed, filters, setFilters, refresh, updateStatus }
}
