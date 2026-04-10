import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBoards } from '../../src/hooks/useBoards.js'

let mockFetchBoards = vi.fn()
let mockCreateBoardApi = vi.fn()
let mockUpdateBoardApi = vi.fn()
let mockDeleteBoardApi = vi.fn()

vi.mock('../../src/api.js', () => ({
  fetchBoards: (...args) => mockFetchBoards(...args),
  createBoardApi: (...args) => mockCreateBoardApi(...args),
  updateBoardApi: (...args) => mockUpdateBoardApi(...args),
  deleteBoardApi: (...args) => mockDeleteBoardApi(...args),
  AuthExpiredError: class AuthExpiredError extends Error { constructor() { super('auth_expired') } },
}))

const BOARDS = [
  { id: 'b1', name: 'My Job Search', emoji: null, job_count: 2 },
  { id: 'b2', name: 'Dream Jobs', emoji: '⭐', job_count: 0 },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchBoards.mockResolvedValue(BOARDS)
  mockCreateBoardApi.mockResolvedValue({ id: 'b3', name: 'New Board', emoji: null, job_count: 0 })
  mockUpdateBoardApi.mockResolvedValue({ ok: true })
  mockDeleteBoardApi.mockResolvedValue({ ok: true })
})

describe('useBoards — initial load', () => {
  test('fetches boards on mount', async () => {
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(result.current.boards).toHaveLength(2))
    expect(mockFetchBoards).toHaveBeenCalledTimes(1)
  })

  test('boards starts empty before fetch resolves', () => {
    mockFetchBoards.mockImplementation(() => new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useBoards())
    expect(result.current.boards).toEqual([])
  })

  test('activeBoardId starts as null', async () => {
    const { result } = renderHook(() => useBoards())
    expect(result.current.activeBoardId).toBeNull()
  })

  test('silently swallows fetch errors (non-auth)', async () => {
    mockFetchBoards.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(mockFetchBoards).toHaveBeenCalled())
    expect(result.current.boards).toEqual([])
  })

  test('silently swallows AuthExpiredError (lets AuthContext handle it)', async () => {
    const { AuthExpiredError } = await import('../../src/api.js')
    mockFetchBoards.mockRejectedValue(new AuthExpiredError())
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(mockFetchBoards).toHaveBeenCalled())
    expect(result.current.boards).toEqual([])
  })
})

describe('useBoards — setActiveBoardId', () => {
  test('updates activeBoardId when set', async () => {
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(result.current.boards).toHaveLength(2))
    act(() => { result.current.setActiveBoardId('b1') })
    expect(result.current.activeBoardId).toBe('b1')
  })

  test('can be reset to null', async () => {
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(result.current.boards).toHaveLength(2))
    act(() => { result.current.setActiveBoardId('b1') })
    act(() => { result.current.setActiveBoardId(null) })
    expect(result.current.activeBoardId).toBeNull()
  })
})

describe('useBoards — createBoard', () => {
  test('appends the new board to the list', async () => {
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(result.current.boards).toHaveLength(2))
    await act(async () => { await result.current.createBoard('New Board') })
    expect(result.current.boards).toHaveLength(3)
    expect(result.current.boards[2].name).toBe('New Board')
  })

  test('calls createBoardApi with name and emoji', async () => {
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(result.current.boards).toHaveLength(2))
    await act(async () => { await result.current.createBoard('Work', '💼') })
    expect(mockCreateBoardApi).toHaveBeenCalledWith('Work', '💼')
  })

  test('silently swallows createBoard errors', async () => {
    mockCreateBoardApi.mockRejectedValue(new Error('Create failed'))
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(result.current.boards).toHaveLength(2))
    await act(async () => { await result.current.createBoard('Bad Board') })
    expect(result.current.boards).toHaveLength(2) // no new board added
  })
})

describe('useBoards — renameBoard', () => {
  test('optimistically updates board name', async () => {
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(result.current.boards).toHaveLength(2))
    await act(async () => { await result.current.renameBoard('b1', 'Renamed') })
    const b1 = result.current.boards.find(b => b.id === 'b1')
    expect(b1.name).toBe('Renamed')
  })

  test('calls updateBoardApi with id and new name', async () => {
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(result.current.boards).toHaveLength(2))
    await act(async () => { await result.current.renameBoard('b1', 'Renamed') })
    expect(mockUpdateBoardApi).toHaveBeenCalledWith('b1', { name: 'Renamed' })
  })

  test('keeps optimistic update even when updateBoardApi fails (no rollback)', async () => {
    mockUpdateBoardApi.mockRejectedValue(new Error('Update failed'))
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(result.current.boards).toHaveLength(2))
    await act(async () => { await result.current.renameBoard('b1', 'Optimistic Name') })
    // Optimistic update stays even on failure (no rollback on rename)
    const b1 = result.current.boards.find(b => b.id === 'b1')
    expect(b1.name).toBe('Optimistic Name')
  })
})

describe('useBoards — deleteBoard', () => {
  test('removes the board from the list', async () => {
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(result.current.boards).toHaveLength(2))
    await act(async () => { await result.current.deleteBoard('b1') })
    expect(result.current.boards).toHaveLength(1)
    expect(result.current.boards[0].id).toBe('b2')
  })

  test('resets activeBoardId when active board is deleted', async () => {
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(result.current.boards).toHaveLength(2))
    act(() => { result.current.setActiveBoardId('b1') })
    await act(async () => { await result.current.deleteBoard('b1') })
    expect(result.current.activeBoardId).toBeNull()
  })

  test('does not reset activeBoardId when a different board is deleted', async () => {
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(result.current.boards).toHaveLength(2))
    act(() => { result.current.setActiveBoardId('b2') })
    await act(async () => { await result.current.deleteBoard('b1') })
    expect(result.current.activeBoardId).toBe('b2')
  })

  test('restores boards from server on delete failure', async () => {
    mockDeleteBoardApi.mockRejectedValue(new Error('Delete failed'))
    // On failure, the hook re-fetches boards
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(result.current.boards).toHaveLength(2))
    await act(async () => { await result.current.deleteBoard('b1') })
    // After failure, fetchBoards is called again to restore state
    await waitFor(() => expect(mockFetchBoards).toHaveBeenCalledTimes(2))
  })
})

describe('useBoards — reloadBoards', () => {
  test('re-fetches boards when called', async () => {
    const { result } = renderHook(() => useBoards())
    await waitFor(() => expect(result.current.boards).toHaveLength(2))
    mockFetchBoards.mockResolvedValue([BOARDS[0]]) // now returns 1 board
    await act(async () => { result.current.reloadBoards() })
    await waitFor(() => expect(result.current.boards).toHaveLength(1))
    expect(mockFetchBoards).toHaveBeenCalledTimes(2)
  })
})
