import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useWebSocket } from '../lib/useWebSocket';
import {
  Settings, LogOut, MessageSquare, Users, Zap, Video,
  Globe, Crown, Wifi, WifiOff, Loader2
} from 'lucide-react';
import { ChatRoom } from './ChatRoom';
import { SettingsView } from './Settings';
import { Feed } from './Feed';
import { VideoRoom } from './VideoRoom';
import { useWebRTCStore } from '../store/webrtcStore';

type Tab = 'feed' | 'match' | 'chat' | 'settings';

export function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const wsStatus = useChatStore((s) => s.wsStatus);
  const matchStatus = useChatStore((s) => s.matchStatus);
  const targetGender = useChatStore((s) => s.targetGender);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const { isVideoActive, activePeerId, isInitiator } = useWebRTCStore();

  const { sendMessage } = useWebSocket();
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [matchElapsed, setMatchElapsed] = useState(0);

  useEffect(() => {
    if (matchStatus === 'matched') setActiveTab('chat');
  }, [matchStatus]);

  // Timer for wait indication
  useEffect(() => {
    if (matchStatus !== 'waiting') { setMatchElapsed(0); return; }
    const t = setInterval(() => setMatchElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [matchStatus]);

  const initials = (user?.display_name || user?.username || 'U').charAt(0).toUpperCase();
  const displayName = user?.display_name || user?.username || 'Anonymous';

  const navItems: { id: Tab; icon: typeof Globe; label: string; badge?: number }[] = [
    { id: 'feed', icon: Globe, label: 'Discover' },
    { id: 'match', icon: Users, label: 'Matchmaking' },
    { id: 'chat', icon: MessageSquare, label: 'Chat', badge: matchStatus === 'matched' && activeRoomId ? 1 : 0 },
  ];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--blynx-900)' }}>
      {isVideoActive && activePeerId && (
        <VideoRoom peerId={activePeerId} isInitiator={isInitiator} />
      )}

      {/* ── Sidebar ── */}
      <aside style={{
        width: '240px',
        flexShrink: 0,
        background: 'var(--blynx-850)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Brand */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{
              width: '36px', height: '36px',
              background: 'var(--accent)',
              borderRadius: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 16px var(--accent-glow)',
            }}>
              <Zap size={18} color="white" fill="white" />
            </div>
            <span style={{ fontWeight: 700, fontSize: '18px', color: 'white', letterSpacing: '-0.3px' }}>
              TryBlynx
            </span>
          </div>

          {/* WS Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className={`status-dot ${wsStatus}`} />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
              {wsStatus}
            </span>
            {wsStatus === 'connected'
              ? <Wifi size={12} color="var(--teal)" />
              : wsStatus === 'connecting'
              ? <Loader2 size={12} color="var(--yellow)" className="animate-spin-slow" />
              : <WifiOff size={12} color="var(--red)" />
            }
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', padding: '0 8px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Navigation
          </p>
          {navItems.map(({ id, icon: Icon, label, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 10px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '14px',
                fontWeight: activeTab === id ? 600 : 400,
                transition: 'background 0.12s, color 0.12s',
                background: activeTab === id ? 'rgba(88,101,242,0.18)' : 'transparent',
                color: activeTab === id ? 'var(--accent)' : 'var(--text-secondary)',
                position: 'relative',
              }}
            >
              {activeTab === id && (
                <div style={{
                  position: 'absolute', left: '-8px',
                  width: '3px', height: '20px',
                  background: 'var(--accent)',
                  borderRadius: '0 2px 2px 0',
                }} />
              )}
              <Icon size={18} />
              {label}
              {!!badge && (
                <span style={{
                  marginLeft: 'auto',
                  background: 'var(--accent)',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '10px',
                  padding: '1px 6px',
                  minWidth: '18px',
                  textAlign: 'center',
                }}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* User footer */}
        <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px',
            borderRadius: '8px',
            background: 'var(--blynx-750)',
            marginBottom: '8px',
          }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: user?.is_vip
                ? 'linear-gradient(135deg, #faa61a, #ff6b35)'
                : 'linear-gradient(135deg, var(--accent), #7289da)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: 'white', fontSize: '15px',
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName}
                </p>
                {user?.is_vip && <Crown size={12} color="#faa61a" />}
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                @{user?.username}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setActiveTab('settings')}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'settings' ? 'var(--accent)' : 'var(--blynx-600)',
                color: activeTab === 'settings' ? 'white' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.12s',
              }}
              title="Settings"
            >
              <Settings size={15} />
            </button>
            <button
              onClick={clearAuth}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                background: 'var(--blynx-600)',
                color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.12s, color 0.12s',
              }}
              title="Sign Out"
              onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(237,66,69,0.2)'; (e.target as HTMLElement).style.color = '#ed4245'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'var(--blynx-600)'; (e.target as HTMLElement).style.color = 'var(--text-secondary)'; }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {activeTab === 'feed' && <Feed />}
        {activeTab === 'settings' && <SettingsView />}
        {activeTab === 'match' && (
          <MatchView
            matchStatus={matchStatus}
            targetGender={targetGender}
            wsStatus={wsStatus}
            matchElapsed={matchElapsed}
            onFind={() => sendMessage('match.find', { target_gender: 'any' })}
            onCancel={() => sendMessage('match.cancel', {})}
          />
        )}
        {activeTab === 'chat' && (
          matchStatus === 'matched' || activeRoomId
            ? <ChatRoom />
            : <EmptyChat />
        )}
      </main>
    </div>
  );
}

