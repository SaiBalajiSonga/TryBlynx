
import { useUIStore } from '../store/uiStore';
import { X } from 'lucide-react';

export function ToastContainer() {
  const toasts = useUIStore(s => s.toasts);
  const dismissToast = useUIStore(s => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      pointerEvents: 'none'
    }}>
      {toasts.map(toast => {
        let bg = 'var(--blynx-800)';
        let border = 'var(--border)';
        if (toast.type === 'success') {
          border = 'rgba(74,222,128,0.3)';
        } else if (toast.type === 'error') {
          border = 'rgba(237,66,69,0.3)';
        } else if (toast.type === 'info') {
          border = 'rgba(88,101,242,0.3)';
        }

        return (
          <div
            key={toast.id}
            onClick={() => {
              if (toast.onClick) {
                toast.onClick();
                dismissToast(toast.id);
              }
            }}
            style={{
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: '8px',
              padding: '12px 16px',
              color: 'white',
              fontSize: '14px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              pointerEvents: 'auto',
              cursor: toast.onClick ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              minWidth: '280px',
              maxWidth: '350px',
              animation: 'slideInRight 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }}
          >
            <div style={{ flex: 1, wordBreak: 'break-word', display: 'flex', flexDirection: 'column' }}>
              {toast.message.split('\n').map((line, i) => (
                <span key={i} style={i === 0 ? { fontWeight: 600, marginBottom: '2px' } : { fontSize: '13px', color: 'var(--text-muted)' }}>
                  {line}
                </span>
              ))}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                dismissToast(toast.id);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
