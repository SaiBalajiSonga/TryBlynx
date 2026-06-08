import { useState, useEffect } from 'react';
import { useChatStore } from '../store/chatStore';
import { useWebSocket } from '../lib/useWebSocket';
import { ChatRoom } from './ChatRoom';
import { Zap, MessageSquare } from 'lucide-react';

export function TextChat() {
  const wsStatus = useChatStore((s) => s.wsStatus);
  const matchStatus = useChatStore((s) => s.matchStatus);
  const targetGender = useChatStore((s) => s.targetGender);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const { sendMessage } = useWebSocket();
  const [matchElapsed, setMatchElapsed] = useState(0);

  useEffect(() => {
    if (matchStatus !== 'waiting') { setMatchElapsed(0); return; }
    const t = setInterval(() => setMatchElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [matchStatus]);

  if (matchStatus === 'matched' && activeRoomId) {
    return <ChatRoom onLeave={() => sendMessage('room.leave', {})} />;
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px',
      background: 'var(--blynx-900)',
      backgroundImage: 'radial-gradient(ellipse at center, rgba(88,101,242,0.06) 0%, transparent 70%)',
    }}>
      <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
        <div style={{ position: 'relative', display: 'inline-flex', marginBottom: '32px' }}>
          {matchStatus === 'waiting' && (
            <>
              <div style={{
                position: 'absolute', inset: '-16px', borderRadius: '50%',
                border: '2px solid var(--accent)', animation: 'pulse-ring 1.5s ease-out infinite',
              }} />
              <div style={{
                position: 'absolute', inset: '-8px', borderRadius: '50%',
                border: '2px solid var(--accent)', animation: 'pulse-ring 1.5s ease-out 0.4s infinite',
              }} />
            </>
          )}
          <div style={{
            width: '96px', height: '96px', borderRadius: '50%',
            background: matchStatus === 'waiting' ? 'rgba(88,101,242,0.15)' : 'var(--blynx-700)',
            border: `2px solid ${matchStatus === 'waiting' ? 'var(--accent)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.3s',
          }}>
            <MessageSquare size={40} color={matchStatus === 'waiting' ? 'var(--accent)' : 'var(--text-muted)'} />
          </div>
        </div>

        <h2 style={{ margin: '0 0 10px', fontSize: '26px', fontWeight: 700, color: 'white' }}>
          {matchStatus === 'waiting' ? 'Finding a match...' : 'Text Chat Matchmaking'}
        </h2>
        <p style={{ margin: '0 0 32px', color: 'var(--text-secondary)', fontSize: '15px' }}>
          {matchStatus === 'waiting'
            ? `Searching${targetGender && targetGender !== 'any' ? ` for ${targetGender}` : ''} · ${fmt(matchElapsed)}`
            : 'Join the pool and meet someone new instantly over text.'}
        </p>

        {matchStatus === 'waiting' ? (
          <button
            onClick={() => sendMessage('match.cancel', {})}
            style={{
              width: '100%', padding: '14px', borderRadius: '10px',
              border: '1px solid var(--border-bright)',
              background: 'var(--blynx-700)', color: 'var(--text-primary)',
              fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'background 0.12s',
            }}
          >
            Cancel Search
          </button>
        ) : (
          <button
            onClick={() => sendMessage('match.find', { target_gender: 'any' })}
            disabled={wsStatus !== 'connected'}
            className="btn-accent"
            style={{
              width: '100%', padding: '14px', fontSize: '15px',
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
