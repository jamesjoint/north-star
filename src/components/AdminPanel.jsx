import { useState, useEffect, useCallback } from 'react'
import { fetchWaitlist, approveUser, rejectUser, fetchAdminUsers, deactivateUser, reactivateUser,
         fetchInvites, createInvite, revokeInvite, fetchScoringQueue } from '../api.js'

const ROW = {
  display: 'flex',
  alignItems: 'center',
  padding: '11px 16px',
  borderBottom: '0.5px solid rgba(0,0,0,0.08)',
  background: '#fff',
  gap: 12,
}

const PILL = (color, bg) => ({
  display: 'inline-block',
  fontSize: 10, fontWeight: 700,
  color, background: bg,
  borderRadius: 10, padding: '2px 8px',
  letterSpacing: 0.3, textTransform: 'uppercase',
})

function ActionButton({ onClick, label, variant = 'default', disabled }) {
  const colors = {
    green:  { bg: '#dcfce7', color: '#166534' },
    red:    { bg: '#fee2e2', color: '#991b1b' },
    default:{ bg: 'rgba(0,0,0,0.07)', color: '#000' },
  }
  const c = colors[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 12, fontWeight: 500, padding: '4px 12px',
        borderRadius: 20, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: c.bg, color: c.color,
        fontFamily: 'var(--font)', opacity: disabled ? 0.5 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {label}
    </button>
  )
}

