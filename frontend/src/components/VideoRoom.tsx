import { useEffect, useState, useRef } from 'react';
import { useWebRTC } from '../lib/useWebRTC';
import { useWebRTCStore } from '../store/webrtcStore';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { getSendMessage } from '../lib/useWebSocket';
import { api } from '../lib/api';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  AlertCircle, Wifi, Send, MessageSquare, X,
  UserPlus, Check,
} from 'lucide-react';
import { startVideoModeration, reportAIStrike } from '../lib/videoModeration';

const EMPTY_MESSAGES: import('../store/chatStore').ChatMessage[] = [];

export function VideoRoom({ peerId, isInitiator }: { peerId: string; isInitiator: boolean }) {
  const { endVideo } = useWebRTCStore();
  const {
    localVideoRef, remoteVideoRef,
    isMuted, isVideoOff, error, connectionState,
    toggleMute, toggleVideo,
  } = useWebRTC(peerId, isInitiator);

  const [chatVisible, setChatVisible] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [peerProfile, setPeerProfile] = useState<any>(null);
  const [friendState, setFriendState] = useState<'idle'|'sent'|'loading'>('idle');
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const user = useAuthStore(s => s.user);
  const activeRoomId = useChatStore(s => s.activeRoomId);
  const messages = useChatStore(s => (activeRoomId ? s.messages[activeRoomId] : undefined) ?? EMPTY_MESSAGES);

  // Fetch peer profile for display
  useEffect(() => {
    if (!peerId) return;
    api.getUserProfile(peerId)
      .then(data => {
        setPeerProfile(data);
        useChatStore.getState().addRecentMatch?.({
          peer_id: peerId,
          username: data.username,
          display_name: data.display_name,
          matched_at: Date.now(),
        });
      })
      .catch(() => {});
  }, [peerId]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (chatVisible) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatVisible]);

  // AI moderation
  useEffect(() => {
    if (isVideoOff) return;
    const videoEl = localVideoRef.current;
    if (!videoEl) return;
    const cleanup = startVideoModeration(videoEl, () => {
      reportAIStrike();
      endVideo();
    });
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideoOff]);

  // Auto-hide controls after 3s of no mouse movement
  const resetControlsTimer = () => {
    setControlsVisible(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setControlsVisible(false), 3000);
  };
  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeRoomId) return;
    getSendMessage()?.('chat.message', { room_id: activeRoomId, body: chatInput.trim() });
    setChatInput('');
  };

  const handleAddFriend = async () => {
    setFriendState('loading');
    try {
      await api.sendFriendRequest(peerId);
      setFriendState('sent');
    } catch { setFriendState('idle'); }
  };

  const stateColor = ({ connected:'#4ade80', connecting:'#fbbf24', new:'#fbbf24', disconnected:'#f87171', failed:'#f87171', closed:'#f87171' } as any)[connectionState] ?? '#96989d';
  const peerName = peerProfile?.display_name || peerProfile?.username || 'Stranger';

  if (error) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,11,15,0.95)', backdropFilter: 'blur(12px)' }}>
        <div style={{ background: 'var(--blynx-800)', border: '1px solid var(--border)', borderRadius: '20px', padding: '40px', textAlign: 'center', maxWidth: '380px', width: '100%' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(237,66,69,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <AlertCircle size={32} color="#ed4245" />
          </div>
          <h3 style={{ margin: '0 0 10px', color: 'white', fontSize: '18px', fontWeight: 700 }}>Camera Access Denied</h3>
          <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5 }}>{error}</p>
          <button onClick={endVideo} className="btn-accent" style={{ width: '100%', padding: '12px' }}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 100, background: '#000', overflow: 'hidden' }}
      onMouseMove={resetControlsTimer}
    >
      {/* ── Remote video (full screen) ── */}
      <video
        ref={remoteVideoRef}
        autoPlay playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* Connecting overlay */}
      {connectionState !== 'connected' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', gap: '12px' }}>
          <div style={{ width: '56px', height: '56px', border: '3px solid rgba(255,255,255,0.15)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: 'white', fontSize: '15px', fontWeight: 500 }}>
            {connectionState === 'new' ? 'Connecting…' : connectionState === 'connecting' ? 'Establishing connection…' : 'Reconnecting…'}
          </p>
        </div>
      )}

      {/* ── Top bar (fades with controls) ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        padding: '16px 20px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        opacity: controlsVisible ? 1 : 0,
        transition: 'opacity 0.3s',
        pointerEvents: controlsVisible ? 'auto' : 'none',
      }}>
        {/* Peer info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'white', fontSize: '15px', overflow: 'hidden' }}>
            {peerProfile?.avatar_url ? <img src={peerProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : peerName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: 'white' }}>{peerName}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: stateColor }} />
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', textTransform: 'capitalize' }}>{connectionState}</span>
            </div>
          </div>
        </div>

        {/* Top actions */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <TopBtn
            onClick={() => setChatVisible(v => !v)}
            active={chatVisible}
            icon={chatVisible ? X : MessageSquare}
            label={chatVisible ? 'Close chat' : 'Open chat'}
            badge={!chatVisible && messages.length > 0 ? messages.length : 0}
          />
          <TopBtn
            onClick={handleAddFriend}
            disabled={friendState !== 'idle'}
            icon={friendState === 'sent' ? Check : UserPlus}
            label={friendState === 'sent' ? 'Friend request sent' : 'Add friend'}
            green={friendState === 'sent'}
          />
        </div>
      </div>

      {/* ── Local PIP video ── */}
      <div style={{
        position: 'absolute', bottom: '100px', right: '16px', zIndex: 10,
        width: '160px', aspectRatio: '4/3',
        borderRadius: '12px', overflow: 'hidden',
        border: '2px solid rgba(255,255,255,0.2)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        background: '#111',
        transition: 'transform 0.2s',
      }}>
        <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {isVideoOff && (
          <div style={{ position: 'absolute', inset: 0, background: 'var(--blynx-800)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <VideoOff size={24} color="var(--text-muted)" />
          </div>
        )}
        <div style={{ position: 'absolute', bottom: '5px', left: '7px', fontSize: '10px', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>You</div>
        {isMuted && (
          <div style={{ position: 'absolute', top: '5px', right: '5px', width: '18px', height: '18px', borderRadius: '50%', background: '#ed4245', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MicOff size={10} color="white" />
          </div>
        )}
      </div>

      {/* ── In-call chat panel ── */}
      {chatVisible && (
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 11,
          width: '300px',
          background: 'rgba(13,14,18,0.92)',
          backdropFilter: 'blur(16px)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', flexDirection: 'column',
          animation: 'slideInRight 0.2s ease',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '14px', color: 'white' }}>In-call chat</span>
            <button onClick={() => setChatVisible(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', padding: '2px' }}><X size={16} /></button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {messages.length === 0 && (
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', textAlign: 'center', marginTop: '24px' }}>Say something!</p>
            )}
            {messages.map((msg) => {
              const isMe = msg.sender_id === user?.id;
              return (
                <div key={msg.message_id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', gap: '6px' }}>
                  <div style={{
                    padding: '7px 12px', borderRadius: '14px', maxWidth: '80%',
                    background: isMe ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                    color: 'white', fontSize: '13px', lineHeight: 1.4,
                    wordBreak: 'break-word',
                  }}>
                    {msg.body}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendChat} style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '8px' }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Send a message…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 12px', color: 'white', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }}
            />
            <button type="submit" disabled={!chatInput.trim()} style={{ width: '34px', height: '34px', borderRadius: '8px', border: 'none', cursor: chatInput.trim() ? 'pointer' : 'not-allowed', background: chatInput.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.05)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Send size={14} />
            </button>
          </form>
        </div>
      )}

      {/* ── Bottom controls ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: chatVisible ? '300px' : 0, zIndex: 10,
        padding: '20px 24px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '12px',
        opacity: controlsVisible ? 1 : 0,
        transition: 'opacity 0.3s, right 0.2s',
        pointerEvents: controlsVisible ? 'auto' : 'none',
      }}>
        <ControlBtn onClick={toggleMute} icon={isMuted ? MicOff : Mic} label={isMuted ? 'Unmute' : 'Mute'} danger={isMuted} />
        <button
          onClick={endVideo}
          title="End Call"
          style={{
            width: '56px', height: '56px', borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: '#ed4245', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px rgba(237,66,69,0.5)',
            transition: 'transform 0.1s, box-shadow 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <PhoneOff size={24} />
        </button>
        <ControlBtn onClick={toggleVideo} icon={isVideoOff ? VideoOff : Video} label={isVideoOff ? 'Start Camera' : 'Stop Camera'} danger={isVideoOff} />
      </div>

      {/* Connection quality indicator */}
      <div style={{
        position: 'absolute', bottom: '16px', left: '16px', zIndex: 10,
        display: 'flex', alignItems: 'center', gap: '5px',
        padding: '4px 10px', borderRadius: '20px',
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
        opacity: controlsVisible ? 1 : 0, transition: 'opacity 0.3s',
      }}>
        <Wifi size={12} color={stateColor} />
        <span style={{ fontSize: '11px', color: stateColor, fontWeight: 500, textTransform: 'capitalize' }}>{connectionState}</span>
      </div>
    </div>
  );
}

function ControlBtn({ onClick, icon: Icon, label, danger }: { onClick: () => void; icon: any; label: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: '48px', height: '48px', borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: danger ? 'rgba(237,66,69,0.25)' : 'rgba(255,255,255,0.15)',
        color: danger ? '#ed4245' : 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(8px)',
        transition: 'background 0.15s, transform 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(237,66,69,0.4)' : 'rgba(255,255,255,0.25)'}
      onMouseLeave={e => e.currentTarget.style.background = danger ? 'rgba(237,66,69,0.25)' : 'rgba(255,255,255,0.15)'}
    >
      <Icon size={20} />
    </button>
  );
}

function TopBtn({ onClick, icon: Icon, label, active, badge, disabled, green }: { onClick: () => void; icon: any; label: string; active?: boolean; badge?: number; disabled?: boolean; green?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      disabled={disabled}
      style={{
        position: 'relative', width: '36px', height: '36px', borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.15)', cursor: disabled ? 'default' : 'pointer',
        background: active ? 'rgba(88,101,242,0.3)' : green ? 'rgba(74,222,128,0.2)' : 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(8px)',
        color: active ? 'var(--accent)' : green ? '#4ade80' : 'rgba(255,255,255,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s',
      }}
    >
      <Icon size={16} />
      {!!badge && (
        <span style={{ position: 'absolute', top: '-4px', right: '-4px', minWidth: '16px', height: '16px', borderRadius: '8px', background: '#f472b6', color: 'white', fontSize: '9px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '2px solid #000' }}>
          {badge}
        </span>
      )}
    </button>
  );
}

import React from 'react';
