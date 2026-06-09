import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import {
  Home, MessageSquare, Video, Users, Bell, User,
  Settings, LogOut, Crown, X
} from 'lucide-react';

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen, activePanel, setActivePanel, notifications } = useUIStore();
  const { user, clearAuth } = useAuthStore();
  const matchStatus = useChatStore((s) => s.matchStatus);
  const unread = notifications.filter(n => !n.read).length;

  const displayName = user?.display_name || user?.username || 'Anonymous';
  const initials = displayName.charAt(0).toUpperCase();

  const nav = [
    { id: 'home' as const, icon: Home, label: 'Home' },
    { id: 'chat' as const, icon: MessageSquare, label: 'Text Chat', badge: matchStatus === 'matched' ? 1 : 0 },
    { id: 'video' as const, icon: Video, label: 'Video Chat' },
    { id: 'group' as const, icon: Users, label: 'Group Chat' },
    { id: 'dms' as const, icon: MessageSquare, label: 'Direct Messages' },
    { id: 'notifications' as const, icon: Bell, label: 'Notifications', badge: unread },
    { id: 'profile' as const, icon: User, label: 'My Profile' },
    { id: 'settings' as const, icon: Settings, label: 'Settings' },
  ];

  if (!sidebarOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={() => setSidebarOpen(false)} style={{
        position: 'fixed', inset: 0, zIndex: 40,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.2s ease',
      }} />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: '280px', zIndex: 50,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideInLeft 0.25s cubic-bezier(0.34,1.2,0.64,1)',
        boxShadow: '8px 0 32px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="font-display" style={{ fontWeight: 800, fontSize: '20px', color: 'var(--text-1)', letterSpacing: '-0.5px' }}>Menu</span>
          <button onClick={() => setSidebarOpen(false)} className="btn-icon">
            <X size={18} />
          </button>
        </div>

        {/* User card */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '12px', borderRadius: '12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
              background: user?.is_vip ? 'linear-gradient(135deg, #fbbf24, #fb923c)' : 'var(--grad-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: 'white', fontSize: '18px',
              border: '2px solid var(--border-accent)',
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</p>
                {user?.is_vip && <Crown size={12} color="#fbbf24" />}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{user?.username}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px', overflowY: 'auto' }}>
          {nav.map(({ id, icon: Icon, label, badge }) => (
            <button
              key={id}
              onClick={() => setActivePanel(id)}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '11px 12px', borderRadius: '10px',
                border: 'none', cursor: 'pointer',
                fontFamily: 'Manrope, sans-serif',
                fontSize: '14px', fontWeight: activePanel === id ? 600 : 500,
                background: activePanel === id ? 'var(--accent-dim)' : 'transparent',
                color: activePanel === id ? 'var(--accent)' : 'var(--text-2)',
                transition: 'all 0.12s',
                marginBottom: '2px',
                position: 'relative',
              }}
              onMouseEnter={e => { if (activePanel !== id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { if (activePanel !== id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {activePanel === id && (
                <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: '3px', height: '20px', background: 'var(--accent)', borderRadius: '0 2px 2px 0' }} />
              )}
              <Icon size={18} />
              {label}
              {!!badge && (
                <span style={{
                  marginLeft: 'auto', minWidth: '20px', height: '20px',
                  background: 'var(--neon-pink)', color: 'white',
                  fontSize: '11px', fontWeight: 700, borderRadius: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 5px',
                }}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={clearAuth}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
              padding: '11px 12px', borderRadius: '10px',
              border: 'none', cursor: 'pointer',
              fontFamily: 'Manrope, sans-serif', fontSize: '14px', fontWeight: 500,
              background: 'transparent', color: 'var(--red)',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
