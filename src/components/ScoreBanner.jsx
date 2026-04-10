import { useState, useEffect, useRef } from 'react'
import { fetchRescoreStatus } from '../api.js'

/**
 * Shows a banner while scoring is in progress; calls onDone() when it finishes
 * so the parent can refresh the job list.
 */
export default function ScoreBanner({ onDone }) {
  const [running, setRunning] = useState(false)
  const [justFinished, setJustFinished] = useState(false)
  const [count, setCount] = useState(null)
  const pollRef = useRef(null)
  const wasRunningRef = useRef(false)
  const mountTs = useRef(Date.now())

  useEffect(() => {
    async function poll() {
      try {
        const s = await fetchRescoreStatus()
        if (s.running) {
          setRunning(true)
          wasRunningRef.current = true
        } else {
          if (wasRunningRef.current) {
            // Scoring just completed
            setRunning(false)
            setCount(s.lastCount)
            setJustFinished(true)
            wasRunningRef.current = false
            onDone?.()
            setTimeout(() => setJustFinished(false), 5000)
          } else if (s.lastTs && s.lastTs > mountTs.current) {
            // Finished between last poll interval and this one
            setCount(s.lastCount)
            setJustFinished(true)
            onDone?.()
            setTimeout(() => setJustFinished(false), 5000)
          }
          setRunning(false)
        }
      } catch { /* ignore */ }
    }

    poll()
    pollRef.current = setInterval(poll, 3000)
    return () => clearInterval(pollRef.current)
  }, [onDone])

  if (!running && !justFinished) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 16px',
      background: running
        ? 'rgba(48,197,255,0.08)'
        : 'rgba(160,203,59,0.10)',
      borderBottom: '0.5px solid rgba(0,0,0,0.08)',
      fontSize: 13,
      color: running ? 'var(--blue)' : '#5a8a1a',
    }}>
      {running ? (
        <>
          <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                display: 'inline-block',
                width: 4, height: 4, borderRadius: '50%',
                background: 'var(--blue)',
                animation: `pulse 1.2s ease-in-out ${i * 0.4}s infinite`,
              }} />
            ))}
          </span>
          Scoring your jobs…
        </>
      ) : (
        <>✓ {count != null ? `${count} jobs scored` : 'Scoring complete'} — scores updated</>
      )}
      <style>{`@keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:1} }`}</style>
    </div>
  )
}
