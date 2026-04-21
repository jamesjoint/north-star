export default function VersionToast({ whatsNew, onReload, onDismiss }) {
  const message = whatsNew
    ? `✦ ${whatsNew} — `
    : '✦ New signal on your Radar — '

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 2000,
      background: '#1a1a1a', color: '#fff',
      borderRadius: 12, padding: '12px 18px',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      fontFamily: 'var(--font)', fontSize: 13,
      maxWidth: 'calc(100vw - 48px)',
      animation: 'slideUp 0.25s ease',
    }}>
      <style>{`@keyframes slideUp { from { opacity: 0; transform: translateX(-50%) translateY(16px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {message}
        <button
          onClick={onReload}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--accent)', fontFamily: 'var(--font)',
            fontSize: 13, fontWeight: 600, padding: 0,
          }}
        >
          reload to tune in
        </button>
      </span>
      <button
        onClick={onDismiss}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.5)', fontSize: 16, lineHeight: 1,
          padding: '0 2px', flexShrink: 0,
        }}
      >×</button>
    </div>
  )
}
