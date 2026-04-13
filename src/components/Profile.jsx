import { useState, useEffect } from 'react'
import { fetchProfile, patchBackground, regenerateDimensions, patchPersonality, patchDimensions, patchName } from '../api.js'
import { cleanPersonality } from '../utils/personality.js'
import { useAuth } from '../contexts/AuthContext.jsx'

const MBTI_TYPES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP']
const DISC_STYLES = ['Dominance (D)','Influence (I)','Steadiness (S)','Conscientiousness (C)']
const ZODIAC = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces']

// ── Radar chart ───────────────────────────────────────────────────────────────

function RadarChart({ dimensions, weights }) {
  const entries = Object.entries(dimensions)
  const N = entries.length
  if (N < 3) return null

  const SIZE = 220
  const CX = SIZE / 2
  const CY = SIZE / 2
  const R = 80          // outer ring radius
  const LABEL_R = R + 20 // label placement radius

  function polar(angle, r) {
    return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)]
  }

  const angles = entries.map((_, i) => (i / N) * 2 * Math.PI - Math.PI / 2)

  // Background rings
  const rings = [0.25, 0.5, 0.75, 1].map(frac => {
    const pts = angles.map(a => polar(a, R * frac))
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z'
  })

  // Data polygon
  const dataPts = entries.map(([key, dim], i) => {
    const w = weights?.[key] ?? dim.weight ?? 1
    const frac = Math.min(w / 5, 1)
    return polar(angles[i], R * frac)
  })
  const dataPath = dataPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z'

  // Axis lines
  const axes = angles.map(a => {
    const [x2, y2] = polar(a, R)
    return `M${CX},${CY} L${x2.toFixed(1)},${y2.toFixed(1)}`
  })

  return (
    <svg width={SIZE} height={SIZE} style={{ display: 'block', margin: '0 auto' }}>
      {/* Rings */}
      {rings.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={1} />
      ))}
      {/* Axes */}
      {axes.map((d, i) => (
        <path key={i} d={d} stroke="rgba(0,0,0,0.1)" strokeWidth={1} />
      ))}
      {/* Data polygon */}
      <path d={dataPath} fill="rgba(48,197,255,0.18)" stroke="var(--blue)" strokeWidth={2} />
      {/* Labels */}
      {entries.map(([key, dim], i) => {
        const [lx, ly] = polar(angles[i], LABEL_R)
        const label = (dim.label || key).split(' ')[0] // first word only
        return (
          <text
            key={key}
            x={lx.toFixed(1)} y={ly.toFixed(1)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fill="#8e8e93"
            style={{ fontFamily: 'var(--font)' }}
          >
            {label}
          </text>
        )
      })}
      {/* Center dot */}
      <circle cx={CX} cy={CY} r={3} fill="rgba(0,0,0,0.15)" />
    </svg>
  )
}

