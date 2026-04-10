import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useJobs } from '../../src/hooks/useJobs.js'

let mockFetchJobs = vi.fn()
let mockTriggerRefresh = vi.fn()
let mockPatchJob = vi.fn()
let mockCreateJob = vi.fn()
let mockDeleteJob = vi.fn()
let mockFetchProfile = vi.fn()
let mockPatchWeights = vi.fn()

const { MockAuthExpiredError } = vi.hoisted(() => {
  class MockAuthExpiredError extends Error {
    constructor() { super('auth_expired'); this.name = 'AuthExpiredError' }
  }
  return { MockAuthExpiredError }
})

vi.mock('../../src/api.js', () => ({
  fetchJobs: (...args) => mockFetchJobs(...args),
  triggerRefresh: (...args) => mockTriggerRefresh(...args),
  patchJob: (...args) => mockPatchJob(...args),
  createJob: (...args) => mockCreateJob(...args),
  deleteJob: (...args) => mockDeleteJob(...args),
  fetchProfile: (...args) => mockFetchProfile(...args),
  patchWeights: (...args) => mockPatchWeights(...args),
  AuthExpiredError: MockAuthExpiredError,
}))

const JOBS = [
  { id: 'j1', title: 'PM', company: 'Acme', score_aggregate: 8, status: null, source: 'manual', remote: 'remote', location: 'Remote', description: 'desc', fetched_at: null, score_dimensions: null },
  { id: 'j2', title: 'Engineer', company: 'Beta', score_aggregate: 5, status: 'Applied', source: 'linkedin', remote: 'remote', location: 'SF', description: null, fetched_at: null, score_dimensions: null },
]

const PROFILE = {
  weights: { core_mechanism: 1, gap_bridgeability: 1 },
  dimensions: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchJobs.mockResolvedValue(JOBS)
  mockFetchProfile.mockResolvedValue(PROFILE)
  mockPatchJob.mockResolvedValue({ id: 'j1', title: 'PM Updated', company: 'Acme', score_aggregate: 8, status: 'Applied' })
  mockCreateJob.mockResolvedValue({ id: 'j3', title: 'New Job', company: 'New Co', score_aggregate: null })
  mockDeleteJob.mockResolvedValue({})
  mockPatchWeights.mockResolvedValue({})
  mockTriggerRefresh.mockResolvedValue({})
  // Clean localStorage
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useJobs — initial load', () => {
  test('loads jobs on mount', async () => {
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockFetchJobs).toHaveBeenCalledTimes(1)
  })

  test('starts in loading state', () => {
    mockFetchJobs.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useJobs())
    expect(result.current.loading).toBe(true)
  })

  test('sets error when fetchJobs fails', async () => {
    mockFetchJobs.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.error).toBe('Network error'))
    expect(result.current.loading).toBe(false)
  })

  test('ignores AuthExpiredError (lets AuthContext handle it)', async () => {
    mockFetchJobs.mockRejectedValue(new MockAuthExpiredError())
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
  })

  test('also loads profile on mount', async () => {
    renderHook(() => useJobs())
    await waitFor(() => expect(mockFetchProfile).toHaveBeenCalledTimes(1))
  })

  test('silently swallows fetchProfile network error — does not set error state', async () => {
    mockFetchProfile.mockRejectedValue(new Error('Profile fetch failed'))
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.liveWeights).toBeNull()
  })

  test('silently swallows fetchProfile AuthExpiredError', async () => {
    mockFetchProfile.mockRejectedValue(new MockAuthExpiredError())
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.profileDimensions).toBeNull()
  })

  test('returns allJobs sorted by score descending', async () => {
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const scores = result.current.allJobs.map(j => j.score_aggregate)
    expect(scores[0]).toBeGreaterThanOrEqual(scores[1])
  })
})

describe('useJobs — filters', () => {
  test('jobs are filtered by default filters (no filter applied)', async () => {
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Both jobs are returned since default filters don't filter expired jobs and these aren't expired
    expect(result.current.jobs.length).toBeGreaterThan(0)
  })

  test('setFilters updates the filter state', async () => {
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      result.current.setFilters(f => ({ ...f, minScore: 7 }))
    })
    // Only j1 with score 8 passes minScore 7
    expect(result.current.jobs.every(j => j.score_aggregate >= 7)).toBe(true)
  })

  test('setFilters persists to localStorage', async () => {
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const newFilters = { ...result.current.filters, minScore: 6 }
    act(() => { result.current.setFilters(newFilters) })
    const stored = JSON.parse(localStorage.getItem('jobmatch_filters'))
    expect(stored.minScore).toBe(6)
  })
})

