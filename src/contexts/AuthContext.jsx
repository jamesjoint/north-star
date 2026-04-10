import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { fetchCurrentUser, fetchProfile, signOut as apiSignOut } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading
  const [loading, setLoading] = useState(true)
  const [onboardingDone, setOnboardingDone] = useState(true)

  useEffect(() => {
    fetchCurrentUser()
      .then(async (u) => {
        setUser(u)
        if (u) {
          try {
            const profile = await fetchProfile()
            setOnboardingDone(!!profile?.onboarding_done)
          } catch {
            setOnboardingDone(false)
          }
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const logout = useCallback(async () => {
    try { await apiSignOut() } catch {}
    setUser(null)
  }, [])

  // If any API call returns 401, the session has expired — show login
  useEffect(() => {
    function onExpired() { setUser(null) }
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [])

  function completeOnboarding() {
    setOnboardingDone(true)
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout, onboardingDone, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
