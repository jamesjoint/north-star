import { useState } from 'react'
import { STATUS_COLORS } from './JobCard.jsx'
import { patchJobDescription } from '../api.js'

const STATUS_OPTIONS = ['Saved', 'Applied', 'Outreach Sent', 'Interviewing', 'Offer', 'Passed', 'Not Applying', 'Expired']
const EMPTY_FORM = { url: '', title: '', company: '', location: '', status: 'Saved', description: '' }

const TRACKER_SORT_OPTIONS = [
  { value: 'applied_desc', label: 'Applied ↓' },
  { value: 'score_desc',   label: 'Score ↓' },
  { value: 'company_asc',  label: 'Company A–Z' },
]

function scoreColor(s) {
  if (s == null) return 'var(--text-3)'
  if (s >= 7) return 'var(--score-hi)'
  if (s >= 4) return 'var(--score-mid)'
  return 'var(--score-lo)'
}

const TH = {
  padding: '8px 12px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 400,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '#8e8e93',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  background: 'var(--screen)',
  borderBottom: '0.5px solid rgba(0,0,0,0.15)',
}

const TD = { padding: '10px 12px', fontSize: 14, verticalAlign: 'middle', color: '#000', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }

function computeStats(jobs) {
  const tracked = jobs.filter(j => j.status && j.status !== 'none')
  const now = new Date()
  const weekAgo  = new Date(now - 7  * 86_400_000).toISOString().slice(0, 10)
  const monthAgo = new Date(now - 30 * 86_400_000).toISOString().slice(0, 10)
  const byStatus = {}
  for (const j of tracked) byStatus[j.status] = (byStatus[j.status] || 0) + 1
  const appliedCount      = byStatus['Applied']      || 0
  const interviewingCount = byStatus['Interviewing'] || 0
  const offerCount        = byStatus['Offer']        || 0
  const appliedThisWeek   = tracked.filter(j => j.applied_date && j.applied_date >= weekAgo).length
  const appliedThisMonth  = tracked.filter(j => j.applied_date && j.applied_date >= monthAgo).length
  return { byStatus, appliedCount, interviewingCount, offerCount, appliedThisWeek, appliedThisMonth }
}

const inputStyle = {
  fontSize: 14,
  padding: '7px 10px',
  borderRadius: 9,
  border: 'none',
  background: 'rgba(0,0,0,0.06)',
  color: '#000',
  fontFamily: 'var(--font)',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
}

