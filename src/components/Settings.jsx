import { useState, useEffect, useRef } from 'react'
import { fetchRescoreStatus } from '../api.js'
import { buildDimList } from '../utils/jobDetail.js'

function RadarChart({ dimensions, weights }) {
  const entries = Object.entries(dimensions)
  const N = entries.length
  if (N < 3) return null

  const SIZE = 200
  const CX = SIZE / 2
  const CY = SIZE / 2
  const R = 72
  const LABEL_R = R + 20

  function polar(angle, r) {
    return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)]
  }

  const angles = entries.map((_, i) => (i / N) * 2 * Math.PI - Math.PI / 2)
  const rings = [0.25, 0.5, 0.75, 1].map(frac => {
    const pts = angles.map(a => polar(a, R * frac))
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z'
  })

  const dataPts = entries.map(([key], i) => {
    const w = weights?.[key] ?? 1
    return polar(angles[i], R * Math.min(w / 5, 1))
  })
  const dataPath = dataPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z'
  const axes = angles.map(a => { const [x2, y2] = polar(a, R); return `M${CX},${CY} L${x2.toFixed(1)},${y2.toFixed(1)}` })

  return (
    <svg width={SIZE} height={SIZE} style={{ display: 'block', margin: '0 auto' }}>
      {rings.map((d, i) => <path key={i} d={d} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={1} />)}
      {axes.map((d, i) => <path key={i} d={d} stroke="rgba(0,0,0,0.1)" strokeWidth={1} />)}
      <path d={dataPath} fill="rgba(220,0,255,0.12)" stroke="#dc00ff" strokeWidth={2} />
      {dataPts.map((p, i) => <circle key={i} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r={3} fill="#dc00ff" />)}
      {entries.map(([key, dim], i) => {
        const [lx, ly] = polar(angles[i], LABEL_R)
        return (
          <text key={key} x={lx.toFixed(1)} y={ly.toFixed(1)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={11} fill="#8e8e93" style={{ fontFamily: 'var(--font)' }}>
            {(dim.label || key).split(' ')[0]}
          </text>
        )
      })}
      <circle cx={CX} cy={CY} r={3} fill="rgba(0,0,0,0.15)" />
    </svg>
  )
}

const DIMENSIONS = [
  {
    key: 'core_mechanism',
    label: 'Connector Fit',
    description: 'Does this role require cross-domain synthesis as its core function — bridging technical and creative/commercial stakeholders? Scores highest for roles where connecting disparate worlds IS the job: creator partnerships, brand strategy, BD at the intersection of creative and business.',
  },
  {
    key: 'gap_bridgeability',
    label: 'Gap Bridgeability',
    description: 'Even where a gap exists, how easily can it be bridged given a strong connector profile? Scores high when the gap is surface-level or coverable by transferable skills (cross-domain synthesis, Wharton MBA, regulated complexity experience). Scores low when the gap is structural and non-negotiable.',
  },
  {
    key: 'bd_track_record',
    label: 'Visibility',
    description: 'Will contribution be legible — externally-facing, partner-facing, or otherwise attributable? Scores highest for BD/partnerships, creator relations, and client-facing roles where outcomes are directly credited.',
  },
  {
    key: 'product_depth',
    label: 'Daily Texture',
    description: 'Will the day-to-day work be meaningfully engaging at the intersection of systems thinking and creative/human domains? Scores highest for roles with direct creative, cultural, or human dimension — creator relationships, editorial decisions, cultural verticals.',
  },
  {
    key: 'regulated_complexity',
    label: 'Structural Integrity',
    description: 'Does this organization have enough structure to support a reciprocal working relationship? Scores highest for established orgs with clear comp bands, defined reporting, and leadership tenure. Red flags: vague JD language, "wear many hats" without equity, no defined team structure.',
  },
  {
    key: 'mba_preference',
    label: 'Pioneering',
    description: 'Is this role building something new, or managing steady state? Scores highest for roles explicitly building a new program, launching a vertical, or defining a function from scratch. Scores lowest for maintaining a stable function with no mandate to build.',
  },
  {
    key: 'domain_gap',
    label: 'Domain Fit',
    description: 'How well does the role\'s industry align with target sectors? Scores 10 for creator economy, publishing, lifestyle partnerships, cultural media, music, sports, arts, and art sales. Scores 7 for fintech, healthtech, and GenAI at the intersection of creative industries.',
  },
]


