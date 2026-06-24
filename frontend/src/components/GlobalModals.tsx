import { useUIStore } from '../store/uiStore';

export function GlobalModals() {
  const confirmModal = useUIStore(s => s.confirmModal);
  const alertModal = useUIStore(s => s.alertModal);

  if (!confirmModal && !alertModal) return null;

  return (
    <>
      {confirmModal?.isOpen && (
        <div className="modal-overlay" onClick={confirmModal.onCancel} style={{ zIndex: 9999 }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, color: 'white', fontSize: '18px' }}>{confirmModal.title}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5, marginBottom: '24px' }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={confirmModal.onCancel}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text-primary)',
                  cursor: 'pointer', padding: '8px 16px', fontWeight: 600, fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="btn-accent"
                style={{
                  border: 'none', borderRadius: '8px', padding: '8px 20px',
                  fontWeight: 600, fontSize: '14px', cursor: 'pointer'
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {alertModal?.isOpen && (
        <div className="modal-overlay" onClick={alertModal.onClose} style={{ zIndex: 9999 }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, color: 'white', fontSize: '18px' }}>{alertModal.title}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5, marginBottom: '24px' }}>
              {alertModal.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={alertModal.onClose}
                className="btn-accent"
                style={{
                  border: 'none', borderRadius: '8px', padding: '8px 20px',
                  fontWeight: 600, fontSize: '14px', cursor: 'pointer'
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
