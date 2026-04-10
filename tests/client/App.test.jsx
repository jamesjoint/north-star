import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../../src/App.jsx'

// ─── Auth context mock ────────────────────────────────────────────────────────

let mockUseAuth = vi.fn()

vi.mock('../../src/contexts/AuthContext.jsx', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }) => children,
}))

// ─── API mocks ────────────────────────────────────────────────────────────────

let mockFetchJobs = vi.fn()
let mockFetchProfile = vi.fn()
let mockFetchBoards = vi.fn()
let mockTriggerRefresh = vi.fn()
let mockPatchJob = vi.fn()
let mockCreateJob = vi.fn()
let mockDeleteJob = vi.fn()
let mockPatchWeights = vi.fn()
let mockFetchRescoreStatus = vi.fn()

vi.mock('../../src/api.js', () => ({
  fetchJobs: (...args) => mockFetchJobs(...args),
  fetchProfile: (...args) => mockFetchProfile(...args),
  fetchBoards: (...args) => mockFetchBoards(...args),
  triggerRefresh: (...args) => mockTriggerRefresh(...args),
  patchJob: (...args) => mockPatchJob(...args),
  createJob: (...args) => mockCreateJob(...args),
  deleteJob: (...args) => mockDeleteJob(...args),
  patchWeights: (...args) => mockPatchWeights(...args),
  fetchRescoreStatus: (...args) => mockFetchRescoreStatus(...args),
  // Profile component uses these when mounted
  patchBackground: vi.fn().mockResolvedValue({}),
  regenerateDimensions: vi.fn().mockResolvedValue({}),
  patchPersonality: vi.fn().mockResolvedValue({}),
  patchDimensions: vi.fn().mockResolvedValue({}),
  // Admin panel uses these when mounted
  fetchWaitlist: vi.fn().mockResolvedValue([]),
  fetchAdminUsers: vi.fn().mockResolvedValue([]),
  fetchInvites: vi.fn().mockResolvedValue([]),
  fetchScoringQueue: vi.fn().mockResolvedValue([]),
  AuthExpiredError: class AuthExpiredError extends Error {
    constructor() { super('auth_expired') }
  },
}))

// ─── Auth context helpers ─────────────────────────────────────────────────────

const REGULAR_USER = { id: 'u1', email: 'alice@example.com', role: 'user' }
const ADMIN_USER = { id: 'u2', email: 'admin@example.com', role: 'admin' }

function renderApp() {
  return render(<App />)
}

const SAMPLE_JOBS = [
  { id: 'j1', title: 'Product Manager', company: 'Acme', score_aggregate: 8, status: null, source: 'manual', remote: 'remote', location: 'Remote', description: 'desc', fetched_at: null, score_dimensions: null, posted_at: null },
  { id: 'j2', title: 'Engineer', company: 'Beta', score_aggregate: 6, status: 'Applied', source: 'linkedin', remote: 'on-site', location: 'SF', description: null, fetched_at: null, score_dimensions: null, posted_at: null },
]

const BOARDS = [
  { id: 'b1', name: 'My Job Search', emoji: null, job_count: 1 },
]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockUseAuth.mockReturnValue({ user: REGULAR_USER, loading: false, onboardingDone: true, logout: vi.fn(), completeOnboarding: vi.fn() })
  mockFetchJobs.mockResolvedValue(SAMPLE_JOBS)
  mockFetchProfile.mockResolvedValue({
    background: 'Experienced product leader.',
    onboarding_done: true,
    personality: null,
    dimensions: null,
    weights: { core_mechanism: 1 },
  })
  mockFetchBoards.mockResolvedValue(BOARDS)
  mockFetchRescoreStatus.mockResolvedValue({ running: false, lastTs: null, lastCount: null })
})

// ─── Initial render ───────────────────────────────────────────────────────────

describe('App — initial render', () => {
  test('shows search tab by default', async () => {
    renderApp()
    // The Jobs tab navigation button should be present
    await waitFor(() => expect(screen.getByRole('button', { name: 'Jobs' })).toBeInTheDocument())
  })

  test('loads and shows job listings', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    expect(screen.getByText('Engineer')).toBeInTheDocument()
  })

  test('shows job count', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument())
  })

  test('shows error when jobs fail to load', async () => {
    mockFetchJobs.mockRejectedValue(new Error('Network error'))
    renderApp()
    await waitFor(() => expect(screen.getByText(/Network error/)).toBeInTheDocument())
  })
})

