import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { Link, useLocation, useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import {
  Menu, Bell, MessageSquare, Zap, Crown, LogOut, Settings,
  Home as HomeIcon, Video, Users, Search as SearchIcon, Shield, Star, Terminal
} from 'lucide-react';
import { SettingsView } from './Settings';
import { Home } from './Home';
import { TextChat } from './TextChat';
import { VideoChat } from './VideoChat';
import { GroupChat } from './GroupChat';
import { DMs } from './DMs';
import { Search } from './Search';
import { useWebSocket } from '../lib/useWebSocket';

export function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const wsStatus = useChatStore((s) => s.wsStatus);
  useWebSocket(); // Initialize global websocket connection

  const location = useLocation();
  const navigate = useNavigate();
  
  const activeTab = location.pathname.split('/')[1] || 'home';

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeDropdown, setActiveDropdown] = useState<'notifications' | 'profile' | null>(null);

  const initials = (user?.display_name || user?.username || 'U').charAt(0).toUpperCase();
  const displayName = user?.display_name || user?.username || 'Anonymous';

  const toggleDropdown = (d: 'notifications' | 'profile') => {
    setActiveDropdown(prev => prev === d ? null : d);
  };

  const navItems: { id: string; path: string; icon: any; label: string }[] = [
    { id: 'home', path: '/', icon: HomeIcon, label: 'Home' },
    { id: 'text-chat', path: '/text-chat', icon: MessageSquare, label: 'Text Chat' },
    { id: 'video-chat', path: '/video-chat', icon: Video, label: 'Video Chat' },
    { id: 'groups', path: '/groups', icon: Users, label: 'Group Chat' },
    { id: 'search', path: '/search', icon: SearchIcon, label: 'Search Users' },
    { id: 'settings', path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--blynx-900)' }}>
      
      {/* ── Top Navbar ── */}
      <header style={{
        height: '64px', flexShrink: 0,
        background: 'rgba(13,14,18,0.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', zIndex: 100, position: 'relative'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-primary)', padding: '8px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--blynx-750)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Menu size={24} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} onClick={() => navigate('/')} className="cursor-pointer">
            <div style={{
              width: '32px', height: '32px', background: 'var(--accent)', borderRadius: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 12px var(--accent-glow)',
            }}>
              <Zap size={16} color="white" fill="white" />
            </div>
            <span style={{ fontWeight: 700, fontSize: '18px', color: 'white', letterSpacing: '-0.3px' }}>
              TryBlynx
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Notifications */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => toggleDropdown('notifications')}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-primary)', padding: '8px', borderRadius: '50%',
                position: 'relative', display: 'flex'
              }}
            >
              <Bell size={24} />
              <div style={{
                position: 'absolute', top: '4px', right: '4px',
                background: 'var(--red)', color: 'white', fontSize: '10px',
                fontWeight: 700, borderRadius: '10px', padding: '1px 5px',
                border: '2px solid rgba(13,14,18,1)'
              }}>
                3
              </div>
            </button>
            {/* Notifications Dropdown */}
            {activeDropdown === 'notifications' && (
              <div style={{
                position: 'absolute', top: '48px', right: 0,
                width: '320px', background: 'var(--blynx-800)',
                border: '1px solid var(--border)', borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 110,
                overflow: 'hidden', animation: 'fade-in 0.15s ease'
              }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', color: 'white', fontWeight: 600 }}>Notifications</h3>
                </div>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '14px', color: 'white' }}>New group chat created!</p>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>2 hours ago</p>
                  </div>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '14px', color: 'white' }}>System maintenance tomorrow.</p>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>5 hours ago</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* DMs Icon */}
          <button
            onClick={() => navigate('/dms')}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-primary)', padding: '8px', borderRadius: '50%',
              position: 'relative', display: 'flex'
            }}
          >
            <MessageSquare size={24} />
            <div style={{
              position: 'absolute', top: '4px', right: '2px',
              background: 'var(--accent)', color: 'white', fontSize: '10px',
              fontWeight: 700, borderRadius: '10px', padding: '1px 5px',
              border: '2px solid rgba(13,14,18,1)'
            }}>
              2
            </div>
          </button>

          {/* Profile */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => toggleDropdown('profile')}
              style={{
                width: '36px', height: '36px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: user?.is_vip ? 'linear-gradient(135deg, #faa61a, #ff6b35)' : 'linear-gradient(135deg, var(--accent), #7289da)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, color: 'white', fontSize: '15px', padding: 0
              }}
            >
              {initials}
            </button>
            {/* Profile Dropdown */}
            {activeDropdown === 'profile' && (
              <div style={{
                position: 'absolute', top: '48px', right: 0,
                width: '240px', background: 'var(--blynx-800)',
                border: '1px solid var(--border)', borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 110,
                overflow: 'hidden', animation: 'fade-in 0.15s ease'
              }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                    <p style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {displayName}
                    </p>
                    <div style={{ display: 'flex', gap: '2px', marginLeft: 'auto' }}>
                      {user?.is_developer && <span title="Developer"><Terminal size={14} color="#00ff00" /></span>}
                      {user?.is_admin && <span title="Admin"><Shield size={14} color="#ff3333" /></span>}
                      {user?.is_moderator && <span title="Moderator"><Star size={14} color="#3399ff" /></span>}
                      {user?.is_vip && <span title="VIP"><Crown size={14} color="#faa61a" /></span>}
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    @{user?.username}
                  </p>
                </div>
                <div style={{ padding: '8px' }}>
                  <button
                    onClick={() => { navigate('/settings'); setActiveDropdown(null); }}
                    style={{
                      width: '100%', padding: '10px 12px', background: 'transparent', border: 'none',
                      color: 'var(--text-primary)', fontSize: '14px', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderRadius: '6px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--blynx-750)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Settings size={16} /> Settings
                  </button>
                  <button
                    onClick={clearAuth}
                    style={{
                      width: '100%', padding: '10px 12px', background: 'transparent', border: 'none',
                      color: '#ed4245', fontSize: '14px', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderRadius: '6px',
                      marginTop: '4px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(237,66,69,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <LogOut size={16} /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Layout (Sidebar + Content) ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        
        {/* Sidebar (Overlapping) */}
        <aside style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 50,
          width: '240px', background: 'var(--blynx-850)',
          borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
          boxShadow: isSidebarOpen ? '4px 0 24px rgba(0,0,0,0.5)' : 'none',
          transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', overflowY: 'auto'
        }}>
          <nav style={{ padding: '16px 12px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', padding: '0 8px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Menu
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {navItems.map(({ id, path, icon: Icon, label }) => {
                const isActive = activeTab === id || (id === 'home' && activeTab === '');
                return (
                  <Link
                    key={id}
                    to={path}
                    onClick={() => setIsSidebarOpen(false)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                      borderRadius: '8px', cursor: 'pointer', textDecoration: 'none',
                      fontSize: '14px', fontWeight: isActive ? 600 : 500,
                      fontFamily: 'inherit',
                      background: isActive ? 'rgba(88,101,242,0.15)' : 'transparent',
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                      transition: 'background 0.12s, color 0.12s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--blynx-750)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Icon size={20} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div style={{ marginTop: 'auto', padding: '16px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--blynx-800)', borderRadius: '8px' }}>
              <span className={`status-dot ${wsStatus}`} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                {wsStatus}
              </span>
            </div>
          </div>
        </aside>

        {/* Sidebar Backdrop Overlay */}
        {isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(false)}
            style={{
              position: 'absolute', inset: 0, zIndex: 40,
              background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
              animation: 'fade-in 0.2s ease'
            }}
          />
        )}

        {/* Content Area */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={() => setActiveDropdown(null)}>
          <Routes>
            <Route path="/" element={<Home onNavigate={(p: any) => navigate(`/${p}`)} />} />
            <Route path="/text-chat" element={<TextChat />} />
            <Route path="/video-chat" element={<VideoChat />} />
            <Route path="/groups" element={<GroupChat />} />
            <Route path="/groups/:id" element={<GroupChat />} />
            <Route path="/dms" element={<DMs />} />
            <Route path="/dms/:id" element={<DMs />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route path="/search" element={<Search />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

      </div>
    </div>
  );
}
