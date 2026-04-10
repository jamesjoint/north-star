import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AuthGate from '../../src/components/AuthGate.jsx'

// Mock child components so tests don't pull in unrelated deps
vi.mock('../../src/components/LoginPage.jsx', () => ({
  default: () => <div>LoginPage</div>,
}))
vi.mock('../../src/components/Onboarding.jsx', () => ({
  default: ({ onComplete }) => <div>Onboarding<button onClick={onComplete}>finish</button></div>,
}))

let mockAuth = { user: null, loading: false, onboardingDone: true, completeOnboarding: vi.fn(), logout: vi.fn() }
vi.mock('../../src/contexts/AuthContext.jsx', () => ({
  useAuth: () => mockAuth,
}))

beforeEach(() => {
  mockAuth = { user: null, loading: false, onboardingDone: true, completeOnboarding: vi.fn(), logout: vi.fn() }
})

describe('AuthGate', () => {
  test('shows loading indicator while auth is resolving', () => {
    mockAuth = { user: undefined, loading: true, onboardingDone: true, completeOnboarding: vi.fn() }
    render(<AuthGate><div>App</div></AuthGate>)
    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
    expect(screen.queryByText('App')).not.toBeInTheDocument()
  })

  test('shows LoginPage when user is null', () => {
    mockAuth = { user: null, loading: false, onboardingDone: true, completeOnboarding: vi.fn() }
    render(<AuthGate><div>App</div></AuthGate>)
    expect(screen.getByText('LoginPage')).toBeInTheDocument()
    expect(screen.queryByText('App')).not.toBeInTheDocument()
  })

  test('shows Onboarding when authenticated but onboarding not done', () => {
    mockAuth = { user: { email: 'alice@example.com' }, loading: false, onboardingDone: false, completeOnboarding: vi.fn() }
    render(<AuthGate><div>App</div></AuthGate>)
    expect(screen.getByText('Onboarding')).toBeInTheDocument()
    expect(screen.queryByText('App')).not.toBeInTheDocument()
    expect(screen.queryByText('LoginPage')).not.toBeInTheDocument()
  })

  test('renders children when authenticated and onboarding complete', () => {
    mockAuth = { user: { email: 'alice@example.com' }, loading: false, onboardingDone: true, completeOnboarding: vi.fn() }
    render(<AuthGate><div>App</div></AuthGate>)
    expect(screen.getByText('App')).toBeInTheDocument()
    expect(screen.queryByText('LoginPage')).not.toBeInTheDocument()
    expect(screen.queryByText('Onboarding')).not.toBeInTheDocument()
  })

  test('Onboarding receives completeOnboarding as onComplete prop', () => {
    const completeOnboarding = vi.fn()
    mockAuth = { user: { email: 'alice@example.com' }, loading: false, onboardingDone: false, completeOnboarding, logout: vi.fn() }
    render(<AuthGate><div>App</div></AuthGate>)
    screen.getByText('finish').click()
    expect(completeOnboarding).toHaveBeenCalled()
  })

  test('shows pending approval message for pending user', () => {
    mockAuth = { user: { email: 'waiting@example.com', status: 'pending' }, loading: false, onboardingDone: false, completeOnboarding: vi.fn(), logout: vi.fn() }
    render(<AuthGate><div>App</div></AuthGate>)
    expect(screen.getByText(/pending approval/i)).toBeInTheDocument()
    expect(screen.queryByText('App')).not.toBeInTheDocument()
    expect(screen.queryByText('Onboarding')).not.toBeInTheDocument()
  })

  test('shows deactivated message for deactivated user', () => {
    mockAuth = { user: { email: 'gone@example.com', status: 'deactivated' }, loading: false, onboardingDone: true, completeOnboarding: vi.fn(), logout: vi.fn() }
    render(<AuthGate><div>App</div></AuthGate>)
    expect(screen.getByText(/deactivated/i)).toBeInTheDocument()
    expect(screen.queryByText('App')).not.toBeInTheDocument()
  })

  test('"Use a different account" button calls logout', () => {
    const logout = vi.fn()
    mockAuth = { user: { email: 'waiting@example.com', status: 'pending' }, loading: false, onboardingDone: false, completeOnboarding: vi.fn(), logout }
    render(<AuthGate><div>App</div></AuthGate>)
    screen.getByText('Use a different account').click()
    expect(logout).toHaveBeenCalled()
  })
})
