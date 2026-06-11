import { useState, useEffect } from 'react';
import { useWebSocket } from '../lib/useWebSocket';
import { useChatStore } from '../store/chatStore';
import { useUIStore } from '../store/uiStore';
import { MessageSquare, Video, Zap, X } from 'lucide-react';

type MatchMode = 'chat' | 'video';

export function MatchPanel({ mode }: { mode: MatchMode }) {
  const { sendMessage } = useWebSocket();
  const { addNotification } = useUIStore();
  const wsStatus = useChatStore((s) => s.wsStatus);
  const matchStatus = useChatStore((s) => s.matchStatus);
  const recentMatches = useChatStore((s) => s.recentMatches);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (matchStatus !== 'waiting') { setElapsed(0); return; }
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [matchStatus]);

  useEffect(() => {
    if (matchStatus === 'matched') {
      addNotification({ type: 'match', title: 'Match found!', body: 'Someone is ready to chat with you.' });
    }
  }, [matchStatus, addNotification]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const Icon = mode === 'video' ? Video : MessageSquare;
  const grad = mode === 'video'
    ? 'linear-gradient(135deg, #f472b6 0%, #fb923c 100%)'
    : 'linear-gradient(135deg, #6c63ff 0%, #a78bfa 100%)';
  const glow = mode === 'video' ? 'rgba(244,114,182,0.35)' : 'rgba(108,99,255,0.35)';

  const isWaiting = matchStatus === 'waiting';

  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px',
      background: `radial-gradient(ellipse 60% 60% at 50% 40%, ${mode === 'video' ? 'rgba(244,114,182,0.06)' : 'rgba(108,99,255,0.06)'} 0%, transparent 70%)`,
    }}>
      <div style={{ width: '100%', maxWidth: '440px', textAlign: 'center' }}>
        {/* Animated icon */}
        <div style={{ position: 'relative', display: 'inline-flex', marginBottom: '36px' }}>
          {isWaiting && [0, 1, 2].map(i => (
            <div key={i} style={{
              position: 'absolute',
              inset: `${-(i + 1) * 16}px`,
              borderRadius: '50%',
              border: `1.5px solid ${mode === 'video' ? '#f472b6' : '#6c63ff'}`,
              opacity: 0,
              animation: `ripple 2s ease ${i * 0.5}s infinite`,
            }} />
          ))}
          <div style={{
            width: '100px', height: '100px', borderRadius: '50%',
            background: isWaiting ? grad : 'var(--bg-elevated)',
            border: `2px solid ${isWaiting ? 'transparent' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: isWaiting ? `0 0 40px ${glow}` : 'none',
            transition: 'all 0.4s',
          }}>
            <Icon size={42} color={isWaiting ? 'white' : 'var(--text-3)'} />
          </div>
        </div>

        <h2 className="font-display" style={{ fontSize: '30px', fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-1px', marginBottom: '10px' }}>
          {isWaiting ? 'Searching…' : mode === 'video' ? 'Video Chat' : 'Text Chat'}
        </h2>
        <p style={{ color: 'var(--text-2)', fontSize: '15px', marginBottom: '36px', lineHeight: 1.5 }}>
          {isWaiting
            ? `Looking for someone real · ${fmt(elapsed)}`
            : mode === 'video'
            ? 'Go face-to-face with a stranger. Instant, real, unfiltered.'
            : 'Get matched with a random stranger for a 1-on-1 conversation.'
          }
        </p>

        {isWaiting ? (
          <button
            onClick={() => sendMessage('match.cancel', {})}
            className="btn btn-ghost"
            style={{ width: '100%', padding: '14px', fontSize: '15px', gap: '8px' }}
          >
            <X size={18} /> Cancel Search
          </button>
        ) : (
          <button
            onClick={() => sendMessage('match.find', { target_gender: 'any', mode })}
            disabled={wsStatus !== 'connected'}
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '15px', gap: '8px' }}
          >
            <Zap size={18} fill="white" />
            {wsStatus !== 'connected' ? 'Connecting…' : 'Find a Match'}
          </button>
        )}

        {wsStatus !== 'connected' && (
          <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-3)' }}>
            Waiting for server connection…
          </p>
        )}

        {recentMatches.length > 0 && !isWaiting && (
          <div style={{ marginTop: '48px', textAlign: 'left', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
            <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 700, letterSpacing: '1px', marginBottom: '16px' }}>
              Recent Matches (Session)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
              {recentMatches.map(match => (
                <div key={match.peer_id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg-elevated)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--accent), #7289da)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: 700, color: 'white', flexShrink: 0
                  }}>
                    {(match.display_name || match.username).charAt(0).toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {match.display_name || match.username}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                      Matched at {new Date(match.matched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
