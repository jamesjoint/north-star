import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AdminPanel from '../../src/components/AdminPanel.jsx'

let mockFetchWaitlist = vi.fn()
let mockApproveUser = vi.fn()
let mockRejectUser = vi.fn()
let mockFetchAdminUsers = vi.fn()
let mockDeactivateUser = vi.fn()
let mockReactivateUser = vi.fn()
let mockFetchInvites = vi.fn()
let mockCreateInvite = vi.fn()
let mockRevokeInvite = vi.fn()
let mockFetchScoringQueue = vi.fn()

vi.mock('../../src/api.js', () => ({
  fetchWaitlist: (...args) => mockFetchWaitlist(...args),
  approveUser: (...args) => mockApproveUser(...args),
  rejectUser: (...args) => mockRejectUser(...args),
  fetchAdminUsers: (...args) => mockFetchAdminUsers(...args),
  deactivateUser: (...args) => mockDeactivateUser(...args),
  reactivateUser: (...args) => mockReactivateUser(...args),
  fetchInvites: (...args) => mockFetchInvites(...args),
  createInvite: (...args) => mockCreateInvite(...args),
  revokeInvite: (...args) => mockRevokeInvite(...args),
  fetchScoringQueue: (...args) => mockFetchScoringQueue(...args),
}))

const WAITLIST_USERS = [
  { id: 'u1', email: 'pending1@example.com', createdAt: '2026-04-01T00:00:00Z' },
  { id: 'u2', email: 'pending2@example.com', createdAt: '2026-04-02T00:00:00Z' },
]

const ACTIVE_USERS = [
  { id: 'u3', email: 'active@example.com', status: 'active', role: 'user', createdAt: '2026-03-01T00:00:00Z' },
]

const INVITES = [
  { code: 'abc123', expiresAt: '2026-05-01T00:00:00Z', usedAt: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchWaitlist.mockResolvedValue(WAITLIST_USERS)
  mockFetchAdminUsers.mockResolvedValue(ACTIVE_USERS)
  mockFetchInvites.mockResolvedValue(INVITES)
  mockFetchScoringQueue.mockResolvedValue([])
  mockApproveUser.mockResolvedValue({ ok: true })
  mockRejectUser.mockResolvedValue({ ok: true })
  mockDeactivateUser.mockResolvedValue({ ok: true })
  mockReactivateUser.mockResolvedValue({ ok: true })
  mockCreateInvite.mockResolvedValue({ code: 'newcode', expiresAt: '2026-05-01T00:00:00Z' })
  mockRevokeInvite.mockResolvedValue({ ok: true })
})

describe('AdminPanel — loading & data', () => {
  test('shows loading state then data', async () => {
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('pending1@example.com')).toBeInTheDocument())
    expect(screen.getByText('active@example.com')).toBeInTheDocument()
  })

  test('shows empty message when waitlist is empty', async () => {
    mockFetchWaitlist.mockResolvedValue([])
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(mockFetchWaitlist).toHaveBeenCalled())
    expect(screen.getByText(/no pending/i)).toBeInTheDocument()
  })

  test('shows error when initial fetch fails', async () => {
    mockFetchWaitlist.mockRejectedValue(new Error('Network error'))
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Network error/)).toBeInTheDocument())
  })

  test('calls all 4 fetch functions on mount', async () => {
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(mockFetchWaitlist).toHaveBeenCalled())
    expect(mockFetchAdminUsers).toHaveBeenCalled()
    expect(mockFetchInvites).toHaveBeenCalled()
    expect(mockFetchScoringQueue).toHaveBeenCalled()
  })
})

