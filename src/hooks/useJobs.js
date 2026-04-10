import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchJobs, triggerRefresh, patchJob, createJob, deleteJob, fetchProfile, patchWeights, AuthExpiredError } from '../api.js'
import { computeAggregate } from '../utils/scoring.js'
import { applyFilters, DEFAULT_FILTERS } from '../utils/filters.js'

const LAST_VISIT_KEY = 'jobmatch_last_visit'
const FILTERS_KEY = 'jobmatch_filters'

function loadFilters() {
  try {
    const saved = localStorage.getItem(FILTERS_KEY)
    if (!saved) return DEFAULT_FILTERS
    return { ...DEFAULT_FILTERS, ...JSON.parse(saved) }
  } catch {
    return DEFAULT_FILTERS
  }
}

export function useJobs() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [filters, setFiltersState] = useState(loadFilters)

  const setFilters = useCallback((next) => {
    setFiltersState(next)
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }, [])
  const [savedWeights, setSavedWeights] = useState(null)   // loaded from server
  const [liveWeights, setLiveWeights] = useState(null)     // set by slider drag
  const [profileDimensions, setProfileDimensions] = useState(null) // custom dims from Claude

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
      const lastVisitTs = parseInt(localStorage.getItem(LAST_VISIT_KEY) || '0', 10)
      const data = await fetchJobs()
      if (!mountedRef.current) return
      const withSeen = data.map(job => ({
        ...job,
        seen: !job.fetched_at || new Date(job.fetched_at).getTime() <= lastVisitTs,
      }))
      localStorage.setItem(LAST_VISIT_KEY, Date.now().toString())
      setJobs([...withSeen].sort((a, b) => (b.score_aggregate ?? -1) - (a.score_aggregate ?? -1)))
      setLastRefreshed(new Date())
    } catch (err) {
      if (!mountedRef.current) return
      if (err instanceof AuthExpiredError) return  // AuthContext handles the redirect
      setError(err.message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const loadProfile = useCallback(() => {
    fetchProfile()
      .then(({ weights, dimensions }) => {
        setSavedWeights(weights)
        setLiveWeights(weights)
        if (dimensions) setProfileDimensions(dimensions)
      })
      .catch(err => { if (!(err instanceof AuthExpiredError)) console.error('[useJobs] fetchProfile failed:', err.message) })
  }, [])

  useEffect(() => { loadProfile() }, [loadProfile])

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

  const filteredJobs = applyFilters(allJobsWithLiveScores, filters)

  const markSeen = useCallback((id) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, seen: true } : j))
  }, [])

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

  const unseenCount = allJobsWithLiveScores.filter(j => !j.seen).length

  return {
    jobs: filteredJobs,
    allJobs: allJobsWithLiveScores,
    unseenCount,
    loading, refreshing, error, lastRefreshed,
    filters, setFilters,
    refresh, reloadJobs: load, reloadProfile: loadProfile, updateStatus, markSeen, addJob, removeJob,
    savedWeights, liveWeights, setLiveWeights, saveWeights,
    profileDimensions,
  }
}