describe('useJobs — updateStatus', () => {
  test('calls patchJob and updates job in state', async () => {
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.updateStatus('j1', { status: 'Applied' })
    })
    expect(mockPatchJob).toHaveBeenCalledWith('j1', { status: 'Applied' })
    const j1 = result.current.allJobs.find(j => j.id === 'j1')
    expect(j1.title).toBe('PM Updated')
  })
})

describe('useJobs — markSeen', () => {
  test('marks a job as seen', async () => {
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => { result.current.markSeen('j1') })
    const j1 = result.current.allJobs.find(j => j.id === 'j1')
    expect(j1.seen).toBe(true)
  })
})

describe('useJobs — addJob', () => {
  test('calls createJob and adds to state', async () => {
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    let job
    await act(async () => {
      job = await result.current.addJob({ title: 'New Job', url: 'https://example.com' })
    })
    expect(mockCreateJob).toHaveBeenCalledWith({ title: 'New Job', url: 'https://example.com' })
    expect(job.id).toBe('j3')
    // job is in allJobs
    expect(result.current.allJobs.find(j => j.id === 'j3')).toBeDefined()
  })

  test('returns the created job', async () => {
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    let returned
    await act(async () => {
      returned = await result.current.addJob({ title: 'X' })
    })
    expect(returned.id).toBe('j3')
  })
})

describe('useJobs — removeJob', () => {
  test('optimistically removes job from state', async () => {
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => { result.current.removeJob('j1') })
    await waitFor(() => expect(result.current.allJobs.find(j => j.id === 'j1')).toBeUndefined())
  })

  test('calls deleteJob API', async () => {
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => { result.current.removeJob('j1') })
    await waitFor(() => expect(mockDeleteJob).toHaveBeenCalledWith('j1'))
  })
})

describe('useJobs — saveWeights', () => {
  test('calls patchWeights and updates savedWeights', async () => {
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const newWeights = { core_mechanism: 3, gap_bridgeability: 1 }
    await act(async () => {
      await result.current.saveWeights(newWeights)
    })
    expect(mockPatchWeights).toHaveBeenCalledWith(newWeights)
    expect(result.current.savedWeights).toEqual(newWeights)
  })
})

describe('useJobs — refresh', () => {
  test('calls triggerRefresh and sets refreshing=true while waiting', async () => {
    // triggerRefresh resolves immediately but the 5-second timeout keeps refreshing=true
    mockTriggerRefresh.mockResolvedValue({})
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))

    vi.useFakeTimers()
    await act(async () => { await result.current.refresh() })
    expect(mockTriggerRefresh).toHaveBeenCalledTimes(1)
    expect(result.current.refreshing).toBe(true)

    // Advance timer so the delayed load fires
    await act(async () => { await vi.advanceTimersByTimeAsync(5100) })
    expect(result.current.refreshing).toBe(false)
    expect(mockFetchJobs).toHaveBeenCalledTimes(2) // initial + reload
  })

  test('sets error when triggerRefresh fails', async () => {
    mockTriggerRefresh.mockRejectedValue(new Error('Refresh failed'))
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.refresh().catch(() => {})
    })
    expect(result.current.error).toBe('Refresh failed')
    expect(result.current.refreshing).toBe(false)
  })
})

describe('useJobs — live score recalculation', () => {
  test('recomputes scores when liveWeights differ from job weights', async () => {
    // Job with score_dimensions
    const jobWithDims = {
      ...JOBS[0],
      score_aggregate: 5,
      score_dimensions: { a: { score: 8 }, b: { score: 6 } },
    }
    mockFetchJobs.mockResolvedValue([jobWithDims])
    mockFetchProfile.mockResolvedValue({ weights: { a: 1, b: 1 }, dimensions: null })

    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))

    // With equal weights a=1, b=1: aggregate = (8+6)/2 = 7
    await waitFor(() => {
      const j = result.current.allJobs.find(j => j.id === 'j1')
      return j && j.score_aggregate !== 5 // score should change from stored value
    })

    const j = result.current.allJobs.find(j => j.id === 'j1')
    expect(j.score_aggregate).toBe(7)
  })
})

describe('useJobs — unseenCount', () => {
  test('counts unseen jobs', async () => {
    // Simulate first-time load where lastVisit is 0 and fetched_at is recent
    mockFetchJobs.mockResolvedValue([
      { ...JOBS[0], fetched_at: new Date().toISOString() },
      { ...JOBS[1], fetched_at: new Date().toISOString() },
    ])
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Both jobs have fetched_at newer than lastVisit (0), so both are unseen
    expect(result.current.unseenCount).toBe(2)
  })

  test('decrements unseenCount when markSeen is called', async () => {
    mockFetchJobs.mockResolvedValue([
      { ...JOBS[0], fetched_at: new Date().toISOString() },
      { ...JOBS[1], fetched_at: new Date().toISOString() },
    ])
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.unseenCount).toBe(2))
    act(() => { result.current.markSeen('j1') })
    expect(result.current.unseenCount).toBe(1)
  })
})

