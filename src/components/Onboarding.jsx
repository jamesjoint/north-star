import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { patchBackground, fetchProfile, patchWeights, patchPersonality, createBoardApi, patchName } from '../api.js'

const PROMPTS = [
  { key: 'background',   label: "What's your professional background in 2–3 sentences?" },
  { key: 'energizes',    label: 'What kind of work energizes you most?' },
  { key: 'next_role',    label: "What do you want in your next role that you don't have now?" },
  { key: 'dealbreakers', label: 'Any deal-breakers? (optional)', optional: true },
]

const MBTI_TYPES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP']
const DISC_STYLES = ['Dominance (D)','Influence (I)','Steadiness (S)','Conscientiousness (C)']
const ZODIAC = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces']

const STEPS = ['name', 'background', 'generating', 'personality', 'review', 'board']

// ── Step 0: Name form ─────────────────────────────────────────────────────────

function NameStep({ onNext }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const ready = firstName.trim().length > 0

  async function handleSubmit(e) {
    e.preventDefault()
    if (!ready) return
    setSaving(true)
    setError('')
    try {
      await patchName(firstName.trim(), lastName.trim() || null)
      onNext(firstName.trim(), lastName.trim() || null)
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.')
      setSaving(false)
    }
  }

  return (
    <>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
        What should we call you?
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 32, lineHeight: 1.5 }}>
        We'll use your name to personalize your experience.
      </p>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <input
            type="text"
            placeholder="First name"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            style={{ flex: 1, padding: '10px 12px', fontSize: 15, borderRadius: 8, border: '1px solid rgba(0,0,0,0.18)', fontFamily: 'var(--font)' }}
            autoFocus
          />
          <input
            type="text"
            placeholder="Last name (optional)"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            style={{ flex: 1, padding: '10px 12px', fontSize: 15, borderRadius: 8, border: '1px solid rgba(0,0,0,0.18)', fontFamily: 'var(--font)' }}
          />
        </div>
        {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button
          type="submit"
          disabled={!ready || saving}
          style={primaryBtn(ready && !saving)}
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </>
  )
}

// ── Step 1: Background form ───────────────────────────────────────────────────

function BackgroundStep({ onNext }) {
  const [answers, setAnswers] = useState({})
  const [targetRoles, setTargetRoles] = useState('')
  const [targetSectors, setTargetSectors] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(key, value) {
    setAnswers(prev => ({ ...prev, [key]: value }))
  }

  const ready = answers.background?.trim() && answers.energizes?.trim() &&
    answers.next_role?.trim() && targetRoles.trim() && targetSectors.trim()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!ready) return
    setSaving(true)
    setError('')
    try {
      const background = [
        answers.background.trim(),
        `What energizes me: ${answers.energizes.trim()}`,
        `What I want next: ${answers.next_role.trim()}`,
        answers.dealbreakers?.trim() ? `Deal-breakers: ${answers.dealbreakers.trim()}` : null,
        `Target roles: ${targetRoles.trim()}`,
        `Target sectors: ${targetSectors.trim()}`,
      ].filter(Boolean).join('\n\n')
      await patchBackground(background)
      onNext()
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.')
      setSaving(false)
    }
  }

  return (
    <>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
        Set up your profile
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 32, lineHeight: 1.5 }}>
        Your answers shape how every job is scored — the more specific, the better.
      </p>
      <form onSubmit={handleSubmit}>
        {PROMPTS.map(({ key, label, optional }) => (
          <div key={key} style={{ marginBottom: 20 }}>
            <label style={labelStyle}>{label}</label>
            <textarea value={answers[key] || ''} onChange={e => set(key, e.target.value)}
              rows={3} placeholder={optional ? 'Skip if none' : ''} style={inputStyle} />
          </div>
        ))}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>What job titles are you targeting?</label>
          <input value={targetRoles} onChange={e => setTargetRoles(e.target.value)}
            placeholder="e.g. Head of Partnerships, Chief of Staff, Creator Relations…"
            style={{ ...inputStyle, resize: undefined }} />
        </div>
        <div style={{ marginBottom: 32 }}>
          <label style={labelStyle}>What industries or sectors interest you?</label>
          <input value={targetSectors} onChange={e => setTargetSectors(e.target.value)}
            placeholder="e.g. media, creator economy, fintech, healthtech…"
            style={{ ...inputStyle, resize: undefined }} />
        </div>
        {error && <p style={{ fontSize: 13, color: 'var(--score-lo)', marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={!ready || saving} style={primaryBtn(ready && !saving)}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </>
  )
}

// ── Step 2: Generating dimensions ─────────────────────────────────────────────

function GeneratingStep({ onNext }) {
  const pollRef = useRef(null)
  const timedOutRef = useRef(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const deadline = Date.now() + 45_000
    pollRef.current = setInterval(async () => {
      if (timedOutRef.current) return
      if (Date.now() > deadline) {
        timedOutRef.current = true
        setTimedOut(true)
        clearInterval(pollRef.current)
        return
      }
      try {
        const profile = await fetchProfile()
        if (profile?.dimensions && Object.keys(profile.dimensions).length >= 3) {
          clearInterval(pollRef.current)
          onNext(profile.dimensions, profile.weights || {})
        }
      } catch { /* ignore */ }
    }, 2000)
    return () => clearInterval(pollRef.current)
  }, [onNext])

  return (
    <div style={{ textAlign: 'center', paddingTop: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 20 }}>✦</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
        {timedOut ? 'Still working…' : 'Building your scoring profile'}
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 32 }}>
        {timedOut
          ? 'Taking longer than usual. Wait or skip — dimensions will be ready when you return.'
          : 'Reading your background and generating custom scoring dimensions.'}
      </p>
      {!timedOut && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 32 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)',
              animation: `pulse 1.2s ease-in-out ${i * 0.4}s infinite`,
            }} />
          ))}
        </div>
      )}
      {timedOut && (
        <button onClick={() => onNext(null, {})} style={primaryBtn(true)}>Skip for now</button>
      )}
      <style>{`@keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:1} }`}</style>
    </div>
  )
}

