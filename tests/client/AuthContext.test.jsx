import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext.jsx'

let mockFetchCurrentUser = vi.fn()
let mockFetchProfile = vi.fn()
let mockSignOut = vi.fn()

vi.mock('../../src/api.js', () => ({
  fetchCurrentUser: (...args) => mockFetchCurrentUser(...args),
  fetchProfile: (...args) => mockFetchProfile(...args),
  signOut: (...args) => mockSignOut(...args),
}))

// Consumer component that renders auth context values as text
function AuthDisplay() {
  const { user, loading, onboardingDone } = useAuth()
  if (loading) return <div>loading</div>
  if (!user) return <div>logged-out</div>
  return (
    <div>
      <span data-testid="email">{user.email}</span>
      <span data-testid="onboarding">{onboardingDone ? 'done' : 'pending'}</span>
    </div>
  )
}

function LogoutButton() {
  const { logout } = useAuth()
  return <button onClick={logout}>Logout</button>
}

function OnboardingComplete() {
  const { completeOnboarding, onboardingDone } = useAuth()
  return (
    <div>
      <span data-testid="onboarding">{onboardingDone ? 'done' : 'pending'}</span>
      <button onClick={completeOnboarding}>complete</button>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchProfile.mockResolvedValue({ onboarding_done: true })
})

describe('AuthProvider — initial loading', () => {
  test('shows loading state before fetchCurrentUser resolves', () => {
    mockFetchCurrentUser.mockImplementation(() => new Promise(() => {})) // never resolves
    render(<AuthProvider><AuthDisplay /></AuthProvider>)
    expect(screen.getByText('loading')).toBeInTheDocument()
  })

  test('shows children after auth resolves with null user', async () => {
    mockFetchCurrentUser.mockResolvedValue(null)
    render(<AuthProvider><AuthDisplay /></AuthProvider>)
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument())
    expect(screen.getByText('logged-out')).toBeInTheDocument()
  })

  test('provides user when fetchCurrentUser returns a user', async () => {
    mockFetchCurrentUser.mockResolvedValue({ email: 'alice@example.com' })
    render(<AuthProvider><AuthDisplay /></AuthProvider>)
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument())
    expect(screen.getByTestId('email').textContent).toBe('alice@example.com')
  })

  test('sets user to null when fetchCurrentUser throws', async () => {
    mockFetchCurrentUser.mockRejectedValue(new Error('network'))
    render(<AuthProvider><AuthDisplay /></AuthProvider>)
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument())
    expect(screen.getByText('logged-out')).toBeInTheDocument()
  })
})

describe('AuthProvider — onboarding state', () => {
  test('onboardingDone is true when profile.onboarding_done is true', async () => {
    mockFetchCurrentUser.mockResolvedValue({ email: 'alice@example.com' })
    mockFetchProfile.mockResolvedValue({ onboarding_done: true })
    render(<AuthProvider><AuthDisplay /></AuthProvider>)
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument())
    expect(screen.getByTestId('onboarding').textContent).toBe('done')
  })

  test('onboardingDone is false when profile.onboarding_done is false', async () => {
    mockFetchCurrentUser.mockResolvedValue({ email: 'alice@example.com' })
    mockFetchProfile.mockResolvedValue({ onboarding_done: false })
    render(<AuthProvider><AuthDisplay /></AuthProvider>)
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument())
    expect(screen.getByTestId('onboarding').textContent).toBe('pending')
  })

  test('onboardingDone is false when fetchProfile throws', async () => {
    mockFetchCurrentUser.mockResolvedValue({ email: 'alice@example.com' })
    mockFetchProfile.mockRejectedValue(new Error('profile error'))
    render(<AuthProvider><AuthDisplay /></AuthProvider>)
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument())
    expect(screen.getByTestId('onboarding').textContent).toBe('pending')
  })

  test('does not call fetchProfile when user is null', async () => {
    mockFetchCurrentUser.mockResolvedValue(null)
    render(<AuthProvider><AuthDisplay /></AuthProvider>)
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument())
    expect(mockFetchProfile).not.toHaveBeenCalled()
  })

  test('completeOnboarding() sets onboardingDone to true', async () => {
    mockFetchCurrentUser.mockResolvedValue({ email: 'alice@example.com' })
    mockFetchProfile.mockResolvedValue({ onboarding_done: false })
    render(<AuthProvider><OnboardingComplete /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('onboarding').textContent).toBe('pending'))
    screen.getByRole('button', { name: 'complete' }).click()
    await waitFor(() => expect(screen.getByTestId('onboarding').textContent).toBe('done'))
  })
})

describe('AuthProvider — logout', () => {
  test('logout calls signOut and sets user to null', async () => {
    mockFetchCurrentUser.mockResolvedValue({ email: 'alice@example.com' })
    mockSignOut.mockResolvedValue()
    render(
      <AuthProvider>
        <AuthDisplay />
        <LogoutButton />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument())
    expect(screen.getByTestId('email').textContent).toBe('alice@example.com')
    screen.getByRole('button', { name: 'Logout' }).click()
    await waitFor(() => expect(screen.getByText('logged-out')).toBeInTheDocument())
    expect(mockSignOut).toHaveBeenCalled()
  })

  test('logout sets user to null even when signOut throws', async () => {
    mockFetchCurrentUser.mockResolvedValue({ email: 'alice@example.com' })
    mockSignOut.mockRejectedValue(new Error('sign-out error'))
    render(
      <AuthProvider>
        <AuthDisplay />
        <LogoutButton />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument())
    screen.getByRole('button', { name: 'Logout' }).click()
    await waitFor(() => expect(screen.getByText('logged-out')).toBeInTheDocument())
  })
})

describe('AuthProvider — auth:expired event', () => {
  test('sets user to null when auth:expired event fires', async () => {
    mockFetchCurrentUser.mockResolvedValue({ email: 'alice@example.com' })
    render(<AuthProvider><AuthDisplay /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('email')).toBeInTheDocument())
    act(() => {
      window.dispatchEvent(new CustomEvent('auth:expired'))
    })
    await waitFor(() => expect(screen.getByText('logged-out')).toBeInTheDocument())
  })
})
