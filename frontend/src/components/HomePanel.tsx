import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { MessageSquare, Video, Users, Zap, Crown, Globe } from 'lucide-react';
import { Feed } from './Feed';

export function HomePanel() {
  const { setActivePanel } = useUIStore();
  const user = useAuthStore((s) => s.user);
  const wsStatus = useChatStore((s) => s.wsStatus);
  const displayName = user?.display_name || user?.username || 'stranger';

  const modes = [
    {
      id: 'chat' as const,
      icon: MessageSquare,
      label: 'Text Chat',
      desc: '1-on-1 anonymous text. No cringe, just vibes.',
      grad: 'linear-gradient(135deg, #6c63ff 0%, #a78bfa 100%)',
      glow: 'rgba(108,99,255,0.3)',
      tag: 'most popular',
    },
    {
      id: 'video' as const,
      icon: Video,
      label: 'Video Chat',
      desc: 'Face-to-face with a random stranger. Real talk.',
      grad: 'linear-gradient(135deg, #f472b6 0%, #fb923c 100%)',
      glow: 'rgba(244,114,182,0.3)',
      tag: 'trending 🔥',
    },
    {
      id: 'group' as const,
      icon: Users,
      label: 'Group Chat',
      desc: 'Jump into a live room. Many voices, one vibe.',
      grad: 'linear-gradient(135deg, #22d3ee 0%, #6c63ff 100%)',
      glow: 'rgba(34,211,238,0.3)',
      tag: 'new',
    },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', overflowY: 'auto', background: 'var(--bg-base)' }}>
      {/* Left — main content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Hero */}
        <div style={{
          padding: '40px 32px 32px',
          background: `radial-gradient(ellipse 80% 120% at 50% -20%, rgba(108,99,255,0.15) 0%, transparent 70%)`,
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span className={`dot ${wsStatus === 'connected' ? 'dot-green' : 'dot-yellow'}`} />
            <span style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: 500 }}>
              {wsStatus === 'connected' ? 'Connected' : 'Connecting…'}
            </span>
          </div>
          <h1 className="font-display" style={{
            fontSize: '40px', fontWeight: 800, color: 'var(--text-1)',
            letterSpacing: '-1.5px', lineHeight: 1.1, marginBottom: '10px',
          }}>
            Hey, {displayName} 👋
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '15px', maxWidth: '400px' }}>
            Pick your mode and start connecting with real people right now.
          </p>
          {user?.is_vip && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              marginTop: '12px', padding: '5px 12px', borderRadius: '20px',
              background: 'rgba(251,191,36,0.12)',
              border: '1px solid rgba(251,191,36,0.3)',
              color: '#fbbf24', fontSize: '12px', fontWeight: 700,
            }}>
              <Crown size={12} /> VIP Member
            </div>
          )}
        </div>

        {/* Mode cards */}
        <div style={{ padding: '28px 32px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
            Choose your mode
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {modes.map(({ id, icon: Icon, label, desc, grad, glow, tag }, i) => (
              <button
                key={id}
                onClick={() => setActivePanel(id)}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '20px',
                  padding: '24px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s cubic-bezier(0.34,1.2,0.64,1)',
                  animation: `fadeUp 0.4s ease ${i * 80}ms both`,
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget;
                  el.style.transform = 'translateY(-4px)';
                  el.style.borderColor = 'var(--border-2)';
                  el.style.boxShadow = `0 12px 40px ${glow}`;
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget;
                  el.style.transform = '';
                  el.style.borderColor = 'var(--border)';
                  el.style.boxShadow = '';
                }}
              >
                {/* Gradient accent top strip */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: grad, borderRadius: '20px 20px 0 0' }} />

                {/* Tag */}
                <div style={{
                  display: 'inline-flex', marginBottom: '16px',
                  padding: '3px 10px', borderRadius: '20px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border)',
                  fontSize: '11px', fontWeight: 600, color: 'var(--text-3)',
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>
                  {tag}
                </div>

                {/* Icon */}
                <div style={{
                  width: '48px', height: '48px', borderRadius: '14px',
                  background: grad,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '16px',
                  boxShadow: `0 4px 20px ${glow}`,
                }}>
                  <Icon size={22} color="white" />
                </div>

                <p className="font-display" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '6px' }}>{label}</p>
                <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.5 }}>{desc}</p>

                <div style={{
                  marginTop: '20px', display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '13px', fontWeight: 600,
                  background: grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                  <Zap size={14} style={{ filter: `drop-shadow(0 0 4px ${glow})` }} color="#6c63ff" />
                  Start now →
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Feed section */}
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div style={{ padding: '20px 32px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={16} color="var(--accent)" />
            <span className="font-display" style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-1)' }}>Community Feed</span>
          </div>
            <Feed />
        </div>
      </div>
    </div>
  );
}