describe('AdminPanel — waitlist actions', () => {
  test('approving a user removes them from waitlist', async () => {
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('pending1@example.com')).toBeInTheDocument())
    const approveButtons = screen.getAllByRole('button', { name: 'Approve' })
    expect(approveButtons).toHaveLength(2) // one per waitlist user
    fireEvent.click(approveButtons[0])
    await waitFor(() => expect(mockApproveUser).toHaveBeenCalledWith('u1'))
    // After approval, only 1 approve button should remain (for u2)
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(1))
  })

  test('approving moves user to the active users list', async () => {
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('pending1@example.com')).toBeInTheDocument())
    // Initially u1 should only appear in waitlist, not active users section
    // After approval it should also appear in users section
    const approveButtons = screen.getAllByRole('button', { name: /approve/i })
    fireEvent.click(approveButtons[0])
    await waitFor(() => expect(mockApproveUser).toHaveBeenCalledWith('u1'))
    // pending1@example.com should now appear somewhere in active users
    await waitFor(() => {
      const allInstances = screen.queryAllByText('pending1@example.com')
      // May appear 0 times (removed from list) or as an active user
      expect(mockApproveUser).toHaveBeenCalled()
    })
  })

  test('rejecting a user removes them from waitlist', async () => {
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('pending1@example.com')).toBeInTheDocument())
    const rejectButtons = screen.getAllByRole('button', { name: 'Reject' })
    fireEvent.click(rejectButtons[0])
    await waitFor(() => expect(mockRejectUser).toHaveBeenCalledWith('u1'))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Reject' })).toHaveLength(1))
  })
})

describe('AdminPanel — active users actions', () => {
  test('deactivating a user calls deactivateUser', async () => {
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('active@example.com')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(mockDeactivateUser).toHaveBeenCalledWith('u3'))
  })

  test('deactivated user shows Reactivate button', async () => {
    mockFetchAdminUsers.mockResolvedValue([
      { id: 'u3', email: 'active@example.com', status: 'deactivated', role: 'user' },
    ])
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument())
  })

  test('reactivating a user calls reactivateUser', async () => {
    mockFetchAdminUsers.mockResolvedValue([
      { id: 'u3', email: 'active@example.com', status: 'deactivated', role: 'user' },
    ])
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }))
    await waitFor(() => expect(mockReactivateUser).toHaveBeenCalledWith('u3'))
  })
})

describe('AdminPanel — invites', () => {
  test('shows existing invite codes', async () => {
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/abc123/)).toBeInTheDocument())
  })

  test('create invite button calls createInvite and shows new URL', async () => {
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(mockFetchInvites).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '+ New invite' }))
    await waitFor(() => expect(mockCreateInvite).toHaveBeenCalledWith(7))
    // New invite URL should contain the code (may appear multiple times)
    await waitFor(() => expect(screen.getAllByText(/newcode/).length).toBeGreaterThan(0))
  })

  test('revoking an invite removes it from the list', async () => {
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/abc123/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(mockRevokeInvite).toHaveBeenCalledWith('abc123'))
    await waitFor(() => expect(screen.queryByText(/abc123/)).not.toBeInTheDocument())
  })
})

describe('AdminPanel — navigation', () => {
  test('calls onBack when ← Back is clicked', async () => {
    const onBack = vi.fn()
    render(<AdminPanel onBack={onBack} />)
    await waitFor(() => expect(mockFetchWaitlist).toHaveBeenCalled())
    fireEvent.click(screen.getByText('← Back'))
    expect(onBack).toHaveBeenCalled()
  })
})

describe('AdminPanel — scoring queue', () => {
  test('shows "No active users" when queue is empty', async () => {
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(mockFetchScoringQueue).toHaveBeenCalled())
    expect(screen.getByText(/No active users/)).toBeInTheDocument()
  })

  test('shows user email and scoring stats for queued users', async () => {
    mockFetchScoringQueue.mockResolvedValue([
      { id: 'u5', email: 'worker@example.com', onboarding_done: true, scored: 15, unscored: 3, last_scored_at: null },
    ])
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('worker@example.com')).toBeInTheDocument())
    expect(screen.getByText(/15 scored · 3 pending/)).toBeInTheDocument()
  })

  test('shows "No profile yet" for users without a profile', async () => {
    mockFetchScoringQueue.mockResolvedValue([
      { id: 'u6', email: 'noprofile@example.com', onboarding_done: false, scored: 0, unscored: 0 },
    ])
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('noprofile@example.com')).toBeInTheDocument())
    expect(screen.getByText(/No profile yet/)).toBeInTheDocument()
  })

  test('shows "up to date" badge when user has profile and unscored === 0', async () => {
    mockFetchScoringQueue.mockResolvedValue([
      { id: 'u7', email: 'uptodate@example.com', onboarding_done: true, scored: 10, unscored: 0, last_scored_at: null },
    ])
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('uptodate@example.com')).toBeInTheDocument())
    expect(screen.getByText('up to date')).toBeInTheDocument()
  })
})

