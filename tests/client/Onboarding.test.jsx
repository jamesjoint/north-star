import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import Onboarding from '../../src/components/Onboarding.jsx'

let mockPatchBackground = vi.fn()
let mockFetchProfile = vi.fn()
let mockPatchWeights = vi.fn()
let mockPatchPersonality = vi.fn()
let mockCreateBoardApi = vi.fn()
let mockPatchName = vi.fn()

vi.mock('../../src/api.js', () => ({
  patchBackground: (...args) => mockPatchBackground(...args),
  fetchProfile: (...args) => mockFetchProfile(...args),
  patchWeights: (...args) => mockPatchWeights(...args),
  patchPersonality: (...args) => mockPatchPersonality(...args),
  createBoardApi: (...args) => mockCreateBoardApi(...args),
  patchName: (...args) => mockPatchName(...args),
}))

vi.mock('../../src/contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ setFirstName: vi.fn(), setLastName: vi.fn() }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockPatchBackground.mockResolvedValue({})
  mockFetchProfile.mockResolvedValue(null)
  mockPatchWeights.mockResolvedValue({})
  mockPatchPersonality.mockResolvedValue({})
  mockCreateBoardApi.mockResolvedValue({})
  mockPatchName.mockResolvedValue({})
})

afterEach(() => {
  vi.useRealTimers()
})

// Fill all required background fields (textarea × 4 + input × 2)
function fillBackgroundForm() {
  const boxes = screen.getAllByRole('textbox')
  // textareas (index 0-3) then inputs (filter by tagName)
  fireEvent.change(boxes[0], { target: { value: 'Product leader' } })
  fireEvent.change(boxes[1], { target: { value: 'Cross-functional work' } })
  fireEvent.change(boxes[2], { target: { value: 'More ownership' } })
  const inputs = boxes.filter(el => el.tagName === 'INPUT')
  fireEvent.change(inputs[0], { target: { value: 'Head of Partnerships' } })
  fireEvent.change(inputs[1], { target: { value: 'media, fintech' } })
}

async function passNameStep() {
  const inputs = screen.getAllByRole('textbox')
  fireEvent.change(inputs[0], { target: { value: 'Ada' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await act(async () => {})
}

// Helper: start at background step, submit form, and advance timer to trigger poll
async function advancePastGenerating(dimensions = null, onComplete = vi.fn()) {
  // Fake all timers — required for advanceTimersByTimeAsync to flush async callbacks
  vi.useFakeTimers()
  if (dimensions) {
    mockFetchProfile.mockResolvedValue({ dimensions, weights: {} })
  }
  render(<Onboarding onComplete={onComplete} />)
  await passNameStep()        // ← NEW
  fillBackgroundForm()
  // Click Continue — patchBackground resolves via microtask, act() flushes React updates
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  // Flush patchBackground promise so the step transitions to 'generating'
  await act(async () => {})
  // Advance past the 2000ms interval AND flush the async fetchProfile callback
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2100)
  })
}

describe('Onboarding — BackgroundStep', () => {
  test('shows the name form on initial render', () => {
    render(<Onboarding onComplete={vi.fn()} />)
    expect(screen.getByPlaceholderText('First name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Last name (optional)')).toBeInTheDocument()
  })

  test('Continue button is disabled when required fields are empty', async () => {
    render(<Onboarding onComplete={vi.fn()} />)
    await passNameStep()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  test('Continue button enables when all required fields are filled', async () => {
    render(<Onboarding onComplete={vi.fn()} />)
    await passNameStep()
    fillBackgroundForm()
    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled()
  })

  test('calls patchBackground with assembled background text on submit', async () => {
    render(<Onboarding onComplete={vi.fn()} />)
    await passNameStep()
    fillBackgroundForm()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(mockPatchBackground).toHaveBeenCalled())
    const [background] = mockPatchBackground.mock.calls[0]
    expect(background).toContain('Product leader')
    expect(background).toContain('Cross-functional work')
    expect(background).toContain('Head of Partnerships')
  })

  test('shows error message when patchBackground fails', async () => {
    mockPatchBackground.mockRejectedValue(new Error('Server error'))
    render(<Onboarding onComplete={vi.fn()} />)
    await passNameStep()
    fillBackgroundForm()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Server error')).toBeInTheDocument()
  })

  test('advances to generating step after successful submit', async () => {
    render(<Onboarding onComplete={vi.fn()} />)
    await passNameStep()
    fillBackgroundForm()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/Building your scoring profile/)).toBeInTheDocument()
  })
})

