const DIMENSION_LABELS = {
  core_mechanism: 'Core Mechanism',
  product_depth: 'Product Depth',
  regulated_complexity: 'Regulated Complexity',
  bd_track_record: 'BD Track Record',
  mba_preference: 'MBA Preference',
  domain_gap: 'Domain Gap',
  gap_bridgeability: 'Gap Bridgeability',
}

const DIMENSION_ORDER = Object.keys(DIMENSION_LABELS)

export default function JobDetail({ job, onClose }) {
  let dims = {}
  if (job.score_dimensions) {
    try {
      dims = JSON.parse(job.score_dimensions)
    } catch {
      dims = {}
    }
  }
  const summary = dims.summary || null

  return (
    <div style={{ padding: 20, borderLeft: '1px solid #e5e7eb', overflowY: 'auto', height: '100%' }}>
      <button
        onClick={onClose}
        style={{ float: 'right', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280' }}
        aria-label="close"
      >
        ✕
      </button>

      <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>{job.title}</h2>
      <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 14 }}>
        {job.company} · {job.location} · {job.source}
      </p>

      <a
        href={job.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 13, color: '#3b82f6' }}
      >
        View listing →
      </a>

      {summary && (
        <p style={{ marginTop: 16, padding: 12, background: '#f0fdf4', borderRadius: 6, fontSize: 13, lineHeight: 1.5 }}>
          {summary}
        </p>
      )}

      <div style={{ marginTop: 20 }}>
        <strong style={{ fontSize: 13, color: '#374151' }}>Fit Score: {job.score_aggregate?.toFixed(1) ?? '–'} / 10</strong>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {DIMENSION_ORDER.map(key => {
            const d = dims[key]
            if (!d) return null
            const pct = (d.score / 10) * 100
            const barColor = d.score >= 7 ? '#22c55e' : d.score >= 4 ? '#eab308' : '#ef4444'
            return (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{DIMENSION_LABELS[key]}</span>
                  <span style={{ color: '#6b7280' }}>{d.score} / 10</span>
                </div>
                <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                </div>
                {d.reasoning && (
                  <p style={{ margin: '3px 0 0', fontSize: 11, color: '#9ca3af', lineHeight: 1.4 }}>{d.reasoning}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
