import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from '../../src/components/LoginPage.jsx'

vi.mock('../../src/api.js', () => ({
  sendMagicLink: vi.fn(),
  signup: vi.fn(),
  redeemInvite: vi.fn(),
}))

import { sendMagicLink, signup, redeemInvite } from '../../src/api.js'

// Helper to set window.location.search
function setSearch(qs) {
  Object.defineProperty(window, 'location', {
    value: { search: qs },
    writable: true,
    configurable: true,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  setSearch('')
})

describe('LoginPage — initial render', () => {
  test('shows JobMatch heading when no invite code', () => {
    render(<LoginPage />)
    expect(screen.getByText('JobMatch')).toBeInTheDocument()
  })

  test('shows invite heading when invite code is in URL', () => {
    setSearch('?invite=abc123')
    render(<LoginPage />)
    expect(screen.getByText("You've been invited")).toBeInTheDocument()
  })

  test('shows email input and Continue button', () => {
    render(<LoginPage />)
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })
})

describe('LoginPage — validation', () => {
  test('shows error when email has no @', async () => {
    render(<LoginPage />)
    const input = screen.getByPlaceholderText('you@example.com')
    fireEvent.change(input, { target: { value: 'notanemail' } })
    // Submit the form directly to bypass jsdom HTML5 type="email" validation
    fireEvent.submit(input.closest('form'))
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
  })

  test('does not call API when email is invalid', async () => {
    render(<LoginPage />)
    const input = screen.getByPlaceholderText('you@example.com')
    fireEvent.change(input, { target: { value: 'bad' } })
    fireEvent.submit(input.closest('form'))
    expect(sendMagicLink).not.toHaveBeenCalled()
  })
})

describe('LoginPage — magic link flow', () => {
  test('shows sent state after successful magic link', async () => {
    sendMagicLink.mockResolvedValue({ ok: true })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'alice@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Check your inbox')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  test('clicking "Use a different email" returns to enter stage', async () => {
    sendMagicLink.mockResolvedValue({ ok: true })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'alice@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText('Check your inbox')
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
  })
})

describe('LoginPage — waitlist flow', () => {
  test('shows waitlist message when user account is pending (403)', async () => {
    sendMagicLink.mockResolvedValue({ ok: false, status: 403 })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'pending@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/pending approval/)).toBeInTheDocument()
  })

  test('shows waitlist after new signup (404 → signup ok)', async () => {
    sendMagicLink.mockResolvedValue({ ok: false, status: 404 })
    signup.mockResolvedValue({
      ok: true,
      json: async () => ({ message: "You're on the waitlist — we'll be in touch." }),
    })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/waitlist/)).toBeInTheDocument()
  })
})

describe('LoginPage — invite flow', () => {
  test('calls redeemInvite with code and email', async () => {
    setSearch('?invite=abc123')
    redeemInvite.mockResolvedValue({ ok: true, json: async () => ({}) })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'invited@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(redeemInvite).toHaveBeenCalledWith('abc123', 'invited@example.com'))
  })

  test('shows sent state after successful invite redemption', async () => {
    setSearch('?invite=abc123')
    redeemInvite.mockResolvedValue({ ok: true, json: async () => ({}) })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'invited@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Check your inbox')).toBeInTheDocument()
  })

  test('shows error message when invite is expired or invalid', async () => {
    setSearch('?invite=badcode')
    redeemInvite.mockResolvedValue({
      ok: false,
      status: 410,
      json: async () => ({ error: 'Invite expired' }),
    })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Invite expired')).toBeInTheDocument()
  })

  test('shows sent state when 409 invite code + magic link fallback succeeds', async () => {
    setSearch('?invite=usedcode')
    redeemInvite.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Already used' }),
    })
    sendMagicLink.mockResolvedValue({ ok: true })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'existing@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Check your inbox')).toBeInTheDocument()
  })
})

describe('LoginPage — network error', () => {
  test('shows connection error message on fetch failure', async () => {
    sendMagicLink.mockRejectedValue(new Error('Network error'))
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'alice@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/Could not connect/)).toBeInTheDocument()
  })
})

describe('LoginPage — loading state', () => {
  test('button shows Sending… and is disabled while submitting', async () => {
    sendMagicLink.mockImplementation(() => new Promise(() => {})) // never resolves
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'alice@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()
  })
})

describe('LoginPage — waitlist edge cases', () => {
  test('shows sent stage when signup returns 409 (email already registered)', async () => {
    sendMagicLink.mockResolvedValue({ ok: false, status: 404 })
    signup.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: 'Already registered' }),
    })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'dup@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    // 409 from signup → component calls setStage('sent') so user sees the inbox check screen
    expect(await screen.findByText('Check your inbox')).toBeInTheDocument()
  })
})

describe('LoginPage — signup server error', () => {
  test('shows error message when signup returns a server error', async () => {
    sendMagicLink.mockResolvedValue({ ok: false, status: 404 })
    signup.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
    })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'error@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/Internal server error/)).toBeInTheDocument()
  })
})

describe('LoginPage — invite 409 + magic link fallback fails', () => {
  test('shows error when invite is already-used and magic link also fails', async () => {
    setSearch('?invite=usedcode')
    redeemInvite.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Invite already used' }),
    })
    sendMagicLink.mockResolvedValue({ ok: false, status: 404 })
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'nobody@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/Invite already used|no longer valid/)).toBeInTheDocument()
  })
})