describe('useJobs — profileDimensions', () => {
  test('sets profileDimensions when fetchProfile returns dimensions', async () => {
    const dims = {
      creativity: { label: 'Creativity', description: 'desc', weight: 1 },
      impact: { label: 'Impact', description: 'desc', weight: 1 },
      culture: { label: 'Culture', description: 'desc', weight: 1 },
    }
    mockFetchProfile.mockResolvedValue({ weights: {}, dimensions: dims })
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profileDimensions).toEqual(dims)
  })

  test('profileDimensions is null when profile has no dimensions', async () => {
    mockFetchProfile.mockResolvedValue({ weights: {}, dimensions: null })
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profileDimensions).toBeNull()
  })
})

describe('useJobs — addJob deduplication', () => {
  test('updates existing job in state when created job id already exists', async () => {
    const existingJob = { id: 'j1', title: 'PM', company: 'Acme', score_aggregate: 8, status: null, source: 'manual', remote: 'remote', location: 'Remote', description: 'desc', fetched_at: null, score_dimensions: null }
    mockFetchJobs.mockResolvedValue([existingJob])
    const updatedJob = { ...existingJob, title: 'PM Updated' }
    mockCreateJob.mockResolvedValue(updatedJob)
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.addJob({ title: 'PM', url: 'https://existing.com' }) })
    // j1 should be updated, not duplicated
    const j1s = result.current.allJobs.filter(j => j.id === 'j1')
    expect(j1s).toHaveLength(1)
    expect(j1s[0].title).toBe('PM Updated')
  })
})

describe('useJobs — reloadProfile', () => {
  test('updates liveWeights when reloadProfile is called', async () => {
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Change mock to return different weights
    const newWeights = { core_mechanism: 3, gap_bridgeability: 2 }
    mockFetchProfile.mockResolvedValue({ weights: newWeights, dimensions: null })
    await act(async () => { result.current.reloadProfile() })
    await waitFor(() => expect(result.current.liveWeights).toEqual(newWeights))
  })

  test('updates profileDimensions when reloadProfile returns new dimensions', async () => {
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const newDims = {
      leadership: { label: 'Leadership', description: 'Leads teams', weight: 1 },
      impact: { label: 'Impact', description: 'Business outcomes', weight: 1 },
      culture_fit: { label: 'Culture Fit', description: 'Values match', weight: 1 },
    }
    mockFetchProfile.mockResolvedValue({ weights: {}, dimensions: newDims })
    await act(async () => { result.current.reloadProfile() })
    await waitFor(() => expect(result.current.profileDimensions).toEqual(newDims))
  })
})

describe('useJobs — filters from localStorage', () => {
  test('initialises filters from localStorage when persisted data exists', async () => {
    localStorage.setItem('jobmatch_filters', JSON.stringify({ minScore: 7, sort: 'newest' }))
    const { result } = renderHook(() => useJobs())
    // Filters should be merged with defaults from localStorage on mount
    expect(result.current.filters.minScore).toBe(7)
    expect(result.current.filters.sort).toBe('newest')
  })

  test('falls back to DEFAULT_FILTERS when localStorage has invalid JSON', async () => {
    localStorage.setItem('jobmatch_filters', '{invalid json}')
    const { result } = renderHook(() => useJobs())
    // Should not throw and should use defaults
    expect(result.current.filters.minScore).toBe(0)
    expect(result.current.filters.sort).toBe('score_desc')
  })
})

describe('useJobs — removeJob failure', () => {
  test('job stays removed from UI when deleteJob fails (no rollback)', async () => {
    mockDeleteJob.mockRejectedValue(new Error('DB error'))
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => { result.current.removeJob('j1') })
    await waitFor(() => expect(result.current.allJobs.find(j => j.id === 'j1')).toBeUndefined())
    // Even after the rejection settles, job is still gone
    await waitFor(() => expect(mockDeleteJob).toHaveBeenCalled())
    expect(result.current.allJobs.find(j => j.id === 'j1')).toBeUndefined()
  })
})

describe('useJobs — updateStatus failure', () => {
  test('updateStatus failure is silently swallowed — no error state set', async () => {
    mockPatchJob.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useJobs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.updateStatus('j1', { status: 'Applied' }) })
    // Error is caught internally — error state remains null
    expect(result.current.error).toBeNull()
    // Job is unchanged in state (no optimistic update for failed calls)
    const j1 = result.current.allJobs.find(j => j.id === 'j1')
    expect(j1.status).toBeNull()
  })
})
