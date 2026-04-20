import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext.jsx'
import { useJobs } from './hooks/useJobs.js'
import { useBoards } from './hooks/useBoards.js'
import Header from './components/Header.jsx'
import FilterBar from './components/FilterBar.jsx'
import JobCard from './components/JobCard.jsx'
import JobDetail from './components/JobDetail.jsx'
import Tracker from './components/Tracker.jsx'
import Settings from './components/Settings.jsx'
import Profile from './components/Profile.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import ScoreBanner from './components/ScoreBanner.jsx'

export default function App() {
  const { user, firstName } = useAuth()
  const {
    jobs, allJobs, unseenCount, loading, refreshing, error, lastRefreshed,
    filters, setFilters, refresh, reloadJobs, reloadProfile, updateStatus, markSeen, addJob, removeJob,
    savedWeights, liveWeights, setLiveWeights, saveWeights, profileDimensions,
  } = useJobs()
  const {
    boards, activeBoardId, setActiveBoardId,
    createBoard, renameBoard, deleteBoard: deleteBoardHook, reloadBoards,
  } = useBoards()

  // After any tracker status change, refresh board counts
  const updateStatusAndRefreshBoards = useCallback(async (id, updates) => {
    await updateStatus(id, updates)
    reloadBoards()
  }, [updateStatus, reloadBoards])

  const addJobAndRefreshBoards = useCallback(async (data) => {
    const job = await addJob(data)
    reloadBoards()
    return job
  }, [addJob, reloadBoards])
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const TAB_PATHS = { search: '/', tracker: '/tracker', settings: '/settings', profile: '/profile', admin: '/admin' }
  const PATH_TABS = Object.fromEntries(Object.entries(TAB_PATHS).map(([k, v]) => [v, k]))
  const tab = PATH_TABS[pathname] ?? 'search'
  function setTab(t) { navigate(TAB_PATHS[t] ?? '/') }

  const [selectedId, setSelectedId] = useState(null)
  const [passingId, setPassingId] = useState(null)

  const selectedJob = allJobs.find(j => j.id === selectedId) || null
  const sources = [...new Set(allJobs.map(j => j.source))].sort()
  const sourceCounts = allJobs.reduce((acc, j) => {
    if (j.source) acc[j.source] = (acc[j.source] || 0) + 1
    return acc
  }, {})
  const trackedCount = allJobs.filter(j => j.status && j.status !== 'none').length

  // Auto-select first Radar job on load
  useEffect(() => {
    if (tab === 'search' && !selectedId && jobs.length > 0) {
      setSelectedId(jobs[0].id)
    }
  }, [tab, selectedId, jobs]) // eslint-disable-line

  function handleSelect(id) {
    setSelectedId(prev => prev === id ? null : id)
    if (id) markSeen(id)
  }

  function handleNotApplying(jobId) {
    const idx = jobs.findIndex(j => j.id === jobId)
    const nextJob = jobs[idx + 1] || jobs[idx - 1] || null
    setPassingId(jobId)
    setTimeout(() => {
      updateStatus(jobId, { status: 'Not Applying' })
      setSelectedId(nextJob ? nextJob.id : null)
      setPassingId(null)
    }, 350)
  }

  function handleAddToConstellation(jobId) {
    updateStatusAndRefreshBoards(jobId, { status: 'Saved' })
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      fontFamily: 'var(--font)',
      background: 'var(--screen)',
    }}>
      <Header
        tab={tab}
        setTab={setTab}
        trackedCount={trackedCount}
        unseenCount={unseenCount}
        refreshing={refreshing}
        onRefresh={refresh}
      />

      {/* ── Content area ── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Tracker / Constellation */}
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
                jobs={allJobs} onUpdate={updateStatusAndRefreshBoards} onAddJob={addJobAndRefreshBoards}
                onDelete={removeJob} onSelect={handleSelect} selectedId={selectedId}
                boards={boards}
                activeBoardId={activeBoardId}
                onSelectBoard={setActiveBoardId}
                onCreateBoard={createBoard}
                onRenameBoard={renameBoard}
                onDeleteBoard={deleteBoardHook}
              />
            </div>
            {selectedJob && (
              <div style={{ width: 380, flexShrink: 0, overflowY: 'auto', position: 'relative' }}>
                <button
                  onClick={() => setSelectedId(null)}
                  style={{
                    position: 'absolute', top: 12, right: 12, zIndex: 10,
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 18, color: '#999', lineHeight: 1, padding: 4,
                  }}
                  aria-label="Close"
                >×</button>
                <JobDetail
                  key={selectedJob.id}
                  job={selectedJob}
                />
              </div>
            )}
          </div>
        )}

        {/* Settings — always mounted so weights load before user navigates here */}
        <div style={{
          flex: 1, overflowY: 'auto', background: 'var(--screen)',
          display: tab === 'settings' ? 'block' : 'none',
        }}>
          <Settings
            liveWeights={liveWeights}
            setLiveWeights={setLiveWeights}
            savedWeights={savedWeights}
            saveWeights={saveWeights}
            profileDimensions={profileDimensions}
          />
        </div>

        {/* Profile */}
        {tab === 'profile' && (
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--screen)' }}>
            <Profile
              onBack={() => navigate(-1)}
              onGoToSettings={() => setTab('settings')}
              onProfileChange={reloadProfile}
            />
          </div>
        )}

        {/* Admin */}
        {tab === 'admin' && (
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--screen)' }}>
            <AdminPanel onBack={() => navigate(-1)} />
          </div>
        )}

        {/* Job Search / Radar */}
        {tab === 'search' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <FilterBar sources={sources} sourceCounts={sourceCounts} filters={filters} onChange={setFilters} />
            <ScoreBanner onDone={reloadJobs} />
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

              {/* Left list — always 300px */}
              <div style={{
                width: 300,
                flexShrink: 0,
                borderRight: '0.5px solid rgba(0,0,0,0.08)',
                overflowY: 'auto',
                background: '#fff',
                display: 'flex',
                flexDirection: 'column',
              }}>
                {/* "All Radar — N roles" counter */}
                <div style={{
                  padding: '12px 20px 8px',
                  borderBottom: '0.5px solid rgba(0,0,0,0.08)',
                  flexShrink: 0,
                }}>
                  <span style={{
                    fontSize: 10, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: '#999',
                  }}>
                    All Radar — {jobs.length} roles
                  </span>
                </div>

                {refreshing && (
                  <p style={{ color: '#999', textAlign: 'center', marginTop: 48, fontSize: 13 }}>
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
                    color: '#999', textAlign: 'center', marginTop: 60,
                    fontSize: 14, padding: '0 24px', lineHeight: 1.6,
                  }}>
                    hey {firstName || 'you'}, you're a superstar and someday you won't need this
                  </p>
                )}
                {jobs.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    compact
                    selected={job.id === selectedId}
                    passing={job.id === passingId}
                    onSelect={handleSelect}
                  />
                ))}
              </div>

              {/* Right detail — always flex:1 */}
              <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                {selectedJob ? (
                  <JobDetail
                    key={selectedJob.id}
                    job={selectedJob}
                    onAddToConstellation={handleAddToConstellation}
                    onNotApplying={handleNotApplying}
                  />
                ) : (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '100%', color: '#999', fontSize: 13,
                  }}>
                    Select a role
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  )
}
