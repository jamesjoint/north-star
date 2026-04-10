import { useState } from 'react'
import { STATUS_COLORS } from './JobCard.jsx'
import { patchJobDescription } from '../api.js'
import { jobsToCsv, downloadCsv } from '../utils/export.js'
import { computeStats, convRate } from '../utils/stats.js'
import { sortTrackerJobs } from '../utils/trackerSort.js'
import { localDateStr } from '../utils/date.js'

// Board name editor inline
function BoardTab({ board, active, onClick, onRename, onDelete, canDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(board.name)

  function commit() {
    setEditing(false)
    if (draft.trim() && draft.trim() !== board.name) onRename(board.id, draft.trim())
    else setDraft(board.name)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(board.name); setEditing(false) } }}
          style={{
            fontSize: 13, fontWeight: 500, fontFamily: 'var(--font)',
            border: 'none', borderBottom: '1.5px solid var(--blue)',
            outline: 'none', background: 'transparent',
            width: Math.max(60, draft.length * 8), padding: '0 2px',
          }}
        />
      ) : (
        <button
          onClick={onClick}
          onDoubleClick={() => setEditing(true)}
          style={{
            fontSize: 13, fontWeight: active ? 600 : 400,
            color: active ? 'var(--text)' : 'var(--text-3)',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font)', padding: '4px 10px 4px 10px',
            position: 'relative',
          }}
        >
          {board.emoji && <span style={{ marginRight: 4 }}>{board.emoji}</span>}
          {board.name}
          {board.job_count > 0 && (
            <span style={{
              marginLeft: 5, fontSize: 10, fontWeight: 700,
              color: active ? 'var(--blue)' : 'var(--text-4)',
              background: active ? 'rgba(48,197,255,0.12)' : 'rgba(0,0,0,0.06)',
              borderRadius: 10, padding: '1px 5px',
            }}>{board.job_count}</span>
          )}
          {active && (
            <span style={{
              position: 'absolute', bottom: -1, left: 4, right: 4,
              height: 2, background: 'var(--blue)', borderRadius: 2,
            }} />
          )}
        </button>
      )}
      {active && canDelete && (
        <button
          onClick={() => onDelete(board.id)}
          title="Delete board"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: 'var(--text-4)', padding: '0 4px',
            lineHeight: 1,
          }}
        >✕</button>
      )}
    </div>
  )
}

const STATUS_OPTIONS = ['Saved', 'Applied', 'Outreach Sent', 'Interviewing', 'Offer', 'Passed', 'Not Applying', 'Expired']
const EMPTY_FORM = { url: '', title: '', company: '', location: '', status: 'Saved', description: '' }

