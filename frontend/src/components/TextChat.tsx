import { useState, useEffect } from 'react';
import { useChatStore } from '../store/chatStore';
import { useWebSocket } from '../lib/useWebSocket';
import { ChatRoom } from './ChatRoom';
import { MatchHistorySidebar } from './MatchHistorySidebar';
import { Zap, MessageSquare, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export function TextChat() {
  const wsStatus = useChatStore((s) => s.wsStatus);
  const matchStatus = useChatStore((s) => s.matchStatus);
  const targetGender = useChatStore((s) => s.targetGender);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const { sendMessage } = useWebSocket();
  const [matchElapsed, setMatchElapsed] = useState(0);

  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [interests, setInterests] = useState<string[]>(user?.interests || []);
  const [strictInterests, setStrictInterests] = useState(false);
  const [newInterest, setNewInterest] = useState('');

  const addInterest = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newInterest.trim()) {
      const tag = newInterest.trim().toLowerCase();
      if (!interests.includes(tag)) {
        setInterests([...interests, tag]);
      }
      setNewInterest('');
    }
  };

  const removeInterest = (tag: string) => {
    setInterests(interests.filter(t => t !== tag));
  };

  useEffect(() => {
    if (matchStatus !== 'waiting') { setMatchElapsed(0); return; }
    const t = setInterval(() => setMatchElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [matchStatus]);

  // Clean up when leaving the Text Chat page
  useEffect(() => {
    return () => {
      const chat = useChatStore.getState();
      
      if (chat.activeRoomId) {
        if (chat.matchPeerId) {
          sendMessage('match.leave', { peer_id: chat.matchPeerId, room_id: chat.activeRoomId });
        } else {
          sendMessage('chat.leave', { room_id: chat.activeRoomId });
        }
        chat.clearMatchChat();
      }
      
      if (chat.matchStatus === 'waiting') {
        sendMessage('match.cancel', {});
        chat.setMatchStatus('idle');
      }
    };
  }, [sendMessage]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
      <MatchHistorySidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {matchStatus === 'matched' && activeRoomId ? (
          <ChatRoom onLeave={() => {
            const chat = useChatStore.getState();
            if (chat.matchPeerId) {
              sendMessage('match.leave', { peer_id: chat.matchPeerId, room_id: chat.activeRoomId });
            } else {
              sendMessage('chat.leave', { room_id: chat.activeRoomId });
            }
            chat.clearMatchChat();
          }} />
        ) : (
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

              {matchStatus !== 'waiting' && (
                <div style={{ marginBottom: '24px', textAlign: 'left' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    What are you interested in? (optional)
                  </label>
                  <input
                    type="text"
                    value={newInterest}
                    onChange={(e) => setNewInterest(e.target.value)}
                    onKeyDown={addInterest}
                    placeholder="Type an interest and press Enter"
                    style={{
                      width: '100%', padding: '12px 16px', borderRadius: '8px',
                      background: 'var(--blynx-800)', border: '1px solid var(--border)',
                      color: 'white', outline: 'none', marginBottom: '12px'
                    }}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                    {interests.map(tag => (
                      <span key={tag} style={{
                        background: 'rgba(88,101,242,0.15)', color: 'var(--accent)',
                        padding: '6px 12px', borderRadius: '16px', fontSize: '13px',
                        display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 500
                      }}>
                        #{tag}
                        <X size={14} style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => removeInterest(tag)} />
                      </span>
                    ))}
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={strictInterests}
                      onChange={(e) => setStrictInterests(e.target.checked)}
                      style={{
                        width: '18px', height: '18px', accentColor: 'var(--accent)',
                        cursor: 'pointer'
                      }}
                    />
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      Wait for exact interest match
                    </span>
                  </label>
                </div>
              )}

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
                  onClick={() => {
                    updateUser({ interests });
                    sendMessage('match.find', { 
                      target_gender: 'any',
                      strict_interests: strictInterests,
                      interests: interests
                    });
                  }}
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
        )}
      </div>
    </div>
  );
}
