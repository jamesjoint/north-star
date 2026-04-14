import { useEffect, useRef } from 'react'
import { formatRelativeDate } from '../utils/date.js'
import { parseDimensions } from '../utils/scoring.js'

function scoreColor(s) {
  if (s == null) return '#999'
  if (s >= 7) return '#1D6F42'
  if (s >= 4) return '#B07D00'
  return '#999'
}

const REMOTE_LABELS = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }

export default function JobDetail({ job, onAddToConstellation, onNotApplying }) {
  const scoreRef = useRef(null)
  const animRef = useRef(null)
  const barRefs = useRef([])

  const dims = parseDimensions(job.score_dimensions)
  const dimEntries = Object.entries(dims).filter(([k]) => k !== 'summary')
  const score = job.score_aggregate
  const verdict = dims.summary || null

  useEffect(() => {
    // Cancel any running animation
    if (animRef.current) cancelAnimationFrame(animRef.current)

    // Score count-up
    if (scoreRef.current) {
      const el = scoreRef.current
      if (score != null) {
        const target = score
        const duration = 700
        const start = performance.now()
        el.style.color = scoreColor(score)
        function step(now) {
          const p = Math.min((now - start) / duration, 1)
          const e = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p
          el.textContent = (target * e).toFixed(1)
          if (p < 1) animRef.current = requestAnimationFrame(step)
          else { el.textContent = target.toFixed(1); animRef.current = null }
        }
        animRef.current = requestAnimationFrame(step)
      } else {
        el.textContent = '—'
        el.style.color = '#999'
      }
    }

    // Staggered bar fills
    const timers = dimEntries.map((_, i) =>
      setTimeout(() => {
        const bar = barRefs.current[i]
        if (bar) bar.style.width = (dimEntries[i][1].score / 10 * 100) + '%'
      }, 50 + i * 80)
    )

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      timers.forEach(clearTimeout)
    }
  }, [job.id]) // eslint-disable-line

  const metaParts = [
    job.company,
    job.location,
    REMOTE_LABELS[job.remote],
    job.posted_at ? formatRelativeDate(job.posted_at) : null,
  ].filter(Boolean)

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      padding: '28px 36px',
      background: '#fff',
      animation: 'fadeIn 0.2s ease',
      fontFamily: 'var(--font)',
    }}>

      {/* Role detail label */}
      <div style={{
        fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: '#999', marginBottom: 10,
      }}>
        Role detail
      </div>

      {/* Title */}
      <div style={{
        fontSize: 24, fontWeight: 500, color: '#1a1a1a',
        lineHeight: 1.2, marginBottom: 6,
      }}>
        {job.title}
      </div>

      {/* Company · meta */}
      <div style={{ fontSize: 13, color: '#999', marginBottom: 14 }}>
        {metaParts.join(' · ')}
      </div>

      {/* Source badge */}
      {job.source && (
        <span style={{
          display: 'inline-block',
          fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: '#999', border: '0.5px solid rgba(0,0,0,0.12)',
          padding: '3px 8px', borderRadius: 2, marginBottom: 16,
        }}>
          via {job.source}
        </span>
      )}

      {/* Big score + count-up */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div
          ref={scoreRef}
          style={{
            fontSize: 44, fontWeight: 500, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums', color: '#999',
            transition: 'color 0.6s ease',
          }}
        >
          0.0
        </div>
        <div style={{ fontSize: 11, color: '#999', paddingBottom: 6 }}>out of 10</div>
      </div>
      <div style={{
        fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: '#999', marginBottom: 14,
      }}>
        Fit score
      </div>

      {/* Verdict */}
      {verdict && (
        <div style={{
          fontSize: 15, color: '#666', lineHeight: 1.8,
          marginBottom: 20, fontWeight: 400,
        }}>
          {verdict}
        </div>
      )}

      {/* Score breakdown */}
      {dimEntries.length > 0 && (
        <>
          <div style={{ height: '0.5px', background: 'rgba(0,0,0,0.08)', margin: '18px 0' }} />
          <div style={{
            fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#999', marginBottom: 14,
          }}>
            Score breakdown
          </div>
          {dimEntries.map(([key, d], i) => {
            const col = scoreColor(d.score)
            const isLast = i === dimEntries.length - 1
            return (
              <div key={key} style={{
                padding: '10px 0',
                borderBottom: isLast ? 'none' : '0.5px solid rgba(0,0,0,0.06)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#1a1a1a', flex: 1 }}>
                    {d.label || key}
                  </span>
                  <div style={{
                    flex: 1, height: 3, background: 'rgba(0,0,0,0.08)',
                    borderRadius: 2, overflow: 'hidden', maxWidth: 80,
                  }}>
                    <div
                      ref={el => { barRefs.current[i] = el }}
                      style={{
                        height: '100%', width: 0, borderRadius: 2,
                        background: col,
                        transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                      }}
                    />
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 16, textAlign: 'right', color: col,
                  }}>
                    {d.score}
                  </span>
                </div>
                {d.reasoning && (
                  <div style={{ fontSize: 11, color: '#999', lineHeight: 1.5 }}>
                    {d.reasoning}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* Action buttons */}
      <div style={{ height: '0.5px', background: 'rgba(0,0,0,0.08)', margin: '18px 0' }} />
      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {onAddToConstellation && (
          <button
            onClick={() => onAddToConstellation(job.id)}
            style={{
              fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '8px 16px', border: 'none',
              background: '#1a1a1a', color: '#fff',
              cursor: 'pointer', borderRadius: 8, fontFamily: 'var(--font)',
            }}
          >
            Add to Constellation
          </button>
        )}
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '8px 16px', border: '0.5px solid rgba(0,0,0,0.2)',
              background: 'transparent', color: '#1a1a1a',
              cursor: 'pointer', borderRadius: 8, fontFamily: 'var(--font)',
              textDecoration: 'none', display: 'inline-block',
            }}
          >
            View posting
          </a>
        )}
        {onNotApplying && (
          <button
            onClick={() => onNotApplying(job.id)}
            style={{
              fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '8px 16px', border: '0.5px solid rgba(0,0,0,0.2)',
              background: 'transparent', color: '#1a1a1a',
              cursor: 'pointer', borderRadius: 8, fontFamily: 'var(--font)',
            }}
          >
            Not Applying
          </button>
        )}
      </div>
    </div>
  )
}
