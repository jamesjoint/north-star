import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Profile from '../../src/components/Profile.jsx'

let mockFetchProfile = vi.fn()
let mockPatchBackground = vi.fn()
let mockRegenerateDimensions = vi.fn()
let mockPatchPersonality = vi.fn()
let mockPatchDimensions = vi.fn()

vi.mock('../../src/api.js', () => ({
  fetchProfile: (...args) => mockFetchProfile(...args),
  patchBackground: (...args) => mockPatchBackground(...args),
  regenerateDimensions: (...args) => mockRegenerateDimensions(...args),
  patchPersonality: (...args) => mockPatchPersonality(...args),
  patchDimensions: (...args) => mockPatchDimensions(...args),
}))

const SAMPLE_PROFILE = {
  background: 'Experienced product leader with 10 years in fintech.',
  onboarding_done: true,
  personality: null,
  dimensions: null,
  weights: {},
}

const PROFILE_WITH_DIMS = {
  ...SAMPLE_PROFILE,
  dimensions: {
    leadership: { label: 'Leadership', description: 'Leads teams', weight: 1.5 },
    impact: { label: 'Impact', description: 'Business outcomes', weight: 1.0 },
    culture_fit: { label: 'Culture Fit', description: 'Values match', weight: 0.5 },
  },
  weights: { leadership: 1.5, impact: 1.0, culture_fit: 0.5 },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchProfile.mockResolvedValue(SAMPLE_PROFILE)
  mockPatchBackground.mockResolvedValue({})
  mockRegenerateDimensions.mockResolvedValue({})
  mockPatchPersonality.mockResolvedValue({})
  mockPatchDimensions.mockResolvedValue({})
})

describe('Profile — loading & initial render', () => {
  test('shows background text after loading', async () => {
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByDisplayValue(SAMPLE_PROFILE.background)).toBeInTheDocument())
  })

  test('shows error when fetchProfile fails', async () => {
    mockFetchProfile.mockRejectedValue(new Error('Load failed'))
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Could not load profile/)).toBeInTheDocument())
  })

  test('Save button is disabled when background is unchanged', async () => {
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByDisplayValue(SAMPLE_PROFILE.background)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })
})