export default function Tracker({ jobs, onUpdate, onAddJob, onDelete, onSelect, selectedId }) {
  const [localNotes, setLocalNotes] = useState({})
  const [expandedJD, setExpandedJD] = useState(null)
  const [localJD, setLocalJD] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [trackerSort, setTrackerSort] = useState('applied_desc')
  const [showStats, setShowStats] = useState(false)

  const tracked = [...jobs]
    .filter(j => j.status && j.status !== 'none')
    .sort((a, b) => {
      switch (trackerSort) {
        case 'score_desc':   return (b.score_aggregate ?? -1) - (a.score_aggregate ?? -1)
        case 'company_asc':  return (a.company || '').localeCompare(b.company || '')
        case 'applied_desc':
        default: {
          if (!a.applied_date && !b.applied_date) return 0
          if (!a.applied_date) return 1
          if (!b.applied_date) return -1
          return b.applied_date.localeCompare(a.applied_date)
        }
      }
    })

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.url.trim() || !form.title.trim()) { setFormError('URL and Title are required.'); return }
    setSubmitting(true); setFormError(null)
    try {
      await onAddJob(form)
      setForm(EMPTY_FORM); setShowForm(false)
    } catch (err) {
      setFormError(err.message)
    } finally { setSubmitting(false) }
  }

  const STAT_STATUSES = ['Saved', 'Applied', 'Outreach Sent', 'Interviewing', 'Offer', 'Passed', 'Not Applying']
  const convRate = (num, den) => den === 0 ? '—' : `${Math.round((num / den) * 100)}%`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, overflow: 'hidden' }}>
      {/* Toolbar — iOS navigation-bar style */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'var(--screen)',
        borderBottom: '0.5px solid rgba(0,0,0,0.15)',
        flexShrink: 0,
      }}>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              fontSize: 13, padding: '6px 16px',
              borderRadius: 9, border: 'none',
              background: 'linear-gradient(180deg, #6dd4ff 0%, #30C5FF 100%)',
              color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
              boxShadow: '0 1px 0 rgba(255,255,255,0.2) inset, 0 1px 3px rgba(0,0,0,0.15)',
            }}
          >
            + Add Job
          </button>
        )}
        {!showForm && (
          <select
            value={trackerSort}
            onChange={e => setTrackerSort(e.target.value)}
            style={{
              fontSize: 13, padding: '5px 22px 5px 10px',
              borderRadius: 9, border: 'none',
              background: 'rgba(0,0,0,0.07)', color: '#000',
              fontFamily: 'var(--font)', appearance: 'none',
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%238e8e93'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
              cursor: 'pointer',
            }}
          >
            {TRACKER_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <button
          onClick={() => setShowStats(s => !s)}
          style={{
            marginLeft: 'auto', fontSize: 13,
            color: showStats ? 'var(--blue)' : '#8e8e93',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font)', fontWeight: 500,
          }}
        >
          {showStats ? 'Hide Stats' : 'Stats'}
        </button>
      </div>

      {/* Stats */}
      {showStats && (() => {
        const stats = computeStats(jobs)
        return (
          <div style={{
            padding: '14px 16px',
            background: 'var(--screen)',
            borderBottom: '0.5px solid rgba(0,0,0,0.12)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
              {STAT_STATUSES.map(s => {
                const st = STATUS_COLORS[s]
                return (
                  <div key={s} style={{ textAlign: 'center', minWidth: 48 }}>
                    <div style={{
                      fontSize: 20, fontWeight: 700,
                      color: st?.color || 'var(--text)', lineHeight: 1, marginBottom: 3,
                    }}>
                      {stats.byStatus[s] || 0}
                    </div>
                    <div style={{
                      fontSize: 9, color: 'var(--text-3)', fontWeight: 500,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      {s}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, paddingTop: 10, borderTop: '1px solid var(--divider-dim)' }}>
              {[
                [`${stats.appliedThisWeek}`, 'this week'],
                [`${stats.appliedThisMonth}`, 'this month'],
                [convRate(stats.interviewingCount, stats.appliedCount), '→ interview'],
                [convRate(stats.offerCount, stats.appliedCount), '→ offer'],
              ].map(([val, label]) => (
                <span key={label}>
                  <strong style={{ color: 'var(--blue)', fontWeight: 700 }}>{val}</strong>{' '}
                  <span style={{ color: 'var(--text-3)' }}>{label}</span>
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{
          background: '#fff', borderBottom: '0.5px solid rgba(0,0,0,0.15)',
          padding: 16, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Add job manually</span>
            <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setFormError(null) }}
              style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-3)' }}>✕</button>
          </div>
          <input type="text" placeholder="Job listing URL (required)" value={form.url}
            onChange={e => setForm(f => ({ ...f, url: e.target.value }))} style={inputStyle} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder="Job title (required)" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} />
            <input type="text" placeholder="Company" value={form.company}
              onChange={e => setForm(f => ({ ...f, company: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder="Location" value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))} style={{ ...inputStyle }} />
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              style={{ ...inputStyle, width: 'auto' }}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <textarea placeholder="Paste job description (optional)" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          {formError && <p style={{ margin: 0, fontSize: 12, color: 'var(--score-lo)' }}>{formError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={submitting} style={{
              fontSize: 13, padding: '7px 20px', borderRadius: 20,
              border: 'none', background: 'var(--blue)', color: '#fff',
              cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
              opacity: submitting ? 0.6 : 1,
            }}>
              {submitting ? 'Adding…' : 'Add job'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setFormError(null) }}
              style={{
                fontSize: 13, padding: '7px 16px', borderRadius: 20,
                border: '1px solid var(--divider)', background: 'transparent',
                color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--font)',
              }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      {tracked.length === 0 ? (
        <p style={{ color: 'var(--text-3)', textAlign: 'center', marginTop: 60, fontSize: 14, padding: '0 32px', lineHeight: 1.7 }}>
          No tracked jobs yet — use the Track… dropdown on any job to start.
        </p>
      ) : (
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Title', 'Company', 'Score', 'Status', 'Applied', 'Notes', 'JD', 'Source', ''].map(h => (
                  <th key={h} style={{ ...TH, textAlign: h === 'Score' ? 'center' : 'left', minWidth: h === 'Notes' ? 160 : undefined }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tracked.map(job => {
                const st = STATUS_COLORS[job.status]
                const notesVal = job.id in localNotes ? localNotes[job.id] : (job.notes || '')
                return (
                  <tr key={job.id} style={{ background: selectedId === job.id ? 'rgba(0,119,237,0.1)' : '#fff', transition: 'background 0.08s' }}>
                    <td style={{ ...TD, maxWidth: 240 }}>
                      <button onClick={() => onSelect?.(job.id)}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          color: selectedId === job.id ? 'var(--blue)' : 'var(--text)',
                          fontWeight: 500, fontSize: 14, textAlign: 'left', fontFamily: 'var(--font)',
                        }}>
                        {job.title}
                      </button>
                    </td>
                    <td style={TD}>{job.company}</td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: scoreColor(job.score_aggregate) }}>
                        {job.score_aggregate?.toFixed(1) ?? '—'}
                      </span>
                    </td>
                    <td style={TD}>
                      <select value={job.status} onChange={e => onUpdate(job.id, { status: e.target.value })}
                        style={{
                          fontSize: 11, padding: '2px 16px 2px 6px', borderRadius: 20,
                          border: 'none', background: st?.bg || '#f3f4f6',
                          color: st?.color || '#9ca3af', fontWeight: 600, cursor: 'pointer',
                          fontFamily: 'var(--font)', appearance: 'none',
                          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%238e8e93'/%3E%3C/svg%3E\")",
                          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center',
                        }}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={TD}>
                      <input type="date" value={job.applied_date || ''}
                        onChange={e => onUpdate(job.id, { applied_date: e.target.value })}
                        style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--divider)', background: 'var(--screen-raised)', color: 'var(--text)', fontFamily: 'var(--font)', width: 'auto' }} />
                    </td>
                    <td style={TD}>
                      <input type="text" value={notesVal} placeholder="Notes…"
                        onChange={e => setLocalNotes(prev => ({ ...prev, [job.id]: e.target.value }))}
                        onBlur={e => {
                          onUpdate(job.id, { notes: e.target.value })
                          setLocalNotes(prev => { const n = { ...prev }; delete n[job.id]; return n })
                        }}
                        style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--divider)', background: 'var(--screen-raised)', color: 'var(--text)', width: '100%', minWidth: 140, fontFamily: 'var(--font)' }} />
                    </td>
                    <td style={TD}>
                      {expandedJD === job.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <textarea autoFocus rows={5}
                            value={job.id in localJD ? localJD[job.id] : (job.description || '')}
                            onChange={e => setLocalJD(prev => ({ ...prev, [job.id]: e.target.value }))}
                            onBlur={async e => {
                              const desc = e.target.value
                              await patchJobDescription(job.id, desc).catch(console.error)
                              setLocalJD(prev => { const n = { ...prev }; delete n[job.id]; return n })
                              setExpandedJD(null); onUpdate(job.id, {})
                            }}
                            placeholder="Paste job description…"
                            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--divider)', width: 240, resize: 'vertical', fontFamily: 'var(--font)', background: 'var(--screen-raised)', color: 'var(--text)' }} />
                          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>blur to save</span>
                        </div>
                      ) : (
                        <button onClick={() => setExpandedJD(job.id)}
                          style={{
                            fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                            border: '1px solid var(--divider)',
                            background: job.description ? '#dcfce7' : 'transparent',
                            color: job.description ? '#166534' : 'var(--text-3)',
                            fontFamily: 'var(--font)', fontWeight: 500,
                          }}>
                          {job.description ? 'Has JD' : 'Paste JD'}
                        </button>
                      )}
                    </td>
                    <td style={{ ...TD, color: 'var(--text-3)', fontSize: 11 }}>{job.source}</td>
                    <td style={TD}>
                      <button onClick={() => onDelete(job.id)} title="Delete"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', fontSize: 14, padding: '2px 4px', transition: 'color 0.15s' }}
                        onMouseEnter={e => e.target.style.color = 'var(--score-lo)'}
                        onMouseLeave={e => e.target.style.color = 'var(--text-4)'}>
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
