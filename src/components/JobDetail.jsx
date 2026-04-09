import { useState } from 'react'

const DIMENSION_LABELS = {
  core_mechanism:       'Connector Fit',
  product_depth:        'Daily Texture',
  regulated_complexity: 'Structural Integrity',
  bd_track_record:      'Visibility',
  mba_preference:       'Pioneering',
  domain_gap:           'Domain Fit',
  gap_bridgeability:    'Gap Bridgeability',
}
const DIMENSION_ORDER = Object.keys(DIMENSION_LABELS)

function scoreColor(s) {
  if (s >= 7) return 'var(--score-hi)'
  if (s >= 4) return 'var(--score-mid)'
  return 'var(--score-lo)'
}

/* Hash company name → a consistent saturated dark HSL color */
function companyHue(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h)
  }
  return Math.abs(h) % 360
}

function companyBg(name) {
  const hue = companyHue(name || 'Unknown')
  return `hsl(${hue}, 50%, 32%)`
}

/* Company initials — up to 2 chars */
function initials(name) {
  if (!name) return '?'
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/* Pipeline: map status → { pct, label, next } */
const PIPELINE = [
  { status: 'Saved',         pct: 0,   label: 'Saved',         next: 'Apply' },
  { status: 'Outreach Sent', pct: 20,  label: 'Outreach',      next: 'Follow Up' },
  { status: 'Applied',       pct: 40,  label: 'Applied',       next: 'Phone Screen' },
  { status: 'Interviewing',  pct: 65,  label: 'Interviewing',  next: 'Final Round' },
  { status: 'Offer',         pct: 88,  label: 'Offer',         next: 'Decision' },
  { status: 'Passed',        pct: 100, label: 'Closed',        next: '—' },
  { status: 'Not Applying',  pct: 0,   label: 'Not Applying',  next: '—' },
  { status: 'Expired',       pct: 100, label: 'Expired',       next: '—' },
]

function pipelineForStatus(status) {
  return PIPELINE.find(p => p.status === status) || { pct: 0, label: status || 'Saved', next: 'Apply' }
}

function daysAgo(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const diff = Math.round((Date.now() - d.getTime()) / 86_400_000)
  return diff === 0 ? 'today' : diff === 1 ? '1 day ago' : `${diff} days ago`
}

export default function JobDetail({ job, onClose, onStatusChange, onPrev, onNext }) {
  const [linkClicked, setLinkClicked] = useState(false)

  let dims = {}
  if (job.score_dimensions) {
    try {
      dims = typeof job.score_dimensions === 'string'
        ? JSON.parse(job.score_dimensions)
        : job.score_dimensions
    } catch { dims = {} }
  }

  const summary = dims.summary || null
  const score = job.score_aggregate
  const scorePct = score != null ? Math.round(score * 10) : null
  const col = score != null ? scoreColor(score) : '#8e8e93'

  const bgColor = job.brandColor || companyBg(job.company)
  const hue = companyHue(job.company || '')

  const pipe = pipelineForStatus(job.status)
  const appliedAgo = daysAgo(job.applied_date)

  /* Badge color */
  const badgeBg = scorePct == null ? '#8e8e93'
    : scorePct >= 90 ? '#30C5FF'
    : scorePct >= 70 ? '#FAB71F'
    : '#8e8e93'

  return (
    <div style={{
      height: '100%',
      background: 'var(--screen)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>

      {/* Nav bar */}
      <div style={{
        height: 44,
        position: 'relative',
        background: 'linear-gradient(180deg, #5a5e62 0%, #46494d 49%, #35383b 50%, #42464a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: '1px solid #111',
        flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.03) 100%)',
          pointerEvents: 'none',
        }} />
        <button onClick={onClose} style={{
          position: 'absolute', left: 8, zIndex: 1,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 400,
          fontFamily: 'var(--font)', padding: '6px 8px',
          display: 'flex', alignItems: 'center', gap: 2,
          textShadow: '0 -1px 0 rgba(0,0,0,0.4)',
        }}>
          ‹ Back
        </button>
        <span style={{
          fontSize: 17, fontWeight: 700, color: '#fff',
          letterSpacing: -0.4, textShadow: '0 -1px 0 rgba(0,0,0,0.55)', zIndex: 1,
        }}>
          Now Playing
        </span>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 36px' }}>

        {/* ── Company art tile ── */}
        <div style={{
          width: '100%', maxWidth: 140, aspectRatio: '1',
          margin: '0 auto 20px',
          background: bgColor,
          borderRadius: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
          boxShadow: `0 8px 28px ${bgColor}55, 0 2px 6px rgba(0,0,0,0.18)`,
          overflow: 'hidden',
        }}>
          {/* Subtle gradient sheen */}
          <div style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse at 35% 25%, rgba(255,255,255,0.18) 0%, transparent 60%)`,
            pointerEvents: 'none',
          }} />

          {/* Company initials */}
          <span style={{
            fontSize: 42, fontWeight: 700, color: 'rgba(255,255,255,0.92)',
            letterSpacing: -2, lineHeight: 1,
            textShadow: '0 2px 8px rgba(0,0,0,0.25)',
            zIndex: 1,
          }}>
            {initials(job.company)}
          </span>

          {/* Match score badge — top right */}
          {scorePct != null && (
            <div style={{
              position: 'absolute', top: 10, right: 10,
              background: badgeBg,
              color: '#fff', fontSize: 13, fontWeight: 700,
              borderRadius: 20, padding: '4px 10px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              letterSpacing: '0.02em',
              zIndex: 2,
            }}>
              {scorePct}%
            </div>
          )}
        </div>

        {/* ── Metadata ── */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h2 style={{
            margin: '0 0 4px', fontSize: 20, fontWeight: 600,
            color: '#000', lineHeight: 1.2, letterSpacing: '-0.01em',
          }}>
            {job.title}
          </h2>
          <p style={{ margin: '0 0 2px', fontSize: 15, color: 'var(--blue)', fontWeight: 500 }}>
            {job.company}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#8e8e93' }}>
            {[job.location, job.source].filter(Boolean).join(' · ')}
          </p>
        </div>

        {/* ── Pipeline scrubber ── */}
        <div style={{ marginBottom: 6 }}>
          {/* Labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#3c3c43' }}>{pipe.label}</span>
            <span style={{ fontSize: 11, color: '#8e8e93' }}>{pipe.next}</span>
          </div>
          {/* Track */}
          <div style={{
            width: '100%', height: 4, background: 'rgba(0,0,0,0.1)',
            borderRadius: 2, overflow: 'hidden', position: 'relative',
          }}>
            <div style={{
              height: '100%', width: `${pipe.pct}%`,
              background: `hsl(${hue}, 50%, 40%)`,
              borderRadius: 2, transition: 'width 0.4s ease',
            }} />
            {/* Knob */}
            <div style={{
              position: 'absolute', top: '50%', left: `${pipe.pct}%`,
              transform: 'translate(-50%, -50%)',
              width: 12, height: 12, borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }} />
          </div>
          {/* Sub-label */}
          {appliedAgo && (
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#8e8e93', textAlign: 'center' }}>
              Applied {appliedAgo}
            </p>
          )}
        </div>

        {/* ── Transport controls ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 28, padding: '16px 0',
          borderTop: '0.5px solid rgba(0,0,0,0.1)',
          borderBottom: '0.5px solid rgba(0,0,0,0.1)',
          marginBottom: 20,
        }}>
          {/* ⏮ Previous job */}
          <button
            onClick={onPrev || undefined}
            disabled={!onPrev}
            title="Previous job"
            style={{
              background: 'none', border: 'none',
              cursor: onPrev ? 'pointer' : 'default',
              color: onPrev ? '#3c3c43' : '#c7c7cc',
              fontSize: 22, padding: '4px 8px',
              transition: 'color 0.15s', fontFamily: 'var(--font)',
            }}
            onMouseEnter={e => { if (onPrev) e.currentTarget.style.color = 'var(--blue)' }}
            onMouseLeave={e => { e.currentTarget.style.color = onPrev ? '#3c3c43' : '#c7c7cc' }}
          >
            ⏮
          </button>

          {/* ▶ View listing */}
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setLinkClicked(true)}
            style={{
              width: 54, height: 54, borderRadius: '50%',
              background: 'linear-gradient(180deg, #6dd4ff 0%, #30C5FF 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 20, textDecoration: 'none',
              boxShadow: '0 1px 0 rgba(255,255,255,0.3) inset, 0 3px 10px rgba(0,119,237,0.4)',
              transition: 'transform 0.1s',
              flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.06)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            title="View listing"
          >
            ▶
          </a>

          {/* ⏭ Gone? / next */}
          {/* ⏭ Next job */}
          <button
            onClick={onNext || undefined}
            disabled={!onNext}
            title="Next job"
            style={{
              background: 'none', border: 'none',
              cursor: onNext ? 'pointer' : 'default',
              color: onNext ? '#3c3c43' : '#c7c7cc',
              fontSize: 22, padding: '4px 8px',
              transition: 'color 0.15s', fontFamily: 'var(--font)',
            }}
            onMouseEnter={e => { if (onNext) e.currentTarget.style.color = 'var(--blue)' }}
            onMouseLeave={e => { e.currentTarget.style.color = onNext ? '#3c3c43' : '#c7c7cc' }}
          >
            ⏭
          </button>
        </div>

        {/* ── Info pills ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          marginBottom: 20, padding: '0 4px',
        }}>
          {job.source && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>📋</span>
              <span style={{ fontSize: 12, color: '#8e8e93' }}>via {job.source}</span>
            </div>
          )}
          {job.remote && job.remote !== 'unknown' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>🏢</span>
              <span style={{ fontSize: 12, color: '#8e8e93' }}>
                {job.remote === 'remote' ? 'Remote' : job.remote === 'hybrid' ? 'Hybrid' : 'On-site'}
                {job.location ? ` · ${job.location}` : ''}
              </span>
            </div>
          )}
          {job.posted_at && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>📅</span>
              <span style={{ fontSize: 12, color: '#8e8e93' }}>Posted {job.posted_at}</span>
            </div>
          )}
        </div>

        {/* ── Summary ── */}
        {summary && (
          <p style={{
            margin: '0 0 20px', fontSize: 13, lineHeight: 1.65,
            color: '#3c3c43', textAlign: 'center', fontStyle: 'italic',
          }}>
            "{summary}"
          </p>
        )}

        {/* ── Score breakdown ── */}
        <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.1)', paddingTop: 18 }}>
          <p style={{
            margin: '0 0 10px', fontSize: 11, fontWeight: 400,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: '#8e8e93', textAlign: 'center',
          }}>
            Score Breakdown
          </p>

          {/* iOS grouped cells */}
          <div style={{
            background: '#fff',
            borderRadius: 12,
            overflow: 'hidden',
            border: '0.5px solid rgba(0,0,0,0.12)',
          }}>
            {DIMENSION_ORDER.map((key, i) => {
              const d = dims[key]
              if (!d) return null
              const c = scoreColor(d.score)
              const isLast = i === DIMENSION_ORDER.filter(k => dims[k]).length - 1
              return (
                <div key={key} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '11px 14px',
                  borderBottom: isLast ? 'none' : '0.5px solid rgba(0,0,0,0.08)',
                  position: 'relative',
                }}>
                  {/* Colored left accent */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: 4, background: c, borderRadius: '12px 0 0 0',
                    ...(isLast && { borderRadius: '0 0 0 12px' }),
                    ...(i === 0 && { borderRadius: '12px 0 0 0' }),
                  }} />

                  {/* Content */}
                  <div style={{ flex: 1, paddingLeft: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#000' }}>
                        {DIMENSION_LABELS[key]}
                      </span>
                      {/* Score badge */}
                      <span style={{
                        fontSize: 12, fontWeight: 700,
                        color: '#fff',
                        background: c,
                        borderRadius: 20,
                        padding: '1px 8px',
                        lineHeight: 1.6,
                        flexShrink: 0,
                      }}>
                        {d.score}
                      </span>
                    </div>
                    {d.reasoning && (
                      <p style={{
                        margin: 0, fontSize: 11, lineHeight: 1.55,
                        color: '#8e8e93',
                      }}>
                        {d.reasoning}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
