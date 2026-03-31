export default function FilterBar({ sources, filters, onChange }) {
  function toggleSource(source) {
    const next = filters.sources.includes(source)
      ? filters.sources.filter(s => s !== source)
      : [...filters.sources, source]
    onChange({ ...filters, sources: next })
  }

  return (
    <div style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
      {/* Source checkboxes */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Sources</span>
        {sources.map(src => (
          <label key={src} htmlFor={`src-${src}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <input
              id={`src-${src}`}
              type="checkbox"
              checked={filters.sources.includes(src)}
              onChange={() => toggleSource(src)}
            />
            {src}
          </label>
        ))}
      </div>

      {/* Remote filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Remote</span>
        <select
          value={filters.remote}
          onChange={e => onChange({ ...filters, remote: e.target.value })}
          style={{ fontSize: 13, padding: '2px 6px', borderRadius: 4, border: '1px solid #d1d5db' }}
        >
          <option value="all">All</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
        </select>
      </div>

      {/* Min score slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Min Score</span>
        <input
          type="range"
          min={0} max={10} step={1}
          value={filters.minScore}
          onChange={e => onChange({ ...filters, minScore: Number(e.target.value) })}
        />
        <span style={{ fontSize: 13, minWidth: 16 }}>{filters.minScore}</span>
      </div>

      {/* Show expired toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#6b7280', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={!!filters.showExpired}
          onChange={e => onChange({ ...filters, showExpired: e.target.checked })}
        />
        Show expired
      </label>
    </div>
  )
}
