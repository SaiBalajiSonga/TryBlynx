import { Bell, Users, Info, Check, Loader } from 'lucide-react';
import { useNotificationStore } from '../store/notificationStore';
import { useEffect } from 'react';

const typeIcon = (type: string) => {
  if (type === 'friend_request' || type === 'friend_accepted') return Users;
  if (type === 'profile_approved') return Check;
  return Info;
};

const typeColor: Record<string, string> = {
  friend_request: '#5865f2',
  friend_accepted: '#57f287',
  profile_approved: '#57f287',
  mod_action: '#ed4245',
};

const typeLabel = (n: any) => {
  const actor = n.actor_name || 'Someone';
  if (n.type === 'friend_request') return `${actor} sent you a friend request`;
  if (n.type === 'friend_accepted') return `${actor} accepted your friend request`;
  if (n.type === 'profile_approved') return 'Your profile update was approved';
  if (n.type === 'mod_action') return 'A moderation action was taken on your account';
  return 'New notification';
};

export function NotificationsPanel() {
  const { notifications, unreadCount, loading, fetchNotifications, markAllRead } = useNotificationStore();

  // Fetch on mount so panel is always up-to-date
  useEffect(() => {
    fetchNotifications();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const s = diff / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--blynx-900)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--blynx-850)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Bell size={18} color="var(--accent)" />
          <span style={{ fontSize: '18px', fontWeight: 700, color: 'white' }}>Notifications</span>
          {unreadCount > 0 && (
            <span style={{
              padding: '2px 8px', borderRadius: '20px',
              background: '#ed4245', color: 'white',
              fontSize: '11px', fontWeight: 700,
            }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} style={{
            background: 'rgba(88,101,242,0.12)', border: '1px solid rgba(88,101,242,0.25)',
            color: 'var(--accent)', padding: '5px 12px', borderRadius: '6px',
            fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: '5px',
          }}>
            <Check size={13} /> Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <Loader size={20} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '12px' }}>
            <Bell size={40} color="var(--text-muted)" style={{ opacity: 0.3 }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>No notifications yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {notifications.map((n, i) => {
              const Icon = typeIcon(n.type);
              const color = typeColor[n.type] ?? 'var(--accent)';
              return (
                <div key={n.id} style={{
                  animationDelay: `${i * 30}ms`,
                  display: 'flex', gap: '12px', alignItems: 'flex-start',
                  padding: '14px', borderRadius: '12px',
                  background: n.is_read ? 'transparent' : 'rgba(88,101,242,0.06)',
                  border: `1px solid ${n.is_read ? 'transparent' : 'rgba(88,101,242,0.15)'}`,
                  transition: 'background 0.15s',
                }}>
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
                    background: `${color}18`,
                    border: `1px solid ${color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                  }}>
                    {n.actor_avatar
                      ? <img src={n.actor_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <Icon size={16} color={color} />
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <p style={{ fontWeight: 600, fontSize: '13px', color: 'white', margin: 0 }}>{typeLabel(n)}</p>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '8px' }}>{timeAgo(n.created_at)}</span>
                    </div>
                    {n.actor_name && (
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>from @{n.actor_name}</p>
                    )}
                  </div>
                  {!n.is_read && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: '6px' }} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
