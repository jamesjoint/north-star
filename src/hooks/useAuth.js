import { useState, useEffect } from 'react'
import { fetchCurrentUser } from '../api.js'

export function useAuth() {
  const [user, setUser] = useState(undefined) // undefined = loading, null = unauthenticated
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  function logout() {
    setUser(null)
  }

  return { user, loading, logout }
}
