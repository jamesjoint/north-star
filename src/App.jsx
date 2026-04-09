import { useState } from 'react'
import { useJobs } from './hooks/useJobs.js'
import Header from './components/Header.jsx'
import FilterBar from './components/FilterBar.jsx'
import JobCard from './components/JobCard.jsx'
import JobDetail from './components/JobDetail.jsx'
import Tracker from './components/Tracker.jsx'
import Settings from './components/Settings.jsx'

const TAB_ICONS = {
  search:   '♪',
  tracker:  '☰',
  settings: '⚙',
}

export default function App() {
  const {
    jobs, allJobs, loading, refreshing, error, lastRefreshed,
    filters, setFilters, refresh, updateStatus, addJob, removeJob,
    savedWeights, liveWeights, setLiveWeights, saveWeights,
  } = useJobs()
  const [selectedId, setSelectedId] = useState(null)
  const [tab, setTab] = useState('search')

  const selectedJob = allJobs.find(j => j.id === selectedId) || null
  const sources = [...new Set(allJobs.map(j => j.source))].sort()
  const trackedCount = allJobs.filter(j => j.status && j.status !== 'none').length

  function handleSelect(id) {
    setSelectedId(prev => prev === id ? null : id)
  }

  function tabBtn(t, label) {
    const active = tab === t
    return (
      <button
        key={t}
        onClick={() => setTab(t)}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          height: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: active ? 'var(--blue)' : '#9d9da0',
          transition: 'color 0.12s',
          padding: '4px 0 3px',
          fontFamily: 'var(--font)',
        }}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>{TAB_ICONS[t]}</span>
        <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, letterSpacing: '0.01em', position: 'relative' }}>
          {label}
          {t === 'tracker' && trackedCount > 0 && (
            <span style={{
              marginLeft: 4,
              background: 'var(--blue)',
              color: '#fff',
              borderRadius: 10,
              padding: '0 5px',
              fontSize: 9,
              fontWeight: 700,
            }}>
              {trackedCount}
            </span>
          )}
        </span>
      </button>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      fontFamily: 'var(--font)',
      background: 'var(--chrome)',
    }}>
      <Header lastRefreshed={lastRefreshed} refreshing={refreshing} onRefresh={refresh} />

      {/* ── Tab bar — iOS aluminum style ── */}
      <div style={{
        height: 49,
        background: 'linear-gradient(180deg, #f0f0f0 0%, #d2d2d2 100%)',
        borderBottom: '1px solid #a8a8a8',
        display: 'flex',
        flexShrink: 0,
        boxShadow: '0 1px 0 rgba(255,255,255,0.8) inset',
      }}>
        {tabBtn('search', 'Jobs')}
        {tabBtn('tracker', 'Tracker')}
        {tabBtn('settings', 'Settings')}
      </div>

      {/* ── Screen area ── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--screen)',
        /* Inset border shadow for "LCD inside bezel" depth */
        boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.08)',
      }}>

        {/* Tracker */}
        {tab === 'tracker' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{
              display: 'flex', flexDirection: 'column',
              flex: selectedJob ? '0 0 auto' : 1,
              overflow: 'hidden', padding: 16, minWidth: 0,
              width: selectedJob ? 'calc(100% - 380px)' : '100%',
              background: 'var(--screen)',
            }}>
              <Tracker
                jobs={allJobs} onUpdate={updateStatus} onAddJob={addJob}
                onDelete={removeJob} onSelect={handleSelect} selectedId={selectedId}
              />
            </div>
            {selectedJob && (() => {
              const trackedList = allJobs.filter(j => j.status && j.status !== 'none')
              const idx = trackedList.findIndex(j => j.id === selectedId)
              return (
                <div style={{ width: 380, flexShrink: 0, overflowY: 'auto' }}>
                  <JobDetail
                    job={selectedJob}
                    onClose={() => setSelectedId(null)}
                    onStatusChange={updateStatus}
                    onPrev={idx > 0 ? () => setSelectedId(trackedList[idx - 1].id) : null}
                    onNext={idx < trackedList.length - 1 ? () => setSelectedId(trackedList[idx + 1].id) : null}
                  />
                </div>
              )
            })()}
          </div>
        )}

        {/* Settings — always mounted so weights load before user navigates here */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--screen)', display: tab === 'settings' ? 'block' : 'none' }}>
          <Settings
            liveWeights={liveWeights}
            setLiveWeights={setLiveWeights}
            savedWeights={savedWeights}
            saveWeights={saveWeights}
          />
        </div>

        {/* Job Search */}
        {tab === 'search' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <FilterBar sources={sources} filters={filters} onChange={setFilters} />
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* List — white cell background */}
              <div style={{
                flex: selectedJob ? '0 0 380px' : 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--screen)',
              }}>
                {/* List header — iOS section header style */}
                <div style={{
                  padding: '8px 16px 4px',
                  borderBottom: '0.5px solid rgba(0,0,0,0.12)',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  background: 'var(--screen)',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>All Jobs</span>
                  <span style={{ fontSize: 12, color: 'var(--text-4)' }}>{jobs.length}</span>
                </div>

                {refreshing && (
                  <p style={{ color: 'var(--text-3)', textAlign: 'center', marginTop: 48, fontSize: 13 }}>
                    Scanning…
                  </p>
                )}
                {error && (
                  <p style={{ color: 'var(--score-lo)', textAlign: 'center', marginTop: 48, fontSize: 13 }}>
                    Error: {error}
                  </p>
                )}
                {!refreshing && !error && jobs.length === 0 && (
                  <p style={{
                    color: 'var(--text-3)', textAlign: 'center', marginTop: 60,
                    fontSize: 14, padding: '0 32px', lineHeight: 1.6,
                  }}>
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
                    onDelete={removeJob}
                  />
                ))}
              </div>

              {/* Detail */}
              {selectedJob && (() => {
                const idx = jobs.findIndex(j => j.id === selectedId)
                return (
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    <JobDetail
                      job={selectedJob}
                      onClose={() => setSelectedId(null)}
                      onStatusChange={updateStatus}
                      onPrev={idx > 0 ? () => setSelectedId(jobs[idx - 1].id) : null}
                      onNext={idx < jobs.length - 1 ? () => setSelectedId(jobs[idx + 1].id) : null}
                    />
                  </div>
                )
              })()}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
