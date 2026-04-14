import { useState, useEffect, useRef } from 'react'
import { fetchRescoreStatus } from '../api.js'

export default function ScoreBanner({ onDone }) {
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const [count, setCount] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const pollRef = useRef(null)
  const wasRunningRef = useRef(false)
  const seenTsRef = useRef(null)
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])

  useEffect(() => {
    async function poll() {
      try {
        const s = await fetchRescoreStatus()
        if (s.running) {
          setRunning(true)
          setFinished(false)
          setDismissed(false)
          wasRunningRef.current = true
        } else {
          setRunning(false)
          const isNew = s.lastTs && s.lastTs !== seenTsRef.current
          if (isNew && (wasRunningRef.current || !seenTsRef.current)) {
            seenTsRef.current = s.lastTs
            wasRunningRef.current = false
            setCount(s.lastCount)
            setFinished(true)
            setDismissed(false)
            onDoneRef.current?.()
          }
        }
      } catch { /* ignore */ }
    }

    poll()
    pollRef.current = setInterval(poll, 3000)
    return () => clearInterval(pollRef.current)
  }, [])

  if (!running && (!finished || dismissed)) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 16px',
      background: running ? 'rgba(220,0,255,0.06)' : 'rgba(29,111,66,0.08)',
      borderBottom: '0.5px solid rgba(0,0,0,0.08)',
      fontSize: 13,
      color: running ? 'var(--accent)' : 'var(--score-hi)',
    }}>
      {running ? (
        <>
          <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                display: 'inline-block',
                width: 4, height: 4, borderRadius: '50%',
                background: 'var(--accent)',
                animation: `pulse 1.2s ease-in-out ${i * 0.4}s infinite`,
              }} />
            ))}
          </span>
          Scoring your jobs…
        </>
      ) : (
        <>
          ✓ {count != null ? `${count} jobs scored` : 'Scoring complete'} — scores updated
          <button
            onClick={() => setDismissed(true)}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 14, color: 'var(--score-hi)',
              padding: '0 4px', lineHeight: 1, opacity: 0.6,
            }}
          >
            ✕
          </button>
        </>
      )}
      <style>{`@keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:1} }`}</style>
    </div>
  )
}
