import { Bell, MessageSquare, Users, Info, Check } from 'lucide-react';
import { useUIStore } from '../store/uiStore';

const typeIcon = { match: Users, dm: MessageSquare, system: Info };
const typeColor = { match: 'var(--accent)', dm: 'var(--neon-pink)', system: 'var(--neon-cyan)' };

export function NotificationsPanel() {
  const { notifications, markAllRead } = useUIStore();
  const unread = notifications.filter(n => !n.read).length;

  const timeAgo = (d: Date) => {
    const s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-base)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Bell size={18} color="var(--accent)" />
          <span className="font-display" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-1)' }}>Notifications</span>
          {unread > 0 && (
            <span style={{
              padding: '2px 8px', borderRadius: '20px',
              background: 'var(--neon-pink)', color: 'white',
              fontSize: '11px', fontWeight: 700,
            }}>{unread}</span>
          )}
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '12px', gap: '5px' }}>
            <Check size={13} /> Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {notifications.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
            <Bell size={40} color="var(--text-3)" style={{ opacity: 0.4 }} />
            <p style={{ color: 'var(--text-3)', fontSize: '14px' }}>No notifications yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {notifications.map((n, i) => {
              const Icon = typeIcon[n.type];
              const color = typeColor[n.type];
              return (
                <div key={n.id} className="anim-fadeUp" style={{
                  animationDelay: `${i * 30}ms`,
                  display: 'flex', gap: '12px', alignItems: 'flex-start',
                  padding: '14px', borderRadius: '12px',
                  background: n.read ? 'transparent' : 'rgba(108,99,255,0.05)',
                  border: `1px solid ${n.read ? 'transparent' : 'var(--border)'}`,
                  transition: 'background 0.15s',
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                    background: `${color}18`,
                    border: `1px solid ${color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={16} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-1)' }}>{n.title}</p>
                      <span style={{ fontSize: '11px', color: 'var(--text-3)', flexShrink: 0, marginLeft: '8px' }}>{timeAgo(n.createdAt)}</span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.4 }}>{n.body}</p>
                  </div>
                  {!n.read && <div className="dot dot-green" style={{ width: '6px', height: '6px', flexShrink: 0, marginTop: '6px' }} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
