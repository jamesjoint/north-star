import { useState, useEffect, useCallback } from 'react'
import { fetchBoards, createBoardApi, updateBoardApi, deleteBoardApi, AuthExpiredError } from '../api.js'

export function useBoards() {
  const [boards, setBoards] = useState([])
  const [activeBoardId, setActiveBoardId] = useState(null)

  const reloadBoards = useCallback(() => {
    fetchBoards()
      .then(setBoards)
      .catch(err => { if (!(err instanceof AuthExpiredError)) console.error('[useBoards] fetch failed:', err.message) })
  }, [])

  useEffect(() => { reloadBoards() }, [reloadBoards])

  const createBoard = useCallback(async (name, emoji) => {
    try {
      const board = await createBoardApi(name, emoji)
      setBoards(prev => [...prev, board])
    } catch (err) {
      console.error('[useBoards] create failed:', err.message)
    }
  }, [])

  const renameBoard = useCallback(async (id, name) => {
    setBoards(prev => prev.map(b => b.id === id ? { ...b, name } : b))
    try {
      await updateBoardApi(id, { name })
    } catch (err) {
      console.error('[useBoards] rename failed:', err.message)
    }
  }, [])

  const deleteBoard = useCallback(async (id) => {
    setBoards(prev => prev.filter(b => b.id !== id))
    if (activeBoardId === id) setActiveBoardId(null)
    try {
      await deleteBoardApi(id)
    } catch (err) {
      console.error('[useBoards] delete failed:', err.message)
      // Reload to restore state on failure
      fetchBoards().then(setBoards).catch(() => {})
    }
  }, [activeBoardId])

  return {
    boards, activeBoardId, setActiveBoardId,
    createBoard, renameBoard, deleteBoard, reloadBoards,
  }
}