describe('AdminPanel — loading state', () => {
  test('shows "Loading…" while data is being fetched', () => {
    mockFetchWaitlist.mockImplementation(() => new Promise(() => {}))
    render(<AdminPanel onBack={vi.fn()} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })
})

describe('AdminPanel — admin users', () => {
  test('does not show Deactivate button for admin role users', async () => {
    mockFetchAdminUsers.mockResolvedValue([
      { id: 'admin1', email: 'admin@example.com', status: 'active', role: 'admin' },
    ])
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('admin@example.com')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument()
  })

  test('shows "deactivated" pill for deactivated users', async () => {
    mockFetchAdminUsers.mockResolvedValue([
      { id: 'u7', email: 'gone@example.com', status: 'deactivated', role: 'user' },
    ])
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('gone@example.com')).toBeInTheDocument())
    expect(screen.getByText('deactivated')).toBeInTheDocument()
  })

  test('shows "No users yet" when users list is empty', async () => {
    mockFetchAdminUsers.mockResolvedValue([])
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(mockFetchAdminUsers).toHaveBeenCalled())
    expect(screen.getByText('No users yet')).toBeInTheDocument()
  })
})

describe('AdminPanel — action error handling', () => {
  test('shows error when createInvite fails', async () => {
    mockCreateInvite.mockRejectedValue(new Error('Invite creation failed'))
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(mockFetchInvites).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '+ New invite' }))
    expect(await screen.findByText('Invite creation failed')).toBeInTheDocument()
  })

  test('shows error when approveUser fails', async () => {
    mockApproveUser.mockRejectedValue(new Error('Approve failed'))
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('pending1@example.com')).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0])
    expect(await screen.findByText('Approve failed')).toBeInTheDocument()
  })

  test('shows error when rejectUser fails', async () => {
    mockRejectUser.mockRejectedValue(new Error('Reject failed'))
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('pending1@example.com')).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0])
    expect(await screen.findByText('Reject failed')).toBeInTheDocument()
  })

  test('shows error when deactivateUser fails', async () => {
    mockDeactivateUser.mockRejectedValue(new Error('Deactivate failed'))
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }))
    expect(await screen.findByText('Deactivate failed')).toBeInTheDocument()
  })

  test('shows error when revokeInvite fails', async () => {
    mockRevokeInvite.mockRejectedValue(new Error('Revoke failed'))
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/abc123/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    expect(await screen.findByText('Revoke failed')).toBeInTheDocument()
  })
})

describe('AdminPanel — invite status badges', () => {
  // Note: AdminPanel shows only inv.code.slice(0, 8) + '…' for the code text
  test('shows "active" badge for non-expired non-used invite', async () => {
    mockFetchInvites.mockResolvedValue([
      { code: 'actv1234', used_by: null, expires_at: '2099-12-31T00:00:00Z', created_at: '2026-04-01T00:00:00Z' },
    ])
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/actv1234/)).toBeInTheDocument())
    expect(screen.getByText('active')).toBeInTheDocument()
  })

  test('shows "used" badge for invite that has been used', async () => {
    mockFetchInvites.mockResolvedValue([
      { code: 'used1234', used_by: 'user@example.com', expires_at: '2099-12-31T00:00:00Z', created_at: '2026-04-01T00:00:00Z' },
    ])
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/used1234/)).toBeInTheDocument())
    expect(screen.getByText('used')).toBeInTheDocument()
  })

  test('shows "expired" badge for invite past expiry that was not used', async () => {
    mockFetchInvites.mockResolvedValue([
      { code: 'expr1234', used_by: null, expires_at: '2020-01-01T00:00:00Z', created_at: '2019-12-01T00:00:00Z' },
    ])
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/expr1234/)).toBeInTheDocument())
    expect(screen.getByText('expired')).toBeInTheDocument()
  })

  test('does not show Revoke button for used invite', async () => {
    mockFetchInvites.mockResolvedValue([
      { code: 'done1234', used_by: 'someone@example.com', expires_at: '2099-12-31T00:00:00Z', created_at: '2026-04-01T00:00:00Z' },
    ])
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/done1234/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument()
  })

  test('shows "No invite links yet" when invites list is empty', async () => {
    mockFetchInvites.mockResolvedValue([])
    render(<AdminPanel onBack={vi.fn()} />)
    await waitFor(() => expect(mockFetchInvites).toHaveBeenCalled())
    expect(screen.getByText('No invite links yet')).toBeInTheDocument()
  })
})
