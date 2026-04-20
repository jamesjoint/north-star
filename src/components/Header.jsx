import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { signOut as apiSignOut } from '../api.js'
import { avatarColor, initials } from '../utils/avatar.js'

const TABS = [
  { id: 'search',   label: 'Radar' },
  { id: 'tracker',  label: 'Constellation' },
  { id: 'settings', label: 'Settings' },
]

export default function Header({ tab, setTab, trackedCount, unseenCount, refreshing, onRefresh }) {
  const { user, logout, firstName, lastName } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const prevTrackedRef = useRef(trackedCount)
  const [badgeBounce, setBadgeBounce] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    function onOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [menuOpen])

  useEffect(() => {
    if (trackedCount > prevTrackedRef.current) {
      setBadgeBounce(true)
      setTimeout(() => setBadgeBounce(false), 300)
    }
    prevTrackedRef.current = trackedCount
  }, [trackedCount])

  async function handleSignOut() {
    setMenuOpen(false)
    await logout()
  }

  function handleProfile() {
    setMenuOpen(false)
    setTab('profile')
  }

  function handleAdmin() {
    setMenuOpen(false)
    setTab('admin')
  }

  const color = avatarColor(user?.email)
  const abbr = firstName
    ? `${firstName[0]}${lastName?.[0] || ''}`.toUpperCase()
    : initials(user?.email)

  return (
    <header style={{
      height: 48,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      background: '#fff',
      borderBottom: '1px solid var(--divider)',
      userSelect: 'none',
      position: 'relative',
      zIndex: 10,
    }}>
      {/* Logo */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 100,
        fontWeight: 700,
        fontSize: 15,
        letterSpacing: -0.3,
        color: 'var(--text-2)',
      }}>
        <span style={{ color: 'var(--blue)', fontSize: 17 }}>✦</span>
        <span>NORTH</span><span style={{ color: '#8e8e93' }}> STAR</span>
      </div>

      {/* Center tab nav */}
      <nav style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 4 }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                position: 'relative',
                padding: '4px 14px',
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--text)' : 'var(--text-3)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font)',
                transition: 'color 0.12s',
              }}
            >
              {t.label}
              {t.id === 'search' && unseenCount > 0 && (
                <span style={{
                  marginLeft: 5,
                  background: 'var(--blue)',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '1px 5px',
                  fontSize: 10,
                  fontWeight: 700,
                  verticalAlign: 'middle',
                }}>
                  {unseenCount}
                </span>
              )}
              {t.id === 'tracker' && trackedCount > 0 && (
                <span style={{
                  marginLeft: 5,
                  background: 'var(--blue)',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '1px 5px',
                  fontSize: 10,
                  fontWeight: 700,
                  verticalAlign: 'middle',
                  display: 'inline-block',
                  transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                  transform: badgeBounce ? 'scale(1.4)' : 'scale(1)',
                }}>
                  {trackedCount}
                </span>
              )}
              {active && (
                <span style={{
                  position: 'absolute',
                  bottom: -1,
                  left: 8,
                  right: 8,
                  height: 2,
                  background: 'var(--blue)',
                  borderRadius: 2,
                }} />
              )}
            </button>
          )
        })}
      </nav>

      {/* Right: refresh + avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100, justifyContent: 'flex-end' }}>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          title={refreshing ? 'Scanning…' : 'Refresh jobs'}
          style={{
            background: 'none', border: 'none', cursor: refreshing ? 'default' : 'pointer',
            padding: 6, opacity: refreshing ? 0.5 : 0.7, transition: 'opacity 0.2s',
            display: 'flex', alignItems: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M13.5 8A5.5 5.5 0 1 1 8 2.5a5.47 5.47 0 0 1 3.536 1.29"
              stroke={refreshing ? 'var(--brand-amber)' : 'var(--text-3)'}
              strokeWidth="1.5" strokeLinecap="round"
            />
            <path
              d="M11 1.5l1.5 2.5-2.5.5"
              stroke={refreshing ? 'var(--brand-amber)' : 'var(--text-3)'}
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Avatar */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: color,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
              letterSpacing: 0.5,
              fontFamily: 'var(--font)',
            }}
          >
            {abbr}
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 6px)',
              width: 220,
              background: '#fff',
              borderRadius: 10,
              boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)',
              overflow: 'hidden',
              zIndex: 100,
            }}>
              {/* User info */}
              <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--divider)' }}>
                {firstName ? (
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                    Hi, {firstName}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 2 }}>Signed in as</div>
                )}
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', wordBreak: 'break-all' }}>
                  {user?.email}
                </div>
                {user?.role === 'admin' && (
                  <div style={{
                    display: 'inline-block',
                    marginTop: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--accent)',
                    background: 'rgba(220,0,255,0.12)',
                    borderRadius: 4,
                    padding: '1px 6px',
                    letterSpacing: 0.3,
                  }}>
                    ADMIN
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ padding: '4px 0' }}>
                {user?.role === 'admin' && (
                  <>
                    <button
                      onClick={handleAdmin}
                      style={{
                        width: '100%',
                        padding: '9px 14px',
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 13,
                        color: 'var(--text)',
                        fontFamily: 'var(--font)',
                      }}
                    >
                      Admin
                    </button>
                    <div style={{ height: 1, margin: '0 14px', background: 'var(--divider)' }} />
                  </>
                )}
                <button
                  onClick={handleProfile}
                  style={{
                    width: '100%',
                    padding: '9px 14px',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--text)',
                    fontFamily: 'var(--font)',
                  }}
                >
                  Profile
                </button>
                <div style={{ height: 1, margin: '0 14px', background: 'var(--divider)' }} />
                <button
                  onClick={handleSignOut}
                  style={{
                    width: '100%',
                    padding: '9px 14px',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--score-lo)',
                    fontFamily: 'var(--font)',
                  }}
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