describe('Profile — background editing', () => {
  test('Save button enables when background is changed', async () => {
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    const textarea = await screen.findByDisplayValue(SAMPLE_PROFILE.background)
    fireEvent.change(textarea, { target: { value: 'Updated background text' } })
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
  })

  test('Save calls patchBackground with updated text', async () => {
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    const textarea = await screen.findByDisplayValue(SAMPLE_PROFILE.background)
    fireEvent.change(textarea, { target: { value: 'New background' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(mockPatchBackground).toHaveBeenCalledWith('New background'))
  })

  test('shows "Saved" confirmation after successful save', async () => {
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    const textarea = await screen.findByDisplayValue(SAMPLE_PROFILE.background)
    fireEvent.change(textarea, { target: { value: 'New background' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/Saved/)).toBeInTheDocument()
  })

  test('calls onProfileChange after successful save', async () => {
    const onProfileChange = vi.fn()
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={onProfileChange} />)
    const textarea = await screen.findByDisplayValue(SAMPLE_PROFILE.background)
    fireEvent.change(textarea, { target: { value: 'New background' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onProfileChange).toHaveBeenCalled())
  })

  test('shows error message when patchBackground fails', async () => {
    mockPatchBackground.mockRejectedValue(new Error('Save error'))
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    const textarea = await screen.findByDisplayValue(SAMPLE_PROFILE.background)
    fireEvent.change(textarea, { target: { value: 'New background' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText('Save error')).toBeInTheDocument()
  })

  test('shows "Saving…" in button while save is in progress', async () => {
    mockPatchBackground.mockImplementation(() => new Promise(() => {})) // never resolves
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    const textarea = await screen.findByDisplayValue(SAMPLE_PROFILE.background)
    fireEvent.change(textarea, { target: { value: 'New background' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument()
  })
})

describe('Profile — dimensions section', () => {
  test('shows dimension labels when profile has 3+ dimensions', async () => {
    mockFetchProfile.mockResolvedValue(PROFILE_WITH_DIMS)
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    // Leadership appears in radar chart AND dimension rows — use getAllByText
    await waitFor(() => expect(screen.getAllByText('Leadership').length).toBeGreaterThan(0))
    expect(screen.getAllByText('Impact').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Culture Fit').length).toBeGreaterThan(0)
  })

  test('Regenerate button calls regenerateDimensions', async () => {
    mockFetchProfile.mockResolvedValue(PROFILE_WITH_DIMS)
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /refresh dimensions/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /refresh dimensions/i }))
    await waitFor(() => expect(mockRegenerateDimensions).toHaveBeenCalled())
  })

  test('shows "Regenerating…" while regeneration is in progress', async () => {
    mockRegenerateDimensions.mockImplementation(() => new Promise(() => {})) // never resolves
    mockFetchProfile.mockResolvedValue(PROFILE_WITH_DIMS)
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /refresh dimensions/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /refresh dimensions/i }))
    expect(screen.getByRole('button', { name: /regenerating/i })).toBeInTheDocument()
  })
})

describe('Profile — navigation', () => {
  test('calls onBack when Back button is clicked', async () => {
    const onBack = vi.fn()
    render(<Profile onBack={onBack} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByDisplayValue(SAMPLE_PROFILE.background)).toBeInTheDocument())
    fireEvent.click(screen.getByText('← Back'))
    expect(onBack).toHaveBeenCalled()
  })

  test('calls onGoToSettings when "Edit dimension weights" button is clicked', async () => {
    const onGoToSettings = vi.fn()
    render(<Profile onBack={vi.fn()} onGoToSettings={onGoToSettings} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByDisplayValue(SAMPLE_PROFILE.background)).toBeInTheDocument())
    fireEvent.click(screen.getByText('Edit dimension weights'))
    expect(onGoToSettings).toHaveBeenCalled()
  })
})

describe('Profile — loading state', () => {
  test('shows "Loading…" while fetching', () => {
    mockFetchProfile.mockImplementation(() => new Promise(() => {})) // never resolves
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0)
  })
})

describe('Profile — dimensions — no dims message', () => {
  test('shows "No custom dimensions yet" when profile has no dimensions', async () => {
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/No custom dimensions yet/)).toBeInTheDocument())
  })
})

describe('Profile — dimensions — edit flow', () => {
  test('"Edit dimensions" button switches to editing mode', async () => {
    mockFetchProfile.mockResolvedValue(PROFILE_WITH_DIMS)
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /edit dimensions/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /edit dimensions/i }))
    expect(screen.getByRole('button', { name: /save dimensions/i })).toBeInTheDocument()
  })

  test('"Cancel" in editing mode exits without saving', async () => {
    mockFetchProfile.mockResolvedValue(PROFILE_WITH_DIMS)
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /edit dimensions/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /edit dimensions/i }))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(mockPatchDimensions).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /edit dimensions/i })).toBeInTheDocument()
  })

  test('"Save dimensions" calls patchDimensions and shows confirmation', async () => {
    mockFetchProfile.mockResolvedValue(PROFILE_WITH_DIMS)
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /edit dimensions/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /edit dimensions/i }))
    fireEvent.click(screen.getByRole('button', { name: /save dimensions/i }))
    await waitFor(() => expect(mockPatchDimensions).toHaveBeenCalled())
    expect(await screen.findByText(/Saved — re-scoring jobs/)).toBeInTheDocument()
  })

  test('"Save dimensions" calls onProfileChange after successful save', async () => {
    mockFetchProfile.mockResolvedValue(PROFILE_WITH_DIMS)
    const onProfileChange = vi.fn()
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={onProfileChange} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /edit dimensions/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /edit dimensions/i }))
    fireEvent.click(screen.getByRole('button', { name: /save dimensions/i }))
    await waitFor(() => expect(onProfileChange).toHaveBeenCalled())
  })

  test('"Save dimensions" shows error message when patchDimensions fails', async () => {
    mockFetchProfile.mockResolvedValue(PROFILE_WITH_DIMS)
    mockPatchDimensions.mockRejectedValue(new Error('Network error'))
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /edit dimensions/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /edit dimensions/i }))
    fireEvent.click(screen.getByRole('button', { name: /save dimensions/i }))
    expect(await screen.findByText('Network error')).toBeInTheDocument()
  })
})

