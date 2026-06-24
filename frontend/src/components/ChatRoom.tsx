import React, { useState, useRef, useEffect } from 'react';

import { Send, Video, PhoneOff, Hash, MoreHorizontal, FastForward } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useWebSocket } from '../lib/useWebSocket';
import { useWebRTCStore } from '../store/webrtcStore';
import { api } from '../lib/api';

const EMPTY_MESSAGES: import('../store/chatStore').ChatMessage[] = [];

export function ChatRoom({ onLeave }: { onLeave?: () => void }) {
  const [message, setMessage] = useState('');
  const [peerProfile, setPeerProfile] = useState<{ display_name?: string, username: string, avatar_url?: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const user = useAuthStore((s) => s.user);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const messages = useChatStore((s) => (activeRoomId ? s.messages[activeRoomId] : undefined) ?? EMPTY_MESSAGES);
  const isPeerDisconnected = useChatStore((s) => s.isPeerDisconnected);
  const matchPeerId = useChatStore((s) => s.matchPeerId);
  const targetGender = useChatStore((s) => s.targetGender);
  const clearChat = useChatStore((s) => s.clearChat);
  const startVideo = useWebRTCStore((s) => s.startVideo);
  const { sendMessage } = useWebSocket();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (matchPeerId) {
      api.getUserProfile(matchPeerId)
        .then(data => {
          setPeerProfile(data);
          useChatStore.getState().addRecentMatch({
            peer_id: matchPeerId,
            username: data.username,
            display_name: data.display_name,
            matched_at: Date.now()
          });
        })
        .catch(err => console.error("Failed to fetch peer profile", err));
    } else {
      setPeerProfile(null);
    }
  }, [matchPeerId]);

  useEffect(() => {
    if (!isPeerDisconnected) {
      inputRef.current?.focus();
    }
  }, [activeRoomId, isPeerDisconnected]);

  const handleSkip = () => {
    if (matchPeerId) {
      sendMessage('match.leave', { peer_id: matchPeerId, room_id: activeRoomId });
    } else if (activeRoomId) {
      sendMessage('chat.leave', { room_id: activeRoomId });
    }
    useChatStore.getState().clearMatchChat();
    // Re-queue
    sendMessage('match.find', { target_gender: targetGender || 'any', mode: 'chat' });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeRoomId, targetGender]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !activeRoomId) return;
    if (matchPeerId) {
      sendMessage('match.message', { peer_id: matchPeerId, room_id: activeRoomId, body: message.trim() });
    } else {
      sendMessage('chat.message', { room_id: activeRoomId, body: message.trim() });
    }
    setMessage('');
  };

  const handleDisconnect = () => {
    if (matchPeerId) {
      sendMessage('match.leave', { peer_id: matchPeerId, room_id: activeRoomId });
    } else if (activeRoomId) {
      sendMessage('chat.leave', { room_id: activeRoomId });
    }
    clearChat();
    onLeave?.();
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--blynx-900)' }}>
      {/* Header */}
      <div style={{
        padding: '0 20px',
        height: '56px',
        borderBottom: 'none',
        background: 'var(--blynx-850)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {peerProfile ? (
            <>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent), #7289da)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 700, color: 'white',
              }}>
                {peerProfile.avatar_url ? (
                  <img src={peerProfile.avatar_url} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  (peerProfile.display_name || peerProfile.username).charAt(0).toUpperCase()
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'white', lineHeight: '1.2' }}>{peerProfile.display_name || peerProfile.username}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>@{peerProfile.username}</span>
              </div>
            </>
          ) : (
            <>
              <Hash size={18} color="var(--text-muted)" />
              <span style={{ fontWeight: 600, fontSize: '15px', color: 'white' }}>Live Match</span>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '10px' }}>
            <span className={`status-dot ${isPeerDisconnected ? 'offline' : 'connected'}`} style={{ width: '6px', height: '6px' }} />
            <span style={{ fontSize: '12px', color: isPeerDisconnected ? 'var(--text-muted)' : 'var(--teal)' }}>
              {isPeerDisconnected ? 'Disconnected' : 'Connected'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {matchPeerId && (
            <button
              onClick={() => {
                // Determine initiator deterministically by comparing UUIDs (same logic as VideoChat.tsx)
                // so only one side ever sends the offer
                const isInitiatorSide = (user?.id ?? '') < matchPeerId;
                startVideo(matchPeerId, isInitiatorSide);
              }}
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
            onClick={handleSkip}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: 'var(--accent)',
              color: 'white',
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '13px', fontWeight: 600,
              fontFamily: 'inherit',
              transition: 'background 0.12s',
            }}
            title="Skip to next person (Esc)"
          >
            <FastForward size={15} />
            Skip
          </button>
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
          const nextMsg = messages[i + 1];
          const isGroupStart = !prevMsg || prevMsg.sender_id !== msg.sender_id;
          const isGroupEnd = !nextMsg || nextMsg.sender_id !== msg.sender_id;
          const isSolo = isGroupStart && isGroupEnd;

          const r = '22px';
          const s = '4px';
          let borderRadius: string;
          if (isMe) {
            if (isSolo)             borderRadius = `${r} ${r} ${r} ${r}`;
            else if (isGroupStart)  borderRadius = `${r} ${r} ${s} ${r}`;
            else if (isGroupEnd)    borderRadius = `${r} ${s} ${r} ${r}`;
            else                    borderRadius = `${r} ${s} ${s} ${r}`;
          } else {
            if (isSolo)             borderRadius = `${r} ${r} ${r} ${r}`;
            else if (isGroupStart)  borderRadius = `${r} ${r} ${r} ${s}`;
            else if (isGroupEnd)    borderRadius = `${s} ${r} ${r} ${r}`;
            else                    borderRadius = `${s} ${r} ${r} ${s}`;
          }

          const marginTop = isGroupStart ? '12px' : '2px';

          return (
            <div
              key={msg.message_id}
              className="msg-bubble"
              style={{
                display: 'flex',
                flexDirection: isMe ? 'row-reverse' : 'row',
                alignItems: 'flex-end',
                gap: '8px',
                marginTop: marginTop,
              }}
            >
              {!isMe && (
                <div style={{ width: '32px', flexShrink: 0, marginBottom: isGroupEnd ? '20px' : '0' }}>
                  {isGroupEnd && (
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--accent), #7289da)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '13px', fontWeight: 700, color: 'white',
                    }}>
                      {peerProfile && peerProfile.avatar_url ? (
                        <img src={peerProfile.avatar_url} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        peerProfile ? (peerProfile.display_name || peerProfile.username).charAt(0).toUpperCase() : msg.sender_name.charAt(0).toUpperCase()
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={{ maxWidth: '70%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  padding: '8px 14px',
                  borderRadius,
                  background: isMe
                    ? 'linear-gradient(135deg, var(--accent) 0%, #7289da 100%)'
                    : 'var(--blynx-750)',
                  color: 'white',
                  fontSize: '15px',
                  lineHeight: '1.4',
                  wordBreak: 'break-word',
                  border: 'none',
                  boxShadow: isMe ? '0 2px 8px rgba(88,101,242,0.25)' : 'none',
                }}>
                  {msg.body}
                </div>
                {isGroupEnd && (
                  <span style={{
                    fontSize: '11px', color: 'var(--text-muted)', opacity: 0.8,
                    marginTop: '4px',
                    marginLeft: isMe ? '0' : '6px',
                    marginRight: isMe ? '6px' : '0',
                  }}>
                    {new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
        {isPeerDisconnected && (
          <div style={{ textAlign: 'center', margin: '20px 0' }}>
            <span style={{
              background: 'rgba(237,66,69,0.1)',
              color: '#ed4245',
              padding: '6px 12px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 600,
            }}>
              Stranger has disconnected
            </span>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: '0 16px 16px',
        background: 'transparent',
        flexShrink: 0,
      }}>
        {isPeerDisconnected ? (
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleDisconnect}
              style={{
                flex: 1, padding: '12px', borderRadius: '14px', border: 'none',
                background: 'var(--blynx-700)', color: 'white',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              Return to Menu
            </button>
            <button
              onClick={handleSkip}
              className="btn-accent"
              style={{
                flex: 1, padding: '12px', borderRadius: '14px', border: 'none',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
            >
              <FastForward size={16} />
              Find New Match
            </button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="chat-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Send a message…"
              maxLength={5000}
            />
            <button
              type="submit"
              disabled={!message.trim()}
              style={{
                width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0, border: 'none',
                cursor: message.trim() ? 'pointer' : 'not-allowed',
                background: message.trim() ? 'var(--accent)' : 'transparent',
                color: message.trim() ? 'white' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.12s, transform 0.1s',
              }}
            >
              <Send size={16} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
