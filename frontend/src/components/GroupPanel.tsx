import { useState, useRef, useEffect } from 'react';

const EMPTY_MESSAGES: import('../store/chatStore').ChatMessage[] = [];
import { Users, Send, Hash, Zap } from 'lucide-react';
import { useWebSocket } from '../lib/useWebSocket';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';

const GROUP_ROOM = 'global-lounge';

export function GroupPanel() {
  const { sendMessage } = useWebSocket();
  const user = useAuthStore((s) => s.user);
  const messages = useChatStore((s) => s.messages[GROUP_ROOM] ?? EMPTY_MESSAGES);
  const wsStatus = useChatStore((s) => s.wsStatus);
  const [text, setText] = useState('');
  const [joined, setJoined] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleJoin = () => {
    sendMessage('chat.join', { room_id: GROUP_ROOM });
    setJoined(true);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !joined) return;
    sendMessage('chat.message', { room_id: GROUP_ROOM, body: text.trim() });
    setText('');
  };

  if (!joined) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px',
        background: `radial-gradient(ellipse 60% 60% at 50% 40%, rgba(34,211,238,0.06) 0%, transparent 70%)`,
      }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{
            width: '96px', height: '96px', borderRadius: '50%', margin: '0 auto 24px',
            background: 'linear-gradient(135deg, #22d3ee 0%, #6c63ff 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 48px rgba(34,211,238,0.3)',
          }}>
            <Users size={42} color="white" />
          </div>
          <h2 className="font-display" style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-1)', marginBottom: '10px', letterSpacing: '-0.5px' }}>
            Global Lounge
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.6, marginBottom: '28px' }}>
            A live public room where everyone's welcome. Jump in, say hi.
          </p>
          <button
            onClick={handleJoin}
            disabled={wsStatus !== 'connected'}
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '15px' }}
          >
            <Zap size={18} fill="white" /> Join the Room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-base)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0 20px', height: '52px', flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <Hash size={16} color="var(--accent)" />
        <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-1)' }}>global-lounge</span>
        <span className="dot dot-green" style={{ marginLeft: '4px' }} />
        <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>live</span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--text-3)', fontSize: '14px' }}>Be the first to say something 👋</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.sender_id === user?.id;
          const prev = messages[i - 1];
          const isFirst = !prev || prev.sender_id !== msg.sender_id;
          return (
            <div key={msg.message_id} className="anim-msg" style={{
              display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row',
              alignItems: 'flex-end', gap: '8px', marginTop: isFirst ? '10px' : '2px',
            }}>
              {!isMe && (
                <div style={{ width: '28px', flexShrink: 0 }}>
                  {isFirst && (
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      background: 'var(--grad-accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', fontWeight: 700, color: 'white',
                    }}>
                      {msg.sender_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              )}
              <div style={{ maxWidth: '65%' }}>
                {!isMe && isFirst && (
                  <p style={{ margin: '0 0 3px 4px', fontSize: '11px', fontWeight: 700, color: 'var(--accent)' }}>
                    {msg.sender_name}
                  </p>
                )}
                <div style={{
                  padding: '8px 12px',
                  borderRadius: isMe ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                  background: isMe ? 'var(--grad-accent)' : 'var(--bg-elevated)',
                  color: 'var(--text-1)', fontSize: '14px', lineHeight: 1.4,
                  border: isMe ? 'none' : '1px solid var(--border)',
                  wordBreak: 'break-word',
                }}>
                  {msg.body}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', background: 'var(--bg-surface)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <form onSubmit={handleSend} style={{ display: 'flex', gap: '8px' }}>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Say something to the room…"
            className="input"
            maxLength={2000}
          />
          <button
            type="submit"
            disabled={!text.trim()}
            style={{
              width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
              border: 'none', cursor: text.trim() ? 'pointer' : 'not-allowed',
              background: text.trim() ? 'var(--grad-accent)' : 'var(--bg-elevated)',
              color: text.trim() ? 'white' : 'var(--text-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
