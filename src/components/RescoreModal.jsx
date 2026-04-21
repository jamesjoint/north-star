export default function RescoreModal({ onRescore, onSaveOnly, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 28,
        maxWidth: 400, width: '90%', fontFamily: 'var(--font)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: '#1a1a1a' }}>
          Update your Radar?
        </h3>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: '#666', lineHeight: 1.55 }}>
          Updating your profile will re-score all jobs on your Radar. This may take a few minutes.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onRescore} style={{
            padding: '11px', background: '#1a1a1a', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}>
            Re-score now
          </button>
          <button onClick={onSaveOnly} style={{
            padding: '11px', background: 'rgba(0,0,0,0.07)', color: '#1a1a1a',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}>
            Save without re-scoring
          </button>
          <button onClick={onCancel} style={{
            padding: '8px', background: 'none', color: '#999',
            border: 'none', cursor: 'pointer', fontSize: 13,
            fontFamily: 'var(--font)',
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
