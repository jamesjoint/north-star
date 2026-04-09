import { useState, useEffect } from 'react'

export default function Header({ lastRefreshed, refreshing, onRefresh }) {
  const [time, setTime] = useState(getTime())

  useEffect(() => {
    const t = setInterval(() => setTime(getTime()), 10000)
    return () => clearInterval(t)
  }, [])

  function getTime() {
    return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div style={{ flexShrink: 0, userSelect: 'none' }}>

      {/* ── Status bar ── black, 20px, real iOS feel */}
      <div style={{
        height: 20,
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px 0 10px',
      }}>
        {/* Signal bars */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
          {[4, 6, 8, 10, 12].map((h, i) => (
            <div key={i} style={{
              width: 3,
              height: h,
              borderRadius: 1,
              background: i < 4 ? '#fff' : 'rgba(255,255,255,0.25)',
            }} />
          ))}
          <span style={{ fontSize: 10, color: '#fff', marginLeft: 4, fontWeight: 400, letterSpacing: 0 }}>
            Job Search
          </span>
        </div>

        {/* Time */}
        <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', letterSpacing: 0, lineHeight: 1 }}>
          {time}
        </span>

        {/* Battery */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.02em' }}>
            {refreshing ? '' : ''}
          </span>
          <div style={{ position: 'relative', width: 22, height: 11, border: '1.5px solid rgba(255,255,255,0.65)', borderRadius: 2.5 }}>
            <div style={{
              position: 'absolute', right: -3.5, top: '50%', transform: 'translateY(-50%)',
              width: 2.5, height: 5, background: 'rgba(255,255,255,0.65)', borderRadius: '0 1.5px 1.5px 0',
            }} />
            <div style={{
              position: 'absolute', left: 1.5, top: 1.5, bottom: 1.5,
              width: refreshing ? '45%' : '82%',
              background: refreshing ? '#FAB71F' : '#A0CB3B',
              borderRadius: 1,
              transition: 'width 0.4s, background 0.4s',
            }} />
          </div>
        </div>
      </div>

      {/* ── Navigation bar ── the iconic dark steel gradient */}
      <div style={{
        height: 44,
        position: 'relative',
        /* Top half lighter, bottom half darker — the classic iOS sheen split */
        background: 'linear-gradient(180deg, #5a5e62 0%, #46494d 49%, #35383b 50%, #42464a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: '1px solid #111',
      }}>
        {/* Glass sheen overlay */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '50%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.03) 100%)',
          borderRadius: '0 0 0 0',
          pointerEvents: 'none',
        }} />

        {/* Title */}
        <span style={{
          fontSize: 17,
          fontWeight: 700,
          color: '#ffffff',
          letterSpacing: -0.4,
          textShadow: '0 -1px 0 rgba(0,0,0,0.55)',
          zIndex: 1,
        }}>
          Job Search
        </span>

        {/* Refresh / battery — right side */}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          title={refreshing ? 'Scanning…' : 'Refresh jobs'}
          style={{
            position: 'absolute',
            right: 10,
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'none',
            border: 'none',
            cursor: refreshing ? 'default' : 'pointer',
            opacity: refreshing ? 0.6 : 1,
            padding: '6px 4px',
            transition: 'opacity 0.2s',
          }}
        >
          {/* Reload icon — classic iOS rounded arrow */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M13.5 8A5.5 5.5 0 1 1 8 2.5a5.47 5.47 0 0 1 3.536 1.29"
              stroke={refreshing ? '#FAB71F' : 'rgba(255,255,255,0.75)'}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M11 1.5l1.5 2.5-2.5.5"
              stroke={refreshing ? '#FAB71F' : 'rgba(255,255,255,0.75)'}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {refreshing && (
            <span style={{ fontSize: 11, color: '#FAB71F', fontWeight: 500 }}>…</span>
          )}
        </button>

        {/* Last refreshed — left side, subtle */}
        {lastRefreshed && !refreshing && (
          <span style={{
            position: 'absolute', left: 10, zIndex: 1,
            fontSize: 10, color: 'rgba(255,255,255,0.4)',
          }}>
            {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  )
}
