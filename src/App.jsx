import { useState } from 'react'
import { useJobs } from './hooks/useJobs.js'
import Header from './components/Header.jsx'
import FilterBar from './components/FilterBar.jsx'
import JobCard from './components/JobCard.jsx'
import JobDetail from './components/JobDetail.jsx'

export default function App() {
  const { jobs, allJobs, loading, refreshing, error, lastRefreshed, filters, setFilters, refresh } = useJobs()
  const [selectedId, setSelectedId] = useState(null)

  const selectedJob = allJobs.find(j => j.id === selectedId) || null
  const sources = [...new Set(allJobs.map(j => j.source))].sort()

  function handleSelect(id) {
    setSelectedId(prev => prev === id ? null : id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <Header lastRefreshed={lastRefreshed} refreshing={refreshing} onRefresh={refresh} />
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
    </div>
  )
}
