import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import Settings from '../../src/components/Settings.jsx'

let mockFetchRescoreStatus = vi.fn()
vi.mock('../../src/api.js', () => ({
  fetchRescoreStatus: (...args) => mockFetchRescoreStatus(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchRescoreStatus.mockResolvedValue({ running: false, lastTs: null, lastCount: null })
})

afterEach(() => {
  vi.useRealTimers()
})

const BASE_WEIGHTS = { core_mechanism: 1, gap_bridgeability: 1, bd_track_record: 1, product_depth: 1, regulated_complexity: 1, mba_preference: 1, domain_gap: 1 }

function renderSettings(overrides = {}) {
  const props = {
    liveWeights: BASE_WEIGHTS,
    setLiveWeights: vi.fn(),
    savedWeights: BASE_WEIGHTS,
    saveWeights: vi.fn().mockResolvedValue({}),
    profileDimensions: null,
    ...overrides,
  }
  render(<Settings {...props} />)
  return props
}

describe('Settings — rendering', () => {
  test('renders all 7 default dimension labels', () => {
    renderSettings()
    expect(screen.getByText('Connector Fit')).toBeInTheDocument()
    expect(screen.getByText('Gap Bridgeability')).toBeInTheDocument()
    expect(screen.getByText('Visibility')).toBeInTheDocument()
    expect(screen.getByText('Daily Texture')).toBeInTheDocument()
    expect(screen.getByText('Structural Integrity')).toBeInTheDocument()
    expect(screen.getByText('Pioneering')).toBeInTheDocument()
    expect(screen.getByText('Domain Fit')).toBeInTheDocument()
  })

  test('shows weight badges for each dimension', () => {
    renderSettings()
    const badges = screen.getAllByText('1×')
    expect(badges.length).toBe(7)
  })

  test('shows "personalised" badge when profileDimensions has 3+ keys', () => {
    renderSettings({
      profileDimensions: {
        dim1: { label: 'Dim 1', description: 'test', weight: 1 },
        dim2: { label: 'Dim 2', description: 'test', weight: 1 },
        dim3: { label: 'Dim 3', description: 'test', weight: 1 },
      },
    })
    expect(screen.getByText(/personalised/i)).toBeInTheDocument()
  })

  test('does not show "personalised" badge when profileDimensions is null', () => {
    renderSettings({ profileDimensions: null })
    expect(screen.queryByText(/personalised/i)).not.toBeInTheDocument()
  })

  test('uses profile dimension labels when profileDimensions has 3+ keys', () => {
    renderSettings({
      profileDimensions: {
        leadership: { label: 'Leadership', description: 'Leads teams', weight: 1 },
        impact: { label: 'Impact', description: 'Business impact', weight: 1 },
        culture_fit: { label: 'Culture Fit', description: 'Values', weight: 1 },
      },
      liveWeights: { leadership: 1, impact: 1, culture_fit: 1 },
      savedWeights: { leadership: 1, impact: 1, culture_fit: 1 },
    })
    expect(screen.getByText('Leadership')).toBeInTheDocument()
    expect(screen.getByText('Impact')).toBeInTheDocument()
    expect(screen.getByText('Culture Fit')).toBeInTheDocument()
    // Default labels should NOT appear
    expect(screen.queryByText('Connector Fit')).not.toBeInTheDocument()
  })
})

describe('Settings — Save button state', () => {
  test('Save button is disabled when weights match saved (not dirty)', () => {
    renderSettings()
    expect(screen.getByRole('button', { name: 'Save Weights' })).toBeDisabled()
  })

  test('Save button is enabled when weights differ from saved (dirty)', () => {
    renderSettings({ liveWeights: { ...BASE_WEIGHTS, core_mechanism: 3 } })
    expect(screen.getByRole('button', { name: 'Save Weights' })).not.toBeDisabled()
  })

  test('Reset button only appears when dirty', () => {
    renderSettings({ liveWeights: { ...BASE_WEIGHTS, core_mechanism: 3 } })
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
  })

  test('Reset button not shown when weights are clean', () => {
    renderSettings()
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
  })
})

describe('Settings — slider interaction', () => {
  test('moving a slider calls setLiveWeights after 150ms debounce', async () => {
    vi.useFakeTimers()
    const setLiveWeights = vi.fn()
    renderSettings({ setLiveWeights })
    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[0], { target: { value: '3' } })
    expect(setLiveWeights).not.toHaveBeenCalled() // not yet — debounced
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(setLiveWeights).toHaveBeenCalled()
    const [newWeights] = setLiveWeights.mock.calls[0]
    const changedKey = Object.keys(BASE_WEIGHTS)[0]
    expect(newWeights[changedKey]).toBe(3)
  })
})

describe('Settings — save flow', () => {
  test('shows "Saving…" in save button while saving', async () => {
    const saveWeights = vi.fn().mockImplementation(() => new Promise(() => {})) // never resolves
    renderSettings({ liveWeights: { ...BASE_WEIGHTS, core_mechanism: 3 }, saveWeights })
    fireEvent.click(screen.getByRole('button', { name: 'Save Weights' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument()
  })

  test('shows "Re-scoring…" after save succeeds', async () => {
    vi.useFakeTimers()
    const saveWeights = vi.fn().mockResolvedValue({})
    renderSettings({ liveWeights: { ...BASE_WEIGHTS, core_mechanism: 3 }, saveWeights })
    fireEvent.click(screen.getByRole('button', { name: 'Save Weights' }))
    await act(async () => {})
    expect(screen.getByText('Re-scoring…')).toBeInTheDocument()
  })

  test('shows "jobs updated" when poll detects scoring finished', async () => {
    vi.useFakeTimers()
    const savedAt = Date.now()
    const saveWeights = vi.fn().mockResolvedValue({})
    mockFetchRescoreStatus.mockResolvedValue({
      running: false,
      lastTs: savedAt + 5000,
      lastCount: 42,
    })
    renderSettings({ liveWeights: { ...BASE_WEIGHTS, core_mechanism: 3 }, saveWeights })
    fireEvent.click(screen.getByRole('button', { name: 'Save Weights' }))
    await act(async () => {})
    // Advance to trigger the poll interval
    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    expect(screen.getByText(/42 jobs updated/)).toBeInTheDocument()
  })

  test('shows "Save failed" when saveWeights throws', async () => {
    const saveWeights = vi.fn().mockRejectedValue(new Error('Network error'))
    renderSettings({ liveWeights: { ...BASE_WEIGHTS, core_mechanism: 3 }, saveWeights })
    fireEvent.click(screen.getByRole('button', { name: 'Save Weights' }))
    expect(await screen.findByText('Save failed')).toBeInTheDocument()
  })
})

describe('Settings — reset', () => {
  test('Reset button calls setLiveWeights with savedWeights', () => {
    const setLiveWeights = vi.fn()
    const savedWeights = { ...BASE_WEIGHTS, core_mechanism: 2 }
    renderSettings({
      liveWeights: { ...BASE_WEIGHTS, core_mechanism: 3 },
      savedWeights,
      setLiveWeights,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(setLiveWeights).toHaveBeenCalledWith(savedWeights)
  })
})

describe('Settings — liveWeights async load', () => {
  test('syncs localWeights from liveWeights when it first arrives (starts null)', () => {
    const { rerender } = render(
      <Settings liveWeights={null} setLiveWeights={vi.fn()} savedWeights={null} saveWeights={vi.fn()} profileDimensions={null} />
    )
    // Sliders render with value=1 (default weight=1 implied by the source; weights = {})
    // Now liveWeights arrives — the useEffect should copy it into localWeights
    rerender(
      <Settings liveWeights={{ ...BASE_WEIGHTS, core_mechanism: 4 }} setLiveWeights={vi.fn()} savedWeights={BASE_WEIGHTS} saveWeights={vi.fn()} profileDimensions={null} />
    )
    // core_mechanism slider should now show 4 (synced from liveWeights)
    const sliders = screen.getAllByRole('slider')
    // The first slider corresponds to core_mechanism (first DIMENSIONS key)
    expect(sliders[0]).toHaveValue('4')
  })
})

describe('Settings — save button states', () => {
  test('Save button is disabled while re-scoring (status=rescoring)', async () => {
    vi.useFakeTimers()
    const saveWeights = vi.fn().mockResolvedValue({})
    // Never return a completed score so we stay in rescoring state
    mockFetchRescoreStatus.mockResolvedValue({ running: true, lastTs: null, lastCount: null })
    renderSettings({ liveWeights: { ...BASE_WEIGHTS, core_mechanism: 3 }, saveWeights })
    fireEvent.click(screen.getByRole('button', { name: 'Save Weights' }))
    await act(async () => {})
    // Should be showing Re-scoring... text and button should be disabled
    expect(screen.getByText('Re-scoring…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Weights' })).toBeDisabled()
  })

  test('Reset button is hidden while saving is in progress', async () => {
    const saveWeights = vi.fn().mockImplementation(() => new Promise(() => {})) // never resolves
    renderSettings({ liveWeights: { ...BASE_WEIGHTS, core_mechanism: 3 }, saveWeights })
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save Weights' }))
    // While saving, the Reset button should disappear (isDirty && !status condition fails)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument())
  })
})