// ─── Tab navigation ───────────────────────────────────────────────────────────

describe('App — tab navigation', () => {
  test('switching to Tracker tab shows Tracker component', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByRole('button', { name: /tracker/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /tracker/i }))
    // Tracker shows empty state since no tracked jobs (status=null for j1, Applied for j2)
    await waitFor(() => expect(screen.getByText(/No tracked jobs yet|Engineer/)).toBeInTheDocument())
  })

  test('switching to Settings tab shows Settings component', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Weights' })).toBeInTheDocument())
  })

  test('navigating to Profile tab via avatar menu shows Profile component', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    // Open avatar menu and click Profile
    const avatarBtn = screen.getByRole('button', { name: 'AL' }) // alice@example.com → AL
    fireEvent.click(avatarBtn)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }))
    // Profile component should render (it fetches profile on mount)
    await waitFor(() => expect(screen.queryByText('Product Manager')).not.toBeInTheDocument())
  })
})

describe('App — search tab states', () => {
  test('shows "No jobs match" message when all jobs are filtered out', async () => {
    mockFetchJobs.mockResolvedValue([])
    renderApp()
    await waitFor(() => expect(screen.getByText(/No jobs match your filters/)).toBeInTheDocument())
  })

  test('shows job count in header area', async () => {
    renderApp()
    await waitFor(() => expect(screen.getAllByText('2').length).toBeGreaterThan(0))
  })
})

// ─── Job selection ────────────────────────────────────────────────────────────

describe('App — job selection', () => {
  test('clicking a job card shows the job detail panel', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    // JobCard renders with click handler — click the card
    fireEvent.click(screen.getByText('Product Manager'))
    // JobDetail should appear (shows job title in detail panel too)
    await waitFor(() => {
      const productManagerItems = screen.getAllByText('Product Manager')
      expect(productManagerItems.length).toBeGreaterThan(1) // card + detail
    })
  })

  test('clicking the same job card again deselects it', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Product Manager'))
    // Deselect
    fireEvent.click(screen.getAllByText('Product Manager')[0])
    await waitFor(() => {
      // After deselect, detail panel should be gone — only 1 instance of title
      expect(screen.getAllByText('Product Manager')).toHaveLength(1)
    })
  })
})

// ─── Admin access ─────────────────────────────────────────────────────────────

describe('App — admin navigation', () => {
  test('admin user sees Admin option in avatar dropdown', async () => {
    mockUseAuth.mockReturnValue({ user: ADMIN_USER, loading: false, onboardingDone: true, logout: vi.fn(), completeOnboarding: vi.fn() })
    renderApp()
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    // Avatar button shows initials — for admin@example.com → 'AD'
    const avatarBtn = screen.getByRole('button', { name: 'AD' })
    fireEvent.click(avatarBtn)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument())
  })
})

