export default function Header({ lastRefreshed, refreshing, onRefresh }) {
  const formatted = lastRefreshed
    ? lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <header style={{
      padding: '12px 20px',
      borderBottom: '1px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: '#fff',
    }}>
      <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Job Search</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {formatted && (
          <span style={{ fontSize: 12, color: '#9ca3af' }}>Last updated {formatted}</span>
        )}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            padding: '6px 14px',
            background: refreshing ? '#e5e7eb' : '#3b82f6',
            color: refreshing ? '#6b7280' : '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            cursor: refreshing ? 'default' : 'pointer',
          }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </header>
  )
}
