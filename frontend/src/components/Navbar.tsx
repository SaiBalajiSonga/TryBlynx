// ⚠️ DEAD CODE — This component is never rendered anywhere.
// Dashboard.tsx contains its own inline navbar.
// Additionally, `notifications` is read from useUIStore which is a different,
// never-populated store from useNotificationStore — so the unread badge is always 0.
// TODO: Either wire this up (replace Dashboard's inline nav) or delete this file.
import { Menu, Zap, Bell, MessageSquare, Users } from 'lucide-react';
import { useState } from 'react';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { FriendsModal } from './FriendsModal';

export function Navbar() {
  const [showFriends, setShowFriends] = useState(false);
  const { toggleSidebar, setActivePanel, notifications } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const wsStatus = useChatStore((s) => s.wsStatus);
  const unread = notifications.filter(n => !n.read).length;
  const initials = (user?.display_name || user?.username || 'U').charAt(0).toUpperCase();

  return (
    <>
    <nav style={{
      height: '56px', flexShrink: 0,
      display: 'flex', alignItems: 'center',
      padding: '0 16px',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      gap: '12px',
      zIndex: 30,
    }}>
      {/* Hamburger */}
      <button onClick={toggleSidebar} className="btn-icon" style={{ width: '36px', height: '36px' }}>
        <Menu size={18} />
      </button>

      {/* Logo — center */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            background: 'var(--grad-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 12px var(--accent-glow)',
          }}>
            <Zap size={14} color="white" fill="white" />
          </div>
          <span className="font-display" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.5px' }}>
            TryBlynx
          </span>
          {/* Live WS dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
            <span className={`dot ${wsStatus === 'connected' ? 'dot-green' : wsStatus === 'connecting' ? 'dot-yellow' : 'dot-red'}`} style={{ width: '6px', height: '6px' }} />
          </div>
        </div>
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button onClick={() => setShowFriends(true)} className="btn-icon" title="Friends">
          <Users size={18} />
        </button>
        <button onClick={() => setActivePanel('dms')} className="btn-icon" title="Messages">
          <MessageSquare size={18} />
        </button>
        <button onClick={() => setActivePanel('notifications')} className="btn-icon" title="Notifications" style={{ position: 'relative' }}>
          <Bell size={18} />
          {unread > 0 && (
            <span style={{
              position: 'absolute', top: '4px', right: '4px',
              width: '16px', height: '16px', borderRadius: '50%',
              background: 'var(--neon-pink)',
              color: 'white', fontSize: '9px', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--bg-surface)',
            }}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        <button onClick={() => setActivePanel('profile')} style={{
          width: '32px', height: '32px', borderRadius: '50%',
          border: 'none',
          background: 'var(--grad-accent)',
          color: 'white', fontWeight: 700, fontSize: '13px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'box-shadow 0.15s',
          fontFamily: 'Manrope, sans-serif',
          overflow: 'hidden'
        }} title="Profile"
          onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 12px var(--accent-glow)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
        >
          {user?.avatar_url ? <img src={user.avatar_url} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : initials}
        </button>
      </div>
    </nav>
    {showFriends && <FriendsModal onClose={() => setShowFriends(false)} />}
    </>
  );
}
