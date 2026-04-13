import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Header from '../../src/components/Header.jsx'

// Mutable mock so individual tests can change the user
let mockUser = { email: 'alice@example.com', role: 'user' }
let mockLogout = vi.fn()
let mockFirstName = null
let mockLastName = null
vi.mock('../../src/contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: mockUser, logout: mockLogout, firstName: mockFirstName, lastName: mockLastName }),
}))

const DEFAULT_PROPS = {
  tab: 'search',
  setTab: vi.fn(),
  trackedCount: 0,
  unseenCount: 0,
  refreshing: false,
  onRefresh: vi.fn(),
}

describe('tab rendering', () => {
  test('renders all three tabs', () => {
    render(<Header {...DEFAULT_PROPS} />)
    expect(screen.getByRole('button', { name: 'Radar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Constellation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })

  test('clicking Radar tab calls setTab with "search"', () => {
    const setTab = vi.fn()
    render(<Header {...DEFAULT_PROPS} tab="tracker" setTab={setTab} />)
    fireEvent.click(screen.getByRole('button', { name: 'Radar' }))
    expect(setTab).toHaveBeenCalledWith('search')
  })

  test('clicking Constellation tab calls setTab with "tracker"', () => {
    const setTab = vi.fn()
    render(<Header {...DEFAULT_PROPS} tab="search" setTab={setTab} />)
    fireEvent.click(screen.getByRole('button', { name: 'Constellation' }))
    expect(setTab).toHaveBeenCalledWith('tracker')
  })

  test('clicking Settings tab calls setTab with "settings"', () => {
    const setTab = vi.fn()
    render(<Header {...DEFAULT_PROPS} tab="search" setTab={setTab} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(setTab).toHaveBeenCalledWith('settings')
  })
})

describe('badge counts', () => {
  test('shows unseenCount badge on Jobs tab when > 0', () => {
    render(<Header {...DEFAULT_PROPS} unseenCount={5} />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  test('does not show unseen badge when count is 0', () => {
    render(<Header {...DEFAULT_PROPS} unseenCount={0} />)
    // No badge span with a small number
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  test('shows trackedCount badge on Tracker tab when > 0', () => {
    render(<Header {...DEFAULT_PROPS} trackedCount={12} />)
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  test('does not show tracker badge when count is 0', () => {
    render(<Header {...DEFAULT_PROPS} trackedCount={0} />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})

describe('avatar and user', () => {
  test('renders user initials in the avatar button', () => {
    render(<Header {...DEFAULT_PROPS} />)
    // alice@example.com → initials AL
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  test('clicking avatar toggles the user menu', () => {
    render(<Header {...DEFAULT_PROPS} />)
    expect(screen.queryByText(/Profile/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('AL'))
    expect(screen.getByText('Profile')).toBeInTheDocument()
  })

  test('user email is shown in opened menu', () => {
    render(<Header {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByText('AL'))
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  test('shows first+last initials when firstName and lastName are set', () => {
    mockFirstName = 'Grace'
    mockLastName = 'Hopper'
    render(<Header {...DEFAULT_PROPS} />)
    expect(screen.getByText('GH')).toBeInTheDocument()
    mockFirstName = null
    mockLastName = null
  })

  test('shows single initial when only firstName is set', () => {
    mockFirstName = 'Grace'
    mockLastName = null
    render(<Header {...DEFAULT_PROPS} />)
    expect(screen.getByText('G')).toBeInTheDocument()
    mockFirstName = null
  })

  test('shows "Hi, FirstName" in dropdown when firstName is set', () => {
    mockFirstName = 'Grace'
    mockLastName = null
    render(<Header {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByText('G'))
    expect(screen.getByText('Hi, Grace')).toBeInTheDocument()
    mockFirstName = null
  })
})

describe('refresh button', () => {
  test('calls onRefresh when clicked', () => {
    const onRefresh = vi.fn()
    render(<Header {...DEFAULT_PROPS} onRefresh={onRefresh} />)
    fireEvent.click(screen.getByTitle('Refresh jobs'))
    expect(onRefresh).toHaveBeenCalled()
  })

  test('is disabled while refreshing', () => {
    render(<Header {...DEFAULT_PROPS} refreshing={true} />)
    expect(screen.getByTitle('Scanning…')).toBeInTheDocument()
  })
})

describe('admin user', () => {
  test('shows ADMIN badge in menu for admin users', () => {
    mockUser = { email: 'admin@example.com', role: 'admin' }
    render(<Header {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByText('AD'))
    expect(screen.getByText('ADMIN')).toBeInTheDocument()
    mockUser = { email: 'alice@example.com', role: 'user' }
  })

  test('shows Admin menu item for admin users', () => {
    mockUser = { email: 'admin@example.com', role: 'admin' }
    render(<Header {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByText('AD'))
    expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument()
    mockUser = { email: 'alice@example.com', role: 'user' }
  })

  test('non-admin users do not see Admin menu item', () => {
    mockUser = { email: 'alice@example.com', role: 'user' }
    render(<Header {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByText('AL'))
    expect(screen.queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument()
  })

  test('clicking Admin menu item calls setTab("admin")', () => {
    mockUser = { email: 'admin@example.com', role: 'admin' }
    const setTab = vi.fn()
    render(<Header {...DEFAULT_PROPS} setTab={setTab} />)
    fireEvent.click(screen.getByText('AD'))
    fireEvent.click(screen.getByRole('button', { name: 'Admin' }))
    expect(setTab).toHaveBeenCalledWith('admin')
    mockUser = { email: 'alice@example.com', role: 'user' }
  })
})

describe('menu actions', () => {
  test('clicking Profile calls setTab("profile")', () => {
    const setTab = vi.fn()
    render(<Header {...DEFAULT_PROPS} setTab={setTab} />)
    fireEvent.click(screen.getByText('AL'))
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }))
    expect(setTab).toHaveBeenCalledWith('profile')
  })

  test('clicking Sign out calls logout', () => {
    mockLogout = vi.fn()
    render(<Header {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByText('AL'))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(mockLogout).toHaveBeenCalled()
  })

  test('clicking Profile calls setTab("profile")', () => {
    const setTab = vi.fn()
    render(<Header {...DEFAULT_PROPS} tab="tracker" setTab={setTab} />)
    fireEvent.click(screen.getByText('AL'))
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }))
    expect(setTab).toHaveBeenCalledWith('profile')
  })

  test('clicking Admin calls setTab("admin")', () => {
    mockUser = { email: 'admin@example.com', role: 'admin' }
    const setTab = vi.fn()
    render(<Header {...DEFAULT_PROPS} tab="search" setTab={setTab} />)
    fireEvent.click(screen.getByText('AD'))
    fireEvent.click(screen.getByRole('button', { name: 'Admin' }))
    expect(setTab).toHaveBeenCalledWith('admin')
    mockUser = { email: 'alice@example.com', role: 'user' }
  })

  test('clicking outside the open menu closes it', () => {
    render(<Header {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByText('AL'))
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    // Simulate a mousedown event on the document body (outside the menu)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('alice@example.com')).not.toBeInTheDocument()
  })
})
