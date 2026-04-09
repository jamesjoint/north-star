import { useAuth } from '../hooks/useAuth.js'
import LoginPage from './LoginPage.jsx'

export default function AuthGate({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font)',
        color: 'var(--text-3)',
        background: 'var(--chrome)',
      }}>
        Loading…
      </div>
    )
  }

  if (!user) return <LoginPage />

  return children
}
