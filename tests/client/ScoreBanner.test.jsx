import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import ScoreBanner from '../../src/components/ScoreBanner.jsx'

let mockFetchRescoreStatus = vi.fn()
vi.mock('../../src/api.js', () => ({
  fetchRescoreStatus: (...args) => mockFetchRescoreStatus(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ScoreBanner', () => {
  test('renders nothing when scoring is not running and has never run', async () => {
    mockFetchRescoreStatus.mockResolvedValue({ running: false, lastTs: null, lastCount: null })
    const { container } = render(<ScoreBanner />)
    await waitFor(() => expect(mockFetchRescoreStatus).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })

  test('shows "Scoring your jobs…" when running is true', async () => {
    mockFetchRescoreStatus.mockResolvedValue({ running: true })
    render(<ScoreBanner />)
    expect(await screen.findByText('Scoring your jobs…')).toBeInTheDocument()
  })

  test('calls onDone and hides banner when scoring finishes mid-poll interval', async () => {
    const onDone = vi.fn()
    const mountTs = Date.now()
    // Simulate: scoring already finished (lastTs is newer than component mount)
    mockFetchRescoreStatus.mockResolvedValue({
      running: false,
      lastTs: mountTs + 1000,  // finished after mount
      lastCount: 7,
    })
    render(<ScoreBanner onDone={onDone} />)
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(await screen.findByText(/7 jobs scored/)).toBeInTheDocument()
  })

  test('shows "Scoring complete" when lastCount is null after finishing', async () => {
    const onDone = vi.fn()
    mockFetchRescoreStatus.mockResolvedValue({
      running: false,
      lastTs: Date.now() + 1000,
      lastCount: null,
    })
    render(<ScoreBanner onDone={onDone} />)
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(await screen.findByText(/Scoring complete/)).toBeInTheDocument()
  })

  test('calls onDone when running transitions from true to false across poll intervals', async () => {
    vi.useFakeTimers()
    try {
      const onDone = vi.fn()
      mockFetchRescoreStatus
        .mockResolvedValueOnce({ running: true, lastTs: null, lastCount: null })
        .mockResolvedValueOnce({ running: false, lastTs: Date.now(), lastCount: 5 })

      await act(async () => {
        render(<ScoreBanner onDone={onDone} />)
        await vi.advanceTimersByTimeAsync(100)
      })
      expect(screen.getByText('Scoring your jobs…')).toBeInTheDocument()

      // Advance 3s to fire the setInterval second poll
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(onDone).toHaveBeenCalled()
      expect(screen.getByText(/5 jobs scored/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  test('does not call onDone when running=false and lastTs is older than mount', async () => {
    const onDone = vi.fn()
    mockFetchRescoreStatus.mockResolvedValue({
      running: false,
      lastTs: Date.now() - 10000,  // finished before mount
      lastCount: 3,
    })
    render(<ScoreBanner onDone={onDone} />)
    await waitFor(() => expect(mockFetchRescoreStatus).toHaveBeenCalled())
    expect(onDone).not.toHaveBeenCalled()
  })

  test('silently ignores fetch errors and renders nothing', async () => {
    mockFetchRescoreStatus.mockRejectedValue(new Error('Network error'))
    const { container } = render(<ScoreBanner />)
    await waitFor(() => expect(mockFetchRescoreStatus).toHaveBeenCalled())
    // Error is swallowed — banner stays hidden
    expect(container.firstChild).toBeNull()
  })
})
