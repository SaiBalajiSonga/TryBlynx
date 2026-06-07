import React, { useState, useRef, useEffect } from 'react';
import { Send, Video, PhoneOff, Hash, MoreHorizontal } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useWebSocket } from '../lib/useWebSocket';
import { useWebRTCStore } from '../store/webrtcStore';

export function ChatRoom() {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const user = useAuthStore((s) => s.user);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const messages = useChatStore((s) => activeRoomId ? s.messages[activeRoomId] || [] : []);
  const matchPeerId = useChatStore((s) => s.matchPeerId);
  const clearChat = useChatStore((s) => s.clearChat);
  const startVideo = useWebRTCStore((s) => s.startVideo);
  const { sendMessage } = useWebSocket();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeRoomId]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !activeRoomId) return;
    sendMessage('chat.message', { room_id: activeRoomId, body: message.trim() });
    setMessage('');
  };

  const handleDisconnect = () => {
    if (activeRoomId) sendMessage('chat.leave', { room_id: activeRoomId });
    clearChat();
  };

  if (!activeRoomId) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--blynx-900)' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '16px', height: '16px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%' }} className="animate-spin-slow" />
          Joining chat room…
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--blynx-900)' }}>
      {/* Header */}
      <div style={{
        padding: '0 20px',
        height: '56px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--blynx-850)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Hash size={18} color="var(--text-muted)" />
          <span style={{ fontWeight: 600, fontSize: '15px', color: 'white' }}>Live Match</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span className="status-dot connected" style={{ width: '6px', height: '6px' }} />
            <span style={{ fontSize: '12px', color: 'var(--teal)' }}>Connected</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {matchPeerId && (
            <button
              onClick={() => startVideo(matchPeerId, true)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: 'rgba(88,101,242,0.15)',
                color: 'var(--accent)',
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '13px', fontWeight: 600,
                fontFamily: 'inherit',
                transition: 'background 0.12s',
              }}
              title="Start Video Call"
            >
              <Video size={15} />
              Video
            </button>
          )}
          <button
            onClick={handleDisconnect}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: 'rgba(237,66,69,0.12)',
              color: '#ed4245',
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '13px', fontWeight: 600,
              fontFamily: 'inherit',
              transition: 'background 0.12s',
            }}
          >
            <PhoneOff size={15} />
            Leave
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '48px', height: '48px',
                borderRadius: '50%',
                background: 'var(--blynx-700)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
              }}>
                <MoreHorizontal size={20} color="var(--text-muted)" />
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
                Say hello! 👋
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isMe = msg.sender_id === user?.id;
          const prevMsg = messages[i - 1];
          const isFirst = !prevMsg || prevMsg.sender_id !== msg.sender_id;

          return (
            <div
              key={msg.message_id}
              className="msg-bubble"
              style={{
                display: 'flex',
                flexDirection: isMe ? 'row-reverse' : 'row',
                alignItems: 'flex-end',
                gap: '8px',
                marginTop: isFirst ? '12px' : '2px',
              }}
            >
              {/* Avatar — only show for first in group */}
              {!isMe && (
                <div style={{ width: '32px', flexShrink: 0 }}>
                  {isFirst && (
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--accent), #7289da)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '13px', fontWeight: 700, color: 'white',
                    }}>
                      {msg.sender_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              )}

              <div style={{ maxWidth: '70%' }}>
                {!isMe && isFirst && (
                  <p style={{ margin: '0 0 4px 4px', fontSize: '12px', fontWeight: 600, color: 'var(--accent)' }}>
                    {msg.sender_name}
                  </p>
                )}
                <div style={{
                  padding: '9px 13px',
                  borderRadius: isMe
                    ? '16px 16px 4px 16px'
                    : '16px 16px 16px 4px',
                  background: isMe ? 'var(--accent)' : 'var(--blynx-700)',
                  color: 'white',
                  fontSize: '14px',
                  lineHeight: '1.45',
                  wordBreak: 'break-word',
                  border: isMe ? 'none' : '1px solid var(--border)',
                }}>
                  {msg.body}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 16px',
        background: 'var(--blynx-850)',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <form onSubmit={handleSend} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              ref={inputRef}
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Send a message…"
              className="input-field"
              style={{ paddingRight: '12px' }}
              maxLength={5000}
            />
          </div>
          <button
            type="submit"
            disabled={!message.trim()}
            style={{
              width: '40px', height: '40px',
              borderRadius: '8px',
              border: 'none',
              cursor: message.trim() ? 'pointer' : 'not-allowed',
              background: message.trim() ? 'var(--accent)' : 'var(--blynx-600)',
              color: message.trim() ? 'white' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.12s, transform 0.1s',
              flexShrink: 0,
            }}
          >
            <Send size={17} />
          </button>
        </form>
      </div>
    </div>
  );
}
