import { useState } from 'react'
import { requestLink, redeemInvite } from '../api.js'

function getInviteCode() {
  return new URLSearchParams(window.location.search).get('invite')
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [stage, setStage] = useState('enter') // 'enter' | 'sent' | 'waitlist' | 'error'
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const inviteCode = getInviteCode()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.includes('@')) {
      setMessage('Enter a valid email address.')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      if (inviteCode) {
        const res = await redeemInvite(inviteCode, email)
        const body = await res.json().catch(() => ({}))
        if (res.ok || res.status === 409) {
          setStage('sent')
          return
        }
        setMessage(body.error || 'This invite link is no longer valid.')
        setStage('error')
        return
      }

      await requestLink(email)
      setStage('sent')
    } catch {
      // Show sent anyway — user should check inbox; network errors are transient
      setStage('sent')
    } finally {
      setLoading(false)
    }
  }

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
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: 'var(--text-1)' }}>
          {inviteCode ? "You've been invited" : 'North Star'}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 28 }}>
          {inviteCode
            ? 'Enter your email to activate your account and get a sign-in link.'
            : 'Enter your email to sign in or request access.'}
        </p>

        {(stage === 'sent') && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✉️</div>
            <p style={{ fontSize: 15, color: 'var(--text-1)', fontWeight: 500 }}>Check your inbox</p>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
              If this email is eligible, a sign-in link has been sent. Check your inbox and spam folder.
            </p>
            <button
              style={{ marginTop: 20, fontSize: 13, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => { setStage('enter'); setMessage('') }}
            >
              Use a different email
            </button>
          </div>
        )}

        {(stage === 'enter' || stage === 'error') && (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 15,
                border: '1px solid rgba(0,0,0,0.18)',
                borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: 12,
                fontFamily: 'var(--font)',
              }}
            />
            {message && (
              <p style={{ fontSize: 13, color: stage === 'error' ? 'var(--score-lo)' : 'var(--text-3)', marginBottom: 10 }}>
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: 15,
                fontWeight: 600,
                background: 'var(--blue)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.7 : 1,
                fontFamily: 'var(--font)',
              }}
            >
              {loading ? 'Sending…' : 'Continue'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
