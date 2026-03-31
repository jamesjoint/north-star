import { useState } from 'react'
import { STATUS_COLORS } from './JobCard.jsx'

const STATUS_OPTIONS = ['Saved', 'Applied', 'Outreach Sent', 'Interviewing', 'Offer', 'Passed']

const TH = {
  padding: '8px 12px', textAlign: 'left', fontSize: 12,
  fontWeight: 600, color: '#6b7280', textTransform: 'uppercase',
  whiteSpace: 'nowrap', position: 'sticky', top: 0,
  background: '#f9fafb', borderBottom: '2px solid #e5e7eb',
}
const TD = { padding: '8px 12px', fontSize: 13, verticalAlign: 'middle' }

function scoreColor(s) {
  if (s == null) return '#9ca3af'
  if (s >= 7) return '#22c55e'
  if (s >= 4) return '#eab308'
  return '#ef4444'
}

export default function Tracker({ jobs, onUpdate }) {
  const today = new Date().toISOString().slice(0, 10)
  const [localNotes, setLocalNotes] = useState({})

  const tracked = [...jobs]
    .filter(j => j.status && j.status !== 'none')
    .sort((a, b) => {
      if (!a.applied_date && !b.applied_date) return 0
      if (!a.applied_date) return 1
      if (!b.applied_date) return -1
      return b.applied_date.localeCompare(a.applied_date)
    })

  if (tracked.length === 0) {
    return (
      <p style={{ color: '#9ca3af', textAlign: 'center', marginTop: 60, fontSize: 14 }}>
        No tracked jobs yet — use the Track… dropdown on any job card to start tracking.
      </p>
    )
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={TH}>Title</th>
            <th style={TH}>Company</th>
            <th style={{ ...TH, textAlign: 'center' }}>Score</th>
            <th style={TH}>Status</th>
            <th style={TH}>Applied</th>
            <th style={TH}>Follow-up</th>
            <th style={{ ...TH, minWidth: 200 }}>Notes</th>
            <th style={TH}>Source</th>
          </tr>
        </thead>
        <tbody>
          {tracked.map(job => {
            const st = STATUS_COLORS[job.status]
            const followupOverdue = job.follow_up_date && job.follow_up_date <= today
            const notesVal = job.id in localNotes ? localNotes[job.id] : (job.notes || '')

            return (
              <tr key={job.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ ...TD, maxWidth: 260 }}>
                  <a href={job.url} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#1d4ed8', textDecoration: 'none', fontWeight: 500 }}
                    onClick={e => e.stopPropagation()}>
                    {job.title}
                  </a>
                </td>

                <td style={TD}>{job.company}</td>

                <td style={{ ...TD, textAlign: 'center' }}>
                  <span style={{ fontWeight: 700, color: scoreColor(job.score_aggregate) }}>
                    {job.score_aggregate?.toFixed(1) ?? '–'}
                  </span>
                </td>

                <td style={TD}>
                  <select
                    value={job.status}
                    onChange={e => onUpdate(job.id, { status: e.target.value })}
                    style={{
                      fontSize: 12, padding: '3px 6px', borderRadius: 4, border: 'none',
                      background: st?.bg || '#f3f4f6', color: st?.color || '#374151',
                      fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>

                <td style={TD}>
                  <input
                    type="date"
                    value={job.applied_date || ''}
                    onChange={e => onUpdate(job.id, { applied_date: e.target.value })}
                    style={{ fontSize: 12, padding: '2px 4px', borderRadius: 4, border: '1px solid #e5e7eb' }}
                  />
                </td>

                <td style={TD}>
                  <input
                    type="date"
                    value={job.follow_up_date || ''}
                    onChange={e => onUpdate(job.id, { follow_up_date: e.target.value })}
                    style={{
                      fontSize: 12, padding: '2px 4px', borderRadius: 4,
                      border: `1px solid ${followupOverdue ? '#ea580c' : '#e5e7eb'}`,
                      color: followupOverdue ? '#ea580c' : undefined,
                      fontWeight: followupOverdue ? 600 : undefined,
                    }}
                  />
                </td>

                <td style={TD}>
                  <input
                    type="text"
                    value={notesVal}
                    placeholder="Add notes…"
                    onChange={e => setLocalNotes(prev => ({ ...prev, [job.id]: e.target.value }))}
                    onBlur={e => {
                      onUpdate(job.id, { notes: e.target.value })
                      setLocalNotes(prev => { const n = { ...prev }; delete n[job.id]; return n })
                    }}
                    style={{
                      fontSize: 12, padding: '3px 6px', borderRadius: 4,
                      border: '1px solid #e5e7eb', width: '100%', minWidth: 180,
                    }}
                  />
                </td>

                <td style={{ ...TD, color: '#9ca3af' }}>{job.source}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