function SectionHeader({ title }) {
  return (
    <div style={{
      padding: '16px 16px 6px',
      fontSize: 13, fontWeight: 400, color: '#8e8e93',
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      {title}
    </div>
  )
}

function EmptyRow({ text }) {
  return (
    <div style={{ ...ROW, justifyContent: 'center', color: '#8e8e93', fontSize: 13 }}>
      {text}
    </div>
  )
}

export default function AdminPanel({ onBack }) {
  const [waitlist, setWaitlist] = useState([])
  const [users, setUsers] = useState([])
  const [invites, setInvites] = useState([])
  const [scoringQueue, setScoringQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState({})
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [newInviteUrl, setNewInviteUrl] = useState(null)
  const [copied, setCopied] = useState(null)

  const reload = useCallback(async () => {
    try {
      const [w, u, inv, sq] = await Promise.all([
        fetchWaitlist(), fetchAdminUsers(), fetchInvites(), fetchScoringQueue(),
      ])
      setWaitlist(w)
      setUsers(u)
      setInvites(inv)
      setScoringQueue(sq)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  async function withBusy(userId, fn) {
    setBusy(prev => ({ ...prev, [userId]: true }))
    try { await fn() } catch (err) { setError(err.message) }
    finally { setBusy(prev => ({ ...prev, [userId]: false })) }
  }

  async function handleApprove(userId) {
    await withBusy(userId, async () => {
      await approveUser(userId)
      setWaitlist(prev => prev.filter(u => u.id !== userId))
      const approved = waitlist.find(u => u.id === userId)
      if (approved) setUsers(prev => [{ ...approved, status: 'active', role: 'user' }, ...prev])
    })
  }

  async function handleReject(userId) {
    await withBusy(userId, async () => {
      await rejectUser(userId)
      setWaitlist(prev => prev.filter(u => u.id !== userId))
    })
  }

  async function handleDeactivate(userId) {
    await withBusy(userId, async () => {
      await deactivateUser(userId)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'deactivated' } : u))
    })
  }

  async function handleReactivate(userId) {
    await withBusy(userId, async () => {
      await reactivateUser(userId)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'active' } : u))
    })
  }

  async function handleCreateInvite() {
    setCreatingInvite(true)
    setNewInviteUrl(null)
    try {
      const inv = await createInvite(7)
      // Build URL from current origin in case server URL differs
      const url = `${window.location.origin}/?invite=${inv.code}`
      setNewInviteUrl(url)
      setInvites(prev => [{ ...inv, url }, ...prev])
    } catch (err) {
      setError(err.message)
    } finally {
      setCreatingInvite(false)
    }
  }

  async function handleRevoke(code) {
    await withBusy(code, async () => {
      await revokeInvite(code)
      setInvites(prev => prev.filter(i => i.code !== code))
    })
  }

  function copyToClipboard(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  function fmt(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div style={{ background: 'var(--screen)', minHeight: '100%' }}>

      {/* Back nav */}
      <div style={{ padding: '14px 16px 0' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, color: 'var(--blue)', fontFamily: 'var(--font)',
            padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          ← Back
        </button>
      </div>

      {loading && (
        <p style={{ padding: '24px 16px', fontSize: 14, color: '#8e8e93' }}>Loading…</p>
      )}
      {error && (
        <p style={{ padding: '12px 16px', fontSize: 13, color: '#EC5298' }}>{error}</p>
      )}

      {!loading && (
        <>
          {/* Invites section */}
          <div style={{ padding: '16px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 400, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Invite Links
            </span>
            <button
              onClick={handleCreateInvite}
              disabled={creatingInvite}
              style={{
                fontSize: 12, fontWeight: 600, padding: '4px 14px',
                borderRadius: 20, border: 'none',
                background: 'linear-gradient(180deg, #6dd4ff 0%, #30C5FF 100%)',
                color: '#fff', cursor: creatingInvite ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font)', opacity: creatingInvite ? 0.6 : 1,
                boxShadow: '0 1px 0 rgba(255,255,255,0.25) inset, 0 1px 3px rgba(0,0,0,0.15)',
              }}
            >
              {creatingInvite ? 'Creating…' : '+ New invite'}
            </button>
          </div>

          {/* Newly created invite URL highlight */}
          {newInviteUrl && (
            <div style={{
              margin: '0 16px 8px',
              padding: '10px 12px',
              background: '#dcfce7',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ flex: 1, fontSize: 11, color: '#166534', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {newInviteUrl}
              </span>
              <button
                onClick={() => copyToClipboard(newInviteUrl, 'new')}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px',
                  borderRadius: 20, border: 'none',
                  background: '#166534', color: '#fff',
                  cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0,
                }}
              >
                {copied === 'new' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}

          <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.15)', borderBottom: '0.5px solid rgba(0,0,0,0.15)' }}>
            {invites.length === 0 ? (
              <EmptyRow text="No invite links yet" />
            ) : invites.map(inv => {
              const isUsed    = !!inv.used_by
              const isExpired = new Date(inv.expires_at) < new Date()
              const isActive  = !isUsed && !isExpired
              const invUrl    = `${window.location.origin}/?invite=${inv.code}`
              return (
                <div key={inv.code} style={{ ...ROW, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-2)' }}>
                        {inv.code.slice(0, 8)}…
                      </span>
                      {isUsed    && <span style={PILL('#9ca3af', 'rgba(0,0,0,0.06)')}>used</span>}
                      {isExpired && !isUsed && <span style={PILL('#9ca3af', 'rgba(0,0,0,0.06)')}>expired</span>}
                      {isActive  && <span style={PILL('#166534', '#dcfce7')}>active</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#8e8e93', marginTop: 2 }}>
                      Created {fmt(inv.created_at)} · Expires {fmt(inv.expires_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {isActive && (
                      <ActionButton
                        label={copied === inv.code ? 'Copied!' : 'Copy link'}
                        variant="default"
                        onClick={() => copyToClipboard(invUrl, inv.code)}
                      />
                    )}
                    {isActive && (
                      <ActionButton
                        label="Revoke"
                        variant="red"
                        disabled={busy[inv.code]}
                        onClick={() => handleRevoke(inv.code)}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ height: 24 }} />

          {/* Waitlist section */}
          <SectionHeader title={`Waitlist (${waitlist.length})`} />
          <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.15)', borderBottom: '0.5px solid rgba(0,0,0,0.15)' }}>
            {waitlist.length === 0 ? (
              <EmptyRow text="No pending users" />
            ) : waitlist.map(u => (
              <div key={u.id} style={ROW}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.email}
                  </div>
                  <div style={{ fontSize: 11, color: '#8e8e93', marginTop: 2 }}>
                    Joined {fmt(u.createdAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <ActionButton label="Approve" variant="green" disabled={busy[u.id]} onClick={() => handleApprove(u.id)} />
                  <ActionButton label="Reject" variant="red" disabled={busy[u.id]} onClick={() => handleReject(u.id)} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: 24 }} />

          {/* Scoring queue section */}
          <SectionHeader title="Scoring Queue" />
          <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.15)', borderBottom: '0.5px solid rgba(0,0,0,0.15)' }}>
            {scoringQueue.length === 0 ? (
              <EmptyRow text="No active users" />
            ) : scoringQueue.map(u => {
              const hasProfile = u.onboarding_done
              return (
                <div key={u.id} style={ROW}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', wordBreak: 'break-all' }}>
                      {u.email}
                    </div>
                    <div style={{ fontSize: 11, color: '#8e8e93', marginTop: 2 }}>
                      {!hasProfile
                        ? 'No profile yet'
                        : `${u.scored} scored · ${u.unscored} pending`}
                      {u.last_scored_at && ` · last ${fmt(u.last_scored_at)}`}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {u.unscored > 0 && (
                      <span style={PILL('#92400e', '#fef3c7')}>{u.unscored} pending</span>
                    )}
                    {u.unscored === 0 && hasProfile && (
                      <span style={PILL('#166534', '#dcfce7')}>up to date</span>
                    )}
                    {!hasProfile && (
                      <span style={PILL('#9ca3af', 'rgba(0,0,0,0.06)')}>no profile</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ height: 24 }} />

          {/* Users section */}
          <SectionHeader title={`Users (${users.length})`} />
          <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.15)', borderBottom: '0.5px solid rgba(0,0,0,0.15)' }}>
            {users.length === 0 ? (
              <EmptyRow text="No users yet" />
            ) : users.map(u => (
              <div key={u.id} style={ROW}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', wordBreak: 'break-all' }}>
                      {u.email}
                    </span>
                    {u.role === 'admin' && (
                      <span style={PILL('var(--blue)', 'rgba(48,197,255,0.12)')}>admin</span>
                    )}
                    {u.status === 'deactivated' && (
                      <span style={PILL('#9ca3af', 'rgba(0,0,0,0.06)')}>deactivated</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#8e8e93', marginTop: 2 }}>
                    Joined {fmt(u.createdAt)}
                    {u.last_login_at && ` · last login ${fmt(u.last_login_at)}`}
                  </div>
                </div>
                {u.role !== 'admin' && u.status !== 'deactivated' && (
                  <ActionButton
                    label="Deactivate"
                    variant="default"
                    disabled={busy[u.id]}
                    onClick={() => handleDeactivate(u.id)}
                  />
                )}
                {u.role !== 'admin' && u.status === 'deactivated' && (
                  <ActionButton
                    label="Reactivate"
                    variant="green"
                    disabled={busy[u.id]}
                    onClick={() => handleReactivate(u.id)}
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
