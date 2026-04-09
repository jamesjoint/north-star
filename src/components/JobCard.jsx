import { useState } from 'react'

const STATUS_OPTIONS = ['none', 'Saved', 'Applied', 'Outreach Sent', 'Interviewing', 'Offer', 'Passed', 'Not Applying', 'Expired']

export const STATUS_COLORS = {
  Saved:           { bg: '#ddf4ff', color: '#0369a1' },
  Applied:         { bg: '#fef9c3', color: '#854d0e' },
  'Outreach Sent': { bg: '#f3e8ff', color: '#7e22ce' },
  Interviewing:    { bg: '#dcfce7', color: '#166534' },
  Offer:           { bg: '#fef08a', color: '#713f12' },
  Passed:          { bg: '#fee2e2', color: '#991b1b' },
  'Not Applying':  { bg: '#f3f4f6', color: '#9ca3af' },
  Expired:         { bg: '#f3f4f6', color: '#9ca3af' },
}

function scoreColor(s) {
  if (s == null) return '#c7c7cc'
  if (s >= 7) return '#A0CB3B'
  if (s >= 4) return '#FAB71F'
  return '#EC5298'
}

export default function JobCard({ job, onSelect, selected, onStatusChange, onDelete }) {
  const score = job.score_aggregate
  const [hovered, setHovered] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  const summary = (() => {
    if (!job.score_dimensions) return null
    try {
      const dims = typeof job.score_dimensions === 'string'
        ? JSON.parse(job.score_dimensions)
        : job.score_dimensions
      return dims.summary || null
    } catch { return null }
  })()

  const status = job.status || 'none'
  const statusStyle = STATUS_COLORS[status]
  const scoreCol = scoreColor(score)

  const REMOTE_BADGE = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }

  /* iOS selection: solid blue gradient, white text */
  const cellBg = selected
    ? 'linear-gradient(180deg, #1b5de8 0%, #0c45cc 100%)'
    : 'transparent'

  return (
    <div
      className="row-anim ios-cell"
      role="article"
      onClick={() => onSelect?.(job.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: 54,
        background: selected
          ? 'linear-gradient(180deg, #1b5de8 0%, #0c45cc 100%)'
          : hovered
          ? 'rgba(0,119,237,0.06)'
          : '#ffffff',
        cursor: 'pointer',
        transition: 'background 0.08s',
        position: 'relative',
      }}
    >
      {/* Score column — left accessory */}
      <div style={{
        width: 54,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 2,
        gap: 2,
      }}>
        {/* Colored score circle */}
        <div style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: selected ? 'rgba(255,255,255,0.15)' : `${scoreCol}18`,
          border: `1.5px solid ${selected ? 'rgba(255,255,255,0.35)' : scoreCol}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: selected ? '#fff' : scoreCol,
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}>
            {score != null ? score.toFixed(1) : '—'}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: '10px 8px 10px 0', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <span style={{
            fontSize: 16,
            fontWeight: 400,
            color: selected ? '#fff' : '#000',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {job.title}
          </span>
          {!job.seen && (
            <div style={{
              flexShrink: 0,
              width: 8, height: 8, borderRadius: '50%',
              background: selected ? '#fff' : 'var(--blue)',
            }} />
          )}
        </div>
        <div style={{
          fontSize: 13,
          color: selected ? 'rgba(255,255,255,0.65)' : '#8e8e93',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {job.company}
          {job.location ? ` · ${job.location}` : ''}
          {REMOTE_BADGE[job.remote] ? ` · ${REMOTE_BADGE[job.remote]}` : ''}
        </div>
      </div>

      {/* Right accessories */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        paddingRight: 10,
        flexShrink: 0,
      }}>

        {/* Status pill */}
        <div onClick={e => e.stopPropagation()}>
          <select
            value={status}
            onChange={e => onStatusChange?.(job.id, { status: e.target.value })}
            style={{
              fontSize: 11,
              padding: '2px 18px 2px 6px',
              borderRadius: 20,
              border: 'none',
              background: selected
                ? 'rgba(255,255,255,0.2)'
                : statusStyle
                ? statusStyle.bg
                : 'rgba(0,0,0,0.06)',
              color: selected
                ? '#fff'
                : statusStyle
                ? statusStyle.color
                : '#8e8e93',
              fontWeight: 600,
              cursor: 'pointer',
              appearance: 'none',
              fontFamily: 'var(--font)',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%238e8e93'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 5px center',
            }}
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s === 'none' ? 'Track…' : s}</option>
            ))}
          </select>
        </div>

        {/* Summary info button */}
        {summary && (
          <div style={{ position: 'relative' }}>
            <span
              onMouseEnter={e => { e.stopPropagation(); setShowTooltip(true) }}
              onMouseLeave={() => setShowTooltip(false)}
              style={{
                width: 16, height: 16, borderRadius: '50%',
                border: `1.5px solid ${selected ? 'rgba(255,255,255,0.5)' : '#c7c7cc'}`,
                color: selected ? 'rgba(255,255,255,0.6)' : '#c7c7cc',
                fontSize: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'default', fontWeight: 600,
              }}
            >
              i
            </span>
            {showTooltip && (
              <div style={{
                position: 'absolute', right: 0, top: 22, zIndex: 20,
                background: '#1c1c1e', color: '#f2f2f7',
                borderRadius: 10, padding: '10px 14px',
                fontSize: 12, lineHeight: 1.5,
                width: 260, boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
                pointerEvents: 'none', border: '1px solid #3a3a3c',
              }}>
                {summary}
              </div>
            )}
          </div>
        )}

        {/* Delete */}
        {onDelete && hovered && (
          <div onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onDelete(job.id)}
              title="Delete"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, lineHeight: 1, padding: '2px 3px',
                color: selected ? 'rgba(255,255,255,0.45)' : '#c7c7cc',
                transition: 'color 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = selected ? '#fff' : '#EC5298'}
              onMouseLeave={e => e.currentTarget.style.color = selected ? 'rgba(255,255,255,0.45)' : '#c7c7cc'}
            >
              ✕
            </button>
          </div>
        )}

        {/* Disclosure chevron — the classic gray > */}
        <span style={{
          fontSize: 18,
          lineHeight: 1,
          color: selected ? 'rgba(255,255,255,0.55)' : '#c7c7cc',
          fontWeight: 300,
          marginLeft: 2,
        }}>
          ›
        </span>
      </div>
    </div>
  )
}