describe('Profile — regenerate success', () => {
  test('shows "✓ Regenerating…" text after successful regenerate', async () => {
    mockFetchProfile.mockResolvedValue(PROFILE_WITH_DIMS)
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /refresh dimensions/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /refresh dimensions/i }))
    expect(await screen.findByText(/Regenerating — reload/)).toBeInTheDocument()
  })

  test('shows error message when regenerateDimensions fails', async () => {
    mockRegenerateDimensions.mockRejectedValue(new Error('API error'))
    mockFetchProfile.mockResolvedValue(PROFILE_WITH_DIMS)
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /refresh dimensions/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /refresh dimensions/i }))
    expect(await screen.findByText('API error')).toBeInTheDocument()
  })
})

describe('Profile — PersonalitySection', () => {
  test('shows "Add" button when no personality data exists', async () => {
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByDisplayValue(SAMPLE_PROFILE.background)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument()
  })

  test('"Add" button opens personality edit form', async () => {
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(screen.getByText('Myers-Briggs')).toBeInTheDocument()
    expect(screen.getByText('Enneagram')).toBeInTheDocument()
  })

  test('"Cancel" in personality edit hides the form', async () => {
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(mockPatchPersonality).not.toHaveBeenCalled()
    // Should be back to "Add" button visible
    expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument()
  })

  test('displays existing personality data when profile has it', async () => {
    mockFetchProfile.mockResolvedValue({
      ...SAMPLE_PROFILE,
      personality: { mbti: 'INTJ', enneagram: '5w4' },
    })
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('INTJ')).toBeInTheDocument())
    expect(screen.getByText('5w4')).toBeInTheDocument()
  })

  test('clicking Save calls patchPersonality and hides the form', async () => {
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    const enneagramInput = screen.getByPlaceholderText('e.g. 3w2')
    fireEvent.change(enneagramInput, { target: { value: '4w5' } })
    // Multiple "Save" buttons may exist — the background one is disabled; pick the enabled one
    const saveBtns = screen.getAllByRole('button', { name: /^save$/i })
    const enabledSave = saveBtns.find(b => !b.disabled)
    fireEvent.click(enabledSave)
    await waitFor(() => expect(mockPatchPersonality).toHaveBeenCalled())
  })

  test('"Edit" button appears when profile already has personality data', async () => {
    mockFetchProfile.mockResolvedValue({
      ...SAMPLE_PROFILE,
      personality: { mbti: 'ENFJ', enneagram: '2w3' },
    })
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('ENFJ')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
  })

  test('personality form is hidden after successful save', async () => {
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(screen.getByText('Myers-Briggs')).toBeInTheDocument()
    const saveBtns = screen.getAllByRole('button', { name: /^save$/i })
    const enabledSave = saveBtns.find(b => !b.disabled)
    fireEvent.click(enabledSave)
    await waitFor(() => expect(mockPatchPersonality).toHaveBeenCalled())
    // Form should be hidden — Myers-Briggs label gone
    expect(screen.queryByText('Myers-Briggs')).not.toBeInTheDocument()
  })

  test('"Edit" button opens the form with existing values pre-filled', async () => {
    mockFetchProfile.mockResolvedValue({
      ...SAMPLE_PROFILE,
      personality: { mbti: 'ISTJ', enneagram: '1w2' },
    })
    render(<Profile onBack={vi.fn()} onGoToSettings={vi.fn()} onProfileChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('ISTJ')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    // Form should be visible with existing values
    expect(screen.getByDisplayValue('ISTJ')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1w2')).toBeInTheDocument()
  })
})
