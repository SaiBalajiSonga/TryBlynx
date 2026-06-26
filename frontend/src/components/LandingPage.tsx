import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Shield, Globe, ArrowRight } from 'lucide-react';
import { LynxLogo } from './LynxLogo';

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--blynx-900)',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '"Inter", sans-serif',
      backgroundImage: 'radial-gradient(circle at 15% 50%, rgba(88,101,242,0.15), transparent 25%), radial-gradient(circle at 85% 30%, rgba(67,181,129,0.15), transparent 25%)',
    }}>
      {/* Navbar */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px 48px',
        borderBottom: '1px solid rgba(255,255,255,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <LynxLogo size={40} />
          <span style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px' }}>Lynxus</span>
        </div>
        <button 
          onClick={() => navigate('/auth')}
          className="btn-accent" 
          style={{ padding: '10px 24px', borderRadius: '24px', fontWeight: 600 }}
        >
          Login
        </button>
      </nav>

      {/* Hero Section */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '64px', fontWeight: 900, lineHeight: 1.1, marginBottom: '24px', letterSpacing: '-2px', maxWidth: '800px' }}>
          The new way to <span style={{ color: 'var(--accent)' }}>hang out</span> online.
        </h1>
        <p style={{ fontSize: '20px', color: 'var(--text-secondary)', maxWidth: '600px', marginBottom: '40px', lineHeight: 1.5 }}>
          No algorithms. No feed. Just you and your friends, talking in real-time. Fast, secure, and built for Gen-Z.
        </p>
        <button 
          onClick={() => navigate('/auth')}
          className="btn-accent"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '18px', padding: '16px 32px', borderRadius: '32px', fontWeight: 700, boxShadow: '0 8px 32px var(--accent-glow)' }}
        >
          Get Started <ArrowRight size={20} />
        </button>

        {/* Feature Grid */}
        <div style={{ display: 'flex', gap: '24px', marginTop: '80px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <FeatureCard icon={<MessageCircle />} title="Instant Chat" desc="Real-time WebSockets mean zero delay." />
          <FeatureCard icon={<Globe />} title="Global Match" desc="Find new friends instantly with live matchmaking." />
          <FeatureCard icon={<Shield />} title="Secure by Design" desc="E2E encrypted DMs coming very soon." />
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '32px 48px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: 'var(--text-muted)'
      }}>
        <div style={{ fontSize: '14px' }}>© 2026 Lynxus. All rights reserved.</div>
        <div style={{ display: 'flex', gap: '24px', fontSize: '14px' }}>
          <span onClick={() => navigate('/terms')} style={{ cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.color='white'} onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>Terms of Service</span>
          <span onClick={() => navigate('/privacy')} style={{ cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.color='white'} onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>Privacy Policy</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: ReactNode, title: string, desc: string }) {
  return (
    <div style={{
      background: 'var(--blynx-800)',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      padding: '24px',
      width: '280px',
      textAlign: 'left',
      transition: 'transform 0.2s',
      cursor: 'default'
    }}
    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
    >
      <div style={{ color: 'var(--accent)', marginBottom: '16px' }}>{icon}</div>
      <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0' }}>{title}</h3>
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>{desc}</p>
    </div>
  );
}
