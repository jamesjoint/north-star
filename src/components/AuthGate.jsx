import { useAuth } from '../contexts/AuthContext.jsx'
import LoginPage from './LoginPage.jsx'
import Onboarding from './Onboarding.jsx'

export default function AuthGate({ children }) {
  const { user, loading, onboardingDone, completeOnboarding, logout } = useAuth()

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

  if (user.status === 'pending' || user.status === 'deactivated') {
    const message = user.status === 'pending'
      ? "Your account is pending approval. You'll receive an email once you're approved."
      : 'Your account has been deactivated. Contact support if you think this is a mistake.'
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--chrome)',
        fontFamily: 'var(--font)',
      }}>
        <div style={{
          width: '100%',
          maxWidth: 360,
          padding: '40px 32px',
          background: 'var(--screen)',
          borderRadius: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>{user.status === 'pending' ? '⏳' : '🔒'}</div>
          <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 24 }}>
            {message}
          </p>
          <button
            onClick={logout}
            style={{
              fontSize: 13, color: 'var(--blue)',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            Use a different account
          </button>
        </div>
      </div>
    )
  }

  if (!onboardingDone) return <Onboarding onComplete={completeOnboarding} />

  return children
}
