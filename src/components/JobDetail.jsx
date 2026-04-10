import { useState, useEffect } from 'react'
import { formatRelativeDate, localDateStr } from '../utils/date.js'
import { dimLabel, pipelineForStatus } from '../utils/jobDetail.js'
import { parseDimensions } from '../utils/scoring.js'
import { companyInitials, companyHue, companyBg } from '../utils/avatar.js'

function scoreColor(s) {
  if (s == null) return '#c7c7cc'
  if (s >= 7) return 'var(--score-hi)'
  if (s >= 4) return 'var(--score-mid)'
  return 'var(--score-lo)'
}


const STATUSES = ['Saved', 'Outreach Sent', 'Applied', 'Interviewing', 'Offer', 'Passed', 'Not Applying']

export default function JobDetail({ job, onClose, onStatusChange, onPrev, onNext }) {
  const [linkClicked, setLinkClicked] = useState(false)
  const [localNotes, setLocalNotes] = useState(null)
  const [localSalary, setLocalSalary] = useState(null)
  const [localFollowUp, setLocalFollowUp] = useState(null)
  const [showDesc, setShowDesc] = useState(false)

  // Reset local draft state when navigating to a different job
  useEffect(() => {
    setLocalNotes(null)
    setLocalSalary(null)
    setLocalFollowUp(null)
    setShowDesc(false)
  }, [job.id])

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      if (e.key === 'ArrowLeft'  && onPrev) { e.preventDefault(); onPrev() }
      if (e.key === 'ArrowRight' && onNext) { e.preventDefault(); onNext() }
      if (e.key === 'Escape') { e.preventDefault(); onClose?.() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPrev, onNext, onClose])

  const dims = parseDimensions(job.score_dimensions)

  const summary = dims.summary || null
  const score = job.score_aggregate
  const scorePct = score != null ? Math.round(score * 10) : null
  const col = score != null ? scoreColor(score) : '#8e8e93'

  const bgColor = job.brandColor || companyBg(job.company)
  const hue = companyHue(job.company || '')

  const pipe = pipelineForStatus(job.status)
  const appliedAgo = formatRelativeDate(job.applied_date) || null
  const followUpOverdue = job.follow_up_date && job.follow_up_date < localDateStr(new Date())

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
            {companyInitials(job.company) || '?'}
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

        {/* ── Quick track ── */}
        {onStatusChange && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
              {STATUSES.map(s => {
                const active = job.status === s
                return (
                  <button
                    key={s}
                    onClick={() => onStatusChange(job.id, { status: active ? 'none' : s })}
                    style={{
                      padding: '4px 10px', borderRadius: 20, border: 'none',
                      cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font)',
                      fontWeight: active ? 600 : 400,
                      background: active ? 'var(--blue)' : 'rgba(0,0,0,0.07)',
                      color: active ? '#fff' : '#8e8e93',
                      transition: 'all 0.12s',
                    }}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>
        )}

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
              <span style={{ fontSize: 12, color: '#8e8e93' }}>Posted {formatRelativeDate(job.posted_at)}</span>
            </div>
          )}
          {job.salary_range && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>💰</span>
              <span style={{ fontSize: 12, color: '#8e8e93' }}>{job.salary_range}</span>
            </div>
          )}
          {job.follow_up_date && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>{followUpOverdue ? '⚠️' : '🔔'}</span>
              <span style={{ fontSize: 12, color: followUpOverdue ? '#EC5298' : '#8e8e93', fontWeight: followUpOverdue ? 600 : 400 }}>
                Follow up {followUpOverdue ? 'overdue: ' : ''}{formatRelativeDate(job.follow_up_date)}
              </span>
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

        {/* ── Notes ── */}
        {onStatusChange && (
          <div style={{ marginBottom: 20 }}>
            <p style={{
              margin: '0 0 6px', fontSize: 11, fontWeight: 400,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: '#8e8e93', textAlign: 'center',
            }}>
              Notes
            </p>
            <textarea
              value={localNotes !== null ? localNotes : (job.notes || '')}
              placeholder="Add notes…"
              rows={3}
              onChange={e => setLocalNotes(e.target.value)}
              onBlur={e => {
                onStatusChange(job.id, { notes: e.target.value })
                setLocalNotes(null)
              }}
              style={{
                width: '100%', boxSizing: 'border-box',
                fontSize: 12, lineHeight: 1.6,
                padding: '8px 10px', borderRadius: 9,
                border: '0.5px solid rgba(0,0,0,0.15)',
                background: '#fff', color: '#000',
                fontFamily: 'var(--font)', resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>
        )}

        {/* ── Salary + Follow-up ── */}
        {onStatusChange && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <p style={{
                margin: '0 0 5px', fontSize: 11, fontWeight: 400,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: '#8e8e93',
              }}>
                Salary Range
              </p>
              <input
                type="text"
                value={localSalary !== null ? localSalary : (job.salary_range || '')}
                placeholder="e.g. $120k–$150k"
                onChange={e => setLocalSalary(e.target.value)}
                onBlur={e => {
                  onStatusChange(job.id, { salary_range: e.target.value || null })
                  setLocalSalary(null)
                }}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  fontSize: 12, padding: '7px 10px', borderRadius: 9,
                  border: '0.5px solid rgba(0,0,0,0.15)',
                  background: '#fff', color: '#000',
                  fontFamily: 'var(--font)', outline: 'none',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{
                margin: '0 0 5px', fontSize: 11, fontWeight: 400,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: '#8e8e93',
              }}>
                Follow-up
              </p>
              <input
                type="date"
                value={localFollowUp !== null ? localFollowUp : (job.follow_up_date || '')}
                onChange={e => setLocalFollowUp(e.target.value)}
                onBlur={e => {
                  onStatusChange(job.id, { follow_up_date: e.target.value || null })
                  setLocalFollowUp(null)
                }}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  fontSize: 12, padding: '7px 10px', borderRadius: 9,
                  border: '0.5px solid rgba(0,0,0,0.15)',
                  background: '#fff', color: '#000',
                  fontFamily: 'var(--font)', outline: 'none',
                }}
              />
            </div>
          </div>
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
          {(() => {
            const entries = Object.entries(dims).filter(([k]) => k !== 'summary')
            return (
              <div style={{
                background: '#fff',
                borderRadius: 12,
                overflow: 'hidden',
                border: '0.5px solid rgba(0,0,0,0.12)',
              }}>
                {entries.map(([key, d], i) => {
                  const c = scoreColor(d.score)
                  const isLast = i === entries.length - 1
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
                        width: 4, background: c,
                        borderRadius: i === 0 ? '12px 0 0 0' : isLast ? '0 0 0 12px' : 0,
                      }} />

                      {/* Content */}
                      <div style={{ flex: 1, paddingLeft: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#000' }}>
                            {d.label || dimLabel(key)}
                          </span>
                          <span style={{
                            fontSize: 12, fontWeight: 700,
                            color: '#fff', background: c,
                            borderRadius: 20, padding: '1px 8px',
                            lineHeight: 1.6, flexShrink: 0,
                          }}>
                            {d.score}
                          </span>
                        </div>
                        {d.reasoning && (
                          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.55, color: '#8e8e93' }}>
                            {d.reasoning}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>

        {/* ── Job Description ── */}
        {job.description && (
          <div style={{ marginTop: 20, borderTop: '0.5px solid rgba(0,0,0,0.1)', paddingTop: 16 }}>
            <button
              onClick={() => setShowDesc(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                padding: 0, marginBottom: showDesc ? 10 : 0,
              }}
            >
              <span style={{
                fontSize: 11, fontWeight: 400, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: '#8e8e93',
              }}>
                Job Description
              </span>
              <span style={{ fontSize: 12, color: '#8e8e93' }}>{showDesc ? '▲' : '▼'}</span>
            </button>
            {showDesc && (
              <div style={{
                fontSize: 12, lineHeight: 1.7, color: '#3c3c43',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: 'rgba(0,0,0,0.03)', borderRadius: 9,
                padding: '12px 14px',
              }}>
                {job.description}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
