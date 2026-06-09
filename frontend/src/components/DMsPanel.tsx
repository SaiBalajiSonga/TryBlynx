import { MessageSquare, Lock } from 'lucide-react';

export function DMsPanel() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: '32px' }}>
      <div style={{ textAlign: 'center', maxWidth: '340px' }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto 20px',
          background: 'linear-gradient(135deg, var(--neon-pink) 0%, var(--accent) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 40px rgba(244,114,182,0.3)',
        }}>
          <MessageSquare size={36} color="white" />
        </div>
        <h2 className="font-display" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
          Direct Messages
        </h2>
        <p style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.6, marginBottom: '16px' }}>
          Your private conversations will appear here after you're matched and decide to keep talking.
        </p>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '6px 14px', borderRadius: '20px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border)',
          fontSize: '12px', color: 'var(--text-3)',
        }}>
          <Lock size={11} /> End-to-end encrypted
        </div>
      </div>
    </div>
  );
}
