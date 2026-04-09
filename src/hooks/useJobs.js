import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchJobs, triggerRefresh, patchJob, createJob, deleteJob, fetchProfile, patchWeights } from '../api.js'
import { computeAggregate } from '../utils/scoring.js'

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
    sort: 'score_desc',
    statusFilter: 'all',
    location: '',
    hideNoJD: false,
  })
  const [savedWeights, setSavedWeights] = useState(null)   // loaded from server
  const [liveWeights, setLiveWeights] = useState(null)     // set by slider drag

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

  useEffect(() => {
    fetchProfile()
      .then(({ weights }) => {
        setSavedWeights(weights)
        setLiveWeights(weights)
      })
      .catch(err => console.error('[useJobs] fetchProfile failed:', err.message))
  }, [])

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

  const allJobsWithLiveScores = liveWeights
    ? jobs.map(job => {
        if (!job.score_dimensions) return job
        const liveScore = computeAggregate(job.score_dimensions, liveWeights)
        return liveScore === null ? job : { ...job, score_aggregate: liveScore }
      })
    : jobs

  const filteredJobs = allJobsWithLiveScores
    .filter(job => {
      if (!filters.showExpired && job.status === 'Expired') return false
      if (filters.sources.length > 0 && !filters.sources.includes(job.source)) return false
      if (filters.remote !== 'all' && job.remote !== filters.remote) return false
      if (filters.minScore > 0 && (job.score_aggregate == null || job.score_aggregate < filters.minScore)) return false
      if (filters.statusFilter === 'untracked' && job.status && job.status !== 'none') return false
      if (filters.statusFilter !== 'all' && filters.statusFilter !== 'untracked' && job.status !== filters.statusFilter) return false
      if (filters.location && !(job.location || '').toLowerCase().includes(filters.location.toLowerCase())) return false
      if (filters.hideNoJD && !job.description?.trim()) return false
      return true
    })
    .sort((a, b) => {
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

  const updateStatus = useCallback(async (id, updates) => {
    try {
      const updated = await patchJob(id, updates)
      setJobs(prev => prev.map(j => j.id === id ? { ...j, ...updated } : j))
    } catch (err) {
      console.error('[useJobs] updateStatus failed:', err.message)
    }
  }, [])

  const removeJob = useCallback(async (id) => {
    setJobs(prev => prev.filter(j => j.id !== id))
    deleteJob(id).catch(err => console.error('[useJobs] removeJob failed:', err.message))
  }, [])

  const addJob = useCallback(async (data) => {
    const job = await createJob(data)
    setJobs(prev => prev.some(j => j.id === job.id) ? prev.map(j => j.id === job.id ? job : j) : [...prev, job])
    return job
  }, [])

  const saveWeights = useCallback(async (weights) => {
    await patchWeights(weights)
    setSavedWeights(weights)
  }, [])

  return {
    jobs: filteredJobs,
    allJobs: allJobsWithLiveScores,
    loading, refreshing, error, lastRefreshed,
    filters, setFilters,
    refresh, updateStatus, addJob, removeJob,
    savedWeights, liveWeights, setLiveWeights, saveWeights,
  }
}
