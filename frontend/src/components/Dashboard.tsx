import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useLocation, useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import {
  Menu, Bell, MessageSquare, Zap, Crown, LogOut, Settings,
  Home as HomeIcon, Video, Users, Search as SearchIcon, Shield, Star, Terminal, ChevronLeft, ChevronRight
} from 'lucide-react';
import { SettingsView } from './Settings';
import { Home } from './Home';
import { TextChat } from './TextChat';
import { VideoChat } from './VideoChat';
import { GroupChat } from './GroupChat';
import { DMs } from './DMs';
import { Search } from './Search';
import { useWebSocket } from '../lib/useWebSocket';

// FIX: Persist sidebar state across refreshes
function getSavedSidebarState(): boolean {
  try { return localStorage.getItem('sidebar_open') !== 'false'; } catch { return true; }
}

export function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const wsStatus = useChatStore((s) => s.wsStatus);
  useWebSocket();

  const location = useLocation();
  const navigate = useNavigate();
  // activeTab derived from location for nav highlighting

  // FIX: Persist sidebar open state in localStorage so refresh keeps it
  const [isSidebarOpen, setIsSidebarOpen] = useState(getSavedSidebarState);
  const [activeDropdown, setActiveDropdown] = useState<'notifications' | 'profile' | null>(null);

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebar_open', String(next)); } catch {}
      return next;
    });
  };

  const initials = (user?.display_name || user?.username || 'U').charAt(0).toUpperCase();
  const displayName = user?.display_name || user?.username || 'Anonymous';

  const navItems = [
    { id: 'home',       path: '/',          icon: HomeIcon,      label: 'Home' },
    { id: 'text-chat',  path: '/text-chat', icon: MessageSquare, label: 'Text Chat' },
    { id: 'video-chat', path: '/video-chat',icon: Video,         label: 'Video Chat' },
    { id: 'groups',     path: '/groups',    icon: Users,         label: 'Group Chat' },
    { id: 'dms',        path: '/dms',       icon: MessageSquare, label: 'Direct Messages' },
    { id: 'search',     path: '/search',    icon: SearchIcon,    label: 'Search Users' },
    { id: 'settings',   path: '/settings',  icon: Settings,      label: 'Settings' },
  ];

  // Close dropdowns on outside click
  useEffect(() => {
    const close = () => setActiveDropdown(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--blynx-900)' }}>

      {/* ── Top Navbar ── */}
      <header style={{
        height: '56px', flexShrink: 0,
        background: 'rgba(13,14,18,0.9)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', zIndex: 100, position: 'relative',
      }}>
        {/* Left: hamburger + back/forward + logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={toggleSidebar} style={navBtnStyle} title="Toggle sidebar">
            <Menu size={20} />
          </button>

          {/* FIX: Browser-history back/forward for easy page navigation */}
          <button onClick={() => navigate(-1)} style={navBtnStyle} title="Go back">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => navigate(1)} style={navBtnStyle} title="Go forward">
            <ChevronRight size={18} />
          </button>

          <div
            onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginLeft: '4px' }}
          >
            <div style={{
              width: '28px', height: '28px', background: 'var(--accent)', borderRadius: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 12px var(--accent-glow)', flexShrink: 0,
            }}>
              <Zap size={14} color="white" fill="white" />
            </div>
            <span style={{ fontWeight: 700, fontSize: '17px', color: 'white', letterSpacing: '-0.3px' }}>
              TryBlynx
            </span>
          </div>
        </div>

        {/* Right: notifications, DMs, profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Notifications */}
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setActiveDropdown(d => d === 'notifications' ? null : 'notifications')} style={{ ...navBtnStyle, position: 'relative' }}>
              <Bell size={19} />
              <span style={badgeStyle('#ed4245')}>3</span>
            </button>
            {activeDropdown === 'notifications' && (
              <div style={dropdownStyle(300)}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', color: 'white', fontWeight: 700 }}>Notifications</h3>
                </div>
                {[
                  { text: 'New group chat created!', time: '2h ago' },
                  { text: 'System maintenance scheduled', time: '5h ago' },
                  { text: 'Welcome to TryBlynx!', time: '1d ago' },
                ].map((n, i) => (
                  <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--blynx-750)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <p style={{ margin: '0 0 3px', fontSize: '13px', color: 'white' }}>{n.text}</p>
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>{n.time}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* DMs */}
          <button onClick={() => navigate('/dms')} style={{ ...navBtnStyle, position: 'relative' }}>
            <MessageSquare size={19} />
            <span style={badgeStyle('var(--accent)')}>2</span>
          </button>

          {/* Profile */}
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setActiveDropdown(d => d === 'profile' ? null : 'profile')}
              style={{
                width: '32px', height: '32px', borderRadius: '50%', border: '2px solid var(--border-bright)',
                cursor: 'pointer', padding: 0,
                background: user?.is_vip ? 'linear-gradient(135deg, #faa61a, #ff6b35)' : 'linear-gradient(135deg, var(--accent), #7289da)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, color: 'white', fontSize: '13px', fontFamily: 'inherit',
              }}
            >{initials}</button>
            {activeDropdown === 'profile' && (
              <div style={dropdownStyle(220)}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'white' }}>{displayName}</p>
                    {user?.is_vip && <Crown size={12} color="#faa61a" />}
                    {user?.is_admin && <Shield size={12} color="#ff3333" />}
                    {user?.is_developer && <Terminal size={12} color="#00ff00" />}
                    {user?.is_moderator && <Star size={12} color="#3399ff" />}
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>@{user?.username}</p>
                </div>
                <div style={{ padding: '6px' }}>
                  {[
                    { label: 'Settings', icon: Settings, action: () => { navigate('/settings'); setActiveDropdown(null); } },
                    { label: 'Sign Out', icon: LogOut, action: clearAuth, danger: true },
                  ].map(({ label, icon: Icon, action, danger }) => (
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

        {/* Sidebar */}
        {/* Backdrop — click to close */}
        {isSidebarOpen && (
          <div
            onClick={toggleSidebar}
            style={{
              position: 'absolute', inset: 0, zIndex: 45,
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(2px)',
              animation: 'fade-in 0.2s ease',
            }}
          />
        )}

        <aside style={{
          position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 50,
          width: '220px',
          background: 'var(--blynx-850)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          overflowY: 'auto', overflowX: 'hidden',
          boxShadow: isSidebarOpen ? '4px 0 32px rgba(0,0,0,0.5)' : 'none',
        }}>
          <nav style={{ padding: '12px 8px', flex: 1 }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', padding: '4px 8px 6px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Menu
            </p>
            {navItems.map(({ id, path, icon: Icon, label }) => {
              const isActive = id === 'home'
                ? location.pathname === '/'
                : location.pathname.startsWith('/' + id);
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
                    transition: 'background 0.1s, color 0.1s', marginBottom: '2px',
                    position: 'relative',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--blynx-750)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  {isActive && <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: '3px', height: '18px', background: 'var(--accent)', borderRadius: '0 2px 2px 0' }} />}
                  <Icon size={17} />
                  {label}
                </button>
              );
            })}
          </nav>

          <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 10px', background: 'var(--blynx-800)', borderRadius: '8px' }}>
              <span className={`status-dot ${wsStatus}`} />
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{wsStatus}</span>
            </div>
          </div>
        </aside>

        {/* Main content — FIX: no backdrop/overlay, sidebar pushes content */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}
          onClick={() => setActiveDropdown(null)}>
          <Routes>
            <Route path="/"             element={<Home onNavigate={(p: string) => navigate(`/${p}`)} />} />
            <Route path="/text-chat"    element={<TextChat />} />
            <Route path="/video-chat"   element={<VideoChat />} />
            <Route path="/groups"       element={<GroupChat />} />
            <Route path="/groups/:id"   element={<GroupChat />} />
            <Route path="/dms"          element={<DMs />} />
            <Route path="/dms/:id"      element={<DMs />} />
            <Route path="/settings"     element={<SettingsView />} />
            <Route path="/search"       element={<Search />} />
            <Route path="*"             element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
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
  lineHeight: 1,
});

const dropdownStyle = (width: number): React.CSSProperties => ({
  position: 'absolute', top: '44px', right: 0, width: `${width}px`,
  background: 'var(--blynx-800)', border: '1px solid var(--border)',
  borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  zIndex: 200, overflow: 'hidden', animation: 'fade-in 0.15s ease',
});

import React from 'react';
