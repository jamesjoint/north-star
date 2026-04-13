import { useState, useCallback } from 'react'
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
  const { user } = useAuth()
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

  const selectedJob = allJobs.find(j => j.id === selectedId) || null
  const sources = [...new Set(allJobs.map(j => j.source))].sort()
  const sourceCounts = allJobs.reduce((acc, j) => {
    if (j.source) acc[j.source] = (acc[j.source] || 0) + 1
    return acc
  }, {})
  const trackedCount = allJobs.filter(j => j.status && j.status !== 'none').length

  function handleSelect(id) {
    setSelectedId(prev => prev === id ? null : id)
    if (id) markSeen(id)
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
            {selectedJob && (() => {
              const trackedList = allJobs.filter(j => j.status && j.status !== 'none')
              const idx = trackedList.findIndex(j => j.id === selectedId)
              return (
                <div style={{ width: 380, flexShrink: 0, overflowY: 'auto' }}>
                  <JobDetail
                    job={selectedJob}
                    onClose={() => setSelectedId(null)}
                    onStatusChange={updateStatusAndRefreshBoards}
                    onPrev={idx > 0 ? () => setSelectedId(trackedList[idx - 1].id) : null}
                    onNext={idx < trackedList.length - 1 ? () => setSelectedId(trackedList[idx + 1].id) : null}
                  />
                </div>
              )
            })()}
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

        {/* Job Search */}
        {tab === 'search' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <FilterBar sources={sources} sourceCounts={sourceCounts} filters={filters} onChange={setFilters} />
            <ScoreBanner onDone={reloadJobs} />
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* List */}
              <div style={{
                flex: selectedJob ? '0 0 380px' : 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--screen)',
              }}>
                <div style={{
                  padding: '8px 16px 4px',
                  borderBottom: '0.5px solid rgba(0,0,0,0.12)',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  background: 'var(--screen)',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>All Radar</span>
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
                    No jobs match your filters. Try adjusting them above, or refresh to scan for new listings.
                  </p>
                )}
                {jobs.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onSelect={handleSelect}
                    selected={job.id === selectedId}
                    onStatusChange={updateStatusAndRefreshBoards}
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
                      onStatusChange={updateStatusAndRefreshBoards}
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
