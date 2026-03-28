export default function JobCard({ job, onSelect, selected }) {
  const score = job.score_aggregate
  const scoreColor = score === null ? '#888'
    : score >= 7 ? '#22c55e'
    : score >= 4 ? '#eab308'
    : '#ef4444'

  const remoteBadge = {
    remote: { label: 'Remote', bg: '#dcfce7', color: '#166534' },
    hybrid: { label: 'Hybrid', bg: '#fef9c3', color: '#854d0e' },
    onsite: { label: 'On-site', bg: '#fee2e2', color: '#991b1b' },
  }[job.remote] || { label: job.remote, bg: '#f3f4f6', color: '#374151' }

  return (
    <article
      role="article"
      onClick={() => onSelect?.(job.id)}
      style={{
        border: selected ? '2px solid #3b82f6' : '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '12px 16px',
        cursor: 'pointer',
        background: selected ? '#eff6ff' : '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Score badge */}
      <div style={{
        minWidth: 44, height: 44, borderRadius: '50%',
        background: scoreColor, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 14,
      }}>
        {score !== null ? score.toFixed(1) : '–'}
      </div>

      {/* Main content */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 15 }}>{job.title}</strong>
          {!job.seen && (
            <span style={{ background: '#3b82f6', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>
              New
            </span>
          )}
        </div>
        <div style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>
          {job.company} · {job.location}
        </div>
      </div>

      {/* Right badges */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span style={{ background: remoteBadge.bg, color: remoteBadge.color, borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
          {remoteBadge.label}
        </span>
        <span style={{ color: '#9ca3af', fontSize: 11 }}>
          {job.source}
        </span>
      </div>
    </article>
  )
}
