const STATUS_FILTER_OPTIONS = [
  { value: 'all',           label: 'All' },
  { value: 'untracked',     label: 'Untracked' },
  { value: 'Saved',         label: 'Saved' },
  { value: 'Applied',       label: 'Applied' },
  { value: 'Outreach Sent', label: 'Outreach' },
  { value: 'Interviewing',  label: 'Interviewing' },
  { value: 'Offer',         label: 'Offer' },
  { value: 'Passed',        label: 'Passed' },
  { value: 'Not Applying',  label: 'Not Applying' },
  { value: 'Expired',       label: 'Expired' },
]

/* Shared inset-style select for iOS feel */
const iosSelect = {
  fontSize: 13,
  padding: '5px 22px 5px 10px',
  borderRadius: 9,
  border: 'none',
  background: 'rgba(0,0,0,0.07)',
  color: '#000',
  fontFamily: 'var(--font)',
  appearance: 'none',
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%238e8e93'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 8px center',
  cursor: 'pointer',
  outline: 'none',
  WebkitAppearance: 'none',
}

export default function FilterBar({ sources, filters, onChange }) {
  return (
    <div style={{
      background: 'var(--screen)',
      borderBottom: '0.5px solid rgba(0,0,0,0.15)',
      padding: '8px 12px',
      display: 'flex',
      flexWrap: 'wrap',
      gap: 7,
      alignItems: 'center',
    }}>

      {/* Sort */}
      <select
        value={filters.sort}
        onChange={e => onChange({ ...filters, sort: e.target.value })}
        style={iosSelect}
      >
        <option value="score_desc">Score ↓</option>
        <option value="score_asc">Score ↑</option>
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="company_asc">Company A–Z</option>
      </select>

      {/* Remote */}
      <select
        value={filters.remote}
        onChange={e => onChange({ ...filters, remote: e.target.value })}
        style={iosSelect}
      >
        <option value="all">All locations</option>
        <option value="remote">Remote</option>
        <option value="hybrid">Hybrid</option>
        <option value="onsite">On-site</option>
      </select>

      {/* Status */}
      <select
        value={filters.statusFilter}
        onChange={e => onChange({ ...filters, statusFilter: e.target.value })}
        style={iosSelect}
      >
        {STATUS_FILTER_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Location — iOS search-field style */}
      <input
        type="text"
        placeholder="Location…"
        value={filters.location || ''}
        onChange={e => onChange({ ...filters, location: e.target.value })}
        style={{
          fontSize: 13,
          padding: '5px 10px',
          borderRadius: 9,
          border: 'none',
          background: 'rgba(0,0,0,0.07)',
          color: '#000',
          fontFamily: 'var(--font)',
          width: 100,
          outline: 'none',
        }}
      />

      {/* Min score */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#8e8e93', whiteSpace: 'nowrap' }}>Min</span>
        <input
          type="range" min={0} max={10} step={1}
          value={filters.minScore}
          onChange={e => onChange({ ...filters, minScore: Number(e.target.value) })}
          style={{ width: 60, accentColor: 'var(--blue)' }}
        />
        <span style={{ fontSize: 12, color: '#8e8e93', minWidth: 14 }}>
          {filters.minScore || '—'}
        </span>
      </div>

      {/* Toggles — right-aligned */}
      <div style={{ display: 'flex', gap: 12, marginLeft: 'auto', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#8e8e93', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!filters.showExpired}
            onChange={e => onChange({ ...filters, showExpired: e.target.checked })}
            style={{ accentColor: 'var(--blue)', width: 14, height: 14 }} />
          Expired
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#8e8e93', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!filters.hideNoJD}
            onChange={e => onChange({ ...filters, hideNoJD: e.target.checked })}
            style={{ accentColor: 'var(--blue)', width: 14, height: 14 }} />
          Has JD
        </label>
      </div>
    </div>
  )
}