function SectionLabel({ children, badge }) {
  return (
    <div style={{ padding: '16px 16px 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 13, fontWeight: 400, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {children}
      </span>
      {badge && <span style={{ fontSize: 11, color: 'var(--blue)' }}>{badge}</span>}
    </div>
  )
}

// ── Personality editor ────────────────────────────────────────────────────────

function PersonalitySection({ personality: initial }) {
  const [editing, setEditing] = useState(false)
  const [current, setCurrent] = useState(initial || {})
  const [p, setP] = useState(initial || {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function field(key, value) { setP(prev => ({ ...prev, [key]: value })) }

  async function handleSave() {
    setSaving(true)
    try {
      const clean = cleanPersonality(p)
      await patchPersonality(clean)
      setCurrent(clean)
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 3000)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const selectStyle = {
    padding: '8px 10px', fontSize: 13, border: '1px solid rgba(0,0,0,0.15)',
    borderRadius: 8, outline: 'none', fontFamily: 'var(--font)',
    color: 'var(--text)', background: '#fff', flex: 1, maxWidth: 180,
  }
  const inputStyle = { ...selectStyle, maxWidth: 'none', width: '100%' }
  const rowStyle = {
    display: 'flex', alignItems: 'center', padding: '10px 16px',
    borderBottom: '0.5px solid rgba(0,0,0,0.08)', gap: 12,
  }
  const labelStyle = { fontSize: 13, color: '#8e8e93', minWidth: 120 }

  const hasData = Object.keys(current).length > 0

  function displayValue(key) {
    const v = current[key]
    if (!v) return null
    if (Array.isArray(v)) return v.join(', ')
    return String(v)
  }

  const astroLine = [
    current.sun_sign  && `☀ ${current.sun_sign}`,
    current.moon_sign && `☽ ${current.moon_sign}`,
    current.rising_sign && `↑ ${current.rising_sign}`,
  ].filter(Boolean).join('  ')

  return (
    <>
      <SectionLabel>Personality</SectionLabel>
      <div style={{ background: '#fff', borderTop: '0.5px solid rgba(0,0,0,0.15)', borderBottom: '0.5px solid rgba(0,0,0,0.15)' }}>
        {!editing ? (
          <>
            {!hasData ? (
              <div style={{ padding: '14px 16px' }}>
                <p style={{ fontSize: 13, color: '#8e8e93', margin: '0 0 10px' }}>No personality data added yet.</p>
                <button onClick={() => setEditing(true)} style={editBtn}>Add</button>
              </div>
            ) : (
              <>
                {[
                  ['Myers-Briggs', displayValue('mbti')],
                  ['Enneagram', displayValue('enneagram')],
                  ['DiSC', displayValue('disc')],
                  ['Astrology', astroLine || null],
                  ['CliftonStrengths', displayValue('strengths')],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} style={rowStyle}>
                    <span style={labelStyle}>{label}</span>
                    <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{value}</span>
                  </div>
                ))}
                <div style={{ padding: '10px 16px', borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
                  <button onClick={() => { setP({ ...current }); setEditing(true) }} style={editBtn}>Edit</button>
                  {saved && <span style={{ marginLeft: 12, fontSize: 13, color: '#A0CB3B' }}>✓ Saved</span>}
                </div>
              </>
            )}
          </>
        ) : (
          <div style={{ padding: '14px 16px' }}>
            {[
              { label: 'Myers-Briggs', key: 'mbti', type: 'select', options: MBTI_TYPES },
              { label: 'Enneagram', key: 'enneagram', type: 'text', placeholder: 'e.g. 3w2' },
              { label: 'DiSC', key: 'disc', type: 'select', options: DISC_STYLES },
            ].map(({ label, key, type, options, placeholder }) => (
              <div key={key} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ ...labelStyle, flexShrink: 0 }}>{label}</label>
                {type === 'select' ? (
                  <select value={p[key] || ''} onChange={e => field(key, e.target.value)} style={selectStyle}>
                    <option value="">—</option>
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input value={p[key] || ''} onChange={e => field(key, e.target.value)}
                    placeholder={placeholder} style={{ ...inputStyle, maxWidth: 130 }} />
                )}
              </div>
            ))}

            <div style={{ marginBottom: 12 }}>
              <label style={{ ...labelStyle, display: 'block', marginBottom: 8 }}>Astrology</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[['sun_sign','Sun'], ['moon_sign','Moon'], ['rising_sign','Rising']].map(([k, l]) => (
                  <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 10, color: '#8e8e93' }}>{l}</span>
                    <select value={p[k] || ''} onChange={e => field(k, e.target.value)} style={{ ...selectStyle, maxWidth: 120, flex: 'unset' }}>
                      <option value="">—</option>
                      {ZODIAC.map(z => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>CliftonStrengths top 5</label>
              <input
                value={Array.isArray(p.strengths) ? p.strengths.join(', ') : (p.strengths || '')}
                onChange={e => field('strengths', e.target.value)}
                placeholder="e.g. Strategic, Activator, Relator, Ideation, Futuristic"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '9px 20px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(180deg, #6dd4ff 0%, #30C5FF 100%)',
                color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer',
              }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} style={{
                padding: '9px 16px', borderRadius: 8, border: 'none',
                background: 'rgba(0,0,0,0.07)', color: 'var(--text)',
                fontSize: 14, fontFamily: 'var(--font)', cursor: 'pointer',
              }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const editBtn = {
  padding: '6px 16px', borderRadius: 8, border: 'none',
  background: 'rgba(0,0,0,0.07)', color: 'var(--text)',
  fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer',
}

function actionBtn(variant) {
  const base = {
    padding: '9px 20px', borderRadius: 10, border: 'none',
    fontSize: 14, fontWeight: 500, fontFamily: 'var(--font)',
    cursor: 'pointer', transition: 'all 0.2s',
  }
  if (variant === 'blue') return { ...base, background: 'linear-gradient(180deg, #6dd4ff 0%, #30C5FF 100%)', color: '#fff', fontWeight: 600 }
  return { ...base, background: 'rgba(0,0,0,0.07)', color: 'var(--text)' }
}

// ── Main Profile page ─────────────────────────────────────────────────────────

export default function Profile({ onBack, onGoToSettings, onProfileChange }) {
  const { setFirstName: ctxSetFirstName, setLastName: ctxSetLastName } = useAuth()
  const [profile, setProfile] = useState(null)
  const [background, setBackground] = useState('')
  const [original, setOriginal] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [regenerated, setRegenerated] = useState(false)
  const [editingDims, setEditingDims] = useState(false)
  const [dimDraft, setDimDraft] = useState(null)
  const [savingDims, setSavingDims] = useState(false)
  const [savedDims, setSavedDims] = useState(false)
  const [error, setError] = useState('')
  const [nameFirst, setNameFirst] = useState('')
  const [nameLast, setNameLast] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savedName, setSavedName] = useState(false)

  useEffect(() => {
    fetchProfile()
      .then(p => {
        setProfile(p)
        const bg = p?.background || ''
        setBackground(bg)
        setOriginal(bg)
        setNameFirst(p?.first_name || '')
        setNameLast(p?.last_name || '')
      })
      .catch(() => setError('Could not load profile.'))
      .finally(() => setLoading(false))
  }, [])

  const isDirty = background !== original
  const dims = profile?.dimensions && Object.keys(profile.dimensions).length >= 3
    ? Object.entries(profile.dimensions)
    : null

  async function handleSave() {
    if (!background.trim() || !isDirty) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await patchBackground(background.trim())
      setOriginal(background.trim())
      setSaved(true)
      onProfileChange?.()
      setTimeout(() => setSaved(false), 4000)
    } catch (err) {
      setError(err.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveName() {
    setSavingName(true)
    setSavedName(false)
    try {
      await patchName(nameFirst.trim() || null, nameLast.trim() || null)
      ctxSetFirstName(nameFirst.trim() || null)
      ctxSetLastName(nameLast.trim() || null)
      setSavedName(true)
      setTimeout(() => setSavedName(false), 4000)
    } catch (err) {
      setError(err.message || 'Save failed.')
    } finally {
      setSavingName(false)
    }
  }

  function startEditDims() {
    // Deep-copy so edits don't mutate profile state
    setDimDraft(JSON.parse(JSON.stringify(profile.dimensions)))
    setEditingDims(true)
  }

  async function handleSaveDims() {
    setSavingDims(true)
    try {
      await patchDimensions(dimDraft)
      setProfile(prev => ({ ...prev, dimensions: dimDraft }))
      setEditingDims(false)
      setSavedDims(true)
      onProfileChange?.()
      setTimeout(() => setSavedDims(false), 4000)
    } catch (err) {
      setError(err.message || 'Save failed.')
    } finally {
      setSavingDims(false)
    }
  }

  async function handleRegenerate() {
    setRegenerating(true)
    setError('')
    setRegenerated(false)
    try {
      await regenerateDimensions()
      setRegenerated(true)
      setTimeout(() => setRegenerated(false), 4000)
    } catch (err) {
      setError(err.message || 'Regenerate failed.')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div style={{ background: 'var(--screen)', minHeight: '100%' }}>

      {/* Back nav */}
      <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, color: 'var(--blue)', fontFamily: 'var(--font)',
          padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          ← Back
        </button>
      </div>

      {/* Name section */}
      <SectionLabel>Your Name</SectionLabel>
      <div style={{ background: '#fff', borderTop: '0.5px solid rgba(0,0,0,0.15)', borderBottom: '0.5px solid rgba(0,0,0,0.15)', padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="First name"
            value={nameFirst}
            onChange={e => setNameFirst(e.target.value)}
            style={{ flex: 1, padding: '8px 10px', fontSize: 14, borderRadius: 7, border: '1px solid rgba(0,0,0,0.18)', fontFamily: 'var(--font)' }}
          />
          <input
            type="text"
            placeholder="Last name (optional)"
            value={nameLast}
            onChange={e => setNameLast(e.target.value)}
            style={{ flex: 1, padding: '8px 10px', fontSize: 14, borderRadius: 7, border: '1px solid rgba(0,0,0,0.18)', fontFamily: 'var(--font)' }}
          />
          <button
            onClick={handleSaveName}
            disabled={savingName}
            style={{
              padding: '8px 14px', fontSize: 13, fontWeight: 600,
              background: 'var(--blue)', color: '#fff', border: 'none',
              borderRadius: 7, cursor: savingName ? 'default' : 'pointer',
              fontFamily: 'var(--font)', opacity: savingName ? 0.7 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {savedName ? '✓ Saved' : savingName ? 'Saving…' : 'Save name'}
          </button>
        </div>
      </div>

      {/* Background section */}
      <SectionLabel>Your Background</SectionLabel>
      <div style={{ background: '#fff', borderTop: '0.5px solid rgba(0,0,0,0.15)', borderBottom: '0.5px solid rgba(0,0,0,0.15)', padding: '14px 16px' }}>
        {loading ? (
          <p style={{ fontSize: 14, color: '#8e8e93', margin: 0 }}>Loading…</p>
        ) : (
          <>
            <p style={{ fontSize: 12, color: '#8e8e93', margin: '0 0 10px', lineHeight: 1.5 }}>
              Edit any time — saving regenerates your scoring dimensions and triggers a full re-score.
            </p>
            <textarea
              value={background}
              onChange={e => setBackground(e.target.value)}
              rows={10}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14,
                border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8,
                outline: 'none', resize: 'vertical', fontFamily: 'var(--font)',
                boxSizing: 'border-box', lineHeight: 1.6,
                color: 'var(--text)', background: '#fafafa',
              }}
            />
          </>
        )}
      </div>
      {!loading && (
        <div style={{ padding: '16px 16px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleSave}
            disabled={!isDirty || saving || !background.trim()}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none',
              background: isDirty && background.trim()
                ? 'linear-gradient(180deg, #6dd4ff 0%, #30C5FF 100%)'
                : 'rgba(0,0,0,0.08)',
              color: isDirty && background.trim() ? '#fff' : '#8e8e93',
              fontSize: 15, fontWeight: 600, fontFamily: 'var(--font)',
              cursor: (isDirty && !saving && background.trim()) ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              boxShadow: isDirty && background.trim()
                ? '0 1px 0 rgba(255,255,255,0.25) inset, 0 1px 3px rgba(0,0,0,0.2)'
                : 'none',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved && <span style={{ fontSize: 14, color: '#A0CB3B' }}>✓ Saved — re-scoring jobs</span>}
          {error && <span style={{ fontSize: 14, color: '#EC5298' }}>{error}</span>}
        </div>
      )}

      {!loading && <PersonalitySection personality={profile?.personality} />}

      <div style={{ height: 24 }} />

      {/* Scoring dimensions section */}
      <SectionLabel badge={dims ? '✦ personalised' : null}>Scoring Dimensions</SectionLabel>
      <div style={{ background: '#fff', borderTop: '0.5px solid rgba(0,0,0,0.15)', borderBottom: '0.5px solid rgba(0,0,0,0.15)' }}>
        {loading ? (
          <div style={{ padding: '14px 16px' }}>
            <p style={{ fontSize: 14, color: '#8e8e93', margin: 0 }}>Loading…</p>
          </div>
        ) : dims ? (
          <>
            <div style={{ padding: '20px 16px 12px' }}>
              <RadarChart dimensions={profile.dimensions} weights={profile.weights} />
            </div>
            <div style={{ height: '0.5px', background: 'rgba(0,0,0,0.08)' }} />
            {(editingDims ? Object.entries(dimDraft) : dims).map(([key, dim], i, arr) => (
              <div key={key} style={{
                padding: '13px 16px',
                borderBottom: i < arr.length - 1 ? '0.5px solid rgba(0,0,0,0.08)' : 'none',
              }}>
                {editingDims ? (
                  <>
                    <input
                      value={dimDraft[key]?.label || ''}
                      onChange={e => setDimDraft(prev => ({ ...prev, [key]: { ...prev[key], label: e.target.value } }))}
                      placeholder="Dimension label"
                      style={{
                        width: '100%', padding: '6px 8px', fontSize: 13, fontWeight: 600,
                        border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6,
                        fontFamily: 'var(--font)', boxSizing: 'border-box', marginBottom: 6,
                        color: 'var(--text)', outline: 'none',
                      }}
                    />
                    <textarea
                      value={dimDraft[key]?.description || ''}
                      onChange={e => setDimDraft(prev => ({ ...prev, [key]: { ...prev[key], description: e.target.value } }))}
                      rows={2}
                      placeholder="Description used in scoring prompts"
                      style={{
                        width: '100%', padding: '6px 8px', fontSize: 12,
                        border: '1px solid rgba(0,0,0,0.12)', borderRadius: 6,
                        fontFamily: 'var(--font)', boxSizing: 'border-box',
                        color: '#8e8e93', outline: 'none', resize: 'vertical', lineHeight: 1.4,
                      }}
                    />
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
                      {dim.label || key}
                    </div>
                    <p style={{ fontSize: 12, color: '#8e8e93', margin: 0, lineHeight: 1.5 }}>
                      {(dim.description || '').split(':')[0]}
                    </p>
                  </>
                )}
              </div>
            ))}
          </>
        ) : (
          <div style={{ padding: '14px 16px' }}>
            <p style={{ fontSize: 14, color: '#8e8e93', margin: 0 }}>
              No custom dimensions yet. Save your background to generate them.
            </p>
          </div>
        )}
      </div>

      {!loading && dims && (
        <div style={{ padding: '16px 16px 8px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {editingDims ? (
            <>
              <button onClick={handleSaveDims} disabled={savingDims} style={actionBtn('blue')}>
                {savingDims ? 'Saving…' : 'Save dimensions'}
              </button>
              <button onClick={() => setEditingDims(false)} style={actionBtn('default')}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={startEditDims} style={actionBtn('default')}>
                Edit dimensions
              </button>
              <button onClick={handleRegenerate} disabled={regenerating} style={actionBtn('default')}>
                {regenerating ? 'Regenerating…' : 'Refresh Dimensions'}
              </button>
            </>
          )}
          {savedDims && <span style={{ fontSize: 13, color: '#A0CB3B' }}>✓ Saved — re-scoring jobs</span>}
          {regenerated && <span style={{ fontSize: 13, color: '#A0CB3B' }}>✓ Regenerating — reload to see new dimensions</span>}
        </div>
      )}

      <div style={{ height: 24 }} />

      {/* Scoring weights link */}
      <div style={{ padding: '0 16px 6px', fontSize: 13, fontWeight: 400, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Scoring Weights
      </div>
      <div style={{ background: '#fff', borderTop: '0.5px solid rgba(0,0,0,0.15)', borderBottom: '0.5px solid rgba(0,0,0,0.15)' }}>
        <button onClick={onGoToSettings} style={{
          width: '100%', padding: '14px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font)', textAlign: 'left',
        }}>
          <span>Edit dimension weights</span>
          <span style={{ color: '#c7c7cc', fontSize: 17 }}>›</span>
        </button>
      </div>
    </div>
  )
}