const TRACKER_SORT_OPTIONS = [
  { value: 'applied_desc',  label: 'Applied ↓' },
  { value: 'followup_asc',  label: 'Follow-up ↑' },
  { value: 'score_desc',    label: 'Score ↓' },
  { value: 'company_asc',   label: 'Company A–Z' },
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

export default function Tracker({ jobs, onUpdate, onAddJob, onDelete, onSelect, selectedId, boards = [], activeBoardId, onSelectBoard, onCreateBoard, onRenameBoard, onDeleteBoard }) {
  const [localNotes, setLocalNotes] = useState({})
  const [localSalary, setLocalSalary] = useState({})
  const [expandedJD, setExpandedJD] = useState(null)
  const [localJD, setLocalJD] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [trackerSort, setTrackerSort] = useState('applied_desc')
  const [showStats, setShowStats] = useState(false)
  const [creatingBoard, setCreatingBoard] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')

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

  function handleCreateBoard(e) {
    e.preventDefault()
    if (!newBoardName.trim()) return
    onCreateBoard?.(newBoardName.trim())
    setNewBoardName('')
    setCreatingBoard(false)
  }

  // Filter tracked jobs to active board (null = all boards)
  const tracked = sortTrackerJobs(
    jobs.filter(j => j.status && j.status !== 'none').filter(j => !activeBoardId || j.board_id === activeBoardId),
    trackerSort
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, overflow: 'hidden' }}>

      {/* Board tabs */}
      {boards.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: '0 12px',
          background: '#fff',
          borderBottom: '0.5px solid rgba(0,0,0,0.15)',
          flexShrink: 0, overflowX: 'auto',
        }}>
          {/* "All" pseudo-tab */}
          <button
            onClick={() => onSelectBoard?.(null)}
            style={{
              fontSize: 13, fontWeight: activeBoardId == null ? 600 : 400,
              color: activeBoardId == null ? 'var(--text)' : 'var(--text-3)',
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font)', padding: '8px 10px',
              position: 'relative', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            All
            {activeBoardId == null && (
              <span style={{
                position: 'absolute', bottom: -1, left: 4, right: 4,
                height: 2, background: 'var(--blue)', borderRadius: 2,
              }} />
            )}
          </button>

          {boards.map(b => (
            <BoardTab
              key={b.id}
              board={b}
              active={activeBoardId === b.id}
              onClick={() => onSelectBoard?.(b.id)}
              onRename={(id, name) => onRenameBoard?.(id, name)}
              onDelete={(id) => onDeleteBoard?.(id)}
              canDelete={boards.length > 1}
            />
          ))}

          {creatingBoard ? (
            <form onSubmit={handleCreateBoard} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px' }}>
              <input
                autoFocus
                value={newBoardName}
                onChange={e => setNewBoardName(e.target.value)}
                placeholder="Board name"
                onBlur={() => { setCreatingBoard(false); setNewBoardName('') }}
                onKeyDown={e => e.key === 'Escape' && (setCreatingBoard(false), setNewBoardName(''))}
                style={{
                  fontSize: 12, padding: '3px 8px', borderRadius: 6,
                  border: '1px solid var(--blue)', outline: 'none',
                  fontFamily: 'var(--font)', width: 100,
                }}
              />
            </form>
          ) : (
            <button
              onClick={() => setCreatingBoard(true)}
              title="New board"
              style={{
                fontSize: 16, lineHeight: 1,
                color: 'var(--text-4)', background: 'none', border: 'none',
                cursor: 'pointer', padding: '4px 6px', flexShrink: 0,
              }}
            >+</button>
          )}
        </div>
      )}

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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {tracked.length > 0 && (
            <button
              onClick={() => downloadCsv(jobsToCsv(tracked))}
              title="Export tracked jobs to CSV"
              style={{
                fontSize: 12, color: '#8e8e93',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              Export CSV
            </button>
          )}
          <button
            onClick={() => setShowStats(s => !s)}
            style={{
              fontSize: 13,
              color: showStats ? 'var(--blue)' : '#8e8e93',
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font)', fontWeight: 500,
            }}
          >
            {showStats ? 'Hide Stats' : 'Stats'}
          </button>
        </div>
      </div>

      {/* Stats */}
      {showStats && (() => {
        const stats = computeStats(tracked)
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
                {['Title', 'Company', 'Score', 'Status', ...(boards.length > 1 ? ['Board'] : []), 'Applied', 'Follow-up', 'Salary', 'Notes', 'JD', 'Source', 'Link', ''].map(h => (
                  <th key={h} style={{ ...TH, textAlign: h === 'Score' ? 'center' : 'left', minWidth: h === 'Notes' ? 160 : undefined }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
              const today = localDateStr(new Date())
              return tracked.map(job => {
                const st = STATUS_COLORS[job.status]
                const notesVal = job.id in localNotes ? localNotes[job.id] : (job.notes || '')
                const followUpOverdue = job.follow_up_date && job.follow_up_date < today
                return (
                  <tr key={job.id} style={{ background: selectedId === job.id ? 'rgba(0,119,237,0.1)' : followUpOverdue ? 'rgba(250,183,31,0.06)' : '#fff', transition: 'background 0.08s' }}>
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
                    {boards.length > 1 && (
                      <td style={TD}>
                        <select
                          value={job.board_id || ''}
                          onChange={e => onUpdate(job.id, { board_id: e.target.value })}
                          style={{
                            fontSize: 11, padding: '2px 18px 2px 6px', borderRadius: 20,
                            border: 'none', background: 'rgba(0,0,0,0.06)',
                            color: '#3c3c43', fontWeight: 500, cursor: 'pointer',
                            fontFamily: 'var(--font)', appearance: 'none',
                            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%238e8e93'/%3E%3C/svg%3E\")",
                            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center',
                          }}
                        >
                          {boards.map(b => (
                            <option key={b.id} value={b.id}>{b.emoji ? `${b.emoji} ${b.name}` : b.name}</option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td style={TD}>
                      <input type="date" value={job.applied_date || ''}
                        onChange={e => onUpdate(job.id, { applied_date: e.target.value })}
                        style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--divider)', background: 'var(--screen-raised)', color: 'var(--text)', fontFamily: 'var(--font)', width: 'auto' }} />
                    </td>
                    <td style={TD}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {followUpOverdue && (
                          <span title="Follow-up overdue" style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: '#EC5298', borderRadius: 4, padding: '1px 4px', letterSpacing: '0.04em', flexShrink: 0 }}>DUE</span>
                        )}
                        <input type="date" value={job.follow_up_date || ''}
                          onChange={e => onUpdate(job.id, { follow_up_date: e.target.value || null })}
                          style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: `1px solid ${followUpOverdue ? '#EC5298' : 'var(--divider)'}`, background: followUpOverdue ? 'rgba(236,82,152,0.08)' : job.follow_up_date ? 'rgba(250,183,31,0.12)' : 'var(--screen-raised)', color: followUpOverdue ? '#EC5298' : job.follow_up_date ? '#854d0e' : 'var(--text)', fontFamily: 'var(--font)', width: 'auto' }} />
                      </div>
                    </td>
                    <td style={TD}>
                      <input type="text"
                        value={job.id in localSalary ? localSalary[job.id] : (job.salary_range || '')}
                        placeholder="e.g. $120k–$150k"
                        onChange={e => setLocalSalary(prev => ({ ...prev, [job.id]: e.target.value }))}
                        onBlur={e => {
                          onUpdate(job.id, { salary_range: e.target.value || null })
                          setLocalSalary(prev => { const n = { ...prev }; delete n[job.id]; return n })
                        }}
                        style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--divider)', background: 'var(--screen-raised)', color: 'var(--text)', width: 110, fontFamily: 'var(--font)' }} />
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
                      {job.url && (
                        <a href={job.url} target="_blank" rel="noopener noreferrer"
                          title="Open job listing"
                          style={{
                            display: 'inline-flex', alignItems: 'center',
                            color: 'var(--blue)', opacity: 0.7,
                            textDecoration: 'none', fontSize: 13,
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                            <path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            <path d="M10 2h4v4M14 2 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </a>
                      )}
                    </td>
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
              })
            })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