describe('App — back navigation', () => {
  test('← Back from Profile returns to search tab', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    // Navigate to Profile via avatar menu
    fireEvent.click(screen.getByRole('button', { name: 'AL' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }))
    // Profile renders — wait for back button
    await waitFor(() => expect(screen.getByText('← Back')).toBeInTheDocument())
    fireEvent.click(screen.getByText('← Back'))
    // Should be back on search tab showing jobs
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
  })

  test('← Back from Admin returns to search tab', async () => {
    mockUseAuth.mockReturnValue({ user: ADMIN_USER, loading: false, onboardingDone: true, logout: vi.fn(), completeOnboarding: vi.fn() })
    renderApp()
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    // Navigate to Admin via avatar menu
    fireEvent.click(screen.getByRole('button', { name: 'AD' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Admin' }))
    // Admin panel renders — wait for back button
    await waitFor(() => expect(screen.getByText('← Back')).toBeInTheDocument())
    fireEvent.click(screen.getByText('← Back'))
    // Should be back on search tab showing jobs
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
  })

  test('← Back from Profile returns to Tracker when navigated from Tracker', async () => {
    const trackedJob = { ...SAMPLE_JOBS[0], id: 'j1', title: 'Product Manager', status: 'Applied' }
    mockFetchJobs.mockResolvedValue([trackedJob])
    renderApp()
    // Switch to Tracker tab first
    await waitFor(() => expect(screen.getByRole('button', { name: /tracker/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /tracker/i }))
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    // Navigate to Profile via avatar menu while on Tracker
    fireEvent.click(screen.getByRole('button', { name: 'AL' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }))
    await waitFor(() => expect(screen.getByText('← Back')).toBeInTheDocument())
    fireEvent.click(screen.getByText('← Back'))
    // Should be back on Tracker tab (not search)
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    expect(screen.queryByRole('combobox', { name: /sort/i })).not.toBeInTheDocument() // search has FilterBar, tracker does not expose sort outside tracker component
  })

  test('← Back from Admin returns to Tracker when navigated from Tracker', async () => {
    mockUseAuth.mockReturnValue({ user: ADMIN_USER, loading: false, onboardingDone: true, logout: vi.fn(), completeOnboarding: vi.fn() })
    const trackedJob = { ...SAMPLE_JOBS[0], id: 'j1', title: 'Product Manager', status: 'Applied' }
    mockFetchJobs.mockResolvedValue([trackedJob])
    renderApp()
    // Switch to Tracker tab first
    await waitFor(() => expect(screen.getByRole('button', { name: /tracker/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /tracker/i }))
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    // Navigate to Admin via avatar menu while on Tracker
    fireEvent.click(screen.getByRole('button', { name: 'AD' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Admin' }))
    await waitFor(() => expect(screen.getByText('← Back')).toBeInTheDocument())
    fireEvent.click(screen.getByText('← Back'))
    // Should be back on Tracker tab (not search)
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    expect(screen.queryByRole('combobox', { name: /sort/i })).not.toBeInTheDocument()
  })
})

describe('App — refresh state', () => {
  test('shows "Scanning…" message during refresh', async () => {
    // Make triggerRefresh never resolve so we stay in refreshing state
    mockTriggerRefresh.mockImplementation(() => new Promise(() => {}))
    renderApp()
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    await waitFor(() => expect(screen.getByText('Scanning…')).toBeInTheDocument())
  })
})

describe('App — updateStatusAndRefreshBoards', () => {
  test('changing job status triggers board reload', async () => {
    mockPatchJob.mockResolvedValue({
      id: 'j1', title: 'Product Manager', company: 'Acme',
      score_aggregate: 8, status: 'Applied', source: 'manual',
      remote: 'remote', location: 'Remote', description: 'desc',
      fetched_at: null, score_dimensions: null, posted_at: null,
    })
    renderApp()
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    const statusSelect = screen.getByDisplayValue('Track…')
    fireEvent.change(statusSelect, { target: { value: 'Applied' } })
    await waitFor(() => expect(mockPatchJob).toHaveBeenCalledWith('j1', { status: 'Applied' }))
    await waitFor(() => expect(mockFetchBoards).toHaveBeenCalledTimes(2))
  })
})

describe('App — Tracker tab job selection', () => {
  test('selecting a tracked job in Tracker tab shows JobDetail panel', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByRole('button', { name: /tracker/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /tracker/i }))
    // j2 (Engineer) has status 'Applied' so it appears in Tracker tracked list
    await waitFor(() => expect(screen.getByText('Engineer')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Engineer'))
    // JobDetail panel renders alongside list — title appears more than once
    await waitFor(() => expect(screen.getAllByText('Engineer').length).toBeGreaterThan(1))
  })
})

describe('App — Profile goToSettings', () => {
  test('clicking "Edit dimension weights" in Profile navigates to Settings tab', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'AL' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }))
    await waitFor(() => expect(screen.getByText('Edit dimension weights')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Edit dimension weights'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Weights' })).toBeInTheDocument())
  })
})

describe('App — prev/next navigation in search tab', () => {
  test('clicking Next in JobDetail advances to the next job', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    // Select j1 (Product Manager) — it is first, so prev is disabled, next is enabled
    fireEvent.click(screen.getByText('Product Manager'))
    await waitFor(() => expect(screen.getAllByText('Product Manager').length).toBeGreaterThan(1))
    fireEvent.click(screen.getByTitle('Next job'))
    // Engineer (j2) should now appear in the detail panel
    await waitFor(() => expect(screen.getAllByText('Engineer').length).toBeGreaterThan(1))
  })

  test('clicking Prev in JobDetail goes to the previous job', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('Engineer')).toBeInTheDocument())
    // Select j2 (Engineer) — it is second, so prev is enabled
    fireEvent.click(screen.getByText('Engineer'))
    await waitFor(() => expect(screen.getAllByText('Engineer').length).toBeGreaterThan(1))
    fireEvent.click(screen.getByTitle('Previous job'))
    // Product Manager (j1) should now appear in the detail panel
    await waitFor(() => expect(screen.getAllByText('Product Manager').length).toBeGreaterThan(1))
  })
})