function MatchView({ matchStatus, targetGender, wsStatus, matchElapsed, onFind, onCancel }: {
  matchStatus: string;
  targetGender: string | null;
  wsStatus: string;
  matchElapsed: number;
  onFind: () => void;
  onCancel: () => void;
}) {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px',
      background: 'var(--blynx-900)',
      backgroundImage: 'radial-gradient(ellipse at center, rgba(88,101,242,0.06) 0%, transparent 70%)',
    }}>
      <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
        {/* Icon with pulse ring */}
        <div style={{ position: 'relative', display: 'inline-flex', marginBottom: '32px' }}>
          {matchStatus === 'waiting' && (
            <>
              <div style={{
                position: 'absolute', inset: '-16px',
                borderRadius: '50%',
                border: '2px solid var(--accent)',
                animation: 'pulse-ring 1.5s ease-out infinite',
              }} />
              <div style={{
                position: 'absolute', inset: '-8px',
                borderRadius: '50%',
                border: '2px solid var(--accent)',
                animation: 'pulse-ring 1.5s ease-out 0.4s infinite',
              }} />
            </>
          )}
          <div style={{
            width: '96px', height: '96px',
            borderRadius: '50%',
            background: matchStatus === 'waiting' ? 'rgba(88,101,242,0.15)' : 'var(--blynx-700)',
            border: `2px solid ${matchStatus === 'waiting' ? 'var(--accent)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.3s',
          }}>
            <Video size={40} color={matchStatus === 'waiting' ? 'var(--accent)' : 'var(--text-muted)'} />
          </div>
        </div>

        <h2 style={{ margin: '0 0 10px', fontSize: '26px', fontWeight: 700, color: 'white' }}>
          {matchStatus === 'waiting' ? 'Finding a match...' : 'Ready to Connect?'}
        </h2>
        <p style={{ margin: '0 0 32px', color: 'var(--text-secondary)', fontSize: '15px' }}>
          {matchStatus === 'waiting'
            ? `Searching${targetGender && targetGender !== 'any' ? ` for ${targetGender}` : ''} · ${fmt(matchElapsed)}`
            : 'Join the pool and meet someone new instantly.'}
        </p>

        {matchStatus === 'waiting' ? (
          <button
            onClick={onCancel}
            style={{
              width: '100%', padding: '14px', borderRadius: '10px',
              border: '1px solid var(--border-bright)',
              background: 'var(--blynx-700)',
              color: 'var(--text-primary)',
              fontSize: '15px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'background 0.12s',
            }}
          >
            Cancel Search
          </button>
        ) : (
          <button
            onClick={onFind}
            disabled={wsStatus !== 'connected'}
            className="btn-accent"
            style={{
              width: '100%', padding: '14px',
              fontSize: '15px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            <Zap size={18} />
            {wsStatus !== 'connected' ? 'Connecting...' : 'Find a Match'}
          </button>
        )}

        {wsStatus !== 'connected' && matchStatus !== 'waiting' && (
          <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
            Waiting for server connection…
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyChat() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--blynx-900)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <MessageSquare size={48} color="var(--blynx-400)" style={{ marginBottom: '16px' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '15px', margin: 0 }}>
          Go to Matchmaking to start a conversation
        </p>
      </div>
    </div>
  );
}