// ── Step 3: Personality (optional) ───────────────────────────────────────────

function PersonalityStep({ onNext }) {
  const [mbti, setMbti] = useState('')
  const [enneagram, setEnneagram] = useState('')
  const [disc, setDisc] = useState('')
  const [sunSign, setSunSign] = useState('')
  const [moonSign, setMoonSign] = useState('')
  const [risingSign, setRisingSign] = useState('')
  const [strengths, setStrengths] = useState('')

  function handleDone() {
    const personality = {}
    if (mbti) personality.mbti = mbti
    if (enneagram.trim()) personality.enneagram = enneagram.trim()
    if (disc) personality.disc = disc
    if (sunSign) personality.sun_sign = sunSign
    if (moonSign) personality.moon_sign = moonSign
    if (risingSign) personality.rising_sign = risingSign
    if (strengths.trim()) {
      personality.strengths = strengths.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5)
    }
    if (Object.keys(personality).length > 0) {
      patchPersonality(personality).catch(() => {}) // fire-and-forget, non-fatal
    }
    onNext()
  }

  const selectStyle = {
    width: '100%', padding: '10px 12px', fontSize: 14,
    border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8,
    outline: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box',
    color: 'var(--text)', background: '#fff', appearance: 'none',
  }

  return (
    <>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
        Personality context
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 28 }}>
        Optional — skip any you don't know or don't care about. These sharpen how your dimensions are applied during scoring.
      </p>

      {/* Frameworks */}
      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Frameworks
      </div>
      <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', overflow: 'hidden', marginBottom: 24 }}>
        <div style={rowStyle}>
          <label style={inlineLabel}>Myers-Briggs</label>
          <select value={mbti} onChange={e => setMbti(e.target.value)} style={{ ...selectStyle, width: 'auto', flex: 1, maxWidth: 130 }}>
            <option value="">—</option>
            {MBTI_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ ...rowStyle, borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
          <label style={inlineLabel}>Enneagram</label>
          <input value={enneagram} onChange={e => setEnneagram(e.target.value)}
            placeholder="e.g. 3w2" maxLength={6}
            style={{ ...selectStyle, width: 'auto', flex: 1, maxWidth: 130 }} />
        </div>
        <div style={{ ...rowStyle, borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
          <label style={inlineLabel}>DiSC</label>
          <select value={disc} onChange={e => setDisc(e.target.value)} style={{ ...selectStyle, width: 'auto', flex: 1, maxWidth: 220 }}>
            <option value="">—</option>
            {DISC_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Astrology */}
      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Astrology
      </div>
      <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', overflow: 'hidden', marginBottom: 24 }}>
        {[
          { label: 'Sun sign', value: sunSign, set: setSunSign },
          { label: 'Moon sign', value: moonSign, set: setMoonSign },
          { label: 'Rising sign', value: risingSign, set: setRisingSign },
        ].map(({ label, value, set }, i) => (
          <div key={label} style={{ ...rowStyle, borderTop: i > 0 ? '0.5px solid rgba(0,0,0,0.08)' : 'none' }}>
            <label style={inlineLabel}>{label}</label>
            <select value={value} onChange={e => set(e.target.value)} style={{ ...selectStyle, width: 'auto', flex: 1, maxWidth: 160 }}>
              <option value="">—</option>
              {ZODIAC.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* CliftonStrengths */}
      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        CliftonStrengths
      </div>
      <div style={{ background: '#fff', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', overflow: 'hidden', marginBottom: 32 }}>
        <div style={{ padding: '12px 16px' }}>
          <label style={{ ...labelStyle, marginBottom: 8 }}>Top 5 themes (comma-separated)</label>
          <input value={strengths} onChange={e => setStrengths(e.target.value)}
            placeholder="e.g. Strategic, Activator, Relator, Ideation, Futuristic"
            style={{ ...inputStyle, resize: undefined }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={handleDone} style={{ ...primaryBtn(true), flex: 1 }}>
          Continue
        </button>
        <button onClick={onNext} style={{
          flex: 1, padding: '12px', fontSize: 15, fontWeight: 500,
          background: 'rgba(0,0,0,0.06)', color: 'var(--text-3)',
          border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)',
        }}>
          Skip
        </button>
      </div>
    </>
  )
}

// ── Step 4: Review dimensions ─────────────────────────────────────────────────

function ReviewStep({ dimensions, initialWeights, onComplete }) {
  const dimEntries = dimensions ? Object.entries(dimensions) : []
  const [weights, setWeights] = useState(() => {
    const w = {}
    for (const [k, dim] of dimEntries) w[k] = initialWeights?.[k] ?? dim.weight ?? 1
    return w
  })
  const [saving, setSaving] = useState(false)

  async function handleDone() {
    setSaving(true)
    try { await patchWeights(weights) } catch { /* non-fatal */ }
    onComplete()
  }

  if (!dimEntries.length) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>You're all set</h2>
        <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 32 }}>
          Dimensions will be ready shortly.
        </p>
        <button onClick={onComplete} style={primaryBtn(true)}>Start scoring jobs</button>
      </div>
    )
  }

  return (
    <>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
        Your scoring dimensions
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24, lineHeight: 1.5 }}>
        Generated from your background. Adjust weights to match what matters most.
      </p>
      <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid rgba(0,0,0,0.12)', overflow: 'hidden', marginBottom: 28 }}>
        {dimEntries.map(([key, dim], i) => {
          const value = weights[key] ?? dim.weight ?? 1
          return (
            <div key={key} style={{
              padding: '14px 16px',
              borderBottom: i < dimEntries.length - 1 ? '0.5px solid rgba(0,0,0,0.08)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{dim.label || key}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: value >= 3 ? 'var(--blue)' : '#8e8e93',
                  background: value >= 3 ? 'rgba(48,197,255,0.12)' : 'rgba(0,0,0,0.05)',
                  borderRadius: 20, padding: '2px 9px',
                }}>{value}×</span>
              </div>
              {dim.description && (
                <p style={{ fontSize: 11, color: '#8e8e93', margin: '0 0 10px', lineHeight: 1.5 }}>
                  {dim.description.split(':')[0]}
                </p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: '#c7c7cc', minWidth: 12 }}>0</span>
                <input type="range" min={0} max={5} step={0.5} value={value}
                  onChange={e => setWeights(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                  style={{ flex: 1, accentColor: 'var(--blue)', height: 4 }} />
                <span style={{ fontSize: 10, color: '#c7c7cc', minWidth: 12 }}>5</span>
              </div>
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.5 }}>
        You can always adjust these from the Settings tab.
      </p>
      <button onClick={handleDone} disabled={saving} style={primaryBtn(true)}>
        {saving ? 'Saving…' : 'Continue'}
      </button>
    </>
  )
}

// ── Step 5: Name first board ──────────────────────────────────────────────────

function BoardNameStep({ onComplete }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleDone() {
    setSaving(true)
    try {
      const boardName = name.trim() || 'My Job Search'
      await createBoardApi(boardName)
    } catch { /* board creation is non-fatal; a default is created on first tracker use */ }
    onComplete()
  }

  return (
    <>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
        Name your constellation board
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 28 }}>
        Boards let you organise your applications. You can create more later.
      </p>
      <div style={{ marginBottom: 32 }}>
        <label style={labelStyle}>Board name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="My Job Search"
          maxLength={60}
          autoFocus
          onKeyDown={e => e.key === 'Enter' && handleDone()}
          style={{ ...inputStyle, resize: undefined }}
        />
      </div>
      <button onClick={handleDone} disabled={saving} style={primaryBtn(true)}>
        {saving ? 'Creating…' : 'Start scoring jobs'}
      </button>
    </>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const labelStyle = {
  display: 'block', fontSize: 13, fontWeight: 500,
  color: 'var(--text-2)', marginBottom: 6,
}

const inlineLabel = {
  fontSize: 14, color: 'var(--text)', fontWeight: 400, minWidth: 120,
}

const rowStyle = {
  padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
}

const inputStyle = {
  width: '100%', padding: '10px 12px', fontSize: 14,
  border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8,
  outline: 'none', resize: 'vertical', fontFamily: 'var(--font)',
  boxSizing: 'border-box', lineHeight: 1.5, color: 'var(--text)',
}

function primaryBtn(enabled) {
  return {
    width: '100%', padding: '12px', fontSize: 15, fontWeight: 600,
    background: enabled ? 'var(--blue)' : 'rgba(0,0,0,0.1)',
    color: enabled ? '#fff' : 'var(--text-3)',
    border: 'none', borderRadius: 8,
    cursor: enabled ? 'pointer' : 'default',
    fontFamily: 'var(--font)', transition: 'background 0.15s',
  }
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function Onboarding({ onComplete }) {
  const { setFirstName, setLastName } = useAuth()
  const [step, setStep] = useState('name')
  const [dimensions, setDimensions] = useState(null)
  const [initialWeights, setInitialWeights] = useState({})

  const stepIndex = STEPS.indexOf(step)

  function handleNameDone(first, last) {
    setFirstName(first)
    setLastName(last)
    setStep('background')
  }

  function handleGeneratingDone(dims, weights) {
    setDimensions(dims)
    setInitialWeights(weights)
    setStep('personality')
  }

  return (
    <div style={{
      minHeight: '100vh', overflowY: 'auto', background: 'var(--screen)',
      fontFamily: 'var(--font)', display: 'flex', justifyContent: 'center',
      padding: '40px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        {/* Step progress bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{
              height: 3, flex: 1, borderRadius: 2,
              background: i <= stepIndex ? 'var(--blue)' : 'rgba(0,0,0,0.1)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {step === 'name' && (
          <NameStep onNext={handleNameDone} />
        )}
        {step === 'background' && (
          <BackgroundStep onNext={() => setStep('generating')} />
        )}
        {step === 'generating' && (
          <GeneratingStep onNext={handleGeneratingDone} />
        )}
        {step === 'personality' && (
          <PersonalityStep onNext={() => setStep('review')} />
        )}
        {step === 'review' && (
          <ReviewStep
            dimensions={dimensions}
            initialWeights={initialWeights}
            onComplete={() => setStep('board')}
          />
        )}
        {step === 'board' && (
          <BoardNameStep onComplete={onComplete} />
        )}
      </div>
    </div>
  )
}