export default function Settings({ liveWeights, setLiveWeights, savedWeights, saveWeights, profileDimensions }) {
  const [status, setStatus] = useState(null)
  const [doneCount, setDoneCount] = useState(null)
  const [localWeights, setLocalWeights] = useState(liveWeights)
  const pollRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (liveWeights && !localWeights) setLocalWeights(liveWeights)
  }, [liveWeights]) // eslint-disable-line

  useEffect(() => () => { clearInterval(pollRef.current); clearTimeout(debounceRef.current) }, [])

  const weights = localWeights || liveWeights || {}
  const dimList = buildDimList(profileDimensions, DIMENSIONS)

  function handleSlider(key, value) {
    const next = { ...(localWeights || liveWeights || {}), [key]: value }
    setLocalWeights(next)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setLiveWeights(next), 150)
  }

  async function handleSave() {
    setStatus('saving')
    clearInterval(pollRef.current)
    try {
      const savedAt = Date.now()
      await saveWeights(weights)
      setStatus('rescoring')
      pollRef.current = setInterval(async () => {
        try {
          const s = await fetchRescoreStatus()
          if (!s.running && s.lastTs != null && s.lastTs > savedAt) {
            clearInterval(pollRef.current)
            setDoneCount(s.lastCount)
            setStatus('done')
            setTimeout(() => { setStatus(null); setDoneCount(null) }, 6000)
          }
        } catch { /* ignore */ }
      }, 2000)
    } catch {
      setStatus('error')
    }
  }

  function handleReset() {
    setLocalWeights(savedWeights ?? liveWeights)
    setLiveWeights(savedWeights ?? liveWeights)
  }

  const isDirty = JSON.stringify(weights) !== JSON.stringify(savedWeights)

  return (
    <div style={{ background: 'var(--screen)', minHeight: '100%' }}>

      {/* Section header — iOS grouped style */}
      <div style={{
        padding: '20px 16px 4px',
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 400, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Scoring Weights
        </span>
        {profileDimensions && Object.keys(profileDimensions).length >= 3 && (
          <span style={{ fontSize: 11, color: 'var(--blue)' }}>✦ personalised</span>
        )}
      </div>

      {/* Spider chart — live preview of weights */}
      {profileDimensions && Object.keys(profileDimensions).length >= 3 && (
        <div style={{
          background: '#fff',
          borderTop: '0.5px solid rgba(0,0,0,0.15)',
          borderBottom: '0.5px solid rgba(0,0,0,0.15)',
          padding: '20px 16px',
          marginBottom: 16,
        }}>
          <RadarChart dimensions={profileDimensions} weights={weights} />
        </div>
      )}

      {/* Grouped table — one cell per dimension */}
      <div style={{
        background: '#fff',
        borderTop: '0.5px solid rgba(0,0,0,0.15)',
        borderBottom: '0.5px solid rgba(0,0,0,0.15)',
      }}>
        {dimList.map(({ key, label, description }, i) => {
          const value = weights[key] ?? 1
          const weightPct = (value / 5) * 100
          return (
            <div key={key} style={{
              padding: '13px 16px',
              borderBottom: i < dimList.length - 1 ? '0.5px solid rgba(0,0,0,0.08)' : 'none',
              background: '#fff',
            }}>
              {/* Label row + weight badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#000' }}>
                  {label}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: value >= 3 ? 'var(--accent)' : '#8e8e93',
                  background: value >= 3 ? 'rgba(220,0,255,0.12)' : 'rgba(0,0,0,0.05)',
                  borderRadius: 20,
                  padding: '2px 9px',
                  letterSpacing: '0.02em',
                }}>
                  {value}×
                </span>
              </div>

              {/* Description */}
              <p style={{
                margin: '0 0 10px',
                fontSize: 12, lineHeight: 1.55,
                color: '#8e8e93',
              }}>
                {description}
              </p>

              {/* Slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10, color: '#c7c7cc', minWidth: 14 }}>0</span>
                <input
                  type="range"
                  min={0} max={5} step={0.5}
                  value={value}
                  onChange={e => handleSlider(key, Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--blue)', height: 4 }}
                />
                <span style={{ fontSize: 10, color: '#c7c7cc', minWidth: 14 }}>5</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Save/reset row */}
      <div style={{ padding: '24px 16px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={!isDirty || status === 'saving' || status === 'rescoring'}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            border: 'none',
            background: isDirty
              ? 'var(--accent)'
              : 'rgba(0,0,0,0.08)',
            color: isDirty ? '#fff' : '#8e8e93',
            fontSize: 15,
            fontWeight: 600,
            fontFamily: 'var(--font)',
            cursor: (isDirty && !status) ? 'pointer' : 'not-allowed',
            opacity: (status === 'saving' || status === 'rescoring') ? 0.55 : 1,
            transition: 'all 0.2s',
            /* iOS button inner shadow */
            boxShadow: isDirty
              ? '0 1px 0 rgba(255,255,255,0.25) inset, 0 1px 3px rgba(0,0,0,0.2)'
              : 'none',
          }}
        >
          {status === 'saving' ? 'Saving…' : 'Save Weights'}
        </button>

        {isDirty && !status && (
          <button
            onClick={handleReset}
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              border: 'none',
              background: 'rgba(0,0,0,0.07)',
              color: '#000',
              fontSize: 15,
              fontFamily: 'var(--font)',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        )}

        {status === 'rescoring' && (
          <span style={{ fontSize: 14, color: '#8e8e93' }}>Re-scoring…</span>
        )}
        {status === 'done' && (
          <span style={{ fontSize: 14, color: 'var(--score-hi)' }}>✓ {doneCount} jobs updated</span>
        )}
        {status === 'error' && (
          <span style={{ fontSize: 14, color: 'var(--score-lo)' }}>Save failed</span>
        )}
      </div>

      {/* Footer note */}
      <div style={{ padding: '0 16px 32px' }}>
        <p style={{ fontSize: 13, color: '#8e8e93', lineHeight: 1.5, margin: 0 }}>
          Weights adjust how each dimension contributes to a job's overall fit score. Changes trigger a full re-score.
        </p>
      </div>
    </div>
  )
}
