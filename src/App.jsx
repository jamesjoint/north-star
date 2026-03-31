import { useState } from 'react'
import { useJobs } from './hooks/useJobs.js'
import Header from './components/Header.jsx'
import FilterBar from './components/FilterBar.jsx'
import JobCard from './components/JobCard.jsx'
import JobDetail from './components/JobDetail.jsx'
import Tracker from './components/Tracker.jsx'

export default function App() {
  const { jobs, allJobs, loading, refreshing, error, lastRefreshed, filters, setFilters, refresh, updateStatus } = useJobs()
  const [selectedId, setSelectedId] = useState(null)
  const [tab, setTab] = useState('search')

  const selectedJob = allJobs.find(j => j.id === selectedId) || null
  const sources = [...new Set(allJobs.map(j => j.source))].sort()

  // Follow-up alert: tracked jobs with follow_up_date today or overdue
  const today = new Date().toISOString().slice(0, 10)
  const overdueFollowUps = allJobs.filter(
    j => j.status && j.status !== 'none' && j.follow_up_date && j.follow_up_date <= today
  )

  function handleSelect(id) {
    setSelectedId(prev => prev === id ? null : id)
  }

  const tabStyle = (t) => ({
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
    background: 'none',
    color: tab === t ? '#3b82f6' : '#6b7280',
    cursor: 'pointer',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <Header lastRefreshed={lastRefreshed} refreshing={refreshing} onRefresh={refresh} />

      {/* Follow-up alert banner */}
      {overdueFollowUps.length > 0 && (
        <div style={{
          background: '#fff7ed', borderBottom: '1px solid #fed7aa',
          padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 13, color: '#9a3412' }}>
            🔔 {overdueFollowUps.length} job{overdueFollowUps.length > 1 ? 's' : ''} need{overdueFollowUps.length === 1 ? 's' : ''} a follow-up
            {overdueFollowUps.length <= 3 && ': ' + overdueFollowUps.map(j => j.company).join(', ')}
          </span>
          <button
            onClick={() => setTab('tracker')}
            style={{
              fontSize: 12, padding: '2px 10px', borderRadius: 4,
              border: '1px solid #f97316', background: '#fff', color: '#ea580c',
              cursor: 'pointer',
            }}
          >
            Go to Tracker
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ borderBottom: '1px solid #e5e7eb', display: 'flex', padding: '0 8px', background: '#fff' }}>
        <button style={tabStyle('search')} onClick={() => setTab('search')}>Job Search</button>
        <button style={tabStyle('tracker')} onClick={() => setTab('tracker')}>
          Tracker
          {allJobs.filter(j => j.status && j.status !== 'none').length > 0 && (
            <span style={{
              marginLeft: 6, background: '#3b82f6', color: '#fff',
              borderRadius: 10, padding: '1px 6px', fontSize: 11,
            }}>
              {allJobs.filter(j => j.status && j.status !== 'none').length}
            </span>
          )}
        </button>
      </div>

      {/* Tab: Tracker */}
      {tab === 'tracker' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: 16 }}>
          <Tracker jobs={allJobs} onUpdate={updateStatus} />
        </div>
      )}

      {/* Tab: Job Search */}
      {tab === 'search' && (
        <>
          <FilterBar sources={sources} filters={filters} onChange={setFilters} />
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Job list */}
            <div style={{ flex: selectedJob ? '0 0 420px' : 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {refreshing && <p style={{ color: '#9ca3af', textAlign: 'center', marginTop: 40 }}>Loading jobs…</p>}
              {error && <p style={{ color: '#ef4444', textAlign: 'center', marginTop: 40 }}>Error: {error}</p>}
              {!refreshing && !error && jobs.length === 0 && (
                <p style={{ color: '#9ca3af', textAlign: 'center', marginTop: 40 }}>
                  hi ashley, you're a superstar and one day you won't need this
                </p>
              )}
              {jobs.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  onSelect={handleSelect}
                  selected={job.id === selectedId}
                  onStatusChange={updateStatus}
                />
              ))}
            </div>

            {/* Detail panel */}
            {selectedJob && (
              <div style={{ flex: 1, overflowY: 'auto', borderLeft: '1px solid #e5e7eb' }}>
                <JobDetail job={selectedJob} onClose={() => setSelectedId(null)} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
