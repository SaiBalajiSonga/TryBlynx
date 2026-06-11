import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useNotificationStore } from '../store/notificationStore';
import type { AppNotification } from '../store/notificationStore';
import { useLocation, useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import {
  Menu, Bell, MessageSquare, Zap, Crown, LogOut, Settings,
  Home as HomeIcon, Video, Users, Search as SearchIcon, Shield, Star,
  Terminal, UserPlus, Check, X, UserCircle,
  Clipboard, UserCheck,
} from 'lucide-react';
import { SettingsView } from './Settings';
import { Home } from './Home';
import { TextChat } from './TextChat';
import { VideoChat } from './VideoChat';
import { GroupChat } from './GroupChat';
import { DMs } from './DMs';
import { Search } from './Search';
import { UserProfileModal } from './UserProfileModal';
import { ModLog } from './ModLog';
import { useWebSocket } from '../lib/useWebSocket';
import { api } from '../lib/api';
import { ToastContainer } from './ToastContainer';

function getSavedSidebarState(): boolean {
  try { return localStorage.getItem('sidebar_open') !== 'false'; } catch { return true; }
}

export function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const wsStatus = useChatStore((s) => s.wsStatus);
  useWebSocket();

  const { notifications, unreadCount, fetchNotifications, markAllRead } =
    useNotificationStore();

  const location = useLocation();
  const navigate = useNavigate();

  const [isSidebarOpen, setIsSidebarOpen] = useState(getSavedSidebarState);
  const [activeDropdown, setActiveDropdown] = useState<'notifications' | 'profile' | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Fetch notifications on mount
  useEffect(() => { 
    fetchNotifications(); 
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Real DM unread count
  const dmUnreadCounts = useChatStore(s => s.dmUnreadCounts);
  const totalDMUnread = Object.values(dmUnreadCounts).reduce((a, b) => a + b, 0);

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebar_open', String(next)); } catch {}
      return next;
    });
  };

  const initials = (user?.display_name || user?.username || 'U').charAt(0).toUpperCase();
  const displayName = user?.display_name || user?.username || 'Anonymous';

  const isMod = user?.is_moderator || user?.is_admin || user?.is_developer;

  const navItems = [
    { id: 'home',       path: '/app',          icon: HomeIcon,      label: 'Home' },
    { id: 'text-chat',  path: '/app/text-chat', icon: MessageSquare, label: 'Text Chat' },
    { id: 'video-chat', path: '/app/video-chat', icon: Video,        label: 'Video Chat' },
    { id: 'groups',     path: '/app/groups',    icon: Users,         label: 'Group Chat' },
    { id: 'dms',        path: '/app/dms',       icon: MessageSquare, label: 'Direct Messages' },
    { id: 'search',     path: '/app/search',    icon: SearchIcon,    label: 'Find Users' },
    { id: 'settings',   path: '/app/settings',  icon: Settings,      label: 'Settings' },
    ...(isMod ? [{ id: 'mod', path: '/app/mod', icon: Clipboard, label: 'Mod Log' }] : []),
  ];

  useEffect(() => {
    const close = () => setActiveDropdown(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const handleMarkRead = async () => {
    await markAllRead();
  };

  const handleFriendAccept = async (n: AppNotification) => {
    try {
      await api.acceptFriendRequest(n.actor_id!);
      fetchNotifications();
    } catch {}
  };
  const handleFriendDecline = async (n: AppNotification) => {
    try {
      await api.declineFriendRequest(n.actor_id!);
      fetchNotifications();
    } catch {}
  };

  const notifIcon = (type: string) => {
    if (type === 'friend_request') return <UserPlus size={16} color="var(--accent)" />;
    if (type === 'friend_accepted') return <UserCheck size={16} color="#57f287" />;
    if (type === 'profile_approved') return <Check size={16} color="#57f287" />;
    return <Bell size={16} color="var(--text-muted)" />;
  };

  const notifLabel = (n: AppNotification) => {
    const actor = n.actor_name || 'Someone';
    if (n.type === 'friend_request') return `${actor} sent you a friend request`;
    if (n.type === 'friend_accepted') return `${actor} accepted your friend request`;
    if (n.type === 'profile_approved') return 'Your profile update was approved';
    if (n.type === 'mod_action') return 'A moderation action was taken on your account';
    return 'New notification';
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--blynx-900)' }}>

      {/* ── Top Navbar ── */}
      <header style={{
        height: '56px', flexShrink: 0,
        background: 'rgba(13,14,18,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', zIndex: 100, position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={toggleSidebar} style={navBtnStyle} title="Toggle sidebar">
            <Menu size={20} />
          </button>
          <div onClick={() => navigate('/app')} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginLeft: '4px' }}>
            <div style={{ width: '28px', height: '28px', background: 'var(--accent)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 12px var(--accent-glow)', flexShrink: 0 }}>
              <Zap size={14} color="white" fill="white" />
            </div>
            <span style={{ fontWeight: 700, fontSize: '17px', color: 'white', letterSpacing: '-0.3px' }}>TryBlynx</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Notifications Bell */}
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              id="notif-bell"
              onClick={() => {
                setActiveDropdown(d => d === 'notifications' ? null : 'notifications');
                if (activeDropdown !== 'notifications' && unreadCount > 0) handleMarkRead();
              }}
              style={{ ...navBtnStyle, position: 'relative' }}
            >
              <Bell size={19} />
              {unreadCount > 0 && (
                <span style={badgeStyle('#ed4245')}>{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            {activeDropdown === 'notifications' && (
              <div style={dropdownStyle(340)}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', color: 'white', fontWeight: 700 }}>Notifications</h3>
                  <button onClick={handleMarkRead} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Mark all read
                  </button>
                </div>
                <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                      No notifications yet
                    </div>
                  ) : notifications.map(n => (
                    <div key={n.id} style={{
                      padding: '12px 16px', borderBottom: '1px solid var(--border)',
                      background: n.is_read ? 'transparent' : 'rgba(88,101,242,0.06)',
                      transition: 'background 0.1s', cursor: 'default',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--blynx-750)'}
                      onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(88,101,242,0.06)'}
                    >
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <div style={{ marginTop: '2px', flexShrink: 0 }}>{notifIcon(n.type)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'white', lineHeight: 1.4 }}>{notifLabel(n)}</p>
                          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>{timeAgo(n.created_at)}</p>
                          {/* Inline accept/decline for friend requests */}
                          {n.type === 'friend_request' && n.actor_id && (
                            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                              <button onClick={() => handleFriendAccept(n)} className="btn-accent" style={{ padding: '5px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Check size={12} /> Accept
                              </button>
                              <button onClick={() => handleFriendDecline(n)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '5px 10px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <X size={12} /> Decline
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* DMs badge (real unread count) */}
          <button id="dms-nav-btn" onClick={() => navigate('/app/dms')} style={{ ...navBtnStyle, position: 'relative' }}>
            <MessageSquare size={19} />
            {totalDMUnread > 0 && (
              <span style={badgeStyle('var(--accent)')}>{totalDMUnread > 9 ? '9+' : totalDMUnread}</span>
            )}
          </button>

          {/* Profile menu */}
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              id="profile-menu-btn"
              onClick={() => setActiveDropdown(d => d === 'profile' ? null : 'profile')}
              style={{
                width: '32px', height: '32px', borderRadius: '50%', border: 'none',
                cursor: 'pointer', padding: 0,
                background: user?.is_vip ? 'linear-gradient(135deg, #faa61a, #ff6b35)' : 'linear-gradient(135deg, var(--accent), #7289da)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, color: 'white', fontSize: '13px', fontFamily: 'inherit',
                overflow: 'hidden',
              }}
            >
              {user?.avatar_url
                ? <img src={user.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                : initials}
            </button>
            {activeDropdown === 'profile' && (
              <div style={dropdownStyle(220)}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'white' }}>{displayName}</p>
                    {user?.is_vip && <Crown size={12} color="#faa61a" />}
                    {user?.is_admin && <Shield size={12} color="#ff3333" />}
                    {user?.is_developer && <Terminal size={12} color="#a855f7" />}
                    {user?.is_moderator && <Star size={12} color="#3399ff" />}
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>@{user?.username}</p>
                  {user?.is_anonymous && <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#faa61a' }}>⚡ Guest account</p>}
                </div>
                <div style={{ padding: '6px' }}>
                  {[
                    { label: 'My Profile', icon: UserCircle, action: () => { setSelectedProfileId(user?.id ?? null); setActiveDropdown(null); } },
                    { label: 'Settings',   icon: Settings,    action: () => { navigate('/app/settings');  setActiveDropdown(null); } },
                    ...(isMod ? [{ label: 'Mod Dashboard', icon: Clipboard, action: () => { navigate('/app/mod'); setActiveDropdown(null); } }] : []),
                    { label: 'Sign Out', icon: LogOut, action: clearAuth, danger: true },
                  ].map(({ label, icon: Icon, action, danger }: any) => (
                    <button key={label} onClick={action} style={{
                      width: '100%', padding: '9px 12px', background: 'transparent', border: 'none',
                      color: danger ? '#ed4245' : 'var(--text-primary)', fontSize: '13px', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderRadius: '6px',
                      fontFamily: 'inherit',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(237,66,69,0.1)' : 'var(--blynx-750)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Icon size={15} /> {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {isSidebarOpen && (
          <div onClick={toggleSidebar} style={{ position: 'absolute', inset: 0, zIndex: 45, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', animation: 'fade-in 0.2s ease' }} />
        )}

        <aside style={{
          position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 50,
          width: '220px', background: 'var(--blynx-850)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          overflowY: 'auto', overflowX: 'hidden',
          boxShadow: isSidebarOpen ? '4px 0 32px rgba(0,0,0,0.5)' : 'none',
        }}>
          <nav style={{ padding: '12px 8px', flex: 1 }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', padding: '4px 8px 6px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Menu</p>
            {navItems.map(({ id, path, icon: Icon, label }) => {
              const isActive = id === 'home' ? location.pathname === '/app' || location.pathname === '/app/' : location.pathname.startsWith('/app/' + id);
              return (
                <button
                  key={id}
                  onClick={() => navigate(path)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '9px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '13px',
                    fontWeight: isActive ? 600 : 400,
                    background: isActive ? 'rgba(88,101,242,0.15)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    transition: 'background 0.1s, color 0.1s', marginBottom: '2px', position: 'relative',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--blynx-750)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  {isActive && <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: '3px', height: '18px', background: 'var(--accent)', borderRadius: '0 2px 2px 0' }} />}
                  <Icon size={17} />
                  {label}
                  {id === 'dms' && totalDMUnread > 0 && (
                    <span style={{ marginLeft: 'auto', background: 'var(--accent)', color: 'white', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '10px' }}>
                      {totalDMUnread}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--blynx-900)' }}>
            <div onClick={() => user?.id && setSelectedProfileId(user.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px', fontWeight: 700, overflow: 'hidden', flexShrink: 0 }}>
                {user?.avatar_url ? <img src={user.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : initials}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>@{user?.username}</div>
              </div>
            </div>
          </div>

          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 10px', background: 'var(--blynx-800)', borderRadius: '8px' }}>
              <span className={`status-dot ${wsStatus}`} />
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{wsStatus}</span>
            </div>
          </div>
        </aside>

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }} onClick={() => setActiveDropdown(null)}>
          <Routes>
            <Route path="/"             element={<Home onNavigate={(p: string) => navigate(`/app/${p}`)} />} />
            <Route path="/text-chat"    element={<TextChat />} />
            <Route path="/video-chat"   element={<VideoChat />} />
            <Route path="/groups"       element={<GroupChat onUserClick={setSelectedProfileId} />} />
            <Route path="/groups/:id"   element={<GroupChat onUserClick={setSelectedProfileId} />} />
            <Route path="/dms"          element={<DMs />} />
            <Route path="/dms/:id"      element={<DMs />} />
            <Route path="/settings"     element={<SettingsView />} />
            <Route path="/search"       element={<Search />} />
            {isMod && <Route path="/mod" element={<ModLog />} />}
            <Route path="*"             element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      {selectedProfileId && (
        <UserProfileModal userId={selectedProfileId} onClose={() => setSelectedProfileId(null)} />
      )}
      <ToastContainer />
    </div>
  );
}

// ── Shared micro-styles ──────────────────────────────────────────────────────
const navBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--text-secondary)', padding: '7px', borderRadius: '8px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.1s, color 0.1s',
};

const badgeStyle = (bg: string): React.CSSProperties => ({
  position: 'absolute', top: '3px', right: '3px',
  background: bg, color: 'white', fontSize: '9px', fontWeight: 800,
  borderRadius: '8px', padding: '1px 4px', border: '2px solid var(--blynx-900)',
  lineHeight: 1, pointerEvents: 'none',
});

const dropdownStyle = (width: number): React.CSSProperties => ({
  position: 'absolute', top: '44px', right: 0, width: `${width}px`,
  background: 'var(--blynx-800)', border: '1px solid var(--border)',
  borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  zIndex: 200, overflow: 'hidden', animation: 'fade-in 0.15s ease',
});

import React from 'react';