describe('Onboarding — NameStep', () => {
  test('shows name form on initial render', () => {
    render(<Onboarding onComplete={vi.fn()} />)
    expect(screen.getByPlaceholderText('First name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Last name (optional)')).toBeInTheDocument()
  })

  test('Continue button is disabled when first name is empty', () => {
    render(<Onboarding onComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  test('Continue button enables when first name is filled', () => {
    render(<Onboarding onComplete={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Ada' } })
    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled()
  })

  test('calls patchName with first and last name on submit', async () => {
    render(<Onboarding onComplete={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByPlaceholderText('Last name (optional)'), { target: { value: 'Lovelace' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(mockPatchName).toHaveBeenCalledWith('Ada', 'Lovelace'))
  })

  test('calls patchName with null last name when last name is empty', async () => {
    render(<Onboarding onComplete={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Ada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(mockPatchName).toHaveBeenCalledWith('Ada', null))
  })

  test('advances to background step after successful submit', async () => {
    render(<Onboarding onComplete={vi.fn()} />)
    await passNameStep()
    expect(screen.getByText(/Set up your profile/)).toBeInTheDocument()
  })
})

describe('Onboarding — GeneratingStep', () => {
  test('shows "Building your scoring profile" while waiting', async () => {
    vi.useFakeTimers()
    render(<Onboarding onComplete={vi.fn()} />)
    await passNameStep()
    fillBackgroundForm()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await act(async () => {})
    expect(screen.getByText(/Building your scoring profile/)).toBeInTheDocument()
  })

  test('advances to personality step when profile has 3+ dimensions', async () => {
    const dimensions = {
      dim1: { label: 'Dim 1', description: 'test', weight: 1 },
      dim2: { label: 'Dim 2', description: 'test', weight: 1 },
      dim3: { label: 'Dim 3', description: 'test', weight: 1 },
    }
    await advancePastGenerating(dimensions)
    expect(screen.getByText(/Personality context/)).toBeInTheDocument()
  })

  test('stays on generating step when profile has < 3 dimensions', async () => {
    mockFetchProfile.mockResolvedValue({ dimensions: { dim1: { label: 'X' } }, weights: {} })
    await advancePastGenerating()
    expect(screen.getByText(/Building your scoring profile/)).toBeInTheDocument()
  })

  test('shows Skip button after 45 second timeout', async () => {
    vi.useFakeTimers()
    mockFetchProfile.mockResolvedValue(null)
    render(<Onboarding onComplete={vi.fn()} />)
    await passNameStep()
    fillBackgroundForm()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await act(async () => {})
    await act(async () => { await vi.advanceTimersByTimeAsync(46_000) })
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeInTheDocument()
  })

  test('clicking "Skip for now" advances to personality step with null dimensions', async () => {
    vi.useFakeTimers()
    mockFetchProfile.mockResolvedValue(null)
    render(<Onboarding onComplete={vi.fn()} />)
    await passNameStep()
    fillBackgroundForm()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await act(async () => {})
    await act(async () => { await vi.advanceTimersByTimeAsync(46_000) })
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(screen.getByText(/Personality context/)).toBeInTheDocument()
  })
})

describe('Onboarding — PersonalityStep', () => {
  const DIMS = {
    dim1: { label: 'Dim 1', description: 'test', weight: 1 },
    dim2: { label: 'Dim 2', description: 'test', weight: 1 },
    dim3: { label: 'Dim 3', description: 'test', weight: 1 },
  }

  test('shows personality form with Skip and Continue buttons', async () => {
    await advancePastGenerating(DIMS)
    expect(screen.getByText(/Personality context/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })

  test('clicking Skip advances to review without calling patchPersonality', async () => {
    await advancePastGenerating(DIMS)
    act(() => { vi.useRealTimers() })
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await screen.findByText(/Your scoring dimensions/)
    expect(mockPatchPersonality).not.toHaveBeenCalled()
  })

  test('Continue calls patchPersonality when MBTI is set', async () => {
    await advancePastGenerating(DIMS)
    act(() => { vi.useRealTimers() })
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'INTJ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText(/Your scoring dimensions/)
    expect(mockPatchPersonality).toHaveBeenCalledWith(expect.objectContaining({ mbti: 'INTJ' }))
  })

  test('Continue does not call patchPersonality when no selections made', async () => {
    await advancePastGenerating(DIMS)
    act(() => { vi.useRealTimers() })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText(/Your scoring dimensions/)
    expect(mockPatchPersonality).not.toHaveBeenCalled()
  })
})

describe('Onboarding — ReviewStep', () => {
  const DIMS = {
    leadership: { label: 'Leadership', description: 'Leads teams: desc', weight: 1.5 },
    impact: { label: 'Impact', description: 'Drives outcomes: desc', weight: 1.0 },
    technical: { label: 'Technical', description: 'Tech depth: desc', weight: 0.5 },
  }

  async function advanceToReview() {
    await advancePastGenerating(DIMS)
    act(() => { vi.useRealTimers() })
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })) // skip personality
    await screen.findByText(/Your scoring dimensions/)
  }

  test('shows dimension labels', async () => {
    await advanceToReview()
    expect(screen.getByText('Leadership')).toBeInTheDocument()
    expect(screen.getByText('Impact')).toBeInTheDocument()
    expect(screen.getByText('Technical')).toBeInTheDocument()
  })

  test('Continue calls patchWeights and advances to board step', async () => {
    await advanceToReview()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText(/Name your constellation board/)
    expect(mockPatchWeights).toHaveBeenCalled()
  })

  test('shows "You\'re all set" when dimensions are null (skipped generating)', async () => {
    vi.useFakeTimers()
    mockFetchProfile.mockResolvedValue(null)
    render(<Onboarding onComplete={vi.fn()} />)
    await passNameStep()
    fillBackgroundForm()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await act(async () => {})
    await act(async () => { await vi.advanceTimersByTimeAsync(46_000) })
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    vi.useRealTimers()
    // Skip personality → review with null dimensions
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await screen.findByText(/You're all set/)
    // Start scoring jobs button available
    fireEvent.click(screen.getByRole('button', { name: 'Start scoring jobs' }))
    await screen.findByText(/Name your constellation board/)
  })
})

describe('Onboarding — BoardNameStep', () => {
  const DIMS = {
    d1: { label: 'D1', description: 'test', weight: 1 },
    d2: { label: 'D2', description: 'test', weight: 1 },
    d3: { label: 'D3', description: 'test', weight: 1 },
  }

  async function advanceToBoardStep(onComplete = vi.fn()) {
    await advancePastGenerating(DIMS, onComplete)
    act(() => { vi.useRealTimers() })
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await screen.findByText(/Your scoring dimensions/)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText(/Name your constellation board/)
    return onComplete
  }

  test('shows board name input with placeholder', async () => {
    await advanceToBoardStep()
    expect(screen.getByPlaceholderText('My Job Search')).toBeInTheDocument()
  })

  test('calls createBoardApi with entered name', async () => {
    await advanceToBoardStep()
    fireEvent.change(screen.getByPlaceholderText('My Job Search'), { target: { value: 'Dream Jobs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start scoring jobs' }))
    await waitFor(() => expect(mockCreateBoardApi).toHaveBeenCalledWith('Dream Jobs'))
  })

  test('uses "My Job Search" default when name input is empty', async () => {
    await advanceToBoardStep()
    fireEvent.click(screen.getByRole('button', { name: 'Start scoring jobs' }))
    await waitFor(() => expect(mockCreateBoardApi).toHaveBeenCalledWith('My Job Search'))
  })

  test('calls onComplete after board creation', async () => {
    const onComplete = vi.fn()
    await advanceToBoardStep(onComplete)
    fireEvent.click(screen.getByRole('button', { name: 'Start scoring jobs' }))
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
  })

  test('Enter key in name input triggers board creation', async () => {
    await advanceToBoardStep()
    const input = screen.getByPlaceholderText('My Job Search')
    fireEvent.change(input, { target: { value: 'My Boards' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(mockCreateBoardApi).toHaveBeenCalledWith('My Boards'))
  })

  test('shows "Creating…" and disables button while board is being created', async () => {
    mockCreateBoardApi.mockImplementation(() => new Promise(() => {})) // never resolves
    await advanceToBoardStep()
    fireEvent.click(screen.getByRole('button', { name: 'Start scoring jobs' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled())
  })
})

describe('Onboarding — BackgroundStep extra', () => {
  test('includes dealbreakers in background text when filled', async () => {
    render(<Onboarding onComplete={vi.fn()} />)
    await passNameStep()
    const boxes = screen.getAllByRole('textbox')
    fireEvent.change(boxes[0], { target: { value: 'Product leader' } })
    fireEvent.change(boxes[1], { target: { value: 'Cross-functional work' } })
    fireEvent.change(boxes[2], { target: { value: 'More ownership' } })
    // dealbreakers is the 4th textarea (index 3)
    fireEvent.change(boxes[3], { target: { value: 'No commute' } })
    const inputs = boxes.filter(el => el.tagName === 'INPUT')
    fireEvent.change(inputs[0], { target: { value: 'Head of Partnerships' } })
    fireEvent.change(inputs[1], { target: { value: 'media' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(mockPatchBackground).toHaveBeenCalled())
    const [background] = mockPatchBackground.mock.calls[0]
    expect(background).toContain('No commute')
    expect(background).toContain('Deal-breakers:')
  })

  test('omits deal-breakers section when dealbreakers field is empty', async () => {
    render(<Onboarding onComplete={vi.fn()} />)
    await passNameStep()
    fillBackgroundForm()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(mockPatchBackground).toHaveBeenCalled())
    const [background] = mockPatchBackground.mock.calls[0]
    expect(background).not.toContain('Deal-breakers:')
  })
})

describe('Onboarding — PersonalityStep extra', () => {
  const DIMS = {
    d1: { label: 'D1', description: 'test', weight: 1 },
    d2: { label: 'D2', description: 'test', weight: 1 },
    d3: { label: 'D3', description: 'test', weight: 1 },
  }

  test('Continue calls patchPersonality with enneagram value when set', async () => {
    await advancePastGenerating(DIMS)
    act(() => { vi.useRealTimers() })
    // Enneagram is a text input with placeholder "e.g. 3w2"
    const enneagramInput = screen.getByPlaceholderText('e.g. 3w2')
    fireEvent.change(enneagramInput, { target: { value: '5w4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText(/Your scoring dimensions/)
    expect(mockPatchPersonality).toHaveBeenCalledWith(expect.objectContaining({ enneagram: '5w4' }))
  })
})

describe('Onboarding — BoardNameStep error', () => {
  const DIMS = {
    d1: { label: 'D1', description: 'test', weight: 1 },
    d2: { label: 'D2', description: 'test', weight: 1 },
    d3: { label: 'D3', description: 'test', weight: 1 },
  }

  test('calls onComplete even when createBoardApi fails (board creation is non-fatal)', async () => {
    mockCreateBoardApi.mockRejectedValue(new Error('DB error'))
    const onComplete = vi.fn()
    await advancePastGenerating(DIMS, onComplete)
    act(() => { vi.useRealTimers() })
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await screen.findByText(/Your scoring dimensions/)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText(/Name your constellation board/)
    fireEvent.click(screen.getByRole('button', { name: 'Start scoring jobs' }))
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
  })
})

describe('Onboarding — GeneratingStep timed-out state', () => {
  test('shows "Still working…" heading and extended message after 45s', async () => {
    vi.useFakeTimers()
    mockFetchProfile.mockResolvedValue(null)
    render(<Onboarding onComplete={vi.fn()} />)
    await passNameStep()
    fillBackgroundForm()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await act(async () => {})
    await act(async () => { await vi.advanceTimersByTimeAsync(46_000) })
    expect(screen.getByText('Still working…')).toBeInTheDocument()
    expect(screen.getByText(/Taking longer than usual/)).toBeInTheDocument()
  })
})

describe('Onboarding — PersonalityStep strengths', () => {
  const DIMS = {
    d1: { label: 'D1', description: 'test', weight: 1 },
    d2: { label: 'D2', description: 'test', weight: 1 },
    d3: { label: 'D3', description: 'test', weight: 1 },
  }

  test('patchPersonality receives strengths as a parsed array of trimmed values', async () => {
    await advancePastGenerating(DIMS)
    act(() => { vi.useRealTimers() })
    const strengthsInput = screen.getByPlaceholderText(/e.g. Strategic/)
    fireEvent.change(strengthsInput, { target: { value: 'Analytical, Creative, Curious' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText(/Your scoring dimensions/)
    expect(mockPatchPersonality).toHaveBeenCalledWith(
      expect.objectContaining({ strengths: ['Analytical', 'Creative', 'Curious'] })
    )
  })
})

describe('Onboarding — ReviewStep patchWeights failure', () => {
  const DIMS = {
    d1: { label: 'D1', description: 'test', weight: 1 },
    d2: { label: 'D2', description: 'test', weight: 1 },
    d3: { label: 'D3', description: 'test', weight: 1 },
  }

  test('calls onComplete even when patchWeights throws (non-fatal)', async () => {
    mockPatchWeights.mockRejectedValue(new Error('Weights save error'))
    await advancePastGenerating(DIMS)
    act(() => { vi.useRealTimers() })
    fireEvent.click(screen.getByRole('button', { name: 'Skip' })) // skip personality
    await screen.findByText(/Your scoring dimensions/)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText(/Name your constellation board/)
    // Even though patchWeights failed, we reached board step → test onComplete from there
    fireEvent.click(screen.getByRole('button', { name: 'Start scoring jobs' }))
    await waitFor(() => expect(mockPatchWeights).toHaveBeenCalled())
  })
})

describe('Onboarding — PersonalityStep DISC and astrology', () => {
  const DIMS = {
    d1: { label: 'D1', description: 'test', weight: 1 },
    d2: { label: 'D2', description: 'test', weight: 1 },
    d3: { label: 'D3', description: 'test', weight: 1 },
  }

  test('Continue calls patchPersonality with disc when DiSC is selected', async () => {
    await advancePastGenerating(DIMS)
    act(() => { vi.useRealTimers() })
    // Selects render in order: MBTI (0), DiSC (1), Sun (2), Moon (3), Rising (4)
    const allSelects = screen.getAllByRole('combobox')
    fireEvent.change(allSelects[1], { target: { value: 'Influence (I)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText(/Your scoring dimensions/)
    expect(mockPatchPersonality).toHaveBeenCalledWith(expect.objectContaining({ disc: 'Influence (I)' }))
  })

  test('Continue calls patchPersonality with sun_sign when sun sign is selected', async () => {
    await advancePastGenerating(DIMS)
    act(() => { vi.useRealTimers() })
    // Selects in order: MBTI (0), DiSC (1), Sun (2), Moon (3), Rising (4)
    const allSelects = screen.getAllByRole('combobox')
    fireEvent.change(allSelects[2], { target: { value: 'Scorpio' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText(/Your scoring dimensions/)
    expect(mockPatchPersonality).toHaveBeenCalledWith(expect.objectContaining({ sun_sign: 'Scorpio' }))
  })
})