describe('App — addJobAndRefreshBoards', () => {
  test('adding a job via Tracker reloads boards', async () => {
    const newJob = {
      id: 'j3', title: 'Designer', company: 'NewCo', score_aggregate: null,
      status: 'Saved', source: 'manual', remote: null, location: null,
      description: null, fetched_at: null, score_dimensions: null, posted_at: null,
    }
    mockCreateJob.mockResolvedValue(newJob)
    renderApp()
    await waitFor(() => expect(screen.getByRole('button', { name: /tracker/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /tracker/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Add Job' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ Add Job' }))
    fireEvent.change(screen.getByPlaceholderText('Job listing URL (required)'), { target: { value: 'https://example.com/designer' } })
    fireEvent.change(screen.getByPlaceholderText('Job title (required)'), { target: { value: 'Designer' } })
    fireEvent.submit(screen.getByPlaceholderText('Job listing URL (required)').closest('form'))
    await waitFor(() => expect(mockCreateJob).toHaveBeenCalled())
    // reloadBoards fires after addJob resolves — fetchBoards called 2+ times
    await waitFor(() => expect(mockFetchBoards).toHaveBeenCalledTimes(2))
  })
})

describe('App — job deletion from search tab', () => {
  test('deleting a job from the job list removes it', async () => {
    mockDeleteJob.mockResolvedValue({})
    renderApp()
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    // Hover to reveal delete button for j1
    const cards = screen.getAllByRole('article')
    fireEvent.mouseEnter(cards[0])
    await waitFor(() => expect(screen.getByTitle('Delete')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Delete'))
    await waitFor(() => expect(mockDeleteJob).toHaveBeenCalledWith('j1'))
    // Job is optimistically removed from the list
    await waitFor(() => expect(screen.queryByText('Product Manager')).not.toBeInTheDocument())
  })
})

describe('App — markSeen on job selection', () => {
  test('selecting a job does not trigger a patchJob seen API call (markSeen is local-only)', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Product Manager'))
    // markSeen only updates local state — patchJob should NOT be called for seen
    await waitFor(() => expect(screen.getAllByText('Product Manager').length).toBeGreaterThan(1))
    expect(mockPatchJob).not.toHaveBeenCalledWith('j1', { seen: 1 })
  })
})

describe('App — prev/next navigation in Tracker tab', () => {
  test('clicking Next in Tracker JobDetail advances to the next tracked job', async () => {
    const twoTracked = [
      { ...SAMPLE_JOBS[0], id: 'j1', title: 'Product Manager', status: 'Saved' },
      { ...SAMPLE_JOBS[1], id: 'j2', title: 'Engineer', status: 'Applied' },
    ]
    mockFetchJobs.mockResolvedValue(twoTracked)
    renderApp()
    await waitFor(() => expect(screen.getByRole('button', { name: /tracker/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /tracker/i }))
    await waitFor(() => expect(screen.getByText('Product Manager')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Product Manager'))
    await waitFor(() => expect(screen.getAllByText('Product Manager').length).toBeGreaterThan(1))
    fireEvent.click(screen.getByTitle('Next job'))
    await waitFor(() => expect(screen.getAllByText('Engineer').length).toBeGreaterThan(1))
  })
})
